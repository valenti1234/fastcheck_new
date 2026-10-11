#!/usr/bin/env python3
""" smoke_test_post_fase0_migrations.py — smoke test END-TO-END dopo 001-004."""
from __future__ import annotations
import os, sys
from dotenv import load_dotenv
from pymongo import MongoClient
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent.parent / ".env.migrations")

BASE = os.environ["MONGODB_URI_SRC_BASE"]
TOPTS = os.environ["MONGODB_URI_TGT_OPTS"]
TARGET_DB = os.environ["MIGRATION_TGT_DB_NAME"]
client = MongoClient(f"{BASE}/{TARGET_DB}?{TOPTS}")
db = client[TARGET_DB]

PASS = []
FAIL = []
def check(name, got, expected, desc=""):
    ok = got == expected
    (PASS if ok else FAIL).append((name, got, expected, desc))
    sym = "✅" if ok else "❌"
    print(f"  {sym} {name:<40s}  got={got!r:<8} expected={expected!r}  {desc}")

print("\n" + "="*80)
print("SMOKE TEST POST-MIGRAZIONI 001..004 su DB=", db.name)
print("="*80)

print("\n--- 001 · Seed catalogo ---")
check("permisos count",        db.permisos.count_documents({}), 23)
check("roles count",           db.roles.count_documents({}),    8)
check("nivel_info count",      db.nivel_info.count_documents({}), 5)
check("tipo_tercero_catg",     db.tipo_tercero_categoria.count_documents({}), 4)
sensibles = list(db.permisos.find({"es_sensible": True}).distinct("codigo"))
print(f"  permisos sensibles: {sensibles}")
check("sensible count",        len(sensibles), 8, "deve esserci party.query.pn, risk.*, exception.authorize, admin.grant_sensitive")

print("\n--- 002 · Estructura organizacional ---")
n_tenants = db.tenants.count_documents({}) if "tenants" in db.list_collection_names() else 0
check("organizaciones", db.organizaciones.count_documents({}), n_tenants, "1 org per tenant legacy")
check("paises",         db.paises.count_documents({}), n_tenants)
check("unidades root",  db.unidades_organizacionales.count_documents({}), n_tenants)
check("areas (x4 org)", db.areas_funcionales.count_documents({}), 4*n_tenants)

print("\n--- 003 · Usuarios ---")
n_users = db.users.count_documents({})
check("users migrati marcati authz_v2_migrated=true",
      db.users.count_documents({"authz_v2_migrated": True}), n_users)
check("tutti hanno cache_version >=1",
      db.users.count_documents({"cache_version": {"$gte": 1}}), n_users)

# Assegnamenti ruolo legacy->plantilla attesi:
#   superuser: 0 ruoli (wildcard fuori dal modello)
#   tenant_admin: 2 ruoli per user (ADMIN_GENERAL + GESTOR_LISTAS)
#   evaluator: 2 (USUARIO_OP + EVALUADOR)
#   read_only: 1 AUDITOR
#   write_only: 1 USUARIO_OP
from collections import Counter
lcnt = Counter()
for u in db.users.find({}, {"_id":0, "role": 1}):
    lcnt[u.get("role") or "write_only"] += 1
expected_roles = 0
for lrole, c in lcnt.items():
    if lrole == "superuser":
        continue
    elif lrole == "tenant_admin": expected_roles += 2*c
    elif lrole == "evaluator":    expected_roles += 2*c
    elif lrole == "read_only":    expected_roles += 1*c
    elif lrole == "write_only":   expected_roles += 1*c
    else:                         expected_roles += 1*c
check("usuario_rol totali",   db.usuario_rol.count_documents({}), expected_roles,
      f"{dict(lcnt)} legacy counts")

# Dimensioni defaults:
check("usuario_producto (1 per user)", db.usuario_producto.count_documents({}), n_users)
check("usuario_tipo_tercero (1/user)",  db.usuario_tipo_tercero.count_documents({}), n_users)
check("usuario_nivel_info (1/user)",    db.usuario_nivel_info.count_documents({}), n_users)
check("usuario_alcance 2/user (VER+ACT)", db.usuario_alcance.count_documents({}), 2*n_users)

# ==== Q1: PARTY.QUERY.PN OVERRIDE ====
print("\n--- 🔥 Q1 2026-10-03: PN grant SOLO a SUPERUSER global ---")
supers = list(db.users.find({"role": "superuser"}))
print(f"  superusers legacy trovati = {len(supers)}")
if supers:
    super_ids = [u["_id"] for u in supers]
    n_pn_grants = db.usuario_permiso_override.count_documents({
        "usuario_id": {"$in": super_ids},
        "permiso_codigo": "party.query.pn",
        "tipo_override": "GRANT",
        "sensible_confirmado": True,
        "origen": {"$regex": "Q1|BOOTSTRAP"}
    })
    check("PN grant solo superuser (Q1)", n_pn_grants, len(supers),
          "1 grant per superuser, 0 per gli altri")
    # Sicurezza: NESSUN NON-superuser ha PN grant automatico
    n_pn_others = db.usuario_permiso_override.count_documents({
        "usuario_id": {"$nin": super_ids},
        "permiso_codigo": "party.query.pn",
        "tipo_override": "GRANT",
    })
    check("PN grant NEGATIVO per non-super", n_pn_others, 0,
          "nessun altro utente riceve PN automatico: deny-by-default D-01")

check("TOTAL override documenti", db.usuario_permiso_override.count_documents({}),
      len(supers), "1 documento per superuser = solo PN grant Q1")

print("\n--- 004 · Indices ---")
def count_user_idx(col):
    try:
        return len(list(db[col].list_indexes()))
    except Exception:
        return 0
print(f"  permisos:  {count_user_idx('permisos')} indici")
print(f"  roles:     {count_user_idx('roles')} indici")
print(f"  users:     {count_user_idx('users')} indici (contiene idx_authz_migrated...)")
print(f"  usr_rol:   {count_user_idx('usuario_rol')} indici")
print(f"  usr_override: {count_user_idx('usuario_permiso_override')} indici")
print(f"  auditoria: {count_user_idx('auditoria_log')} indici")

print("\n" + "="*80)
print(f"TOTAL  PASS = {len(PASS)}   FAIL = {len(FAIL)}")
if FAIL:
    print("\nFAILURES:")
    for n, g, e, d in FAIL:
        print(f"  ❌ {n} got={g} exp={e}  {d}")
    sys.exit(1)
print("\n🎉 SMOKE TEST FASE 0 MIGRATIONS:  100% PASS")
client.close()
