#!/usr/bin/env python3
"""
 001_seed_catalogo_permisos_roles.up.py
 ======================================
 Seed FASE 0 · Catálogo atómico (23 permisos) + 8 roles plantilla base.

 Crea colleciones:
  - permisos: documentos {codigo, categoria, descripcion, es_sensible}
  - roles: documentos {codigo, nombre, descripcion, es_plantilla_base=true}
  - rol_permiso: {rol_codigo, permiso_codigo, modo: 'INCLUIDO'|'CONFIGURABLE_OPCIONAL'}
  - nivel_info: catálogo 5 niveles acumulativos {num, codigo, descripcion}
  - tipo_tercero_categoria: 4 categorias (PJ_NACIONAL, PN_NACIONAL, PJ_EXTRANJERA, PN_EXTRANJERA)

 I DATI SONO IMMUTABILI: QUELLO CHE SCRIVE QUI È SORGENTE SPEC DOCX SEZ 7.1 e 7.2
 NESSUN VALORE È DERIVATO. Modifiche solo su procedura manuale successivo o script.
"""
from __future__ import annotations
from pymongo.database import Database

PERMISOS: list[dict] = [
    # --- CONSULTA ---
    {"codigo": "fastcheck.query",       "categoria": "CONSULTA",     "descripcion": "Realizar una consulta Fast Check.", "es_sensible": False},
    {"codigo": "party.query.pn",      "categoria": "CONSULTA",     "descripcion": "Consultar personas naturales. REQ otorgamiento sensible.", "es_sensible": True},
    # --- ACCION ---
    {"codigo": "request.create",      "categoria": "ACCION",       "descripcion": "Iniciar solicitud de evaluación/alta sin ver detalle.", "es_sensible": False},
    {"codigo": "doc.attach",         "categoria": "ACCION",           "descripcion": "Incorporar antecedentes / documentales fuente a tercero/evaluación.", "es_sensible": False},
    {"codigo": "eval.escalate",     "categoria": "ACCION",         "descripcion": "Escalar evaluación a otro nivel jerárquico.", "es_sensible": False},
    # --- COLABORACION ---
    {"codigo": "comment.create",     "categoria": "COLABORACION",  "descripcion": "Guardar comentarios en timeline tercero/evaluación.", "es_sensible": False},
    {"codigo": "tag.use",            "categoria": "COLABORACION",   "descripcion": "Crear / utilizar etiquetas (general/restringida).", "es_sensible": False},
    # --- EXPORTACION ---
    {"codigo": "export.certificate",  "categoria": "EXPORTACION",    "descripcion": "Exportar certificado nivel general (nivel ≤2).", "es_sensible": False},
    {"codigo": "export.detail",      "categoria": "EXPORTACION",    "descripcion": "Exportar informe detallado (nivel ≥4).", "es_sensible": False},
    # --- DECISION ---
    {"codigo": "exception.review",   "categoria": "DECISION",       "descripcion": "Revisar excepción elevada.", "es_sensible": False},
    {"codigo": "third_party.approve","categoria": "DECISION",      "descripcion": "Aprobar tercero definitivamente.", "es_sensible": False},
    {"codigo": "third_party.approve_obs", "categoria": "DECISION", "descripcion": "Aprobar tercero con observaciones.", "es_sensible": False},
    {"codigo": "third_party.reject", "categoria": "DECISION",      "descripcion": "Rechazar tercero.", "es_sensible": False},
    {"codigo": "third_party.request_info", "categoria":"DECISION","descripcion": "Solicitar antecedentes/documentación al solicitante.", "es_sensible": False},
    {"codigo": "exception.authorize","categoria": "DECISION",      "descripcion": "(SENSIBLE) Autorizar excepción pese a riesgo alto/rojo.", "es_sensible": True},
    # --- ADMINISTRACION ---
    {"codigo": "admin.users",        "categoria": "ADMINISTRACION",  "descripcion": "Crear / desactivar usuarios y asignar roles/permisos no sensibles.", "es_sensible": False},
    {"codigo": "admin.structure",    "categoria": "ADMINISTRACION","descripcion": "Administrar países, unidades organizacionales (árbol) y áreas funcionales.", "es_sensible": False},
    {"codigo": "admin.grant_sensitive","categoria":"ADMINISTRACION","descripcion": "(SENSIBLE) Otorgar permisos sensibles a otros usuarios (requiere doble intención y contraseña otorgante).", "es_sensible": True},
    {"codigo": "audit.view",         "categoria": "ADMINISTRACION", "descripcion": "Consultar trazabilidad y auditoría inmutable.", "es_sensible": False},
    # --- GOBIERNO RIESGO (TODOS SENSIBLES ---
    {"codigo": "risk.lists.manage",  "categoria": "GOBIERNO_RIESGO","descripcion": "(SENSIBLE) CRUD listas propias (incluir/excluir usuarios).", "es_sensible": True},
    {"codigo": "risk.params.define", "categoria": "GOBIERNO_RIESGO","descripcion": "(SENSIBLE) Definir parámetros incluidos en la evaluación de riesgo.", "es_sensible": True},
    {"codigo": "risk.thresholds.edit","categoria":"GOBIERNO_RIESGO","descripcion": "(SENSIBLE) Modificar umbrales del semáforo (verde/amarillo/rojo).", "es_sensible": True},
    {"codigo": "risk.formula.edit",  "categoria": "GOBIERNO_RIESGO","descripcion": "(SENSIBLE) Modificar fórmula / criterio de cálculo de riesgo final.", "es_sensible": True},
]

ROLES: list[dict] = [
    {"codigo": "SOLICITANTE",            "nombre": "Solicitante",                         "descripcion": "Inicia solicitudes de alta/evaluación; NO ve detalle de terceros.", "es_plantilla_base": True, "prioridad_nivel_jerarquico": 1},
    {"codigo": "USUARIO_OPERATIVO",      "nombre": "Usuario Operativo",                  "descripcion": "Carga de datos, adjunta antecedentes, ejecuta consultas PJ, escalar en su alcance.", "es_plantilla_base": True, "prioridad_nivel_jerarquico": 2},
    {"codigo": "EVALUADOR_ANALISTA",    "nombre": "Evaluador / Analista",               "descripcion": "Analiza resultado Fast Check, sugiere aprobación/rechazo, pide antecedentes en su UO.", "es_plantilla_base": True, "prioridad_nivel_jerarquico": 3},
    {"codigo": "APROBADOR",              "nombre": "Aprobador",                             "descripcion": "Decisión final (aprobar/rechazar/aprobar_obs) dentro de su alcance ACTUAR; excepciones.", "es_plantilla_base": True, "prioridad_nivel_jerarquico": 4},
    {"codigo": "AUDITOR",                "nombre": "Auditor",                               "descripcion": "SÓLO LECTURA (proyección a INFO_NO_SENSIBLE) y visualización timeline y auditoría.", "es_plantilla_base": True, "prioridad_nivel_jerarquico": 4},
    {"codigo": "ADMIN_GENERAL",          "nombre": "Administrador General",                "descripcion": "Gestiona usuarios y estructura org (admin.users, admin.structure) — PRINCIPIO ADMIN_GENERAL ≠ TODO: NO concede PN, gobierno riesgo, ni otorga sensibles de forma implícita.", "es_plantilla_base": True, "prioridad_nivel_jerarquico": 5},
    {"codigo": "GESTOR_LISTAS",          "nombre": "Gestor de Listas",                       "descripcion": "(sensible) Gestión de listas propias.", "es_plantilla_base": True, "prioridad_nivel_jerarquico": 5},
    {"codigo": "GESTOR_MODELO_RIESGO",   "nombre": "Gestor del Modelo de Riesgo",         "descripcion": "(sensible) Gestión de listas, umbrales, parámetros y fórmula.", "es_plantilla_base": True, "prioridad_nivel_jerarquico": 5},
]

# Modos: "INCLUIDO" (✓), "CONFIGURABLE_OPCIONAL" (△)
# Especificación Sec 7.2
ROL_PERMISO = [
    # (ROL COD, PERMISO COD, MODO
    # ----- Solicitante
    ("SOLICITANTE",          "request.create",         "INCLUIDO"),
    ("SOLICITANTE",          "doc.attach",             "INCLUIDO"),
    ("SOLICITANTE",          "comment.create",       "CONFIGURABLE_OPCIONAL"),
    ("SOLICITANTE",          "tag.use",              "CONFIGURABLE_OPCIONAL"),

    # ----- Usuario Operativo
    ("USUARIO_OPERATIVO",    "fastcheck.query",      "INCLUIDO"),
    ("USUARIO_OPERATIVO",    "doc.attach",             "INCLUIDO"),
    ("USUARIO_OPERATIVO",    "eval.escalate",        "INCLUIDO"),
    ("USUARIO_OPERATIVO",    "third_party.request_info","CONFIGURABLE_OPCIONAL"),
    ("USUARIO_OPERATIVO",    "export.certificate",   "INCLUIDO"),
    ("USUARIO_OPERATIVO",    "comment.create",       "INCLUIDO"),
    ("USUARIO_OPERATIVO",    "tag.use",              "INCLUIDO"),
    ("USUARIO_OPERATIVO",    "request.create",       "CONFIGURABLE_OPCIONAL"),

    # ----- Evaluador/Analista
    ("EVALUADOR_ANALISTA",   "fastcheck.query",     "INCLUIDO"),
    ("EVALUADOR_ANALISTA",   "request.create",      "CONFIGURABLE_OPCIONAL"),
    ("EVALUADOR_ANALISTA",   "doc.attach",          "INCLUIDO"),
    ("EVALUADOR_ANALISTA",   "eval.escalate",       "INCLUIDO"),
    ("EVALUADOR_ANALISTA",   "exception.review",     "INCLUIDO"),
    ("EVALUADOR_ANALISTA",   "third_party.request_info","INCLUIDO"),
    ("EVALUADOR_ANALISTA",   "export.certificate",  "INCLUIDO"),
    ("EVALUADOR_ANALISTA",   "export.detail",       "CONFIGURABLE_OPCIONAL"),
    ("EVALUADOR_ANALISTA",   "comment.create",      "INCLUIDO"),
    ("EVALUADOR_ANALISTA",   "tag.use",             "INCLUIDO"),
    ("EVALUADOR_ANALISTA",   "party.query.pn",    "CONFIGURABLE_OPCIONAL"),

    # ----- Aprobador
    ("APROBADOR",             "fastcheck.query",       "INCLUIDO"),
    ("APROBADOR",             "request.create",    "CONFIGURABLE_OPCIONAL"),
    ("APROBADOR",             "doc.attach",         "INCLUIDO"),
    ("APROBADOR",             "eval.escalate",     "CONFIGURABLE_OPCIONAL"),
    ("APROBADOR",             "exception.review",    "INCLUIDO"),
    ("APROBADOR",             "third_party.approve","INCLUIDO"),
    ("APROBADOR",             "third_party.approve_obs","INCLUIDO"),
    ("APROBADOR",             "third_party.reject","INCLUIDO"),
    ("APROBADOR",             "third_party.request_info","INCLUIDO"),
    ("APROBADOR",             "export.certificate","INCLUIDO"),
    ("APROBADOR",             "export.detail","INCLUIDO"),
    ("APROBADOR",             "comment.create","INCLUIDO"),
    ("APROBADOR",             "tag.use",               "INCLUIDO"),
    ("APROBADOR",             "audit.view",         "CONFIGURABLE_OPCIONAL"),
    ("APROBADOR",             "party.query.pn",    "CONFIGURABLE_OPCIONAL"),

    # ----- Auditor
    ("AUDITOR",               "fastcheck.query",     "INCLUIDO"),
    ("AUDITOR",               "export.certificate", "INCLUIDO"),
    ("AUDITOR",               "export.detail",   "INCLUIDO"),
    ("AUDITOR",               "comment.create",  "CONFIGURABLE_OPCIONAL"),
    ("AUDITOR",               "tag.use",         "CONFIGURABLE_OPCIONAL"),
    ("AUDITOR",               "audit.view",        "INCLUIDO"),
    ("AUDITOR",               "party.query.pn", "CONFIGURABLE_OPCIONAL"),

    # ----- Administrador General
    ("ADMIN_GENERAL",         "admin.users",            "INCLUIDO"),
    ("ADMIN_GENERAL",         "admin.structure",        "INCLUIDO"),
    ("ADMIN_GENERAL",         "fastcheck.query",       "CONFIGURABLE_OPCIONAL"),
    ("ADMIN_GENERAL",         "audit.view",           "CONFIGURABLE_OPCIONAL"),
    # ⚠️ PRINCIPIO NON NEGOCIABLE: ADMIN_GENERAL NON eredita implicitamente NESSUN SENSIBILE.
    # I sensibili devono essere conferiti con modalita' doppia intenzione ESCLUSA QUI.

    # ----- Gestor Listas
    ("GESTOR_LISTAS",        "risk.lists.manage",    "INCLUIDO"),
    ("GESTOR_LISTAS",        "admin.grant_sensitive", "CONFIGURABLE_OPCIONAL"),

    # ----- Gestore Modello Rischio
    ("GESTOR_MODELO_RIESGO", "risk.lists.manage",    "INCLUIDO"),
    ("GESTOR_MODELO_RIESGO", "risk.params.define",   "INCLUIDO"),
    ("GESTOR_MODELO_RIESGO", "risk.thresholds.edit","INCLUIDO"),
    ("GESTOR_MODELO_RIESGO", "risk.formula.edit",   "INCLUIDO"),
]

NIVEL_INFO = [
    {"num": 1, "codigo": "RESULTADO_GENERAL",  "descripcion": "Semaforo + decision y vigencia (sin detalle parametros).", "sensible_requerido": False},
    {"num": 2, "codigo": "RESULTADO_PARAMETROS","descripcion": "Ademas parametros Fast Check (parciales).",  "sensible_requerido": False},
    {"num": 3, "codigo": "DETALLE_RIESGO",   "descripcion": "Detalle de categorias riesgo (civil / comercial / listas etc.)", "sensible_requerido": False},
    {"num": 4, "codigo": "INFO_NO_SENSIBLE",   "descripcion": "Toda informacion NO sensible (sin PN, sin datos identificatorios)",   "sensible_requerido": False},
    {"num": 5, "codigo": "INFO_COMPLETA",     "descripcion": "Todo, incluyendo PN e identificatorios sensibles.", "sensible_requerido": True},
]

TIPO_TERCERO = [
    {"codigo": "PJ_NACIONAL",      "descripcion": "Persona Juridica Nacional (Chileno) — acceso standard (no sensible)", "flag_sensible": False},
    {"codigo": "PN_NACIONAL",      "descripcion": "Persona Natural Nacional — accedido SOLO CON permiso party.query.pn = SENSIBLE.",  "flag_sensible": True},
    {"codigo": "PJ_EXTRANJERA",   "descripcion": "Persona Juridica Extranjera.", "flag_sensible": False},
    {"codigo": "PN_EXTRANJERA",    "descripcion": "Persona Natural Extranjera → SENSIBILE come PN_NACIONAL (requiere party.query.pn).", "flag_sensible": True},
]


def up(db: Database) -> str:
    # indice unico por codigo + non cambiare
    db.permisos.create_index("codigo", unique=True, name="uk_permisos_codigo")
    for p in PERMISOS:
        db.permisos.update_one({"codigo": p["codigo"]}, {"$setOnInsert": p}, upsert=True)
    n_perm = db.permisos.count_documents({})

    db.roles.create_index("codigo", unique=True, name="uk_roles_codigo")
    for r in ROLES:
        db.roles.update_one({"codigo": r["codigo"]}, {"$setOnInsert": r}, upsert=True)
    n_roles = db.roles.count_documents({})

    db.rol_permiso.create_index([("rol_codigo", 1), ("permiso_codigo", 1)], unique=True, name="uk_rol_permiso")
    for rc, pc, modo in ROL_PERMISO:
        obj = {"rol_codigo": rc, "permiso_codigo": pc, "modo": modo}
        db.rol_permiso.update_one(
            {"rol_codigo": rc, "permiso_codigo": pc},
            {"$setOnInsert": obj}, upsert=True,
        )
    n_rp = db.rol_permiso.count_documents({})

    db.nivel_info.create_index("num", unique=True, name="uk_nivel_info_num")
    db.nivel_info.create_index("codigo", unique=True, name="uk_nivel_info_codigo")
    for lv in NIVEL_INFO:
        db.nivel_info.update_one({"codigo": lv["codigo"]}, {"$setOnInsert": lv}, upsert=True)
    n_ni = db.nivel_info.count_documents({})

    db.tipo_tercero_categoria.create_index("codigo", unique=True, name="uk_tipo_tercero_codigo")
    for tt in TIPO_TERCERO:
        db.tipo_tercero_categoria.update_one({"codigo": tt["codigo"]}, {"$setOnInsert": tt}, upsert=True)
    n_tt = db.tipo_tercero_categoria.count_documents({})

    return (
        f"Seed OK: permisos={n_perm} (attesi {n_roles} roles · rol_permiso={n_rp} · "
        f"niveles_info={n_ni} · tipos_tercero={n_tt}"
    )
