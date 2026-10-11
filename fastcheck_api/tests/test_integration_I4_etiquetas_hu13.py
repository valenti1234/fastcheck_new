"""Bloque 2.2 FASE2 · Tests I4 Etiquetas (catalogo GENERAL/RESTRINGIDA · 4 permisos tag.*).

Scope: duxiter-2 ONLY (SAFETY LOCK L1-L4 attivo · 0 scritture produzione duxiter).
Strategia: sync tests usando asyncio.run + pymongo (come I3) → evita conflitti event loop Motor.
Cleanup: todos los tags de prueba usan codigo prefijo `test_i4_{self.tag_ts}` y se borran con delete_many PRE/POST.
"""
from __future__ import annotations

import asyncio
from datetime import datetime

import pytest
from bson import ObjectId
from pymongo import MongoClient

# ===========================================================================
# Safety lock + URI staging escrituras / no stale (primaryPreferred, no maxStaleness)
# ===========================================================================
URI = (
    "mongodb://172.19.40.102:27017,172.19.40.103:27017/duxiter-2?"
    "replicaSet=rs0&readPreference=primaryPreferred&serverSelectionTimeoutMS=5000"
)

# ===========================================================================
# OIDs FAKE válidos (24 hex chars) para build_user unitari (sin tocar users reales en unitari)
# No hay escritura sobre users en tests unitari; SOLO catalogo_etiquetas.
# ===========================================================================
OID_FAKE_ORG_CHC = "6ac127c3e2f379cf956f2648"   # CMPC org (igual que Bloq1.1)
OID_FAKE_ORG_AXA = "6ac127bae2f379cf956f258b"   # Virbac AXA org
OID_FAKE_ORG_CCU = "6ac127c0e2f379cf956f2609"   # UCSC CCU org
OID_FAKE_ORG_SUPER = "6ac127b8e2f379cf956f2578" # System super
OID_FAKE_UO_CHC = "6ac127c3e2f379cf956f264a"    # CMPC UO root
OID_FAKE_UO_AXA = "6ac127bae2f379cf956f258d"    # AXA UO
OID_FAKE_USR_CHC_ADM = "6a710ccc41eb4a347a7b2afa"  # B CHC tenant_admin real ID
OID_FAKE_USR_AXA_EV = "696f6405174b6c5725971aaf"   # C AXA evaluator real ID
OID_FAKE_USR_CCU_RO = "6a2971190e276e4dabaa6b6e"   # D CCU read_only real ID
OID_FAKE_USR_SUPER = "696eaa2bddea6b91873de160"    # A super user real ID
OID_FAKE_USR_X_NOADM = "6b0000000000000000000001" # fake usuario no-admin no-autor RESTRINGIDA
# OID tags de prueba (tutti 24 hex chars validi)
OID_FAKE_TAG_U7  = "777777777777777777777771"
OID_FAKE_TAG_U8  = "888888888888888888888882"
OID_FAKE_TAG_U9  = "999999999999999999999993"
OID_FAKE_TAG_U10_1 = "bbbbbbbbbbbbbbbbbbbbbbba"
OID_FAKE_TAG_U10_2 = "bbbbbbbbbbbbbbbbbbbbbbbb"
OID_FAKE_TAG_U10_3 = "bbbbbbbbbbbbbbbbbbbbbbbc"
OID_FAKE_TAG_I41_REST = "aaaaaaaaaaaaaaaaaaaaaaa4"


def _oid(s):
    return ObjectId(s) if s else None


# ===========================================================================
# Build CurrentUser MINIMAL para projection helper (solo atributos usados en _filtro_etiquetas_lectura y permisos)
# Usa objetos tipo SimpleNamespace con atributi analoghi a CurrentUser dependencies.
# ===========================================================================
class FakeCurrentUser:
    """Minimal clone di CurrentUser per chiamare _filtro_etiquetas_lectura direttamente."""
    def __init__(self, *, user_id: str, email: str, tenant: str, role: str, organizacion_id: str | None,
                 unidad_ids: list[str] | None = None, area_id: str | None = None,
                 pais_ids: list[str] | None = None, roles: list[str] | None = None):
        assert len(user_id) == 24, f"user_id deve ser 24char hex valid (ObjectId): {user_id!r}"
        assert len(tenant) == 24, f"tenant deve ser 24char hex valid: {tenant!r}"
        if organizacion_id:
            assert len(organizacion_id) == 24, f"organizacion_id 24char hex: {organizacion_id!r}"
        if unidad_ids:
            assert all(len(u) == 24 for u in unidad_ids), f"tutti unidad_ids 24char hex: {unidad_ids!r}"
        self.id: str = user_id
        self.email: str = email
        self.tenant: str = tenant
        self.role: str = role
        self.organizacion_id: str | None = organizacion_id
        self.unidad_ids: list[str] | None = unidad_ids or []
        self.area_id: str | None = area_id
        self.pais_ids: list[str] | None = pais_ids or []
        self.roles: list[str] = roles or []


def build_user(tipo: str) -> FakeCurrentUser:
    """Builda utenti finti per test unitari projection."""
    if tipo == "SUPER":
        return FakeCurrentUser(user_id=OID_FAKE_USR_SUPER, email="superadmin@gmail.com",
                               tenant="696eaa2addea6b91873de15e", role="superuser",
                               organizacion_id=OID_FAKE_ORG_SUPER, unidad_ids=[], roles=["SUPERUSER"])
    if tipo == "CHC_ADM":  # tenant_admin CMPC
        return FakeCurrentUser(user_id=OID_FAKE_USR_CHC_ADM, email="anibal.fernandez@cmpc.com",
                               tenant="6a710ccc41eb4a347a7b2af8", role="tenant_admin",
                               organizacion_id=OID_FAKE_ORG_CHC, unidad_ids=[OID_FAKE_UO_CHC],
                               roles=["ADMIN"])
    if tipo == "AXA_EV":  # evaluator AXA Virbac
        return FakeCurrentUser(user_id=OID_FAKE_USR_AXA_EV, email="ghap68@yahoo.com",
                               tenant="696f6386174b6c5725971a6c", role="evaluator",
                               organizacion_id=OID_FAKE_ORG_AXA, unidad_ids=[OID_FAKE_UO_AXA])
    if tipo == "CCU_RO":  # read_only UCSC CCU
        return FakeCurrentUser(user_id=OID_FAKE_USR_CCU_RO, email="clsalgado@ucsc.cl",
                               tenant="6a2971190e276e4dabaa6b6c", role="read_only",
                               organizacion_id=OID_FAKE_ORG_CCU, unidad_ids=[])
    if tipo == "CHC_NOADM":  # fake user NO admin CMPC misma org (non vede RESTRINGIDA altrui)
        return FakeCurrentUser(user_id=OID_FAKE_USR_X_NOADM, email="operativo.chc.noadmin@cmpc.com",
                               tenant="6a710ccc41eb4a347a7b2af8", role="evaluator",
                               organizacion_id=OID_FAKE_ORG_CHC, unidad_ids=[OID_FAKE_UO_CHC])
    raise ValueError(f"tipo build_user sconosciuto {tipo!r}")


# ===========================================================================
# Import FUNZIONE PURA projection dal router tags (testarla direttamente senza app HTTP)
# ===========================================================================
from fastcheck_api.app.api.v2.routers.tags import _filtro_etiquetas_lectura  # noqa: E402


# ===========================================================================
# FIXTURE modulo: MongoClient sincrono (duxiter-2) + cleanup PRE/POST dei tags di test.
# ===========================================================================
class TestIntegracionI4Etiquetas:

    @property
    def _tag_ts(self) -> str:
        """Timestamp unico per creare codici tags non duplicabili tra run."""
        return getattr(self, "_tag_suffix", None) or (
            setattr(self, "_tag_suffix", f"test_i4_hu_{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}") or self._tag_suffix  # type: ignore[func-returns-value]
        )

    @pytest.fixture(autouse=True)
    def _init_and_cleanup(self):
        """Pulizia ANTES y DESPUES de cada test: delete_many tags cuyo codigo empieza por test_i4_*."""
        c = MongoClient(URI)
        db = c["duxiter-2"]
        assert db.name != "duxiter", f"[SAFETY LOCK FAIL] db={db.name} != 'duxiter-2'"
        assert db.name == "duxiter-2", f"[SAFETY] staging wrong: {db.name}"
        cod_regex = f"^{self._tag_ts}_"
        # Cleanup PRE
        db["catalogo_etiquetas"].delete_many({"codigo": {"$regex": cod_regex}})
        yield db
        # Cleanup POST
        db["catalogo_etiquetas"].delete_many({"codigo": {"$regex": cod_regex}})
        c.close()

    # -----------------------------------------------------------------------
    # U7 (UNITARIO): GENERAL visible en su org; altra org non la vede; superuser wildcard la vede.
    # -----------------------------------------------------------------------
    def test_U7_tag_general_projection_org_scope(self, _init_and_cleanup):
        db = _init_and_cleanup
        chc = build_user("CHC_ADM")
        axa = build_user("AXA_EV")
        sup = build_user("SUPER")
        codigo = f"{self._tag_ts}_u7_general_riesgo_alto"
        tag_id = _oid(OID_FAKE_TAG_U7)
        # Insert GENERAL in CHC org
        db["catalogo_etiquetas"].insert_one({
            "_id": tag_id, "codigo": codigo, "nombre": "Riesgo Alto CHC", "tipo": "GENERAL",
            "organizacion_id": _oid(chc.organizacion_id),
            "tenantId": _oid(chc.tenant), "creado_por_id": _oid(chc.id), "borrado_logico": False,
        })
        # (a) CHC stesso org: projection filtro result lo include
        filt_chc = _filtro_etiquetas_lectura(chc, {"codigo": codigo})
        docs_chc = list(db["catalogo_etiquetas"].find(filt_chc))
        assert len(docs_chc) >= 1, "CHC stessa org deve vedere tag GENERAL"
        # (b) AXA DIVERSA org: NON vede il tag
        filt_axa = _filtro_etiquetas_lectura(axa, {"codigo": codigo})
        docs_axa = list(db["catalogo_etiquetas"].find(filt_axa))
        assert len(docs_axa) == 0, f"AXA tenant diverso NON deve vedere CHC GENERAL ma ha {len(docs_axa)} risultati"
        # (c) SUPER wildcard: LO VEDE
        filt_sup = _filtro_etiquetas_lectura(sup, {"codigo": codigo})
        docs_sup = list(db["catalogo_etiquetas"].find(filt_sup))
        assert len(docs_sup) >= 1, "Superuser wildcard deve vedere GENERAL CHC"
        # Cleanup singleton
        db["catalogo_etiquetas"].delete_one({"_id": tag_id})

    # -----------------------------------------------------------------------
    # U8 (UNITARIO): RESTRINGIDA. No autorizzati NON vedono; autor LO VEDE; admin LO VEDE.
    # -----------------------------------------------------------------------
    def test_U8_tag_restringida_projection(self, _init_and_cleanup):
        db = _init_and_cleanup
        chc_adm = build_user("CHC_ADM")  # creatore della tag restringida
        chc_noadm = build_user("CHC_NOADM")  # misma org CHC MA non admin, non autor, non in autorizados
        sup = build_user("SUPER")
        codigo = f"{self._tag_ts}_u8_rest_confidencial"
        tag_id = _oid(OID_FAKE_TAG_U8)
        # Create RESTRINGIDA, solo autorizado = creador mismo
        db["catalogo_etiquetas"].insert_one({
            "_id": tag_id, "codigo": codigo, "nombre": "Confidencial CHC (Restringida)", "tipo": "RESTRINGIDA",
            "organizacion_id": _oid(chc_adm.organizacion_id), "tenantId": _oid(chc_adm.tenant),
            "creado_por_id": _oid(chc_adm.id),
            "usuarios_autorizados_ids": [_oid(chc_adm.id)],  # solo autor
            "borrado_logico": False,
        })
        # (a) AUTOR/admin CHC: lo vede
        filt_autor = _filtro_etiquetas_lectura(chc_adm, {"codigo": codigo})
        assert len(list(db["catalogo_etiquetas"].find(filt_autor))) == 1, "AUTOR admin deve vedere RESTRINGIDA"
        # (b) NO-AUTH no-admin misma org NON autorizzato: NON deve vedere
        filt_noauth = _filtro_etiquetas_lectura(chc_noadm, {"codigo": codigo})
        assert len(list(db["catalogo_etiquetas"].find(filt_noauth))) == 0, (
            f"NO-ADMIN NON-authorized NON deve vedere RESTRINGIDA ma ha match"
        )
        # (c) SUPER wildcard: DEVE vedere
        filt_sup = _filtro_etiquetas_lectura(sup, {"codigo": codigo})
        assert len(list(db["catalogo_etiquetas"].find(filt_sup))) == 1, "Superuser deve vedere RESTRINGIDA"
        db["catalogo_etiquetas"].delete_one({"_id": tag_id})

    # -----------------------------------------------------------------------
    # U9 (UNITARIO): Grant RESTRINGIDA → add user a usuarios_autorizados_ids → POI la vede. Poi QUITAR → NON la vede piu.
    # Simula l'azione di POST /tags/{id}/grant AGREGAR/QUITAR.
    # -----------------------------------------------------------------------
    def test_U9_grant_restringida_toggle_visibilidad(self, _init_and_cleanup):
        db = _init_and_cleanup
        chc_adm = build_user("CHC_ADM")  # concede grant
        chc_noadm = build_user("CHC_NOADM")  # ricev grant
        codigo = f"{self._tag_ts}_u9_rest_grant"
        tag_id = _oid(OID_FAKE_TAG_U9)
        db["catalogo_etiquetas"].insert_one({
            "_id": tag_id, "codigo": codigo, "nombre": "Grant Test Restringida", "tipo": "RESTRINGIDA",
            "organizacion_id": _oid(chc_adm.organizacion_id), "tenantId": _oid(chc_adm.tenant),
            "creado_por_id": _oid(chc_adm.id),
            "usuarios_autorizados_ids": [_oid(chc_adm.id)],
            "borrado_logico": False,
        })
        # PRIMA del grant: CHC noadm NON vede
        assert len(list(db["catalogo_etiquetas"].find(_filtro_etiquetas_lectura(chc_noadm, {"codigo": codigo})))) == 0
        # (a) Grant AGREGAR
        db["catalogo_etiquetas"].update_one(
            {"_id": tag_id}, {"$addToSet": {"usuarios_autorizados_ids": _oid(chc_noadm.id)}}
        )
        # DOPO grant: CHC noadm VEDE
        docs = list(db["catalogo_etiquetas"].find(_filtro_etiquetas_lectura(chc_noadm, {"codigo": codigo})))
        assert len(docs) == 1, "Dopo grant AGREGAR, utente autorizzato deve vedere RESTRINGIDA"
        # (b) Grant QUITAR
        db["catalogo_etiquetas"].update_one(
            {"_id": tag_id}, {"$pull": {"usuarios_autorizados_ids": _oid(chc_noadm.id)}}
        )
        docs2 = list(db["catalogo_etiquetas"].find(_filtro_etiquetas_lectura(chc_noadm, {"codigo": codigo})))
        assert len(docs2) == 0, "Dopo QUITAR, utente non deve piu vedere RESTRINGIDA"
        db["catalogo_etiquetas"].delete_one({"_id": tag_id})

    # -----------------------------------------------------------------------
    # U10 (UNITARIO): Indice UNICO (organizacion_id, codigo) → 409 conflict insert igual codigo.
    # -----------------------------------------------------------------------
    def test_U10_indice_unico_org_codigo_409_conflict(self, _init_and_cleanup):
        db = _init_and_cleanup
        chc = build_user("CHC_ADM")
        codigo = f"{self._tag_ts}_u10_duplicado"
        base = {
            "codigo": codigo, "nombre": "Origen 1", "tipo": "GENERAL",
            "organizacion_id": _oid(chc.organizacion_id), "tenantId": _oid(chc.tenant),
            "creado_por_id": _oid(chc.id), "usuarios_autorizados_ids": [], "borrado_logico": False,
        }
        # Prima inserción → OK
        db["catalogo_etiquetas"].insert_one(dict(base, _id=_oid(OID_FAKE_TAG_U10_1)))
        assert db["catalogo_etiquetas"].count_documents({"codigo": codigo}) == 1
        # Seconda inserción STESSA org e stesso codigo → DEVE FALLIRE duplicate key
        import pymongo.errors
        try:
            db["catalogo_etiquetas"].insert_one(dict(base, nombre="Origen 2 (duplicado)", _id=_oid(OID_FAKE_TAG_U10_2)))
            raise AssertionError("Second insert mismo codigo/org NON deve riuscire: indice unico fallito!")
        except pymongo.errors.DuplicateKeyError:
            pass  # atteso
        # Terza inserción → STESSO codigo PERO DIVERSA org (AXA) → OK perche indice composto ORG+cod
        axa = build_user("AXA_EV")
        base2 = dict(base)
        base2["organizacion_id"] = _oid(axa.organizacion_id)
        base2["tenantId"] = _oid(axa.tenant)
        db["catalogo_etiquetas"].insert_one(dict(base2, nombre="AXA version mismo codigo OK", _id=_oid(OID_FAKE_TAG_U10_3)))
        count = db["catalogo_etiquetas"].count_documents({"codigo": codigo})
        assert count == 2, f"Stesso codigo in 2 diverse org deve essere consentito (indice composto); count={count}"

    # -----------------------------------------------------------------------
    # I4-1 (INTEGRACION · Flujo completo E2E): 4 usuarios · CREATE GENERAL + CREATE RESTRINGIDA + GRANT
    # -----------------------------------------------------------------------
    def test_I4_1_flujo_completo_etiquetas(self, _init_and_cleanup):
        db = _init_and_cleanup
        chc_adm = build_user("CHC_ADM")
        chc_noadm = build_user("CHC_NOADM")
        axa_ev = build_user("AXA_EV")
        ccu_ro = build_user("CCU_RO")
        cod_general = f"{self._tag_ts}_i41_general_pep"
        cod_restr = f"{self._tag_ts}_i41_restringido_pep_bd"
        # (1) CHC crea GENERAL → lo vede CHC stesso; NON vede AXA o CCU (other tenants)
        db["catalogo_etiquetas"].insert_one({
            "codigo": cod_general, "nombre": "General PEP", "tipo": "GENERAL",
            "organizacion_id": _oid(chc_adm.organizacion_id), "tenantId": _oid(chc_adm.tenant),
            "creado_por_id": _oid(chc_adm.id), "usuarios_autorizados_ids": [], "borrado_logico": False,
        })
        assert len(list(db["catalogo_etiquetas"].find(_filtro_etiquetas_lectura(chc_adm, {"codigo": cod_general})))) == 1
        assert len(list(db["catalogo_etiquetas"].find(_filtro_etiquetas_lectura(axa_ev, {"codigo": cod_general})))) == 0
        assert len(list(db["catalogo_etiquetas"].find(_filtro_etiquetas_lectura(ccu_ro, {"codigo": cod_general})))) == 0
        # (2) CHC crea RESTRINGIDA; autorizados = [] (solo admin/autor o SUPER la vede)
        restr_id = _oid(OID_FAKE_TAG_I41_REST)
        db["catalogo_etiquetas"].insert_one({
            "_id": restr_id, "codigo": cod_restr, "nombre": "Restringida PEP BD", "tipo": "RESTRINGIDA",
            "organizacion_id": _oid(chc_adm.organizacion_id), "tenantId": _oid(chc_adm.tenant),
            "creado_por_id": _oid(chc_adm.id),
            "usuarios_autorizados_ids": [_oid(chc_adm.id)],  # solo autor
            "borrado_logico": False,
        })
        # Autor vede
        assert len(list(db["catalogo_etiquetas"].find(_filtro_etiquetas_lectura(chc_adm, {"codigo": cod_restr})))) == 1
        # NO-ADM stessa org NON vede
        assert len(list(db["catalogo_etiquetas"].find(_filtro_etiquetas_lectura(chc_noadm, {"codigo": cod_restr})))) == 0
        # (3) Grant AGREGAR a chc_noadm
        db["catalogo_etiquetas"].update_one({"_id": restr_id}, {"$addToSet": {"usuarios_autorizados_ids": _oid(chc_noadm.id)}})
        assert len(list(db["catalogo_etiquetas"].find(_filtro_etiquetas_lectura(chc_noadm, {"codigo": cod_restr})))) == 1
        # (4) Count total in CHC org: 2 tags visibili per chc_adm
        total_chc = db["catalogo_etiquetas"].count_documents(_filtro_etiquetas_lectura(chc_adm, {}))
        assert total_chc >= 2, f"CHC deve vedere almeno 2 tags creati; count={total_chc}"

    # -----------------------------------------------------------------------
    # I4 PRECONDICIONES: 4 permisos tag.* existen en catálogo (migración 005 applied).
    # -----------------------------------------------------------------------
    def test_I4_precondiciones_005_applied_permisos_tag(self, _init_and_cleanup):
        db = _init_and_cleanup
        esperados = ["tag.read", "tag.write", "tag.manage_restricted", "tag.grant"]
        encontrados = list(db["permisos"].find({"codigo": {"$in": esperados}}, {"_id": 0, "codigo": 1}))
        cod_encontrados = sorted({r["codigo"] for r in encontrados})
        state = db["__rbac_migrations_version"].find_one({"_id": "state"}) or {}
        applied = state.get("applied", [])
        assert "005" in applied, f"Migración 005 debe estar applied; applied={applied}"
        assert cod_encontrados == sorted(esperados), (
            f"Permisos tag faltantes: esperados={esperados} encontrados={cod_encontrados}"
        )
