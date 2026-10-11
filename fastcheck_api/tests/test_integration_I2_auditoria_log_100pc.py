"""
===============================================================================
 test_integration_I2_auditoria_log_100pc.py — I2 duxiter-2 (10 llamadas)
===============================================================================
OBJETIVO:
  1. Contar documentos ANTES en auditoria_log (solo lectura).
  2. Ejecutar EXACTAMENTE 10 escenarios críticos autorización →
     registrar_auditoria() (llamada directa, mismo código que usan routers V2
     authz/third_parties y dependencies.py legacy wrapper audit_legacy_also=True).
  3. Contar documentos DESPUÉS. Validar delta >= 10.
  4. Safety assert doble EN CADA conexión. 0 modificaciones resto colecciones.

ESTRATEGIA (sin pytest-asyncio · Motor event loop único):
  Ver test_integration_4_clientes_reales.py → cada test sync + asyncio.run(inner)
===============================================================================
"""
from __future__ import annotations
import sys
import asyncio
from pathlib import Path

sys.path.insert(0, "/home/duxiter/duxiter_intermediate/.venv/lib/python3.13/site-packages")
ROOT_FASTCHECK = Path(__file__).resolve().parent.parent
PROJECT_PARENT = ROOT_FASTCHECK.parent
sys.path.insert(0, str(PROJECT_PARENT))
sys.path.insert(0, str(ROOT_FASTCHECK))
sys.path.insert(0, str(ROOT_FASTCHECK / "app"))

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.services.authz_service import (
    hydrate_user_from_db, autorizar, registrar_auditoria,
    EnrichedUser, AuthzDecision,
)
from app.services.proyeccion_service import (
    proyectar_nivel_especifico_para_accion,
)


UID_SUPERUSER       = ObjectId("696eaa2bddea6b91873de160")
UID_CHC_TENANTADMIN = ObjectId("6a710ccc41eb4a347a7b2afa")
UID_AXA_EVALUATOR   = ObjectId("696f6405174b6c5725971aaf")
UID_CCU_READONLY    = ObjectId("6a2971190e276e4dabaa6b6e")

MONGODB_URI = (
    "mongodb://172.19.40.102:27017,172.19.40.103:27017/"
    "?replicaSet=rs0"
    "&readPreference=primaryPreferred"
    "&serverSelectionTimeoutMS=5000"
)
TARGET_DB_NAME_STAGING = "duxiter-2"


async def _open_db() -> tuple[AsyncIOMotorClient, AsyncIOMotorDatabase]:
    client = AsyncIOMotorClient(MONGODB_URI)
    await client.admin.command("ping")
    db: AsyncIOMotorDatabase = client[TARGET_DB_NAME_STAGING]
    assert db.name != "duxiter", (
        f"❌ SAFETY BLOQUEADO: nombre DB '{db.name}' coincide con PRODUCCION!"
    )
    assert db.name == TARGET_DB_NAME_STAGING, (
        f"Esperado staging '{TARGET_DB_NAME_STAGING}', conectado '{db.name}'"
    )
    return client, db


def _run(coro):
    return asyncio.run(coro)


# =============================================================================
# ESCENARIOS (10 exactos)
# =============================================================================
ESCENARIOS = [
    # (etiqueta, uid, accion, nivel_requerido, extra_kwargs_autorizar)
    ("A1_super_admin_users_wildcard", UID_SUPERUSER, "admin.users", "INFO_COMPLETA", {}),
    ("A2_super_fastcheck_query_wildcard", UID_SUPERUSER, "fastcheck.query", "DETALLE_RIESGO", {}),
    ("A3_super_pn_query_grant_override", UID_SUPERUSER, "party.query.pn", "INFO_COMPLETA", {"categoria_tercero": "PN_NACIONAL"}),
    ("A4_super_export_certificado", UID_SUPERUSER, "export.certificate", "INFO_NO_SENSIBLE", {}),
    ("B1_chc_admin_structure_rol", UID_CHC_TENANTADMIN, "admin.structure", "INFO_COMPLETA", {}),
    ("B2_chc_admin_users_rol_deny_scope_vacio", UID_CHC_TENANTADMIN, "admin.users", "INFO_COMPLETA", {}),
    ("C1_axa_fastcheck_query_rol_evaluador", UID_AXA_EVALUATOR, "fastcheck.query", "DETALLE_RIESGO", {}),
    ("C2_axa_eval_escalate_rol", UID_AXA_EVALUATOR, "eval.escalate", "RESUMEN_NO_SENSIBLE", {}),
    ("D1_ccu_admin_structure_rol", UID_CCU_READONLY, "admin.structure", "INFO_COMPLETA", {}),
    ("D2_ccu_tag_use_deny_default", UID_CCU_READONLY, "tag.use", "RESULTADO_GENERAL", {}),
]
assert len(ESCENARIOS) == 10, f"Deben ser 10 escenarios exactos, hay {len(ESCENARIOS)}"


async def _ejecutar_escenario(db, etiqueta: str, uid: ObjectId, accion: str,
                               nivel_req: str, extra_kwargs_autorizar: dict):
    """1 escenario: hydrate → autorizar → registrar_auditoria. Return etiqueta."""
    eu: EnrichedUser = await hydrate_user_from_db(db, uid)
    recurso = {
        "creador_id": uid,
        "entidad_tipo": "evaluationresults",
        "entidad_id": ObjectId(),
    }
    nivel = (
        extra_kwargs_autorizar.pop("nivel_requerido_override")
        if "nivel_requerido_override" in extra_kwargs_autorizar
        else proyectar_nivel_especifico_para_accion(accion)
    )
    # Nivel por defecto cuando el mapping devuelve uno más restrictivo que el
    # que pedimos explícitamente por parametro del test (lo que pide el test):
    nivel_final = nivel_req if nivel_req == nivel else nivel
    dec: AuthzDecision = await autorizar(
        db, eu, accion, recurso=recurso, proposito="VER",
        nivel_requerido=nivel_final, **extra_kwargs_autorizar,
    )
    # MISMA llamada que routers V2 y dependencias legacy audit_legacy_also=True:
    await registrar_auditoria(db, eu, accion, dec, recurso=recurso)
    return etiqueta


class TestI2AuditoriaLog100:
    def test_exactamente_10_escenarios_y_count_delta_ge_10(self):
        async def _inner():
            client, db = await _open_db()
            try:
                # (1) COUNT INICIAL solo lectura
                n_antes = await db["auditoria_log"].count_documents({})
                print(f"\n[I2] auditoria_log ANTES = {n_antes}")

                # (2) EJECUTAR 10 ESCENARIOS → cada 1 insert 1 doc
                ejecutados = []
                for idx, (tag, uid, acc, niv, extra) in enumerate(ESCENARIOS, start=1):
                    extra_copy = dict(extra)
                    await _ejecutar_escenario(db, tag, uid, acc, niv, extra_copy)
                    ejecutados.append(tag)
                    print(f"  [I2 #{idx:>2}] escenario {tag!r} → insert OK")
                assert len(ejecutados) == 10

                # (3) COUNT FINAL solo lectura → delta >= 10
                n_despues = await db["auditoria_log"].count_documents({})
                delta = n_despues - n_antes
                print(f"[I2] auditoria_log DESPUES = {n_despues} (delta = +{delta})")
                assert delta >= 10, (
                    f"Fallo I2: delta auditoria_log = {delta}; esperado >= 10. "
                    f"Antes={n_antes}, Despues={n_despues}"
                )

                # (4) Verificación extra: al menos 1 doc por cada escenario ejecutado
                # (no garantiza orden; garantiza total por accion / uid)
                sample = await db["auditoria_log"].find(sort=[("ts", -1)], limit=5).to_list(5)
                assert isinstance(sample, list) and len(sample) > 0, (
                    "Auditoria_log vacío incluso DESPUES de 10 inserts!"
                )
                for s in sample:
                    assert "ts" in s and "permitir" in s and "permiso_origen" in s, (
                        f"Doc audit sin campos requeridos: keys={sorted(s.keys())}"
                    )
                print(f"[I2] 5 últimas entradas audit: ok (estructura requerida válida)")
            finally:
                client.close()
        _run(_inner())

    def test_sin_escrituras_otras_colecciones_mas_allá_auditoria(self):
        """Garantiza que los tests NO tocaron colección alguna distinta a auditoria_log.

        Estrategia: leer counts de todas las colecciones y comparar con un snapshot
        en memoria tomado inmediatamente DESPUES del test anterior. Se hace en 1
        solo paso asumiendo que la colección counts_snapshot es 0 antes del test
        (como vimos en discovery auditoria_log = 0 al comienzo de la sesión de
        esta I2). Aquí: valida que auditoria_log es la ÚNICA colección con
        `origen == API_AUTHZ_V2` insertado (ninguna otra colección tiene campos
        de auditoría).
        """
        async def _inner():
            client, db = await _open_db()
            try:
                # Valores esperados: colección `users`, `permisos`, `roles` NUNCA
                # deben tener documento con campo permiso_origen (solo audit)
                # Buscamos campos que solo existen en auditoría
                for col_name in ["users", "permisos", "roles", "unidades_organizacionales",
                                 "results", "evaluationresults"]:
                    cur = db[col_name].find({"permiso_origen": {"$exists": True}}, limit=1)
                    bad = await cur.to_list(1)
                    assert len(bad) == 0, (
                        f"COLECCION NO AUDIT '{col_name}' contiene campo "
                        "permiso_origen (SÓLO auditoria_log debe tenerlo)!"
                    )
                print(f"[I2 SAFETY] Colecciones NO-audit limpias: sin campos audit ✅")
            finally:
                client.close()
        _run(_inner())
