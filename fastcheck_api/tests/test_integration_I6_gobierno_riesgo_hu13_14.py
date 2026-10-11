"""
Suite I6 — Bloque 2.4 FASE2 Gobierno Riesgo (HU-13 · HU-14).
6 tests: U15 modal doble intencion gate 428 · U16 escalamiento Q4 insuf 403 ·
U17 sensible NO heredado rol · U18 auditoria gov delta+1 ·
I6-1 SUPER grants risk.* OK (4 endpoints) + AXA sin grants DENY ·
I6-0 precondiciones catalogo/collections.
NOTA: Los SENSIBLES (L10) NUNCA se heredan de roles — NI SUPER. Per testare
il permesso occorre crear un GRANT individual en usuario_permiso_override con
`sensible_confirmado=True` + `nivel_escalamiento` ≥ req por permiso.
"""
from __future__ import annotations

import asyncio
import os
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "fastcheck_api"))

from bson import ObjectId
import pymongo
import pytest

from fastcheck_api.app.services.authz_service import SENSIBLES, EnrichedUser


_MONGO = os.environ.get(
    "MONGODB_URI",
    "mongodb://172.19.40.102:27017,172.19.40.103:27017/duxiter-2?"
    "replicaSet=rs0&readPreference=primaryPreferred&serverSelectionTimeoutMS=5000",
)

_ID_SUPER = ObjectId("696eaa2bddea6b91873de160")
_ID_AXA   = ObjectId("696f6405174b6c5725971aaf")
_ORG_SUPER = ObjectId("6ac127b8e2f379cf956f257b")
_SUPER_TENANT = ObjectId("696eaa2addea6b91873de15e")
_AXA_TENANT   = ObjectId("696f6386174b6c5725971a6c")

_FAKE_EMAIL_U18 = "u18_riesgo_test_i6@superuser.test"
_FAKE_EMAIL_I61 = "i6_riesgo_e2e@superuser.test"
_RISK_OVERRIDE_TAG = "__TEST_I6_BLOQ24__"


# ---------------------------------------------------------------------------
# FIXTURE cleanup pre/post
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def _init_and_cleanup():
    c = pymongo.MongoClient(_MONGO, serverSelectionTimeoutMS=5000,
                            tlsAllowInvalidCertificates=True)
    db = c["duxiter-2"]
    assert db.name != "duxiter", f"SAFETY FAIL db prod={db.name}"
    # Clean docs con tag de test
    for col in ["listas_propias_v2", "config_umbrales_riesgo",
                "config_formulas_scoring", "evaluationparameters"]:
        try: db[col].delete_many({"motivo_cambio": {"$regex": "^test_i6_"}})
        except: pass
    try:
        # Auditoria con correo de test o con tag en motivo
        db["auditoria_log"].delete_many({
            "$or": [
                {"accion": {"$regex": "^gobierno\\.riesgo\\."},
                 "usuario_email": {"$in": [_FAKE_EMAIL_U18, _FAKE_EMAIL_I61, ""]}},
                {"motivo_denegacion": {"$regex": _RISK_OVERRIDE_TAG}},
            ],
        })
    except Exception:
        pass
    # Clean overrides de risk creados por este suite
    try:
        db["usuario_permiso_override"].delete_many({
            "usuario_id": _ID_SUPER,
            "permiso_codigo": {"$regex": "^risk\\."},
            "_tag": _RISK_OVERRIDE_TAG,
        })
    except:
        pass
    yield db
    # Cleanup POST
    for col in ["listas_propias_v2", "config_umbrales_riesgo",
                "config_formulas_scoring", "evaluationparameters"]:
        try: db[col].delete_many({"motivo_cambio": {"$regex": "^test_i6_"}})
        except: pass
    try:
        db["auditoria_log"].delete_many({
            "$or": [
                {"usuario_email": {"$in": [_FAKE_EMAIL_U18, _FAKE_EMAIL_I61]}},
            ],
        })
    except:
        pass
    try:
        db["usuario_permiso_override"].delete_many({
            "usuario_id": _ID_SUPER,
            "permiso_codigo": {"$regex": "^risk\\."},
            "_tag": _RISK_OVERRIDE_TAG,
        })
    except:
        pass
    c.close()


# ---------------------------------------------------------------------------
# U15 — MODAL DOBLE INTENCIÓN gate HTTP 428.
# ---------------------------------------------------------------------------
def test_U15_modal_doble_intencion_gate_428_si_confirmacion_false():
    from fastcheck_api.app.api.v2.routers.gobierno_riesgo import (
        _gate_modal_doble_intencion as gate,
    )
    from pydantic import BaseModel

    class Body(BaseModel):
        confirmacion_cambio_riesgo: bool = False

    with pytest.raises(Exception) as excinfo:
        gate(Body(confirmacion_cambio_riesgo=False), "risk.lists.manage")
    assert excinfo.value.status_code == 428
    assert excinfo.value.detail["code"] == "MODAL_DOBLE_INTENCION_REQUERIDA"
    # caso true: no raise
    gate(Body(confirmacion_cambio_riesgo=True), "risk.lists.manage")


# ---------------------------------------------------------------------------
# U16 — GATE ESCALAMIENTO Q4. Nivel otorgado 1 < req 2 → 403.
# ---------------------------------------------------------------------------
def test_U16_gate_escalamiento_Q4_nivel_1_insuficiente_params_N2():
    from fastcheck_api.app.api.v2.routers.gobierno_riesgo import (
        _gate_nivel_escalamiento,
    )

    class FakeUser:
        role = "tenant_admin"
        id = str(_ID_SUPER)
        tenant = str(_SUPER_TENANT)
        organizacion_id = str(_ORG_SUPER)

    eu = EnrichedUser(
        user_id=_ID_SUPER, organizacion_id=_ORG_SUPER, roles=[],
        cache_version=6,
        sensibles_confirmados={"risk.params.define"},
        usuario_permiso_overrides=[
            # NIVEL 1 insuficiente para risk.params.define (=2)
            {"usuario_id": _ID_SUPER, "permiso_codigo": "risk.params.define",
             "tipo_override": "GRANT", "sensible_confirmado": True,
             "nivel_escalamiento": 1},
        ],
        is_superuser_wildcard=False,
    )
    with pytest.raises(Exception) as exc:
        _gate_nivel_escalamiento(FakeUser(), eu, "risk.params.define")
    assert exc.value.status_code == 403
    d = exc.value.detail
    assert d["code"] == "ESCALAMIENTO_INSUFICIENTE_Q4"
    assert d["nivel_requerido"] == 2
    assert d["nivel_otorgado"] == 1

    # Bump a NIVEL 3 → OK
    eu.usuario_permiso_overrides[0]["nivel_escalamiento"] = 3
    n = _gate_nivel_escalamiento(FakeUser(), eu, "risk.params.define")
    assert n >= 2


# ---------------------------------------------------------------------------
# U17 — SENSIBLE NO heredado POR ROL. Pipeline autorizar() → DENY (PASO 3/4).
# ---------------------------------------------------------------------------
def test_U17_permiso_sensible_risk_lists_NO_hereda_por_rol_AXA_DENY():
    async def _inner():
        import motor.motor_asyncio as mtr
        client = mtr.AsyncIOMotorClient(_MONGO, serverSelectionTimeoutMS=5000,
                                        tlsAllowInvalidCertificates=True)
        dbm = client.get_database("duxiter-2")
        from fastcheck_api.app.services.authz_service import (
            autorizar, hydrate_user_from_db,
        )
        eu = await hydrate_user_from_db(dbm, user_id=_ID_AXA, force_refresh=True)
        decision = await autorizar(
            dbm, eu, recurso="config:gobierno-riesgo", proposito="ACTUAR",
            accion_codigo="risk.lists.manage",
        )
        client.close()
        return decision
    d = asyncio.run(_inner())
    assert d.permitir is False, (
        f"AXA sin GRANT individual debia DENY risk.lists.manage; got={d}"
    )
    assert d.paso_fallido in (3, 4), (
        f"paso={d.paso_fallido} motivo={d.motivo_denegacion}"
    )


# ---------------------------------------------------------------------------
# U18 — AUDITORIA_LOG delta +1 al cambiar lista propia por SUPER + email unico.
# ---------------------------------------------------------------------------
def test_U18_auditoria_log_row_delta_1(_init_and_cleanup):
    db = _init_and_cleanup
    # Primero insertamos GRANT SUPER para risk.lists.manage (ESC=1)
    now = datetime.utcnow().isoformat()
    db["usuario_permiso_override"].update_one(
        {"usuario_id": _ID_SUPER, "permiso_codigo": "risk.lists.manage",
         "_tag": _RISK_OVERRIDE_TAG},
        {"$set": {"tipo_override": "GRANT", "sensible_confirmado": True,
                  "nivel_escalamiento": 1, "actualizado_en": now,
                  "_tag": _RISK_OVERRIDE_TAG}},
        upsert=True,
    )
    before = db["auditoria_log"].count_documents({
        "accion": "gobierno.riesgo.listas",
        "usuario_id": _ID_SUPER,
        "usuario_email": _FAKE_EMAIL_U18,
    })

    async def _inner():
        import motor.motor_asyncio as mtr
        client = mtr.AsyncIOMotorClient(_MONGO, serverSelectionTimeoutMS=5000,
                                        tlsAllowInvalidCertificates=True)
        dbm = client.get_database("duxiter-2")
        from fastcheck_api.app.api.v2.routers.gobierno_riesgo import (
            _leer_y_escribir_config,
        )
        class FakeSuper:
            id = str(_ID_SUPER); email = _FAKE_EMAIL_U18
            tenant = str(_SUPER_TENANT); organizacion_id = str(_ORG_SUPER)
            role = "superuser"
        await _leer_y_escribir_config(
            dbm, user=FakeSuper(), col_name="listas_propias_v2",
            filtro_upsert={"organizacion_id": _ORG_SUPER, "tipo_lista": "NEGRA"},
            set_body={
                "entries": ["76123456-7", "78987654-3"],
                "descripcion": "U18 test",
                "motivo_cambio": "test_i6_U18_audit",
            },
            perm_cod="risk.lists.manage",
            campos_clave_audit=["entries", "tipo_lista", "motivo_cambio"],
        )
        client.close()

    asyncio.run(_inner())
    time.sleep(0.3)
    after = db["auditoria_log"].count_documents({
        "accion": "gobierno.riesgo.listas",
        "usuario_id": _ID_SUPER,
        "usuario_email": _FAKE_EMAIL_U18,
    })
    assert after == before + 1, (
        f"auditoria gov listas: before={before} after={after} (atteso +1)"
    )


# ---------------------------------------------------------------------------
# I6-1 — E2E SUPER 4 grants individuales creados → 4 permisos OK.
#         AXA EVAL sin grants → DENY 4/4.
# ---------------------------------------------------------------------------
def test_I6_1_full_E2E_SUPER_4_grants_OK_y_AXA_DENY_4(_init_and_cleanup):
    db = _init_and_cleanup
    # --- Crea 4 GRANT individuales SUPER Q4 escal 1/2/2/3.
    grants: list[tuple[str, int]] = [
        ("risk.lists.manage",    1),
        ("risk.params.define",   2),
        ("risk.thresholds.edit", 2),
        ("risk.formula.edit",    3),
    ]
    now = datetime.utcnow().isoformat()
    for perm, niv in grants:
        db["usuario_permiso_override"].update_one(
            {"usuario_id": _ID_SUPER, "permiso_codigo": perm,
             "_tag": _RISK_OVERRIDE_TAG},
            {"$set": {"tipo_override": "GRANT", "sensible_confirmado": True,
                      "nivel_escalamiento": niv, "actualizado_en": now,
                      "_tag": _RISK_OVERRIDE_TAG}},
            upsert=True,
        )

    async def _e2e():
        import motor.motor_asyncio as mtr
        client = mtr.AsyncIOMotorClient(_MONGO, serverSelectionTimeoutMS=5000,
                                        tlsAllowInvalidCertificates=True)
        dbm = client.get_database("duxiter-2")
        from fastcheck_api.app.api.v2.routers.gobierno_riesgo import (
            _gate_nivel_escalamiento,
        )
        from fastcheck_api.app.services.authz_service import (
            autorizar, hydrate_user_from_db,
        )
        eu_s = await hydrate_user_from_db(dbm, user_id=_ID_SUPER,
                                          force_refresh=True)
        class FakeS:
            role = "superuser"; id = str(_ID_SUPER); email = _FAKE_EMAIL_I61
            tenant = str(_SUPER_TENANT)
            organizacion_id = str(eu_s.organizacion_id or _ORG_SUPER)

        # 4 permisos SUPER deben PASSAR (grants creados)
        for perm, _ in grants:
            dec = await autorizar(
                dbm, eu_s, recurso="config:gobierno-riesgo",
                proposito="ACTUAR", accion_codigo=perm,
            )
            assert dec.permitir is True, (
                f"SUPER GRANT {perm} debería PERMITIR. "
                f"paso={dec.paso_fallido} motivo={dec.motivo_denegacion}"
            )
        # Escalamiento formula edit = NIV 3
        assert _gate_nivel_escalamiento(FakeS(), eu_s, "risk.formula.edit") == 3

        # AXA: NO grants → 4 DENY
        eu_a = await hydrate_user_from_db(dbm, user_id=_ID_AXA,
                                          force_refresh=True)
        for perm, _ in grants:
            dec = await autorizar(
                dbm, eu_a, recurso="config:gobierno-riesgo",
                proposito="ACTUAR", accion_codigo=perm,
            )
            assert dec.permitir is False, (
                f"AXA SIN GRANT {perm} permitir=True; paso={dec.paso_fallido}"
            )
            assert dec.paso_fallido in (3, 4)
        client.close()

    asyncio.run(_e2e())

    # Assicurazione: AXA aún no tiene risk.* en authz_v2.sensibles_confirmados
    u = db.users.find_one({"_id": _ID_AXA}, {"authz_v2.sensibles_confirmados": 1})
    sc = ((u.get("authz_v2") or {}).get("sensibles_confirmados") or {})
    risk_g = [k for k in sc if k.startswith("risk.")]
    assert risk_g == [], f"AXA grants inesperados risk={risk_g}"


# ---------------------------------------------------------------------------
# I6-0 — PRECONDICIONES: 4 permisos sensibles en catalogo + 3 collections nuevas
#         + indices únicos + SENSIBLES global L10 + proyeccion INFO_COMPLETA.
# ---------------------------------------------------------------------------
def test_I6_0_precondiciones_catalogo_y_colecciones(_init_and_cleanup):
    db = _init_and_cleanup
    cods = ["risk.lists.manage", "risk.params.define",
            "risk.thresholds.edit", "risk.formula.edit"]

    # (A) permisos catalogo
    docs = list(db.permisos.find({"codigo": {"$in": cods}}))
    assert len(docs) == 4, f"4 risk esperados; real={len(docs)}"
    for d in docs:
        assert (d.get("es_sensible") is True or d.get("nivel_sensible") is True), (
            f"{d['codigo']} no es sensible en catalogo"
        )
        assert d.get("escalamiento_nivel_default") == 1
        assert d.get("categoria") == "GOBIERNO_RIESGO"

    # (B) collections existen
    for c in ("listas_propias_v2", "config_umbrales_riesgo",
              "config_formulas_scoring", "evaluationparameters"):
        assert c in db.list_collection_names(), f"faltan collection: {c}"

    # (C) índices únicos
    def _idx(n): return [i["name"] for i in db[n].list_indexes()]
    assert "idx_006_listas_org_tipo_unico" in _idx("listas_propias_v2")
    assert "idx_006_umbrales_org_unico"    in _idx("config_umbrales_riesgo")
    assert "idx_006_formulas_org_unico"    in _idx("config_formulas_scoring")

    # (D) SENSIBLES authz L10
    for c in cods:
        assert c in SENSIBLES, f"{c} missing in SENSIBLES L10 authz_service"

    # (E) proyeccion nivel = INFO_COMPLETA para los 4
    import importlib.util as iu
    spec = iu.spec_from_file_location(
        "proy_svc",
        str(ROOT / "fastcheck_api/app/services/proyeccion_service.py"))
    mo = iu.module_from_spec(spec); spec.loader.exec_module(mo)
    for c in cods:
        assert mo.proyectar_nivel_especifico_para_accion(c) == "INFO_COMPLETA", (
            f"{c} proyeccion={mo.proyectar_nivel_especifico_para_accion(c)}"
        )
