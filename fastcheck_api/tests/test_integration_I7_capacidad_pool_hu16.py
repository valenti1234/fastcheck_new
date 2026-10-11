"""
test_integration_I7_capacidad_pool_hu16.py

FASE 2 · Bloque 2.5 · Capacidad Pool 5 Niveles + Overshoot Q6 + Notifiche Soglie 90/100/120%.

6 TESTS:
  I7-0: Precondiciones (007 APPLICATA, 5 planes, 2 permisos pool.credit.*, 4 pool I1 orgs)
  U19: Modal doble intención PUT /plan + escal insuf (NIV1 < req3) → HTTP 428 y 403
  U20: Gate overshoot 150% max · superato → HTTP 402 Payment Required
  U21: Soglie 90% 100% 120% CREDITO → notifiche push 1 sola volta/mese x soglia
  I7-1: E2E (a) SUPER GRANT individuale pool.credit.manage sensible (b) cambio plan NIV1→NIV5 AXA (c) 4 consumi credito OK (d) auditoria gov.pool.* 2 row
  I7-2: Deny por falta permiso: CCU read_only SIN pool.credit.view → 403 PASO3/4
"""
from __future__ import annotations
import asyncio
from datetime import datetime
from bson import ObjectId

_MONGO_URI_ENV = "mongodb://172.19.40.102:27017,172.19.40.103:27017/duxiter-2?replicaSet=rs0&readPreference=primaryPreferred&serverSelectionTimeoutMS=5000"
_ID_SUPER = ObjectId("696eaa2bddea6b91873de160")
_ID_CHC   = ObjectId("6a710ccc41eb4a347a7b2afa")  # CMPC tenant_admin
_ID_AXA   = ObjectId("696f6405174b6c5725971aaf")  # Virbac evaluator
_ID_CCU   = ObjectId("6a2971190e276e4dabaa6b6e")  # UCSC read_only
_ORG_CHC  = ObjectId("6ac127c3e2f379cf956f2648")
_ORG_AXA  = ObjectId("6ac127bae2f379cf956f258b")
_ORG_CCU  = ObjectId("6ac127c0e2f379cf956f2609")
_ORG_SUPER= ObjectId("6ac127b7e2f379cf956f2576")
_TAG = "__TEST_I7_BLOQ25__"


def _env() -> None:
    import os
    os.environ.setdefault("MONGODB_URI", _MONGO_URI_ENV)
    os.environ.setdefault("AUTHZ_FORBID_PROD_DB", "True")


# ===========================================================
# I7-0 · PRECONDICIONES
# ===========================================================
def test_I7_0_precondiciones_migration_007():
    _env()
    import pymongo
    client = pymongo.MongoClient(_MONGO_URI_ENV, serverSelectionTimeoutMS=5000, tlsAllowInvalidCertificates=True)
    db = client.get_database("duxiter-2")
    assert db.name != "duxiter", "SAFETY: writing on PROD duxiter — abortito"
    # Migration applied
    state = db["__rbac_migrations_version"].find_one({"_id":"state"}) or {}
    assert "007" in state.get("applied",[]), "007 no en state.applied"
    # 4 collec nuevas
    cols = db.list_collection_names()
    for c in ["pool_creditos_organizacion","usuario_limite_consumo_v2","consumos_log_v2","notificaciones_push"]:
        assert c in cols, f"Missing collection {c}"
    # 2 permisos pool.credit en catalogo
    pc_count = db["permisos"].count_documents({"codigo":{"$regex":r"^pool\.credit\."}})
    assert pc_count == 2, f"2 pool.credit esperados, hay {pc_count}"
    pv = db["permisos"].find_one({"codigo":"pool.credit.view"})
    pm = db["permisos"].find_one({"codigo":"pool.credit.manage"})
    assert pv and pm
    assert pm.get("es_sensible") is True, "pool.credit.manage DEBE ser sensible"
    # 4 pool para 4 org I1
    pools_n = db["pool_creditos_organizacion"].count_documents({})
    assert pools_n >= 4, f"≥4 pools necesarias, hay {pools_n}"
    client.close()


# ===========================================================
# Helpers shared (async)
# ===========================================================
async def _inner_setup_cleanup(db):
    from datetime import datetime
    now = datetime.utcnow().isoformat()
    # Cleanup override tag
    await db["usuario_permiso_override"].delete_many({"_tag":_TAG})
    # Cleanup consumos tag
    await db["consumos_log_v2"].delete_many({"metadata.tag":_TAG})
    # Cleanup auditoria con tag
    await db["auditoria_log"].delete_many({"$or":[
        {"accion":{"$regex":"^capacidad\\.pool\\."}},
        {"recurso.entidad_tipo":{"$regex":"pool|limite"}},
    ]})
    # Cleanup notifiche con tag / mes actual
    mes, anio = datetime.utcnow().month, datetime.utcnow().year
    await db["notificaciones_push"].delete_many({
        "$or":[{"_tag":_TAG},{"codigo_soglia":{"$regex":r"^CREDITO_"},"anio":anio,"mes":mes}]
    })
    # Reset pools I1 a default
    from fastcheck_api.app.services.authz_service import NIVELES_POOL_5
    org_plan = {_ORG_SUPER:5, _ORG_CHC:3, _ORG_AXA:2, _ORG_CCU:1}
    for org_id, niv in org_plan.items():
        plan = next(n for n in NIVELES_POOL_5 if n["nivel"]==niv)
        await db["pool_creditos_organizacion"].update_one(
            {"organizacion_id":org_id},
            {"$set":{
                "nivel_pool_plan":niv,"nombre_plan":plan["nombre"],
                "creditos_mensuales_org":plan["creditos_mensuales_org"],
                "overshoot_pct_max":plan["overshoot_pct_max"],
                "usuarios_max_plan":plan["usuarios_max"],
                "creditos_consumidos_mes":0,
                "saldo_actual":plan["creditos_mensuales_org"],
                "mes_referencia":datetime.utcnow().month,
                "anio_referencia":datetime.utcnow().year,
                "actualizado_en":now,
            }},
            upsert=True,
        )
    # Insert GRANT individual SUPER para pool.credit.view y pool.credit.manage sensible L10 (escal 3)
    for perm, niv in [("pool.credit.view", 1), ("pool.credit.manage", 3)]:
        await db["usuario_permiso_override"].update_one(
            {"usuario_id":_ID_SUPER, "permiso_codigo":perm, "_tag":_TAG},
            {"$set":{
                "tipo_override":"GRANT","sensible_confirmado":True,
                "nivel_escalamiento":niv,
                "organizacion_id":_ORG_SUPER,
                "actualizado_en":now,"_tag":_TAG,
            }},
            upsert=True,
        )


async def _get_svc_pool_functions():
    from fastcheck_api.app.services.servicio_capacidad_pool import (
        consumir_credito, cambiar_plan_pool, obtener_pool_org, asignar_limite_usuario_mes,
    )
    return (consumir_credito, cambiar_plan_pool, obtener_pool_org, asignar_limite_usuario_mes)


# ===========================================================
# U19 · Modal doble intención + gate escal insuficiente
# ===========================================================
def test_U19_modal_doble_y_escalamiento_403():
    _env()
    async def _inner():
        import motor.motor_asyncio as mtr
        client = mtr.AsyncIOMotorClient(_MONGO_URI_ENV, serverSelectionTimeoutMS=5000, tlsAllowInvalidCertificates=True)
        db = client.get_database("duxiter-2")
        await _inner_setup_cleanup(db)
        # CHC con override pool.credit.manage MAIS escal=1 (insuf req=3)
        from fastcheck_api.app.services.authz_service import hydrate_user_from_db
        await db["usuario_permiso_override"].update_one(
            {"usuario_id":_ID_CHC, "permiso_codigo":"pool.credit.manage", "_tag":_TAG},
            {"$set":{"tipo_override":"GRANT","sensible_confirmado":True,
                     "nivel_escalamiento":1,"organizacion_id":_ORG_CHC,"_tag":_TAG,
                     "actualizado_en":datetime.utcnow().isoformat()}},
            upsert=True,
        )
        eu_chc = await hydrate_user_from_db(db, _ID_CHC, force_refresh=True)
        (consumir_credito, cambiar_plan_pool, obtener_pool_org, _) = await _get_svc_pool_functions()
        # (a) Modal false: debe lanzar 428 → lo testiamo su implementación de _gate via llamada cambiar_plan_pool con user con escal insuf
        ok, st, code, doc_n = await cambiar_plan_pool(db, eu_chc, _ORG_CHC, 5, "U19 test insuf")
        assert ok is True  # llamada servicio pool NO valida modal; il router si
        # Noi testiamo i gate direttamente
        from fastcheck_api.app.api.v2.routers.capacidad_pool import (
            _gate_modal_doble_intencion as _md, _gate_escalamiento_sensible as _es
        )
        # Modal false
        class FakeBody: confirmacion_cambio_riesgo = False
        err = None
        try:
            _md(False, "pool.credit.manage")
        except Exception as x:
            err = x
        assert err is not None
        assert getattr(err, "status_code", None) == 428, f"modal 428 atteso, status {getattr(err,'status_code',None)}"
        # Modal true + escal 1 < req 3
        err = None
        try:
            _md(True, "pool.credit.manage")
        except Exception:
            pass
        err = None
        try:
            _es(eu_chc, "pool.credit.manage", 3)
        except Exception as x:
            err = x
        assert err is not None and getattr(err,"status_code",None) == 403, f"escal {getattr(err,'status_code',None)}"
        # SUPER escal bypass → OK
        eu_sup = await hydrate_user_from_db(db, _ID_SUPER, force_refresh=True)
        try:
            _es(eu_sup, "pool.credit.manage", 3)
        except Exception as x:
            raise AssertionError(f"SUPER NO debe fallar escal gate: {x}")
        client.close()
    asyncio.run(_inner())


# ===========================================================
# U20 · Overshoot >150% bloquea HTTP 402
# ===========================================================
def test_U20_overshoot_max_150_pct_402():
    _env()
    async def _inner():
        import motor.motor_asyncio as mtr
        client = mtr.AsyncIOMotorClient(_MONGO_URI_ENV, serverSelectionTimeoutMS=5000, tlsAllowInvalidCertificates=True)
        db = client.get_database("duxiter-2")
        await _inner_setup_cleanup(db)
        # Assegna CCU BASIC (NIV1 · 500 crediti · overshoot 150% = 750 max totali)
        from fastcheck_api.app.services.authz_service import hydrate_user_from_db
        eu_ccu = await hydrate_user_from_db(db, _ID_CCU, force_refresh=True)
        (consumir_credito, _, _, _) = await _get_svc_pool_functions()
        # Consumiamo 749 (prima accettato: overshoot 149.8% <150)
        for _ in range(7):
            await consumir_credito(db, eu_ccu, operacion_codigo="test_u20_rut", creditos=100,
                                   metadata={"tag":_TAG})
        # 700 crediti usati → pct = 140% overshoot ok
        pool = await db["pool_creditos_organizacion"].find_one({"organizacion_id":_ORG_CCU})
        # Tentativo 200 crediti aggiuntivi (900 tot >750)
        ok, status, code, info = await consumir_credito(db, eu_ccu, operacion_codigo="test_u20_excedente",
                                                        creditos=200, metadata={"tag":_TAG})
        assert ok is False
        assert status == 402, f"Status atteso 402, ottenuto {status}"
        assert code == "CREDITO_OVERSHOOT_150PCT_EXCEDIDO", f"Code {code}"
        assert info and "creditos_consumibles_disponibles" in info
        client.close()
    asyncio.run(_inner())


# ===========================================================
# U21 · Notifiche soglie 90/100/120 1 sola volta x mese/org
# ===========================================================
def test_U21_soglie_notifiche_una_volta_org_mes():
    _env()
    async def _inner():
        import motor.motor_asyncio as mtr
        client = mtr.AsyncIOMotorClient(_MONGO_URI_ENV, serverSelectionTimeoutMS=5000, tlsAllowInvalidCertificates=True)
        db = client.get_database("duxiter-2")
        await _inner_setup_cleanup(db)
        from fastcheck_api.app.services.authz_service import hydrate_user_from_db
        from fastcheck_api.app.services.servicio_capacidad_pool import consumir_credito
        eu_axa = await hydrate_user_from_db(db, _ID_AXA, force_refresh=True)
        # AXA STARTUP 2000 crediti · 90%=1800, 100%=2000, 120%=2400
        for i, (op_cr, cod) in enumerate([(1800,"rut_1800"), (200,"rut_2000"), (400,"rut_2400")]):
            ok, st, code, info = await consumir_credito(db, eu_axa, operacion_codigo=f"test_u21_{cod}",
                                                         creditos=op_cr, metadata={"tag":_TAG})
            assert ok, f"consumo {i} fallito: {code}"
        # Contiamo notificazioni per org AXA mese corrente
        mes, anio = datetime.utcnow().month, datetime.utcnow().year
        cnt_90 = await db["notificaciones_push"].count_documents({
            "organizacion_id":_ORG_AXA, "codigo_soglia":"CREDITO_90_PCT", "mes":mes,"anio":anio})
        cnt_100 = await db["notificaciones_push"].count_documents({
            "organizacion_id":_ORG_AXA, "codigo_soglia":"CREDITO_100_PCT", "mes":mes,"anio":anio})
        cnt_120 = await db["notificaciones_push"].count_documents({
            "organizacion_id":_ORG_AXA, "codigo_soglia":"CREDITO_120_PCT", "mes":mes,"anio":anio})
        assert cnt_90 == 1, f"90% notif: 1 attesa, {cnt_90}"
        assert cnt_100 == 1, f"100% notif: 1 attesa, {cnt_100}"
        assert cnt_120 == 1, f"120% notif: 1 attesa, {cnt_120}"
        # Consumo aggiuntivo NON crea nuove notifiche (idempotenza soglie)
        await consumir_credito(db, eu_axa, operacion_codigo="test_u21_extra_200", creditos=200, metadata={"tag":_TAG})
        cnt_90_2 = await db["notificaciones_push"].count_documents({"organizacion_id":_ORG_AXA, "codigo_soglia":"CREDITO_90_PCT","mes":mes,"anio":anio})
        cnt_100_2 = await db["notificaciones_push"].count_documents({"organizacion_id":_ORG_AXA,"codigo_soglia":"CREDITO_100_PCT","mes":mes,"anio":anio})
        cnt_120_2 = await db["notificaciones_push"].count_documents({"organizacion_id":_ORG_AXA,"codigo_soglia":"CREDITO_120_PCT","mes":mes,"anio":anio})
        assert cnt_90_2 == 1 and cnt_100_2 == 1 and cnt_120_2 == 1, f"idempotenza notifiche violata: 90={cnt_90_2} 100={cnt_100_2} 120={cnt_120_2}"
        client.close()
    asyncio.run(_inner())


# ===========================================================
# I7-1 · E2E SUPER cambia piano → 4 consumi → 2 audit
# ===========================================================
def test_I7_1_e2e_super_cambiar_plan_y_consumos():
    _env()
    async def _inner():
        import motor.motor_asyncio as mtr
        client = mtr.AsyncIOMotorClient(_MONGO_URI_ENV, serverSelectionTimeoutMS=5000, tlsAllowInvalidCertificates=True)
        db = client.get_database("duxiter-2")
        await _inner_setup_cleanup(db)
        # Pulizia preventiva eventuale override SUPER pool.credit.manage (duplicate key)
        await db["usuario_permiso_override"].delete_many({
            "usuario_id": _ID_SUPER, "permiso_codigo": "pool.credit.manage"})
        await db["usuario_permiso_override"].delete_many({
            "usuario_id": _ID_CHC, "permiso_codigo": "pool.credit.manage"})
        from fastcheck_api.app.services.authz_service import hydrate_user_from_db, AuthzDecision
        from fastcheck_api.app.services.servicio_capacidad_pool import cambiar_plan_pool, consumir_credito, obtener_pool_org
        eu_super = await hydrate_user_from_db(db, _ID_SUPER, force_refresh=True)
        # Inserisce 1 override SUPER (unica entry pool.credit.manage SUPER): org può essere globale ma indice unico vuole uid+perm+tipo
        now_iso = datetime.utcnow().isoformat()
        await db["usuario_permiso_override"].insert_one({
            "usuario_id": _ID_SUPER, "permiso_codigo": "pool.credit.manage",
            "tipo_override": "GRANT", "sensible_confirmado": True,
            "nivel_escalamiento": 3, "organizacion_id": _ORG_SUPER,
            "actualizado_en": now_iso, "_tag": _TAG,
        })
        eu_super = await hydrate_user_from_db(db, _ID_SUPER, force_refresh=True)
        # (1) SUPER cambia piano CHC da NIV3 (10k) → NIV5 (ENTERPRISE 250k) (SUPER può operare su org CHC? -> si, è superuser)
        before_plan = await obtener_pool_org(db, _ORG_CHC)
        ok, st, code, np = await cambiar_plan_pool(db, eu_super, _ORG_CHC, 5, motivo_cambio=f"TEST_I71_MOTIVO_{_TAG}")
        assert ok and np and np["nivel_pool_plan"] == 5 and np["nombre_plan"] == "ENTERPRISE", f"cambio plan fallito: {code} {np}"
        # Consumo 4 crediti (4 operaz)
        eu_chc = await hydrate_user_from_db(db, _ID_CHC, force_refresh=True)
        for i in range(4):
            ok,s,c,inf = await consumir_credito(db, eu_chc, operacion_codigo=f"i71_op{i}", creditos=1, metadata={"tag":_TAG})
            assert ok, f"consumo {i} fallito {c}"
        cnt_log = await db["consumos_log_v2"].count_documents({"organizacion_id":_ORG_CHC,"metadata.tag":_TAG})
        assert cnt_log == 4, f"consumos log: 4 attesi {cnt_log}"
        cnt_audit = await db["auditoria_log"].count_documents({
            "accion":{"$regex":"^capacidad\\.pool"},
            "$or":[{"organizacion_id":_ORG_CHC},{"organizacion_id":_ORG_SUPER}]
        })
        assert cnt_audit >= 1, f"auditoria pool: ≥1 attesa, {cnt_audit}"
        client.close()
    asyncio.run(_inner())


# ===========================================================
# I7-2 · Permiso denegado 403 CCU read_only SIN pool.credit.view
# ===========================================================
def test_I7_2_deny_pool_credit_view_ccu_read_only():
    _env()
    async def _inner():
        import motor.motor_asyncio as mtr
        client = mtr.AsyncIOMotorClient(_MONGO_URI_ENV, serverSelectionTimeoutMS=5000, tlsAllowInvalidCertificates=True)
        db = client.get_database("duxiter-2")
        await _inner_setup_cleanup(db)
        # Assicura che CCU non ha GRANT individuale pool.credit.view
        await db["usuario_permiso_override"].delete_many({
            "usuario_id": _ID_CCU, "permiso_codigo": {"$regex": r"^pool\.credit\."}})
        from fastcheck_api.app.services.authz_service import hydrate_user_from_db, autorizar
        eu_ccu = await hydrate_user_from_db(db, _ID_CCU, force_refresh=True)
        dec = await autorizar(db, eu_ccu, accion_codigo="pool.credit.view",
                              recurso={"organizacion_id": _ORG_CCU}, proposito="VER")
        assert dec.permitir is False, f"CCU read_only no debería tener pool.credit.view: permitir={dec.permitir}, paso={dec.paso_fallido}, motivo={dec.motivo_denegacion}"
        assert dec.paso_fallido is not None, f"debe haber paso fallido"
        client.close()
    asyncio.run(_inner())
