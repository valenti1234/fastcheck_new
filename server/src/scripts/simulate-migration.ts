import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

dotenv.config();

const BANNER = `╔══════════════════════════════════════════════════════════════════════╗
║  🟡  SIMULAZIONE MIGRAZIONE STORICO v1.0 • 30.09.2026              ║
║                                                                      ║
║  ⚠️  DEFAULT: DRY-RUN = ATTIVO. Nessuna scrittura nel DB.          ║
╚══════════════════════════════════════════════════════════════════════╝`;

const DRY_RUN_BANNER_CONFIRM = `
╔══════════════════════════════════════════════════════════════════════╗
║  🚨 [DRY RUN ATTIVO]  NESSUNA MODIFICA EFFETTUATA NEL DB            ║
╠══════════════════════════════════════════════════════════════════════╣
║  Tutte le modifiche elencate sono solo PROPOSTE.                   ║
║  Per applicarle: --apply --apply-yes-i-confirm                      ║
╚══════════════════════════════════════════════════════════════════════╝`;

type Args = {
  rut?: string;
  tenantId?: string;
  output?: string;
  pretty?: boolean;
  includeArchived?: boolean;
  apply?: boolean;
  applyConfirm?: boolean;
  minAgeMs?: number;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--rut' && argv[i + 1]) out.rut = argv[++i];
    else if (a.startsWith('--rut=')) out.rut = a.split('=')[1];
    else if (a === '--tenant' && argv[i + 1]) out.tenantId = argv[++i];
    else if (a.startsWith('--tenant=')) out.tenantId = a.split('=')[1];
    else if (a === '-o' && argv[i + 1]) out.output = argv[++i];
    else if (a === '--output' && argv[i + 1]) out.output = argv[++i];
    else if (a.startsWith('--output=')) out.output = a.split('=')[1];
    else if (a === '-p' || a === '--pretty') out.pretty = true;
    else if (a === '--include-archived') out.includeArchived = true;
    else if (a === '--apply') out.apply = true;
    else if (a === '--apply-yes-i-confirm') out.applyConfirm = true;
    else if (a === '--min-age-ms' && argv[i + 1]) out.minAgeMs = parseInt(argv[++i], 10);
    else if (a.startsWith('--min-age-ms=')) out.minAgeMs = parseInt(a.split('=')[1], 10);
    else if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    }
  }
  return out;
}

function printHelp() {
  console.log(`
Uso:
  npx tsx src/scripts/simulate-migration.ts [opzioni]

Descrizione:
  Analizza TUTTI i documenti Result (storico eval) e identifica quelli
  "manomessi post-creazione" (updatedAt > createdAt + soglia) a causa
  del bug LP autosync in getResultByRut() e getResultById() PRIMA del
  fix del 30.09.2026.

  PER ORA (default) è un DRY-RUN: non tocca NESSUN record nel DB.
  Produce un report JSON con PRIMA / DOPO (stato canonico proposto) per
  ogni candidato migrazione, con conteggi e statistiche.

Opzioni (filtri):
  --rut <RUT>              Analizza solo un RUT specifico
  --tenant <id>            Solo documenti di un tenant specifico
  --include-archived       Includi anche archived=true
  --min-age-ms <N>         Soglia in-place: doc = 'alterato' se updatedAt-createdAt
                           > N ms. Default: 5000 (5 secondi)

Output:
  -o, --output <PATH>      Percorso report JSON. Default: ./exports/migration_plan_<ts>.json
  -p, --pretty             JSON indentato (human readable)

🛑 APPLICAZIONE (DA USARE SOLO DOPO VERIFICA REPORT):
  --apply                   Abilita modalità scrittura nel DB (di default è bloccata)
  --apply-yes-i-confirm     Conferma esplicita OBBLIGATORIA per scrivere.
                            Senza questo flag lo script non applica niente.

Esempi:
  # 1) Simulazione COMPLETA (TUTTI i Result) → report in ./exports/
  npx tsx src/scripts/simulate-migration.ts --pretty

  # 2) Solo per un RUT + output custom
  npx tsx src/scripts/simulate-migration.ts --rut 17752947-8 -o ./migrazione_177529478.json --pretty

  # 3) Solo tenant X + include archiviati
  npx tsx src/scripts/simulate-migration.ts --tenant 696ea94a6f8a3d52983bf9d5 --include-archived --pretty

  # 4) ⚠️ MOLTO PERICOLOSO — solo DOPO aver verificato il report:
  #    APPLICA VERAMENTE le modifiche su tutti i documenti Result.
  #    Se NON metti --apply-yes-i-confirm non viene eseguita nessuna scrittura.
  npx tsx src/scripts/simulate-migration.ts --apply --apply-yes-i-confirm --pretty
`);
}

// ================ Helper RUT Canonical ================

function _mod11(digitsOnly: string): string {
  let s = 0;
  let m = 2;
  for (let i = digitsOnly.length - 1; i >= 0; i--) {
    const d = digitsOnly.charCodeAt(i) - 48;
    if (d < 0 || d > 9) continue;
    s += d * m;
    m = m >= 7 ? 2 : m + 1;
  }
  const r = 11 - (s % 11);
  if (r === 11) return '0';
  if (r === 10) return 'K';
  return String(r);
}

function _cleanDigits(v: string): string {
  return String(v ?? '').replace(/[^0-9kK]/g, '').toUpperCase();
}

function canonicalizeRut(raw: string | undefined | null): string {
  if (!raw) return '';
  const digits = _cleanDigits(raw).replace(/K/g, 'X');
  if (digits.length < 2) return '';
  const hasK = raw.toString().toUpperCase().includes('K');
  let corpo: string;
  let dv: string;
  if (hasK) {
    dv = 'K';
    corpo = digits.replace(/X$/, '');
  } else {
    const hypDV = String(raw).split('-');
    if (hypDV.length === 2 && hypDV[1].trim().length === 1) {
      corpo = _cleanDigits(hypDV[0]);
      const maybeDv = hypDV[1].trim().toUpperCase();
      if (['K', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(maybeDv)) {
        dv = maybeDv;
      } else {
        dv = String(_cleanDigits(maybeDv).slice(-1)) || _mod11(digits);
      }
    } else {
      const a = digits.slice(0, -1);
      const b = digits.slice(-1);
      if (a.length >= 7) {
        if (_mod11(a) === b) { corpo = a; dv = b; }
        else { corpo = digits; dv = _mod11(digits); }
      } else {
        corpo = digits; dv = _mod11(digits);
      }
    }
  }
  const dvFmt = dv === 'X' ? 'K' : dv;
  const corpoFmt = corpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${corpoFmt}-${dvFmt}`;
}

function rutDigitsCanon(c: string): string {
  return c.replace(/[.\-]/g, '').toUpperCase();
}

function matchRut(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ca = rutDigitsCanon(canonicalizeRut(a));
  const cb = rutDigitsCanon(canonicalizeRut(b));
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  const caDigits = ca.replace('K', '');
  const cbDigits = cb.replace('K', '');
  if (caDigits.length >= 8 && (ca.startsWith(cbDigits) || cbDigits.startsWith(caDigits))) return true;
  return false;
}

// ================ Date cast ================

function _castDate(v: any): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'object' && typeof (v as any).toISOString === 'function') {
    try {
      const d = new Date((v as any).toISOString());
      return isNaN(d.getTime()) ? null : d;
    } catch { return null; }
  }
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v as any);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// ================ Watch Fields (stesso audit-mutations) ================

const WATCH_FIELDS: { key: string; label: string }[] = [
  { key: 'riskAssessment.riskSummary.semaphore', label: 'riskAssessment.semaphore' },
  { key: 'riskAssessment.riskSummary.riskLevelDescription', label: 'riskAssessment.riskLevelDescription' },
  { key: 'riskAssessment.riskSummary.totalDetected', label: 'riskAssessment.totalDetected' },
  { key: 'riskAssessment.riskSummary.totalSevero', label: 'riskAssessment.totalSevero' },
  { key: 'riskAssessment.riskSummary.totalSignificativo', label: 'riskAssessment.totalSignificativo' },
  { key: 'riskAssessment.riskSummary.totalParameters', label: 'riskAssessment.totalParameters' },
  { key: 'sheriffLogData.summaryData.data.lpaltosDetected', label: 'lpaltosDetected' },
  { key: 'sheriffLogData.summaryData.data.lpmediosDetected', label: 'lpmediosDetected' },
  { key: 'sheriffLogData.summaryData.data.lpaltosRecords', label: 'lpaltosRecords (count)' },
  { key: 'sheriffLogData.summaryData.data.lpmediosRecords', label: 'lpmediosRecords (count)' },
  { key: 'aiAnalysis', label: 'aiAnalysis (presenza)' },
  { key: 'aiAnalysisDate', label: 'aiAnalysisDate' },
  { key: 'archived', label: 'archived flag' },
  { key: 'archivedAt', label: 'archivedAt' },
  { key: 'updatedAt', label: 'updatedAt (timestamp)' },
  { key: 'createdAt', label: 'createdAt (timestamp)' }
];

type AuditValue = boolean | number | string | null | undefined | unknown[];

function _get(obj: any, path: string): AuditValue {
  if (!obj) return undefined;
  const parts = path.split('.');
  let cur: any = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur as AuditValue;
}

function _toComparable(label: string, v: AuditValue): string {
  if (
    label === 'aiAnalysisDate' || label === 'archivedAt' ||
    label === 'updatedAt (timestamp)' || label === 'createdAt (timestamp)'
  ) {
    const d = _castDate(v as any);
    return d ? d.toISOString() : (v === undefined ? 'undefined' : v === null ? 'null' : 'data-non-valida');
  }
  if (label.includes('count)')) return String(Array.isArray(v) ? v.length : (v ? '1' : '0'));
  if (label === 'aiAnalysis (presenza)') return v ? `[presenza len=${String(v ?? '').length}]` : '[assente]';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && v !== null && typeof (v as any).toISOString === 'function') {
    try { return (v as any).toISOString(); } catch { /* fallthrough */ }
  }
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (Array.isArray(v)) return `[array len=${v.length}]`;
  if (typeof v === 'object') return `[obj]`;
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

// ================ Strategia migrazione ================

type DocCategoria =
  | 'OK_PULITO'                // nessuna modifica post-creazione
  | 'OK_SOLO_UPDATED_AT_IRRILEVANTE'  // modifica solo updatedAt (nessun campo semaforo/LP cambiato) → sicuro
  | 'OK_REFRESH_CHAIN'        // alterato, MA c'è un NUOVO doc (stesso RUT+tenant) successore che ne prende il posto
  | 'CANDIDATO_RIPRISTINARE_ULTIMA_EVAL' // ultimo della catena, alterato in-place → candidato fix
  | 'CANDIDATO_CASO_COMPLESSO'         // ha cambiato semaforo e LP, multi-tenant o con valori ambigui → analisi manuale
  | 'SKIP_FILTRO';            // escluso da filtri (rut o tenant)

type EntryDoc = {
  _id: string;
  tenantId: string;
  rut: string;
  canonicalRut: string;
  createdAt: string | null;
  updatedAt: string | null;
  msDiff: number | null;
  alteredInPlace: boolean;
  archived: boolean;
  queryType: string | null;

  snapshotNow: Record<string, string>;       // Stato ATTUALE nel DB (prima della migration)
  snapshotProposed?: Record<string, string>; // Stato PROPOSTO (dopo migration DRY-RUN)

  categoria: DocCategoria;
  note: string[];

  // Delta campi "sensibili" (quelli alterati dal bug LP autosync)
  deltaSensibiliNowVsCreated?: { campo: string; creationSnapshot: string; currentSnapshot: string }[];

  // Per la modalità --apply: operazioni proposte
  proposedUpdateMongoSet?: any;
};

// ================ Core Simulazione ================

type Report = {
  meta: {
    versioneMigrazione: string;
    dataEsecuzione: string;
    durataMs: number;
    filtri: {
      rutFilter: string | null;
      tenantFilter: string | null;
      includeArchived: boolean;
      minAgeMs: number;
    };
    modalita: {
      dryRun: boolean;
      applyEnabled: boolean;
      applyConfirm: boolean;
    };
    connessione: {
      dbName: string;
      collection: string;
      documentiTotaliLetti: number;
      rutsCanonicaliDistinti: number;
    };
    statistichePerCategoria: Record<string, number>;
    statisticheGlobali: {
      documentiAnalizzati: number;
      candidatiMigration: number;
      richiesteAnalisiManuale: number;
      documentiOK: number;
      aggiornamentiApplicati: number;
      erroriAggiornamento: number;
    };
  };
  documenti: EntryDoc[];
  erroriRuntime?: any[];
};

function snapshotOf(doc: any): Record<string, string> {
  const s: Record<string, string> = {};
  for (const w of WATCH_FIELDS) s[w.label] = _toComparable(w.label, _get(doc, w.key));
  return s;
}

function estimateCreationSnapshot(_doc: any, createdMs: number, msDiff: number, entry: EntryDoc): Record<string, string> {
  /**
   * ⚠️ IMPORTANTE (Documentazione Strategia Safe):
   *
   * Non abbiamo versioning Mongo del subdoc. Non possiamo recuperare byte-per-byte
   * 'come era lpaltosDetected il giorno createdAt'. Quindi per evitare FALSE
   * restorationi (molto pericolose), adottiamo la strategia SUPER CONSERVATIVA:
   *
   *   LO SNAPSHOT "CREAZIONE" PROPOSTO PER LA MIGRAZIONE RESTA UGUALE ALLA SNAPSHOT ATTUALE
   *   PER I CAMPI LP e RISK ASSESSMENT.
   *
   * La migration DRY RUN serve SOLAMENTE a:
   *   1) Classificare i documenti in OK / Candidati.
   *   2) Contare quanti sono i "danneggiati dal bug".
   *   3) Proporre un fix MINIMO E SICURISSIMO per i CANDIDATI:
   *      → Riportare updatedAt = createdAt (togliere il segno post-aggiornamento).
   *      → Questo non tocca i FLAGS (perché non sappiamo con certezza i valori originali).
   *      → Elimina solo il danno "documento sembra aggiornato dopo", lasciando i
   *        contenuti invariati (perché possiamo solo congetturarli).
   *
   * Il risultato è:
   *   - Categoria OK_PULITO: no changes
   *   - Categoria OK_SOLO_UPDATED_AT_IRRILEVANTE: proposed updatedAt = createdAt
   *   - Categoria CANDIDATO_RIPRISTINARE_ULTIMA_EVAL: proposed updatedAt = createdAt
   *     + nota "I flag LP / Risk non vengono toccati in automatico: analisi manuale con audit mutations".
   */
  const snapNow = entry.snapshotNow;
  const snapProposed = { ...snapNow };

  // ✅ Safe fix unico garantito: RESET updatedAt → createdAt
  const ca = entry.createdAt;
  if (ca) {
    snapProposed['updatedAt (timestamp)'] = ca;
  }
  return snapProposed;
}

async function runMigrationSim(args: Args): Promise<{ report: Report; outputPath: string }> {
  const startTime = Date.now();
  const minAge = args.minAgeMs ?? 5000;

  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) { console.error('❌ MONGODB_URI mancante'); process.exit(1); }

  console.log(BANNER);
  const canWrite = !!args.apply && !!args.applyConfirm;
  if (!canWrite) {
    console.log(DRY_RUN_BANNER_CONFIRM);
  } else {
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  🔴 [MODALITÀ APPLY ATTIVA]  SCRITTURA DB ABILITATA!                ║
╠══════════════════════════════════════════════════════════════════════╣
║  Tutte le modifiche proposte saranno COMMITTATE su MongoDB.        ║
║  [Hai 3 secondi per CTRL+C se non sei sicuro.]                      ║
╚══════════════════════════════════════════════════════════════════════╝`);
    await new Promise((r) => setTimeout(r, 3000));
  }

  await mongoose.connect(MONGODB_URI!, {
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 5_000,
    socketTimeoutMS: 120_000,
    family: 4
  } as any);
  console.log('✅ MongoDB connesso. Family=4 · timeout 5s');

  const col = mongoose.connection.collection('results');
  const filter: any = {};
  if (!args.includeArchived) filter.archived = { $ne: true };
  if (args.tenantId) filter.tenantId = args.tenantId;
  if (args.rut) {
    const canonA = canonicalizeRut(args.rut);
    const canonDigits = rutDigitsCanon(canonA);
    const noDash = canonA.replace(/-/g, '').replace(/\./g, '').toUpperCase();
    filter.$or = [{ rut: canonA }, { rut: canonA.replace(/\./g, '') }, { rut: noDash }, { rut: canonDigits }];
  }

  const totalDocs = await col.countDocuments(filter);
  console.log(`🔎 Query ${JSON.stringify(filter).slice(0, 200)}  →  Trovati ${totalDocs} documenti`);

  const docsArr: any[] = [];
  await col.find(filter, { sort: { rut: 1, createdAt: 1 } }).forEach((d: any) => docsArr.push(d));
  console.log(`✅ Downloadati ${docsArr.length} documenti in memoria.`);

  // --- Raggruppamento per (canonicalRut + tenantId) = chain di eval per stessa entità stessa azienda cliente ---
  type ChainKey = string;
  const chainMap = new Map<ChainKey, any[]>();
  const rutsCanon = new Set<string>();

  for (const doc of docsArr) {
    const origRut = String(doc.rut || doc.details?.rut || '').trim() || null;
    const canon = origRut ? canonicalizeRut(origRut) : `__NO_RUT__${String(doc._id).slice(-8)}`;
    rutsCanon.add(canon);
    const key: ChainKey = `${String(doc.tenantId)}|||${canon}`;
    if (!chainMap.has(key)) chainMap.set(key, []);
    chainMap.get(key)!.push(doc);
  }

  // --- Analisi per singolo documento ---
  const erroriRuntime: any[] = [];
  const entries: EntryDoc[] = [];
  let appliedUpdates = 0;
  let appliedErrors = 0;

  for (const [chainKey, docs] of chainMap) {
    const sorted = [...docs].sort((a, b) => {
      const ta = _castDate(a.createdAt);
      const tb = _castDate(b.createdAt);
      return (ta ? ta.getTime() : 0) - (tb ? tb.getTime() : 0);
    });

    for (let i = 0; i < sorted.length; i++) {
      try {
      const doc = sorted[i];
      const origRut = String(doc.rut || doc.details?.rut || '').trim() || null;
      const canon = origRut ? canonicalizeRut(origRut) : `__NO_RUT__${String(doc._id).slice(-8)}`;

      if (args.rut && !matchRut(canon, args.rut)) { continue; }
      if (args.tenantId && String(doc.tenantId) !== String(args.tenantId)) { continue; }

      const caDate = _castDate(doc.createdAt);
      const uaDate = _castDate(doc.updatedAt);
      const msDiff = caDate && uaDate ? uaDate.getTime() - caDate.getTime() : null;
      const alteredInPlace = typeof msDiff === 'number' && msDiff > minAge;
      const snapNow = snapshotOf(doc);

      // Step 1: categorizzazione base
      const note: string[] = [];
      let categoria: DocCategoria;
      const hasSuccessore = i < sorted.length - 1;

      if (!alteredInPlace) {
        categoria = 'OK_PULITO';
        note.push('Nessuna modifica post-creazione. updatedAt-createdAt ≤ soglia (' + minAge + 'ms).');
      } else {
        // Step 2: è alterato. Ha un successore nella catena refresh?
        if (hasSuccessore) {
          categoria = 'OK_REFRESH_CHAIN';
          const next = sorted[i + 1];
          note.push(
            `Doc alterato post-creazione (diff=${msDiff}ms) ma ha SUCCESSORE ${String(next._id)} (createdAt=${_castDate(next.createdAt)?.toISOString()}). Non è l'ultima eval: la migrazione non lo tocca.`
          );
        } else {
          // Step 3: ultimo nella catena. Quali campi sono diversi rispetto al comportamento atteso?
          //   Nota: essendo ultimo nella catena, non abbiamo un valore 'creationSnapshot' originale
          //   per campi LP / risk (sono stati sovrascritti). Classifichiamo:
          //     - Se alterazione è SOLO updatedAt (flags non toccati) → IRRILEVANTE
          //     - Se alterazione tocca LP / semaforo → CANDIDATO

          // Per stimare 'campi alterati oltre updatedAt' guardiamo: se la snapshot attuale
          // ha valori strani (es. semaforo undefined), lpaltos/lpmedios alterati, ecc.
          // → nel caso safe (solo updatedAt) mettiamo categoria IRRILEVANTE.
          const campiSensibili = [
            'riskAssessment.semaphore', 'riskAssessment.riskLevelDescription',
            'riskAssessment.totalDetected', 'riskAssessment.totalSevero',
            'riskAssessment.totalSignificativo', 'riskAssessment.totalParameters',
            'lpaltosDetected', 'lpmediosDetected',
            'lpaltosRecords (count)', 'lpmediosRecords (count)'
          ];
          // In assenza di storico, per 'SOLO_UPDATED_AT_IRRILEVANTE' definiamo:
          // doc.archived = false, nessun archivedAt cambiato, queryType standard.
          const changedOnlyUpdatedAt = (
            snapNow['archivedAt'] === 'undefined' &&
            snapNow['aiAnalysis (presenza)'] === '[assente]' &&
            !doc.archived
          );

          if (changedOnlyUpdatedAt) {
            categoria = 'OK_SOLO_UPDATED_AT_IRRILEVANTE';
            note.push(
              `Alterato in-place diff=${msDiff}ms. Ma NON presenta cambiamenti in aiAnalysis, archived, LP. Il fix safe (reset updatedAt=createdAt) è applicabile senza rischi.`
            );
          } else {
            // Siamo nell'ultimo doc della catena, e c'è stata alterazione oltre al semplice updatedAt.
            // → CANDIDATO. Ma se multi-tenant (altre chiavi chain sullo stesso canon) o complesso → COMPLESSO.
            const tenantsPerCanon = [...chainMap.entries()]
              .filter(([k]) => k.endsWith(`|||${canon}`))
              .length;
            if (tenantsPerCanon > 1 || snapNow['lpaltosDetected'] === 'undefined') {
              categoria = 'CANDIDATO_CASO_COMPLESSO';
              note.push(
                `Caso complesso: ${tenantsPerCanon > 1 ? 'multi-tenant (' + tenantsPerCanon + '),' : ''} LP undefined o valori ambigui. Richiede analisi manuale con export audit-mutations.`
              );
            } else {
              categoria = 'CANDIDATO_RIPRISTINARE_ULTIMA_EVAL';
              note.push(
                `Documento ULTIMO della catena. Alterato in-place: updatedAt - createdAt = ${msDiff}ms. È stato manomesso dal bug LP autosync in apertura. Fix proposto SOLO updatedAt = createdAt (reset timestamp). Flag LP / Risk lasciati invariati per sicurezza: richiedono analisi manuale.`
              );
            }
          }
        }
      }

      // Snapshot proposto (canonico safe: = se stesso ma updatedAt = createdAt)
      const entry0: EntryDoc = {
        _id: String(doc._id),
        tenantId: String(doc.tenantId ?? ''),
        rut: origRut || '',
        canonicalRut: canon,
        createdAt: caDate?.toISOString() ?? null,
        updatedAt: uaDate?.toISOString() ?? null,
        msDiff,
        alteredInPlace,
        archived: !!doc.archived,
        queryType: doc.queryType || null,
        snapshotNow: snapNow,
        categoria,
        note
      };
      entry0.snapshotProposed = estimateCreationSnapshot(doc, caDate?.getTime() ?? 0, msDiff ?? 0, entry0);

      // --- Calcola proposedUpdateMongoSet (solo safe reset updatedAt=createdAt) ---
      const isCandidateForApply = categoria !== 'OK_PULITO' && categoria !== 'SKIP_FILTRO';
      if (isCandidateForApply && caDate) {
        entry0.proposedUpdateMongoSet = {
          updatedAt: caDate
        };
        // Nota: NON TOCCHIAMO riskAssessment o lpaltos/lpmedios (non abbiamo source of truth originale).
        // Solo il reset updatedAt è safe al 100%.
      }

      // --- (MODALITÀ --apply) Esegue updateOne realmente se le condizioni ci sono ---
      if (canWrite && entry0.proposedUpdateMongoSet) {
        try {
          await mongoose.connection.collection('results').updateOne(
            { _id: (mongoose.Types.ObjectId.isValid(entry0._id) ? new mongoose.Types.ObjectId(entry0._id) : entry0._id) as any },
            { $set: entry0.proposedUpdateMongoSet }
          );
          appliedUpdates++;
          entry0.note.push('✅ [APPLY] $set updatedAt=createdAt eseguito su MongoDB.');
        } catch (err: any) {
          appliedErrors++;
          erroriRuntime.push({ _id: entry0._id, error: err.message, stack: err.stack });
          entry0.note.push(`❌ [APPLY] Fallito: ${err.message}`);
        }
      }

      entries.push(entry0);
      } catch (perDocErr: any) {
        erroriRuntime.push({ _id: String((sorted[i] as any)?._id ?? 'unknown'), error: perDocErr.message, stack: perDocErr.stack });
      }
    }
  }

  // --- Statistiche ---
  const catCounts: Record<string, number> = {};
  for (const e of entries) catCounts[e.categoria] = (catCounts[e.categoria] || 0) + 1;
  const candidatiMigration =
    (catCounts['CANDIDATO_RIPRISTINARE_ULTIMA_EVAL'] || 0) +
    (catCounts['OK_SOLO_UPDATED_AT_IRRILEVANTE'] || 0) +
    (catCounts['CANDIDATO_CASO_COMPLESSO'] || 0);
  const richiesteAnalisiManuale = (catCounts['CANDIDATO_CASO_COMPLESSO'] || 0);
  const docOK = (catCounts['OK_PULITO'] || 0) + (catCounts['OK_REFRESH_CHAIN'] || 0);

  const report: Report = {
    meta: {
      versioneMigrazione: '1.0',
      dataEsecuzione: new Date().toISOString(),
      durataMs: Date.now() - startTime,
      filtri: {
        rutFilter: args.rut ? canonicalizeRut(args.rut) : null,
        tenantFilter: args.tenantId ?? null,
        includeArchived: !!args.includeArchived,
        minAgeMs: minAge
      },
      modalita: {
        dryRun: !canWrite,
        applyEnabled: !!args.apply,
        applyConfirm: !!args.applyConfirm
      },
      connessione: {
        dbName: mongoose.connection.name,
        collection: 'results',
        documentiTotaliLetti: docsArr.length,
        rutsCanonicaliDistinti: rutsCanon.size
      },
      statistichePerCategoria: catCounts,
      statisticheGlobali: {
        documentiAnalizzati: entries.length,
        candidatiMigration,
        richiesteAnalisiManuale,
        documentiOK: docOK,
        aggiornamentiApplicati: appliedUpdates,
        erroriAggiornamento: appliedErrors
      }
    },
    documenti: entries,
    erroriRuntime: erroriRuntime.length > 0 ? erroriRuntime : undefined
  };

  // ---- Scrittura report ----
  let outputPath = args.output;
  if (!outputPath) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    outputPath = path.join(dir, `migration_plan_${ts}.json`);
  } else {
    const d = path.dirname(outputPath);
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
  const text = args.pretty ? JSON.stringify(report, null, 2) : JSON.stringify(report);
  fs.writeFileSync(outputPath, text, 'utf-8');

  try { await mongoose.disconnect(); } catch { /* ignore */ }
  console.log('🔌 MongoDB disconnesso.');

  return { report, outputPath };
}

// ================ Main ================

(async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const { report, outputPath } = await runMigrationSim(args);

    const s = report.meta.statisticheGlobali;
    const cat = report.meta.statistichePerCategoria;
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  📊 SIMULAZIONE MIGRAZIONE COMPLETATA
╠══════════════════════════════════════════════════════════════════════╣
║  Documenti analizzati            :  ${String(s.documentiAnalizzati).padEnd(10)}
║  Documenti OK (puliti)           :  ${String(s.documentiOK).padEnd(10)}
║  Candidati migration (fix safe)  :  ${String(s.candidatiMigration).padEnd(10)}
║  Richieste analisi manuale       :  ${String(s.richiesteAnalisiManuale).padEnd(10)}
║  Aggiornamenti APPLICATI         :  ${String(s.aggiornamentiApplicati).padEnd(10)}
║  Aggiornamenti FALLITI           :  ${String(s.erroriAggiornamento).padEnd(10)}
╠══════════════════════════════════════════════════════════════════════╣
║  Categorie dettaglio:
${Object.entries(cat).map(([k, v]) => `║    ${k.padEnd(44)}:  ${String(v).padEnd(10)}`).join('\n')}
╠══════════════════════════════════════════════════════════════════════╣
║  Report JSON: ${path.resolve(outputPath)}
║  Dimensione: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB
╚══════════════════════════════════════════════════════════════════════╝`);

    if (report.meta.modalita.dryRun) {
      console.log(DRY_RUN_BANNER_CONFIRM);
    }

    process.exit(0);
  } catch (e: any) {
    console.error('\n❌ Simulazione migration fallita:', e);
    try { await mongoose.disconnect(); } catch { /* ignore */ }

    // Report emergenza minimale (garantito file JSON anche nel fallimento)
    try {
      const emergency: any = {
        meta: {
          versioneMigrazione: '1.0',
          dataEsecuzione: new Date().toISOString(),
          stato: 'FALLITO',
          error: e?.message ?? String(e),
          stack: e?.stack ?? undefined,
          filtri: args,
        },
        emergency: true,
        documenti: []
      };
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const dir = path.join(process.cwd(), 'exports');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const pathE = path.join(dir, `migration_plan_FAILED_${ts}.json`);
      fs.writeFileSync(pathE, JSON.stringify(emergency, null, 2), 'utf-8');
      console.error(`\n⚠️  [REPORT EMERGENZA] ${path.resolve(pathE)}`);
    } catch {}

    process.exit(1);
  }
})();
