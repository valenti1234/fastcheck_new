"""Router Export V2 — Exportación multinivel terceros (CERTIFICADO vs INFORME · Bloque 2.3 HU-15)."""
from __future__ import annotations

import asyncio
import time
from typing import Annotated, Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from fastcheck_api.app.api.dependencies import CurrentUser, get_current_user
from fastcheck_api.app.core.mongodb import get_db
from fastcheck_api.app.services.authz_service import (
    AuthzDecision,
    EnrichedUser,
    NIVEL_INFO_ORDEN,
    NivelInfo,
    autorizar,
    hydrate_user_from_db,
)
from fastcheck_api.app.services.proyeccion_service import (
    proyectar,
    proyectar_nivel_especifico_para_accion,
)
from fastcheck_api.app.utils.mongo import jsonable, to_object_id

router = APIRouter(prefix="/third-parties", tags=["third-parties-export-v2"])


TipoExport = Literal["CERTIFICADO", "INFORME"]

EXPORT_PERMISOS: dict[TipoExport, str] = {
    "CERTIFICADO": "export.certificate",
    "INFORME": "export.detail",
}

EXPORT_NIVEL_MAX: dict[TipoExport, NivelInfo] = {
    "CERTIFICADO": "RESUMEN_NO_SENSIBLE",
    "INFORME": "DETALLE_RIESGO",
}


def _oid(s) -> ObjectId | None:
    return to_object_id(s) if s else None


def _nivel_export_final(
    decision_nivel: NivelInfo,
    tipo: TipoExport,
) -> NivelInfo:
    """Clampea el nivel autorizado al MAXIMO permitido per tipo export."""
    n_dec = NIVEL_INFO_ORDEN.get(decision_nivel, 1)
    n_max = NIVEL_INFO_ORDEN.get(EXPORT_NIVEL_MAX[tipo], 2)
    n_final: int = min(n_dec, n_max)
    for cod, ordv in NIVEL_INFO_ORDEN.items():
        if ordv == n_final:
            return cod
    return decision_nivel


async def _registrar_export_auditoria(
    db: AsyncIOMotorDatabase,
    user: EnrichedUser,
    accion_permiso: str,
    decision: AuthzDecision,
    *,
    tercero_id: str,
    tipo_export: TipoExport,
) -> None:
    try:
        doc = {
            "organizacion_id": user.organizacion_id,
            "usuario_id": user.user_id,
            "usuario_email": "",
            "accion": "export.tercero",
            "accion_permiso": accion_permiso,
            "tipo_export": tipo_export,
            "entidad_tipo": "evaluationresults",
            "entidad_id": ObjectId(tercero_id),
            "ts": time.time(),
            "permitir": decision.permitir,
            "paso_fallido": decision.paso_fallido,
            "motivo_denegacion": (decision.motivo_denegacion or "")[:500],
            "permiso_origen": decision.permiso_efectivo_origen,
            "scope_match": decision.scope_match,
            "nivel_info_autorizado": decision.nivel_info_autorizado,
            "nivel_info_export_clampeado": EXPORT_NIVEL_MAX[tipo_export],
            "origen": "API_AUTHZ_V2_EXPORT",
        }
        await db["auditoria_log"].insert_one(doc)
    except Exception:
        # Nunca bloquear por fallo de auditoría.
        pass


class ExportResponse(BaseModel):
    tipo_export: TipoExport
    nivel_info_aplicado: str
    nivel_info_autorizado_original: str
    permiso_origen: str | None
    scope_match: object
    pn_gate: bool
    item: dict
    auditoria_id: str | None = None
    meta: dict = {}


@router.get(
    "/{doc_id}/export",
    summary="Exportar tercero por ID — CERTIFICADO (≤N2) o INFORME (≤N4) — auditoria export.tercero",
)
async def export_third_party(
    doc_id: str,
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    tipo: TipoExport = Query(
        default="CERTIFICADO",
        description="CERTIFICADO = nivel ≤ 2 RESUMEN_NO_SENSIBLE · INFORME = nivel ≤ 4 INFO_NO_SENSIBLE",
    ),
):
    enriched: EnrichedUser | None = getattr(request.state, "authz_ctx", None)
    if not enriched and user.authz_v2_migrated:
        enriched = await hydrate_user_from_db(db, _oid(user.id))
    if not enriched:
        raise HTTPException(
            status.HTTP_424_FAILED_DEPENDENCY,
            detail="Authz V2 context missing (usuario non migrato o force_v2_only off)",
        )

    try:
        did = ObjectId(doc_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="doc_id no ObjectId")

    doc = await db["evaluationresults"].find_one({"_id": did})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tercero no encontrado")
    if user.role != "superuser" and str(doc.get("tenantId", "")) != str(user.tenant):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tercero no encontrado")

    categoria = doc.get("tipo_tercero_categoria")
    accion = EXPORT_PERMISOS[tipo]
    nivel_req = proyectar_nivel_especifico_para_accion(accion)

    decision = await autorizar(
        db,
        enriched,
        accion,
        recurso={
            "organizacion_id": doc.get("organizacion_id"),
            "creador_id": doc.get("createdBy") or doc.get("tenantId"),
            "unidad_id": doc.get("unidad_id"),
            "area_id": doc.get("area_id"),
            "pais_id": doc.get("pais_id"),
            "entidad_tipo": "evaluationresults",
            "entidad_id": str(did),
        },
        proposito="EXPORTAR",
        nivel_requerido=nivel_req,
        categoria_tercero=categoria,
    )

    pn_gate = bool(decision.pn_gate or user.pn_authorized)

    # Auditoria async (huella immutable).
    auditoria_id: str | None = None
    try:
        await _registrar_export_auditoria(
            db, enriched, accion, decision,
            tercero_id=str(did), tipo_export=tipo,
        )
        auditoria_id = "enviado"
    except Exception:
        pass

    if not decision.permitir:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail={
            "paso_fallido": decision.paso_fallido,
            "motivo": decision.motivo_denegacion,
            "permiso_requerido": accion,
        })

    # Clampeo al MAXIMO permitido para tipo export (regla Bloq2.3).
    nivel_final: NivelInfo = _nivel_export_final(decision.nivel_info_autorizado, tipo)
    es_sensible_aut = bool(user.role == "superuser" and pn_gate)
    projected = proyectar(
        jsonable(doc),
        nivel_final,
        pn_gate=pn_gate,
        es_sensible_autorizado=es_sensible_aut,
    )

    return ExportResponse(
        tipo_export=tipo,
        nivel_info_aplicado=nivel_final,
        nivel_info_autorizado_original=decision.nivel_info_autorizado,
        permiso_origen=decision.permiso_efectivo_origen,
        scope_match=decision.scope_match,
        pn_gate=pn_gate,
        item=projected,
        auditoria_id=auditoria_id,
        meta={
            "nivel_orden": NIVEL_INFO_ORDEN.get(nivel_final, 1),
            "nivel_max_tipo": EXPORT_NIVEL_MAX[tipo],
            "accion_permiso": accion,
            "categoria_tercero": categoria,
        },
    )
