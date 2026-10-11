#!/usr/bin/env python3
"""
 002_estructura_organizacional.down.py
 ======================================
 Elimina collezioni org create in 002.
"""
from __future__ import annotations
from pymongo.database import Database

COLL = [
    "organizaciones",
    "paises",
    "unidades_organizacionales",
    "areas_funcionales",
]

def down(db: Database) -> str:
    count = 0
    for c in COLL:
        n = db[c].count_documents({})
        db[c].delete_many({})
        count += n
    return f"Rollback 002: {count} documenti eliminati in {len(COLL)} collezioni"
