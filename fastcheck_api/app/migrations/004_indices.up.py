#!/usr/bin/env python3
"""
 004_indices.up.py
 ==================
 FASE 0 — Indici composti obbligatori.
"""
from __future__ import annotations
from pymongo.database import Database


INDICE_SPECS: list[tuple[str, list[tuple[str, int]], dict]] = [
    # --- usuario_rol ---
    ("usuario_rol", [("usuario_id", 1), ("rol_codigo", 1)], dict(name="uk_usuario_rol", unique=True)),
    ("usuario_rol", [("rol_codigo", 1)], dict(name="idx_rol_codigo")),
    # --- usuario_unidad ---
    ("usuario_unidad", [("usuario_id", 1), ("organizacion_id", 1), ("principal", 1)], dict(name="idx_usuario_org_principal")),
    ("usuario_unidad", [("unidad_id", 1)], dict(name="idx_unidad")),
    # --- usuario_producto ---
    ("usuario_producto", [("usuario_id", 1), ("producto", 1)], dict(name="uk_usuario_producto", unique=True)),
    # --- usuario_tipo_tercero ---
    ("usuario_tipo_tercero", [("usuario_id",1),("categoria_codigo",1)], dict(name="uk_usuario_tipo_tercero", unique=True)),
    # --- usuario_nivel_info ---
    ("usuario_nivel_info", [("usuario_id", 1)], dict(name="uk_usuario_nivel_info", unique=True)),
    # --- usuario_alcance ---
    ("usuario_alcance", [("usuario_id",1),("proposito",1),("tipo_alcance",1)], dict(name="idx_alcance_user_tipo_proposito")),
    ("usuario_alcance", [("organizacion_id", 1), ("proposito", 1)], dict(name="idx_alcance_org_proposito")),
    # --- usuario_permiso_override ---
    ("usuario_permiso_override", [("usuario_id",1),("permiso_codigo",1),("tipo_override",1)], dict(name="uk_usuario_override", unique=True)),
    ("usuario_permiso_override", [("es_sensible",1),("sensible_confirmado",1)], dict(name="idx_sensibles")),
    # --- users campi nuovi ---
    ("users", [("legacyRole", 1), ("cache_version", 1)], dict(name="idx_legacy_cachev")),
    ("users", [("authz_v2_migrated",1)], dict(name="idx_authz_migrated")),
    # --- auditoria (collection vuota ora ma indici creati in previsione) ---
    ("auditoria_log", [("organizacion_id",1),("usuario_id",1),("ts",-1)], dict(name="idx_audit_org_user_ts")),
    ("auditoria_log", [("entidad_tipo",1),("entidad_id",1)], dict(name="idx_audit_entita")),
    # --- permisos roles uk gia creati in 001 ---
    ("permisos", [("categoria", 1), ("es_sensible", 1)], dict(name="idx_permisos_cat_sensible")),
]


def up(db: Database) -> str:
    n_created = 0
    for coll_name, keys, opts in INDICE_SPECS:
        try:
            db[coll_name].create_index(keys, **opts)
            n_created += 1
        except Exception as exc:
            print(f"   skip indice {coll_name} {opts.get('name')}: {exc!s:.80}")
    return f"004 OK: {n_created} indici creati / tentati {len(INDICE_SPECS)}."
