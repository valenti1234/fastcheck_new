#!/usr/bin/env python3
"""
 002_estructura_organizacional.up.py
 ====================================
 FASE 0 · Crea struttura org minima (1 tenant = 1 organizacion + 1 pais default
 = CL + 1 unidad org root default + 4 areas funcionales default).

 NESSUNA MODIFICA SU COLLEZIONE LEGACY 'tenants': VENGONO SOLO LETTE.
 Nuove collezioni:
   - organizaciones   {_id = ObjectId, codigo, nombre, activo, config_decision,
                        tenant_legacy_id (ObjectId riferimento al vecchio tenants._id),
                        migrated_authz_v2=true, fecha_creacion}
   - paises           {_id, organizacion_id, codigo_iso='CL', nombre='Chile', activo}
   - unidades_organizacionales  {_id, organizacion_id, pais_id, parent_id=None,
                                  nombre='Default', tipo='OTRO', activo, nivel_arbol=0}
   - areas_funcionales {_id, organizacion_id, codigo, nombre, activo,
                         (Compras, Compliance, RRHH, Operaciones default)}
 Controllo safety: se salta se organizaciones esiste gia' per quel tenant legacy (skip).
"""
from __future__ import annotations
import datetime as _dt
from pymongo.database import Database

AREAS_DEFAULT = [
    ("COMPRAS",    "Compras"),
    ("COMPLIANCE", "Compliance"),
    ("RRHH",       "Recursos Humanos"),
    ("OPERACIONES","Operaciones"),
]


def up(db: Database) -> str:
    # 1. Legge tenants LEGACY (solo read)
    src_tenants = list(db.tenants.find({})) if "tenants" in db.list_collection_names() else []
    if not src_tenants:
        return "SKIP 002: collezione tenants legacy non trovata. Nessuna struttura creata."

    n_orgs = n_paises = n_uos = n_areas = 0
    for tenant in src_tenants:
        tenant_id = tenant.get("_id")
        # Skip: se organizzazione già presente per tenant_legacy_id
        exists = db.organizaciones.find_one({"tenant_legacy_id": tenant_id})
        if exists:
            continue
        # 1) organizacion
        org_doc = {
            "codigo": "ORG-" + (str(tenant.get("plan") or "FREE")).upper(),
            "nombre": tenant.get("name") or ("Tenant " + str(tenant_id)[:8]),
            "activo": bool(tenant.get("status") == "active" or tenant.get("isActive", True)),
            "config_decision": "MANUAL",
            "tenant_legacy_id": tenant_id,
            "migrated_authz_v2": True,
            "fecha_creacion": _dt.datetime.now(_dt.timezone.utc),
        }
        res = db.organizaciones.insert_one(org_doc)
        org_id = res.inserted_id
        n_orgs += 1

        # 2) pais default = Chile CL
        pais_doc = {
            "organizacion_id": org_id,
            "codigo_iso": "CL",
            "nombre": "Chile",
            "activo": True,
        }
        res = db.paises.insert_one(pais_doc)
        pais_id = res.inserted_id
        n_paises += 1

        # 3) unidad organizacional root
        uo_doc = {
            "organizacion_id": org_id,
            "pais_id": pais_id,
            "parent_id": None,
            "codigo": "UO-ROOT",
            "nombre": "Unidad Default",
            "tipo": "OTRO",
            "activo": True,
            "nivel_arbol": 0,
        }
        res = db.unidades_organizacionales.insert_one(uo_doc)
        _ = res.inserted_id
        n_uos += 1

        # 4) areas funcionales default
        for cod, nombre in AREAS_DEFAULT:
            area_doc = {
                "organizacion_id": org_id,
                "codigo": cod,
                "nombre": nombre,
                "activo": True,
            }
            db.areas_funcionales.insert_one(area_doc)
            n_areas += 1

    # Indici (eseguiamo una sola volta, quindi create_index con unique ok)
    db.organizaciones.create_index("tenant_legacy_id", unique=True, name="uk_org_tenant_legacy_id")
    db.organizaciones.create_index([("nombre", 1), ("activo", 1)])
    db.paises.create_index([("organizacion_id",1),("codigo_iso",1)], unique=True, name="uk_paises_org_codigo")
    db.unidades_organizacionales.create_index([("organizacion_id",1), ("pais_id",1), ("codigo",1)], unique=True, name="uk_uo_org_pais_codigo")
    db.unidades_organizacionales.create_index([("parent_id",1)])
    db.areas_funcionales.create_index([("organizacion_id",1), ("codigo",1)], unique=True, name="uk_areas_org_codigo")

    return (
        f"002 OK: organizaciones={n_orgs} · paises={n_paises} · "
        f"unidades_organizacionales={n_uos} · areas_funcionales={n_areas} · indici creati."
    )
