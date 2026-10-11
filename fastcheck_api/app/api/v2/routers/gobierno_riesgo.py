"""
Router Gobierno Riesgo V2 (Bloque 2.4 FASE2).
=============================================
4 permisos SENSIBLES = NO heredables de rol (L10 FASE2). Sólo GRANT individual
usuario_permiso_override con sensible_confirmado=True + escalamiento 3 niveles
(Q4). Modal doble intención requerido: body.confirmacion_cambio_riesgo=True.

Rutas:
  GET /v2/risk/config
  PUT /v2/risk/lists          risk.lists.manage       (NIVEL ESC REQ = 1)
  PUT /v2/risk/params         risk.params.define      (NIVEL ESC REQ = 2)
  PUT /v2/risk/thresholds     risk.thresholds.edit    (NIVEL ESC REQ = 2)
  PUT /v2/risk/formula        risk.formula.edit       (NIVEL ESC REQ = 3)
"""
from __future__ import annotations

import copy
import time
from typing import Annotated, Any, Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from fastcheck_api.app.api.dependencies import CurrentUser, get_current_user, require_permission
from fastcheck_api.app.core.mongodb import get_db
from fastcheck_api.app.services.authz_service import (
    AuthzDecision,
    EnrichedUser,
    autorizar,
    hydrate_user_from_db,
    registrar_auditoria,
)
from fastcheck_api.app.utils.mongo import jsonable, to_object_id

router = APIRouter(prefix="/risk", tags=["gobierno-riesgo-v2"])


# ---------------------------------------------------------------------------
# TIPOS, HELPERS, GATES
# ---------------------------------------------------------------------------
_TIPO_LISTA = Literal["BLANCA", "NEGRA"]
_PERM_NIVEL_REQUERIDO: dict[str, int] = {
    "risk.lists.manage":    1,
    "risk.params.define":   2,
    "risk.thresholds.edit": 2,
    "risk.formula.edit":    3,
}
_ACCION_AUDIT: dict[str, str] = {
    "risk.lists.manage":    "gobierno.riesgo.listas",
    "risk.params.define":   "gobierno.riesgo.params",
    "risk.thresholds.edit": "gobierno.riesgo.umbrales",
    "risk.formula.edit":    "gobierno.riesgo.formula",
}


def _oid(x: Any) -> ObjectId | None:
    return to_object_id(x) if x else None


def _org_oid(user: CurrentUser) -> ObjectId:
    o = _oid(user.organizacion_id or user.tenant)
    if not o:
        raise HTTPException(status_code=400, detail="ORGANIZACION_ID_REQUERIDO")
    return o


async def _enriched(user: CurrentUser, db: AsyncIOMotorDatabase) -> EnrichedUser:
    return await hydrate_user_from_db(db, user_id=ObjectId(user.id), tenant_id=ObjectId(user.tenant))


def _gate_modal_doble_intencion(body: BaseModel, perm_cod: str) -> None:
    """Modal doble intención: body.confirmacion_cambio_riesgo DEBE ser True."""
    ok = getattr(body, "confirmacion_cambio_riesgo", False) is True
    if not ok:
        raise HTTPException(
            status_code=428,
            detail={
                "code": "MODAL_DOBLE_INTENCION_REQUERIDA",
                "permiso": perm_cod,
                "message":
                    "Cambio sensible requiere confirmación explícita: "
                    "confirmacion_cambio_riesgo=true. Campo no presente o false.",
            },
        )


def _gate_nivel_escalamiento(
    user: CurrentUser, enriched_u: EnrichedUser, perm_cod: str
) -> int:
    """
    Gate Q4 escalamiento. Permisos SENSIBLES tienen 3 niveles:
      1 = básico, 2 = medio, 3 = máximo (fórmula scoring).
    Busca en `usuario_permiso_override` el atributo `nivel_escalamiento` para
    este permiso GRANT confirmado. Superuser wildcard = NIVEL 3 siempre OK.
    Devuelve el nivel otorgado; raise 403 si nivel < requerido.
    """
    req = _PERM_NIVEL_REQUERIDO[perm_cod]
    if user.role == "superuser":
        return max(req, 3)

    otorgado = 1
    for ov in enriched_u.usuario_permiso_overrides or []:
        if (
            ov.get("permiso_codigo") == perm_cod
            and ov.get("tipo_override") == "GRANT"
            and ov.get("sensible_confirmado") is True
        ):
            otorgado = max(otorgado, int(ov.get("nivel_escalamiento") or 1))
    if otorgado < req:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "ESCALAMIENTO_INSUFICIENTE_Q4",
                "permiso": perm_cod,
                "nivel_requerido": req,
                "nivel_otorgado": otorgado,
                "message":
                    "Permiso sensible requiere nivel escalamiento >= "
                    f"{req}. Otorgado={otorgado}. GRANT individual via SuperAdmin con escalamiento={req}.",
            },
        )
    return otorgado


async def _leer_y_escribir_config(
    db: AsyncIOMotorDatabase,
    *,
    user: CurrentUser,
    col_name: str,
    filtro_upsert: dict,
    set_body: dict,
    perm_cod: str,
    campos_clave_audit: list[str],
) -> dict:
    """
    Helper genérico: (1) lee doc anterior (valor_anterior);
    (2) upsert nuevo; (3) lee doc actualizado valor_nuevo;
    (4) escribe auditoria_log accion gobierno.riesgo.*.
    """
    col = db[col_name]
    anterior = await col.find_one(filtro_upsert)
    anterior_clean = jsonable(anterior) if anterior else None

    now = time.time()
    stamp_fields = {
        "actualizado_en": now,
        "actualizado_por_id": ObjectId(user.id),
        "actualizado_por_email": user.email or "",
        "organizacion_id": _org_oid(user),
    }
    actualizar = dict(set_body)
    actualizar.update(stamp_fields)
    if not anterior:
        actualizar["creado_en"] = now
        actualizar["creado_por_id"] = ObjectId(user.id)

    await col.update_one(filtro_upsert, {"$set": actualizar}, upsert=True)
    nuevo = await col.find_one(filtro_upsert)
    nuevo_clean = jsonable(nuevo) if nuevo else None

    delta_anterior = (
        {k: anterior_clean.get(k) for k in campos_clave_audit} if anterior_clean else None
    )
    delta_nuevo = {k: nuevo_clean.get(k) for k in campos_clave_audit} if nuevo_clean else None
    try:
        eu_min = EnrichedUser(
            user_id=ObjectId(user.id),
            organizacion_id=_org_oid(user),
            email=getattr(user, "email", "") or "",
        )
        decision_pos = AuthzDecision(
            permitir=True, paso_fallido=None, motivo_denegacion="",
            permiso_efectivo_origen=f"OVERRIDE_GRANT:{perm_cod}",
            nivel_info_autorizado="INFO_COMPLETA", pn_gate=False, scope_match="ORG",
        )
        await registrar_auditoria(
            db,
            user=eu_min,
            accion_codigo=_ACCION_AUDIT[perm_cod],
            decision=decision_pos,
            recurso={"entidad_tipo": col_name,
                     "entidad_id": (str(nuevo_clean.get("_id")) if nuevo_clean else None)},
            valor_anterior=delta_anterior,
            valor_nuevo=delta_nuevo,
        )
    except Exception:
        pass
    return nuevo_clean or {}


# ---------------------------------------------------------------------------
# SCHEMAS PYDANTIC
# ---------------------------------------------------------------------------


class BaseCambioSensible(BaseModel):
    confirmacion_cambio_riesgo: bool = Field(
        False,
        description="Modal doble intención: DEBE ser True para cualquier cambio.",
    )
    motivo: str | None = Field(default=None, max_length=500)


class ListasPropiasRiesgo(BaseCambioSensible):
    tipo_lista: _TIPO_LISTA = Field(..., description="BLANCA (excluida evaluación) o NEGRA (agravante).")
    entries: list[str] = Field(default_factory=list, min_length=0, max_length=5000)
    descripcion: str | None = Field(default=None, max_length=500)


class RiesgoParametrosConfig(BaseCambioSensible):
    ponderaciones: dict[str, float] = Field(
        default_factory=dict, description="Pesos scoring por factor riesgo (ej: juridico=0.3, reputacional=0.4)."
    )
    flags_modo: dict[str, bool] = Field(default_factory=dict)
    parametros_extra: dict[str, Any] = Field(default_factory=dict)


class RiesgoUmbralesConfig(BaseCambioSensible):
    umbral_verde_lte: float = Field(default=30.0, ge=0, le=100)
    umbral_amarillo_lte: float = Field(default=65.0, ge=0, le=100)
    umbral_rojo_gt: float = Field(default=65.0, ge=0, le=100)
    pesos_factor: dict[str, float] = Field(default_factory=dict)
    notas_version: str | None = Field(default=None, max_length=500)


class FormulaScoringConfig(BaseCambioSensible):
    formula_codigo: str = Field(..., min_length=3, max_length=20000)
    version_etiqueta: str = Field(default="1.0.0", max_length=24)
    test_cases: list[dict[str, Any]] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# RUTAS
# ---------------------------------------------------------------------------


@router.get(
    "/config",
    summary="Leer configuración riesgo actual (listas/umbrales/params/formula) según permisos.",
)
async def get_risk_config(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    request: Request,
) -> dict:
    eu = await _enriched(user, db)
    org = _org_oid(user)
    result: dict[str, Any] = {"organizacion_id": str(org), "configs": {}}
    permisos_check = [
        ("risk.lists.manage",    "listas_propias_v2",     [("organizacion_id", org)]),
        ("risk.params.define",   "evaluationparameters",  [("organizacion_id", org)]),
        ("risk.thresholds.edit", "config_umbrales_riesgo",[("organizacion_id", org)]),
        ("risk.formula.edit",    "config_formulas_scoring", [("organizacion_id", org)]),
    ]
    for perm, coln, key_tuples in permisos_check:
        dec = await autorizar(db, eu, recurso="config:gobierno-riesgo", proposito="VER",
                              accion_codigo=perm)
        if not dec.permitir:
            continue
        if perm == "risk.lists.manage":
            docs_raw = await db[coln].find(dict(key_tuples)).to_list(length=50)
            result["configs"]["listas_propias"] = [jsonable(d) for d in docs_raw]
        else:
            one = await db[coln].find_one(dict(key_tuples))
            result["configs"][coln] = jsonable(one) if one else None
    return result


@router.put(
    "/lists",
    summary="Gestión Listas Propias BLANCA/NEGRA — permiso SENSIBLE risk.lists.manage (ESC=1).",
    status_code=200,
    dependencies=[Depends(require_permission("risk.lists.manage"))],
)
async def put_risk_lists(
    body: ListasPropiasRiesgo,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    request: Request,
) -> dict:
    perm_cod = "risk.lists.manage"
    eu = await _enriched(user, db)
    _gate_modal_doble_intencion(body, perm_cod)
    _gate_nivel_escalamiento(user, eu, perm_cod)

    filtro = {"organizacion_id": _org_oid(user), "tipo_lista": body.tipo_lista}
    set_fields = {
        "entries": [str(x).strip() for x in body.entries],
        "descripcion": body.descripcion,
        "motivo_cambio": body.motivo,
    }
    doc = await _leer_y_escribir_config(
        db, user=user, col_name="listas_propias_v2", filtro_upsert=filtro,
        set_body=set_fields, perm_cod=perm_cod,
        campos_clave_audit=["tipo_lista", "entries", "descripcion", "motivo_cambio"],
    )
    return {"ok": True, "tipo_lista": body.tipo_lista, "doc": doc}


@router.put(
    "/params",
    summary="Definir parámetros evaluación riesgo — permiso SENSIBLE risk.params.define (ESC=2).",
    status_code=200,
    dependencies=[Depends(require_permission("risk.params.define"))],
)
async def put_risk_params(
    body: RiesgoParametrosConfig,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    request: Request,
) -> dict:
    perm_cod = "risk.params.define"
    eu = await _enriched(user, db)
    _gate_modal_doble_intencion(body, perm_cod)
    _gate_nivel_escalamiento(user, eu, perm_cod)

    filtro = {"organizacion_id": _org_oid(user)}
    set_fields = {
        "ponderaciones": body.ponderaciones,
        "flags_modo": body.flags_modo,
        "parametros_extra": body.parametros_extra,
        "motivo_cambio": body.motivo,
    }
    doc = await _leer_y_escribir_config(
        db, user=user, col_name="evaluationparameters", filtro_upsert=filtro,
        set_body=set_fields, perm_cod=perm_cod,
        campos_clave_audit=["ponderaciones", "flags_modo", "parametros_extra", "motivo_cambio"],
    )
    return {"ok": True, "doc": doc}


@router.put(
    "/thresholds",
    summary="Cambiar umbrales semáforo V/A/R + pesos — permiso SENSIBLE risk.thresholds.edit (ESC=2).",
    status_code=200,
    dependencies=[Depends(require_permission("risk.thresholds.edit"))],
)
async def put_risk_thresholds(
    body: RiesgoUmbralesConfig,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    request: Request,
) -> dict:
    perm_cod = "risk.thresholds.edit"
    eu = await _enriched(user, db)
    _gate_modal_doble_intencion(body, perm_cod)
    _gate_nivel_escalamiento(user, eu, perm_cod)

    if not (body.umbral_verde_lte < body.umbral_amarillo_lte <= body.umbral_rojo_gt):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "UMBRALES_RIESGO_INVALIDOS",
                "message": "Secuencia umbrales DEBE ser: verde < amarillo <= rojo.",
            },
        )

    filtro = {"organizacion_id": _org_oid(user)}
    set_fields = {
        "umbral_verde_lte": float(body.umbral_verde_lte),
        "umbral_amarillo_lte": float(body.umbral_amarillo_lte),
        "umbral_rojo_gt": float(body.umbral_rojo_gt),
        "pesos_factor": body.pesos_factor,
        "notas_version": body.notas_version,
        "motivo_cambio": body.motivo,
    }
    doc = await _leer_y_escribir_config(
        db, user=user, col_name="config_umbrales_riesgo", filtro_upsert=filtro,
        set_body=set_fields, perm_cod=perm_cod,
        campos_clave_audit=[
            "umbral_verde_lte", "umbral_amarillo_lte", "umbral_rojo_gt",
            "pesos_factor", "motivo_cambio",
        ],
    )
    return {"ok": True, "doc": doc}


@router.put(
    "/formula",
    summary="Definir fórmula scoring custom — permiso SENSIBLE risk.formula.edit (ESC=3). NIVEL MÁXIMO Q4.",
    status_code=200,
    dependencies=[Depends(require_permission("risk.formula.edit"))],
)
async def put_risk_formula(
    body: FormulaScoringConfig,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    request: Request,
) -> dict:
    perm_cod = "risk.formula.edit"
    eu = await _enriched(user, db)
    _gate_modal_doble_intencion(body, perm_cod)
    _gate_nivel_escalamiento(user, eu, perm_cod)

    filtro = {"organizacion_id": _org_oid(user)}
    set_fields = {
        "formula_codigo": body.formula_codigo,
        "version_etiqueta": body.version_etiqueta,
        "test_cases": body.test_cases,
        "motivo_cambio": body.motivo,
    }
    doc = await _leer_y_escribir_config(
        db, user=user, col_name="config_formulas_scoring", filtro_upsert=filtro,
        set_body=set_fields, perm_cod=perm_cod,
        campos_clave_audit=[
            "formula_codigo", "version_etiqueta", "test_cases", "motivo_cambio",
        ],
    )
    return {"ok": True, "doc": doc}
