"""
Conftest global Fase0 — authz_service unit tests (PURE NO DB).

FastcheckDBFake: Mock mínimo de AsyncIOMotorDatabase que implementa
solo los métodos usados por authz_service.py + proyeccion_service.py:
  db[<collection>].find(filter, projection) → async generator (AsyncCursorFake)
  db[<collection>].find_one(filter, projection) -> dict | None
  db[<collection>].insert_one(doc) -> None (no-op salvo para auditoria)

Los datasets se inyectan vía constructor: { 'permisos': [...], 'rol_permiso': [...], ... }
NO HAY CONEXIÓN A MONGO. 0 escrituras. 0 uso de duxiter / duxiter-2.
"""
from __future__ import annotations
import sys
import os
from pathlib import Path
from typing import Any, AsyncIterator

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent
VENV_SITE_PACKAGES = PROJECT_ROOT / ".venv" / "lib" / "python3.13" / "site-packages"
if VENV_SITE_PACKAGES.exists():
    sys.path.insert(0, str(VENV_SITE_PACKAGES))
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "app"))

from bson import ObjectId


class AsyncCursorFake:
    """Implementa async for (compatible con: async for x in coll.find({}))"""
    def __init__(self, docs: list[dict]):
        self._docs = list(docs)
        self._idx = 0

    def __aiter__(self) -> "AsyncCursorFake":
        return self

    async def __anext__(self) -> dict:
        if self._idx >= len(self._docs):
            raise StopAsyncIteration
        doc = self._docs[self._idx]
        self._idx += 1
        return doc


class CollectionFake:
    def __init__(self, nombre: str, docs: list[dict]):
        self.nombre = nombre
        self.docs: list[dict] = docs
        self.inserts: list[dict] = []

    def find(self, filtro: dict | None = None, projection: dict | None = None
             ) -> AsyncCursorFake:
        filtro = filtro or {}
        out: list[dict] = []
        for d in self.docs:
            ok = True
            for k, v in filtro.items():
                if k == "$in":
                    continue
                if isinstance(v, dict):
                    if "$in" in v:
                        vals = v["$in"]
                        dvals = d.get(k)
                        if isinstance(dvals, list):
                            if not any(str(x) in {str(y) for y in vals} for x in dvals) and str(d.get(k)) not in {str(y) for y in vals}:
                                ok = False; break
                        else:
                            if str(d.get(k)) not in {str(y) for y in vals}:
                                ok = False; break
                        continue
                    ok = False; break
                val_real = d.get(k)
                if isinstance(val_real, ObjectId) or isinstance(v, ObjectId):
                    if str(val_real) != str(v):
                        ok = False; break
                else:
                    if val_real != v:
                        ok = False; break
            if not ok:
                continue
            if projection:
                keep = {k: v for k, v in d.items()
                        if k == "_id" or k in projection and projection[k] != 0}
                out.append(keep)
            else:
                out.append(dict(d))
        return AsyncCursorFake(out)

    async def find_one(self, filtro: dict, projection: dict | None = None) -> dict | None:
        cur = self.find(filtro, projection)
        out: list[dict] = []
        async for r in cur:
            out.append(r)
        return out[0] if out else None

    async def insert_one(self, doc: dict) -> None:
        doc = dict(doc)
        if "_id" not in doc:
            doc["_id"] = ObjectId()
        self.inserts.append(doc)
        self.docs.append(doc)


class FastcheckDBFake:
    """Sustituto de AsyncIOMotorDatabase. NO HACE NADA EN DISCO."""
    def __init__(self, datasets: dict[str, list[dict]] | None = None):
        self.name = "duxiter-2-fake-UNIT-TESTS"
        self._cols: dict[str, CollectionFake] = {}
        for nombre, docs in (datasets or {}).items():
            self._cols[nombre] = CollectionFake(nombre, list(docs))
        self.name_collisions_safety = True  # assert safety solo para lectura

    def __getitem__(self, nombre: str) -> CollectionFake:
        if nombre not in self._cols:
            self._cols[nombre] = CollectionFake(nombre, [])
        return self._cols[nombre]

    def __contains__(self, nombre: str) -> bool:
        return nombre in self._cols
