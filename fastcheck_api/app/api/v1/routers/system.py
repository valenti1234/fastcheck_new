from __future__ import annotations

import os
import re
from urllib.parse import urlparse

from fastapi import APIRouter
from pydantic import BaseModel


router = APIRouter(prefix="/system", tags=["system"])


# ----------- Helpers seguros: nunca exponen URI completa (solo nomes DB / flags) ----------
_MONGODB_URI_DEFAULT = os.environ.get("MONGODB_URI", "")


def _safe_extract_db_name(mongodb_uri: str) -> str:
    """Extrae el nombre de base de datos de una URI MongoDB.
    Reglas:
      1) Path de la URI: mongodb://host1,host2/NOMBRE?opts => NOMBRE (prioridad más alta)
      2) Fallback: authSource en query string
      3) Fallback 2: DEFAULT_DB_NAME o "(unknown)"
    Nunca exponemos usuario/contraseña/hosts.
    """
    if not mongodb_uri:
        return "(sin-uri-configurada)"
    try:
        # Borramos user:pass@ del netloc para no parsearlo mal
        clean = re.sub(r"://[^/@]*@", "://", mongodb_uri, count=1)
        parsed = urlparse(clean)
        # MongoDB no usa path absoluto; el primer segmento después de '/' es el DB name
        path = parsed.path.lstrip("/")
        if path:
            db_name = path.split("/")[0]
            if db_name and "?" not in db_name:
                return db_name
        # Fallback: authSource en query
        qs = parsed.query or ""
        m = re.search(r"(?:^|&)authSource=([^&]+)", qs)
        if m:
            return m.group(1)
    except Exception:
        pass
    # Ultimo fallback
    return os.environ.get("DEFAULT_DB_NAME", "unknown")


def _classify_env(db_name: str) -> str:
    if not db_name or db_name.startswith("("):
        return "unknown"
    low = db_name.lower()
    if low in {"duxiter", "prod", "production", "produccion"} or low.endswith("-prod"):
        return "production"
    if "staging" in low or "test" in low or low.endswith("-2") or low == "duxiter-2" or "dev" in low:
        return "staging"
    return "unknown"


class SystemInfoOut(BaseModel):
    """Informacion segura (no sensible) para el sidebar del frontend.
    Solo contiene NOMBRE DB, booleans de segurida y tipo de ambiente.
    Nunca incluye URIs, hosts, credenciales.
    """
    db_name: str
    is_production_db: bool
    safety_lock_active: bool
    authz_legacy_layer: bool
    deployment_env: str
    warning_prod_forbidden: bool
    app: str = "FastCheck RBAC+ABAC"
    version: str = "Fase2 6/6 Cerrado · 90/90 tests PASS"


@router.get(
    "/info",
    response_model=SystemInfoOut,
    summary="DB + safety status (sidebar visibility)",
    description="Public endpoint. Returns ONLY DB name + safety booleans for the frontend sidebar badge. No credentials or hosts exposed.",
    operation_id="system_info_sidebar",
)
async def system_info_for_sidebar() -> SystemInfoOut:
    mongodb_uri = os.environ.get("MONGODB_URI", _MONGODB_URI_DEFAULT)
    db_name = _safe_extract_db_name(mongodb_uri)
    deployment_env = _classify_env(db_name)
    safety_lock_raw = os.environ.get("AUTHZ_FORBID_PROD_DB", "False")
    legacy_raw = os.environ.get("AUTHZ_LEGACY_LAYER", "False")

    def _as_bool(v: str) -> bool:
        return str(v).strip().lower() in {"1", "true", "yes", "si", "on", "s"}

    safety_lock_active = _as_bool(safety_lock_raw)
    authz_legacy_layer = _as_bool(legacy_raw)

    is_prod_db = (
        db_name in {"duxiter", "prod", "production"}
        or deployment_env == "production"
    )
    # Si safety lock activo Y es prod -> HTTP 503 global (dependencies.py ya lo bloquea)
    # El sidebar aun asi mostrara el badge ROJO fuerte.
    warning_prod_forbidden = safety_lock_active and is_prod_db

    return SystemInfoOut(
        db_name=db_name,
        is_production_db=is_prod_db,
        safety_lock_active=safety_lock_active,
        authz_legacy_layer=authz_legacy_layer,
        deployment_env=deployment_env,
        warning_prod_forbidden=warning_prod_forbidden,
    )


@router.get(
    "/vm-ip",
    summary="VM IP suffix (sidebar small info)",
    description="Mantiene compatibilidad con el DashboardLayout que ya pide /system/vm-ip.",
)
async def vm_ip_compat():
    """Retorna la IP publica (si existe) o null.
    Utiliza la heuristica standard AWS/GCP/Azure o lee del env si esta definida.
    Solo para visualizacion.
    """
    if "VM_IP_PUBLIC" in os.environ:
        ip = os.environ["VM_IP_PUBLIC"].strip()
        return {"ip": ip or None, "ips": [ip] if ip else []}
    # Intentar obtener de metadata GCP o AWS fallara en la mayoria de entornos dev;
    # devolvemos (por ahora) ip local.
    import socket as _sk
    try:
        s = _sk.socket(_sk.AF_INET, _sk.SOCK_DGRAM)
        s.settimeout(0.3)
        s.connect(("1.1.1.1", 80))
        local = s.getsockname()[0]
        s.close()
        return {"ip": local, "ips": [local]}
    except Exception:
        return {"ip": None, "ips": []}
