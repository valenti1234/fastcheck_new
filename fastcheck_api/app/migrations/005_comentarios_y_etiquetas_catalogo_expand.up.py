#!/usr/bin/env python3
"""
 005_comentarios_y_etiquetas_catalogo_expand.up.py
 ====================================================
 Bloque 2.1 + 2.2 FASE 2 · Expansión catálogo permisos COLABORACION.

 SAFETY LOCK: Solo se ejecuta en DB `duxiter-2`.
"""
from __future__ import annotations
from pymongo.database import Database


PERMISOS_NUEVOS: list[dict] = [
    {"codigo": "comment.read",            "categoria": "COLABORACION", "descripcion": "Ver comentarios VISIBLE y RESTRINGIDO en tu ámbito organizacional. PERSONAL solo si autor=tu o auditor/admin.", "es_sensible": False},
    {"codigo": "comment.delete",          "categoria": "COLABORACION", "descripcion": "Eliminar comentarios propios o por admin tenant. Borrado lógico con entrada en auditoría.", "es_sensible": False},
    {"codigo": "tag.read",                "categoria": "COLABORACION", "descripcion": "Leer etiquetas general y restringidas dentro del alcance del usuario.", "es_sensible": False},
    {"codigo": "tag.write",               "categoria": "COLABORACION", "descripcion": "CRUD etiquetas tipo GENERAL. No afecta restringidas.", "es_sensible": False},
    {"codigo": "tag.manage_restricted",   "categoria": "COLABORACION", "descripcion": "CRUD etiquetas tipo RESTRINGIDA. Permiso de gobierno.", "es_sensible": False},
    {"codigo": "tag.grant",               "categoria": "COLABORACION", "descripcion": "Otorgar visibilidad sobre etiquetas restringidas a otros usuarios (no supera permisos sensibles).", "es_sensible": False},
]


ROL_PERMISO_NUEVOS: list[tuple[str, str, str]] = [
    ("SOLICITANTE",          "comment.read",            "INCLUIDO"),
    ("USUARIO_OPERATIVO",    "comment.read",            "INCLUIDO"),
    ("USUARIO_OPERATIVO",    "comment.delete",          "INCLUIDO"),
    ("USUARIO_OPERATIVO",    "tag.read",                "INCLUIDO"),
    ("USUARIO_OPERATIVO",    "tag.write",               "INCLUIDO"),
    ("EVALUADOR_ANALISTA",   "comment.read",            "INCLUIDO"),
    ("EVALUADOR_ANALISTA",   "comment.delete",          "INCLUIDO"),
    ("EVALUADOR_ANALISTA",   "tag.read",                "INCLUIDO"),
    ("EVALUADOR_ANALISTA",   "tag.write",               "INCLUIDO"),
    ("EVALUADOR_ANALISTA",   "tag.manage_restricted",   "CONFIGURABLE_OPCIONAL"),
    ("APROBADOR",            "comment.read",            "INCLUIDO"),
    ("APROBADOR",            "comment.delete",          "INCLUIDO"),
    ("APROBADOR",            "tag.read",                "INCLUIDO"),
    ("APROBADOR",            "tag.write",               "INCLUIDO"),
    ("APROBADOR",            "tag.manage_restricted",   "INCLUIDO"),
    ("APROBADOR",            "tag.grant",               "CONFIGURABLE_OPCIONAL"),
    ("AUDITOR",              "comment.read",            "INCLUIDO"),
    ("AUDITOR",              "tag.read",                "INCLUIDO"),
    ("ADMIN_GENERAL",        "comment.read",            "INCLUIDO"),
    ("ADMIN_GENERAL",        "comment.delete",          "INCLUIDO"),
    ("ADMIN_GENERAL",        "tag.read",                "INCLUIDO"),
    ("ADMIN_GENERAL",        "tag.write",               "INCLUIDO"),
    ("ADMIN_GENERAL",        "tag.manage_restricted",   "INCLUIDO"),
    ("ADMIN_GENERAL",        "tag.grant",               "INCLUIDO"),
    ("GESTOR_LISTAS",        "comment.read",            "INCLUIDO"),
    ("GESTOR_LISTAS",        "tag.read",                "INCLUIDO"),
    ("GESTOR_LISTAS",        "tag.write",               "INCLUIDO"),
    ("GESTOR_MODELO_RIESGO", "comment.read",            "INCLUIDO"),
    ("GESTOR_MODELO_RIESGO", "tag.read",                "INCLUIDO"),
    ("GESTOR_MODELO_RIESGO", "tag.manage_restricted",   "INCLUIDO"),
    ("GESTOR_MODELO_RIESGO", "tag.grant",               "INCLUIDO"),
]


def up(db: Database, *, now_iso: str | None = None) -> None:
    """Aplica migración 005. Idempotente: upsert."""
    assert db.name == "duxiter-2", f"[SAFETY LOCK L2] 005 up SOLO en duxiter-2. DB={db.name!r} PROHIBIDO."
    from datetime import datetime
    now = now_iso or datetime.utcnow().isoformat()

    for p in PERMISOS_NUEVOS:
        db["permisos"].update_one({"codigo": p["codigo"]}, {"$set": p, "$setOnInsert": {"creado_en": now}}, upsert=True)
    for (rol_c, perm_c, modo) in ROL_PERMISO_NUEVOS:
        db["rol_permiso"].update_one({"rol_codigo": rol_c, "permiso_codigo": perm_c}, {"$set": {"modo": modo, "actualizado_en": now}, "$setOnInsert": {"creado_en": now}}, upsert=True)

    if "comentarios_v2" not in db.list_collection_names():
        db.create_collection("comentarios_v2")
    for campo in ["tenantId", "tercero_id", "rut_clean", "organizacion_id", "unidad_id", "area_id", "autor_id", "visibilidad", "borrado_logico"]:
        try:
            db["comentarios_v2"].create_index([(campo, 1)], name=f"idx_005_comentarios_{campo}", background=True)
        except Exception:
            pass
    try:
        db["comentarios_v2"].create_index([("creado_en", -1)], name="idx_005_comentarios_creado_en_desc", background=True)
    except Exception:
        pass

    if "catalogo_etiquetas" not in db.list_collection_names():
        db.create_collection("catalogo_etiquetas")
    try:
        db["catalogo_etiquetas"].create_index([("organizacion_id", 1), ("codigo", 1)], unique=True, name="idx_005_etiquetas_org_codigo_unico", background=True)
    except Exception:
        pass

    db["__rbac_migrations_version"].update_one({"_id": "state"}, {"$addToSet": {"applied": "005"}, "$set": {"actualizado_en": now}}, upsert=True)
