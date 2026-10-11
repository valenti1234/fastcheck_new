#!/usr/bin/env python3
"""
006_gobierno_riesgo_permisos_sensibles.down.py
===============================================
Rollback Bloque 2.4. No se restablecen docs borrados en rol_permiso
orphans (información destruida: se deja log por consistencia) pero sí se:
  1. Reverte 4 permisos risk.* a es_sensible=False + categoria original si
     habia o bien ""; elimina escalamiento_nivel_default.
  2. Elimina 3 colecciones nuevas listas_propias_v2 / config_umbrales_riesgo /
     config_formulas_scoring (tienen índice único por tenant = 0 data staging).
  3. Saca 006 de applied.
"""
from __future__ import annotations
from pymongo.database import Database


SENS_RIESGO: list[str] = [
    "risk.lists.manage",
    "risk.params.define",
    "risk.thresholds.edit",
    "risk.formula.edit",
]


def down(db: Database, *, now_iso: str | None = None) -> str:
    assert db.name == "duxiter-2", \
        f"[SAFETY LOCK L2] 006 down SOLO en duxiter-2. DB={db.name!r}."
    from datetime import datetime
    now = now_iso or datetime.utcnow().isoformat()

    # 1. Revert permisos 4 risk.*
    revertidos = 0
    for cod in SENS_RIESGO:
        r = db["permisos"].update_one(
            {"codigo": cod},
            {"$set": {"es_sensible": False, "nivel_sensible": False,
                      "actualizado_en": now,
                      "categoria": "GOBIERNO_RIESGO_DOWN"},
             "$unset": {"escalamiento_nivel_default": ""}},
        )
        revertidos += r.modified_count

    # 2. Drop colecciones nuevas (sólo si existen)
    dropeadas = 0
    for col in ["listas_propias_v2", "config_umbrales_riesgo", "config_formulas_scoring"]:
        if col in db.list_collection_names():
            db[col].drop()
            dropeadas += 1

    # 3. Sacar 006
    db["__rbac_migrations_version"].update_one(
        {"_id": "state"},
        {"$pull": {"applied": "006"}, "$set": {"actualizado_en": now}},
    )

    return (
        f"Revertidos 4 permisos risk.* ({revertidos} docs). "
        f"Colecciones nuevas dropeadas={dropeadas}. state.applied -= 006. "
        f"(NOTA: docs rol_permiso orphans Borrados en up NO recuperados.)"
    )
