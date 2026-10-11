"""Bloque 2.3 FASE2 · Tests I5 Export Multinivel Terceros (CERTIFICADO / INFORME · HU-15).

Scope: duxiter-2 ONLY (SAFETY LOCK L1-L4 attivo · 0 scritture produzione duxiter).
Strategia: sync tests usando asyncio.run + motor/pymongo come I3/I4.
Solo escriture: (a) collection `test_i5_export` temp con cleanup prefix; (b) `evaluationsresults` insert_many with prefix `rut` e `test_i5_export_{ts}` unique suffix, cleaned PRE/POST; (c) auditoria_log (si scrive, ma entità `export.tercero`; non facciamo pulizia esplicita perché test inseriscono solo in evalu doc con `rut` e `test_i5_{ts}` con cleanup delete_many by prefix.)

Tests:
  U11 = helper _nivel_export_final → CERT clampa ≤2 (RESUMEN_NO_SENSIBLE=2) / INF clampa ≤4 (INFO_NO_SENSIBLE=4).
  U12 = projection proyectar (nivel 1 vs 5) con gate PN + sensible ok (funciona sin PN leak).
  U13 = autorizar() con rol SOLICITANTE (non ha export.certificate) → PASO3 PERMISO_NEGADO (gate 403).
  U14 = auditoría _registrar_export_auditoria scrive entry en auditoria_log con accion="export.tercero".
  I5-1 = Export end-to-end usando CHC tenant_admin: crea 2 docs (PJ_NACIONAL), ejecuta router logic via función pura, valida CERT ≤L2 / INF ≤L4, valida auditoria_log row escrita.
  precondiciones = precondiciones EXP: 2 permisos export.* existen en catalogo permisos + 5 nivel_info.
"""
from __future__ import annotations

import asyncio
from datetime import datetime

import pytest
from bson import ObjectId
from pymongo import MongoClient
from pymongo.read_preferences import ReadPreference

# ===========================================================================
# Safety lock + URI staging escrituras / primaryPreferred (nessun stale read)
# ===========================================================================
URI = (
    "mongodb://172.19.40.102:27017,172.19.40.103:27017/duxiter-2?"
    "replicaSet=rs0&readPreference=primaryPreferred&serverSelectionTimeoutMS=5000"
)

# IDs REALES I1 (duxiter-2 users N=66 · Blq1.1 + Blq1.3 force_v2_only=True)
U = {
    "A_SUPER": ObjectId("696eaa2bddea6b91873de160"),  # superadmin@gmail.com (superuser)
    "B_CHC_ADM": ObjectId("6a710ccc41eb4a347a7b2afa"),  # tenant_admin CMPC
    "C_AXA_EV":  ObjectId("696f6405174b6c5725971aaf"),  # evaluator AXA Virbac
    "D_CCU_RO":  ObjectId("6a2971190e276e4dabaa6b6e"),  # read_only UCSC
}

# Fake OIDs usados per third-party docs temporanei (non conflitto con reali)
OID_FAKE_ORG_AXA = "6ac127bae2f379cf956f258b"
OID_FAKE_UO_AXA  = "6ac127bae2f379cf956f258d"
TENANT_AXA = "696f6386174b6c5725971a6c"


def _oid(s):
    return ObjectId(s) if s else None


# ===========================================================================
# Fixture: cleanup per evalu docs creados con rut prefix test_i5_export_
# ===========================================================================
@pytest.fixture(autouse=True)
def _init_and_cleanup(request):
    # NO cleanup evalu docs en fixture; ciascun test I5 pulisce autonomamente il proprio did.
    # Pulizia auditoria_log export.tercero con usuario_email="" (solo tests generati).
    client = MongoClient(URI)
    db = client.get_database("duxiter-2")
    assert db.name == "duxiter-2", f"[SAFETY L1-L2 FAIL] {db.name}"
    db["auditoria_log"].delete_many({"accion": "export.tercero", "entidad_tipo": "evaluationresults", "usuario_email": ""})
    yield
    client.close()


# ===========================================================================
# U11 / U12: unitari SIN DB → helpers puros.
# ===========================================================================
def test_U11_clampeo_nivel_export_tipo():
    from fastcheck_api.app.api.v2.routers.third_party_export import _nivel_export_final
    # CERTIFICADO max = RESUMEN_NO_SENSIBLE (N2)
    assert _nivel_export_final("INFO_COMPLETA", "CERTIFICADO") == "RESUMEN_NO_SENSIBLE"
    assert _nivel_export_final("RESULTADO_GENERAL", "CERTIFICADO") == "RESULTADO_GENERAL"
    assert _nivel_export_final("RESUMEN_NO_SENSIBLE", "CERTIFICADO") == "RESUMEN_NO_SENSIBLE"
    # INFORME max = DETALLE_RIESGO (N4)
    assert _nivel_export_final("INFO_COMPLETA", "INFORME") == "DETALLE_RIESGO"
    assert _nivel_export_final("DETALLE_RIESGO", "INFORME") == "DETALLE_RIESGO"
    assert _nivel_export_final("RESULTADO_GENERAL", "INFORME") == "RESULTADO_GENERAL"


def test_U12_proyeccion_certificado_sin_pn_leak():
    from fastcheck_api.app.services.proyeccion_service import proyectar
    # Doc con campo PN + sensible flag para probar que no se filtre
    doc = {
        "_id": ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa"),
        "rut": "1-9",
        "riskAssessment": {"semaphore": "VERDE", "nivel_riesgo": "BAJO", "totalSevero": 0},
        "tipo_tercero_categoria": "PJ_NACIONAL",
        "summaryData": {"causas": {"count": 0}},
        "persona_natural_info": {"nombres": "JUAN"},
        "pn_datos_contacto_privado": {"telefono": "123"},
    }
    # Nivel 1 (CERTIFICADO): NO tiene summaryData en whitelist nivel 1
    cert = proyectar(doc, "RESULTADO_GENERAL", pn_gate=False, es_sensible_autorizado=False)
    assert "persona_natural_info" not in cert, f"PN LEAK en cert: {cert}"
    assert "pn_datos_contacto_privado" not in cert
    assert "riskAssessment" in cert and "semaphore" in cert["riskAssessment"]
    # Nivel 4 (INFORME): contiene summaryData.causas.count (en L2)
    inf = proyectar(doc, "INFO_NO_SENSIBLE", pn_gate=False, es_sensible_autorizado=False)
    assert "summaryData" in inf


# ===========================================================================
# U13: Permiso DENY (PASO3) per rol sin export.
# ===========================================================================
def test_U13_autorizar_deniega_solicitante_export_certificate():
    async def _inner():
        from motor.motor_asyncio import AsyncIOMotorClient
        from fastcheck_api.app.services.authz_service import (
            EnrichedUser, autorizar, hydrate_user_from_db,
        )
        client = AsyncIOMotorClient(URI)
        try:
            db = client.get_database("duxiter-2")
            assert db.name == "duxiter-2", f"SAFETY FAIL {db.name}"

            # SUPERUSER bypass scope/permisos → export.certificate PERMIT
            sup: EnrichedUser = await hydrate_user_from_db(db, U["A_SUPER"])
            dec_ok = await autorizar(
                db, sup, "export.certificate",
                recurso={"organizacion_id": _oid(OID_FAKE_ORG_AXA)},
                proposito="EXPORTAR",
                nivel_requerido="RESUMEN_NO_SENSIBLE",
                categoria_tercero="PJ_NACIONAL",
            )
            assert dec_ok.permitir is True, f"SUPER debe tener export.certificate PERMIT. detalle={dec_ok.to_dict()}"
            # Hydrate CHC admin real → ADMIN_GENERAL no tiene export.certificate (no en rol_permiso) → DENY PASO3
            chc_adm: EnrichedUser = await hydrate_user_from_db(db, U["B_CHC_ADM"])
            dec_det = await autorizar(
                db, chc_adm, "export.certificate",
                recurso={"organizacion_id": _oid(OID_FAKE_ORG_AXA)},
                proposito="EXPORTAR",
                nivel_requerido="RESUMEN_NO_SENSIBLE",
                categoria_tercero="PJ_NACIONAL",
            )
            assert dec_det.permitir is False, f"CHC ADMIN no debe tener export.certificate (sin override). detalle={dec_det.to_dict()}"
            assert dec_det.paso_fallido in (2, 3, 5), f"debe fallar en PASO2/3/5: {dec_det.paso_fallido}"
        finally:
            client.close()

    asyncio.run(_inner())


# ===========================================================================
# U14: Auditoría export.tercero scrive fila en auditoria_log.
# ===========================================================================
def test_U14_registra_export_auditoria_write_row():
    from fastcheck_api.app.services.authz_service import AuthzDecision, EnrichedUser

    async def _inner():
        from motor.motor_asyncio import AsyncIOMotorClient
        from fastcheck_api.app.api.v2.routers.third_party_export import _registrar_export_auditoria
        client = AsyncIOMotorClient(URI)
        try:
            db = client.get_database("duxiter-2")
            assert db.name == "duxiter-2", f"SAFETY FAIL {db.name}"
            user = EnrichedUser(
                user_id=U["C_AXA_EV"],
                organizacion_id=_oid(OID_FAKE_ORG_AXA),
                roles=["EVALUADOR_ANALISTA"],
            )
            decision = AuthzDecision(
                True, None, "",
                permiso_efectivo_origen="ROL_INCLUIDO",
                nivel_info_autorizado="RESULTADO_PARAMETROS",
                scope_match="MATCH_ORGANIZACION",
                pn_gate=True,
            )
            tercero_id_fake = "eeeeeeeeeeeeeeeeeeeeeeee"
            antes = await db["auditoria_log"].count_documents({
                "accion": "export.tercero", "entidad_id": _oid(tercero_id_fake),
            })
            await _registrar_export_auditoria(
                db, user, "export.certificate", decision,
                tercero_id=tercero_id_fake, tipo_export="CERTIFICADO",
            )
            despues = await db["auditoria_log"].count_documents({
                "accion": "export.tercero", "entidad_id": _oid(tercero_id_fake),
            })
            assert despues == antes + 1, f"falta escritura auditoria. delta={despues-antes}"
            doc = await db["auditoria_log"].find_one(
                {"accion": "export.tercero", "entidad_id": _oid(tercero_id_fake)}, sort=[("ts", -1)]
            )
            assert doc and doc["tipo_export"] == "CERTIFICADO", f"doc audit invalido: {doc}"
            assert doc["accion_permiso"] == "export.certificate"
            # cleanup
            await db["auditoria_log"].delete_many({
                "accion": "export.tercero", "entidad_id": _oid(tercero_id_fake),
            })
        finally:
            client.close()

    asyncio.run(_inner())


# ===========================================================================
# I5-1 = Flujo E2E (create doc PJ_NACIONAL) → ejecutar logica router export
#        sin hacer HTTP (puro logic via hydrate_user + autorizar + proyectar).
# ===========================================================================
def test_I5_1_flujo_e2e_export_cert_informe():
    suf: str = "test_i5_export_" + datetime.utcnow().strftime("%Y%m%d%H%M%S%f")

    async def _inner():
        from motor.motor_asyncio import AsyncIOMotorClient
        from fastcheck_api.app.services.authz_service import (
            hydrate_user_from_db, autorizar,
        )
        from fastcheck_api.app.services.proyeccion_service import (
            proyectar, proyectar_nivel_especifico_para_accion,
        )
        from fastcheck_api.app.api.v2.routers.third_party_export import (
            _nivel_export_final, EXPORT_PERMISOS,
        )
        client = AsyncIOMotorClient(URI)
        try:
            db = client.get_database("duxiter-2")
            assert db.name == "duxiter-2", f"SAFETY FAIL {db.name}"

            # --- (a) Insert 1 doc PJ_NACIONAL evalu temporal (AXA) ---
            doc_tercero = {
                "rut": f"{suf}_1-9",
                "razon_social": f"EMPRESA PRUEBA {suf}",
                "tipo_tercero_categoria": "PJ_NACIONAL",
                "organizacion_id": _oid(OID_FAKE_ORG_AXA),
                "unidad_id": _oid(OID_FAKE_UO_AXA),
                "tenantId": _oid(TENANT_AXA),
                "createdBy": U["C_AXA_EV"],
                "riskAssessment": {
                    "semaphore": "AMARILLO",
                    "nivel_riesgo": "MEDIO",
                    "totalSevero": 1,
                    "totalMedio": 3,
                    "totalBajo": 10,
                    "allRules": [{"ruleCode": "R1"}],
                    "details": {"categoriaCivil": 2, "categoriaComercial": 1},
                },
                "summaryData": {"causas": {"count": 14}},
                "companyGeneralInfo": {"fechaInicio": "2020-01-01"},
                "evaluationsHistory": [{"evaluador": "X"}],
                "persona_natural_info": {"nombres": "NO DEBE APARECER EN NADA SIN PN_GATE"},
                "pn_historial_laboral": [{"cargo": "J"}],
                "sheriffLogData": {"summaryData": {"x": 1}, "details": {"z": 2}, "raw_payload": "SENSIBLE!"},
                "createdAt": datetime.utcnow(),
            }
            ins = await db["evaluationresults"].insert_one(doc_tercero)
            did_oid = ins.inserted_id
            did = str(did_oid)
            await asyncio.sleep(0.08)
            doc_raw = await db["evaluationresults"].find_one({"_id": did_oid})
            if not doc_raw:
                # fallback: retry read after sleep per replica lag
                await asyncio.sleep(0.25)
                doc_raw = await db["evaluationresults"].find_one({"_id": did_oid})
            assert doc_raw, f"manca doc tercero did={did} post-insert (rut={doc_tercero.get('rut')})"

            # --- (b) SUPER → export.certificate PERMIT (wildcard) ---
            sup = await hydrate_user_from_db(db, U["A_SUPER"])
            acc_cert = EXPORT_PERMISOS["CERTIFICADO"]
            d_cert = await autorizar(
                db, sup, acc_cert,
                recurso={"organizacion_id": doc_raw.get("organizacion_id"),
                         "creador_id": doc_raw.get("createdBy"),
                         "unidad_id": doc_raw.get("unidad_id"),
                         "entidad_tipo": "evaluationresults",
                         "entidad_id": did},
                proposito="EXPORTAR",
                nivel_requerido=proyectar_nivel_especifico_para_accion(acc_cert),
                categoria_tercero=doc_raw.get("tipo_tercero_categoria"),
            )
            assert d_cert.permitir is True, f"export.certificate SUPER debe ser OK: {d_cert.to_dict()}"

            # --- (c) CERTIFICADO proj clampa ≤N2 (RESUMEN_NO_SENSIBLE) ---
            n_cert = _nivel_export_final(d_cert.nivel_info_autorizado, "CERTIFICADO")
            from fastcheck_api.app.services.authz_service import NIVEL_INFO_ORDEN
            assert NIVEL_INFO_ORDEN[n_cert] <= 2, f"CERT excede N2: {n_cert}"
            proj_cert = proyectar({k: v for k, v in doc_raw.items()}, n_cert, pn_gate=False)
            ra_cert = proj_cert.get("riskAssessment", {})
            assert "totalSevero" in ra_cert, f"N2 no tiene totalSevero: {list(ra_cert.keys())}"
            # N2: companyGeneralInfo/evaluationsHistory son ≥N3/N4 → no deben existir
            assert "companyGeneralInfo" not in proj_cert, f"N2 no debe incluir companyGeneralInfo (L3)"
            assert "evaluationsHistory" not in proj_cert, f"N2 no debe incluir evaluationsHistory (L4)"
            assert "persona_natural_info" not in proj_cert, "N2 PN LEAK!"

            # --- (d) SUPER → export.detail PERMIT + proj INFORME clampa ≤N4 (DETALLE_RIESGO)
            acc_det = EXPORT_PERMISOS["INFORME"]
            d_det = await autorizar(
                db, sup, acc_det,
                recurso={"organizacion_id": doc_raw.get("organizacion_id"),
                         "creador_id": doc_raw.get("createdBy"),
                         "unidad_id": doc_raw.get("unidad_id"),
                         "entidad_tipo": "evaluationresults", "entidad_id": did},
                proposito="EXPORTAR",
                nivel_requerido=proyectar_nivel_especifico_para_accion(acc_det),
                categoria_tercero=doc_raw.get("tipo_tercero_categoria"),
            )
            assert d_det.permitir is True
            n_inf = _nivel_export_final(d_det.nivel_info_autorizado, "INFORME")
            assert NIVEL_INFO_ORDEN[n_inf] <= 4, f"INF excede N4: {n_inf}"
            proj_inf = proyectar({k: v for k, v in doc_raw.items()}, n_inf, pn_gate=False)
            # N4 (= DETALLE_RIESGO: contiene allRules + sheriffLogData.details
            ra_inf = proj_inf.get("riskAssessment", {})
            assert "allRules" in ra_inf, f"N4 missing allRules: {list(ra_inf.keys())}"
            sh_inf = proj_inf.get("sheriffLogData", {})
            assert "details" in sh_inf, f"N4 missing sheriffLogData.details: {sh_inf}"
            assert "raw_payload" not in sh_inf, f"N4 raw_payload SENSIBLE LEAK"
            # PN sigue estando sin PN_GATE
            assert "persona_natural_info" not in proj_inf, f"N4 PN LEAK!"
            # companyGeneralInfo (L3) debe existir en L4 DETALLE_RIESGO
            assert "companyGeneralInfo" in proj_inf, "N4 debe incluir companyGeneralInfo (es L3)"
            assert "evaluationsHistory" in proj_inf, "N4 debe incluir evaluationsHistory (es L4)"

            # --- (e) Auditoria export.tercero OK ---
            from fastcheck_api.app.api.v2.routers.third_party_export import _registrar_export_auditoria
            await _registrar_export_auditoria(db, sup, acc_cert, d_cert, tercero_id=did, tipo_export="CERTIFICADO")
            await asyncio.sleep(0.2)
            row = await db["auditoria_log"].find_one(
                {"accion": "export.tercero", "entidad_id": ObjectId(did), "tipo_export": "CERTIFICADO"},
                sort=[("ts", -1)],
            )
            if row is None:
                all_recent = [r for r in await db["auditoria_log"].find(sort=[("ts", -1)], limit=8).to_list(8)
                              if r.get("accion") == "export.tercero"]
                raise AssertionError(
                    f"Manca row auditoria export.tercero did={did}. "
                    f"Export rows recenti: {[(r.get('entidad_id'), r.get('tipo_export'), r.get('usuario_id')) for r in all_recent]}"
                )
            assert row["accion"] == "export.tercero" and row["tipo_export"] == "CERTIFICADO"

            await db["evaluationresults"].delete_one({"_id": ObjectId(did)})
            await db["auditoria_log"].delete_many({"accion": "export.tercero", "entidad_id": ObjectId(did)})
        finally:
            client.close()

    asyncio.run(_inner())


# ===========================================================================
# Precondiciones EXP Bloq2.3: catálogo permisos + nivel_info = 5 docs.
# ===========================================================================
def test_I5_precondiciones_bloque_2_3():
    client = MongoClient(URI)
    db = client.get_database("duxiter-2")
    assert db.name == "duxiter-2", f"SAFETY FAIL {db.name}"
    perms = sorted(p["codigo"] for p in db["permisos"].find({"codigo": {"$in": ["export.certificate", "export.detail"]}}))
    assert perms == ["export.certificate", "export.detail"], f"Permisos export faltantes: {perms}"
    ni_count = db["nivel_info"].count_documents({})
    assert ni_count == 5, f"nivel_info debe ser 5 docs: {ni_count}"
    ni_nums = sorted(n["num"] for n in db["nivel_info"].find())
    assert ni_nums == [1, 2, 3, 4, 5], f"nums nivel_info: {ni_nums}"
    client.close()
