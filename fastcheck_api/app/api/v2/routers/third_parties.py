"""Router Third-Parties V2 — búsqueda con proyección 5 niveles + gate PN."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from fastcheck_api.app.api.dependencies import CurrentUser, get_current_user
from fastcheck_api.app.core.mongodb import get_db
from fastcheck_api.app.services.authz_service import (
    AuthzDecision,
    EnrichedUser,
    autorizar,
    hydrate_user_from_db,
    registrar_auditoria,
)
from fastcheck_api.app.services.proyeccion_service import (
    proyectar,
    proyectar_lista,
    proyectar_nivel_especifico_para_accion,
)
from fastcheck_api.app.services.servicio_timeline_tercero import (
    construir_timeline_tercero,
)
from fastcheck_api.app.utils.mongo import jsonable, sanitize_rut


router = APIRouter(prefix="/third-parties", tags=["third-parties-v2"])


class SearchRequest(BaseModel):
    rut: str | None = None
    nombre: str | None = None
    categoria_tercero: str | None = Field(default=None,
                                          description="'PJ_NACIONAL','PJ_EXTRANJERA','PN_NACIONAL','PN_EXTRANJERA'")
    semaphore: str | None = None
    limit: int = Field(default=50, ge=1, le=200)
    skip: int = Field(default=0, ge=0)


@router.get("", summary="Buscar terceros (evaluationresults + proyección por nivel info)")
async def search_third_parties(
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    rut: str | None = Query(default=None),
    nombre: str | None = Query(default=None),
    categoria_tercero: str | None = Query(default=None),
    semaphore: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    skip: int = Query(default=0, ge=0),
):
    from bson import ObjectId
    enriched: EnrichedUser | None = getattr(request.state, "authz_ctx", None)
    if enriched is None and user.authz_v2_migrated:
        enriched = await hydrate_user_from_db(db, ObjectId(user.id))
    if not user.authz_v2_migrated or enriched is None:
        # fallback: return raw per utenti non migrati (solo se passa legacy)
        raise HTTPException(status.HTTP_424_FAILED_DEPENDENCY,
                            detail="Utente non migrato a Authz V2 o contesto mancante")
    accion = "fastcheck.query"
    nivel_req = proyectar_nivel_especifico_para_accion(accion)
    decision = await autorizar(
        db, enriched, accion,
        recurso={"organizacion_id": ObjectId(user.organizacion_id) if user.organizacion_id else None,
                 "creador_id": ObjectId(user.id)},
        proposito="VER",
        nivel_requerido=nivel_req,
        categoria_tercero=categoria_tercero,
    )
    import asyncio
    try:
        asyncio.create_task(registrar_auditoria(db, enriched, accion, decision))
    except Exception:
        pass
    if not decision.permitir:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail={
            "paso_fallido": decision.paso_fallido,
            "motivo": decision.motivo_denegacion,
            "engine": "AUTHZ_V2_7PASOS",
        })

    filt: dict = {"tenantId": ObjectId(user.tenant)} if user.role != "superuser" else {}
    if rut:
        filt["rut_clean"] = sanitize_rut(rut) or sanitize_rut(rut).replace(".", "").replace("-", "")
    if nombre:
        filt["$or"] = [
            {"razon_social": {"$regex": nombre, "$options": "i"}},
            {"nombre": {"$regex": nombre, "$options": "i"}},
        ]
    if categoria_tercero:
        filt["tipo_tercero_categoria"] = categoria_tercero
    if semaphore:
        filt["riskAssessment.semaphore"] = semaphore

    cur = db["evaluationresults"].find(filt).sort("createdAt", -1).skip(skip).limit(limit)
    docs = [jsonable(d) for d in await cur.to_list(length=limit)]

    projected = proyectar_lista(
        docs,
        decision.nivel_info_autorizado,
        pn_gate=decision.pn_gate or user.pn_authorized,
        es_sensible_autorizado=(user.role == "superuser"),
    )

    total = await db["evaluationresults"].count_documents(filt)
    return {
        "items": projected,
        "count": len(projected),
        "total": total,
        "limit": limit,
        "skip": skip,
        "nivel_info_aplicado": decision.nivel_info_autorizado,
        "pn_gate": decision.pn_gate or user.pn_authorized,
    }


@router.get(
    "/{doc_id}",
    summary="Tercero por ID (proyección por nivel de info + gate PN)",
)
async def get_third_party(
    doc_id: str,
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    from bson import ObjectId
    enriched: EnrichedUser | None = getattr(request.state, "authz_ctx", None)
    if not enriched and user.authz_v2_migrated:
        enriched = await hydrate_user_from_db(db, ObjectId(user.id))
    if not enriched:
        raise HTTPException(status.HTTP_424_FAILED_DEPENDENCY, detail="Authz V2 context missing")
    try:
        did = ObjectId(doc_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="doc_id non ObjectId")
    doc = await db["evaluationresults"].find_one({"_id": did})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Terzo non trovato")
    if user.role != "superuser" and str(doc.get("tenantId", "")) != str(user.tenant):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Terzo non trovato")
    categoria = doc.get("tipo_tercero_categoria")
    decision = await autorizar(
        db, enriched, "fastcheck.query",
        recurso={
            "organizacion_id": doc.get("organizacion_id"),
            "creador_id": doc.get("createdBy") or doc.get("tenantId"),
            "unidad_id": doc.get("unidad_id"),
            "area_id": doc.get("area_id"),
            "pais_id": doc.get("pais_id"),
        },
        proposito="VER",
        nivel_requerido=proyectar_nivel_especifico_para_accion("fastcheck.query"),
        categoria_tercero=categoria,
    )
    import asyncio
    try:
        asyncio.create_task(registrar_auditoria(
            db, enriched, "fastcheck.query", decision,
            recurso={"entidad_tipo": "evaluationresults", "entidad_id": doc_id},
        ))
    except Exception:
        pass
    if not decision.permitir:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail={
            "paso_fallido": decision.paso_fallido,
            "motivo": decision.motivo_denegacion,
        })
    out = proyectar(
        jsonable(doc),
        decision.nivel_info_autorizado,
        pn_gate=decision.pn_gate or user.pn_authorized,
        es_sensible_autorizado=(
            user.role == "superuser" and user.pn_authorized
        ),
    )
    return {
        "item": out,
        "nivel_info_aplicado": decision.nivel_info_autorizado,
        "pn_gate": decision.pn_gate or user.pn_authorized,
        "permiso_origen": decision.permiso_efectivo_origen,
        "scope_match": decision.scope_match,
    }


@router.get(
    "/{doc_id}/history",
    summary="Timeline completo tercero (4 fuentes orden ASC + projection nivel info)",
)
async def get_third_party_history(
    doc_id: str,
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    limit: int = Query(default=100, ge=1, le=500),
    cursor_last_ts: float | None = Query(default=None, ge=0,
                                         description="Cursor pagination: last_ts del ultimo evento pagina previa"),
    cursor_last_id: str | None = Query(default=None,
                                       description="Cursor pagination: last_id del ultimo evento pagina previa"),
):
    from bson import ObjectId
    enriched: EnrichedUser | None = getattr(request.state, "authz_ctx", None)
    if not enriched and user.authz_v2_migrated:
        enriched = await hydrate_user_from_db(db, ObjectId(user.id))
    if not enriched:
        raise HTTPException(status.HTTP_424_FAILED_DEPENDENCY, detail="Authz V2 context missing")
    try:
        did = ObjectId(doc_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="doc_id non ObjectId")
    doc = await db["evaluationresults"].find_one({"_id": did})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Terzo non trovato")
    if user.role != "superuser" and str(doc.get("tenantId", "")) != str(user.tenant):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Terzo non trovato")
    categoria = doc.get("tipo_tercero_categoria")
    # Timeline = HISTORICO SOLO LECTURA → NO autorizar fastcheck.query (PN gate + pool
    # credits — sono per NUOVE valutazioni). Privacy già verificata riga 216:
    #   SUPERUSER → INFO_COMPLETA N5 + SENSIBLES OK
    #   UTENTE STANDARD → DETALLE_RIESGO N4
    _nivel: str = "INFO_COMPLETA" if user.role == "superuser" else "DETALLE_RIESGO"
    _pn_ok: bool = bool(user.role == "superuser" and user.pn_authorized)
    _sensible: bool = _pn_ok
    _scope = ("SUPERUSER_WILDCARD_SKIP_SCOPE"
              if user.role == "superuser"
              else ("TENANT_MATCH_OWN_DOC"
                    if str(doc.get("tenantId", "")) == str(user.tenant)
                    else "NO_MATCH"))
    _origen = "TIMELINE_READONLY_VIEW"
    # Decision dummy compatta x auditoría
    decision = AuthzDecision(
        permitir=True, paso_fallido=None, motivo_denegacion="",
        permiso_efectivo_origen=_origen, nivel_info_autorizado=_nivel,
        pn_gate=_pn_ok, scope_match=_scope,
    )
    import asyncio as _asyncio_tl
    try:
        _asyncio_tl.create_task(registrar_auditoria(
            db, enriched, "timeline.tercero.history", decision,
            recurso={"entidad_tipo": "evaluationresults", "entidad_id": doc_id},
        ))
    except Exception:
        pass
    timeline = await construir_timeline_tercero(
        db, doc,
        nivel_autorizado=_nivel,
        pn_gate_autorizado=_pn_ok,
        sensible_autorizado=_sensible,
        limit=limit,
        cursor_last_ts=cursor_last_ts,
        cursor_last_id=cursor_last_id,
    )
    timeline["permiso_origen"] = _origen
    timeline["scope_match"] = _scope
    return jsonable(timeline)
