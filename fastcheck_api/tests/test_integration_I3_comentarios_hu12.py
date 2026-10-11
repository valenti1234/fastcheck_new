"""
Bloque 2.1 FASE 2 · Test HU-12 — Comentarios 3 niveles visibilidad
===================================================================
HU-12: Como usuario veo commentario VISIBLE, RESTRINGIDO al mi ROL, PERSONAL
       solo se io sono l'autor.
Safety lock: solo duxiter-2. write su comentarios_v2 con cleanup.

Tests:
  U3 = VISIBLE tutti stessa org
  U4 = PERSONAL solo autor (non admin)
  U5 = PERSONAL admin/auditor vedono tutti
  U6 = RESTRINGIDO(UNIDAD) solo membresía correcta

  I3-1 = VISIBLE: autor vede; SUPER vede; altro tenant NON vede
  I3-2 = PERSONAL: autor vede; SUPER vede; altri NON vedono
  I3-3 = RESTRINGIDO(UNIDAD): stessa UO vede; altra UO no; SUPER wildcard vede
"""
from __future__ import annotations

import asyncio
import os
from datetime import datetime
from typing import Any

import pytest
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from fastcheck_api.app.api.dependencies import CurrentUser
from fastcheck_api.app.api.v2.routers.comments import _filtro_visibilidad_lectura

URI = os.environ.get(
    "MONGODB_URI",
    "mongodb://172.19.40.102:27017,172.19.40.103:27017/duxiter-2?replicaSet=rs0&readPreference=primaryPreferred&serverSelectionTimeoutMS=5000",
)

U = {
    "A_SUPER": ObjectId("696eaa2bddea6b91873de160"),
    "B_CHC":   ObjectId("6a710ccc41eb4a347a7b2afa"),
    "C_AXA":   ObjectId("696f6405174b6c5725971aaf"),
    "D_CCU":   ObjectId("6a2971190e276e4dabaa6b6e"),
}

# --- ObjectId falsi validi per test unitari ------------------------------
OID_FAKE_ORG = "6ac127c3e2f379cf956f2648"
OID_FAKE_USR = "6a710ccc41eb4a347a7b2afa"
OID_FAKE_UO1 = "6ac127c3e2f379cf956f264a"
OID_FAKE_UO2 = "6fffffffffffffffffffffff"
OID_FAKE_UOX = "6bbbbbbbbbbbbbbbbbbbbbbb"


async def _get_db() -> AsyncIOMotorDatabase:
    client = AsyncIOMotorClient(URI, tz_aware=False)
    db = client.get_database("duxiter-2")
    assert db.name != "duxiter", f"[SAFETY L1] PRODUCCIÓN!! db={db.name!r}"
    assert db.name == "duxiter-2", f"[SAFETY L2] atteso duxiter-2 got {db.name}"
    return db


def _cu(user_doc: dict[str, Any]) -> CurrentUser:
    """Build CurrentUser: campi dimension (unidad_ids, organizacion_id, pais_ids, area_id)
    vengono dalla ROOT di users (aggiornata in Blq 1.1). authz_v2 dict è solo per force_v2_only/migrated/sensibles."""
    av2 = user_doc.get("authz_v2") if isinstance(user_doc.get("authz_v2"), dict) else {}
    return CurrentUser(
        id=str(user_doc["_id"]),
        email=user_doc.get("email", ""),
        role=user_doc.get("role", ""),
        tenant=str(user_doc.get("tenant", "")),
        legacy_role=user_doc.get("role", ""),
        organizacion_id=str(user_doc.get("organizacion_id") or user_doc.get("tenant", "")),
        pais_ids=[str(x) for x in (user_doc.get("pais_ids") or [])],
        unidad_ids=[str(x) for x in (user_doc.get("unidad_ids") or [])],
        area_id=str(user_doc.get("area_id")) if user_doc.get("area_id") else None,
        roles=list(av2.get("roles") or []),
        nivel_info=str(av2.get("nivel_info", "RESULTADO_GENERAL")),
        pn_authorized=bool(av2.get("pn_authorized")),
        cache_version=int(user_doc.get("cache_version", 1)),
        sensibles_confirmados=set(av2.get("sensibles_confirmados") or []),
        authz_v2_migrated=bool(user_doc.get("authz_v2_migrated", True) or av2.get("migrated")),
    )


def build_user(
    role: str, org_id: str, unidad_ids: list[str], area_id: str | None = None, user_id: str = OID_FAKE_USR
) -> CurrentUser:
    return CurrentUser(
        id=user_id, email="t@t.com", role=role, tenant=org_id, legacy_role=role,
        organizacion_id=org_id, pais_ids=["CL"], unidad_ids=unidad_ids, area_id=area_id,
        roles=[], nivel_info="INFO_COMPLETA", pn_authorized=False, cache_version=1,
        sensibles_confirmados=set(), authz_v2_migrated=True,
    )


# ===========================================================================
# U3-U6 test unitari (nessuna connessione DB)
# ===========================================================================
def test_U3_visible_tutti_stessa_org():
    u = build_user("tenant_admin", OID_FAKE_ORG, [OID_FAKE_UOX])
    f = _filtro_visibilidad_lectura(u, {})
    has_visible = any(b.get("visibilidad") == "VISIBLE" for b in f.get("$or", []))
    assert has_visible, f"manca branch VISIBLE in $or. filt={f}"


def test_U4_personale_solo_autor_non_admin():
    uid = "6a710ccc41eb4a347a7b2afa"
    u = build_user("evaluator", OID_FAKE_ORG, [OID_FAKE_UOX], user_id=uid)
    f = _filtro_visibilidad_lectura(u, {})
    personal = [b for b in f["$or"] if b.get("visibilidad") == "PERSONAL"][0]
    assert personal["autor_id"] == ObjectId(uid), f"autor_id mismatch {personal}"


def test_U5_personale_admin_vedono_tutti():
    u = build_user("tenant_admin", OID_FAKE_ORG, [OID_FAKE_UOX], user_id="6a710ccc41eb4a347a7b2afa")
    f = _filtro_visibilidad_lectura(u, {})
    personal = [b for b in f["$or"] if b.get("visibilidad") == "PERSONAL"][0]
    assert "autor_id" not in personal, f"admin NON deve avere filtro autor_id su PERSONAL: {personal}"


def test_U6_restringido_solo_sua_unita():
    u = build_user("evaluator", OID_FAKE_ORG, [OID_FAKE_UO1, OID_FAKE_UO2])
    f = _filtro_visibilidad_lectura(u, {})
    restr = [b for b in f["$or"] if b.get("visibilidad") == "RESTRINGIDO"]
    uo = [b for b in restr if b.get("ambito_restringido_tipo") == "UNIDAD"][0]
    assert uo["ambito_restringido_id"]["$in"] == [ObjectId(OID_FAKE_UO1), ObjectId(OID_FAKE_UO2)], uo


# ===========================================================================
# 3 test INTEGRAZIONE reali su duxiter-2
# ===========================================================================
def _load_users_sync() -> dict[str, dict]:
    async def _inner():
        db = await _get_db()
        try:
            out = {}
            for k, oid in U.items():
                d = await db["users"].find_one({"_id": oid})
                assert d, f"[I3 PRE] manca utente {k} {oid}"
                out[k] = d
            return out
        finally:
            db.client.close()
    return asyncio.run(_inner())


_USERS_CACHE: dict | None = None


def _users() -> dict[str, dict]:
    global _USERS_CACHE
    if _USERS_CACHE is None:
        _USERS_CACHE = _load_users_sync()
    return _USERS_CACHE


class TestIntegracionHU12:
    @property
    def test_tag(self) -> str:
        return getattr(self, "_tag", f"TEST_HU12_{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}")

    @pytest.fixture(autouse=True)
    def _init_and_cleanup(self):
        object.__setattr__(self, "_tag", f"TEST_HU12_{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}")
        async def _clean(flag):
            db = await _get_db()
            try:
                n = await db["comentarios_v2"].count_documents({"tags": self.test_tag})
                if n:
                    await db["comentarios_v2"].delete_many({"tags": self.test_tag})
                    print(f"\n   [cleanup {flag}] N={n}")
            finally:
                db.client.close()
        asyncio.run(_clean("PRE"))
        yield
        asyncio.run(_clean("POST"))

    def _insert(self, docs: list[dict]) -> list[ObjectId]:
        async def _inner():
            db = await _get_db()
            try:
                now = datetime.utcnow().isoformat()
                arr = []
                for d in docs:
                    u_doc = d["_user"]
                    arr.append({
                        "tercero_id": None,
                        "rut_clean": d["rut_clean"],
                        "tenantId": ObjectId(u_doc["tenant"]),
                        "organizacion_id": ObjectId(u_doc.get("organizacion_id") or u_doc["tenant"]),
                        "unidad_id": (u_doc.get("unidad_ids") or [None])[0],
                        "area_id": u_doc.get("area_id"),
                        "autor_id": u_doc["_id"],
                        "autor_email": u_doc.get("email"),
                        "contenido": d["contenuto"],
                        "visibilidad": d["visibilidad"],
                        "ambito_restringido_tipo": d.get("ambito_restringido_tipo"),
                        "ambito_restringido_id": ObjectId(d["ambito_restringido_id"]) if d.get("ambito_restringido_id") else None,
                        "mencionados_ids": [],
                        "tags": [self.test_tag] + list(d.get("tags_extra", [])),
                        "attachments": [],
                        "borrado_logico": False,
                        "creado_en": now,
                        "actualizado_en": now,
                    })
                if arr:
                    res = await db["comentarios_v2"].insert_many(arr)
                    return res.inserted_ids
                return []
            finally:
                db.client.close()
        return asyncio.run(_inner())

    def _count(self, cu: CurrentUser, rut_clean: str) -> int:
        async def _inner():
            db = await _get_db()
            try:
                base = {"rut_clean": rut_clean, "tags": self.test_tag}
                f = _filtro_visibilidad_lectura(cu, base)
                return await db["comentarios_v2"].count_documents(f)
            finally:
                db.client.close()
        return asyncio.run(_inner())

    # --- I3-1 VISIBLE -------------------------------------------------------
    def test_I3_1_visible_autor_super_vede_altro_tenant_no(self):
        users = _users()
        rut = "I31-VISIBLE-HU12"
        self._insert([{"_user": users["B_CHC"], "contenuto": "CHC visible", "visibilidad": "VISIBLE", "rut_clean": rut}])
        cuB = _cu(users["B_CHC"])
        cuA = _cu(users["A_SUPER"])
        cuC = _cu(users["C_AXA"])
        assert self._count(cuB, rut) == 1, "B vede suo VISIBLE"
        assert self._count(cuA, rut) == 1, "A SUPER wildcard vede VISIBLE"
        assert self._count(cuC, rut) == 0, "C NON vede commento altro tenant"

    # --- I3-2 PERSONAL ------------------------------------------------------
    def test_I3_2_personale_solo_autor_e_super(self):
        users = _users()
        rut = "I32-PERSONAL-HU12"
        self._insert([{"_user": users["B_CHC"], "contenuto": "CHC personale", "visibilidad": "PERSONAL", "rut_clean": rut}])
        cuB = _cu(users["B_CHC"])
        cuA = _cu(users["A_SUPER"])
        cuC = _cu(users["C_AXA"])
        cuD = _cu(users["D_CCU"])
        assert self._count(cuB, rut) == 1, "B vede proprio PERSONAL"
        assert self._count(cuA, rut) == 1, "A SUPER wildcard vede PERSONAL"
        assert self._count(cuC, rut) == 0, "C NON vede PERSONAL altro tenant"
        assert self._count(cuD, rut) == 0, "D NON vede PERSONAL altro tenant"

    # --- I3-3 RESTRINGIDO(UNIDAD) -------------------------------------------
    def test_I3_3_restringido_sola_unidad_corretta(self):
        users = _users()
        rut = "I33-RESTRINGIDO-HU12"
        B = users["B_CHC"]
        uo_B_list = B.get("unidad_ids") or []
        assert len(uo_B_list) >= 1, "B_CHC deve avere unidad_ids da Blq 1.1"
        uo_B = uo_B_list[0]
        uo_FAKE = ObjectId("ffffffffffffffffffffffff")
        self._insert([{
            "_user": B, "contenuto": "CHC restringito sua UO",
            "visibilidad": "RESTRINGIDO", "ambito_restringido_tipo": "UNIDAD",
            "ambito_restringido_id": str(uo_B), "rut_clean": rut,
        }])
        cu_B_stessa_UO = _cu(B)
        cu_B_altra_UO = _cu(B)
        object.__setattr__(cu_B_altra_UO, "unidad_ids", [str(uo_FAKE)])
        cuA = _cu(users["A_SUPER"])
        assert self._count(cu_B_stessa_UO, rut) == 1, "Stessa UO → vede RESTRINGIDO"
        assert self._count(cu_B_altra_UO, rut) == 0, "Altra UO → NON vede RESTRINGIDO"
        assert self._count(cuA, rut) == 1, "SUPER wildcard vede tutti"


def test_I3_precondizioni():
    """Controlla che migrazione 005 sia applicata (solo lettura)."""
    async def _inner():
        db = await _get_db()
        try:
            cols = set(await db.list_collection_names())
            for c in ("comentarios_v2", "permisos"):
                assert c in cols, f"Manca {c}"
            n = await db["permisos"].count_documents({"codigo": {"$in": ["comment.read", "comment.delete"]}})
            assert n == 2, f"Permisos comment: attesi 2 trovati {n}"
            state = await db["__rbac_migrations_version"].find_one({"_id": "state"})
            applied = state.get("applied", []) if state else []
            assert "005" in applied, f"Migrazione 005 non applicata: applied={applied}"
        finally:
            db.client.close()
    asyncio.run(_inner())
