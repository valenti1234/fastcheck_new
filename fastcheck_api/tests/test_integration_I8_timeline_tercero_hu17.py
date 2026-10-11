"""
test_integration_I8_timeline_tercero_hu17.py

FASE 2 · Bloque 2.6 · Timeline tercero completo 4 fuentes orden ASC + projection N1..N5 + paginacion cursor.

TEST async via motor (no sync mix, no TestClient HTTP).
7 test: I8-0, U22, U23, U24, U25, I8-1, I8-2.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

import pytest
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

_MONGO_URI_ENV = (
    "mongodb://172.19.40.102:27017,172.19.40.103:27017/duxiter-2"
    "?replicaSet=rs0&readPreference=primaryPreferred&serverSelectionTimeoutMS=5000"
)
_ID_SUPER = ObjectId("696eaa2bddea6b91873de160")
_ID_CHC = ObjectId("6a710ccc41eb4a347a7b2afa")
_ID_AXA = ObjectId("696f6405174b6c5725971aaf")
_ID_CCU = ObjectId("6a2971190e276e4dabaa6b6e")
_ORG_CHC = ObjectId("6ac127c3e2f379cf956f2648")
_ORG_AXA = ObjectId("6ac127bae2f379cf956f258b")
_ORG_CCU = ObjectId("6ac127c0e2f379cf956f2609")
_ORG_SUPER = ObjectId("6ac127b7e2f379cf956f2576")
_TAG = "__TEST_I8_BLOQ26__"


def _env() -> None:
    import os
    os.environ.setdefault("MONGODB_URI", _MONGO_URI_ENV)
    os.environ.setdefault("AUTHZ_FORBID_PROD_DB", "True")
    os.environ.setdefault("AUTHZ_LEGACY_LAYER", "False")


async def _open_async_db() -> tuple[AsyncIOMotorClient, AsyncIOMotorDatabase]:
    _env()
    client = AsyncIOMotorClient(_MONGO_URI_ENV)
    db: AsyncIOMotorDatabase = client["duxiter-2"]
    assert db.name != "duxiter", "SAFETY FAIL PROD duxiter!"
    return client, db


async def _cleanup_async(db):
    await db["evaluationresults"].delete_many({"_tag": _TAG})
    await db["evaluationresults"].delete_many({"razon_social": {"$regex": f"EMPRESA TIMELINE TEST {_TAG}"}})
    await db["usernotes"].delete_many({"tags": {"$in": [_TAG]}})
    await db["auditoria_log"].delete_many({"_tag": _TAG})
    await db["comentarios_v2"].delete_many({"_tag": _TAG})


async def _seed_timeline_async(db, org_id, tenant_id, user_owner_id, suf: str):
    base_dt = datetime.now().replace(microsecond=0) - timedelta(hours=12)
    suf_num = int(suf, 36) if any(c.isalpha() for c in suf) else int(suf)
    rut_n = 10_000_000 + (suf_num % 9_999_999)
    dv = rut_n % 9
    rut0 = f"{rut_n:08d}-{dv if dv != 0 else 'K'}"
    tercero_doc = {
        "_tag": _TAG,
        "rut": rut0,
        "rut_clean": f"{rut_n:08d}{dv if dv != 0 else 'K'}",
        "razon_social": f"EMPRESA TIMELINE TEST {_TAG} {suf}",
        "tipo_tercero_categoria": "PJ_NACIONAL",
        "organizacion_id": org_id,
        "tenantId": tenant_id,
        "createdBy": user_owner_id,
        "unidad_id": ObjectId(),
        "riskAssessment": {
            "semaphore": "VERDE",
            "nivel_riesgo": "BAJO",
            "allRules": [{"ruleCode": "R1"}],
        },
        "summaryData": {"causas": {"count": 3}},
        "companyGeneralInfo": {"fechaInicio": "2020-01-01"},
        "evaluationsHistory": [
            {
                "fecha": base_dt - timedelta(hours=6),
                "evaluador": str(user_owner_id),
                "accion": "REASIGNAR",
                "estado": "EN_PROGRESO",
                "comentario": f"{_TAG} ev-hist asign {suf}",
            },
            {
                "fecha": base_dt - timedelta(hours=2),
                "evaluador": str(user_owner_id),
                "accion": "FINALIZAR",
                "estado": "COMPLETADO",
                "justificacion": f"{_TAG} ev-hist final {suf}",
            },
        ],
        "createdAt": base_dt - timedelta(hours=10),
    }
    tres = await db["evaluationresults"].insert_one(tercero_doc)
    tercero_id = tres.inserted_id
    ts0 = (base_dt - timedelta(hours=9)).timestamp()
    await db["usernotes"].insert_many([
        {
            "_tag": _TAG, "rut": rut0, "tenantId": tenant_id, "userId": user_owner_id,
            "note": f"{_TAG} usernote legal verif {suf}",
            "tags": [_TAG, "LEGAL"],
            "createdAt": base_dt - timedelta(hours=8),
            "updatedAt": base_dt - timedelta(hours=8), "__v": 0,
        },
        {
            "_tag": _TAG, "rut": rut0, "tenantId": tenant_id, "userId": user_owner_id,
            "note": f"{_TAG} usernote doc follow-up {suf}",
            "tags": [_TAG, "DOC"],
            "createdAt": base_dt - timedelta(hours=4),
            "updatedAt": base_dt - timedelta(hours=4), "__v": 0,
        },
    ])
    await db["auditoria_log"].insert_many([
        {"_tag": _TAG, "accion": "tag.use", "entidad_tipo": "evaluationresults",
         "entidad_id": tercero_id, "usuario_id": user_owner_id,
         "usuario_email": f"ev{suf}@test.cl", "organizacion_id": org_id,
         "permitir": True, "paso_fallido": None,
         "permiso_origen": "ROL:EVALUADOR_ANALISTA",
         "nivel_info_autorizado": "INFO_NO_SENSIBLE", "origen": "API_V2", "scope_match": True,
         "ts": ts0,
         "valor_anterior": {"tags_antes": []}, "valor_nuevo": {"tags_despues": [_TAG]}},
        {"_tag": _TAG, "accion": "export.certificate", "entidad_tipo": "evaluationresults",
         "entidad_id": tercero_id, "usuario_id": user_owner_id,
         "usuario_email": f"ev{suf}@test.cl", "organizacion_id": org_id,
         "permitir": True, "paso_fallido": None,
         "permiso_origen": "ROL:EVALUADOR_ANALISTA",
         "nivel_info_autorizado": "RESUMEN_NO_SENSIBLE", "origen": "PDF_WORKER", "scope_match": True,
         "ts": ts0 + 3600 * 4 + 30 * 60,
         "valor_anterior": None,
         "valor_nuevo": {"tipo": "CERTIFICADO", "hash_doc": f"sha{suf}-{_TAG}-xyz123"}},
        {"_tag": _TAG, "accion": "eval.escalate", "entidad_tipo": "evaluationresults",
         "entidad_id": tercero_id, "usuario_id": user_owner_id,
         "usuario_email": f"ev{suf}@test.cl", "organizacion_id": org_id,
         "permitir": True, "paso_fallido": None,
         "permiso_origen": "OVERRIDE_GRANT",
         "nivel_info_autorizado": "DETALLE_RIESGO", "origen": "MODAL_ESCALAMIENTO", "scope_match": True,
         "ts": ts0 + 3600 * 6,
         "motivo_denegacion": "",
         "valor_anterior": {"nivel": 2},
         "valor_nuevo": {"nivel": 4, "motivo": f"{_TAG} escal HU-17 {suf}"},
         "campos_sensibles": {"payload_clasificado": f"{_TAG} INFO_SENSIBLE N5 {suf}"}},
    ])
    tercero_doc["_id"] = tercero_id
    return {"tercero_id": tercero_id, "rut": rut0, "base_dt": base_dt,
            "tenant_id": tenant_id, "org_id": org_id, "doc": tercero_doc}


# =============================================================================
# I8-0 · Precondiciones sync
# =============================================================================
def test_I8_0_precondiciones_sync():
    import pymongo
    _env()
    client = pymongo.MongoClient(_MONGO_URI_ENV, serverSelectionTimeoutMS=5000,
                                 tlsAllowInvalidCertificates=True)
    db = client["duxiter-2"]
    try:
        assert db.name != "duxiter"
        assert db["evaluationresults"].estimated_document_count() >= 1
        assert db["auditoria_log"].estimated_document_count() >= 1
        assert "usernotes" in db.list_collection_names()
        state = db["__rbac_migrations_version"].find_one({"_id": "state"}) or {}
        applied = state.get("applied", [])
        for v in ["001", "002", "003", "004", "005", "006", "007"]:
            assert v in applied, f"Migration {v} NON applicata!"
    finally:
        client.close()


# =============================================================================
# Helpers authz y timeline
# =============================================================================
async def _autorizar_y_build_timeline(
    async_db, uid: ObjectId, tercero_doc: dict,
    *,
    force_nivel: str | None = None,
    pn_gate_override: bool | None = None,
    sensible_override: bool | None = None,
    limit: int = 200,
    cursor_last_ts: float | None = None,
    cursor_last_id: str | None = None,
):
    from fastcheck_api.app.services.authz_service import autorizar, hydrate_user_from_db
    from fastcheck_api.app.services.proyeccion_service import proyectar_nivel_especifico_para_accion
    from fastcheck_api.app.services.servicio_timeline_tercero import construir_timeline_tercero

    eu = await hydrate_user_from_db(async_db, uid, force_refresh=True)
    recurso = {
        "organizacion_id": tercero_doc.get("organizacion_id"),
        "creador_id": tercero_doc.get("createdBy") or tercero_doc.get("tenantId"),
        "unidad_id": tercero_doc.get("unidad_id"),
        "pais_id": tercero_doc.get("pais_id"),
    }
    nivel_req = proyectar_nivel_especifico_para_accion("fastcheck.query")
    dec = await autorizar(
        async_db, eu, "fastcheck.query",
        recurso=recurso,
        proposito="VER",
        nivel_requerido=nivel_req,
        categoria_tercero=tercero_doc.get("tipo_tercero_categoria"),
    )
    if not dec.permitir:
        return {"permitir": False, "paso_fallido": dec.paso_fallido,
                "motivo": dec.motivo_denegacion, "permiso_origen": dec.permiso_efectivo_origen}

    nivel_aplicado = force_nivel or dec.nivel_info_autorizado
    pn_gate = dec.pn_gate if pn_gate_override is None else pn_gate_override
    sensible_autorizado = (
        (str(uid) == str(_ID_SUPER) and pn_gate)
        if sensible_override is None else sensible_override
    )
    timeline = await construir_timeline_tercero(
        async_db, tercero_doc,
        nivel_autorizado=nivel_aplicado,
        pn_gate_autorizado=pn_gate,
        sensible_autorizado=sensible_autorizado,
        limit=limit,
        cursor_last_ts=cursor_last_ts,
        cursor_last_id=cursor_last_id,
    )
    return {"permitir": True, "nivel_info_autorizado": dec.nivel_info_autorizado,
            "nivel_aplicado_proj": nivel_aplicado, "pn_gate": pn_gate,
            "sensible_autorizado": sensible_autorizado,
            "permiso_origen": dec.permiso_efectivo_origen, "timeline": timeline}


# =============================================================================
# U22 · Projection N1 (force RESULTADO_GENERAL) solo 6 campi base
# =============================================================================
def test_U22_projection_N1_FORZADO_solo_6_campi():
    async def _run():
        motor_client, db = await _open_async_db()
        try:
            await _cleanup_async(db)
            seed = await _seed_timeline_async(db, _ORG_AXA, _ORG_AXA, _ID_AXA, "U22")
            tercero_doc = seed["doc"]
            out = await _autorizar_y_build_timeline(
                db, _ID_SUPER, tercero_doc,
                force_nivel="RESULTADO_GENERAL", limit=200,
                sensible_override=False, pn_gate_override=False,
            )
            assert out["permitir"], f"SUPER deny: {out}"
            items = out["timeline"]["items"]
            assert len(items) >= 6, f"eventi={len(items)} total_raw={out['timeline']['total_raw']}"
            for it in items:
                allowed = {"id", "tipo_evento", "titulo", "ts", "ts_humano", "fuente"}
                assert set(it.keys()) == allowed, (
                    f"N1 keys mismatch: extra={set(it.keys())-allowed}  miss={allowed-set(it.keys())} — item tipo={it.get('tipo_evento')}"
                )
                assert it["titulo"] and it["tipo_evento"]
                assert isinstance(it["ts"], (int, float))
        finally:
            try:
                await _cleanup_async(db)
            finally:
                try:
                    motor_client.close()
                except Exception:
                    pass
    asyncio.run(_run())


# =============================================================================
# U23 · Projection N5 FORCE INFO_COMPLETA = cuerpo + valores + SENSIBLES
# =============================================================================
def test_U23_projection_N5_FORZADO_completo_y_sensibles():
    async def _run():
        motor_client, db = await _open_async_db()
        try:
            await _cleanup_async(db)
            seed = await _seed_timeline_async(db, _ORG_AXA, _ORG_AXA, _ID_AXA, "U23")
            tercero_doc = seed["doc"]
            out = await _autorizar_y_build_timeline(
                db, _ID_SUPER, tercero_doc,
                force_nivel="INFO_COMPLETA", limit=200,
                pn_gate_override=True, sensible_override=True,
            )
            assert out["permitir"], f"SUPER deny: {out}"
            assert out["nivel_aplicado_proj"] == "INFO_COMPLETA"
            items = out["timeline"]["items"]
            assert len(items) >= 6, f"eventi={len(items)}"
            fuentes = {e["fuente"] for e in items}
            for req in ["evaluationresults", "usernotes_legacy", "auditoria_log", "evaluationsHistory"]:
                assert req in fuentes, f"Manca fuente {req}; actuales={fuentes}"
            escal = [x for x in items if x["tipo_evento"] == "ESCALAMIENTO"]
            assert escal, "Manca evento ESCALAMIENTO (seed auditoria_log non applicato?)"
            es = escal[0]
            has_det = es.get("valor_nuevo") is not None or es.get("cuerpo")
            assert has_det, f"ESCAL N5 non ha dettagli: {list(es.keys())}"
            cs = es.get("campos_sensibles")
            assert cs and _TAG in str(cs), "ESCAL N5 non ha campos_sensibili"
            exps = [x for x in items if x["tipo_evento"].startswith("EXPORT")]
            if exps:
                vn = exps[0].get("valor_nuevo")
                assert vn and "sha" in str(vn).lower(), "Export N5 hash_doc missing"
            coms = [x for x in items if x["tipo_evento"] == "COMMENT_LEGACY"]
            assert len(coms) >= 1, "Manca COMMENT_LEGACY (usernotes seed non ok)"
            assert any(x.get("cuerpo") for x in coms), "COMMENT_LEGACY N5 senza corpo note"
        finally:
            try:
                await _cleanup_async(db)
            finally:
                try:
                    motor_client.close()
                except Exception:
                    pass
    asyncio.run(_run())


# =============================================================================
# U24 · Orden ASC strict (ts, id); primo = CONSULTA_CREADA
# =============================================================================
def test_U24_orden_ASC_stretto_primo_evento_CONSULTA_CREADA():
    async def _run():
        motor_client, db = await _open_async_db()
        try:
            await _cleanup_async(db)
            seed = await _seed_timeline_async(db, _ORG_CHC, _ORG_CHC, _ID_CHC, "U24")
            tercero_doc = seed["doc"]
            out = await _autorizar_y_build_timeline(
                db, _ID_SUPER, tercero_doc,
                force_nivel="INFO_COMPLETA", limit=200, pn_gate_override=True, sensible_override=True,
            )
            assert out["permitir"]
            items = out["timeline"]["items"]
            assert len(items) >= 6, f"eventi={len(items)} (atteso ≥6 con 4 fonti)"
            assert items[0]["tipo_evento"] == "CONSULTA_CREADA", (
                f"1° evento deve essere CONSULTA_CREADA; trovato={items[0]['tipo_evento']}"
            )
            for i in range(1, len(items)):
                a, b = items[i - 1], items[i]
                assert (a["ts"], a["id"]) <= (b["ts"], b["id"]), (
                    f"Ordine NON ASC i={i}: a(ts={a['ts']},id={a['id']}) vs b(ts={b['ts']},id={b['id']})"
                )
        finally:
            try:
                await _cleanup_async(db)
            finally:
                try:
                    motor_client.close()
                except Exception:
                    pass
    asyncio.run(_run())


# =============================================================================
# U25 · Paginazione cursor limit=2 → pag.2 senza duplicati; ultima cursor_next None
# =============================================================================
def test_U25_paginazione_cursor_senza_duplicati_hasmas():
    async def _run():
        motor_client, db = await _open_async_db()
        try:
            await _cleanup_async(db)
            seed = await _seed_timeline_async(db, _ORG_CHC, _ORG_CHC, _ID_CHC, "U25")
            tercero_doc = seed["doc"]
            out1 = await _autorizar_y_build_timeline(
                db, _ID_SUPER, tercero_doc,
                force_nivel="INFO_COMPLETA", limit=2, pn_gate_override=True, sensible_override=True,
            )
            t1 = out1["timeline"]
            assert len(t1["items"]) == 2, f"pag1={len(t1['items'])} total_raw={t1['total_raw']}"
            assert t1.get("cursor_next"), f"pag1 cursor_next null total_raw={t1['total_raw']}"
            cn = t1["cursor_next"]
            out2 = await _autorizar_y_build_timeline(
                db, _ID_SUPER, tercero_doc,
                force_nivel="INFO_COMPLETA", limit=200,
                cursor_last_ts=cn["last_ts"], cursor_last_id=cn["last_id"],
                pn_gate_override=True, sensible_override=True,
            )
            t2 = out2["timeline"]
            items2 = t2["items"]
            assert len(items2) >= 4, f"pag2={len(items2)} (≥4 atteso)"
            ids1 = {i["id"] for i in t1["items"]}
            ids2 = {i["id"] for i in items2}
            assert ids1.isdisjoint(ids2), f"Duplicati: {ids1 & ids2}"
            min_p2 = min(i["ts"] for i in items2)
            max_p1 = max(i["ts"] for i in t1["items"])
            assert min_p2 >= max_p1, f"pag2 ts min {min_p2} < pag1 max {max_p1}"
            outf = await _autorizar_y_build_timeline(
                db, _ID_SUPER, tercero_doc,
                force_nivel="INFO_COMPLETA", limit=500, pn_gate_override=True, sensible_override=True,
            )
            tf = outf["timeline"]
            assert tf["count"] >= 6
            if tf["count"] == tf["total_raw"]:
                assert tf.get("cursor_next") is None, (
                    f"Ultima pag count==total_raw cursor_next non None: {tf.get('cursor_next')}"
                )
        finally:
            try:
                await _cleanup_async(db)
            finally:
                try:
                    motor_client.close()
                except Exception:
                    pass
    asyncio.run(_run())


# =============================================================================
# I8-1 · E2E 4 fuentes (SUPER) + CHC su AXA scope = DENY paso 3/5
# =============================================================================
def test_I8_1_e2e_4_fuentes_CHC_deny_scope_AXA():
    async def _run():
        motor_client, db = await _open_async_db()
        try:
            await _cleanup_async(db)
            seed = await _seed_timeline_async(db, _ORG_AXA, _ORG_AXA, _ID_AXA, "I81")
            tercero_doc = seed["doc"]
            # (1) SUPER = 4 fonti OK
            out_s = await _autorizar_y_build_timeline(
                db, _ID_SUPER, tercero_doc,
                force_nivel="INFO_COMPLETA", limit=200, pn_gate_override=True, sensible_override=True,
            )
            assert out_s["permitir"], f"SUPER deny: {out_s}"
            fuentes = {e["fuente"] for e in out_s["timeline"]["items"]}
            for req in ["evaluationresults", "usernotes_legacy", "auditoria_log", "evaluationsHistory"]:
                assert req in fuentes, f"SUPER manca {req}; actuales={fuentes}"
            tipos = {e["tipo_evento"] for e in out_s["timeline"]["items"]}
            assert "CONSULTA_CREADA" in tipos
            assert "COMMENT_LEGACY" in tipos
            assert any(t in tipos for t in ("ESCALAMIENTO", "TAG_USE", "EXPORT_CERTIFICATE"))
            # (2) CHC su AXA scope mismatch → DENY
            out_chc = await _autorizar_y_build_timeline(
                db, _ID_CHC, tercero_doc, limit=50,
            )
            assert out_chc["permitir"] is False, f"CHC/AXA scope dovrebbe DENY: {out_chc}"
            pf = out_chc.get("paso_fallido")
            assert pf in (3, 5, 6, 7, "3", "5", "6", "7"), f"paso_fallido={pf}"
        finally:
            try:
                await _cleanup_async(db)
            finally:
                try:
                    motor_client.close()
                except Exception:
                    pass
    asyncio.run(_run())


# =============================================================================
# I8-2 · CCU read_only → terzo non appartenente (AXA) = DENY paso 3/5/6/7
# =============================================================================
def test_I8_2_ccu_read_only_terzo_non_proprio_DENY():
    async def _run():
        motor_client, db = await _open_async_db()
        try:
            await _cleanup_async(db)
            seed = await _seed_timeline_async(db, _ORG_AXA, _ORG_AXA, _ID_AXA, "I82")
            tercero_doc = seed["doc"]
            out_ccu = await _autorizar_y_build_timeline(db, _ID_CCU, tercero_doc, limit=50)
            assert out_ccu["permitir"] is False, f"CCU/AXA dovrebbe DENY: {out_ccu}"
            pf = out_ccu.get("paso_fallido")
            assert pf in (3, 5, 6, 7, "3", "5", "6", "7"), f"paso_fallido={pf}"
        finally:
            try:
                await _cleanup_async(db)
            finally:
                try:
                    motor_client.close()
                except Exception:
                    pass
    asyncio.run(_run())
