import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

dotenv.config();

const BANNER = `╔══════════════════════════════════════════════════════════════╗
║  🟡 AUDIT MUTAZIONI CONSULTAS v1.0 • 30.09.2026             ║
╠══════════════════════════════════════════════════════════════╣`;

type Args = {
  rut?: string;
  output?: string;
  includeArchived?: boolean;
  minChanges?: number;
  pretty?: boolean;
  light?: boolean;
  fullDocs?: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--rut' && argv[i + 1]) { out.rut = argv[++i]; continue; }
    if (a.startsWith('--rut=')) { out.rut = a.split('=')[1]; continue; }
    if (a === '-o' && argv[i + 1]) { out.output = argv[++i]; continue; }
    if (a === '--output' && argv[i + 1]) { out.output = argv[++i]; continue; }
    if (a.startsWith('--output=')) { out.output = a.split('=')[1]; continue; }
    if (a === '--include-archived') { out.includeArchived = true; continue; }
    if (a === '--min-changes' && argv[i + 1]) { out.minChanges = parseInt(argv[++i], 10); continue; }
    if (a.startsWith('--min-changes=')) { out.minChanges = parseInt(a.split('=')[1], 10); continue; }
    if (a === '-p' || a === '--pretty') { out.pretty = true; continue; }
    if (a === '--light') { out.light = true; continue; }
    if (a === '--full-docs') { out.fullDocs = true; continue; }
    if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    }
  }
  return out;
}

function printHelp() {
  console.log(`Uso:
  npx tsx src/scripts/audit-rut-mutations.ts [opzioni]

Descrizione:
  Scansiona TUTTO il DB (collection: results) per TUTTI i tenant.
  Per ogni RUT costruisce la linea del tempo di TUTTE le revisioni (ogni
  documento salvato con quel RUT = 1 snapshot temporale). Calcola i delta
  (cosa è cambiato tra snapshot N vs N+1) e scrive il report completo JSON.

  Nota: questo strumento non usa versioning documentale (Mongoose non tiene
  un history log nativo). Ogni diverso documento per lo stesso RUT in
  archivio (non archiviato oppure archiviato con --include-archived) viene
  considerato una 'revisione' (es. REFRESH = archivia il vecchio + crea nuovo).
  Inoltre, per ogni singolo documento, le differenze tra createdAt vs updatedAt
  (se updatedAt > createdAt) vengono riportate come 'mutazioni in-place su
  stesso documento' (effetto del bug di LP autosync PRIMA del fix 30.09.2026).

Opzioni:
  --rut <RUT>              Analizza SOLO un RUT specifico (qualsiasi formato)
  -o, --output <PATH>      Percorso file output JSON. Default: ./exports/audit_mutations_<ts>.json
  --include-archived       Includi anche risultati con archived=true
  --min-changes <N>        Exporta solo i RUT con >= N mutazioni/delta tracciate
  -p, --pretty             JSON indentato (human-readable)
  --light                  Non include l'array 'docs[]' dei documenti Result completi
                           (solo summary + revisions)
  --full-docs              Include nel JSON l'intero serializzato di ogni Result
                           (usare con cautela: dimensione file ~ GB per DB grande)
  -h, --help               Mostra questo aiuto

Esempi:
  # Audit completo TUTTO il DB, report formattato
  npx tsx src/scripts/audit-rut-mutations.ts --pretty --min-changes 1

  # Solo RUT specifico + doc completi
  npx tsx src/scripts/audit-rut-mutations.ts --rut 17752947-8 --pretty --full-docs -o ./rut_audit.json

  # Solo quelli con >2 mutazioni, senza archiviati (default)
  npx tsx src/scripts/audit-rut-mutations.ts --min-changes 3 --light
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
  // Caso con trattino: ultimo char X oppure 0-9 dopo trattino
  const hasK = raw.toString().toUpperCase().includes('K');
  let corpo: string;
  let dv: string;
  if (hasK) {
    dv = 'K';
    corpo = digits.replace(/X$/, '');
  } else {
    // Prova 2 interpretazioni:
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
        corpo = digits;
        dv = _mod11(digits);
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

// ================ Campi sotto audit ================
// Definiamo i campi "sentinella" che sappiamo essere stati alterati in-place
// prima del fix (LP autosync + riskRecalc). Aggiungere altri se serve.

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

function _toComparable(label: string, v: AuditValue): string {
  // Cast preventivo per campi data noti: BSON/string → ISO string
  if (
    label === 'aiAnalysisDate' ||
    label === 'archivedAt' ||
    label === 'updatedAt (timestamp)' ||
    label === 'createdAt (timestamp)'
  ) {
    const d = _castDate(v as any);
    return d ? d.toISOString() : (v === undefined ? 'undefined' : v === null ? 'null' : 'data-non-valida');
  }
  if (label.includes('count)')) {
    return String(Array.isArray(v) ? v.length : (v ? '1' : '0'));
  }
  if (label === 'aiAnalysis (presenza)') {
    return v ? `[presenza len=${String(v ?? '').length}]` : '[assente]';
  }
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

type RevisioneDoc = {
  _id: string;
  tenantId: string;
  createdAt: string | null;
  updatedAt: string | null;
  updatedAfterCreated: boolean;
  inPlaceMsDiff: number | null;
  queryType: string | null;
  archived: boolean;
  snapshot: Record<string, string>;
};

type DeltaCampo = {
  campo: string;
  prima: string;
  dopo: string;
};

type DeltaRevisione = {
  tipo: 'in-place-same-doc' | 'new-doc-version';
  _idPrima: string;
  _idDopo: string;
  createdAtPrima: string | null;
  createdAtDopo: string | null;
  data: string;
  delta: DeltaCampo[];
};

type EntryRut = {
  rut: string;
  canonicalRut: string;
  tenantIds: string[];
  revisioni: RevisioneDoc[];
  delta: DeltaRevisione[];
  mutazioni: MutazioneFlat[];   // ← nuovo: versione PIATTA, per leggibilità
  stats: {
    totalDocumenti: number;
    documentiInPlaceAggiornati: number;
    deltaCampiTotali: number;
    documentiArchiviati: number;
    tenantDistinti: number;
    campiVariati: Record<string, number>; // ← nuovo: conteggio per label
  };
  docs?: any[];
};

type MutazioneFlat = {
  data: string;
  tipo: 'in-place-same-doc' | 'new-doc-version';
  _idPrima: string;
  _idDopo: string;
  createdAtPrima: string | null;
  createdAtDopo: string | null;
  campo: string;
  prima: string;
  dopo: string;
};

// ================ Core Audit ================

type SnapshotDoc = Pick<mongoose.Document<unknown>, '_id'> & {
  rut?: string;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  archived?: boolean;
  queryType?: string;
  sheriffLogData?: any;
  riskAssessment?: any;
  aiAnalysis?: any;
  aiAnalysisDate?: Date;
  archivedAt?: Date;
  [k: string]: any;
};

function _castDate(v: any): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'object' && typeof v.toISOString === 'function') {
    try {
      const d = new Date(v.toISOString());
      return isNaN(d.getTime()) ? null : d;
    } catch { return null; }
  }
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v as any);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function buildRevisione(doc: SnapshotDoc): RevisioneDoc {
  const snapshot: Record<string, string> = {};
  for (const w of WATCH_FIELDS) {
    snapshot[w.label] = _toComparable(w.label, _get(doc, w.key));
  }
  const caDate = _castDate(doc.createdAt);
  const uaDate = _castDate(doc.updatedAt);
  const ca = caDate ? caDate.toISOString() : null;
  const ua = uaDate ? uaDate.toISOString() : null;
  const diffMs = caDate && uaDate ? uaDate.getTime() - caDate.getTime() : null;
  return {
    _id: String(doc._id),
    tenantId: String(doc.tenantId ?? ''),
    createdAt: ca,
    updatedAt: ua,
    updatedAfterCreated: typeof diffMs === 'number' ? diffMs > 5_000 : false,
    inPlaceMsDiff: diffMs,
    queryType: doc.queryType || null,
    archived: !!doc.archived,
    snapshot
  };
}

function buildDeltaBetween(prima: RevisioneDoc, dopo: RevisioneDoc): DeltaCampo[] {
  const out: DeltaCampo[] = [];
  for (const w of WATCH_FIELDS) {
    const a = prima.snapshot[w.label];
    const b = dopo.snapshot[w.label];
    if (a !== b) out.push({ campo: w.label, prima: a, dopo: b });
  }
  return out;
}

// ================ Scrittura report (condivisa success/failure) ================

type ReportParziale = {
  meta: any;
  ruts: any[];
  erroriRuntime?: any[];
};

function _resolveOutputPath(custom?: string): string {
  let outputPath = custom;
  if (!outputPath) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    outputPath = path.join(dir, `audit_rut_mutations_${ts}.json`);
  } else {
    const d = path.dirname(outputPath);
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
  return outputPath;
}

function writeReportSync(report: ReportParziale, pretty?: boolean, customPath?: string): string {
  const outputPath = _resolveOutputPath(customPath);
  const text = pretty ? JSON.stringify(report, null, 2) : JSON.stringify(report);
  fs.writeFileSync(outputPath, text, { encoding: 'utf-8' });
  return outputPath;
}

type ResultAudit = { report: ReportParziale; outputPath: string; countRut: number; totalMutations: number };

async function runAudit(args: Args): Promise<ResultAudit> {
  const startTime = Date.now();
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('\n❌ MONGODB_URI non trovata nel file .env\n');
    process.exit(1);
  }
  console.log(BANNER);
  console.log('MongoDB connect… (IPv4 forced · family=4 · timeout 5s)');

  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 5_000,
    socketTimeoutMS: 60_000,
    family: 4
  } as any);
  console.log('✅ Connesso MongoDB');

  const col = mongoose.connection.collection('results');

  // ---- Costruisci query ----
  const filter: any = {};
  if (!args.includeArchived) {
    filter.archived = { $ne: true };
  }
  if (args.rut) {
    const canonA = canonicalizeRut(args.rut);
    const canonDigits = rutDigitsCanon(canonA);
    const noDash = canonA.replace(/-/g, '').replace(/\./g, '').toUpperCase();
    filter.$or = [
      { rut: canonA },
      { rut: canonA.replace(/\./g, '') },
      { rut: noDash },
      { rut: canonDigits }
    ];
    // Fallback: regex match corretto
  }

  console.log(`🔎 Lettura collection: results — filter ${JSON.stringify(filter).slice(0, 150)}`);
  const totalDocsCount = await col.countDocuments(filter);
  console.log(`📦 Documenti totali corrispondenti: ${totalDocsCount}`);

  // Leggiamo in batch per non saturare RAM (ma nel caso senza --rut potrebbe essere grande)
  const allDocs: SnapshotDoc[] = [];
  const cursor = col.find(filter, {
    sort: { rut: 1, createdAt: 1 }
  });
  await cursor.forEach((d: any) => {
    allDocs.push(d as SnapshotDoc);
  });
  console.log(`✅ Scaricati ${allDocs.length} documenti in memoria in ${Date.now() - startTime}ms`);

  // ---- Raggruppa per RUT canonicale ----
  const mappaRut = new Map<string, { docs: SnapshotDoc[]; origRuts: Set<string> }>();
  for (const doc of allDocs) {
    const origRut = String(doc.rut || doc.details?.rut || '').trim() || null;
    const canon = origRut ? canonicalizeRut(origRut) : `__SIN_RUT__${String(doc._id).slice(-8)}`;
    let entry = mappaRut.get(canon);
    if (!entry) {
      entry = { docs: [], origRuts: new Set() };
      mappaRut.set(canon, entry);
    }
    entry.docs.push(doc);
    if (origRut) entry.origRuts.add(origRut);
  }

  // Filtro per --rut specifico anche quando match per prefisso
  let entriesRut = Array.from(mappaRut.entries()).map(([canon, data]) => ({ canon, data }));
  if (args.rut) {
    entriesRut = entriesRut.filter(({ canon }) => matchRut(canon, args.rut!));
  }
  console.log(`🧮 RUT distinti (canonicalizzati): ${entriesRut.length}`);

  // ---- Per ogni RUT: costruisci revisioni e delta ----
  const perRut: EntryRut[] = [];
  let globalDeltas = 0;
  const erroriRuntime: any[] = [];
  let rutsOK = 0;
  let rutsFailed = 0;

  for (const { canon, data } of entriesRut) {
    try {
    // Ordina per CREATEDAT cosi linea del tempo corretta
    const docsSorted = [...data.docs].sort((a, b) => {
      const ta = _castDate(a.createdAt);
      const tb = _castDate(b.createdAt);
      return (ta ? ta.getTime() : 0) - (tb ? tb.getTime() : 0);
    });
    const tenantIds = Array.from(new Set(docsSorted.map((d) => String(d.tenantId ?? '')).filter(Boolean)));

    const revisioni: RevisioneDoc[] = docsSorted.map((d) => buildRevisione(d));
    const delta: DeltaRevisione[] = [];

    // 1) MUTAZIONI IN-PLACE: sullo stesso doc createdAt vs updatedAt (stesso _id)
    for (const rev of revisioni) {
      if (rev.updatedAfterCreated) {
        delta.push({
          tipo: 'in-place-same-doc',
          _idPrima: rev._id,
          _idDopo: rev._id,
          createdAtPrima: rev.createdAt,
          createdAtDopo: rev.updatedAt,
          data: rev.updatedAt || new Date().toISOString(),
          delta: [
            {
              campo: '[STESSO DOC] updatedAt dopo createdAt',
              prima: `${rev.createdAt} (createdAt)`,
              dopo: `${rev.updatedAt} — diff ms = ${rev.inPlaceMsDiff} (${Math.round((rev.inPlaceMsDiff ?? 0) / 60000)}min)`
            }
          ]
        });
      }
    }

    // 2) MUTAZIONI TRA VERSIONI DOCUMENTO (doc diverso stesso RUT)
    for (let i = 1; i < revisioni.length; i++) {
      const prima = revisioni[i - 1];
      const dopo = revisioni[i];
      const deltaCampi = buildDeltaBetween(prima, dopo);
      if (deltaCampi.length === 0) continue;
      delta.push({
        tipo: 'new-doc-version',
        _idPrima: prima._id,
        _idDopo: dopo._id,
        createdAtPrima: prima.createdAt,
        createdAtDopo: dopo.createdAt,
        data: dopo.createdAt || dopo.updatedAt || new Date().toISOString(),
        delta: deltaCampi
      });
      globalDeltas += deltaCampi.length;
    }

    const deltaCampiTotali = delta.reduce((s, d) => s + d.delta.length, 0);
    const documentiInPlaceAggiornati = revisioni.filter((r) => r.updatedAfterCreated).length;

    const countMutazioni = delta.length;
    if (typeof args.minChanges === 'number' && countMutazioni < args.minChanges) {
      rutsOK++;
      continue;
    }

    // ---- Flatten: `mutazioni[]` lista piatta per ogni cambiamento di campo ----
    const mutazioni: MutazioneFlat[] = [];
    const campiVariati: Record<string, number> = {};
    for (const d of delta) {
      for (const c of d.delta) {
        mutazioni.push({
          data: d.data,
          tipo: d.tipo,
          _idPrima: d._idPrima,
          _idDopo: d._idDopo,
          createdAtPrima: d.createdAtPrima,
          createdAtDopo: d.createdAtDopo,
          campo: c.campo,
          prima: c.prima,
          dopo: c.dopo
        });
        campiVariati[c.campo] = (campiVariati[c.campo] ?? 0) + 1;
      }
    }

    const entry: EntryRut = {
      rut: data.origRuts.values().next().value ?? canon,
      canonicalRut: canon,
      tenantIds,
      revisioni,
      delta,
      mutazioni,
      stats: {
        totalDocumenti: revisioni.length,
        documentiInPlaceAggiornati,
        deltaCampiTotali,
        documentiArchiviati: revisioni.filter((r) => r.archived).length,
        tenantDistinti: tenantIds.length,
        campiVariati
      }
    };

    if (args.fullDocs) {
      entry.docs = docsSorted.map((d) => {
        try {
          return JSON.parse(JSON.stringify(d));
        } catch { return {}; }
      });
    }

    perRut.push(entry);
    rutsOK++;
    } catch (errPerRut: any) {
      rutsFailed++;
      erroriRuntime.push({
        canonicalRut: canon,
        error: errPerRut?.message ?? String(errPerRut),
        stack: errPerRut?.stack ?? undefined,
        documentiCoinvolti: data?.docs?.length ?? 0,
        ids: (data?.docs ?? []).map((d: any) => String(d._id)).slice(0, 20)
      });
    }
  }

  console.log(`✅ Elaborazione RUT completata. OK=${rutsOK}  •  Falliti=${rutsFailed}  •  Delta totali=${globalDeltas}`);

  // ---- Statistiche globali ----
  const countRuts = perRut.length;
  const rutsConInPlace = perRut.filter((e) => e.stats.documentiInPlaceAggiornati > 0).length;
  const rutsConDocVersion = perRut.filter((e) => e.delta.some((d) => d.tipo === 'new-doc-version')).length;
  const totInPlaceEvents = perRut.reduce((s, e) => s + e.delta.filter((d) => d.tipo === 'in-place-same-doc').length, 0);
  const totDocVersionEvents = perRut.reduce((s, e) => s + e.delta.filter((d) => d.tipo === 'new-doc-version').length, 0);

  // ---- Conteggio MUTAZIONI PER CAMPO (globale, aggregato tutti i RUT) ----
  const conteggioMutazioniPerCampo: Record<string, number> = {};
  for (const entry of perRut) {
    for (const [campo, quanti] of Object.entries(entry.stats.campiVariati)) {
      conteggioMutazioniPerCampo[campo] = (conteggioMutazioniPerCampo[campo] ?? 0) + quanti;
    }
  }
  const topCampiGlobali = Object.entries(conteggioMutazioniPerCampo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([campo, n]) => ({ campo, n }));

  // ---- Top per numero di mutazioni (casi sospetti) ----
  const topSospetti = [...perRut]
    .sort((a, b) => b.stats.deltaCampiTotali - a.stats.deltaCampiTotali)
    .slice(0, 20)
    .map((e) => {
      const topCampiQuestoRut = Object.entries(e.stats.campiVariati)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([campo, n]) => `${campo}×${n}`)
        .join(', ');
      return {
        rut: e.canonicalRut,
        tenantIds: e.tenantIds,
        totalRevisioni: e.stats.totalDocumenti,
        deltaCampiTotali: e.stats.deltaCampiTotali,
        inPlaceCount: e.stats.documentiInPlaceAggiornati,
        top3CampiVariati: topCampiQuestoRut || '(nessuno)'
      };
    });

  const report: ReportParziale = {
    meta: {
      versioneAudit: '1.0',
      dataAudit: new Date().toISOString(),
      durataMs: Date.now() - startTime,
      filtriApplicati: {
        filterRut: args.rut ? canonicalizeRut(args.rut) : null,
        includeArchived: !!args.includeArchived,
        minChanges: args.minChanges ?? null,
        light: !!args.light,
        fullDocs: !!args.fullDocs
      },
      connessione: {
        dbName: mongoose.connection.name,
        collectionAnalizzata: 'results',
        documentiTotaliLetti: allDocs.length,
        documentiFiltratiPrimaDiMinChanges: mappaRut.size
      },
      statisticheGlobali: {
        rutUniciAnalizzati: countRuts,
        rutsOK,
        rutsFailed,
        rutsConAlmenoUnaInPlaceUpdate: rutsConInPlace,
        rutsConAlmenoUnaRevisioneDocDiverso: rutsConDocVersion,
        eventiInPlaceDocumento: totInPlaceEvents,
        eventiNuovaVersioneDocumento: totDocVersionEvents,
        totDeltasCampi: globalDeltas,
        conteggioMutazioniPerCampo,
        topCampiGlobali: topCampiGlobali
      },
      watchFields: WATCH_FIELDS.map((f) => f.label),
      topSospetti: topSospetti
    },
    ruts: args.light
      ? perRut.map((e) => ({
          rut: e.rut,
          canonicalRut: e.canonicalRut,
          tenantIds: e.tenantIds,
          stats: e.stats,
          revisioni: e.revisioni,
          delta: e.delta,
          mutazioni: e.mutazioni
        }))
      : perRut
  };

  // Aggiungo eventuali errori per-RUT al report JSON
  if (erroriRuntime.length > 0) {
    (report as any).erroriRuntime = erroriRuntime;
  }

  // ---- Scrittura file JSON GARANTITA ----
  const outputPath = writeReportSync(report, args.pretty, args.output);

  await mongoose.disconnect();
  console.log('🔌 Disconnesso MongoDB');

  return {
    report,
    outputPath,
    countRut: countRuts,
    totalMutations: globalDeltas
  };
}

// ================ Main ================

(async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const res = await runAudit(args);
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  ✅ AUDIT COMPLETATO
╠══════════════════════════════════════════════════════════════════════╣
║  RUT analizzati (canonicalizzati) :  ${String(res.countRut).padEnd(10)}
║  Totale delta cambiamenti tracciati:  ${String(res.totalMutations).padEnd(10)}
║  File output JSON                  :  ${path.resolve(res.outputPath)}
║  Dimensione file                   :  ${(fs.statSync(res.outputPath).size / 1024).toFixed(2)} KB
╚══════════════════════════════════════════════════════════════════════╝`);

    const sospetti = res.report.meta.topSospetti;
    if (sospetti && sospetti.length > 0) {
      console.log('\n🔝 Top 5 RUT con più mutazioni (sospetti pre-fix LP autosync):');
      console.table(sospetti.slice(0, 5));
    }
    process.exit(0);
  } catch (e: any) {
    console.error('\n❌ Audit fallito:', e?.message ?? String(e));
    try { await mongoose.disconnect(); } catch { /* ignore */ }

    // ✅ GARANZIA: scriviamo SEMPRE un file JSON, anche in caso di errore catastrofico.
    // Report minimale ma valido = contiene meta, fallimento, stack, ruts processati finora (se disponibili).
    const emergencyReport: any = {
      meta: {
        versioneAudit: '1.0',
        dataAudit: new Date().toISOString(),
        stato: 'FALLITO',
        error: e?.message ?? String(e),
        stack: e?.stack ?? undefined,
        filtriApplicati: {
          filterRut: args.rut ? canonicalizeRut(args.rut) : null,
          includeArchived: !!args.includeArchived,
          minChanges: args.minChanges ?? null,
          light: !!args.light,
          fullDocs: !!args.fullDocs
        }
      },
      ruts: [],
      emergency: true
    };
    let emergencyPath = '[unknown]';
    try {
      emergencyPath = writeReportSync(emergencyReport, true, args.output);
      const kb = (fs.statSync(emergencyPath).size / 1024).toFixed(2);
      console.error(`\n⚠️  [REPORT DI EMERGENZA] File JSON generato comunque: ${path.resolve(emergencyPath)} (${kb} KB)`);
    } catch (err2: any) {
      console.error(`\n🚨 [IMPOSSIBILE SCRIVERE FILE] Errore scrittura report emergenza:`, err2?.message ?? err2);
    }
    process.exit(1);
  }
})();
