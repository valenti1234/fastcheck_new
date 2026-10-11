"""Router Audit V2 — búsqueda sobre auditoria_log (quién hizo qué, cuándo)."""
from __future__ import annotations

from typing import Annotated, Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from fastcheck_api.app.api.dependencies import CurrentUser, get_current_user, require_permission
from fastcheck_api.app.core.mongodb import get_db
from fastcheck_api.app.utils.mongo import jsonable


router = APIRouter(prefix="/audit", tags=["audit-v2"])


class SearchAuditRequest(BaseModel):
    usuario_id: str | None = None
    accion: str | None = None
    permitir: bool | None = Field(default=None, description="True=permitido, False=negado, None=tutti")
    entidad_tipo: str | None = None
    entidad_id: str | None = None
    paso_fallido: int | None = None
    desde_ts: float | None = None
    hasta_ts: float | None = None
    limit: int = Field(default=100, ge=1, le=1000)
    skip: int = Field(default=0, ge=0)


@router.get(
    "/search",
    summary="Ricerca log di audit (solo utenti con audit.view)",
    description=(
        "Scrive a ogni /authz/check, /grant-sensible e modifiche utenti. "
        "Preserva registro anche in caso di decision.permitir=False."
    ),
    dependencies=[Depends(require_permission("sheriff:logs:read"))],
)
async def audit_search(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    usuario_id: str | None = Query(default=None),
    accion: str | None = Query(default=None),
    permitir: bool | None = Query(default=None),
    entidad_tipo: str | None = Query(default=None),
    paso_fallido: int | None = Query(default=None),
    desde_ts: float | None = Query(default=None),
    hasta_ts: float | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    skip: int = Query(default=0, ge=0),
):
    filt: dict[str, Any] = {}
    if user.role != "superuser":
        filt["organizacion_id"] = ObjectId(user.organizacion_id) if user.organizacion_id else ObjectId(user.tenant)
    if usuario_id:
        filt["usuario_id"] = ObjectId(usuario_id)
    if accion:
        filt["accion"] = accion
    if permitir is not None:
        filt["permitir"] = bool(permitir)
    if entidad_tipo:
        filt["entidad_tipo"] = entidad_tipo
    if paso_fallido:
        filt["paso_fallido"] = int(paso_fallido)
    if desde_ts or hasta_ts:
        ts_filt: dict[str, Any] = {}
        if desde_ts:
            ts_filt["$gte"] = float(desde_ts)
        if hasta_ts:
            ts_filt["$lte"] = float(hasta_ts)
        if ts_filt:
            filt["ts"] = ts_filt

    cur = db["auditoria_log"].find(filt).sort("ts", -1).skip(skip).limit(limit)
    items = [jsonable(d) for d in await cur.to_list(length=limit)]
    total = await db["auditoria_log"].count_documents(filt)
    return {
        "items": items,
        "count": len(items),
        "total": total,
        "limit": limit,
        "skip": skip,
    }


@router.post(
    "/search",
    summary="Ricerca log di audit via POST (payload complesso)",
    dependencies=[Depends(require_permission("sheriff:logs:read"))],
    response_model=None,
)
async def audit_search_post(
    body: SearchAuditRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    qp = {
        "usuario_id": body.usuario_id,
        "accion": body.accion,
        "permitir": body.permitir,
        "entidad_tipo": body.entidad_tipo,
        "paso_fallido": body.paso_fallido,
        "desde_ts": body.desde_ts,
        "hasta_ts": body.hasta_ts,
        "limit": body.limit,
        "skip": body.skip,
    }
    from fastapi.params import Query
    return await audit_search(user, db, **qp)


@router.get(
    "/stats/denials-by-step",
    summary="Conteggio negazioni per passo (1..7 DOCX 6.3) — solo admin",
    dependencies=[Depends(require_permission("admin:settings"))],
)
async def audit_stats_denials_by_step(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    last_hours: int = Query(default=24, ge=1, le=24*60),
):
    from time import time
    filt: dict[str, Any] = {
        "permitir": False,
        "ts": {"$gte": time() - last_hours * 3600},
    }
    if user.role != "superuser":
        filt["organizacion_id"] = ObjectId(user.organizacion_id) if user.organizacion_id else ObjectId(user.tenant)
    pipeline = [
        {"$match": filt},
        {"$group": {"_id": "$paso_fallido", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    return [
        {
            "paso": d["_id"],
            "descripcion": {
                1: "SESION_INVALIDA", 2: "OVERRIDE_DENY",
                3: "SIN_PERMISO_ROL_O_GRANT", 4: "SIN_CONFIRMACION_SENSIBLE",
                5: "FUERA_ALCANCE_SCOPE", 6: "GATE_PN_PROHIBIDO",
                7: "NIVEL_INFO_INSUFICIENTE",
            }.get(d["_id"] or 0, "SIN_CLASIFICAR"),
            "count": d["count"],
        }
        async for d in db["auditoria_log"].aggregate(pipeline)
    ]
