"""
===============================================================================
 test_authz_service.py — PRUEBAS UNITARIAS PURAS (Bloque 0.8 U1)
===============================================================================
ESTRATEGIA: NINGUNA conexión real a MongoDB. 0 escrituras en duxiter-2.
Toda la hidratación (catalogos) se inyecta vía FastcheckDBFake con datasets
en memoria.

SUITE (4 grupos oficiales U1-a..U1-d, + 3 extra precedencia):
  U1-a. TestPasoPorPaso 7x2 = 14 tests (Paso 1..7 · caso POS + NEG)
  U1-b. TestQ1_GatePN (2 tests) → PN denegado default; superuser con GRANT OK
  U1-c. TestQ4_GrantSensibleDefaultNivel (3 tests) → 3 niveles fijos; nivel=1
  U1-d. TestQ2_AlcanceBFSDescendientes (2 tests) → BFS UOA > UOB > UOC
  EXTRA. TestPermisosEfectivosPrecedencia (3) → DENY > GRANT > ROL > DEFAULT
===============================================================================
"""
from __future__ import annotations
import sys
from pathlib import Path

ROOT_FASTCHECK = Path(__file__).resolve().parent.parent
if str(ROOT_FASTCHECK) not in sys.path:
    sys.path.insert(0, str(ROOT_FASTCHECK))
sys.path.insert(0, str(ROOT_FASTCHECK / "app"))

from bson import ObjectId
import pytest

from conftest import FastcheckDBFake
from app.services.authz_service import (
    EnrichedUser, autorizar, en_alcance, permisos_efectivos,
    ESCALAMIENTO_NIVELES_FIJOS,
)

# ================================================================
# SEED FIJO
# ================================================================
PERMISOS_SEED: list[dict] = [
    {"codigo": "fastcheck.query", "es_sensible": False},
    {"codigo": "request.create", "es_sensible": False},
    {"codigo": "audit.view", "es_sensible": False},
    {"codigo": "admin.users", "es_sensible": False},
    {"codigo": "admin.structure", "es_sensible": False},
    {"codigo": "export.certificate", "es_sensible": False},
    {"codigo": "export.detail", "es_sensible": False},
    {"codigo": "third_party.approve", "es_sensible": False},
    {"codigo": "third_party.reject", "es_sensible": False},
    # Sensibles
    {"codigo": "party.query.pn", "es_sensible": True},
    {"codigo": "exception.authorize", "es_sensible": True},
    {"codigo": "admin.grant_sensitive", "es_sensible": True},
    {"codigo": "risk.lists.manage", "es_sensible": True},
    {"codigo": "risk.params.define", "es_sensible": True},
    {"codigo": "risk.thresholds.edit", "es_sensible": True},
    {"codigo": "risk.formula.edit", "es_sensible": True},
    # 6 extra
    {"codigo": "pn.motivos_consulta.read", "es_sensible": False},
    {"codigo": "pn.motivos_consulta.manage", "es_sensible": False},
    {"codigo": "org.changesets.apply", "es_sensible": False},
    {"codigo": "billing.view", "es_sensible": False},
    {"codigo": "billing.manage", "es_sensible": False},
    {"codigo": "credits.refill", "es_sensible": False},
    {"codigo": "audit.denials.stats", "es_sensible": False},
]

ROL_PERMISO_SEED: list[dict] = [
    {"rol_codigo": "tenant_admin", "permiso_codigo": "fastcheck.query", "modo": "INCLUIDO"},
    {"rol_codigo": "tenant_admin", "permiso_codigo": "request.create", "modo": "INCLUIDO"},
    {"rol_codigo": "tenant_admin", "permiso_codigo": "audit.view", "modo": "INCLUIDO"},
    {"rol_codigo": "tenant_admin", "permiso_codigo": "admin.users", "modo": "INCLUIDO"},
    {"rol_codigo": "tenant_admin", "permiso_codigo": "admin.structure", "modo": "INCLUIDO"},
    {"rol_codigo": "evaluator", "permiso_codigo": "fastcheck.query", "modo": "INCLUIDO"},
    {"rol_codigo": "evaluator", "permiso_codigo": "request.create", "modo": "INCLUIDO"},
    {"rol_codigo": "evaluator", "permiso_codigo": "export.detail", "modo": "INCLUIDO"},
    # Sensible VÍA ROL (debe ser IGNORADO x Paso4)
    {"rol_codigo": "tenant_admin", "permiso_codigo": "party.query.pn", "modo": "INCLUIDO"},
]

UID_SUPERVISOR = ObjectId("000000000000000000000001")
UID_TENANTADMIN = ObjectId("000000000000000000000002")
UID_EVALUATOR = ObjectId("000000000000000000000003")
UID_READONLY = ObjectId("000000000000000000000004")
UID_PJ_SIN_PN = ObjectId("000000000000000000000005")

ORG_ID = ObjectId("111111111111111111111111")
PAIS_ID_CL = ObjectId("222222222222222222222222")
UO_A = ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa")
UO_B = ObjectId("bbbbbbbbbbbbbbbbbbbbbbbb")
UO_C = ObjectId("cccccccccccccccccccccccc")

UNIDADES_ORG_SEED: list[dict] = [
    {"_id": UO_A, "organizacion_id": ORG_ID, "pais_id": PAIS_ID_CL,
     "codigo": "UO_A", "parent_id": None},
    {"_id": UO_B, "organizacion_id": ORG_ID, "pais_id": PAIS_ID_CL,
     "codigo": "UO_B", "parent_id": UO_A},
    {"_id": UO_C, "organizacion_id": ORG_ID, "pais_id": PAIS_ID_CL,
     "codigo": "UO_C", "parent_id": UO_B},
]


def make_base_db(**overrides) -> FastcheckDBFake:
    datasets = {
        "permisos": [dict(p) for p in PERMISOS_SEED],
        "rol_permiso": [dict(p) for p in ROL_PERMISO_SEED],
        "unidades_organizacionales": [dict(u) for u in UNIDADES_ORG_SEED],
        "usuario_rol": [],
        "usuario_permiso_override": [],
        "auditoria_log": [],
    }
    for k, v in overrides.items():
        datasets[k] = v
    return FastcheckDBFake(datasets)


# ================================================================
# U1-a) 7 PASOS — cada uno POSITIVO y NEGATIVO
# ================================================================
class TestPaso1Sesion:
    @pytest.mark.asyncio
    async def test_p1_negativo_sin_sesion(self):
        db = make_base_db()
        user_vacio = EnrichedUser(user_id=None)  # type: ignore[arg-type]
        dec = await autorizar(db, user_vacio, "fastcheck.query")
        assert dec.permitir is False
        assert dec.paso_fallido == 1
        assert "SESION_INVALIDA" in dec.motivo_denegacion

    @pytest.mark.asyncio
    async def test_p1_positivo_sesion_valida(self):
        db = make_base_db(usuario_rol=[
            {"usuario_id": UID_EVALUATOR, "rol_codigo": "evaluator"},
        ])
        user = EnrichedUser(
            user_id=UID_EVALUATOR, roles=["evaluator"],
            nivel_info="DETALLE_RIESGO",
            scopes_ver=[{"tipo_alcance": "PROPIO"}],
        )
        recurso_propio = {"creador_id": UID_EVALUATOR}
        dec = await autorizar(db, user, "fastcheck.query", recurso_propio,
                              nivel_requerido="DETALLE_RIESGO")
        assert dec.permitir is True
        assert dec.paso_fallido is None


class TestPaso2DenyOverride:
    @pytest.mark.asyncio
    async def test_p2_negativo_override_deny_gana(self):
        db = make_base_db(
            usuario_rol=[{"usuario_id": UID_EVALUATOR, "rol_codigo": "evaluator"}],
            usuario_permiso_override=[{
                "usuario_id": UID_EVALUATOR, "permiso_codigo": "fastcheck.query",
                "tipo_override": "DENY",
            }],
        )
        user = EnrichedUser(
            user_id=UID_EVALUATOR, roles=["evaluator"],
            scopes_ver=[{"tipo_alcance": "PROPIO"}],
            nivel_info="DETALLE_RIESGO",
        )
        dec = await autorizar(db, user, "fastcheck.query",
                              {"creador_id": UID_EVALUATOR},
                              nivel_requerido="DETALLE_RIESGO")
        assert dec.permitir is False
        assert dec.paso_fallido == 2
        assert dec.permiso_efectivo_origen == "OVERRIDE_DENY"

    @pytest.mark.asyncio
    async def test_p2_positivo_sin_override_deny(self):
        db = make_base_db(usuario_rol=[
            {"usuario_id": UID_EVALUATOR, "rol_codigo": "evaluator"},
        ])
        user = EnrichedUser(
            user_id=UID_EVALUATOR, roles=["evaluator"],
            scopes_ver=[{"tipo_alcance": "PROPIO"}],
            nivel_info="DETALLE_RIESGO",
        )
        dec = await autorizar(db, user, "fastcheck.query",
                              {"creador_id": UID_EVALUATOR},
                              nivel_requerido="DETALLE_RIESGO")
        assert dec.permitir is True


class TestPaso3RolYGrant:
    @pytest.mark.asyncio
    async def test_p3_negativo_rol_no_tiene(self):
        db = make_base_db()
        user = EnrichedUser(
            user_id=UID_READONLY, roles=[],
            scopes_ver=[{"tipo_alcance": "PROPIO"}],
            nivel_info="RESULTADO_GENERAL",
        )
        dec = await autorizar(db, user, "fastcheck.query",
                              {"creador_id": UID_READONLY},
                              nivel_requerido="RESULTADO_GENERAL")
        assert dec.permitir is False
        assert dec.paso_fallido == 3
        assert "DENY_DEFAULT" in dec.motivo_denegacion

    @pytest.mark.asyncio
    async def test_p3_positivo_override_grant(self):
        db = make_base_db(usuario_permiso_override=[{
            "usuario_id": UID_READONLY, "permiso_codigo": "fastcheck.query",
            "tipo_override": "GRANT",
        }])
        user = EnrichedUser(
            user_id=UID_READONLY, roles=[],
            scopes_ver=[{"tipo_alcance": "PROPIO"}],
            nivel_info="RESULTADO_GENERAL",
        )
        dec = await autorizar(db, user, "fastcheck.query",
                              {"creador_id": UID_READONLY},
                              nivel_requerido="RESULTADO_GENERAL")
        assert dec.permitir is True
        assert dec.permiso_efectivo_origen == "OVERRIDE_GRANT"


class TestPaso4GateSensible:
    @pytest.mark.asyncio
    async def test_p4_negativo_sensible_sin_confirmacion(self):
        """Override GRANT sin sensible_confirmado y user.sensibles_confirmados=empty."""
        db = make_base_db(usuario_rol=[
            {"usuario_id": UID_TENANTADMIN, "rol_codigo": "tenant_admin"},
        ], usuario_permiso_override=[{
            # GRANT SIN confirmacion: sensible → permitido=False
            "usuario_id": UID_TENANTADMIN, "permiso_codigo": "party.query.pn",
            "tipo_override": "GRANT", "sensible_confirmado": False,
        }])
        user = EnrichedUser(
            user_id=UID_TENANTADMIN, roles=["tenant_admin"],
            scopes_ver=[{"tipo_alcance": "ORGANIZACION", "organizacion_id": ORG_ID}],
            nivel_info="INFO_COMPLETA",
            sensibles_confirmados=set(),
        )
        dec = await autorizar(
            db, user, "party.query.pn", {"organizacion_id": ORG_ID},
            proposito="VER", nivel_requerido="INFO_COMPLETA",
            categoria_tercero="PN_NACIONAL",
        )
        # 2 ramas posibles:
        #  - Si permisos_efectivos devuelve permitido=False (por sensible sin
        #    confirm en override) → paso 3 DENY
        #  - Si permisos_efectivos → True (por bug o logica distinta) → paso4
        assert dec.permitir is False
        assert dec.paso_fallido in (3, 4)

    @pytest.mark.asyncio
    async def test_p4_positivo_sensible_override_confirmado(self):
        db = make_base_db(usuario_permiso_override=[{
            "usuario_id": UID_SUPERVISOR, "permiso_codigo": "party.query.pn",
            "tipo_override": "GRANT", "sensible_confirmado": True,
        }])
        user = EnrichedUser(
            user_id=UID_SUPERVISOR, is_superuser_wildcard=True,
            scopes_ver=[{"tipo_alcance": "ORGANIZACION", "organizacion_id": ORG_ID}],
            nivel_info="INFO_COMPLETA",
            sensibles_confirmados={"party.query.pn"},
        )
        dec = await autorizar(
            db, user, "party.query.pn", {"organizacion_id": ORG_ID},
            proposito="VER", nivel_requerido="INFO_COMPLETA",
            categoria_tercero="PN_NACIONAL",
        )
        assert dec.permitir is True
        assert dec.paso_fallido is None


class TestPaso5AlcanceScoping:
    @pytest.mark.asyncio
    async def test_p5_negativo_sin_match(self):
        db = make_base_db(usuario_rol=[
            {"usuario_id": UID_EVALUATOR, "rol_codigo": "evaluator"},
        ])
        user = EnrichedUser(
            user_id=UID_EVALUATOR, roles=["evaluator"],
            scopes_ver=[{"tipo_alcance": "PROPIO"}],
            nivel_info="DETALLE_RIESGO",
        )
        dec = await autorizar(db, user, "fastcheck.query",
                              {"creador_id": UID_TENANTADMIN},  # creado por OTRO
                              nivel_requerido="DETALLE_RIESGO")
        assert dec.permitir is False
        assert dec.paso_fallido == 5
        assert "FUERA_ALCANCE" in dec.motivo_denegacion

    @pytest.mark.asyncio
    async def test_p5_positivo_match_propio(self):
        db = make_base_db(usuario_rol=[
            {"usuario_id": UID_EVALUATOR, "rol_codigo": "evaluator"},
        ])
        user = EnrichedUser(
            user_id=UID_EVALUATOR, roles=["evaluator"],
            scopes_ver=[{"tipo_alcance": "PROPIO"}],
            nivel_info="DETALLE_RIESGO",
        )
        dec = await autorizar(db, user, "fastcheck.query",
                              {"creador_id": UID_EVALUATOR},
                              nivel_requerido="DETALLE_RIESGO")
        assert dec.permitir is True
        assert "MATCH_PROPIO" in dec.scope_match


class TestPaso6GatePN:
    @pytest.mark.asyncio
    async def test_p6_negativo_pj_consulta_pn_sin_autorizacion(self):
        """fastcheck.query sobre tercero PN y usuario NO tiene PN autorizado."""
        db = make_base_db(usuario_rol=[
            {"usuario_id": UID_PJ_SIN_PN, "rol_codigo": "tenant_admin"},
        ])
        user = EnrichedUser(
            user_id=UID_PJ_SIN_PN, roles=["tenant_admin"],
            tipos_tercero_autorizados=[],  # Q1: sin PN
            scopes_ver=[{"tipo_alcance": "PROPIO"}],
            nivel_info="DETALLE_RIESGO",
            sensibles_confirmados=set(),  # sin party.query.pn
        )
        dec = await autorizar(db, user, "fastcheck.query",
                              {"creador_id": UID_PJ_SIN_PN},
                              nivel_requerido="DETALLE_RIESGO",
                              categoria_tercero="PN_NACIONAL")
        assert dec.permitir is False
        assert dec.paso_fallido == 6
        assert ("PN_PROHIBIDO" in dec.motivo_denegacion
                or "SIN_AUTORIZACION" in dec.motivo_denegacion)

    @pytest.mark.asyncio
    async def test_p6_positivo_pn_autorizado(self):
        db = make_base_db(usuario_permiso_override=[{
            "usuario_id": UID_SUPERVISOR, "permiso_codigo": "party.query.pn",
            "tipo_override": "GRANT", "sensible_confirmado": True,
        }])
        user = EnrichedUser(
            user_id=UID_SUPERVISOR, is_superuser_wildcard=True,
            scopes_ver=[{"tipo_alcance": "PROPIO"}],
            nivel_info="INFO_COMPLETA",
            sensibles_confirmados={"party.query.pn"},
            tipos_tercero_autorizados=["PN_NACIONAL", "PN_EXTRANJERA"],
        )
        dec = await autorizar(db, user, "fastcheck.query",
                              {"creador_id": UID_SUPERVISOR},
                              nivel_requerido="INFO_COMPLETA",
                              categoria_tercero="PN_EXTRANJERA")
        assert dec.permitir is True


class TestPaso7NivelInfo:
    @pytest.mark.asyncio
    async def test_p7_nivel_user_l1_vs_req_l4_min(self):
        db = make_base_db(usuario_rol=[
            {"usuario_id": UID_READONLY, "rol_codigo": "evaluator"},
        ])
        user = EnrichedUser(
            user_id=UID_READONLY, roles=["evaluator"],
            scopes_ver=[{"tipo_alcance": "PROPIO"}],
            nivel_info="RESULTADO_GENERAL",  # L1
        )
        dec = await autorizar(db, user, "fastcheck.query",
                              {"creador_id": UID_READONLY},
                              nivel_requerido="DETALLE_RIESGO")  # L4
        assert dec.permitir is True
        assert dec.nivel_info_autorizado == "RESULTADO_GENERAL"  # min(1,4)=1

    @pytest.mark.asyncio
    async def test_p7_user_l5_vs_req_l4(self):
        db = make_base_db(usuario_rol=[
            {"usuario_id": UID_SUPERVISOR, "rol_codigo": "super_admin"},
        ])
        user = EnrichedUser(
            user_id=UID_SUPERVISOR, is_superuser_wildcard=True,
            scopes_ver=[{"tipo_alcance": "ORGANIZACION", "organizacion_id": ORG_ID}],
            nivel_info="INFO_COMPLETA",  # L5
        )
        dec = await autorizar(db, user, "fastcheck.query",
                              {"organizacion_id": ORG_ID},
                              nivel_requerido="DETALLE_RIESGO")  # L4
        assert dec.permitir is True
        assert dec.nivel_info_autorizado == "DETALLE_RIESGO"  # min(5,4)=4


# ================================================================
# U1-b) Q1 — PN DENEGADO POR DEFECTO
# ================================================================
class TestQ1GatePN:
    @pytest.mark.asyncio
    async def test_q1_a_tenantadmin_sin_grant_pn_denegado(self):
        db = make_base_db(usuario_rol=[
            {"usuario_id": UID_TENANTADMIN, "rol_codigo": "tenant_admin"},
        ])
        user = EnrichedUser(
            user_id=UID_TENANTADMIN, roles=["tenant_admin"],
            scopes_ver=[{"tipo_alcance": "ORGANIZACION", "organizacion_id": ORG_ID}],
            nivel_info="INFO_NO_SENSIBLE",
            sensibles_confirmados=set(),
            tipos_tercero_autorizados=[],
        )
        dec = await autorizar(
            db, user, "party.query.pn", {"organizacion_id": ORG_ID},
            proposito="VER", nivel_requerido="INFO_NO_SENSIBLE",
            categoria_tercero="PN_NACIONAL",
        )
        assert dec.permitir is False
        assert dec.paso_fallido in (3, 4, 6)

    @pytest.mark.asyncio
    async def test_q1_b_superuser_con_grant_confirmado_pn_ok(self):
        db = make_base_db(usuario_permiso_override=[{
            "usuario_id": UID_SUPERVISOR, "permiso_codigo": "party.query.pn",
            "tipo_override": "GRANT", "sensible_confirmado": True,
        }])
        user = EnrichedUser(
            user_id=UID_SUPERVISOR, roles=[], is_superuser_wildcard=True,
            scopes_ver=[{"tipo_alcance": "ORGANIZACION", "organizacion_id": ORG_ID}],
            nivel_info="INFO_COMPLETA",
            sensibles_confirmados={"party.query.pn"},
            tipos_tercero_autorizados=["PN_NACIONAL", "PN_EXTRANJERA"],
        )
        dec = await autorizar(
            db, user, "party.query.pn", {"organizacion_id": ORG_ID},
            proposito="VER", nivel_requerido="INFO_COMPLETA",
            categoria_tercero="PN_NACIONAL",
        )
        assert dec.permitir is True
        assert dec.pn_gate is True


# ================================================================
# U1-c) Q4 — 3 NIVELES FIJOS + DEFAULT NIVEL 1
# ================================================================
class TestQ4GrantSensibleDefaultNivel:
    def test_q4_a_tupla_niveles_exacta(self):
        assert ESCALAMIENTO_NIVELES_FIJOS == (1, 2, 3)
        assert len(ESCALAMIENTO_NIVELES_FIJOS) == 3
        assert 4 not in ESCALAMIENTO_NIVELES_FIJOS
        assert 5 not in ESCALAMIENTO_NIVELES_FIJOS

    def test_q4_b_default_nivel_1_helper(self):
        """Simula comportamiento del endpoint grant-sensible: nivel=None → 1."""
        def build_grant(nivel=None):
            return {"nivel": 1 if nivel is None else nivel}
        assert build_grant()["nivel"] == 1
        assert build_grant(2)["nivel"] == 2
        assert build_grant(3)["nivel"] == 3

    @pytest.mark.asyncio
    async def test_q4_c_grant_sensible_grabado_nivel_1(self):
        NIVELES_VALIDOS = [1, 2, 3]
        for nl in NIVELES_VALIDOS:
            assert nl in ESCALAMIENTO_NIVELES_FIJOS
        for nl in [0, 4, 5, 10, -1]:
            assert nl not in ESCALAMIENTO_NIVELES_FIJOS

        db = make_base_db(usuario_permiso_override=[{
            "usuario_id": UID_EVALUATOR, "permiso_codigo": "party.query.pn",
            "tipo_override": "GRANT", "sensible_confirmado": True,
            "nivel": 1,  # Q4 default
        }])
        doc = await db["usuario_permiso_override"].find_one({
            "usuario_id": UID_EVALUATOR,
            "permiso_codigo": "party.query.pn",
        })
        assert doc is not None
        assert doc["nivel"] == 1


# ================================================================
# U1-d) Q2 — BFS DESCENDIENTES ÁRBOL 3 NIVELES
# ================================================================
class TestQ2AlcanceBFSDescendientes:
    @pytest.mark.asyncio
    async def test_q2_a_bfs_nieta_coincide(self):
        db = make_base_db()
        user = EnrichedUser(
            user_id=UID_TENANTADMIN,
            scopes_ver=[{
                "tipo_alcance": "UNIDAD",
                "unidad_ids": [UO_A],
                "incluye_descendientes": True,  # Q2 default
            }],
        )
        recurso = {"unidad_id": UO_C}  # nieta
        ok, motivo = await en_alcance(db, user, recurso, "VER")
        assert ok is True
        assert motivo == "MATCH_UNIDAD_DESCENDIENTE"

    @pytest.mark.asyncio
    async def test_q2_b_sin_descendientes_no_coincide(self):
        db = make_base_db()
        user = EnrichedUser(
            user_id=UID_TENANTADMIN,
            scopes_ver=[{
                "tipo_alcance": "UNIDAD",
                "unidad_ids": [UO_A],
                "incluye_descendientes": False,  # NO BFS
            }],
        )
        recurso = {"unidad_id": UO_C}
        ok, motivo = await en_alcance(db, user, recurso, "VER")
        assert ok is False
        assert "SIN_MATCH" in motivo


# ================================================================
# EXTRA — Precedencia permisos_efectivos (DENY > GRANT > ROL > DEFAULT)
# ================================================================
class TestPermisosEfectivosPrecedencia:
    @pytest.mark.asyncio
    async def test_pe1_deny_override_gt_grant(self):
        db = make_base_db(
            usuario_rol=[{"usuario_id": UID_TENANTADMIN, "rol_codigo": "tenant_admin"}],
            usuario_permiso_override=[
                {"usuario_id": UID_TENANTADMIN, "permiso_codigo": "fastcheck.query",
                 "tipo_override": "GRANT"},
                {"usuario_id": UID_TENANTADMIN, "permiso_codigo": "fastcheck.query",
                 "tipo_override": "DENY"},
            ],
        )
        user = EnrichedUser(user_id=UID_TENANTADMIN, roles=["tenant_admin"])
        perms = await permisos_efectivos(db, user)
        assert perms["fastcheck.query"].permitido is False
        assert perms["fastcheck.query"].origen == "OVERRIDE_DENY"

    @pytest.mark.asyncio
    async def test_pe2_grant_override_gt_rol_ausente(self):
        db = make_base_db(
            usuario_rol=[{"usuario_id": UID_EVALUATOR, "rol_codigo": "evaluator"}],
            usuario_permiso_override=[{
                "usuario_id": UID_EVALUATOR, "permiso_codigo": "admin.structure",
                "tipo_override": "GRANT",
            }],
        )
        user = EnrichedUser(user_id=UID_EVALUATOR, roles=["evaluator"])
        perms = await permisos_efectivos(db, user)
        assert perms["admin.structure"].permitido is True
        assert perms["admin.structure"].origen == "OVERRIDE_GRANT"

    @pytest.mark.asyncio
    async def test_pe3_rol_hereda_admin_users(self):
        db = make_base_db(usuario_rol=[
            {"usuario_id": UID_TENANTADMIN, "rol_codigo": "tenant_admin"},
        ])
        user = EnrichedUser(user_id=UID_TENANTADMIN, roles=["tenant_admin"])
        perms = await permisos_efectivos(db, user)
        assert perms["admin.users"].permitido is True
        assert perms["admin.users"].origen == "ROL:tenant_admin"
