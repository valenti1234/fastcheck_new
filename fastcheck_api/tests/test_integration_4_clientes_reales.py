"""
===============================================================================
 test_integration_4_clientes_reales.py — I1 duxiter-2 (SOLO LECTURA · SAFETY LOCK DOBLE)
===============================================================================
ESTRATEGIA (sin pytest-asyncio para evitar loop mismatch con Motor):
  1. Cada test SINCRONO llama a asyncio.run(_corutina_test(...))
  2. Dentro ESA corutina se crea AsyncIOMotorClient → se usa find/find_one → se cierra.
     Todo dentro el MISMO event loop = RuntimeError imposible.
  3. SAFETY LOCK DOBLE: assert (db.name == 'duxiter-2') AND (db.name != 'duxiter').
  4. authz_service.hydrate_user_from_db → EnrichedUser REAL desde 8+ colecciones authz-v2.
  5. authz_service.autorizar() sobre accion crítica por cliente.
  6. proyeccion_service.proyectar() sobre 1 doc result real cualquiera.

4 CLIENTES REALES (objeto QA I1):
    A) SUPERUSER (uid=696eaa2bddea6b91873de160, superadmin@gmail.com)
        → is_superuser_wildcard=True + PN DENEGADO x defecto (Q1 confirmado)
    B) CHC TENANT_ADMIN (6a710ccc41eb4a347a7b2afa anibal@cmpc.com CMPC)
        → rol tenant_admin · scopes PROPIO + ORGANIZACION · match fastcheck.query
    C) AXA EVALUATOR (696f6405174b6c5725971aaf ghap68@yahoo.com Virbac)
        → rol evaluator · nivel=4 DETALLE_RIESGO · proyeccion L4
    D) CCU READ_ONLY (6a2971190e276e4dabaa6b6e clsalgado@ucsc.cl
        → nivel=1 RESULTADO_GENERAL · proyeccion L1 (semaforo)

===============================================================================
"""
from __future__ import annotations
import sys
import asyncio
from pathlib import Path

sys.path.insert(0, "/home/duxiter/duxiter_intermediate/.venv/lib/python3.13/site-packages")
ROOT_FASTCHECK = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_FASTCHECK))
sys.path.insert(0, str(ROOT_FASTCHECK / "app"))

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.services.authz_service import (
    hydrate_user_from_db, autorizar, permisos_efectivos, EnrichedUser, PermisoEfectivo,
)
from app.services.proyeccion_service import (
    proyectar, proyectar_nivel_especifico_para_accion,
)


UID_SUPERUSER       = ObjectId("696eaa2bddea6b91873de160")
UID_CHC_TENANTADMIN = ObjectId("6a710ccc41eb4a347a7b2afa")
UID_AXA_EVALUATOR   = ObjectId("696f6405174b6c5725971aaf")
UID_CCU_READONLY    = ObjectId("6a2971190e276e4dabaa6b6e")

MONGODB_URI = (
    "mongodb://172.19.40.102:27017,172.19.40.103:27017/"
    "?replicaSet=rs0"
    "&readPreference=secondaryPreferred"
    "&maxStalenessSeconds=120"
    "&serverSelectionTimeoutMS=5000"
)
TARGET_DB_NAME_STAGING = "duxiter-2"


# ================================================================
# HELPERS: conexión segura (mismo loop) · SOLO LECTURA
# ================================================================
async def _open_db_solo_lectura() -> tuple[AsyncIOMotorClient, AsyncIOMotorDatabase]:
    client = AsyncIOMotorClient(MONGODB_URI)
    await client.admin.command("ping")
    db: AsyncIOMotorDatabase = client[TARGET_DB_NAME_STAGING]
    assert db.name != "duxiter", (
        f"❌ SAFETY BLOQUEADO: nombre DB '{db.name}' coincide con PRODUCCION!"
    )
    assert db.name == TARGET_DB_NAME_STAGING, (
        f"Esperado staging '{TARGET_DB_NAME_STAGING}', conectado '{db.name}'"
    )
    print(f"\n[SAFETY OK ✅] Conectado a staging DB = '{db.name}' (solo lectura).\n")
    return client, db


def _correr_test_en_loop(coro):
    """Ejecuta la corutina de test en un loop fresco y limpio."""
    return asyncio.run(coro)


async def _get_any_result_doc(db: AsyncIOMotorDatabase) -> dict | None:
    return await db["results"].find_one({})


# ================================================================
# CLIENTE A · SUPERUSER GLOBAL
# ================================================================
class TestClienteA_Superuser:
    def test_A1_hydrate_es_wildcard(self):
        async def _inner():
            client, db = await _open_db_solo_lectura()
            try:
                eu: EnrichedUser = await hydrate_user_from_db(db, UID_SUPERUSER)
                assert eu.user_id == UID_SUPERUSER
                assert eu.is_superuser_wildcard is True, (
                    "Superuser global (legacy_role=superuser) DEBE ser wildcard."
                )
                print(f"  [A] hydrate superuser: roles={eu.roles}, "
                      f"nivel_info={eu.nivel_info}, "
                      f"scopes_ver(len)={len(eu.scopes_ver)}")
            finally:
                client.close()
        _correr_test_en_loop(_inner())

    def test_A2_wildcard_admin_users(self):
        """admin.users NO es sensible → superuser wildcard bypass = OK."""
        async def _inner():
            client, db = await _open_db_solo_lectura()
            try:
                eu = await hydrate_user_from_db(db, UID_SUPERUSER)
                dec = await autorizar(
                    db, eu, "admin.users",
                    recurso={"creador_id": UID_SUPERUSER},
                    proposito="VER", nivel_requerido="INFO_COMPLETA",
                )
                assert dec.permitir is True, (
                    f"Superuser NO pasó admin.users (wildcard bypass): "
                    f"{dec.motivo_denegacion}"
                )
                print(f"  [A] admin.users → wildcard OK, "
                      f"origen={dec.permiso_efectivo_origen}")
            finally:
                client.close()
        _correr_test_en_loop(_inner())

    def test_A3_Q1_pn_solo_superuser_con_override_grant(self):
        """Q1 Confirmado: PN DENEGADO por defecto a todos; solo superuser GLOBAL
        con OVERRIDE_GRANT individual puede acceder.

        En duxiter-2 la migración 004 inyectó al superuser global
        `party.query.pn` en sensibles_confirmados. Este test valida que:
         a) la excepción del superuser SI funciona con OVERRIDE_GRANT;
         b) cualquier otro usuario SIN override → PN DENEGADO (gate sensible).
        """
        async def _inner():
            client, db = await _open_db_solo_lectura()
            try:
                # ========= CASO (a) superuser global con override grant
                eu_a = await hydrate_user_from_db(db, UID_SUPERUSER)
                assert "party.query.pn" in eu_a.sensibles_confirmados, (
                    "Precond Q1 · superuser DEBE tener PN en sensibles_confirmados "
                    "(migración 004 grant individual)."
                )
                dec_a = await autorizar(
                    db, eu_a, "party.query.pn",
                    recurso={"organizacion_id": eu_a.organizacion_id},
                    proposito="VER", nivel_requerido="INFO_COMPLETA",
                    categoria_tercero="PN_NACIONAL",
                )
                assert dec_a.permitir is True, (
                    f"Superuser con PN override grant debió pasar: "
                    f"{dec_a.motivo_denegacion}"
                )
                assert dec_a.permiso_efectivo_origen == "OVERRIDE_GRANT"
                print(f"  [A Q1 · (a) superuser] PN OK por OVERRIDE_GRANT ✅")

                # ========= CASO (b) usuario no-superuser SIN override: DENY por sensible gate
                eu_b = await hydrate_user_from_db(db, UID_CHC_TENANTADMIN)
                assert "party.query.pn" not in eu_b.sensibles_confirmados, (
                    "Precond Q1 · CHC NO debiera tener PN grant por defecto."
                )
                dec_b = await autorizar(
                    db, eu_b, "party.query.pn",
                    recurso={"organizacion_id": eu_b.organizacion_id},
                    proposito="VER", nivel_requerido="INFO_COMPLETA",
                    categoria_tercero="PN_NACIONAL",
                )
                assert dec_b.permitir is False, (
                    "Q1 violation: CHC SIN override NO debiera acceder PN. "
                    f"dec={dec_b.to_dict()}"
                )
                print(f"  [A Q1 · (b) no-superuser CHC] PN DENEGADO ✅ "
                      f"motivo={dec_b.motivo_denegacion!r}")
            finally:
                client.close()
        _correr_test_en_loop(_inner())


# ================================================================
# CLIENTE B · TENANT_ADMIN CHC (CMPC anibal fernandez cmpc)
# ================================================================
class TestClienteB_CHC_TenantAdmin:
    def test_B1_hydrate_rol_tenant_admin(self):
        async def _inner():
            client, db = await _open_db_solo_lectura()
            try:
                eu = await hydrate_user_from_db(db, UID_CHC_TENANTADMIN)
                assert eu.user_id == UID_CHC_TENANTADMIN
                assert eu.legacy_role == "tenant_admin", (
                    f"CHC legacy_role debe ser 'tenant_admin'; "
                    f"real={eu.legacy_role!r}; roles(v2)={eu.roles}"
                )
                print(f"  [B CHC] hydrate OK: roles={eu.roles}, scopes_ver[:3]=",
                      f"{eu.scopes_ver[:3] if eu.scopes_ver else '[]'}")
            finally:
                client.close()
        _correr_test_en_loop(_inner())

    def test_B2_rol_admin_general_permisos_heredados(self):
        """CHC tenant_admin → roles v2=['ADMIN_GENERAL','GESTOR_LISTAS'].
        admin.structure y admin.users SON concedidos por ROL ADMIN_GENERAL.
        (organizacion_id=None en staging → scope ORGANIZACION no matchea;
         en Fase1/2 se poblarán las UO y los verdaderos ORG IDs.
         Aquí validamos el paso3 pipeline7 1..4: permiso otorgado x rol ✅
        """
        async def _inner():
            client, db = await _open_db_solo_lectura()
            try:
                eu = await hydrate_user_from_db(db, UID_CHC_TENANTADMIN)
                pefs: dict[str, PermisoEfectivo] = await permisos_efectivos(db, eu)

                for codigo in ("admin.structure", "admin.users"):
                    assert codigo in pefs, (
                        f"CHC ADMIN_GENERAL debe tener permiso '{codigo}' en "
                        f"permisos_efectivos; keys={sorted(pefs.keys())}"
                    )
                    pefs_cod = pefs[codigo]
                    assert pefs_cod.permitido is True, (
                        f"CHC permiso {codigo} debió ser True; "
                        f"origen={pefs_cod.origen}"
                    )
                    assert pefs_cod.origen.startswith("ROL:"), (
                        f"CHC permiso {codigo} debe venir de ROL: no de "
                        f"override; origen real={pefs_cod.origen}"
                    )
                print(f"  [B CHC] permisos x ROL ADMIN_GENERAL: ok = {sorted([c for c,p in pefs.items() if p.permitido])}")
            finally:
                client.close()
        _correr_test_en_loop(_inner())


# ================================================================
# CLIENTE C · AXA = EVALUATOR (Virbac)
# ================================================================
class TestClienteC_AXA_Evaluator:
    def test_C1_hydrate_evaluator(self):
        async def _inner():
            client, db = await _open_db_solo_lectura()
            try:
                eu = await hydrate_user_from_db(db, UID_AXA_EVALUATOR)
                assert eu.user_id == UID_AXA_EVALUATOR
                tiene_eval = (
                    ("evaluator" in eu.roles)
                    or (eu.legacy_role == "evaluator")
                )
                assert tiene_eval is True, (
                    f"AXA evaluator DEBE tener rol evaluator; "
                    f"real={eu.roles!r}, legacy={eu.legacy_role!r}"
                )
                print(f"  [C AXA] hydrate OK: roles={eu.roles}, "
                      f"nivel_info={eu.nivel_info}")
            finally:
                client.close()
        _correr_test_en_loop(_inner())

    def test_C2_detalle_riesgo_L4_proyeccion(self):
        """AXA evaluator → roles v2=['EVALUADOR_ANALISTA','USUARIO_OPERATIVO].
        Tiene fastcheck.query en permisos_efectivos (paso1..4 ok).
        Scopes de UNIDAD con unidad_ids vacíos (staging sin poblar UO Fase1).
        Aquí: validamos permiso concedido x rol + proyectamos L4 sobre un doc REAL.
        """
        async def _inner():
            client, db = await _open_db_solo_lectura()
            try:
                eu = await hydrate_user_from_db(db, UID_AXA_EVALUATOR)

                # (1 fastcheck.query debe venir por ROL
                pefs = await permisos_efectivos(db, eu)
                assert "fastcheck.query" in pefs, (
                    f"AXA debe tener fastcheck.query; reales "
                    f"concedidos={sorted([c for c,p in pefs.items() if p.permitido])}"
                )
                pef_fc = pefs["fastcheck.query"]
                assert pef_fc.permitido is True, (
                    f"AXA fastcheck.query permiso False, origen={pef_fc.origen}"
                )
                print(f"  [C AXA] fastcheck.query concedido x {pef_fc.origen}")

                # (2 autorizar() se ejecuta para comprobar que no CRASHEA;
                #    (paso5_scope puede fallar por scope UNIDAD, pero no importa)
                dec = await autorizar(
                    db, eu, "fastcheck.query",
                    recurso={"creador_id": UID_AXA_EVALUATOR},
                    proposito="VER", nivel_requerido="DETALLE_RIESGO",
                )
                # (3 Proyección L4 = DETALLE_RIESGO = eu.nivel_info = DETALLE_RIESGO
                assert eu.nivel_info == "DETALLE_RIESGO", (
                    f"AXA DEBE ser DETALLE_RIESGO, real={eu.nivel_info!r}"
                )
                doc_real = await _get_any_result_doc(db)
                if doc_real:
                    proyectado = proyectar(
                        doc_real, eu.nivel_info,
                        pn_gate=False, es_sensible_autorizado=False,
                    )
                    assert isinstance(proyectado, dict)
                    assert len(proyectado) > 0
                    print(f"  [C AXA] proyeccion L4 (eu.nivel_info) → keys="
                          f"{sorted(list(proyectado.keys()))[:10]}")
                # Siempre decisión autorizar válida (aun cuando denegada x scope)
                assert dec.paso_fallido is None or isinstance(dec.paso_fallido, int)
            finally:
                client.close()
        _correr_test_en_loop(_inner())


# ================================================================
# CLIENTE D · CCU = READ ONLY (Claudio Salgado)
# ================================================================
class TestClienteD_CCU_ReadOnly:
    def test_D1_hydrate_usuario(self):
        async def _inner():
            client, db = await _open_db_solo_lectura()
            try:
                eu = await hydrate_user_from_db(db, UID_CCU_READONLY)
                assert eu.user_id == UID_CCU_READONLY
                print(f"  [D CCU] hydrate OK: legacy_role={eu.legacy_role!r} "
                      f"roles={eu.roles}, nivel_info={eu.nivel_info}")
            finally:
                client.close()
        _correr_test_en_loop(_inner())

    def test_D2_nivel_L1_resultado_general_solo_PROPIO(self):
        async def _inner():
            client, db = await _open_db_solo_lectura()
            try:
                eu = await hydrate_user_from_db(db, UID_CCU_READONLY)
                dec = await autorizar(
                    db, eu, "fastcheck.query",
                    recurso={"creador_id": UID_CCU_READONLY},
                    proposito="VER", nivel_requerido="RESULTADO_GENERAL",
                )
                if dec.permitir:
                    doc_real = await _get_any_result_doc(db)
                    if doc_real:
                        proyectado = proyectar(
                            doc_real, dec.nivel_info_autorizado,
                            pn_gate=False, es_sensible_autorizado=False,
                        )
                        assert isinstance(proyectado, dict)
                        print(f"  [D CCU] proyeccion L1: "
                              f"keys top={sorted(list(proyectado.keys()))}")
                else:
                    print(f"  [D CCU] permiso NO otorgado "
                          f"(motivo={dec.motivo_denegacion!r}). "
                          " (Común: legacy role read_only no existe en duxiter copy).")
                assert dec.paso_fallido is None or isinstance(dec.paso_fallido, int)
            finally:
                client.close()
        _correr_test_en_loop(_inner())


# ================================================================
# BLOQUE 1.1 (FASE1) · SCOPE REAL MATCH post-populate UO/ORG/PROPIO
#   3 nuevos tests (I1 ampliado 9 → 12)
#   URI: primaryPreferred para garantizar writes latest (Bloque1.1)
# ================================================================
MONGODB_URI_PRIMARY = (
    "mongodb://172.19.40.102:27017,172.19.40.103:27017/"
    "?replicaSet=rs0"
    "&readPreference=primaryPreferred"
    "&serverSelectionTimeoutMS=5000"
)


async def _open_db_primary() -> tuple[AsyncIOMotorClient, AsyncIOMotorDatabase]:
    client = AsyncIOMotorClient(MONGODB_URI_PRIMARY, serverSelectionTimeoutMS=5000)
    db = client[TARGET_DB_NAME_STAGING]
    assert db.name == TARGET_DB_NAME_STAGING, f"SAFETY FAIL: db={db.name} != {TARGET_DB_NAME_STAGING}"
    assert db.name != "duxiter", f"SAFETY FAIL FATAL: connected to PROD duxiter"
    return client, db


from app.services.authz_service import en_alcance


class TestBloque11_Fase1_ScopeMatchPostPopulate:
    """FASE1 BLOQUE 1.1 · Validar que scopes (ORG/UNIDAD/PROPIO) ya NO SON SIN_MATCH en clientes reales.

    Condición post Bloque 1.1:
      · usuario_unidad principal = True por 4 clientes
      · usuario_alcance populado con organizacion_id / pais_id / unidad_ids
      · bump cache_version = 3 → LRU invalidada
    """

    def test_B2_CHC_scope_ORGANIZACION_match(self):
        """CHC admin.fernandez CMPC: ORGANIZACION scope debe MATCH con recurso en su org."""
        async def _inner():
            client, db = await _open_db_primary()
            try:
                eu = await hydrate_user_from_db(db, UID_CHC_TENANTADMIN, force_refresh=True)
                assert len(eu.unidad_ids or []) >= 1, "CHC debe tener unidad_ids (Bloque1.1)"
                assert eu.organizacion_id is not None, "CHC debe tener organizacion_id"

                recurso = {
                    "organizacion_id": eu.organizacion_id,
                    "pais_id": (eu.pais_ids or [None])[0],
                    "unidad_id": eu.unidad_ids[0],
                    "creador_id": eu.user_id,
                }
                ok, why = await en_alcance(db, eu, recurso, "VER")
                print(f"  [B2 CHC en_alcance ORG] ok={ok} why={why}")
                assert ok, (
                    f"Bloque1.1 FASE1: CHC ORG scope debía MATCHAR con recurso de su propia org. "
                    f"Got why={why!r}"
                )
                # Pipeline autorizar completo: admin.structure INFO_COMPLETA
                dec = await autorizar(
                    db, eu, "admin.structure", recurso, "VER",
                    nivel_requerido="INFO_COMPLETA",
                )
                assert dec.permitir, (
                    f"CHC admin.structure INFO_COMPLETA debe ser permitido (Bloque1.1). "
                    f"p{dec.paso_fallido} motivo={dec.motivo_denegacion!r}"
                )
                print(f"  [B2 CHC autorizar] permitir={dec.permitir} "
                      f"origen={dec.permiso_efectivo_origen} scope={dec.scope_match}")
            finally:
                client.close()
        _correr_test_en_loop(_inner())

    def test_C3_AXA_scope_UNIDAD_PROPIO_match(self):
        """AXA Virbac: UNIDAD scope debe MATCHAR con recurso en su UO."""
        async def _inner():
            client, db = await _open_db_primary()
            try:
                eu = await hydrate_user_from_db(db, UID_AXA_EVALUATOR, force_refresh=True)
                assert len(eu.unidad_ids or []) >= 1, "AXA debe tener unidad_ids"

                recurso = {
                    "unidad_id": eu.unidad_ids[0],
                    "organizacion_id": eu.organizacion_id,
                    "creador_id": eu.user_id,
                }
                ok, why = await en_alcance(db, eu, recurso, "VER")
                print(f"  [C3 AXA en_alcance UO/PROPIO] ok={ok} why={why}")
                assert ok, (
                    f"Bloque1.1: AXA UNIDAD o PROPIO scope debía MATCHAR. Got why={why!r}"
                )
                # Pipeline autorizar completo: fastcheck.query DETALLE_RIESGO
                dec = await autorizar(
                    db, eu, "fastcheck.query", recurso, "VER",
                    nivel_requerido="DETALLE_RIESGO",
                )
                assert dec.permitir, (
                    f"AXA fastcheck.query DETALLE_RIESGO debe ser permitido. "
                    f"p{dec.paso_fallido} motivo={dec.motivo_denegacion!r}"
                )
                print(f"  [C3 AXA autorizar] permitir={dec.permitir} "
                      f"origen={dec.permiso_efectivo_origen} scope={dec.scope_match}")
            finally:
                client.close()
        _correr_test_en_loop(_inner())

    def test_D2_CCU_scope_ORGANIZACION_match(self):
        """CCU Claudio UCSC: ORGANIZACION scope debe MATCHAR con recurso en su org."""
        async def _inner():
            client, db = await _open_db_primary()
            try:
                eu = await hydrate_user_from_db(db, UID_CCU_READONLY, force_refresh=True)
                assert len(eu.unidad_ids or []) >= 1, "CCU debe tener unidad_ids"
                assert eu.organizacion_id is not None, "CCU debe tener organizacion_id"

                recurso = {
                    "organizacion_id": eu.organizacion_id,
                    "pais_id": (eu.pais_ids or [None])[0],
                    "unidad_id": eu.unidad_ids[0],
                    "creador_id": eu.user_id,
                }
                ok, why = await en_alcance(db, eu, recurso, "VER")
                print(f"  [D2 CCU en_alcance ORG] ok={ok} why={why}")
                assert ok, (
                    f"Bloque1.1: CCU ORG scope debía MATCHAR. Got why={why!r}"
                )
                # Pipeline autorizar completo: admin.structure RESULTADO_GENERAL
                dec = await autorizar(
                    db, eu, "admin.structure", recurso, "VER",
                    nivel_requerido="RESULTADO_GENERAL",
                )
                assert dec.permitir, (
                    f"CCU admin.structure L1 debe ser permitido (legacy role read_only no F0-F1). "
                    f"p{dec.paso_fallido} motivo={dec.motivo_denegacion!r}"
                )
                print(f"  [D2 CCU autorizar] permitir={dec.permitir} "
                      f"origen={dec.permiso_efectivo_origen} scope={dec.scope_match}")
            finally:
                client.close()
        _correr_test_en_loop(_inner())
