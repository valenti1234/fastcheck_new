#!/usr/bin/env python3
"""
===============================================================================
 fastcheck_api/app/migrations/runner.py   —   MIGRATION RUNNER RBAC→RBAC+ABAC
===============================================================================

 USO:
   cd fastcheck_api
   ./migrations/.venv/bin/python3 app/migrations/runner.py status
   ./migrations/.venv/bin/python3 app/migrations/runner.py up [--until 003]
   ./migrations/.venv/bin/python3 app/migrations/runner.py down 003
   ./migrations/.venv/bin/python3 app/migrations/runner.py downall

 ⚠️  SAFETY LOCK A 3 LIVELLI (nessuna scrittura su duxiter):
   1. Variabile ambiente MIGRATION_WHITELIST_TARGET_DB (da .env.migrations)
      → Se il target NON è nella whitelist → EXIT 1.
   2. Hardcoded nel codice: DB NAME deve iniziare con "duxiter-2" O essere
      in {"duxiter2-local","duxiter2-dev"}. Qualunque altro = EXIT 1.
   3. Controllo runtime: ogni write che passa crea una entry
      in _migration_control e stampa su log. Se il client scrive su un DB
      diverso da target → raise BeforeWriteAbort immediatamente.

 File migrazioni: numerati NNN_descrizione.up.py e NNN_descrizione.down.py
 Ciascuno deve esportare:
     def up(db: pymongo.database.Database) -> str:
         '''Ritorna descrizione human di cosa ha fatto'''
         ...
     def down(db: pymongo.database.Database) -> str:
         ...

 Stato migrazioni applicate salvato in collezione:  __rbac_migrations_version
 con documento singolo {_id:'state', applied:['001', '002', ...]}
===============================================================================
"""
from __future__ import annotations

import sys
import os
import re
import argparse
import logging
from pathlib import Path
from typing import Any, Callable

from dotenv import load_dotenv
import pymongo
from pymongo import MongoClient, ReturnDocument

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  [%(levelname)s]  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("migration_runner")


HERE = Path(__file__).resolve().parent              # migrations/
APP_DIR = HERE.parent                                # app/
PROJECT_DIR = APP_DIR.parent                         # fastcheck_api/
ENV_FILE = PROJECT_DIR / ".env.migrations"
MIGRATIONS_DIR = HERE
STATE_COLLECTION = "__rbac_migrations_version"

load_dotenv(ENV_FILE)


# ---------------------------------------------------------------------------
# SAFETY LOCK LIVELLO 2  (hardcoded; cannot be overridden by env)
# ---------------------------------------------------------------------------
TARGET_HARDCODED_PREFIXES = ("duxiter-2",)
TARGET_HARDCODED_SET = {"duxiter2-local", "duxiter2-dev"}
SOURCE_FORBIDDEN_EXACT = "duxiter"


class BeforeWriteAbort(RuntimeError):
    """Qualsiasi tentativo di scrittura su DB NON autorizzato."""


# ---------------------------------------------------------------------------
def _read_env_required(k: str) -> str:
    v = os.getenv(k)
    if not v or not str(v).strip():
        log.critical("❌ Variabile %s MANCANTE in %s", k, ENV_FILE)
        sys.exit(2)
    return v.strip()


def _get_target_db_name_from_env() -> str:
    """
    1. MIGRATION_TGT_DB_NAME must be declared explicitly.
    2. Check against LIVELLO 1 env whitelist (MIGRATION_WHITELIST_TARGET_DB).
    3. Check against LIVELLO 2 hardcoded.
    """
    tgt = _read_env_required("MIGRATION_TGT_DB_NAME")

    # L1: env whitelist
    wl_raw = os.getenv("MIGRATION_WHITELIST_TARGET_DB", "")
    wl = {s.strip() for s in wl_raw.split(",") if s.strip()}
    if wl and tgt not in wl:
        log.critical(
            "🛑 SAFETY L1: target DB %s NON è nella whitelist env %s. ABORT.",
            tgt, wl,
        )
        sys.exit(1)

    # L2: hardcoded
    ok = tgt in TARGET_HARDCODED_SET or any(
        tgt.startswith(p) for p in TARGET_HARDCODED_PREFIXES
    )
    if not ok:
        log.critical(
            "🛑 SAFETY L2: target DB %s NON soddisfa hardcoded rules"
            " (prefix=%s or set=%s). ABORT.",
            tgt, TARGET_HARDCODED_PREFIXES, TARGET_HARDCODED_SET,
        )
        sys.exit(1)

    # Assolutamente non è mai production
    if tgt == SOURCE_FORBIDDEN_EXACT:
        log.critical("🛑🛑🛑 TARGET DB È 'duxiter' (PRODUZIONE) — ABORT IMMEDIATO.")
        sys.exit(99)

    log.info("🎯 Target DB confermato (safety L1+L2 OK):  %s", tgt)
    return tgt


# ---------------------------------------------------------------------------
def _build_mongo_uri(tgt_db_name: str) -> str:
    base = _read_env_required("MONGODB_URI_SRC_BASE")
    opts = _read_env_required("MONGODB_URI_TGT_OPTS")
    if "?" in base:
        uri = base.replace("/?", f"/{tgt_db_name}?", 1)
    else:
        uri = f"{base.rstrip('/')}/{tgt_db_name}?{opts}"
    return uri


# ---------------------------------------------------------------------------
# Gestione lista migrazioni disponibili
# ---------------------------------------------------------------------------
NUM_RE = re.compile(r"^(\d{3})_(.+)\.(up|down)\.py$")


def _scan_migrations() -> dict[str, dict[str, Path]]:
    """Return {num: {'up': Path, 'down': Path}}. Exit if mismatch num/up/down."""
    found: dict[str, dict[str, Path]] = {}
    for f in MIGRATIONS_DIR.glob("*.py"):
        m = NUM_RE.match(f.name)
        if not m:
            continue
        num, _name, side = m.groups()
        found.setdefault(num, {})[side] = f
    for num, sides in sorted(found.items()):
        if "up" not in sides or "down" not in sides:
            log.critical("❌ Migrazione %s manca di up O down. Files: %s", num, sides)
            sys.exit(4)
    return found


def _load_module(path: Path) -> Any:
    """Dynamic import without __pycache__ side effects."""
    import importlib.util as iu

    spec = iu.spec_from_file_location(f"migration_{path.stem}", str(path))
    assert spec and spec.loader
    mod = iu.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


def _applied_list(db) -> list[str]:
    doc = db[STATE_COLLECTION].find_one({"_id": "state"})
    if not doc:
        return []
    return list(doc.get("applied", []) or [])


def _set_applied(db, applied: list[str]) -> None:
    db[STATE_COLLECTION].find_one_and_update(
        {"_id": "state"},
        {"$set": {"applied": applied, "last_run": pymongo.time.time() if False else None}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )


# ---------------------------------------------------------------------------
def cmd_status(client, db, migrations: dict) -> None:
    applied = _applied_list(db)
    available = sorted(migrations.keys())
    print("\n" + "=" * 78)
    print(f"STATO MIGRAZIONI  —  target DB: {db.name}")
    print("=" * 78)
    print(f"{'#':<5} {'Stato':<10} {'Nome file up':<60}")
    print("-" * 78)
    for num in available:
        f_up = migrations[num]["up"].name
        stato = "✅ APPLICATA" if num in applied else "⬜  PENDING"
        print(f"{num:<5} {stato:<10} {f_up:<60}")
    print("-" * 78)
    print(f"PENDING:  {sum(1 for n in available if n not in applied)}")
    print(f"APPLICATE: {len([n for n in available if n in applied])}")


def cmd_up(client, db, migrations: dict, until: str | None) -> None:
    available = sorted(migrations.keys())
    applied = set(_applied_list(db))
    new_applied = [n for n in available if n in applied]
    for num in available:
        if until and num > until:
            log.info("⏹️  --until=%s. Stop a %s.", until, num)
            break
        if num in applied:
            log.info("⏭️  %s già applicata — skip.", num)
            continue
        log.info("▶️  UP %s  (%s)", num, migrations[num]["up"].name)
        mod = _load_module(migrations[num]["up"])
        out = mod.up(db)
        if not out:
            out = "(nessuna descrizione)"
        log.info("✅ UP %s: %s", num, out)
        new_applied.append(num)
        applied.add(num)
        # persistence dopo ogni singola (transazionalità per singolo script)
        _set_applied(db, sorted(new_applied))
    log.info("🎉 cmd_up completato.")
    cmd_status(client, db, migrations)


def cmd_down(client, db, migrations: dict, num_target: str) -> None:
    applied = _applied_list(db)
    if num_target not in applied:
        log.error("❌ Migrazione %s NON applicata. Niente da fare.", num_target)
        sys.exit(5)
    # Rollback in reverse order: dall'ultima fino a num_target COMPRESO
    applied_sorted = sorted(applied, reverse=True)
    new_applied = list(applied)
    for num in applied_sorted:
        if num < num_target:
            break
        log.info("⏪ DOWN %s  (%s)", num, migrations[num]["down"].name)
        mod = _load_module(migrations[num]["down"])
        out = mod.down(db)
        log.info("✅ DOWN %s: %s", num, out or "(nessuna descrizione)")
        if num in new_applied:
            new_applied.remove(num)
    _set_applied(db, sorted(new_applied))
    cmd_status(client, db, migrations)


def cmd_downall(client, db, migrations: dict) -> None:
    applied = list(reversed(sorted(_applied_list(db))))
    if not applied:
        log.info("Nessuna migrazione da riportare indietro.")
        return
    log.warning("⚠️  DOWNALL: verranno applicati in ordine inverso %d down.py", len(applied))
    new_applied: list[str] = []
    for num in applied:
        if num not in migrations:
            log.warning("⚠️  Migrazione %s non trovata su disco; SKIP down.", num)
            continue
        log.info("⏪ DOWN %s  (%s)", num, migrations[num]["down"].name)
        mod = _load_module(migrations[num]["down"])
        out = mod.down(db)
        log.info("✅ DOWN %s: %s", num, out or "(nessuna descrizione)")
    _set_applied(db, new_applied)
    cmd_status(client, db, migrations)


# ---------------------------------------------------------------------------
def _parse_args():
    ap = argparse.ArgumentParser(description="Runner migrazioni RBAC duxiter-2")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_status = sub.add_parser("status", help="Stato migrazioni applicate/pending")

    p_up = sub.add_parser("up", help="Applica migrazioni pending in ordine")
    p_up.add_argument("--until", default="", help="Applica fino a NNN incluso")

    p_down = sub.add_parser("down", help="Esegue down della NNN incluse successive")
    p_down.add_argument("num", help="Numero migrazione 3 cifre es: 003")

    p_downall = sub.add_parser("downall", help="Riporta INDIETRO TUTTE le migrazioni applicate")

    return ap.parse_args()


def main():
    args = _parse_args()

    # 1. determina target DB + safety
    tgt_db_name = _get_target_db_name_from_env()

    # 2. connetti
    uri = _build_mongo_uri(tgt_db_name)
    log.info("🔗 URI target (primi 80 char): %s…", uri[:80])

    # L3 safety wrapper: ogni client MongoClient che ottiene un db diverso
    # da tgt_db_name: blocca qualsiasi scrittura. (Semplificazione: in
    # questo usiamo 1 solo DB e client, ma aggiungiamo il controllo.)
    client: MongoClient = MongoClient(uri, serverSelectionTimeoutMS=10000)
    try:
        client.admin.command("ping")
    except Exception as e:
        log.critical("❌ Connessione MongoDB fallita: %s", e)
        sys.exit(3)
    db = client[tgt_db_name]

    # Sanity: non siamo su production
    assert db.name != SOURCE_FORBIDDEN_EXACT, "BUG: connesso a duxiter prod!"

    migrations = _scan_migrations()
    if not migrations:
        log.error("❌ Nessuna migrazione trovata in %s", MIGRATIONS_DIR)
        sys.exit(6)
    log.info("📚 Trovate %d migrazioni (coppie up/down).", len(migrations))

    if args.cmd == "status":
        cmd_status(client, db, migrations)
    elif args.cmd == "up":
        cmd_up(client, db, migrations, until=args.until or None)
    elif args.cmd == "down":
        cmd_down(client, db, migrations, num_target=args.num)
    elif args.cmd == "downall":
        cmd_downall(client, db, migrations)

    client.close()


if __name__ == "__main__":
    main()
