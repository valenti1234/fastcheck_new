"""
===============================================================================
 test_proyeccion_service.py — PRUEBAS UNITARIAS PURAS (Bloque 0.8 U2)
===============================================================================
FUNCIÓN OBJETIVO: proyectar(documento, nivel, pn_gate, es_sensible_autorizado)
  → dict proyectado.

ESTRATEGIA: proyeccion_service.proyectar() es FUNCIÓN PURA (no DB, no state).
0 escrituras. 0 conexiones mongo. 0 riesgo safety.

SUITE:
  U2-a · TestNivelesCadena (3 tests):
       - niveles_construccion_L1_L2_L3_L4_subconjunto_estatico (L1⊆L2⊆L3⊆L4)
       - proyectar_documento_completo_L5_es_identico (L5 = todo)
       - proyectar_cadena_subconjunto (proyectar L1..L5 y validar
         L1.keys ⊆ L2.keys ⊆ L3.keys ⊆ L4.keys ⊆ L5.keys)

  U2-b · TestGatePN (2 tests):
       - pn_gate_False_elimina_8_campos_pn (ningún campo PN_EXCLUSIVE
         aparece en la proyección)
       - pn_gate_True_conserva_8_campos_pn (todos los 8 campos PN pasan)

  U2-c · TestGateSensible (2 tests):
       - sensible_False_L5_elimina_3_campos (internal_notes_sensible,
         sheriffLogData.raw_payload, risk.params.define ELIMINADOS)
       - sensible_True_L5_conserva_3_campos (todos 3 presentes)

  EXTRA (2): proyectar_lista, proyectar_nivel_especifico_para_accion mapping.
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

# Importar propiedades privadas del servicio para aserciones exactas:
from app.services.proyeccion_service import (
    proyectar,
    proyectar_lista,
    proyectar_nivel_especifico_para_accion,
    _FASTCHECK_LEVELS,
    _PN_EXCLUSIVE_FIELDS,
    _NIVEL1_FASTCHECK,
    _NIVEL2_FASTCHECK,
    _NIVEL3_FASTCHECK,
    _NIVEL4_FASTCHECK,
)
from app.services.authz_service import NivelInfo


# ====================================================================
# DOCUMENTO COMPLETO FIJO (se usa en TODOS los tests)
# Contiene: campo cada nivel WL, cada PN_EXCLUSIVE, cada SENSIBLE_GATE,
# además de nested (risk.params.define, sheriffLogData.raw_payload).
# ====================================================================
OID = ObjectId("ffffffffffffffffffffffff")

# Helper para armar un diccionario anidado desde path "a.b.c" = val
def _poner_path(d: dict, path: str, val):
    parts = path.split(".")
    cur = d
    for p in parts[:-1]:
        cur = cur.setdefault(p, {})
    cur[parts[-1]] = val
    return d


# Helper para comprobar que TODOS los paths "a.b.c" en un set existen en un doc proyectado
def _check_paths_present(doc: dict, paths: set[str]) -> list[str]:
    """Retorna lista de paths FALTANTES (que no se encuentran en doc)."""
    faltantes = []
    for path in paths:
        if path == "_id":
            continue
        parts = path.split(".")
        cur = doc
        ok = True
        for k in parts:
            if isinstance(cur, dict) and k in cur:
                cur = cur[k]
            else:
                ok = False; break
        if not ok:
            faltantes.append(path)
    return faltantes


def make_documento_completo() -> dict:
    doc: dict = {"_id": OID}
    # Agregar TODOS los campos de la whitelist
    for nivel_wl in [_NIVEL1_FASTCHECK, _NIVEL2_FASTCHECK, _NIVEL3_FASTCHECK, _NIVEL4_FASTCHECK]:
        for path in nivel_wl:
            # valores dummy por tipo
            if path == "_id":
                continue
            if path.startswith("riskAssessment") or path.startswith("summaryData") or path.startswith("sheriffLogData") or path.startswith("aiAnalysis"):
                _poner_path(doc, path, f"VAL_DUMMY_{path}")
            else:
                doc[path] = f"VAL_DUMMY_{path}"
    # risk. params.define = SENSIBLE GATE (path 3 niveles)
    _poner_path(doc, "risk.params.define", "SENSIBLE_DEFINE_DICT_VALUE")
    # sheriffLogData.raw_payload
    _poner_path(doc, "sheriffLogData.raw_payload", b"RAW_BIN_SENSIBLE_dummy")
    # internal_notes_sensible top-level
    doc["internal_notes_sensible"] = ["nota1 sensible", "nota2 sensible"]
    # PN exclusive 8 campos
    for campo in sorted(_PN_EXCLUSIVE_FIELDS):
        doc[campo] = f"PN_DUMMY_{campo}"
    # meta / internos (deben ser limpiados siempre)
    doc["__v"] = 3
    doc["_cache"] = {"hash": 1234}
    doc["_raw"] = "<raw blob>"
    return doc


# ================================================================
# U2-a) 5 NIVELES CADENA L1⊆L2⊆L3⊆L4⊆L5
# ================================================================
class TestNivelesCadena:
    def test_niveles_construccion_L1_L2_L3_L4_subconjunto_estatico(self):
        """Validación DIRECTA sobre los sets de constantes (sin correr
        proyectar): L1 ⊆ L2 ⊆ L3 ⊆ L4, y cada uno aumenta size exacto."""
        assert _NIVEL1_FASTCHECK < _NIVEL2_FASTCHECK
        assert _NIVEL2_FASTCHECK < _NIVEL3_FASTCHECK
        assert _NIVEL3_FASTCHECK < _NIVEL4_FASTCHECK
        # _FASTCHECK_LEVELS[5] == None → pasan todos
        assert _FASTCHECK_LEVELS[5] is None

    def test_proyectar_L5_es_identico_salvo_meta_y_gates_apagados(self):
        """L5 + pn_gate=True + es_sensible_autorizado=True → debe retornar
        todo el documento salvo __v / _cache / _raw (que siempre se limpian).
        """
        doc = make_documento_completo()
        out = proyectar(doc, "INFO_COMPLETA",
                        pn_gate=True, es_sensible_autorizado=True)
        # Siempre se eliminan
        for k in ("__v", "_cache", "_raw"):
            assert k not in out
        # PN 8 campos existen
        for campo in _PN_EXCLUSIVE_FIELDS:
            assert campo in out, f"Campo PN {campo} perdido en L5 con PN gate=True"
        # Sensibles existen
        assert "internal_notes_sensible" in out
        assert out["sheriffLogData"]["raw_payload"] is not None
        assert out["risk"]["params"]["define"] is not None

    def test_proyectar_cadena_subconjunto_en_docs_salida(self):
        """Proyecta L1..L5 con gates=True. Valida que llaves proyectadas
        cumplen L1 ⊆ L2 ⊆ L3 ⊆ L4 ⊆ L5 (comparando SET de llaves).
        """
        doc = make_documento_completo()
        niveles_orden: list[NivelInfo] = [
            "RESULTADO_GENERAL",
            "RESUMEN_NO_SENSIBLE",
            "INFO_NO_SENSIBLE",
            "DETALLE_RIESGO",
            "INFO_COMPLETA",
        ]
        outs = [proyectar(dict(doc), n, pn_gate=True,
                         es_sensible_autorizado=True)
                for n in niveles_orden]
        llaves = [set(o.keys()) for o in outs]
        for i in range(len(llaves) - 1):
            assert llaves[i] <= llaves[i+1], (
                f"Fallo cadena L{i+1} ⊆ L{i+2}. "
                f"En L{i+1} hay {len(llaves[i])} keys, "
                f"en L{i+2} hay {len(llaves[i+1])} keys. "
                f"Keys extra en L{i+1} pero no en L{i+2}: "
                f"{sorted(llaves[i] - llaves[i+1])}"
            )


# ================================================================
# U2-b) GATE PN — 8 campos _PN_EXCLUSIVE
# ================================================================
class TestGatePN:
    def test_pn_gate_False_elimina_8_campos_pn(self):
        """pn_gate=False → NINGÚN campo de _PN_EXCLUSIVE_FIELDS
        puede aparecer en el doc resultante (ni nested, ni top-level)."""
        doc = make_documento_completo()
        # Inyectar PN fields NESTED también en un list item para probar
        # recursividad remove_keys.
        doc["nested"] = {
            "inner_list": [
                {"persona_natural_info": "PN_DENTRO_LISTA",
                 "other": 33,
                },
                {
                    "private_email": "foo@bar",
                    "sub": {"pn_historial_laboral": "X"},
                },
            ],
            "mother_family_names": "gates",
        }
        out = proyectar(doc, nivel_autorizado="INFO_COMPLETA",
                        pn_gate=False, es_sensible_autorizado=True)
        # Detectar campos PN por nombre en cualquier profundidad / lista.
        def buscar_pn(o) -> list:
            found = []
            if isinstance(o, dict):
                for k, v in o.items():
                    if k in _PN_EXCLUSIVE_FIELDS:
                        found.append(k)
                    found.extend(buscar_pn(v))
            elif isinstance(o, list):
                for x in o:
                    found.extend(buscar_pn(x))
            return found
        enocntrados = buscar_pn(out)
        assert len(enocntrados) == 0, (
            f"Se encontraron campos PN en proyección con pn_gate=False: "
            f"{sorted(set(enocntrados))}"
        )

    def test_pn_gate_True_conserva_8_campos_pn(self):
        """pn_gate=True → los 8 campos top-level aparecen en doc L5."""
        doc = make_documento_completo()
        out = proyectar(doc, nivel_autorizado="INFO_COMPLETA",
                        pn_gate=True, es_sensible_autorizado=True)
        # Contar 8 campos PN presentes en salida (top level)
        presentes = [campo for campo in sorted(_PN_EXCLUSIVE_FIELDS)
                     if campo in out]
        assert len(presentes) == 8, (
            f"Se esperaban 8 campos PN presentes; encontrados {len(presentes)}: "
            f"{presentes}. Faltan: {sorted(set(_PN_EXCLUSIVE_FIELDS)-set(presentes))}"
        )


# ================================================================
# U2-c) GATE SENSIBLE — 3 campos eliminados
#   _SENSIBLE_GATE_FIELDS = {
#      "risk.params.define",
#      "sheriffLogData.raw_payload",
#      "internal_notes_sensible",
#   }
# ================================================================
class TestGateSensible:
    def test_sensible_False_L5_elimina_3_campos(self):
        """L5 / es_sensible_autorizado=False → deben eliminarse
        (recursivamente) los 3 paths. Se valida por path presence."""
        doc = make_documento_completo()
        # Añadir una segunda ocurrencia anidada en un dict de una lista
        # para comprobar recursividad.
        doc["evaluaciones_detalle"] = [
            {"eval_id": 1,
             "sheriffLogData": {"raw_payload": b"<nested en lista>"},
             "risk": {"params": {"define": {"N": 2}}},
             "internal_notes_sensible": "dentroLista",
            },
        ]
        out = proyectar(doc, nivel_autorizado="INFO_COMPLETA",
                        pn_gate=True, es_sensible_autorizado=False)

        # internal_notes_sensible (top level)
        assert "internal_notes_sensible" not in out, (
            "internal_notes_sensible NO eliminado en top-level cuando "
            "es_sensible_autorizado=False"
        )
        # sheriffLogData.raw_payload path 2 niveles
        if "sheriffLogData" in out:
            assert "raw_payload" not in out["sheriffLogData"], (
                "sheriffLogData.raw_payload NO eliminado en top-level cuando "
                "es_sensible_autorizado=False"
            )
        # risk.params.define path 3 niveles
        if "risk" in out and "params" in out.get("risk", {}):
            assert "define" not in out["risk"]["params"], (
                "risk.params.define NO eliminado cuando "
                "es_sensible_autorizado=False"
            )
        # Dentro de evaluaciones_detalle lista (recursividad)
        if "evaluaciones_detalle" in out:
            for i, item in enumerate(out["evaluaciones_detalle"]):
                assert "internal_notes_sensible" not in item, (
                    f"internal_notes_sensible presente en lista item {i}"
                )
                sl = item.get("sheriffLogData") or {}
                assert "raw_payload" not in sl, (
                    f"sheriffLogData.raw_payload en lista item {i}"
                )
                rp = (item.get("risk") or {}).get("params") or {}
                assert "define" not in rp, (
                    f"risk.params.define presente en lista item {i}"
                )

    def test_sensible_True_L5_conserva_3_campos(self):
        doc = make_documento_completo()
        out = proyectar(doc, nivel_autorizado="INFO_COMPLETA",
                        pn_gate=True, es_sensible_autorizado=True)
        assert "internal_notes_sensible" in out
        assert "raw_payload" in out["sheriffLogData"]
        assert "define" in out["risk"]["params"]


# ================================================================
# EXTRA · proyectar_lista + proyectar_nivel_especifico_para_accion
# ================================================================
class TestExtras:
    def test_proyectar_lista_respeta_tamanyo(self):
        doc1 = make_documento_completo()
        doc2 = make_documento_completo()
        outs = proyectar_lista([doc1, doc2], "RESULTADO_GENERAL",
                               pn_gate=False, es_sensible_autorizado=False)
        assert len(outs) == 2
        for o in outs:
            faltantes = _check_paths_present(o, _NIVEL1_FASTCHECK)
            assert len(faltantes) == 0, (
                f"Faltan paths de L1 en salida proyectar_lista: {faltantes}"
            )

    def test_nivel_especifico_para_accion_fastcheck_query_es_detalle(self):
        """Acción fastcheck.query → DETALLE_RIESGO (L4)"""
        assert proyectar_nivel_especifico_para_accion("fastcheck.query") == "DETALLE_RIESGO"
        assert proyectar_nivel_especifico_para_accion("audit.view") == "INFO_NO_SENSIBLE"
