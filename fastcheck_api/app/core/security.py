from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
from typing import Any, Optional

import bcrypt
import jwt
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastcheck_api.app.core.config import settings


class AuthError(Exception):
    pass


_DURATION_RE = re.compile(r"^(?P<count>\d+)(?P<unit>[smhd])$")


def _parse_expires_in(value: str) -> dt.timedelta:
    match = _DURATION_RE.match(value.strip())
    if not match:
        return dt.timedelta(days=7)
    count = int(match.group("count"))
    unit = match.group("unit")
    if unit == "s":
        return dt.timedelta(seconds=count)
    if unit == "m":
        return dt.timedelta(minutes=count)
    if unit == "h":
        return dt.timedelta(hours=count)
    return dt.timedelta(days=count)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def get_password_hash(plain_password: str, *, rounds: int = 12) -> str:
    """Hash bcrypt para contraseñas nuevas / reseteos (Rounds=12 por defecto NIST)."""
    if not isinstance(plain_password, str) or not plain_password:
        raise ValueError("EMPTY_PASSWORD")
    salt = bcrypt.gensalt(rounds=rounds)
    return bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")


def create_access_token(
    *,
    user_id: str,
    email: str,
    role: str,
    tenant_id: str,
    # ----- NUOVI CLAIM AUTHZ V2 (opzionali per backward compat) -----
    roles: Optional[list[str]] = None,
    legacy_role: Optional[str] = None,
    nivel_info_codigo: Optional[str] = None,
    dims_hash: Optional[str] = None,
    pn_authorized: Optional[bool] = None,
    cache_version: Optional[int] = None,
    extra: Optional[dict[str, Any]] = None,
) -> str:
    """
    JWT DOPPIA COMPATIBILITÀ (DA-01 · AUTHZ_LEGACY_LAYER):
    - Claims legacy SEMPRE presenti (id, email, role, tenant) → route guard
      e endpoint legacy funzionano senza modifiche.
    - Claims v2 opzionali (ruoli multipli, dims_hash, nivel_info)
      per il motore autorizar() del authz_service.
    """
    now = dt.datetime.now(dt.timezone.utc)
    exp = now + _parse_expires_in(settings.jwt_expires_in)
    payload: dict[str, Any] = {
        "id": user_id,
        "email": email,
        # ⚠️  CLAIM LEGACY 'role' = 'legacy_role' calcolato (o input originale)
        #     in modo che guardie come RoleProtectedRoute.continue a funzionare
        "role": legacy_role or role,
        "tenant": tenant_id,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    # Se ci sono dati v2 → li appendiamo
    if settings.authz_legacy_layer or roles or dims_hash:
        payload["roles"] = roles or []
        payload["legacy_role"] = legacy_role or role
        if nivel_info_codigo:
            payload["nivel_info"] = nivel_info_codigo
            from fastcheck_api.app.services.authz_service import NIVEL_INFO_ORDEN
            payload["nivel_info_num"] = NIVEL_INFO_ORDEN.get(nivel_info_codigo, 1)
        if dims_hash:
            payload["dims_hash"] = dims_hash
        if pn_authorized is not None:
            payload["pn_authorized"] = bool(pn_authorized)
        if cache_version is not None:
            payload["cache_version"] = int(cache_version)
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict[str, Any]:
    try:
        decoded = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        if not isinstance(decoded, dict):
            raise AuthError("Invalid token payload")
        return decoded
    except jwt.ExpiredSignatureError as e:
        raise AuthError("Token expired") from e
    except jwt.InvalidTokenError as e:
        raise AuthError("Invalid token") from e


# ---------------------------------------------------------------------------
# enrich_from_db(token_payload): Se nel token i dims_hash non corrispondono
# ai dati DB (es. permessi cambiati), rilascia i dati idratati nuovi.
# Usato da dependencies.get_current_user per invalidazione cache.
# ---------------------------------------------------------------------------
async def enrich_from_db(
    db: AsyncIOMotorDatabase,
    token_payload: dict[str, Any],
) -> dict[str, Any]:
    """
    Confronta token_payload.dims_hash con cache_version dal DB.
    Se diversi → ricalcola dimensione idratando dal DB.
    Ritorna dict { needs_refresh, user_fields_nuovi }.
    """
    out: dict[str, Any] = {"needs_refresh": False}
    try:
        uid = ObjectId(str(token_payload.get("id", "")))
    except Exception:
        return out
    stored = await db["users"].find_one(
        {"_id": uid},
        {"cache_version": 1, "authz_v2_migrated": 1, "legacy_role": 1},
    )
    if not stored:
        return out
    t_cache = str(token_payload.get("cache_version") or "")
    d_cache = str(stored.get("cache_version", 1))
    if stored.get("authz_v2_migrated") and t_cache != d_cache:
        out["needs_refresh"] = True
        out["new_cache_version"] = stored.get("cache_version", 1)
        # Idratazione minima: ruoli + nivel_info (chiamata a authz_service
        # verrà fatta a valle nel get_current_user per non duplicare logica)
        roles_cursor = db["usuario_rol"].find({"usuario_id": uid}, {"rol_codigo": 1})
        out["roles"] = sorted([r["rol_codigo"] async for r in roles_cursor])
        ni = await db["usuario_nivel_info"].find_one({"usuario_id": uid})
        if ni:
            out["nivel_info"] = ni.get("nivel_info_codigo")
    return out


# ---------------------------------------------------------------------------
# Helper di hashing stabile per generare dims_hash (usato in login)
# ---------------------------------------------------------------------------
def _stable_hash(obj: Any) -> str:
    raw = json.dumps(obj, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]

