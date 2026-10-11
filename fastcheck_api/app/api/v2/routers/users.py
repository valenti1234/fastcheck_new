"""Router Users V2 — roles, override permisos, grant sensible, alcance."""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Annotated, Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from fastcheck_api.app.api.dependencies import CurrentUser, get_current_user, require_permission
from fastcheck_api.app.core.mongodb import get_db
from fastcheck_api.app.services.authz_service import authz_cache_invalidate_user
from fastcheck_api.app.utils.mongo import jsonable, to_object_id


router = APIRouter(prefix="/users", tags=["users-v2"])


class RoleAssignRequest(BaseModel):
    rol_codigos: list[str] = Field(..., min_length=0)


class OverridePermisoRequest(BaseModel):
    permiso_codigo: str
    tipo_override: str = Field(..., pattern="^(GRANT|DENY)$")
    sensible_confirmado: bool = False


class AlcanceRequest(BaseModel):
    proposito: str = Field(..., pattern="^(VER|ACTUAR)$")
    tipo_alcance: str = Field(..., pattern="^(PROPIO|UNIDAD|CONJUNTO_UNIDADES|AREA|PAIS|ORGANIZACION)$")
    unidad_ids: list[str] = Field(default_factory=list)
    area_id: str | None = None
    pais_id: str | None = None
    organizacion_id: str | None = None
    incluye_descendientes: bool = True


def _oid(s):
    return to_object_id(s) if s else None


def _require_admin_or_self(user: CurrentUser, target_id: str) -> None:
    """Admin (superuser, tenant_admin) o auto-gestión propio perfil (solo lectura)."""
    if user.role in ("superuser", "tenant_admin"):
        return
    if user.id == target_id:
        return
    raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Solo admin o propietario")


@router.get(
    "/{user_id}/roles",
    summary="Lista roles asignados al usuario",
)
async def user_list_roles(
    user_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    _require_admin_or_self(user, user_id)
    uid = _oid(user_id)
    cursor = db["usuario_rol"].find({"usuario_id": uid}).sort("rol_codigo", 1)
    return [
        {
            "id": str(d["_id"]),
            "rol_codigo": d.get("rol_codigo"),
            "heredado_de": d.get("heredado_de", "DIRECTO"),
            "fecha_asignacion": d.get("fecha_asignacion"),
        }
        async for d in cursor
    ]


@router.put(
    "/{user_id}/roles",
    summary="Reemplaza roles del usuario (solo admin)",
    description="Escribe usuario_rol y bump cache_version en users para invalidar JWT.",
    dependencies=[Depends(require_permission("user:update"))],
)
async def user_set_roles(
    user_id: str,
    body: RoleAssignRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    uid = _oid(user_id)
    async with await db.client.start_session() as sess:
        async with sess.start_transaction():
            await db["usuario_rol"].delete_many({"usuario_id": uid}, session=sess)
            if body.rol_codigos:
                now = datetime.utcnow().isoformat()
                await db["usuario_rol"].insert_many(
                    [
                        {
                            "usuario_id": uid,
                            "rol_codigo": c,
                            "heredado_de": "DIRECTO",
                            "fecha_asignacion": now,
                            "asignado_por": _oid(user.id),
                        }
                        for c in body.rol_codigos
                    ],
                    session=sess,
                )
            res = await db["users"].find_one_and_update(
                {"_id": uid},
                [{"$set": {"cache_version": {"$add": [{"$ifNull": ["$cache_version", 1]}, 1]}}}],
                session=sess,
                return_document=True,
            )
    authz_cache_invalidate_user(user_id)
    return {
        "ok": True,
        "nuevos_roles": body.rol_codigos,
        "cache_version": res.get("cache_version", 1) if res else 1,
    }


@router.post(
    "/{user_id}/permiso-override",
    summary="Override permiso (GRANT/DENY). Sensible requiere admin.grant_sensitive.",
    dependencies=[Depends(require_permission("user:update"))],
)
async def user_override_permiso(
    user_id: str,
    body: OverridePermisoRequest,
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    from fastcheck_api.app.services.authz_service import SENSIBLES
    uid = _oid(user_id)
    if body.permiso_codigo in SENSIBLES and body.sensible_confirmado:
        # requiere permiso admin.grant_sensitive via legacy guard
        from fastcheck_api.app.services.authz_service import autorizar, hydrate_user_from_db
        enriched = getattr(request.state, "authz_ctx", None) or await hydrate_user_from_db(db, _oid(user.id))
        dec = await autorizar(db, enriched, "admin.grant_sensitive", proposito="ACTUAR")
        if not dec.permitir:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Requiere admin.grant_sensitive")
    now = datetime.utcnow().isoformat()
    await db["usuario_permiso_override"].update_one(
        {"usuario_id": uid, "permiso_codigo": body.permiso_codigo},
        {
            "$set": {
                "tipo_override": body.tipo_override,
                "sensible_confirmado": body.sensible_confirmado,
                "updated_at": now,
                "actualizado_por": _oid(user.id),
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    await db["users"].update_one({"_id": uid}, [{"$set": {"cache_version": {"$add": [{"$ifNull": ["$cache_version", 1]}, 1]}}}])
    authz_cache_invalidate_user(user_id)
    return {"ok": True}


@router.delete(
    "/{user_id}/permiso-override/{permiso_codigo}",
    summary="Remover override permiso",
    dependencies=[Depends(require_permission("user:update"))],
)
async def user_remove_override(
    user_id: str, permiso_codigo: str,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    uid = _oid(user_id)
    r = await db["usuario_permiso_override"].delete_one({"usuario_id": uid, "permiso_codigo": permiso_codigo})
    if r.deleted_count:
        await db["users"].update_one({"_id": uid}, [{"$set": {"cache_version": {"$add": [{"$ifNull": ["$cache_version", 1]}, 1]}}}])
        authz_cache_invalidate_user(user_id)
    return {"deleted": r.deleted_count}


@router.post(
    "/{user_id}/grant-sensible",
    summary="Conceder permiso sensible (Q4 3 niveles F0/F1). Sólo superadmin.",
    dependencies=[Depends(require_permission("admin.grant_sensitive"))],
)
async def user_grant_sensible(
    user_id: str,
    body: OverridePermisoRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    from fastcheck_api.app.services.authz_service import SENSIBLES, ESCALAMIENTO_NIVELES_FIJOS
    if body.permiso_codigo not in SENSIBLES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Permiso no sensible")
    body.tipo_override = "GRANT"
    body.sensible_confirmado = True
    uid = _oid(user_id)
    now = datetime.utcnow().isoformat()
    await db["usuario_permiso_override"].update_one(
        {"usuario_id": uid, "permiso_codigo": body.permiso_codigo},
        {
            "$set": {
                "tipo_override": "GRANT",
                "sensible_confirmado": True,
                "escalamiento_nivel": ESCALAMIENTO_NIVELES_FIJOS[0],
                "actualizado_por": _oid(user.id),
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    await db["users"].update_one({"_id": uid}, [{"$set": {"cache_version": {"$add": [{"$ifNull": ["$cache_version", 1]}, 1]}}}])
    authz_cache_invalidate_user(user_id)
    return {"ok": True, "permiso": body.permiso_codigo, "escalamiento_nivel": 1}


@router.get(
    "/{user_id}/alcance",
    summary="Ver alcances usuario (VER + ACTUAR)",
)
async def user_list_alcance(
    user_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    _require_admin_or_self(user, user_id)
    uid = _oid(user_id)
    items = [jsonable(d) async for d in db["usuario_alcance"].find({"usuario_id": uid}).sort([("proposito", 1), ("tipo_alcance", 1)])]
    return items


@router.put(
    "/{user_id}/alcance",
    summary="Reemplazar alcances usuario",
    dependencies=[Depends(require_permission("user:update"))],
)
async def user_set_alcance(
    user_id: str,
    items: list[AlcanceRequest],
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    uid = _oid(user_id)
    docs = [
        {
            "usuario_id": uid,
            "proposito": i.proposito,
            "tipo_alcance": i.tipo_alcance,
            "unidad_ids": [_oid(u) for u in i.unidad_ids if _oid(u)],
            "area_id": _oid(i.area_id),
            "pais_id": _oid(i.pais_id),
            "organizacion_id": _oid(i.organizacion_id),
            "incluye_descendientes": bool(i.incluye_descendientes),  # Q2 default TRUE
            "actualizado_por": _oid(user.id),
            "updated_at": datetime.utcnow().isoformat(),
        }
        for i in items
    ]
    async with await db.client.start_session() as sess:
        async with sess.start_transaction():
            await db["usuario_alcance"].delete_many({"usuario_id": uid}, session=sess)
            if docs:
                await db["usuario_alcance"].insert_many(docs, session=sess)
            await db["users"].update_one(
                {"_id": uid},
                [{"$set": {"cache_version": {"$add": [{"$ifNull": ["$cache_version", 1]}, 1]}}}],
                session=sess,
            )
    authz_cache_invalidate_user(user_id)
    return {"ok": True, "alcances_count": len(docs)}
