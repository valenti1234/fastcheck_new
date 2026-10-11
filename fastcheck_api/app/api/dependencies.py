from __future__ import annotations

from dataclasses import dataclass, field
from typing import Annotated, Any, Awaitable, Callable, Optional

from bson import ObjectId
from fastapi import Depends, HTTPException, Request, status
from fastapi.routing import APIRoute
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase
from starlette.responses import Response

from fastcheck_api.app.core.config import settings
from fastcheck_api.app.core.mongodb import get_db
from fastcheck_api.app.core.security import AuthError, decode_token, enrich_from_db
from fastcheck_api.app.services.authz_service import (
    AuthzDecision,
    EnrichedUser,
    autorizar,
    hydrate_user_from_db,
    registrar_auditoria,
)


_bearer_scheme = HTTPBearer(auto_error=False)

# ===========================================================================
# SAFETY LOCK: NESSUNA RICHIESTA AUTHZ_V2 PUÒ ESSERE EVASA SE IL DB ATTIVO
# SI CHIAMA ESATTAMENTE 'duxiter' (PRODUZIONE). Viene chiamato all'inizio
# di get_current_user solo se si tenta di usare l'hydration authz v2.
# ===========================================================================
_FORBIDDEN_PROD_DB_NAME_EXACT = "duxiter"


def _assert_safe_target_db(db: AsyncIOMotorDatabase) -> None:
    """
    Se settings.authz_forbid_prod_db=True e db.name == 'duxiter':
     - Se legacy_layer=True → warning ma si lascia passare SOLO le rotte
       legacy con ROLE_PERMISSIONS.
     - Se legacy_layer=False → HTTP 503 immediato (refusiamo servire
       autorizzazioni v2 sul database di produzione).
    """
    if not settings.authz_forbid_prod_db:
        return
    if db.name == _FORBIDDEN_PROD_DB_NAME_EXACT:
        if not settings.authz_legacy_layer:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "message": (
                        "AUTHZ_V2 rifiutato: connesso a DB produzione 'duxiter'. "
                        "Usare esclusivamente 'duxiter-2' per il nuovo motore."
                    ),
                    "code": "AUTHZ_V2_FORBIDDEN_ON_PROD_DB",
                    "current_db": db.name,
                    "expected_db": "duxiter-2",
                },
            )


# ===========================================================================
# CurrentUser: DOPPIA FACCIA. Mantiene i 4 campi legacy (id/email/role/tenant)
# per backward compat; aggiunge tutti i campi nuovi. Usa get_current_user()
# per idratazione.
# ===========================================================================
@dataclass(frozen=True)
class CurrentUser:
    # --- legacy (DA NON RIMUOVERE MAI FINO A FASE 3) ---
    id: str
    email: str
    role: str                 # = legacy_role. Compatibilità guardie frontend.
    tenant: str               # = tenant legacy_id (ObjectId string)
    # --- nuovi authz v2 ---
    organizacion_id: Optional[str] = None
    pais_ids: list[str] = field(default_factory=list)
    unidad_ids: list[str] = field(default_factory=list)
    area_id: Optional[str] = None
    roles: list[str] = field(default_factory=list)   # ruoli multipli v2
    legacy_role: str = ""
    nivel_info: str = "RESULTADO_GENERAL"
    pn_authorized: bool = False
    cache_version: int = 1
    sensibles_confirmados: list[str] = field(default_factory=list)
    authz_v2_migrated: bool = False


# ===========================================================================
# MAPPATURA ROLE_PERMISSIONS legacy → NUOVI codici permesso DOCX Sec 7.1
# Usata solo durante AUTHZ_LEGACY_LAYER. Deprecato come SOT; nuovo SOT è
# collezione MongoDB 'permisos' + 'rol_permiso'.
# ===========================================================================
#: @deprecated Sostituito dal catálogo DB. Usato solo per compatibilità legacy.
SEED_ROLE_PERMISSIONS: dict[str, set[str]] = {
    "superuser": {
        "user:create", "user:read", "user:update", "user:delete",
        "evaluation:create", "evaluation:read", "evaluation:update",
        "evaluation:delete", "evaluation:bulk", "company:read", "company:update",
        "rut:lookup", "rut:read", "sheriff:logs:read",
        "monitoring:create", "monitoring:read", "monitoring:update",
        "monitoring:delete", "monitoring:execute", "tenant:read", "tenant:update",
        "tenant:users:manage", "admin:dashboard", "admin:settings", "admin:logs",
        "notification:read", "notification:create",
    },
    "tenant_admin": {
        "user:create", "user:read", "user:update", "user:delete",
        "evaluation:create", "evaluation:read", "evaluation:update",
        "evaluation:delete", "evaluation:bulk", "company:read", "company:update",
        "rut:lookup", "rut:read", "sheriff:logs:read",
        "monitoring:create", "monitoring:read", "monitoring:update",
        "monitoring:delete", "monitoring:execute", "tenant:read", "tenant:update",
        "tenant:users:manage", "admin:dashboard",
        "notification:read", "notification:create",
    },
    "evaluator": {
        "user:read", "evaluation:create", "evaluation:read", "evaluation:update",
        "evaluation:delete", "evaluation:bulk", "company:read",
        "rut:lookup", "rut:read", "sheriff:logs:read",
        "monitoring:create", "monitoring:read", "monitoring:update",
        "monitoring:execute", "tenant:read", "notification:read",
    },
    "read_only": {
        "user:read", "evaluation:read", "company:read", "rut:read",
        "sheriff:logs:read", "monitoring:read", "tenant:read",
        "notification:read",
    },
    "write_only": {
        "evaluation:create", "evaluation:read", "company:read", "rut:lookup",
        "monitoring:create", "monitoring:execute", "notification:create",
        "tenant:read", "tenant:update",
    },
}
# Alias per non rompere import esistenti in tutto il codebase legacy.
# Pytest, route legacy, middleware, auth_service.py continuano a funzionare.
ROLE_PERMISSIONS = SEED_ROLE_PERMISSIONS

# Mappa di compatibilità rapida legacy → nuovo codice DOCX.
# Usata in require_permission quando un endpoint legacy chiede 'rut:lookup'
# ma il motore nuovo ragiona con 'fastcheck.query' / 'party.query.pn'.
_LEGACY_PERM_TO_V2: dict[str, str] = {
    "rut:lookup":           "fastcheck.query",
    "rut:read":             "fastcheck.query",
    "sheriff:logs:read":    "fastcheck.query",
    "evaluation:create":    "request.create",
    "evaluation:read":      "fastcheck.query",
    "evaluation:update":    "third_party.approve_obs",
    "evaluation:delete":    "third_party.reject",
    "company:read":         "fastcheck.query",
    "company:update":       "doc.attach",
    "user:read":            "admin.users",
    "user:create":          "admin.users",
    "user:update":          "admin.users",
    "user:delete":          "admin.users",
    "tenant:read":          "admin.structure",
    "tenant:update":        "admin.structure",
    "tenant:users:manage":  "admin.users",
    "admin:dashboard":      "audit.view",
    "admin:settings":       "admin.structure",
    "admin:logs":           "audit.view",
    "monitoring:read":      "fastcheck.query",
    "monitoring:create":    "request.create",
    "monitoring:update":    "request.create",
    "monitoring:delete":    "request.create",
    "monitoring:execute":   "fastcheck.query",
    "notification:read":    "fastcheck.query",
    "notification:create":  "request.create",
    "evaluation:bulk":      "fastcheck.query",
}


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> CurrentUser:
    """
    1. Valida token JWT legacy o v2.
    2. Se l'utente ha authz_v2_migrated=true → idrata EnrichedUser via
       hydrate_user_from_db e costruisce il CurrentUser dual-face.
       Altrimenti → mantiene flusso legacy puro (ROLE_PERMISSIONS).
    3. Safety lock anti-produzione _assert_safe_target_db() viene invocato
       SOLO prima della pipeline v2; flusso legacy è invariato.
    4. Imposta request.state.tenant_id + request.state.authz_ctx.
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No token provided")

    token = credentials.credentials
    try:
        payload = decode_token(token)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e)) from e

    user_id = str(payload.get("id") or "")
    email = str(payload.get("email") or "")
    role = str(payload.get("role") or "")          # claim legacy 'role' (nota: coincide con legacy_role)
    tenant = str(payload.get("tenant") or "")
    if not user_id or not email or not role or not tenant:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    try:
        user_oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user id")

    user_doc = await db["users"].find_one(
        {"_id": user_oid},
        projection={
            "isActive": 1, "tenant": 1,
            "authz_v2_migrated": 1, "cache_version": 1, "legacy_role": 1,
            "authz_v2": 1,
        },
    )
    if not user_doc or not user_doc.get("isActive", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": "Account not activated. Please wait for superadmin approval.",
                "code": "ACCOUNT_NOT_ACTIVATED",
            },
        )

    stored_tenant = user_doc.get("tenant")
    stored_tenant_id = str(stored_tenant) if stored_tenant is not None else ""
    if stored_tenant_id and stored_tenant_id != tenant:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    if role != "superuser":
        try:
            tenant_oid = ObjectId(tenant)
        except Exception:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid tenant id")
        tenant_doc = await db["tenants"].find_one({"_id": tenant_oid}, projection={"isActive": 1})
        if not tenant_doc or not tenant_doc.get("isActive", False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": "Tenant not activated. Please wait for superadmin approval.",
                    "code": "TENANT_NOT_ACTIVATED",
                },
            )

    # Se abbiamo un cache_version diverso tra JWT e DB → invalidazione on-the-fly
    try:
        await enrich_from_db(db, payload)
    except Exception:
        pass

    authz_v2_migrated = bool(user_doc.get("authz_v2_migrated", False))
    _authz_v2_doc = user_doc.get("authz_v2") if isinstance(user_doc.get("authz_v2"), dict) else {}
    force_v2_only = bool(_authz_v2_doc.get("force_v2_only", False))
    # ── Bloque1.3 Migrazione graduale: se force_v2_only=True → MAI usare fallback legacy
    request.state.force_v2_only = force_v2_only
    enriched: Optional[EnrichedUser] = None
    if authz_v2_migrated or force_v2_only:
        # ── Safety lock: autoriz v2 solo su DB non produzione ──
        _assert_safe_target_db(db)
        try:
            enriched = await hydrate_user_from_db(db, user_oid)
        except Exception:
            enriched = None

    legacy_role_final = (
        str(user_doc.get("legacy_role") or payload.get("legacy_role") or role).strip()
    )

    if enriched is not None:
        current = CurrentUser(
            id=user_id, email=email, role=legacy_role_final, tenant=tenant,
            organizacion_id=str(enriched.organizacion_id) if enriched.organizacion_id else None,
            pais_ids=[str(p) for p in enriched.pais_ids],
            unidad_ids=[str(u) for u in enriched.unidad_ids],
            area_id=str(enriched.area_id) if enriched.area_id else None,
            roles=list(enriched.roles),
            legacy_role=legacy_role_final,
            nivel_info=enriched.nivel_info,
            pn_authorized=("party.query.pn" in enriched.sensibles_confirmados),
            cache_version=enriched.cache_version,
            sensibles_confirmados=sorted(enriched.sensibles_confirmados),
            authz_v2_migrated=True,
        )
    else:
        current = CurrentUser(
            id=user_id, email=email, role=legacy_role_final, tenant=tenant,
            legacy_role=legacy_role_final,
            authz_v2_migrated=False,
        )

    request.state.current_user = current
    request.state.tenant_id = tenant
    request.state.authz_ctx = enriched           # None per utenti NON migrati
    return current


Permission = str


def require_permission(permission: Permission, audit_legacy_also: bool = False):
    """
    Decorator dipendenza. Doppia esecuzione (DA-01 · AUTHZ_LEGACY_LAYER):
     - CASO A: utente NON migrato O permesso NON ha mappatura v2
               → usa ROLE_PERMISSIONS legacy puro.
               Se audit_legacy_also=True SCRIVE ANCHE auditoria_log (default=False).
     - CASO B: utente migrato E AUTHZ_LEGACY_LAYER=true OR false
               → motore autorizar() 7-pasos + auditoria.
    DENY gana siempre.
    """
    async def _dep(
        request: Request,
        user: Annotated[CurrentUser, Depends(get_current_user)],
        db: AsyncIOMotorDatabase = Depends(get_db),
    ) -> CurrentUser:
        import asyncio
        # --- Fallback legacy se: (1) non migrato, O (2) permesso non mappato, E (3) non force_v2_only.
        v2_perm = _LEGACY_PERM_TO_V2.get(permission, permission)
        force_v2_only = bool(getattr(request.state, "force_v2_only", False))
        global_legacy_enabled = bool(settings.authz_legacy_layer) and not force_v2_only
        use_legacy = (
            (not user.authz_v2_migrated)
            or (global_legacy_enabled and permission in ROLE_PERMISSIONS.get("superuser", set()))
        ) and not force_v2_only
        # In caso di codice già nuovo (es. 'fastcheck.query' diretto)
        # → mappa identica e user migrato → usiamo motore nuovo.
        if use_legacy and (permission in {p for s in ROLE_PERMISSIONS.values() for p in s}):
            perms = ROLE_PERMISSIONS.get(user.role, set())
            if permission not in perms:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "message": "Forbidden: Insufficient permissions",
                        "required": permission,
                        "userRole": user.role,
                        "engine": "LEGACY_ROLE_PERMISSIONS",
                    },
                )
            # ── FIX Bloque0.6 T1: Audit ANCHE su fallback legacy ────────────
            if audit_legacy_also:
                try:
                    stub_user = EnrichedUser(
                        user_id=ObjectId(user.id),
                        organizacion_id=(
                            ObjectId(user.organizacion_id)
                            if user.organizacion_id else None
                        ),
                        legacy_role=user.role,
                    )
                    decision_stub = AuthzDecision(
                        permitir=True,
                        paso_fallido=None,
                        motivo_denegacion="",
                        permiso_efectivo_origen=f"LEGACY_MAP_{permission}",
                        nivel_info_autorizado=user.nivel_info or "RESULTADO_GENERAL",
                        pn_gate=bool(user.pn_authorized),
                        scope_match="LEGACY_LAYER_NO_SCOPE",
                    )
                    asyncio.create_task(
                        registrar_auditoria(db, stub_user, v2_perm, decision_stub)
                    )
                except Exception:
                    pass
            return user

        # --- Motore autorizar() 7-pasos DOCX 6.3 ---
        enriched = getattr(request.state, "authz_ctx", None)
        if enriched is None:
            # Dovrebbe essere impossibile ma:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": "Forbidden: authz context missing (user not migrated)",
                    "required": permission,
                },
            )
        decision: AuthzDecision = await autorizar(
            db, enriched, v2_perm,
            recurso={
                "organizacion_id": (ObjectId(user.organizacion_id)
                                    if user.organizacion_id else None),
            },
            proposito="ACTUAR" if permission.endswith((":create", ":update", ":delete")) else "VER",
            nivel_requerido="DETALLE_RIESGO",
        )
        # fire-and-forget auditoría (non blocca la richiesta)
        try:
            asyncio.create_task(
                registrar_auditoria(db, enriched, v2_perm, decision)
            )
        except Exception:
            pass
        if not decision.permitir:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": "Forbidden: Authz V2 pipeline 7-pasos rejected",
                    "required_v2": v2_perm,
                    "required_legacy": permission,
                    "paso_fallido": decision.paso_fallido,
                    "motivo_denegacion": decision.motivo_denegacion,
                    "permiso_origen": decision.permiso_efectivo_origen,
                    "scope_match": decision.scope_match,
                    "engine": "AUTHZ_V2_7PASOS",
                },
            )
        return user

    return _dep


def require_permission_audit(permission: Permission):
    """
    Wrapper di require_permission() con audit FORZATO ANCHE sul fallback
    legacy. Usato da tutti gli endpoints v1 legacy rut/checks/usage in Bloque0.6.
    Sostituisce Depends(require_permission('xxx')) senza cambiare comportamento
    di autorizzazione (100% backward compat).
    """
    return require_permission(permission, audit_legacy_also=True)


# ===========================================================================
# Q7 FASE1 · SuperuserBlockedRoute: BLOCCA il superuser GLOBALE dalle rotte
# workspace TENANT-SPECIFIC. Le rotte /api/v2/workspace/* montano questa
# route_class. Se EnrichedUser.is_superuser_wildcard=True → HTTP 403.
# ===========================================================================
SUPERUSER_WORKSPACE_BLOCKED_CODE = "SUPERUSER_WORKSPACE_BLOCKED"


class SuperuserBlockedRoute(APIRoute):
    """
    Custom APIRoute per prefisso /v2/workspace/*.
    Esegue un check PRIMA dell'handler originale:
      - Decode JWT → hydrate EnrichedUser (se l'utente è authz_v2_migrated)
      - fallback legacy: role claim == 'superuser'
      - Se wildcard superuser → raise HTTP 403 SUPERUSER_WORKSPACE_BLOCKED
    Safety lock: usa get_db() singleton e _assert_safe_target_db prima di
    hydrate per evitare connessioni involontarie a duxiter produzione.
    """

    def get_route_handler(self) -> Callable[[Request], Awaitable[Response]]:
        original = super().get_route_handler()

        async def _workspace_gate(request: Request) -> Response:
            db: AsyncIOMotorDatabase = get_db()
            _assert_safe_target_db(db)

            creds: HTTPAuthorizationCredentials | None = None
            try:
                creds = await _bearer_scheme(request)
            except Exception:
                creds = None
            if creds is None or not creds.credentials:
                return await original(request)

            token = creds.credentials
            try:
                payload = decode_token(token)
            except AuthError:
                return await original(request)

            user_id_str = str(payload.get("id") or "")
            is_super: bool = False
            try:
                user_oid = ObjectId(user_id_str)
            except Exception:
                user_oid = None
            if user_oid is not None:
                try:
                    user_doc = await db["users"].find_one(
                        {"_id": user_oid},
                        projection={
                            "authz_v2_migrated": 1,
                            "isActive": 1,
                            "tenant": 1,
                            "legacy_role": 1,
                        },
                    )
                except Exception:
                    user_doc = None
                if user_doc and user_doc.get("authz_v2_migrated") and user_doc.get("isActive"):
                    try:
                        enriched: EnrichedUser | None = await hydrate_user_from_db(
                            db, user_oid, force_refresh=False
                        )
                    except Exception:
                        enriched = None
                    if enriched is not None:
                        is_super = bool(enriched.is_superuser_wildcard)
                if not is_super and user_doc:
                    legacy_role = (
                        str(user_doc.get("legacy_role") or payload.get("legacy_role") or "").strip()
                    )
                    if legacy_role == "superuser" or str(payload.get("role") or "") == "superuser":
                        is_super = True

            if is_super:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "message": (
                            "Superuser globale non può accedere a rotte workspace "
                            "tenant-specific. Usare un account utente appartenente al tenant."
                        ),
                        "code": SUPERUSER_WORKSPACE_BLOCKED_CODE,
                        "http_code_num": 40301,
                    },
                )

            return await original(request)

        return _workspace_gate


