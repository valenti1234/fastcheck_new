"""Router Comentarios V2 — 3 niveles visibilidad VISIBLE/RESTRINGIDO/PERSONAL (HU-12 Bloque 2.1)."""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Annotated, Any, Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from fastcheck_api.app.api.dependencies import CurrentUser, get_current_user, require_permission
from fastcheck_api.app.core.mongodb import get_db
from fastcheck_api.app.services.authz_service import (
    EnrichedUser,
    autorizar,
    hydrate_user_from_db,
    registrar_auditoria,
)
from fastcheck_api.app.utils.mongo import jsonable, sanitize_rut, to_object_id

router = APIRouter(prefix="/comments", tags=["comments-v2"])


Visibilidad = Literal["VISIBLE", "RESTRINGIDO", "PERSONAL"]
AmbitoTipo = Literal["UNIDAD", "AREA", "ORG"]


class CreateCommentRequest(BaseModel):
    tercero_id: str | None = None
    rut: str | None = None
    contenido: str = Field(..., min_length=1, max_length=5000)
    visibilidad: Visibilidad = "VISIBLE"
    ambito_restringido_tipo: AmbitoTipo | None = None
    ambito_restringido_id: str | None = None
    mencionados_ids: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class UpdateCommentRequest(BaseModel):
    contenido: str | None = Field(default=None, min_length=1, max_length=5000)
    visibilidad: Visibilidad | None = None
    ambito_restringido_tipo: AmbitoTipo | None = None
    ambito_restringido_id: str | None = None
    tags: list[str] | None = None


def _oid(s) -> ObjectId | None:
    return to_object_id(s) if s else None


def _es_admin_o_auditor(user: CurrentUser) -> bool:
    return user.role in ("superuser", "tenant_admin") or "AUDITOR" in (user.roles or [])


def _filtro_visibilidad_lectura(
    user: CurrentUser, filt_base: dict[str, Any]
) -> dict[str, Any]:
    """Construye filtro MongoDB para projection HU-12 (3 niveles visibilidad) en scope tenant/org."""
    tenant_oid = _oid(user.tenant)
    org_oid = _oid(user.organizacion_id or user.tenant)
    unidad_oids = [_oid(u) for u in (user.unidad_ids or []) if _oid(u)]
    area_oid = _oid(user.area_id)
    user_oid = _oid(user.id)

    # Sempre isolamento tenant
    filt = dict(filt_base)
    filt["$or"] = []

    # (a) PERSONAL: solo io sono l'autore OPPURE sono super/auditor
    personal_filt: dict[str, Any] = {"visibilidad": "PERSONAL"}
    if _es_admin_o_auditor(user):
        # admin e auditor vedono tutti i PERSONAL (regola compliance)
        pass
    else:
        personal_filt["autor_id"] = user_oid
    filt["$or"].append(personal_filt)

    # (b) VISIBLE: tutti nella org (implicitamente soddisfatto se organizzazione = la mia)
    filt["$or"].append(
        {
            "visibilidad": "VISIBLE",
            "organizacion_id": org_oid if org_oid else {"$exists": True},
        }
    )

    # (c) RESTRINGIDO: utente cade dentro l'ambito UNIDAD/AREA/ORG
    if unidad_oids:
        filt["$or"].append(
            {"visibilidad": "RESTRINGIDO", "ambito_restringido_tipo": "UNIDAD", "ambito_restringido_id": {"$in": unidad_oids}}
        )
    if area_oid:
        filt["$or"].append(
            {"visibilidad": "RESTRINGIDO", "ambito_restringido_tipo": "AREA", "ambito_restringido_id": area_oid}
        )
    if org_oid:
        filt["$or"].append(
            {"visibilidad": "RESTRINGIDO", "ambito_restringido_tipo": "ORG", "ambito_restringido_id": org_oid}
        )
    # superuser wildcard: vede TUTTO (senza filtro organizzazione, ma sempre tenant)
    if user.role == "superuser":
        filt = dict(filt_base)
        filt["borrado_logico"] = {"$ne": True}
        return filt

    filt["organizacion_id"] = org_oid if org_oid else tenant_oid
    filt["borrado_logico"] = {"$ne": True}
    return filt


# ---------------------------------------------------------------------------
# ROUTES
# ---------------------------------------------------------------------------

@router.get(
    "",
    summary="Listar comentarios por tercero/rut (proyección 3 niveles visibilidad HU-12)",
    dependencies=[Depends(require_permission("comment.read"))],
)
async def list_comments(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    tercero_id: str | None = Query(default=None),
    rut: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
):
    filt_base: dict[str, Any] = {}
    if tercero_id:
        filt_base["tercero_id"] = _oid(tercero_id)
    if rut:
        rc = sanitize_rut(rut)
        if rc:
            filt_base["rut_clean"] = rc
    filt = _filtro_visibilidad_lectura(user, filt_base)
    cur = db["comentarios_v2"].find(filt).sort("creado_en", -1).skip(skip).limit(limit)
    docs = [jsonable(d) for d in await cur.to_list(length=limit)]
    total = await db["comentarios_v2"].count_documents(filt)
    return {"items": docs, "count": len(docs), "total": total, "limit": limit, "skip": skip}


@router.post(
    "",
    summary="Crear comentario con visibilidad V/R/P (permiso comment.create)",
    dependencies=[Depends(require_permission("comment.create"))],
)
async def create_comment(
    body: CreateCommentRequest,
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    if not body.tercero_id and not body.rut:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Se requiere tercero_id o rut")
    if body.visibilidad == "RESTRINGIDO" and (not body.ambito_restringido_tipo or not body.ambito_restringido_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="RESTRINGIDO requiere ambito_restringido_tipo e id")
    now = datetime.utcnow().isoformat()
    doc = {
        "tercero_id": _oid(body.tercero_id),
        "rut_clean": sanitize_rut(body.rut) if body.rut else None,
        "tenantId": _oid(user.tenant),
        "organizacion_id": _oid(user.organizacion_id or user.tenant),
        "unidad_id": _oid((user.unidad_ids or [None])[0]),
        "area_id": _oid(user.area_id),
        "autor_id": _oid(user.id),
        "autor_email": user.email,
        "contenido": body.contenido,
        "visibilidad": body.visibilidad,
        "ambito_restringido_tipo": body.ambito_restringido_tipo,
        "ambito_restringido_id": _oid(body.ambito_restringido_id),
        "mencionados_ids": [_oid(u) for u in body.mencionados_ids if _oid(u)],
        "tags": list(body.tags or []),
        "attachments": [],
        "borrado_logico": False,
        "creado_en": now,
        "actualizado_en": now,
    }
    res = await db["comentarios_v2"].insert_one(doc)
    doc["_id"] = res.inserted_id
    try:
        enriched: EnrichedUser | None = getattr(request.state, "authz_ctx", None)
        if enriched is None:
            enriched = await hydrate_user_from_db(db, _oid(user.id))
        dec = await autorizar(db, enriched, "comment.create", proposito="ACTUAR")
        asyncio.create_task(
            registrar_auditoria(
                db, enriched, "comment.create", dec,
                recurso={"entidad_tipo": "comentarios_v2", "entidad_id": str(res.inserted_id), "visibilidad": body.visibilidad},
            )
        )
    except Exception:
        pass
    return {"ok": True, "id": str(res.inserted_id), "creado_en": now}


@router.put(
    "/{comment_id}",
    summary="Modificar comentario (solo autor o admin)",
    dependencies=[Depends(require_permission("comment.create"))],
)
async def update_comment(
    comment_id: str,
    body: UpdateCommentRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    cid = _oid(comment_id)
    if not cid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="comment_id invalido")
    doc = await db["comentarios_v2"].find_one({"_id": cid})
    if not doc or doc.get("borrado_logico"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Comentario no encontrado")
    autor_oid = doc.get("autor_id")
    if autor_oid and str(autor_oid) != user.id and not _es_admin_o_auditor(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Solo autor o admin pueden editar")
    if user.role != "superuser" and str(doc.get("tenantId", "")) != str(user.tenant):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Comentario fuori tenant")
    sets: dict[str, Any] = {"actualizado_en": datetime.utcnow().isoformat()}
    if body.contenido is not None:
        sets["contenido"] = body.contenido
    if body.visibilidad is not None:
        if body.visibilidad == "RESTRINGIDO":
            t = body.ambito_restringido_tipo or doc.get("ambito_restringido_tipo")
            i = body.ambito_restringido_id or doc.get("ambito_restringido_id")
            if not t or not i:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="RESTRINGIDO requiere tipo+id")
            sets["ambito_restringido_tipo"] = t
            sets["ambito_restringido_id"] = _oid(i)
        else:
            sets["ambito_restringido_tipo"] = None
            sets["ambito_restringido_id"] = None
        sets["visibilidad"] = body.visibilidad
    if body.tags is not None:
        sets["tags"] = list(body.tags)
    await db["comentarios_v2"].update_one({"_id": cid}, {"$set": sets})
    return {"ok": True}


@router.delete(
    "/{comment_id}",
    summary="Borrado lógico comentario (permiso comment.delete · autor o admin)",
    dependencies=[Depends(require_permission("comment.delete"))],
)
async def delete_comment(
    comment_id: str,
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    cid = _oid(comment_id)
    if not cid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="comment_id invalido")
    doc = await db["comentarios_v2"].find_one({"_id": cid})
    if not doc or doc.get("borrado_logico"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Comentario no encontrado")
    autor_oid = doc.get("autor_id")
    if autor_oid and str(autor_oid) != user.id and not _es_admin_o_auditor(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Solo autor o admin pueden borrar")
    if user.role != "superuser" and str(doc.get("tenantId", "")) != str(user.tenant):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Comentario fuori tenant")
    now = datetime.utcnow().isoformat()
    await db["comentarios_v2"].update_one(
        {"_id": cid},
        {"$set": {"borrado_logico": True, "borrado_en": now, "borrado_por_id": _oid(user.id), "actualizado_en": now}},
    )
    try:
        enriched: EnrichedUser | None = getattr(request.state, "authz_ctx", None)
        if enriched is None:
            enriched = await hydrate_user_from_db(db, _oid(user.id))
        dec = await autorizar(db, enriched, "comment.delete", proposito="ACTUAR")
        asyncio.create_task(
            registrar_auditoria(
                db, enriched, "comment.delete", dec,
                recurso={"entidad_tipo": "comentarios_v2", "entidad_id": comment_id},
            )
        )
    except Exception:
        pass
    return {"ok": True, "borrado_en": now}
