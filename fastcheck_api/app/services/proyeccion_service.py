"""
===============================================================================
 proyeccion_service.py — Proyección por 5 niveles de información (Fase 0)
===============================================================================
 Niveles (DOCX Tabla 19):
   NIVEL 1 · RESULTADO_GENERAL      → solo semáforo y campos mínimos
   NIVEL 2 · RESUMEN_NO_SENSIBLE    → resumen sin datos PN / sin riesgo profundo
   NIVEL 3 · INFO_NO_SENSIBLE       → auditor (sin campos sensibles flag)
   NIVEL 4 · DETALLE_RIESGO         → evaluador (completo menos sensibles PN)
   NIVEL 5 · INFO_COMPLETA          → admin (TODO, incluso sensibles si autorizado)

 MODO DE USO EN ENDPOINTS:
   - Autorizar con autorizar() → obtengo nivel_info_autorizado + pn_gate
   - Recuperar el documento tercero/evaluación COMPLETO desde DB
   - proyectar(doc, nivel, pn_gate=decision.pn_gate, sensible_autorizado=bool)
   - Devolver la proyección resultante (nunca el doc raw).

 METADATA de campos sensibles:
   Los dict de salida pueden tener un campo _meta_sensible (interno,
   eliminado antes de serializar respuesta) pero aquí implementamos un
   esquema de FIELDS_METADATA por tipo de entidad. En MVP mapeamos por
   listas blancas/negras explícitas por nivel.
===============================================================================
"""
from __future__ import annotations

from typing import Any

from fastcheck_api.app.services.authz_service import NIVEL_INFO_ORDEN, NivelInfo

# ---------------------------------------------------------------------------
# Definición de campos por entidad / nivel
# Cada entidad tiene WHITE_LIST por nivel (solo estos campos se entregan).
# Si un campo NO está en la WL del nivel N, se omite aunque exista en doc.
# ---------------------------------------------------------------------------

# Nivel 1 - mínimo (semaforo)
_NIVEL1_FASTCHECK = {
    "_id", "rut", "razon_social", "nombre",
    "riskAssessment.semaphore", "riskAssessment.nivel_riesgo",
    "fecha_evaluacion", "createdAt", "tipo_tercero_categoria",
}
# Nivel 2 - resumen
_NIVEL2_FASTCHECK = _NIVEL1_FASTCHECK | {
    "riskAssessment.totalSevero", "riskAssessment.totalMedio",
    "riskAssessment.totalBajo", "tenantId",
    "summaryData.causas.count",
}
# Nivel 3 - auditor (sin sensibles PN)
_NIVEL3_FASTCHECK = _NIVEL2_FASTCHECK | {
    "companyGeneralInfo", "financialRisk",
    "sheriffLogData.summaryData",
    "sourcesUsed", "aiAnalysis.summary",
}
# Nivel 4 - evaluador (detalle riesgo sin PN completa)
_NIVEL4_FASTCHECK = _NIVEL3_FASTCHECK | {
    "evaluationsHistory", "riskAssessment.allRules",
    "riskAssessment.details", "sheriffLogData.details",
}
# Nivel 5 - admin completa (absolutamente todo)
_NIVEL5_FASTCHECK: set = ...  # type: ignore

_FASTCHECK_LEVELS: dict[int, set[str] | None] = {
    1: _NIVEL1_FASTCHECK,
    2: _NIVEL2_FASTCHECK,
    3: _NIVEL3_FASTCHECK,
    4: _NIVEL4_FASTCHECK,
    5: None,  # None = pasa todo (INFO_COMPLETA)
}

# Campos estrictamente PN (siempre eliminados a menos que pn_gate AND
# es_sensible_autorizado=True y nivel ≥4)
_PN_EXCLUSIVE_FIELDS = {
    "persona_natural_info", "datos_sensibles_pn",
    "pn_historial_laboral", "pn_referencias_personales",
    "pn_datos_contacto_privado", "mother_family_names",
    "private_email", "private_phone",
}

# Campos marcados `sensible=true` que requieren
# es_sensible_autorizado=True aunque el nivel sea 5.
# NOTA: Eliminar POR PATH COMPLETO "a.b.c" si es posible.
_SENSIBLE_GATE_FIELDS = {
    "risk.params.define",
    "sheriffLogData.raw_payload",
    "internal_notes_sensible",
}
# Claves hojas finales usadas por los 3 paths (usada por _remove_keys_mixed
# para BORRAR recursivamente por última componente y por path exacto).
_SENSIBLE_GATE_LEAF_KEYS = {
    "internal_notes_sensible",   # top level hoja
    "raw_payload",               # sheriffLogData.raw_payload
    "define",                    # risk.params.define
}

# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------
def _nivel_num(nivel: NivelInfo) -> int:
    return NIVEL_INFO_ORDEN.get(nivel, 1)


def _filter_keys_by_path(doc: dict, whitelist: set[str] | None) -> dict:
    """
    Filtra un dict permitiendo paths del tipo "a.b.c".
    Si whitelist is None → return doc completo.
    """
    if whitelist is None:
        return doc
    out: dict = {}
    for path in whitelist:
        parts = path.split(".")
        cur_in: Any = doc
        cur_out = out
        for i, k in enumerate(parts):
            if not isinstance(cur_in, dict) or k not in cur_in:
                break
            if i == len(parts) - 1:
                cur_out[k] = cur_in[k]
            else:
                cur_out.setdefault(k, {})
                cur_out = cur_out[k]
                cur_in = cur_in[k]
    return out


def _remove_keys_recursive(obj: Any, forbidden: set[str]) -> Any:
    """Elimina recursivamente (dict/list):
      1) si obj es dict -> TODAS las claves k con k ∈ forbidden (top-level)
      2) adicionalmente, si obj es dict Y existe path "a.b.c" en forbidden
         se elimina o[parts[0]][parts[1]]...[parts[N]] si existe.
    """
    # Primero: path exactos "a.b.c"
    if isinstance(obj, dict):
        paths_con_punto = [p for p in forbidden if "." in p]
        for p in paths_con_punto:
            parts = p.split(".")
            cur: Any = obj
            ok = True
            for k in parts[:-1]:
                if isinstance(cur, dict) and k in cur:
                    cur = cur[k]
                else:
                    ok = False; break
            if ok and isinstance(cur, dict) and parts[-1] in cur:
                del cur[parts[-1]]
        # Segundo: top-level keys en forbidden (sin ".")
        hojas = {k for k in forbidden if "." not in k}
        return {
            k: _remove_keys_recursive(v, forbidden)
            for k, v in obj.items() if k not in hojas
        }
    if isinstance(obj, list):
        return [_remove_keys_recursive(x, forbidden) for x in obj]
    return obj


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------
def proyectar(
    documento: dict[str, Any],
    nivel_autorizado: NivelInfo,
    *,
    pn_gate: bool = False,
    es_sensible_autorizado: bool = False,
    tipo_entidad: str = "FASTCHECK_RESULT",
) -> dict[str, Any]:
    """
    Función de proyección genérica.

    :param documento: el dict completo desde DB.
    :param nivel_autorizado: nivel entregado por autorizar().nivel_info_autorizado
    :param pn_gate: True si el usuario pasó la comprobación PN
                     (party.query.pn autorizado y confirma sensible).
    :param es_sensible_autorizado: True si además está permitido acceder a
                                    campos de gobierno / raw payload sensibles.
    :param tipo_entidad: por ahora FASTCHECK_RESULT; extensible.
    :return: dict filtrado / proyectado (nunca el original mutado).
    """
    if not isinstance(documento, dict):
        return documento
    doc: dict = {k: v for k, v in documento.items()}

    n_num = _nivel_num(nivel_autorizado)

    # 1) WL por nivel
    if tipo_entidad == "FASTCHECK_RESULT":
        wl = _FASTCHECK_LEVELS.get(n_num, _FASTCHECK_LEVELS[1])
        doc = _filter_keys_by_path(doc, wl)

    # 2) PN gate: si NO pasó gate PN, elimina CUALQUIER campo PN
    if not pn_gate:
        doc = _remove_keys_recursive(doc, _PN_EXCLUSIVE_FIELDS)

    # 3) campos sensibles de gobierno
    if not es_sensible_autorizado:
        doc = _remove_keys_recursive(doc, _SENSIBLE_GATE_FIELDS)

    # 4) Limpiar meta / internos (por si vienen de DB)
    for k in ("__v", "_cache", "_raw"):
        doc.pop(k, None)

    return doc


def proyectar_lista(
    documentos: list[dict[str, Any]],
    nivel_autorizado: NivelInfo,
    **kwargs,
) -> list[dict[str, Any]]:
    """Helper list para búsqueda paginada."""
    return [proyectar(d, nivel_autorizado, **kwargs) for d in documentos]


def proyectar_nivel_especifico_para_accion(
    accion_codigo: str,
) -> NivelInfo:
    """
    Devuelve el NIVEL_REQUERIDO mínimo para cada acción (DOCX Sec 6.4).
    Usado antes de llamar a autorizar(nivel_requerido=…).
    """
    mapa: dict[str, NivelInfo] = {
        # Lectura
        "fastcheck.query":      "DETALLE_RIESGO",
        "audit.view":           "INFO_NO_SENSIBLE",
        # Exportación
        "export.certificate":   "RESUMEN_NO_SENSIBLE",
        "export.detail":        "DETALLE_RIESGO",
        # Decisión
        "third_party.approve":  "DETALLE_RIESGO",
        "third_party.reject":   "DETALLE_RIESGO",
        "exception.authorize":  "INFO_COMPLETA",
        # Sensibles gobierno
        "risk.lists.manage":    "INFO_COMPLETA",
        "risk.params.define":   "INFO_COMPLETA",
        "risk.thresholds.edit": "INFO_COMPLETA",
        "risk.formula.edit":    "INFO_COMPLETA",
        # Admin
        "admin.users":          "INFO_NO_SENSIBLE",
        "admin.structure":      "INFO_NO_SENSIBLE",
        "admin.grant_sensitive":"INFO_COMPLETA",
    }
    return mapa.get(accion_codigo, "RESULTADO_GENERAL")
