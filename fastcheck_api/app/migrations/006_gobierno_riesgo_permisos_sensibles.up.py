#!/usr/bin/env python3
"""
006_gobierno_riesgo_permisos_sensibles.up.py
=============================================
Bloque 2.4 FASE2 · Gobierno Riesgo 4 permisos SENSIBLES.

SAFETY LOCK L2 runner.py: SOLO duxiter-2.
Acciones:
  A) Marcar 4 permisos risk.* como es_sensible=True + categoria=GOBIERNO_RIESGO
     + escalamiento_nivel_default=1 (Q4: escalamiento 3 niveles, nivel grant
     sensible por defecto = 1).
  B) Eliminar 5 documentos huérfanos de rol_permiso (rol_nombre None o
     rol_codigo None) — seed defectuoso F0. L10: SENSIBLES NO heredables de
     rol; sólo GRANT individual usuario_permiso_override.sensible_confirmado=true.
  C) Crear 3 colecciones nuevas v2 gobierno-riesgo:
       - listas_propias_v2          (listas blancas / negras tenant)
       - config_umbrales_riesgo     (umbrales semáforo + pesos Q4 esc)
       - config_formulas_scoring    (fórmulas scoring custom)
     Cada una lleva índice único compuesto (organizacion_id) o
     (organizacion_id, tipo_lista) para garantizar 1 config por tenant.
  D) Añadir "006" a __rbac_migrations_version.applied.
"""
from __future__ import annotations
from pymongo.database import Database


SENS_RIESGO: list[str] = [
    "risk.lists.manage",
    "risk.params.define",
    "risk.thresholds.edit",
    "risk.formula.edit",
]

COLECCIONES_NUEVAS: dict[str, list[tuple[str, tuple, dict]]] = {
    "listas_propias_v2": [
        ("idx_006_listas_org_tipo_unico",
         ("organizacion_id", 1), ("tipo_lista", 1),
         {"unique": True, "background": True}),
        ("idx_006_listas_creado_en", ("creado_en", -1), ("background", True)),
    ],
    "config_umbrales_riesgo": [
        ("idx_006_umbrales_org_unico",
         ("organizacion_id", 1), {"unique": True, "background": True}),
    ],
    "config_formulas_scoring": [
        ("idx_006_formulas_org_unico",
         ("organizacion_id", 1), {"unique": True, "background": True}),
    ],
}


def up(db: Database, *, now_iso: str | None = None) -> str:
    """Aplica migracion 006. Idempotente via update_one + create_collection check."""
    assert db.name == "duxiter-2", \
        f"[SAFETY LOCK L2] 006 up SOLO en duxiter-2. DB={db.name!r}."
    from datetime import datetime
    now = now_iso or datetime.utcnow().isoformat()

    # ------------------------------------------------------------------ A)
    updates_permiso = 0
    for cod in SENS_RIESGO:
        r = db["permisos"].update_one(
            {"codigo": cod},
            {"$set": {
                "es_sensible": True,
                "nivel_sensible": True,
                "categoria": "GOBIERNO_RIESGO",
                "escalamiento_nivel_default": 1,
                "actualizado_en": now,
            }},
        )
        updates_permiso += r.modified_count

    # ------------------------------------------------------------------ B)
    # Solo cancelliamo orphans de PERMISOS SENSIBLES GOBIERNO riesgo (L10).
    # Il resto (admin.structure, fastcheck.query, etc.) puede tener rol_nombre
    # NULL por seed legacy F0 ma tener rol_codigo válido: TOCAR ESOS ROMPE la
    # matriz de permisos FASE0/FASE1 confirmada 71/71 PASS.
    del_orphans = db["rol_permiso"].delete_many({
        "permiso_codigo": {"$regex": "^risk\\."},
        "$or": [
            {"rol_nombre": None},
            {"rol_codigo": None},
            {"rol_nombre": {"$exists": False}},
            {"rol_codigo": {"$exists": False}},
        ],
    })

    # ------------------------------------------------------------------ C)
    for col_name, indices in COLECCIONES_NUEVAS.items():
        if col_name not in db.list_collection_names():
            db.create_collection(col_name)
        for idx_def in indices:
            try:
                nombre = idx_def[0]
                if len(idx_def) == 3:
                    # caso col unica: (nombre, (campo,dir), opts)
                    campo_dir, opts = idx_def[1], idx_def[2]
                    key = [campo_dir]
                else:
                    # (nombre, (c1,d1), (c2,d2), opts)
                    key = [idx_def[1], idx_def[2]]
                    opts = idx_def[3]
                db[col_name].create_index(key, name=nombre, **opts)
            except Exception:
                pass

    # ------------------------------------------------------------------ D)
    db["__rbac_migrations_version"].update_one(
        {"_id": "state"},
        {"$addToSet": {"applied": "006"}, "$set": {"actualizado_en": now}},
        upsert=True,
    )

    return (
        f"PERMISOS actualizados es_sensible+escal=4 ({updates_permiso} docs). "
        f"rol_permiso orphans eliminados={del_orphans.deleted_count}. "
        f"3 colecciones nuevas listas/config/formula creadas + índices únicos. "
        f"state.applied += 006."
    )
