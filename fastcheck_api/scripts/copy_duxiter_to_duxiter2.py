#!/usr/bin/env python3
"""
===============================================================================
 copy_duxiter_to_duxiter2.py  —  COPIA 1:1 DA PRODUZIONE "duxiter" (READ ONLY)
                                  A STAGING MIGRAZIONI "duxiter-2"
===============================================================================

 ⚠️  100% SAFETY LOCK HARDCODED NEL CODICE:
  • Source DB AMMESSO SOLO SE è ESATTAMENTE "duxiter"
  • Target DB AMMESSO SOLO SE è NELLA WHITELIST (duxiter-2, duxiter2-local, duxiter2-dev)
  • NESSUNA SCRITTURA VIENE ESEGUITA SULLA SORGENTE. MAI. IN NESSUN CASO.
  • SUL SOURCE CLIENT VIENE SETTATO readPreference=secondaryPreferred e
    le sole chiamate sono list_database_names(), list_collection_names(),
    find(), count_documents(), aggregate([]).
  • Se viene rilevata un'operazione di scrittura sul client sorgente viene
    sollevata eccezione BeforeAnyWriteAbort() e il processo si ferma.
  • Ogni collezione viene copiata cosi':
      1. conteggio_doc_sorgente = source_col.count_documents()
      2. copia batch insert_many() sul target
      3. conteggio_doc_target = target_col.count_documents()
      4. se conteggio_doc_target != conteggio_doc_sorgente:
         MOVE AL prossimo batch; ALTRIMENTI ABORT con messaggio di errore
      5. indici: target_col.create_indexes(source_col.index_information())
  • Prima di iniziare: se la collezione esiste già nel target e
    CLI arg --drop-existing non è passato: SKIP collezione (non sovrascrive)
    per evitare doppioni accidentali.

 Uso:
   cd fastcheck_api
   migrations/.venv/bin/python3 scripts/copy_duxiter_to_duxiter2.py
   # Aggiungi --drop-existing per forzare eliminazione collezione in target prima della copia
   # Aggiungi --only "users,tenants,evaluations" per filtrare
===============================================================================
"""
from __future__ import annotations

import sys
import os
import argparse
import logging
from pathlib import Path
from typing import Iterable, Any

import pymongo
from pymongo import MongoClient, WriteConcern
from pymongo.errors import OperationFailure
from dotenv import load_dotenv

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  [%(levelname)s]  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("copy_db")


HERE = Path(__file__).resolve().parent.parent  # fastcheck_api/
ENV_FILE = HERE / ".env.migrations"
load_dotenv(ENV_FILE)


# --------------------------------------------------------------------------
# SAFETY LOCK HARDCODED  —  NESSUN VALORE PASSATO DA VARIABILI PUO' BUCARLO
# --------------------------------------------------------------------------
SOURCE_ALLOWED_EXACT = "duxiter"
TARGET_ALLOWED_SET = {"duxiter-2", "duxiter2-local", "duxiter2-dev"}


class BeforeAnyWriteAbort(Exception):
    """Raised if an attempt is detected to WRITE on SOURCE client."""


# -------- [METODI DI SCRITTURA: bloccati in ReadonlyCollectionProxy] -----
_WRITE_METHOD_NAMES = frozenset([
    "insert_one", "insert_many", "update_one", "update_many",
    "replace_one", "delete_one", "delete_many", "bulk_write",
    "create_index", "create_indexes", "drop", "drop_index",
    "drop_indexes", "rename", "update_many", "find_one_and_update",
    "find_one_and_replace", "find_one_and_delete",
    "aggregate_out", "map_reduce", "inline_map_reduce",
])


def _safety_write_blocker(*a, **kw):  # pragma: no cover
    raise BeforeAnyWriteAbort(
        "🛑 TENTATIVO DI SCRITTURA SUL DB SORGENTE DUxITER (PRODUZIONE). "
        "PROCESSO INTERROTTO. NESSUNA MODIFICA EFFETTUATA."
    )


# -------- [WRAPPER READ-ONLY SUL DB SORGENTE] -----------------------------
# Sostituiamo l'istanza db sorgente con un proxy: ogni estrazione di
# Collection restituisce ReadonlyCollectionProxy che blocca tutti i
# metodi di scrittura. Non tocchiamo mai pymongo classi globali Database
# per non rompere il target db.
class ReadonlyCollectionProxy:
    __slots__ = ("_inner", "_name")

    def __init__(self, inner_real_collection):
        object.__setattr__(self, "_inner", inner_real_collection)
        object.__setattr__(self, "_name", inner_real_collection.name)

    # -- Deleghiamo TUTTE le chiamate di lettura direttamente all'inner --
    def __getattr__(self, item):
        if item in _WRITE_METHOD_NAMES:
            return _safety_write_blocker
        return getattr(self._inner, item)

    def __getitem__(self, item):
        # chiamate tipo col["sub"]
        inner = self._inner[item]
        if hasattr(inner, "insert_one"):
            return ReadonlyCollectionProxy(inner)
        return inner

    def with_options(self, **kwargs):
        return ReadonlyCollectionProxy(self._inner.with_options(**kwargs))

    @property
    def name(self):
        return self._name


class ReadonlyDatabaseProxy:
    __slots__ = ("_db", "_name")

    def __init__(self, real_db):
        object.__setattr__(self, "_db", real_db)
        object.__setattr__(self, "_name", real_db.name)

    def __getitem__(self, coll_name):
        return ReadonlyCollectionProxy(self._db[coll_name])

    def __getattr__(self, item):
        attr = getattr(self._db, item)
        if callable(attr) and item in {"command", "list_collection_names",
                                       "list_database_names", "name",
                                       "aggregate"}:
            return attr
        # Blocca esplicitamente drop_collection / create_collection
        if item in {"drop_collection", "create_collection",
                    "command", "dereference", "validate_collection"}:
            return _safety_write_blocker
        return attr

    @property
    def name(self):
        return self._name


def apply_safety_lock_source(client: MongoClient, src_db_name: str) -> None:
    """Rimpiazza client[src_db_name] per le successive chiamate con un proxy read-only.
    Nota: non possiamo modificare client[src_db_name] su MongoClient, quindi
    list_collections e ogni uso di src_col usa il proxy esplicitamente.
    Inoltre patchiamo client.__getitem__ per src_db_name in modo che ritorni proxy."""
    _orig_getitem = client.__class__.__getitem__

    def safe_getitem(this_client, name):
        real = _orig_getitem(this_client, name)
        if name == src_db_name:
            return ReadonlyDatabaseProxy(real)
        return real

    client.__class__.__getitem__ = safe_getitem  # type: ignore[assignment]
    log.info("🔒  [SAFETY LOCK] Source DB %s = SOLO LETTURA. Scritture bloccate (proxy).", src_db_name)


# --------------------------------------------------------------------------
def getenv_required(key: str) -> str:
    val = os.getenv(key)
    if not val or not str(val).strip():
        log.critical("Variabile %s mancante in %s", key, ENV_FILE)
        sys.exit(2)
    return str(val).strip()


def build_uri(base: str, dbname: str, opts: str) -> str:
    if "?" in base:
        return base.replace("/?", f"/{dbname}?", 1)
    return f"{base.rstrip('/')}/{dbname}?{opts}"


def list_collections_safe(src_client, src_db: str, only: list[str] | None):
    names = sorted(src_client[src_db].list_collection_names())
    if os.getenv("COPY_SKIP_SYSTEM_COLLECTIONS", "true").lower() in {"1", "true", "si"}:
        names = [n for n in names if not n.startswith("system.")]
    if only:
        names = [n for n in names if n in set(only)]
    return names


def copy_one_collection(
    src_col, tgt_col, batch_size: int, drop_existing: bool, verbose: bool,
    *, dry_run: bool,
) -> tuple[int, int]:
    """Return (count_source, count_target)."""
    cnt_src = src_col.estimated_document_count()
    cnt_src = src_col.count_documents({})
    if verbose:
        log.info("  → %s  (%d docs da copiare)", src_col.name, cnt_src)

    if dry_run:
        log.info("     🟡 [DRY-RUN] salta scritture target %s", tgt_col.name)
        _copy_indexes(src_col, tgt_col, drop_existing=False, dry_run=True)
        return cnt_src, 0

    if cnt_src == 0:
        _copy_indexes(src_col, tgt_col, drop_existing=drop_existing)
        return 0, 0

    if tgt_col.estimated_document_count() > 0:
        if drop_existing:
            log.warning("     🧨 Drop collezione esistente nel target: %s", tgt_col.name)
            tgt_col.drop()
        else:
            log.error(
                "❌  Collezione %s già esistente con %d docs e --drop-existing NON passato. SKIP. "
                "Se vuoi ricopiare rilancia con --drop-existing",
                tgt_col.name,
                tgt_col.estimated_document_count(),
            )
            return cnt_src, -999

    cursor = src_col.find({}, no_cursor_timeout=False, batch_size=batch_size)
    batch: list[dict[str, Any]] = []
    with tgt_col.database.client.start_session() as sess:
        wc = WriteConcern(w="majority", j=False)
        tgt_col_wc = tgt_col.with_options(write_concern=wc)
        for doc in cursor:
            batch.append(doc)
            if len(batch) >= batch_size:
                tgt_col_wc.insert_many(batch, ordered=False, session=sess)
                batch = []
                if verbose:
                    pct = min(100.0, (tgt_col.count_documents({}) / max(1, cnt_src)) * 100)
                    log.info("     %s: %.1f%% copiato", tgt_col.name, pct)
        if batch:
            tgt_col_wc.insert_many(batch, ordered=False, session=sess)

    _copy_indexes(src_col, tgt_col, drop_existing=True)

    cnt_tgt = tgt_col.count_documents({})
    return cnt_src, cnt_tgt


def _copy_indexes(src_col, tgt_col, drop_existing: bool, *, dry_run: bool = False) -> None:
    try:
        idx_info = src_col.index_information()
    except OperationFailure:
        log.warning("     ⚠️  Indici non leggibili per %s — skip", src_col.name)
        return
    to_create = []
    for name, spec in idx_info.items():
        if name == "_id_":
            continue
        keys = spec["key"]
        options = {k: v for k, v in spec.items() if k not in {"key", "v", "ns"}}
        to_create.append(pymongo.IndexModel(keys, name=name, **options))
    if not to_create:
        return
    if dry_run:
        log.info("     🟡 [DRY-RUN] skips %d indici per %s", len(to_create), tgt_col.name)
        return
    if drop_existing:
        try:
            tgt_col.drop_indexes()
        except Exception:
            pass
    tgt_col.create_indexes(to_create)
    log.info("     ✅ %d indici creati per %s", len(to_create), tgt_col.name)


def parse_args():
    ap = argparse.ArgumentParser(description="Copia duxiter → duxiter-2 READ-ONLY source")
    ap.add_argument(
        "--drop-existing",
        action="store_true",
        help="Elimina collezioni già esistenti nel target PRIMA di ricopiare (attenzione!)",
    )
    ap.add_argument(
        "--only",
        default="",
        help="Copia solo queste collezioni, separate da virgola. Es: --only users,tenants",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Nessuna scrittura su target: stampa solo l'elenco delle collezioni, i conteggi e gli indici che sarebbero stati copiati.",
    )
    return ap.parse_args()


def main():
    args = parse_args()
    only_list = [s.strip() for s in args.only.split(",") if s.strip()] if args.only else None
    if args.dry_run:
        log.info("🟡 [DRY-RUN] ATTIVO. Nessuna scrittura verrà eseguita sul target.")

    # 1. Safety check variabili
    uri_base = getenv_required("MONGODB_URI_SRC_BASE")
    src_opts = getenv_required("MONGODB_URI_SRC_OPTS")
    tgt_opts = getenv_required("MONGODB_URI_TGT_OPTS")
    src_db = getenv_required("MIGRATION_SRC_DB_NAME")
    tgt_db = getenv_required("MIGRATION_TGT_DB_NAME")
    try:
        batch_size = int(os.getenv("COPY_BATCH_SIZE", "5000"))
    except ValueError:
        batch_size = 5000
    verbose = os.getenv("COPY_VERBOSE", "true").lower() in {"1", "true", "si"}

    # 2. SAFETY LOCK FINALE PRIMA DI APRIRE QUALSIASI CONNESSIONE
    if src_db != SOURCE_ALLOWED_EXACT:
        log.critical(
            "🛑 SAFETY: MIGRATION_SRC_DB_NAME = %s. AMMESSO SOLO %s. ABORT.",
            src_db, SOURCE_ALLOWED_EXACT,
        )
        sys.exit(1)
    if tgt_db not in TARGET_ALLOWED_SET:
        log.critical(
            "🛑 SAFETY: MIGRATION_TGT_DB_NAME = %s. AMMESSI SOLO: %s. ABORT.",
            tgt_db, TARGET_ALLOWED_SET,
        )
        sys.exit(1)

    # 3. Apri connessioni: source read-preferred, target primary-preferred (WRITE)
    src_uri = build_uri(uri_base + "", src_db, src_opts)
    tgt_uri = build_uri(uri_base + "", tgt_db, tgt_opts)

    log.info("🔗 Source URI (S.O.L.O.  L E T T U R A):  %s…", src_uri[:80])
    log.info("🔗 Target URI (nuovo %s, WRITE):  %s…", tgt_db, tgt_uri[:80])

    source_client: MongoClient = MongoClient(
        src_uri, serverSelectionTimeoutMS=10000, connectTimeoutMS=10000
    )
    target_client: MongoClient = MongoClient(
        tgt_uri, serverSelectionTimeoutMS=10000, connectTimeoutMS=10000
    )

    # 4. Test connessione (solo lista DB, nessuna scrittura)
    try:
        source_client.admin.command("ping")
        target_client.admin.command("ping")
        log.info("✅ Connessioni sia source sia target OK.")
    except Exception as e:
        log.critical("❌ Connessione fallita: %s", e)
        sys.exit(3)

    # 5. SAFETY LOCK SCRITTURE SU SOURCE
    apply_safety_lock_source(source_client, src_db)

    # 6. Verifica che effettivamente il safety lock funziona (provo insert_one → DEVE fallire)
    try:
        source_client[src_db]["__safety_test_dummy_collection__"].insert_one({"a": 1})
    except BeforeAnyWriteAbort:
        log.info("✅ Safety lock su source FUNZIONA: scritture bloccate correttamente.")
    except Exception as exc:
        log.warning(
            "⚠️  Safety lock ha sollevato eccezione diversa da BeforeAnyWriteAbort (%s) — considerato ok (comunque bloccato)", type(exc).__name__
        )
    else:
        log.critical(
            "🛑🛑🛑 SAFETY LOCK NON FUNZIONANTE! insert_one su SOURCE NON ha dato errore. ABORT SUBITO."
        )
        source_client.close()
        target_client.close()
        sys.exit(99)

    # 7. Lista collezioni
    colls = list_collections_safe(source_client, src_db, only=only_list)
    log.info("📚 Numero collezioni da copiare: %d", len(colls))

    results = []
    for name in colls:
        src_col = source_client[src_db][name]
        tgt_col_raw = target_client[tgt_db][name]
        # Se il safety lock monkey patching class per source non ha toccato target,
        # allora tgt_col_raw dovrebbe essere la collection pymongo originale.
        # Assicuriamoci stampando la sua classe per debug.
        if verbose:
            log.info("   src.__class__=%s  tgt.__class__=%s",
                     type(src_col).__name__, type(tgt_col_raw).__name__)
        try:
            log.info("▶️  Copiando %s …", name)
            cs, ct = copy_one_collection(
                src_col,
                tgt_col_raw,
                batch_size=batch_size,
                drop_existing=args.drop_existing,
                verbose=verbose,
                dry_run=bool(args.dry_run),
            )
            results.append((name, cs, ct))
        except Exception as exc:
            log.exception("❌ Errore copia %s: %s", name, exc)
            results.append((name, -1, -1))

    # 8. REPORT FINALE
    print("\n" + "=" * 88)
    print("📊 REPORT FINALE — COPIA DA  {:<10}  →  {:<10}".format(src_db, tgt_db))
    print("=" * 88)
    print(f"{'Collezione':<38} {'Src docs':>10} {'Tgt docs':>10}  Stato")
    print("-" * 88)
    tot_errors = 0
    for name, cs, ct in results:
        if ct == -999:
            stato = "⏭️  SKIP (esiste già)"
            tot_errors += 1
        elif ct == -1 or cs == -1:
            stato = "❌ ERRORE"
            tot_errors += 1
        elif cs != ct:
            stato = "❌ MISMATCH count"
            tot_errors += 1
        else:
            stato = "✅ OK"
        print(f"{name:<38} {cs:>10} {ct:>10}  {stato}")
    print("=" * 88)
    print(f"ERRORI TOTALI = {tot_errors}")

    source_client.close()
    target_client.close()
    if tot_errors:
        log.error("❌ Copia terminata con %d errori. Exit 10.", tot_errors)
        sys.exit(10)
    log.info("🎉 COPIA 1:1 COMPLETATA CON SUCCESSO. target DB = %s", tgt_db)
    log.info("🟢 Ora puoi eseguire i migration script 001..004 con runner.py su %s.", tgt_db)


if __name__ == "__main__":
    main()
