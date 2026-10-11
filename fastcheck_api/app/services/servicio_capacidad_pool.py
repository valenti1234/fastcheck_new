"""
servicio_capacidad_pool.py  —  Bloque 2.5 Q6 Capacidad Pool 5 Niveles.

  * 5 planes (BASIC 500 → ENTERPRISE 250000 créditos mes).
  * Overshoot máximo permitido 150% plan (no hard block sotto 150%).
  * Oltre 150%: HTTP 402 Payment Required.
  * Soglie notifica 90% (INFO) / 100% (WARNING) / 120% (CRITICAL) con
    => notificaciones_push por org/mes/una-volta sola.
  * Sync dual-write: consumos_log_v2 (nuovo) + creditoperations (legacy)
    => ensure backward-compat.
"""
from __future__ import annotations

import time
from datetime import datetime
from typing import Any, Optional, Tuple

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastcheck_api.app.services.authz_service import (
    EnrichedUser,
    ERROR_OVERSHOOT_MAX,
    SOGLIE_NOTIFICA_CREDITOS_PCT,
    SOGLIE_NOTIFICA_MAP,
    registrar_auditoria,
)


async def obtener_pool_org(
    db: AsyncIOMotorDatabase, organizacion_id: ObjectId
) -> dict:
    """
    Ottiene il pool crediti per organizzazione. Se non esiste, crea BASIC (NIV1)
    e ritorna.
    """
    doc = await db["pool_creditos_organizacion"].find_one(
        {"organizacion_id": organizacion_id}
    )
    if doc:
        return doc
    now = datetime.utcnow().isoformat()
    from fastcheck_api.app.services.authz_service import NIVELES_POOL_5
    niv1 = next(n for n in NIVELES_POOL_5 if n["nivel"] == 1)
    await db["pool_creditos_organizacion"].update_one(
        {"organizacion_id": organizacion_id},
        {"$setOnInsert": {
            "organizacion_id": organizacion_id,
            "nivel_pool_plan": 1,
            "nombre_plan": niv1["nombre"],
            "creditos_mensuales_org": niv1["creditos_mensuales_org"],
            "overshoot_pct_max": niv1["overshoot_pct_max"],
            "usuarios_max_plan": niv1["usuarios_max"],
            "saldo_actual": niv1["creditos_mensuales_org"],
            "creditos_consumidos_mes": 0,
            "mes_referencia": datetime.utcnow().month,
            "anio_referencia": datetime.utcnow().year,
            "actualizado_en": now,
        }},
        upsert=True,
    )
    return await db["pool_creditos_organizacion"].find_one({"organizacion_id": organizacion_id})


async def cambiar_plan_pool(
    db: AsyncIOMotorDatabase,
    user: EnrichedUser,
    organizacion_id: ObjectId,
    nuevo_nivel: int,
    motivo_cambio: str,
) -> Tuple[bool, int | None, str | None, dict | None]:
    """
    Cambia piano crediti pool org (solo pool.credit.manage, sensible escal>=3).
    Ritorna (OK, http_status o None, errore_codigo o None, doc_nuevo_pool o None).
    """
    from fastcheck_api.app.services.authz_service import NIVELES_POOL_5
    if nuevo_nivel < 1 or nuevo_nivel > 5:
        return False, 422, "NIVEL_POOL_INVALIDO", None
    plan_nuevo = next(n for n in NIVELES_POOL_5 if n["nivel"] == nuevo_nivel)
    anterior = await obtener_pool_org(db, organizacion_id)
    mes_anio_ts = datetime.utcnow().isoformat()
    # Calcola credito residuo prorated (Q6 MVP: no prorata, setta crediti a plan_nuevo.creditos_mensuales_org,
    # consumidos = max(0, consumidos_viejos * ratio si > nuevo_mes)
    ratio = 0.0
    if anterior and anterior.get("creditos_mensuales_org", 0) > 0:
        ratio = min(1.0, max(0.0, anterior.get("creditos_consumidos_mes", 0) / anterior["creditos_mensuales_org"]))
    nuevos_consumidos = int(plan_nuevo["creditos_mensuales_org"] * ratio)
    nuevo_saldo = plan_nuevo["creditos_mensuales_org"] - nuevos_consumidos
    await db["pool_creditos_organizacion"].update_one(
        {"organizacion_id": organizacion_id},
        {"$set": {
            # ---- Campos NUEVOS Bloq2.5 (oficiales) ----
            "nivel_pool_plan": plan_nuevo["nivel"],
            "nombre_plan": plan_nuevo["nombre"],
            "creditos_mensuales_org": plan_nuevo["creditos_mensuales_org"],
            "overshoot_pct_max": plan_nuevo["overshoot_pct_max"],
            "usuarios_max_plan": plan_nuevo["usuarios_max"],
            "creditos_consumidos_mes": nuevos_consumidos,
            "saldo_actual": max(0, nuevo_saldo),
            "actualizado_en": mes_anio_ts,
            "mes_referencia": int(datetime.utcnow().month),
            "anio_referencia": int(datetime.utcnow().year),
            # ---- Campos LEGACY (sync bidireccional con admin_compat.py v1 frontend) ----
            "creditos": plan_nuevo["creditos_mensuales_org"],
            "creditos_disponibles": max(0, nuevo_saldo),
            "creditos_usados": int(nuevos_consumidos),
            "plan_codigo": plan_nuevo["nombre"].upper(),
            "overshoot_actual": 0 if nuevos_consumidos <= plan_nuevo["creditos_mensuales_org"] else round((nuevos_consumidos / plan_nuevo["creditos_mensuales_org"] - 1) * 100, 2),
            "fecha_actualizacion": datetime.utcnow(),
            "isActive": True,
        }},
    )
    doc_nuevo = await obtener_pool_org(db, organizacion_id)
    # Auditoria
    from fastcheck_api.app.services.authz_service import AuthzDecision
    dec = AuthzDecision(
        permitir=True, paso_fallido=None, motivo_denegacion="",
        permiso_efectivo_origen="OVERRIDE_GRANT:pool.credit.manage",
        nivel_info_autorizado="INFO_COMPLETA", pn_gate=False, scope_match="ORG",
    )
    try:
        await registrar_auditoria(
            db, user=user, accion_codigo="capacidad.pool.cambiar_plan",
            decision=dec,
            recurso={"entidad_tipo": "pool_creditos_organizacion",
                     "entidad_id": str(organizacion_id)},
            valor_anterior={
                "nivel": anterior.get("nivel_pool_plan"),
                "creditos_mensuales": anterior.get("creditos_mensuales_org"),
                "plan": anterior.get("nombre_plan"),
            } if anterior else None,
            valor_nuevo={
                "nivel": doc_nuevo.get("nivel_pool_plan"),
                "creditos_mensuales": doc_nuevo.get("creditos_mensuales_org"),
                "plan": doc_nuevo.get("nombre_plan"),
                "motivo_cambio": motivo_cambio,
            },
        )
    except Exception:
        pass
    return True, None, None, doc_nuevo


async def consumir_credito(
    db: AsyncIOMotorDatabase,
    user: EnrichedUser,
    operacion_codigo: str,
    descripcion: str = "",
    creditos: int = 1,
    operacion_id_externo: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> Tuple[bool, int | None, str | None, dict | None]:
    """
    Consuma crediti dal pool org. Applicazioni:
      - Se crediti >0: scala da pool e scrive sia in consumos_log_v2
        CHE in creditoperations (legacy) per sync bidirezionale.
      - Verifica overshoot <=150% (soglia hard oltre la quale blocca 402).
      - Trigger notifiche soglie 90/100/120% 1 sola volta al mese x org.
      - Aggiorna saldo pool_creditos_organizacion.

    Ritorna (ok, http_status_o_None, error_code_o_None, info_saldo_aggiornato).
    """
    if creditos <= 0:
        return True, None, None, None
    organizacion_id = user.organizacion_id
    if not organizacion_id:
        return False, 400, "ORG_REQUERIDA_POOL", None
    pool = await obtener_pool_org(db, organizacion_id)
    creditos_plan = pool.get("creditos_mensuales_org", 0)
    if creditos_plan <= 0:
        return False, 400, "POOL_SIN_CREDITOS_MENSUALES", None
    overshoot_pct_max = pool.get("overshoot_pct_max", 150)
    consumidos_mes = pool.get("creditos_consumidos_mes", 0)
    # Calcolo percentuale usata post-consumo
    nuovi_consumidos = consumidos_mes + creditos
    pct_usata_post = (nuovi_consumidos / creditos_plan) * 100.0
    # Hard block oltre overshoot max
    if pct_usata_post > overshoot_pct_max:
        return False, ERROR_OVERSHOOT_MAX[0], ERROR_OVERSHOOT_MAX[1], {
            "pct_usata": round(pct_usata_post, 2),
            "overshoot_max_pct": overshoot_pct_max,
            "creditos_solicitados": creditos,
            "creditos_consumibles_disponibles": max(0, int(creditos_plan * overshoot_pct_max / 100) - consumidos_mes),
            "mensaje": ERROR_OVERSHOOT_MAX[2],
        }
    # Calcola nuovo saldo (puo essere negativo se overshoot ma <150%)
    nuevo_saldo = pool.get("saldo_actual", 0) - creditos
    now = time.time()
    now_iso = datetime.utcnow().isoformat()
    # Dual write (1/2): consumos_log_v2 (nuovo schema)
    log_doc = {
        "organizacion_id": organizacion_id,
        "usuario_id": user.user_id,
        "usuario_email": user.email or "",
        "operacion_codigo": operacion_codigo,
        "creditos_consumidos": creditos,
        "descripcion": descripcion,
        "operacion_id_externo": operacion_id_externo,
        "metadata": metadata or {},
        "consumos_previos_mes": consumidos_mes,
        "consumos_post_mes": nuovi_consumidos,
        "pct_usata_post": round(pct_usata_post, 2),
        "createdAt": now_iso,
        "ts": now,
    }
    await db["consumos_log_v2"].insert_one(dict(log_doc))
    # (2/2) legacy creditoperations (per backcompat)
    try:
        ult_op = await db["creditoperations"].find_one(
            {"tenantId": str(organizacion_id)}, sort=[("createdAt", -1)],
        ) or {}
        balance_legacy = int(ult_op.get("balanceAfter", 0)) if isinstance(ult_op.get("balanceAfter"), (int, float)) else pool.get("saldo_actual", 0)
        await db["creditoperations"].insert_one({
            "tenantId": str(organizacion_id),
            "userId": str(user.user_id),
            "operationType": operacion_codigo,
            "creditsChanged": -creditos,
            "balanceAfter": balance_legacy - creditos,
            "description": descripcion or f"{operacion_codigo} - {creditos}cr",
            "metadata": {
                **(metadata or {}),
                "migracion_v2": True,
                "operacion_id_externo": operacion_id_externo,
            },
            "createdAt": now_iso,
            "__v": 1,
        })
    except Exception:
        pass
    # Aggiorna pool_creditos_organizacion
    await db["pool_creditos_organizacion"].update_one(
        {"organizacion_id": organizacion_id},
        {"$set": {
            "saldo_actual": nuevo_saldo,
            "creditos_consumidos_mes": nuovi_consumidos,
            "actualizado_en": now_iso,
        }},
    )
    # Trigger notifiche soglie (90/100/120%) 1 sola volta al mese x org x soglia
    mes_ref = datetime.utcnow().month
    anio_ref = datetime.utcnow().year
    soglie_superate: list[int] = []
    for s in SOGLIE_NOTIFICA_CREDITOS_PCT:
        prev_pct = (consumidos_mes / creditos_plan) * 100.0 if creditos_plan > 0 else 0.0
        if prev_pct < s <= pct_usata_post:
            soglie_superate.append(s)
    for soglia_pct in soglie_superate:
        info = SOGLIE_NOTIFICA_MAP[soglia_pct]
        codigo_s = info["codigo"]
        try:
            await db["notificaciones_push"].update_one(
                {"organizacion_id": organizacion_id,
                 "codigo_soglia": codigo_s, "mes": mes_ref, "anio": anio_ref},
                {"$setOnInsert": {
                    "organizacion_id": organizacion_id,
                    "usuario_id": ObjectId("000000000000000000000000"),
                    "codigo_soglia": codigo_s,
                    "mes": mes_ref,
                    "anio": anio_ref,
                    "severidad": info["severidad"],
                    "mensaje": info["mensaje"],
                    "pct_alcanzado": round(pct_usata_post, 2),
                    "creditos_consumidos": nuovi_consumidos,
                    "creditos_mensuales_plan": creditos_plan,
                    "leido": False,
                    "createdAt": now_iso,
                }},
                upsert=True,
            )
        except Exception:
            pass
    result = {
        "creditos_mensuales_plan": creditos_plan,
        "creditos_consumidos_mes": nuovi_consumidos,
        "saldo_actual": nuevo_saldo,
        "pct_usata": round(pct_usata_post, 2),
        "pct_overshoot_permitido": overshoot_pct_max,
        "soglie_superate": [SOGLIE_NOTIFICA_MAP[s]["codigo"] for s in soglie_superate],
    }
    return True, None, None, result


async def asignar_limite_usuario_mes(
    db: AsyncIOMotorDatabase,
    organizacion_id: ObjectId,
    usuario_id: ObjectId,
    limite_creditos_mes: int,
    mes: Optional[int] = None,
    anio: Optional[int] = None,
) -> dict:
    """Asigna o actualiza cuota individual usuario x org x mes (opcional si usuario por limite individuale."""
    mes = mes or datetime.utcnow().month
    anio = anio or datetime.utcnow().year
    now = datetime.utcnow().isoformat()
    await db["usuario_limite_consumo_v2"].update_one(
        {"organizacion_id": organizacion_id, "usuario_id": usuario_id,
         "mes": mes, "anio": anio},
        {"$set": {
            "limite_creditos_mes": max(0, int(limite_creditos_mes)),
            "actualizado_en": now,
        },
         "$setOnInsert": {"consumidos_mes": 0}},
        upsert=True,
    )
    return await db["usuario_limite_consumo_v2"].find_one(
        {"organizacion_id": organizacion_id, "usuario_id": usuario_id,
         "mes": mes, "anio": anio}
    )


async def listar_notificaciones_usuario(
    db: AsyncIOMotorDatabase,
    user: EnrichedUser,
    solo_sin_leer: bool = False,
    limite: int = 50,
) -> list[dict]:
    """
    Lista notifiche: (a) notifiche globali org condivise (uid=zeroes) +
    (b) notifiche personali uid.
    """
    uid = user.user_id
    org_id = user.organizacion_id
    filtro: dict[str, Any] = {
        "$or": [
            {"usuario_id": uid},
            {"usuario_id": ObjectId("000000000000000000000000"),
             "organizacion_id": org_id},
        ]
    }
    if solo_sin_leer:
        filtro["leido"] = False
    docs_cursor = db["notificaciones_push"].find(filtro).sort("createdAt", -1).limit(limite)
    return [dict(d) async for d in docs_cursor]


async def marcar_notificacion_leida(
    db: AsyncIOMotorDatabase, user: EnrichedUser, notificacion_id: ObjectId,
) -> bool:
    """Marca la notifica come letta se appartiene all'utente o all'org condivisa."""
    res = await db["notificaciones_push"].update_one(
        {"_id": ObjectId(str(notificacion_id)),
         "$or": [
             {"usuario_id": user.user_id},
             {"usuario_id": ObjectId("000000000000000000000000"),
              "organizacion_id": user.organizacion_id},
         ]},
        {"$set": {"leido": True, "leido_en": datetime.utcnow().isoformat()}},
    )
    return bool((res.modified_count or 0) + (1 if res.upserted_id else 0) + (res.matched_count or 0) > 0)
