#!/usr/bin/env python3
"""
 003_usuarios_to_authz_v2.down.py
 ==================================
 Rollback: elimina tutti i documenti creati in 003 e rimuove
 i campi authz_v2_migrated / cache_version / legacy_role dagli users.
"""
from __future__ import annotations
from pymongo.database import Database


def down(db: Database) -> str:
    new_coll = [
        "usuario_rol", "usuario_unidad", "usuario_producto",
        "usuario_tipo_tercero", "usuario_nivel_info", "usuario_alcance",
        "usuario_permiso_override",
    ]
    total = 0
    for c in new_coll:
        res = db[c].delete_many({})
        total += res.deleted_count
    if "users" in db.list_collection_names():
        db.users.update_many({}, {"$unset": {
            "authz_v2_migrated": "",
            "cache_version": "",
            "legacy_role": "",
        }})
    return f"Rollback 003: documenti eliminati={total}, campi users unset."
