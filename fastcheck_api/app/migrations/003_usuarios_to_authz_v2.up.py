#!/usr/bin/env python3
"""
 003_usuarios_to_authz_v2.up.py
 ================================
 FASE 0 · Migrazione utenti legacy: user.role (5) → ruoli multipli +
 dimensioni default + alcance VER/ACTUAR + override PN (solo superuser Q1).

 Nuove collezioni:
   - usuario_rol {usuario_id, rol_codigo, origen=PLANTILLA_LEGACY, fecha_asignacion}
   - usuario_unidad {usuario_id, organizacion_id, pais_id, unidad_id, area_id, principal=True}
   - usuario_producto {usuario_id, producto, capacidad: [LISTA]}
   - usuario_tipo_tercero {usuario_id, categoria_codigo, autorizado: bool}
   - usuario_nivel_info {usuario_id, nivel_info_codigo}
   - usuario_alcance {usuario_id, proposito: 'VER'|'ACTUAR', tipo_alcance, unidad_ids[], area_id, pais_id, organizacion_id, incluye_descendientes=True (Q2=TRUE default)}
   - usuario_permiso_override {usuario_id, permiso_codigo, tipo_override='GRANT'|'DENY', sensible_confirmado: bool, origen, granted_by, fecha}
 Aggiorna users (SOLO nel target duxiter-2): users.authz_v2_migrated=true, cache_version=1

 NESSUNA SCRITTURA SU duxiter legacy.
"""
from __future__ import annotations
import datetime as _dt
from pymongo.database import Database

NOW = _dt.datetime.now(_dt.timezone.utc)

# Mappatura ruolo legacy → lista di codici ruolo plantilla
LEGACY_ROL_TO_ROLES_PLANTILLA = {
    "superuser":     [],  # superuser NON riceve NESSUN ruolo plantilla normale; è un wildcard fuori dal modello tenant (DA-04). Riceve SOLO override party.query.pn = GRANT per Q1.
    "tenant_admin":  ["ADMIN_GENERAL", "GESTOR_LISTAS"],  # Admin General + Gestor Listas (v Sec 1.2)
    "evaluator":     ["USUARIO_OPERATIVO", "EVALUADOR_ANALISTA"],  # Operativo + Evaluatore duale
    "read_only":     ["AUDITOR"],
    "write_only":    ["USUARIO_OPERATIVO"],
}

def _dim_defaults_for(legacy_role: str) -> dict:
    """Dimensioni default per ciascun ruolo legacy (Sec 1.2 Mapeo)."""
    if legacy_role == "tenant_admin":
        return dict(
            productos = [("FAST_CHECK", ["FULL", "CONSULTA", "MONITOREO"])],
            nivel_info = "INFO_COMPLETA",
            alcance_ver  = ("ORGANIZACION", None, None, None, True),  # tipo, uo_list, area, pais, incluye_desc=Q2 True
            alcance_actuar= ("ORGANIZACION", None, None, None, True),
            tipos_tercero_autorizados = ["PJ_NACIONAL"],  # PN non incluso da default (DENY by default D-01)
        )
    if legacy_role == "evaluator":
        return dict(
            productos=[("FAST_CHECK", ["FULL", "CONSULTA", "MONITOREO"])],
            nivel_info="DETALLE_RIESGO",
            alcance_ver=    ("UNIDAD", None, None, None, True),
            alcance_actuar= ("UNIDAD", None, None, None, True),
            tipos_tercero_autorizados=["PJ_NACIONAL"],
        )
    if legacy_role == "read_only":
        return dict(
            productos=[("FAST_CHECK", ["CONSULTA", "MONITOREO"])],
            nivel_info="INFO_NO_SENSIBLE",
            alcance_ver=    ("ORGANIZACION", None, None, None, True),
            alcance_actuar= ("PROPIO", None, None, None, True),
            tipos_tercero_autorizados=["PJ_NACIONAL"],
        )
    if legacy_role == "write_only":
        return dict(
            productos=[("FAST_CHECK", ["FULL", "CONSULTA", "MONITOREO"])],
            nivel_info="RESULTADO_GENERAL",
            alcance_ver=    ("PROPIO", None, None, None, True),
            alcance_actuar= ("PROPIO", None, None, None, True),
            tipos_tercero_autorizados=["PJ_NACIONAL"],
        )
    if legacy_role == "superuser":
        return dict(
            productos=[("FAST_CHECK", ["FULL", "CONSULTA", "MONITOREO"])],
            nivel_info="INFO_COMPLETA",
            alcance_ver=    ("ORGANIZACION", None, None, None, True),
            alcance_actuar= ("ORGANIZACION", None, None, None, True),
            tipos_tercero_autorizados=["PJ_NACIONAL"],  # PN verrà dato come override sensibile GRANTE
        )
    return dict(
            productos=[("FAST_CHECK", ["CONSULTA"])],
            nivel_info="RESULTADO_GENERAL",
            alcance_ver=    ("PROPIO", None, None, None, True),
            alcance_actuar= ("PROPIO", None, None, None, True),
            tipos_tercero_autorizados=["PJ_NACIONAL"],
    )


def up(db: Database) -> str:
    if "users" not in db.list_collection_names():
        return "SKIP 003: collezione users legacy non trovata."
    users = list(db.users.find({}))
    if not users:
        return "SKIP 003: nessun utente da migrare."

    n_roles = n_unidades = n_productos = n_tt = n_ni = n_alcance = n_overrides = 0
    users_marked = 0

    for u in users:
        if u.get("authz_v2_migrated"):
            continue
        user_id = u["_id"]
        legacy_role = u.get("role") or "write_only"

        # 1) Associazione ruoli plantilla
        roles = LEGACY_ROL_TO_ROLES_PLANTILLA.get(legacy_role, [])
        for r in roles:
            db.usuario_rol.insert_one({
                "usuario_id": user_id,
                "rol_codigo": r,
                "origen": "PLANTILLA_LEGACY_v2_MIGRACION_003",
                "fecha_asignacion": NOW,
            })
            n_roles += 1

        # 2) Cerchiamo unità organizzazionale ROOT per organizzazione corrispondente
        #    (users.defaultTenantId → tenants._id → organizaciones.tenant_legacy_id → unidad root)
        tenant_id = u.get("defaultTenantId") or u.get("tenantId")
        org = pais = uo = None
        if tenant_id:
            org = db.organizaciones.find_one({"tenant_legacy_id": tenant_id})
        if not org and u.get("tenants"):
            # primo tenant
            for t in (u.get("tenants") or []):
                org = db.organizaciones.find_one({"tenant_legacy_id": t.get("id") or t if isinstance(t, dict) else t})
                if org: break
        if org:
            pais = db.paises.find_one({"organizacion_id": org["_id"]})
            if pais:
                uo = db.unidades_organizacionales.find_one({"organizacion_id": org["_id"], "pais_id": pais["_id"], "codigo": "UO-ROOT"})

        # 3) usuario_unidad (1:1 MVP F0 = Q3 default)
        if org:
            area = db.areas_funcionales.find_one({"organizacion_id": org["_id"], "codigo": "COMPLIANCE"}) or None
            doc_unidad = {
                "usuario_id": user_id,
                "organizacion_id": org["_id"],
                "pais_id": pais["_id"] if pais else None,
                "unidad_id": uo["_id"] if uo else None,
                "area_id": area["_id"] if area else None,
                "principal": True,
                "fecha": NOW,
            }
            db.usuario_unidad.insert_one(doc_unidad)
            n_unidades += 1

        # 4) Dimensione prodotto
        dims = _dim_defaults_for(legacy_role)
        for producto, capacidades in dims["productos"]:
            db.usuario_producto.insert_one({
                "usuario_id": user_id,
                "producto": producto,
                "capacidades": capacidades,
                "origen": "DEFAULT_PLANTILLA",
                "fecha": NOW,
            })
            n_productos += 1

        # 5) TipoTercero autorizzato (PJ default, PN NO salvo override)
        for ttc in dims["tipos_tercero_autorizados"]:
            db.usuario_tipo_tercero.insert_one({
                "usuario_id": user_id,
                "categoria_codigo": ttc,
                "autorizado": True,
                "origen": "DEFAULT_PLANTILLA",
                "fecha": NOW,
            })
            n_tt += 1

        # 6) Nivel info default
        db.usuario_nivel_info.insert_one({
            "usuario_id": user_id,
            "nivel_info_codigo": dims["nivel_info"],
            "origen": "DEFAULT_PLANTILLA",
            "fecha": NOW,
        })
        n_ni += 1

        # 7) Alcance VER e ACTUAR
        for proposito in ("VER", "ACTUAR"):
            info_alc = dims["alcance_ver"] if proposito == "VER" else dims["alcance_actuar"]
            tipo_alc, uos, area, pais_id, incluye_desc = info_alc
            doc = {
                "usuario_id": user_id,
                "proposito": proposito,
                "tipo_alcance": tipo_alc,
                "unidad_ids": [uo["_id"]] if (tipo_alc == "UNIDAD" and uo) else (uos or []),
                "area_id": area,
                "pais_id": pais_id or (pais["_id"] if pais else None),
                "organizacion_id": org["_id"] if org else None,
                "incluye_descendientes": incluye_desc,  # Q2=TRUE default
                "origen": "DEFAULT_PLANTILLA",
                "fecha": NOW,
            }
            db.usuario_alcance.insert_one(doc)
            n_alcance += 1

        # 8) Overrides permessi individuali:
        #    D-01 deny-by-default PER TUTTI.
        #    Q1 CONFERMATO (2026-10-03): ECCEZIONE SOLAMENTE superuser GLOBAL → party.query.pn = GRANT
        #    con sensible_confirmado=true, granted_by=BOOTSTRAP_MIGRACION_202610.
        if legacy_role == "superuser":
            db.usuario_permiso_override.insert_one({
                "usuario_id": user_id,
                "permiso_codigo": "party.query.pn",
                "tipo_override": "GRANT",
                "es_sensible": True,
                "sensible_confirmado": True,
                "origen": "BOOTSTRAP_MIGRACION_202610_Q1",
                "granted_by": "SYSTEM_MIGRATION",
                "motivo": "Q1 cliente 2026-10-03: eccezione SOLO superuser global GRANT PN automatica",
                "fecha": NOW,
            })
            n_overrides += 1
        # Nota: tutti gli altri sensibili (risk.lists.manage / exception.authorize /
        # admin.grant_sensitive / risk.params.define / risk.thresholds / risk.formula)
        # sono DENY by default = NESSUNA entry override = applica deny by default.

        # 9) Marca utente migrato
        db.users.update_one({"_id": user_id}, {"$set": {
            "authz_v2_migrated": True,
            "cache_version": 1,
            "legacy_role": legacy_role,
        }})
        users_marked += 1

    return (
        f"003 OK: utenti migrati={users_marked} · "
        f"rol_assigns={n_roles} · unidad={n_unidades} · productos={n_productos} · "
        f"tipo_tercero={n_tt} · nivel_info={n_ni} · alcance VER/ACT={n_alcance} · "
        f"overrides (solo superuser PN)={n_overrides}"
    )
