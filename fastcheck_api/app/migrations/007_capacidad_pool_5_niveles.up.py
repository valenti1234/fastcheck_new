"""007 up · Bloque 2.5 Capacidad Pool 5 Niveles + Permisos pool.credit.*
Crea 4 colecciones nuevas con índices únicos:
  (A) pool_creditos_organizacion: 1 doc por org, índice único organizacion_id
  (B) usuario_limite_consumo_v2: 1 doc per (org,usuario,mes,anio) · índice compuesto único
  (C) consumos_log_v2: log consumos por operación
  (D) notificaciones_push: notificaciones soglie 90/100/120% créditos
+ Actualiza catálogo permisos: agrega 2 permisos nuevos `pool.credit.view` (N2) y `pool.credit.manage` (N3 SENSIBLE).
+ Seed 4 pool para 4 tenant I1 (CMPC=PRO NIV3, VIRBAC=STARTUP NIV2, UCSC=BASIC NIV1, SUPER=ENTERPRISE NIV5).
+ Seed plantilla rol_permiso SUPER y TENANT_ADMIN reciben pool.credit.*.
+ Actualiza __rbac_migrations_version.appended += 007
"""
from datetime import datetime
from bson import ObjectId

_MIGRATION_ID = "007"

# 4 orgs I1
ORGS = {
    "SUPER":   ObjectId("6ac127b7e2f379cf956f2576"),
    "CMPC":    ObjectId("6ac127c3e2f379cf956f2648"),  # CHC tenant_admin
    "VIRBAC":  ObjectId("6ac127bae2f379cf956f258b"),  # AXA
    "UCSC":    ObjectId("6ac127c0e2f379cf956f2609"),  # CCU read_only
}

# 5 niveles pool
NIVELES_POOL = [
    {"nivel":1, "nombre":"BASIC",      "creditos_mensuales_org":500,   "overshoot_pct_max":150, "usuarios_max":5},
    {"nivel":2, "nombre":"STARTUP",    "creditos_mensuales_org":2000,  "overshoot_pct_max":150, "usuarios_max":15},
    {"nivel":3, "nombre":"PRO",        "creditos_mensuales_org":10000, "overshoot_pct_max":150, "usuarios_max":50},
    {"nivel":4, "nombre":"BUSINESS",   "creditos_mensuales_org":50000, "overshoot_pct_max":150, "usuarios_max":200},
    {"nivel":5, "nombre":"ENTERPRISE", "creditos_mensuales_org":250000,"overshoot_pct_max":150, "usuarios_max":999},
]

# Mapeo 4 orgs → pool
ORG_POOL_MAP = {"SUPER":5, "CMPC":3, "VIRBAC":2, "UCSC":1}

# Permisos pool.credit nuevos
PERMISOS_NUEVOS = [
    {
        "codigo": "pool.credit.view",
        "nombre": "Ver Créditos y Consumo",
        "descripcion": "Permite visualizar pool créditos organización, consumo mensual, historial y estado saldo (lectura). No sensible.",
        "categoria": "CAPACIDAD_POOL",
        "nivel_info_asociado": "RESUMEN_NO_SENSIBLE",
        "es_sensible": False,
        "escalamiento_nivel_default": 1,
        "orden_menu": 2300,
        "requiere_organizacion": True,
    },
    {
        "codigo": "pool.credit.manage",
        "nombre": "Gestionar Plan de Créditos",
        "descripcion": "Permite modificar pool de créditos organizacional, asignar plan pool 5 niveles, agregar créditos manuales, resetear mensual, etc. Permiso SENSIBLE (L10): requiere confirm individual y escal≥3.",
        "categoria": "CAPACIDAD_POOL",
        "nivel_info_asociado": "DETALLE_RIESGO",
        "es_sensible": True,
        "escalamiento_nivel_default": 3,
        "orden_menu": 2310,
        "requiere_organizacion": True,
    },
]

# Plantilla rol_permiso por defecto
PLANTILLAS = [
    {"rol_codigo": "superadmin_global", "rol_nombre": "Superadmin Global", "permiso_codigo": "pool.credit.view",   "alcance":"GLOBAL", "otorgado_por_default": True},
    {"rol_codigo": "superadmin_global", "rol_nombre": "Superadmin Global", "permiso_codigo": "pool.credit.manage", "alcance":"GLOBAL", "otorgado_por_default": True},
    {"rol_codigo": "tenant_admin",      "rol_nombre": "Admin Tenant",     "permiso_codigo": "pool.credit.view",   "alcance":"ORG",    "otorgado_por_default": True},
    {"rol_codigo": "tenant_admin",      "rol_nombre": "Admin Tenant",     "permiso_codigo": "pool.credit.manage", "alcance":"ORG",    "otorgado_por_default": False},  # sensible: no default
    {"rol_codigo": "evaluator",         "rol_nombre": "Evaluador",        "permiso_codigo": "pool.credit.view",   "alcance":"ORG",    "otorgado_por_default": True},
]


async def up(db):
    now = datetime.utcnow().isoformat()
    # (A) pool_creditos_organizacion + índice único org
    await db.create_collection("pool_creditos_organizacion", check_exists=False)
    await db["pool_creditos_organizacion"].create_index("organizacion_id", unique=True, name="uniq_pool_org")
    # Seed 4 pools
    for org_name, org_id in ORGS.items():
        nivel = ORG_POOL_MAP[org_name]
        plan = next(n for n in NIVELES_POOL if n["nivel"] == nivel)
        saldo_inicial = plan["creditos_mensuales_org"]
        # Intentamos sync con legacy creditoperations ultima balanceAfter
        try:
            ult_op = await db["creditoperations"].find_one(
                {"tenantId": str(org_id)}, sort=[("createdAt", -1)]
            )
            if ult_op and isinstance(ult_op.get("balanceAfter"), (int, float)):
                saldo_inicial = max(0, int(ult_op["balanceAfter"]))
        except Exception:
            pass
        await db["pool_creditos_organizacion"].update_one(
            {"organizacion_id": org_id},
            {"$setOnInsert": {
                "organizacion_id": org_id,
                "nivel_pool_plan": nivel,
                "nombre_plan": plan["nombre"],
                "creditos_mensuales_org": plan["creditos_mensuales_org"],
                "overshoot_pct_max": plan["overshoot_pct_max"],
                "usuarios_max_plan": plan["usuarios_max"],
                "saldo_actual": saldo_inicial,
                "creditos_consumidos_mes": max(0, plan["creditos_mensuales_org"] - saldo_inicial),
                "mes_referencia": 10,  # Octubre 2026
                "anio_referencia": 2026,
                "sincro_legacy_at": now,
                "actualizado_en": now,
            }},
            upsert=True,
        )

    # (B) usuario_limite_consumo_v2 + índice compuesto único
    await db.create_collection("usuario_limite_consumo_v2", check_exists=False)
    await db["usuario_limite_consumo_v2"].create_index(
        [("organizacion_id", 1), ("usuario_id", 1), ("mes", 1), ("anio", 1)],
        unique=True, name="uniq_user_month_limit"
    )

    # (C) consumos_log_v2 + índice por org+fecha
    await db.create_collection("consumos_log_v2", check_exists=False)
    await db["consumos_log_v2"].create_index(
        [("organizacion_id", 1), ("createdAt", -1)], name="idx_consumos_org_ts"
    )
    await db["consumos_log_v2"].create_index(
        [("usuario_id", 1), ("createdAt", -1)], name="idx_consumos_user_ts"
    )

    # (D) notificaciones_push + índice
    await db.create_collection("notificaciones_push", check_exists=False)
    await db["notificaciones_push"].create_index(
        [("usuario_id", 1), ("leido", 1), ("createdAt", -1)], name="idx_push_user_leido_ts"
    )
    await db["notificaciones_push"].create_index(
        [("organizacion_id", 1), ("codigo_soglia", 1), ("mes", 1), ("anio", 1)],
        unique=True, sparse=True, name="uniq_soglia_org_mes_una_volta"
    )

    # Actualiza catálogo permisos: upsert pool.credit.*
    for p in PERMISOS_NUEVOS:
        doc = {**p, "actualizado_en": now}
        await db["permisos"].update_one({"codigo": p["codigo"]}, {"$set": doc}, upsert=True)

    # Plantillas rol_permiso (upsert safe)
    for r in PLANTILLAS:
        doc = {**r, "actualizado_en": now}
        await db["rol_permiso"].update_one(
            {"rol_codigo": r["rol_codigo"], "permiso_codigo": r["permiso_codigo"]},
            {"$set": doc}, upsert=True,
        )

    # Actualiza state
    await db["__rbac_migrations_version"].update_one(
        {"_id": "state"},
        {"$addToSet": {"applied": _MIGRATION_ID},
         "$set": {"last_applied": _MIGRATION_ID, "actualizado_en": now}},
        upsert=True,
    )
    print(f"[007 up] OK. 4 colecciones nuevas + 2 permisos pool.credit.* + {len(PLANTILLAS)} plantillas.")
