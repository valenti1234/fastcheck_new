"""
Servicio Timeline Tercero (HU-17 · Bloque 2.6 FASE2).
Agrega 4 fuentes logicas de eventos de un tercero y ordena por timestamp ASC.
Projection por nivel_info autorizado (N1 solo titulo/tipo, N5 cuerpo completo).

Fuentes soportadas (8 tipos evento):
  (A) auditoria_log entidad_tipo=evaluationresults entidad_id=tercero_id
      → export.certificate, eval.escalate, tag.use, admin.structure,
         admin.users, party.query.pn, gobierno.riesgo.*, fastcheck.query
  (B) evaluationresults.evaluationsHistory array interno
  (C) usernotes legacy filtrado por rut del tercero + tenantId
  (D) comentarios_v2 (staging N=0) por entidad_id=tercero_id
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from bson import ObjectId

from fastcheck_api.app.utils.mongo import jsonable

TIPOS_EVENTO_HUMANOS: dict[str, str] = {
    "CONSULTA_CREADA": "Consulta FastCheck creada",
    "COMMENT_LEGACY": "Comentario (legacy usernotes)",
    "COMMENT_V2": "Comentario",
    "TAG_USE": "Etiqueta aplicada/removida",
    "EXPORT_CERTIFICATE": "Exportación certificado",
    "EXPORT_INFORME": "Exportación informe",
    "ESCALAMIENTO": "Solicitud escalamiento",
    "ADMIN_STRUCTURE": "Cambio estructura organizacional",
    "ADMIN_USERS": "Cambio usuarios (asignación/remoción)",
    "PARTY_QUERY_PN": "Consulta PN persona natural",
    "GOBIERNO_RIESGO": "Cambio gobierno riesgo (parámetros/listas/umbrales)",
    "EVAL_HISTORY": "Evento evaluación interna",
    "FASTCHECK_QUERY": "Consulta tercero (v2)",
    "CAPACIDAD_POOL": "Evento créditos pool",
    "DECISION": "Decisión evaluación (aprobar/rechazar)",
    "OTRO": "Evento del sistema",
}

NIVEL_INFO_INT: dict[str, int] = {
    "RESULTADO_GENERAL": 1,
    "RESUMEN_NO_SENSIBLE": 2,
    "INFO_NO_SENSIBLE": 3,
    "DETALLE_RIESGO": 4,
    "INFO_COMPLETA": 5,
}

ACCION_A_TIPO: dict[str, str] = {
    "export.certificate": "EXPORT_CERTIFICATE",
    "eval.escalate": "ESCALAMIENTO",
    "tag.use": "TAG_USE",
    "admin.structure": "ADMIN_STRUCTURE",
    "admin.users": "ADMIN_USERS",
    "party.query.pn": "PARTY_QUERY_PN",
    "fastcheck.query": "FASTCHECK_QUERY",
}

_CAMPO_SENSIBLE_NIVEL_MIN = 5


def _accion_a_tipo(accion: str) -> str:
    if accion in ACCION_A_TIPO:
        return ACCION_A_TIPO[accion]
    if accion.startswith("gobierno.riesgo"):
        return "GOBIERNO_RIESGO"
    if accion.startswith("export."):
        return "EXPORT_INFORME"
    if accion.startswith("capacidad.pool"):
        return "CAPACIDAD_POOL"
    return "OTRO"


def _ts_from_datetime(dt: Any) -> float:
    if isinstance(dt, datetime):
        return dt.timestamp()
    if isinstance(dt, (int, float)):
        return float(dt)
    if isinstance(dt, str):
        try:
            return float(dt)
        except Exception:
            return 0.0
    return 0.0


def _titulo_por_tipo(tipo_evento: str, default: str) -> str:
    return TIPOS_EVENTO_HUMANOS.get(tipo_evento, default or "Evento")


def _nivel_int(nivel_autorizado: str) -> int:
    return NIVEL_INFO_INT.get(nivel_autorizado, 1)


def _aplicar_proyeccion_evento(
    evento_raw: dict[str, Any],
    nivel_autorizado: str,
    *,
    pn_gate_autorizado: bool = False,
    sensible_autorizado: bool = False,
) -> dict[str, Any]:
    """Projection por nivel: N1 = solo base/titulo; N≥4 = cuerpo completo; N≥5 = SENSIBLES permitidos."""
    ni = _nivel_int(nivel_autorizado)
    base: dict[str, Any] = {
        "id": str(evento_raw["_id"]) if evento_raw.get("_id") else evento_raw.get("id", ""),
        "tipo_evento": evento_raw["tipo_evento"],
        "titulo": _titulo_por_tipo(evento_raw["tipo_evento"], evento_raw.get("titulo", "")),
        "ts": evento_raw["ts"],
        "ts_humano": evento_raw.get("ts_humano") or (
            datetime.utcfromtimestamp(evento_raw["ts"]).isoformat() + "Z" if evento_raw["ts"] else ""
        ),
        "fuente": evento_raw.get("fuente", "auditoria_log"),
    }
    if ni <= 1:
        return base

    if ni >= 2:
        base.update({
            "usuario": evento_raw.get("usuario"),
            "usuario_email": evento_raw.get("usuario_email"),
            "organizacion_id": str(evento_raw["organizacion_id"]) if evento_raw.get("organizacion_id") else None,
            "tercero_id_ref": str(evento_raw["tercero_id"]) if evento_raw.get("tercero_id") else None,
            "rut": evento_raw.get("rut"),
            "nivel_info_requerido": evento_raw.get("nivel_info_requerido"),
            "accion": evento_raw.get("accion"),
            "permitir": evento_raw.get("permitir"),
        })
    if ni >= 3:
        base.update({
            "motivo": evento_raw.get("motivo") or evento_raw.get("comentario"),
            "tags": evento_raw.get("tags"),
            "estado": evento_raw.get("estado"),
            "permiso_origen": evento_raw.get("permiso_origen"),
            "paso_fallido": evento_raw.get("paso_fallido"),
        })
    if ni >= 4:
        base.update({
            "cuerpo": evento_raw.get("cuerpo") or evento_raw.get("detalle"),
            "campos_adicionales": evento_raw.get("campos_adicionales"),
            "valor_anterior": evento_raw.get("valor_anterior"),
            "valor_nuevo": evento_raw.get("valor_nuevo"),
        })
    if ni >= 5 and sensible_autorizado:
        sensible = evento_raw.get("campos_sensibles")
        if sensible is not None:
            base["campos_sensibles"] = sensible
        if evento_raw.get("pn_gate_aplicado") and pn_gate_autorizado:
            base["pn_gate_aplicado"] = True
    return base


def _evento_desde_auditoria_log(d: dict[str, Any], doc_tercero: dict[str, Any]) -> dict[str, Any] | None:
    ts = d.get("ts") or _ts_from_datetime(d.get("_id").generation_time) if d.get("_id") else 0.0
    if not ts:
        ts = _ts_from_datetime(d.get("_id").generation_time) if isinstance(d.get("_id"), ObjectId) else 0.0
    tipo = _accion_a_tipo(d.get("accion", "OTRO"))
    return {
        "_id": str(d["_id"]) if d.get("_id") else f"audit-{hash(str(d))}",
        "fuente": "auditoria_log",
        "tipo_evento": tipo,
        "titulo": "",
        "ts": float(ts),
        "ts_humano": datetime.utcfromtimestamp(float(ts)).isoformat() + "Z" if ts else "",
        "accion": d.get("accion"),
        "usuario": d.get("usuario_id"),
        "usuario_email": d.get("usuario_email"),
        "organizacion_id": d.get("organizacion_id") or doc_tercero.get("organizacion_id"),
        "tercero_id": doc_tercero.get("_id"),
        "rut": doc_tercero.get("rut"),
        "nivel_info_requerido": d.get("nivel_info_autorizado"),
        "permitir": d.get("permitir"),
        "permiso_origen": d.get("permiso_origen"),
        "paso_fallido": d.get("paso_fallido"),
        "motivo": d.get("motivo_denegacion"),
        "campos_adicionales": {"origen": d.get("origen"), "scope_match": d.get("scope_match")},
        "valor_anterior": d.get("valor_anterior"),
        "valor_nuevo": d.get("valor_nuevo"),
        "campos_sensibles": d.get("campos_sensibles"),
        "pn_gate_aplicado": d.get("pn_gate_aplicado"),
    }


def _evento_desde_eval_history(d: dict[str, Any], doc_tercero: dict[str, Any], idx: int) -> dict[str, Any] | None:
    ts_raw = d.get("fecha") or d.get("timestamp") or d.get("createdAt")
    ts = _ts_from_datetime(ts_raw) or _ts_from_datetime(doc_tercero.get("createdAt"))
    return {
        "_id": f"eh-{doc_tercero.get('_id')}-{idx}",
        "fuente": "evaluationsHistory",
        "tipo_evento": "EVAL_HISTORY",
        "titulo": str(d.get("accion") or d.get("estado") or "Evento evaluación"),
        "ts": float(ts),
        "ts_humano": datetime.utcfromtimestamp(float(ts)).isoformat() + "Z" if ts else "",
        "accion": d.get("accion"),
        "usuario": d.get("evaluador") or d.get("usuario_id") or doc_tercero.get("createdBy"),
        "usuario_email": d.get("email"),
        "organizacion_id": doc_tercero.get("organizacion_id"),
        "tercero_id": doc_tercero.get("_id"),
        "rut": doc_tercero.get("rut"),
        "estado": d.get("estado"),
        "motivo": d.get("comentario") or d.get("justificacion"),
        "cuerpo": {k: v for k, v in d.items() if k not in {"fecha", "timestamp", "createdAt"}},
    }


def _evento_desde_usernote(d: dict[str, Any], doc_tercero: dict[str, Any]) -> dict[str, Any] | None:
    ts = _ts_from_datetime(d.get("createdAt")) or _ts_from_datetime(d.get("updatedAt"))
    return {
        "_id": str(d["_id"]) if d.get("_id") else None,
        "fuente": "usernotes_legacy",
        "tipo_evento": "COMMENT_LEGACY",
        "titulo": "Nota usuario (legacy)",
        "ts": float(ts),
        "ts_humano": datetime.utcfromtimestamp(float(ts)).isoformat() + "Z" if ts else "",
        "usuario": d.get("userId"),
        "organizacion_id": doc_tercero.get("organizacion_id"),
        "tercero_id": doc_tercero.get("_id"),
        "rut": d.get("rut") or doc_tercero.get("rut"),
        "tags": d.get("tags"),
        "motivo": None,
        "cuerpo": d.get("note"),
    }


def _evento_desde_comentario_v2(d: dict[str, Any], doc_tercero: dict[str, Any]) -> dict[str, Any] | None:
    ts = _ts_from_datetime(d.get("creado_en") or d.get("createdAt") or d.get("ts"))
    return {
        "_id": str(d["_id"]) if d.get("_id") else None,
        "fuente": "comentarios_v2",
        "tipo_evento": "COMMENT_V2",
        "titulo": "Comentario",
        "ts": float(ts),
        "ts_humano": datetime.utcfromtimestamp(float(ts)).isoformat() + "Z" if ts else "",
        "usuario": d.get("autor_id") or d.get("usuario_id") or d.get("userId"),
        "usuario_email": d.get("autor_email"),
        "organizacion_id": doc_tercero.get("organizacion_id"),
        "tercero_id": doc_tercero.get("_id"),
        "rut": doc_tercero.get("rut"),
        "estado": d.get("estado") or ("PUBLICADO" if d.get("publicado") else None),
        "nivel_info_requerido": d.get("nivel_info_requerido"),
        "pn_gate_aplicado": d.get("pn_gate_aplicado"),
        "campos_sensibles": d.get("sensible_payload"),
        "cuerpo": d.get("texto") or d.get("contenido"),
        "tags": d.get("etiquetas") or d.get("tags"),
    }


def _evento_consulta_creada(doc_tercero: dict[str, Any]) -> dict[str, Any]:
    ts = _ts_from_datetime(doc_tercero.get("createdAt"))
    return {
        "_id": f"creado-{doc_tercero.get('_id')}",
        "fuente": "evaluationresults",
        "tipo_evento": "CONSULTA_CREADA",
        "titulo": "Consulta creada",
        "ts": float(ts),
        "ts_humano": datetime.utcfromtimestamp(float(ts)).isoformat() + "Z" if ts else "",
        "usuario": doc_tercero.get("createdBy"),
        "organizacion_id": doc_tercero.get("organizacion_id"),
        "tercero_id": doc_tercero.get("_id"),
        "rut": doc_tercero.get("rut"),
        "cuerpo": {
            "razon_social": doc_tercero.get("razon_social") or doc_tercero.get("nombre"),
            "tipo_tercero": doc_tercero.get("tipo_tercero_categoria"),
            "semaforo": (doc_tercero.get("riskAssessment") or {}).get("semaphore"),
        },
        "campos_adicionales": {"tenantId": str(doc_tercero.get("tenantId")) if doc_tercero.get("tenantId") else None},
    }


async def construir_timeline_tercero(
    db,
    doc_tercero: dict[str, Any],
    *,
    nivel_autorizado: str,
    pn_gate_autorizado: bool = False,
    sensible_autorizado: bool = False,
    limit: int = 100,
    cursor_last_ts: float | None = None,
    cursor_last_id: str | None = None,
) -> dict[str, Any]:
    """Construye timeline unida de 4 fuentes + projection. Orden ASC timestamp (primary) + id (secondary).

    Paginacion cursor basada en (last_ts, last_id): devuelve evento tal que (ts, id) > (cursor_last_ts, cursor_last_id).
    """
    tercero_oid: ObjectId | None = doc_tercero.get("_id") if isinstance(doc_tercero.get("_id"), ObjectId) else (
        ObjectId(doc_tercero["_id"]) if doc_tercero.get("_id") else None
    )
    rut: str = doc_tercero.get("rut") or doc_tercero.get("rut_clean") or ""
    tenant_raw = doc_tercero.get("tenantId")
    tenant_oid: ObjectId | None = (
        tenant_raw if isinstance(tenant_raw, ObjectId) else (ObjectId(tenant_raw) if tenant_raw else None)
    )

    doc_tercero = jsonable(doc_tercero)

    raw_events: list[dict[str, Any]] = []

    # Fuente 0: Consulta creada (primer evento siempre si aplica)
    try:
        raw_events.append(_evento_consulta_creada(doc_tercero))
    except Exception:
        pass

    # Fuente 1: auditoria_log (entidad_tipo=evaluationresults, entidad_id=tercero_oid)
    if tercero_oid:
        try:
            filt_audit: dict[str, Any] = {
                "entidad_tipo": "evaluationresults",
                "entidad_id": tercero_oid,
            }
            docs_audit = await db["auditoria_log"].find(filt_audit).sort([("ts", 1), ("_id", 1)]).to_list(length=9999)
            for d in docs_audit:
                ev = _evento_desde_auditoria_log(d, doc_tercero)
                if ev:
                    raw_events.append(ev)
        except Exception:
            pass
        try:
            filt_audit2: dict[str, Any] = {
                "entidad_tipo": "evaluationresults",
                "entidad_id": str(tercero_oid),
            }
            docs_audit2 = await db["auditoria_log"].find(filt_audit2).sort([("ts", 1), ("_id", 1)]).to_list(length=9999)
            for d in docs_audit2:
                ev = _evento_desde_auditoria_log(d, doc_tercero)
                if ev:
                    raw_events.append(ev)
        except Exception:
            pass

    # Fuente 2: evaluationsHistory array interno
    eh = doc_tercero.get("evaluationsHistory") or []
    if isinstance(eh, list):
        for i, x in enumerate(eh):
            if isinstance(x, dict):
                ev = _evento_desde_eval_history(x, doc_tercero, i)
                if ev:
                    raw_events.append(ev)

    # Fuente 3: usernotes legacy (rut + tenantId)
    if rut and tenant_oid:
        try:
            docs_usernotes = await db["usernotes"].find({
                "$or": [{"rut": rut}, {"rut": rut.replace("-", "").replace(".", "")}],
                "tenantId": tenant_oid,
            }).sort([("createdAt", 1), ("_id", 1)]).to_list(length=9999)
            for d in docs_usernotes:
                ev = _evento_desde_usernote(d, doc_tercero)
                if ev:
                    raw_events.append(ev)
        except Exception:
            pass

    # Fuente 4: comentarios_v2 (entidad_id tercero)
    if tercero_oid:
        try:
            docs_comentarios = await db["comentarios_v2"].find({
                "$or": [
                    {"entidad_tipo": "evaluationresults", "entidad_id": tercero_oid},
                    {"tercero_id": tercero_oid},
                    {"evaluationresults_id": tercero_oid},
                ]
            }).sort([("creado_en", 1), ("_id", 1)]).to_list(length=9999)
            for d in docs_comentarios:
                ev = _evento_desde_comentario_v2(d, doc_tercero)
                if ev:
                    raw_events.append(ev)
        except Exception:
            pass

    # Orden ASC por (ts, _id)
    raw_events_sorted = sorted(raw_events, key=lambda e: (e["ts"], str(e.get("_id", ""))))

    # Paginacion cursor
    filtered: list[dict[str, Any]] = []
    for e in raw_events_sorted:
        cur_ts = float(e["ts"])
        cur_id = str(e.get("_id", ""))
        if cursor_last_ts is None:
            filtered.append(e)
        else:
            if cur_ts > cursor_last_ts:
                filtered.append(e)
            elif cur_ts == cursor_last_ts and cur_id > (cursor_last_id or ""):
                filtered.append(e)
        if len(filtered) > limit + 1:
            filtered = filtered[: limit + 1]
            break

    has_mas = len(filtered) > limit
    page_items = filtered[:limit]
    projected_items = [
        _aplicar_proyeccion_evento(
            e,
            nivel_autorizado,
            pn_gate_autorizado=pn_gate_autorizado,
            sensible_autorizado=sensible_autorizado,
        )
        for e in page_items
    ]
    next_cursor: dict[str, Any] | None = None
    if has_mas and projected_items:
        ultimo = projected_items[-1]
        next_cursor = {
            "last_ts": ultimo["ts"],
            "last_id": ultimo["id"],
        }
    cnt_fuentes: dict[str, int] = {}
    for e in raw_events_sorted:
        fuente = e.get("fuente") or "otro"
        cnt_fuentes[fuente] = cnt_fuentes.get(fuente, 0) + 1

    return {
        "items": projected_items,
        "count": len(projected_items),
        "total_raw": len(raw_events_sorted),
        "fuentes": {
            "total": len(raw_events_sorted),
            **cnt_fuentes,
        },
        "nivel_info_aplicado": nivel_autorizado,
        "pn_gate_aplicado": pn_gate_autorizado,
        "sensible_autorizado": sensible_autorizado,
        "cursor_next": next_cursor,
    }
