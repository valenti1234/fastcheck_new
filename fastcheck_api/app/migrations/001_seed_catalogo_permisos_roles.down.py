#!/usr/bin/env python3
"""
 001_seed_catalogo_permisos_roles.down.py
 ======================================
 Rollback completo: elimina collezioni create in 001.
 (Siccome sono cataloghi base seed, solo il loro contenuto viene eliminato,
 non la collezione per preservare eventuali indici custom aggiunti dopo.)
"""
from __future__ import annotations
from pymongo.database import Database


def down(db: Database) -> str:
    count = 0
    for coll_name in [
        "permisos",
        "roles",
        "rol_permiso",
        "nivel_info",
        "tipo_tercero_categoria",
    ]:
        res = db[coll_name].delete_many({})
        count += res.deleted_count
    return f"Rollback 001 completato. Documenti eliminati: {count} collezioni (5)"
