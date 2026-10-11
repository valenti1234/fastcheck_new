#!/usr/bin/env python3
"""005 down · Rollback expansión colaboracion. SAFETY solo duxiter-2."""
from __future__ import annotations
from pymongo.database import Database


def down(db: Database) -> None:
    assert db.name == "duxiter-2", "[SAFETY LOCK] 005 down SOLO en duxiter-2."
    db["__rbac_migrations_version"].update_one({"_id": "state"}, {"$pull": {"applied": "005"}})
    codigos = ["comment.read", "comment.delete", "tag.read", "tag.write", "tag.manage_restricted", "tag.grant"]
    db["permisos"].delete_many({"codigo": {"$in": codigos}})
    db["rol_permiso"].delete_many({"permiso_codigo": {"$in": codigos}})
    for c in ("comentarios_v2", "catalogo_etiquetas"):
        if c in db.list_collection_names():
            db[c].drop()
