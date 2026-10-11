#!/usr/bin/env python3
"""
 004_indices.down.py
 =====================
 Elimina indici aggiunti in 004 (indici preesistenti non vengono toccati:
 non si elimina _id o uk_permisos_codigo creati in 001).
"""
from __future__ import annotations
from pymongo.database import Database

from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path

# Import specs dallo script up (stessa directory)
_up_path = Path(__file__).parent / "004_indices.up.py"
_spec = spec_from_file_location("_m004_up", str(_up_path))
_mod = module_from_spec(_spec)  # type: ignore
assert _spec and _spec.loader
_spec.loader.exec_module(_mod)


def down(db: Database) -> str:
    count = 0
    for coll_name, _keys, opts in _mod.INDICE_SPECS:
        name = opts.get("name")
        if not name:
            continue
        try:
            db[coll_name].drop_index(name)
            count += 1
        except Exception:
            pass
    return f"Rollback 004: {count} indici eliminati (name lookup)."
