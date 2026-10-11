"""Router Authz V2 — chequeo pipeline 7 pasos, /me, /permissions, /scopes."""
from __future__ import annotations

import asyncio
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from fastcheck_api.app.api.dependencies import CurrentUser, get_current_user
from fastcheck_api.app.core.mongodb import get_db
from fastcheck_api.app.utils.mongo import jsonable
from fastcheck_api.app.services.authz_service import (
    AuthzDecision,
    EnrichedUser,
    autorizar,
    hydrate_user_from_db,
    permisos_efectivos,
    registrar_auditoria,
)


router = APIRouter(prefix="/authz", tags=["authz-v2"])


class CheckRequest(BaseModel):
    accion_codigo: str = Field(..., description="Código permiso v2, ej. 'fastcheck.query'")
    proposito: str = Field(default="VER", pattern="^(VER|ACTUAR)$")
    nivel_requerido: str = Field(default="RESULTADO_GENERAL")
    categoria_tercero: str | None = Field(default=None)
    recurso: dict[str, Any] | None = Field(default=None)


class CheckResponse(BaseModel):
    permitir: bool
    paso_fallido: int | None = None
    motivo_denegacion: str = ""
    permiso_efectivo_origen: str = ""
    nivel_info_autorizado: str = ""
    pn_gate: bool = False
    scope_match: str = ""


@router.post(
    "/check",
    response_model=CheckResponse,
    summary="Evaluar autorización (7 pasos DOCX 6.3)",
    description=(
        "Pipeline: 1) sesión, 2) DENY override, 3) GRANT / rol, 4) sensible confirmado, "
        "5) alcance, 6) gate PN, 7) nivel info. Registra auditoría."
    ),
)
async def authz_check(
    req: CheckRequest,
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    enriched: EnrichedUser | None = getattr(request.state, "authz_ctx", None)
    if enriched is None:
        if not user.authz_v2_migrated:
            from bson import ObjectId
            enriched = await hydrate_user_from_db(db, ObjectId(user.id))
        else:
            return CheckResponse(
                permitir=False,
                paso_fallido=1,
                motivo_denegacion="PASO1_USUARIO_NO_MIGRADO_AUTHZ_V2",
            )
    decision: AuthzDecision = await autorizar(
        db,
        enriched,
        req.accion_codigo,
        recurso=req.recurso or {},
        proposito=req.proposito,  # type: ignore[arg-type]
        nivel_requerido=req.nivel_requerido,
        categoria_tercero=req.categoria_tercero,
    )
    try:
        asyncio.create_task(
            registrar_auditoria(
                db, enriched, req.accion_codigo, decision, recurso=req.recurso
            )
        )
    except Exception:
        pass
    return CheckResponse(**decision.to_dict())


@router.get(
    "/me",
    summary="CurrentUser con campos V2 (roles multiples, nivel_info, sensibles)",
    description="Devuelve el CurrentUser completo. Solo metadatos: no incluye payload JWT.",
)
async def authz_me(user: Annotated[CurrentUser, Depends(get_current_user)]):
    return jsonable({
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "tenant": user.tenant,
        "legacy_role": user.legacy_role,
        "organizacion_id": user.organizacion_id,
        "pais_ids": user.pais_ids,
        "unidad_ids": user.unidad_ids,
        "area_id": user.area_id,
        "roles": user.roles,
        "nivel_info": user.nivel_info,
        "pn_authorized": user.pn_authorized,
        "cache_version": user.cache_version,
        "sensibles_confirmados": user.sensibles_confirmados,
        "authz_v2_migrated": user.authz_v2_migrated,
    })


@router.get(
    "/permissions",
    summary="Permisos efectivos (DENY>GRANT>ROL>deny-default)",
    description="Devuelve todos los permisos efectivos calculados en tiempo real.",
)
async def authz_permissions(
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    enriched: EnrichedUser | None = getattr(request.state, "authz_ctx", None)
    if enriched is None:
        from bson import ObjectId
        if not user.authz_v2_migrated:
            return {"authz_v2_migrated": False, "permisos": []}
        enriched = await hydrate_user_from_db(db, ObjectId(user.id))
    pefs = await permisos_efectivos(db, enriched)
    return jsonable({
        "authz_v2_migrated": True,
        "total": len(pefs),
        "permisos": [
            {
                "codigo": p.codigo,
                "permitido": p.permitido,
                "origen": p.origen,
                "es_sensible": p.es_sensible,
            }
            for p in pefs.values()
        ],
    })


@router.get(
    "/scopes",
    summary="Alcances VER / ACTUAR del usuario",
    description="Escopes por propósito (VER/ACTUAR) + tipo_alcance (PROPIO/UNIDAD/...)",
)
async def authz_scopes(
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    enriched: EnrichedUser | None = getattr(request.state, "authz_ctx", None)
    if enriched is None:
        from bson import ObjectId
        if not user.authz_v2_migrated:
            return {"ver": [], "actuar": []}
        enriched = await hydrate_user_from_db(db, ObjectId(user.id))
    return jsonable({"ver": enriched.scopes_ver, "actuar": enriched.scopes_actuar})
