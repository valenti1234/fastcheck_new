"""capacidad_pool.py · Bloque 2.5 Q6. Router V2 para administración de créditos y pool 5 niveles.

Endpoints:
- GET /v2/creditos/config  → vista pool config org + planes (permiso pool.credit.view)
- PUT /v2/creditos/plan    → cambiar plan pool (permiso pool.credit.manage SENSIBLE, modal doble intencion + escal>=3)
- GET /v2/creditos/consumo-historial  → lista consumos_log_v2 ultimos N días (pool.credit.view)
- POST /v2/creditos/consumir → endpoint interno (consumo credito por operacion) - solo superadmin o servicio interno
- GET /v2/creditos/notificaciones → notifiche soglie 90/100/120% + personali (pool.credit.view)
- POST /v2/creditos/notificaciones/{id}/leida → mark read (pool.credit.view)
- PUT /v2/creditos/limite-usuario → cuota individual usuario/mes (pool.credit.manage sensible)
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Optional

from bson import ObjectId
from fastapi import APIRouter, Body, Depends, HTTPException, Path, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field, ValidationError

from fastcheck_api.app.api.dependencies import (
    CurrentUser, get_current_user, get_db, require_permission,
)
from fastcheck_api.app.services.authz_service import (
    AuthzDecision, EnrichedUser, NIVELES_POOL_5, SOGLIE_NOTIFICA_CREDITOS_PCT,
    SOGLIE_NOTIFICA_MAP, hydrate_user_from_db, registrar_auditoria,
)
from fastcheck_api.app.services.servicio_capacidad_pool import (
    asignar_limite_usuario_mes, cambiar_plan_pool, consumir_credito,
    listar_notificaciones_usuario, marcar_notificacion_leida, obtener_pool_org,
)


router = APIRouter(prefix="/v2/creditos", tags=["Capacidad · Pool Créditos Q6"])


async def _enriched(user: CurrentUser, db: AsyncIOMotorDatabase) -> EnrichedUser:
    """Ricostruisce EnrichedUser via hydrate (stesso pattern di gobierno_riesgo)."""
    return await hydrate_user_from_db(db, user_id=ObjectId(user.id))


def _to_jsonable(d):
    import json as _json
    def _default(o):
        if isinstance(o, ObjectId):
            return str(o)
        if isinstance(o, (datetime,)):
            return o.isoformat()
        return str(o)
    try:
        return _json.loads(_json.dumps(d, default=_default))
    except Exception:
        return d


# ===== Schemas Pydantic =====

class BaseCambioSensible(BaseModel):
    """Modal doble intencion. Toda operación de plan o manage debe = True"""
    confirmacion_cambio_riesgo: bool = Field(
        default=False,
        description="Confirmación explícita del usuario: SOLO True permite cambios sensibles.",
    )


class CambiarPlanPoolRequest(BaseCambioSensible):
    nuevo_nivel: int = Field(ge=1, le=5, description="1=BASIC 500, 2=STARTUP 2k, 3=PRO 10k, 4=BUSINESS 50k, 5=ENTERPRISE 250k")
    motivo_cambio: str = Field(min_length=3, max_length=300,
                               description="Motivo explícito cambio plan (conservar p/ auditoría)")


class AsignarLimiteUsuarioRequest(BaseCambioSensible):
    usuario_id: str = Field(min_length=12, max_length=48)
    limite_creditos_mes: int = Field(ge=0, le=99999999, description="Cuota individual mensual de la persona")
    mes: Optional[int] = Field(default=None, ge=1, le=12)
    anio: Optional[int] = Field(default=None, ge=2024, le=2100)


class ConsumirCreditoInternoRequest(BaseModel):
    operacion_codigo: str = Field(min_length=1, max_length=64)
    descripcion: Optional[str] = Field(default="", max_length=300)
    creditos: int = Field(ge=1, le=9999)
    operacion_id_externo: Optional[str] = Field(default=None, max_length=120)
    metadata: Optional[dict[str, Any]] = Field(default_factory=dict)


def _gate_modal_doble_intencion(confirmado: bool, perm_cod: str):
    if not confirmado:
        raise HTTPException(
            status_code=428, detail={
                "codigo": "MODAL_DOBLE_INTENCION_REQUERIDA",
                "permiso_codigo": perm_cod,
                "mensaje": f"Debe confirmar con confirmacion_cambio_riesgo=True para operar permiso sensible {perm_cod}.",
            }
        )


def _gate_escalamiento_sensible(user: EnrichedUser, perm_cod: str, nivel_req: int = 3):
    """Superuser wildcard bypass: siempre nivel 3 otorgado (ok req 1/2/3). Usuario normal busca nivel max en override GRANT individual CONFIRMADO."""
    if user.is_superuser_wildcard:
        return None
    otorgado_max = 0
    for ov in user.usuario_permiso_overrides:
        if (ov.get("permiso_codigo") == perm_cod and
                ov.get("tipo_override") == "GRANT" and
                ov.get("sensible_confirmado") is True):
            otorgado_max = max(otorgado_max, int(ov.get("nivel_escalamiento") or 1))
    if otorgado_max < nivel_req:
        raise HTTPException(
            status_code=403, detail={
                "codigo": "ESCALAMIENTO_INSUFICIENTE_Q4",
                "permiso_codigo": perm_cod,
                "nivel_requerido": nivel_req,
                "nivel_otorgado": otorgado_max,
                "mensaje": f"Permiso sensible {perm_cod} requiere nivel escalamiento {nivel_req}; usted tiene {otorgado_max}. Contacte SUPERUSER.",
            }
        )


# ===== GET config =====
@router.get("/config", summary="Pool créditos org y lista planes 5 niveles")
async def get_creditos_config(
    user: CurrentUser = Depends(require_permission("pool.credit.view")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    eu = await _enriched(user, db)
    org = eu.organizacion_id
    if not org:
        raise HTTPException(status_code=400, detail={"codigo":"ORG_REQUERIDA","mensaje":"Usuario sin organización."})
    pool_actual = await obtener_pool_org(db, org)
    return {
        "pool_actual": _to_jsonable(pool_actual),
        "planes_disponibles": list(NIVELES_POOL_5),
        "soglia_notificaciones_pct": list(SOGLIE_NOTIFICA_CREDITOS_PCT),
        "soglia_notificaciones_info": SOGLIE_NOTIFICA_MAP,
        "usuario_limite_mes": eu.usuario_limite_mes,
        "pct_usado": (pool_actual["creditos_consumidos_mes"] / pool_actual["creditos_mensuales_org"] * 100) if pool_actual.get("creditos_mensuales_org",0)>0 else 0.0,
    }


# ===== PUT cambiar plan pool (manage sensible) =====
@router.put("/plan", summary="Cambiar plan pool (sensible · escal NIV3 · modal doble)")
async def put_creditos_plan(
    body: CambiarPlanPoolRequest = Body(...),
    user: CurrentUser = Depends(require_permission("pool.credit.manage")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    _gate_modal_doble_intencion(body.confirmacion_cambio_riesgo, "pool.credit.manage")
    eu = await _enriched(user, db)
    _gate_escalamiento_sensible(eu, "pool.credit.manage", 3)
    org = eu.organizacion_id
    if not org:
        raise HTTPException(status_code=400, detail={"codigo":"ORG_REQUERIDA","mensaje":"Usuario sin organización."})
    ok, status, codigo_err, doc_nuevo = await cambiar_plan_pool(db, eu, org, body.nuevo_nivel, body.motivo_cambio)
    if not ok:
        raise HTTPException(status_code=status or 500, detail={
            "codigo": codigo_err or "CAMBIO_PLAN_FALLO",
            "mensaje":"Cambio de plan pool no realizado."
        })
    return {"ok": True, "pool_actualizado": _to_jsonable(doc_nuevo)}


# ===== GET historial consumos =====
@router.get("/consumo-historial", summary="Últimos N consumos org del usuario/tenant")
async def get_consumo_historial(
    user: CurrentUser = Depends(require_permission("pool.credit.view")),
    db: AsyncIOMotorDatabase = Depends(get_db),
    ultimos_n_dias: int = Query(default=7, ge=1, le=90),
    limite: int = Query(default=100, ge=1, le=500),
    solo_mios: bool = Query(default=False),
):
    eu = await _enriched(user, db)
    org = eu.organizacion_id
    if not org:
        return []
    desde = (datetime.utcnow() - timedelta(days=ultimos_n_dias)).isoformat()
    filtro = {"organizacion_id": org, "createdAt": {"$gte": desde}}
    if solo_mios:
        filtro["usuario_id"] = eu.user_id
    cur = db["consumos_log_v2"].find(filtro).sort("createdAt", -1).limit(limite)
    return [_to_jsonable(d) async for d in cur]


# ===== POST notificaciones mark read =====
@router.post("/notificaciones/{nid}/leida", summary="Marcar notificación como leída")
async def post_notif_leida(
    nid: str = Path(...),
    user: CurrentUser = Depends(require_permission("pool.credit.view")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not ObjectId.is_valid(nid):
        raise HTTPException(status_code=400, detail={"codigo":"ID_NOTIFICACION_INVALIDO"})
    eu = await _enriched(user, db)
    ok = await marcar_notificacion_leida(db, eu, ObjectId(nid))
    return {"ok": bool(ok)}


# ===== GET notificaciones =====
@router.get("/notificaciones", summary="Lista notificaciones usuario/org (soglie)")
async def get_notificaciones(
    user: CurrentUser = Depends(require_permission("pool.credit.view")),
    db: AsyncIOMotorDatabase = Depends(get_db),
    solo_sin_leer: bool = Query(default=False),
    limite: int = Query(default=50, ge=1, le=200),
):
    eu = await _enriched(user, db)
    docs = await listar_notificaciones_usuario(db, eu, solo_sin_leer=solo_sin_leer, limite=limite)
    return [_to_jsonable(d) for d in docs]


# ===== PUT cuota individual usuario/mes =====
@router.put("/limite-usuario", summary="Asignar cuota individual usuario por mes (manage sensible)")
async def put_limite_usuario(
    body: AsignarLimiteUsuarioRequest = Body(...),
    user: CurrentUser = Depends(require_permission("pool.credit.manage")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    _gate_modal_doble_intencion(body.confirmacion_cambio_riesgo, "pool.credit.manage")
    eu = await _enriched(user, db)
    _gate_escalamiento_sensible(eu, "pool.credit.manage", 3)
    org = eu.organizacion_id
    if not org:
        raise HTTPException(status_code=400, detail={"codigo":"ORG_REQUERIDA","mensaje":"Usuario sin organización."})
    if not ObjectId.is_valid(body.usuario_id):
        raise HTTPException(status_code=400, detail={"codigo":"USUARIO_ID_INVALIDO"})
    # Auditoria
    anterior = await db["usuario_limite_consumo_v2"].find_one({
        "organizacion_id": org, "usuario_id": ObjectId(body.usuario_id),
        "mes": body.mes or datetime.utcnow().month, "anio": body.anio or datetime.utcnow().year,
    })
    doc_nuevo = await asignar_limite_usuario_mes(
        db, org, ObjectId(body.usuario_id), body.limite_creditos_mes, body.mes, body.anio,
    )
    dec = AuthzDecision(permitir=True, paso_fallido=None, motivo_denegacion="",
                        permiso_efectivo_origen="OVERRIDE_GRANT:pool.credit.manage",
                        nivel_info_autorizado="INFO_COMPLETA", pn_gate=False, scope_match="ORG")
    try:
        await registrar_auditoria(
            db, user=eu, accion_codigo="capacidad.pool.cuota_individual", decision=dec,
            recurso={"entidad_tipo":"usuario_limite_consumo_v2","entidad_id": str(body.usuario_id)},
            valor_anterior={"limite": anterior.get("limite_creditos_mes") if anterior else None},
            valor_nuevo={"limite": body.limite_creditos_mes, "mes": body.mes, "anio": body.anio,
                         "motivo": "Administración cuota individual"},
        )
    except Exception:
        pass
    return {"ok": True, "limite_usuario": _to_jsonable(doc_nuevo)}


# ===== POST internamente usado: consumir_credito =====
@router.post("/consumir", summary="[Interno/QA] Consumir créditos (gate overshoot 150% bloquea 402)")
async def post_consumir_credito(
    body: ConsumirCreditoInternoRequest = Body(...),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    eu = await _enriched(user, db)
    ok, status, codigo_err, info_saldo = await consumir_credito(
        db, eu, body.operacion_codigo, body.descripcion, body.creditos,
        body.operacion_id_externo, body.metadata,
    )
    if not ok:
        raise HTTPException(status_code=status or 400, detail={
            "codigo": codigo_err or "CONSUMO_CREDITOS_FALLO",
            **(info_saldo or {}),
        })
    return {"ok": True, "saldo_actualizado": info_saldo}
