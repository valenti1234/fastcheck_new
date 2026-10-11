"""Router Org V2 — jerarquía: organizaciones → paises → unidades → areas + descendientes Q2=True."""
from __future__ import annotations

from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from fastcheck_api.app.api.dependencies import CurrentUser, get_current_user, require_permission
from fastcheck_api.app.core.mongodb import get_db
from fastcheck_api.app.utils.mongo import jsonable


router = APIRouter(prefix="/org", tags=["org-v2"])


def _oid(s) -> ObjectId | None:
    try:
        return ObjectId(str(s)) if s else None
    except Exception:
        return None


@router.get("/organizaciones", summary="Lista organizaciones (1:1 tenants legacy)")
async def list_organizaciones(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
):
    filt: dict = {} if user.role == "superuser" else {"tenant_legacy_id": _oid(user.tenant)}
    cur = db["organizaciones"].find(filt).skip(skip).limit(limit).sort("nombre", 1)
    return {"items": [jsonable(d) for d in await cur.to_list(length=limit)], "limit": limit, "skip": skip}


@router.get("/paises", summary="Lista países")
async def list_paises(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    organizacion_id: str | None = None,
):
    filt: dict = {}
    if user.role != "superuser":
        filt["organizacion_id"] = _oid(user.organizacion_id or user.tenant)
    elif organizacion_id:
        filt["organizacion_id"] = _oid(organizacion_id)
    return [jsonable(d) async for d in db["paises"].find(filt).sort("nombre", 1)]


@router.get("/units", summary="Lista unidades organizacionales (UO)")
async def list_units(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    parent_id: str | None = None,
    pais_id: str | None = None,
    solo_raices: bool = False,
):
    filt: dict = {}
    if user.role != "superuser":
        filt["organizacion_id"] = _oid(user.organizacion_id or user.tenant)
    if pais_id:
        filt["pais_id"] = _oid(pais_id)
    if solo_raices:
        filt["parent_id"] = None
    elif parent_id:
        filt["parent_id"] = _oid(parent_id)
    return [jsonable(d) async for d in db["unidades_organizacionales"].find(filt).sort("nombre", 1)]


@router.get("/units/{unit_id}/descendientes",
            summary="Sub-árbol de UO (Q2: incluye_descendientes=True por defecto)")
async def list_descendientes(
    unit_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    start = _oid(unit_id)
    if not start:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="unit_id invalido")
    root = await db["unidades_organizacionales"].find_one({"_id": start})
    if not root:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="UO no encontrada")
    if user.role != "superuser":
        org = user.organizacion_id or user.tenant
        if str(root.get("organizacion_id", "")) != org:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="UO fuori organizzazione")
    result: list[dict] = []
    visited: set[str] = set()
    queue: list[ObjectId] = [start]
    while queue:
        cur = queue.pop(0)
        cs = str(cur)
        if cs in visited:
            continue
        visited.add(cs)
        if cs != str(start):
            doc = await db["unidades_organizacionales"].find_one({"_id": cur})
            if doc:
                result.append(jsonable(doc))
        async for child in db["unidades_organizacionales"].find({"parent_id": cur}):
            queue.append(child["_id"])
    return {"root_id": unit_id, "count": len(result), "descendientes": result}


@router.get("/areas", summary="Lista areas funcionales")
async def list_areas(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    unidad_id: str | None = None,
):
    filt: dict = {}
    if user.role != "superuser":
        filt["organizacion_id"] = _oid(user.organizacion_id or user.tenant)
    if unidad_id:
        filt["unidad_id"] = _oid(unidad_id)
    return [jsonable(d) async for d in db["areas_funcionales"].find(filt).sort("nombre", 1)]
