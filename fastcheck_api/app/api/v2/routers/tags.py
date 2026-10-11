"""Router Etiquetas V2 — catalogo general/restringida + 4 permisos tag.* (Bloque 2.2 FASE2)."""
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
from fastcheck_api.app.utils.mongo import jsonable, to_object_id

router = APIRouter(prefix="/tags", tags=["tags-v2"])


TipoEtiqueta = Literal["GENERAL", "RESTRINGIDA"]


class CreateTagRequest(BaseModel):
    codigo: str = Field(..., min_length=3, max_length=24, pattern="^[a-z0-9_\\-]+$")
    nombre: str = Field(..., min_length=3, max_length=80)
    tipo: TipoEtiqueta = "GENERAL"
    descripcion: str | None = Field(default=None, max_length=500)
    color_hex: str | None = Field(default=None, pattern="^#[0-9a-fA-F]{6}$")


class UpdateTagRequest(BaseModel):
    nombre: str | None = Field(default=None, min_length=3, max_length=80)
    descripcion: str | None = Field(default=None, max_length=500)
    color_hex: str | None = Field(default=None, pattern="^#[0-9a-fA-F]{6}$")


class GrantTagRequest(BaseModel):
    usuario_id: str
    accion: Literal["AGREGAR", "QUITAR"] = "AGREGAR"


def _oid(s):
    return to_object_id(s) if s else None


def _es_admin_o_auditor(user: CurrentUser) -> bool:
    return user.role in ("superuser", "tenant_admin") or "AUDITOR" in (user.roles or [])


def _filtro_etiquetas_lectura(
    user: CurrentUser, filt_base: dict[str, Any]
) -> dict[str, Any]:
    """Projection scope: GENERAL = todos en la org; RESTRINGIDA = solo autorizados o admin/auditor. Superuser wildcard todas."""
    org_oid = _oid(user.organizacion_id or user.tenant)
    user_oid = _oid(user.id)
    filt = dict(filt_base)

    if user.role == "superuser":
        # Wildcard superuser: ve TODO (sin org filter)
        filt["borrado_logico"] = {"$ne": True}
        return filt

    # (1) GENERAL siempre visible para miembros misma organizacion
    general_filt: dict[str, Any] = {"tipo": "GENERAL"}

    # (2) RESTRINGIDA: solo si creado_por_id == io, OR io in usuarios_autorizados_ids, OR admin/auditor
    rest_filt: dict[str, Any] = {"tipo": "RESTRINGIDA", "$or": []}
    if user_oid:
        rest_filt["$or"].append({"creado_por_id": user_oid})
        rest_filt["$or"].append({"usuarios_autorizados_ids": user_oid})
    if _es_admin_o_auditor(user):
        # admin bypass: ve RESTRINGIDAs sin restriccion adicional (compliance)
        pass
    else:
        # no-admin: non vedeva RESTRINGIDA se non matcha creador / autorizados
        # (se $or è vuoto, il filtro non matcha niente -> fallback a filtro impossibile)
        if not rest_filt["$or"]:
            rest_filt["$or"].append({"_id": None})  # impossibile match

    filt["$or"] = [general_filt, rest_filt]
    filt["organizacion_id"] = org_oid
    filt["borrado_logico"] = {"$ne": True}
    return filt


def _permite_escribir_tipo(user: CurrentUser, tipo: TipoEtiqueta) -> bool:
    """Valida permiso según tipo: GENERAL requiere tag.write; RESTRINGIDA requiere tag.manage_restricted o super/admin."""
    if user.role == "superuser":
        return True
    if tipo == "GENERAL":
        # tag.write (evaluador, operativo, gestor_listas, etc.) o admin siempre
        return True  # dependencia require_permission("tag.write") ya verifica arriba en el route
    # tipo == RESTRINGIDA
    if _es_admin_o_auditor(user):
        return True
    # require_permission("tag.manage_restricted") está en el route create/update restricted
    return True


# ---------------------------------------------------------------------------
# ROUTES
# ---------------------------------------------------------------------------


@router.get(
    "",
    summary="Listar etiquetas GENERAL + RESTRINGIDA (scope usuario)",
    dependencies=[Depends(require_permission("tag.read"))],
)
async def list_tags(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    tipo: TipoEtiqueta | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
):
    filt_base: dict[str, Any] = {}
    if tipo:
        filt_base["tipo"] = tipo
    if q:
        import re
        rx = re.compile(re.escape(q), re.IGNORECASE)
        filt_base["$or"] = [{"codigo": rx}, {"nombre": rx}]
    filt = _filtro_etiquetas_lectura(user, filt_base)
    cur = db["catalogo_etiquetas"].find(filt).sort([("tipo", 1), ("nombre", 1)]).skip(skip).limit(limit)
    docs = [jsonable(d) for d in await cur.to_list(length=limit)]
    total = await db["catalogo_etiquetas"].count_documents(filt)
    return {"items": docs, "count": len(docs), "total": total, "limit": limit, "skip": skip}


@router.get(
    "/{tag_id}",
    summary="Obtener etiqueta por ID",
    dependencies=[Depends(require_permission("tag.read"))],
)
async def get_tag(
    tag_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    tid = _oid(tag_id)
    if not tid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="tag_id invalido")
    filt = _filtro_etiquetas_lectura(user, {"_id": tid})
    doc = await db["catalogo_etiquetas"].find_one(filt)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Etiqueta no encontrada o fuera de scope")
    return jsonable(doc)


@router.post(
    "",
    summary="Crear etiqueta GENERAL (tag.write) o RESTRINGIDA (tag.manage_restricted)",
)
async def create_tag(
    body: CreateTagRequest,
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    # Validación permiso según tipo (doble guardia)
    if body.tipo == "GENERAL":
        dec = await autorizar(db, getattr(request.state, "authz_ctx", None) or await hydrate_user_from_db(db, _oid(user.id)), "tag.write", proposito="ACTUAR")
        if not dec.get("concedido", False):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail=dec.get("motivo") or "Permiso tag.write requerido para GENERAL")
    else:  # RESTRINGIDA
        dec = await autorizar(db, getattr(request.state, "authz_ctx", None) or await hydrate_user_from_db(db, _oid(user.id)), "tag.manage_restricted", proposito="ACTUAR")
        if not dec.get("concedido", False) and not _es_admin_o_auditor(user) and user.role != "superuser":
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail=dec.get("motivo") or "Permiso tag.manage_restricted requerido para RESTRINGIDA")

    org_oid = _oid(user.organizacion_id or user.tenant)
    now = datetime.utcnow().isoformat()
    doc = {
        "codigo": body.codigo.strip().lower(),
        "nombre": body.nombre.strip(),
        "tipo": body.tipo,
        "descripcion": body.descripcion,
        "color_hex": body.color_hex,
        "tenantId": _oid(user.tenant),
        "organizacion_id": org_oid,
        "creado_por_id": _oid(user.id),
        "creado_por_email": user.email,
        "usuarios_autorizados_ids": [_oid(user.id)] if body.tipo == "RESTRINGIDA" else [],
        "borrado_logico": False,
        "creado_en": now,
        "actualizado_en": now,
    }
    try:
        res = await db["catalogo_etiquetas"].insert_one(doc)
    except Exception as e:
        # Duplicated key (organizacion_id+codigo)
        if "duplicate key error" in str(e).lower() or "E11000" in str(e):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail=f"El código '{body.codigo}' ya existe en esta organización (índice único org+codigo).",
            )
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"DB error create_tag: {e}")
    doc["_id"] = res.inserted_id
    try:
        asyncio.create_task(
            registrar_auditoria(
                db, getattr(request.state, "authz_ctx", None) or await hydrate_user_from_db(db, _oid(user.id)),
                "tag.create", dec,
                recurso={"entidad_tipo": "catalogo_etiquetas", "entidad_id": str(res.inserted_id), "tipo": body.tipo, "codigo": body.codigo},
            )
        )
    except Exception:
        pass
    return {"ok": True, "id": str(res.inserted_id), "codigo": body.codigo, "tipo": body.tipo, "creado_en": now}


@router.put(
    "/{tag_id}",
    summary="Modificar etiqueta (solo creador o admin; RESTRINGIDA requiere manage_restricted)",
)
async def update_tag(
    tag_id: str,
    body: UpdateTagRequest,
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    tid = _oid(tag_id)
    if not tid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="tag_id invalido")
    doc = await db["catalogo_etiquetas"].find_one({"_id": tid})
    if not doc or doc.get("borrado_logico"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Etiqueta no encontrada")
    if user.role != "superuser" and str(doc.get("organizacion_id", "")) != str(user.organizacion_id or user.tenant):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Etiqueta fuera de organización")

    # Permiso según tipo
    creador_id = doc.get("creado_por_id")
    es_creador = creador_id and str(creador_id) == user.id
    admin = _es_admin_o_auditor(user) or user.role == "superuser"

    if doc["tipo"] == "GENERAL":
        # Permitido creador o admin o tag.write
        if not (es_creador or admin):
            dec = await autorizar(db, getattr(request.state, "authz_ctx", None) or await hydrate_user_from_db(db, _oid(user.id)), "tag.write", proposito="ACTUAR")
            if not dec.get("concedido", False):
                raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Requiere creador o admin o tag.write")
    else:  # RESTRINGIDA
        if not (admin or es_creador):
            dec = await autorizar(db, getattr(request.state, "authz_ctx", None) or await hydrate_user_from_db(db, _oid(user.id)), "tag.manage_restricted", proposito="ACTUAR")
            if not dec.get("concedido", False):
                raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Requiere admin o creador o tag.manage_restricted para RESTRINGIDA")

    sets: dict[str, Any] = {"actualizado_en": datetime.utcnow().isoformat()}
    if body.nombre is not None:
        sets["nombre"] = body.nombre.strip()
    if body.descripcion is not None:
        sets["descripcion"] = body.descripcion
    if body.color_hex is not None:
        sets["color_hex"] = body.color_hex
    await db["catalogo_etiquetas"].update_one({"_id": tid}, {"$set": sets})
    try:
        asyncio.create_task(
            registrar_auditoria(
                db, getattr(request.state, "authz_ctx", None) or await hydrate_user_from_db(db, _oid(user.id)),
                "tag.update", None,
                recurso={"entidad_tipo": "catalogo_etiquetas", "entidad_id": tag_id, "tipo": doc["tipo"], "codigo": doc.get("codigo")},
            )
        )
    except Exception:
        pass
    return {"ok": True}


@router.delete(
    "/{tag_id}",
    summary="Borrado lógico etiqueta (solo admin o creador; restricted requiere manage_restricted)",
)
async def delete_tag(
    tag_id: str,
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    tid = _oid(tag_id)
    if not tid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="tag_id invalido")
    doc = await db["catalogo_etiquetas"].find_one({"_id": tid})
    if not doc or doc.get("borrado_logico"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Etiqueta no encontrada")
    if user.role != "superuser" and str(doc.get("organizacion_id", "")) != str(user.organizacion_id or user.tenant):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Etiqueta fuera de organización")

    creador_id = doc.get("creado_por_id")
    es_creador = creador_id and str(creador_id) == user.id
    admin = _es_admin_o_auditor(user) or user.role == "superuser"

    if doc["tipo"] == "GENERAL":
        perm_needed = "tag.write"
    else:
        perm_needed = "tag.manage_restricted"
    if not (admin or es_creador):
        dec = await autorizar(db, getattr(request.state, "authz_ctx", None) or await hydrate_user_from_db(db, _oid(user.id)), perm_needed, proposito="ACTUAR")
        if not dec.get("concedido", False):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail=f"Requiere admin, creador o permiso {perm_needed}")

    now = datetime.utcnow().isoformat()
    await db["catalogo_etiquetas"].update_one(
        {"_id": tid},
        {"$set": {"borrado_logico": True, "borrado_en": now, "borrado_por_id": _oid(user.id), "actualizado_en": now}},
    )
    try:
        asyncio.create_task(
            registrar_auditoria(
                db, getattr(request.state, "authz_ctx", None) or await hydrate_user_from_db(db, _oid(user.id)),
                "tag.delete", None,
                recurso={"entidad_tipo": "catalogo_etiquetas", "entidad_id": tag_id, "tipo": doc["tipo"], "codigo": doc.get("codigo")},
            )
        )
    except Exception:
        pass
    return {"ok": True, "borrado_en": now}


@router.post(
    "/{tag_id}/grant",
    summary="Otorgar / quitar visibilidad etiqueta RESTRINGIDA a usuario (permiso tag.grant)",
    dependencies=[Depends(require_permission("tag.grant"))],
)
async def grant_restringida_tag(
    tag_id: str,
    body: GrantTagRequest,
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    tid = _oid(tag_id)
    usr_oid = _oid(body.usuario_id)
    if not (tid and usr_oid):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="tag_id o usuario_id invalido")
    doc = await db["catalogo_etiquetas"].find_one({"_id": tid})
    if not doc or doc.get("borrado_logico"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Etiqueta no encontrada")
    if doc["tipo"] != "RESTRINGIDA":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Grant solo aplica a etiquetas tipo RESTRINGIDA")
    if user.role != "superuser" and str(doc.get("organizacion_id", "")) != str(user.organizacion_id or user.tenant):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Etiqueta fuera de organización")
    # Validar que usuario_objetivo existe nella org
    target_user = await db["users"].find_one({"_id": usr_oid})
    if not target_user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Usuario objetivo no existe")
    if str(target_user.get("tenant") or target_user.get("tenantId") or target_user.get("organizacion_id") or "") != str(
        user.tenant
    ) and user.role != "superuser":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Usuario objetivo pertenece a otra organización")

    now = datetime.utcnow().isoformat()
    if body.accion == "AGREGAR":
        await db["catalogo_etiquetas"].update_one(
            {"_id": tid},
            {"$addToSet": {"usuarios_autorizados_ids": usr_oid}, "$set": {"actualizado_en": now}},
        )
    else:  # QUITAR
        await db["catalogo_etiquetas"].update_one(
            {"_id": tid},
            {"$pull": {"usuarios_autorizados_ids": usr_oid}, "$set": {"actualizado_en": now}},
        )
    try:
        asyncio.create_task(
            registrar_auditoria(
                db, getattr(request.state, "authz_ctx", None) or await hydrate_user_from_db(db, _oid(user.id)),
                "tag.grant", None,
                recurso={"entidad_tipo": "catalogo_etiquetas", "entidad_id": tag_id, "accion": body.accion, "usuario_objetivo": body.usuario_id},
            )
        )
    except Exception:
        pass
    return {"ok": True, "accion": body.accion, "usuario_id": body.usuario_id, "actualizado_en": now}
