import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

dotenv.config();

const BANNER = `╔══════════════════════════════════════════════════════════════╗
║  🟢 EXPORT RUT CONSULTATIONS v1.0 • 30.09.2026              ║
╠══════════════════════════════════════════════════════════════╣`;

function printBanner() {
  console.log(BANNER);
}

type Args = {
  rut: string;
  output?: string;
  light?: boolean;
  includeArchived?: boolean;
  pretty?: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { rut: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--rut' && argv[i + 1]) { out.rut = argv[++i]; continue; }
    if (a.startsWith('--rut=')) { out.rut = a.split('=')[1]; continue; }
    if (a === '-o' && argv[i + 1]) { out.output = argv[++i]; continue; }
    if (a === '--output' && argv[i + 1]) { out.output = argv[++i]; continue; }
    if (a.startsWith('--output=')) { out.output = a.split('=')[1]; continue; }
    if (a === '--light') { out.light = true; continue; }
    if (a === '--include-archived') { out.includeArchived = true; continue; }
    if (a === '--pretty' || a === '-p') { out.pretty = true; continue; }
    if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  if (!out.rut) {
    console.error('\n❌ ERRORE: parametro --rut obbligatorio mancante.\n');
    printHelp();
    process.exit(1);
  }
  return out;
}

function printHelp() {
  console.log(`Uso:
  npx tsx src/scripts/export-rut-consultations.ts --rut <RUT> [opzioni]

Opzioni:
  --rut <RUT>              RUT da cercare (qualsiasi formato: 17752947-8 / 17.752.947-8 / 177529478)
  -o, --output <PATH>      Percorso file JSON di output. Default: ./exports/rut_<canonical>_<timestamp>.json
  --light                  Modalità leggera: esclude i campi pesanti (sheriffLogData, details, riskAssessment, responseData...)
  --include-archived       Includi anche risultati archiviati (results.archived=true)
  -p, --pretty             Stampa JSON formattato (2 spazi indent)
  -h, --help               Mostra questo aiuto

Collezioni interrogate (cross-tenant, nessun filtro tenantId):
  1) results            → FastCheck completi (Result)
  2) consulta_history   → Log chiamate API (ConsultaHistory: individual + massive)
  3) evaluationresults  → Risultati job di valutazione (EvaluationResult)

Esempi:
  npx tsx src/scripts/export-rut-consultations.ts --rut 17752947-8 --pretty
  npx tsx src/scripts/export-rut-consultations.ts --rut 17.752.947-8 --light -o ./dump_177529478.json
  npx tsx src/scripts/export-rut-consultations.ts --rut 177529478 --include-archived --pretty
`);
}

function _mod11(digitsOnly: string): string {
  let s = 0;
  let m = 2;
  for (let i = digitsOnly.length - 1; i >= 0; i--) {
    const d = digitsOnly.charCodeAt(i) - 48;
    if (d < 0 || d > 9) continue;
    s += d * m;
    m = m >= 7 ? 2 : m + 1;
  }
  const rem = 11 - (s % 11);
  if (rem === 11) return '0';
  if (rem === 10) return 'K';
  return String(rem);
}

function canonicalizeChileanRut(input: string | number | null | undefined): string {
  if (input == null) return '0-0';
  const str = String(input);
  const hasDash = /-/.test(str);
  const clean = str.replace(/[^0-9Kk-]/g, '').toUpperCase();
  let body = '';
  let dv = '';

  if (hasDash) {
    const lastDashIdx = clean.lastIndexOf('-');
    const left = clean.substring(0, lastDashIdx).replace(/[^0-9]/g, '');
    const right = clean.substring(lastDashIdx + 1).replace(/[^0-9K]/g, '');
    if (right.length >= 1) {
      const candidateDv = right.charAt(0);
      const strippedLeft = left.replace(/^0+/, '') || '0';
      const expected = _mod11(strippedLeft);
      body = strippedLeft;
      dv = expected === candidateDv ? candidateDv : expected;
    } else {
      const strippedLeft = left.replace(/^0+/, '') || '0';
      body = strippedLeft;
      dv = _mod11(body);
    }
  } else {
    const dgts = clean.replace(/[^0-9K]/g, '');
    if (dgts.length === 0) return '0-0';
    if (dgts.length < 7) {
      body = dgts.replace(/^0+/, '') || '0';
      dv = _mod11(body);
    } else if (dgts.length === 7) {
      body = dgts;
      dv = _mod11(body);
    } else {
      let dg = dgts;
      while (dg.length > 9 && /^0/.test(dg)) dg = dg.substring(1);
      if (dg.length >= 8 && dg.length <= 9) {
        const hBody = dg.slice(0, -1);
        const hDv = dg.charAt(dg.length - 1);
        const validH = /^[0-9]+$/.test(hBody) && _mod11(hBody) === hDv;
        if (validH) {
          body = hBody.replace(/^0+/, '') || hBody;
          dv = hDv;
        } else {
          const hBodyB = /^[0-9]+$/.test(dg) ? dg : dg.replace(/[^0-9]/g, '');
          const b2 = hBodyB.replace(/^0+/, '') || '0';
          body = b2;
          dv = _mod11(b2);
        }
      } else {
        const hBody = dg.slice(0, -1).replace(/[^0-9]/g, '');
        const hDv = dg.charAt(dg.length - 1);
        if (_mod11(hBody) === hDv) {
          body = hBody.replace(/^0+/, '') || hBody;
          dv = hDv;
        } else {
          body = dg.replace(/^0+/, '') || '0';
          dv = _mod11(body);
        }
      }
    }
  }
  if (!body) body = '0';
  if (!dv) dv = _mod11(body);
  body = body.replace(/^0+/, '') || '0';
  return `${body}-${dv}`;
}

const normRut = (s: any): string => String(s ?? '').replace(/[^0-9Kk]/g, '').toLowerCase();
const digitsOnly = (s: any): string => String(s ?? '').replace(/[^0-9]/g, '');

function buildRutMatchers(rutInput: string) {
  const canonical = canonicalizeChileanRut(rutInput);
  const norm = normRut(rutInput);
  const dig = digitsOnly(rutInput);
  const bodyCanon = canonical.split('-')[0];
  const dvCanon = canonical.split('-')[1] ?? '';

  return {
    canonical,
    norm,
    dig,
    bodyCanon,
    dvCanon,
    matchAny: (value: any): boolean => {
      if (value == null) return false;
      const vStr = String(value);
      if (!vStr.trim()) return false;
      const vNorm = normRut(vStr);
      if (vNorm && norm && vNorm === norm) return true;
      const vCanon = canonicalizeChileanRut(vStr);
      if (vCanon === canonical) return true;
      const vDig = digitsOnly(vStr);
      if (vDig && dig && vDig === dig) return true;
      if (bodyCanon && vDig && vDig.length >= 7 && dig.length >= 7) {
        if (vDig.startsWith(bodyCanon) || dig.startsWith(bodyCanon)) return true;
        if (vDig.includes(bodyCanon) || dig.includes(vDig.slice(0, Math.min(8, vDig.length)))) return true;
      }
      return false;
    },
  };
}

const MONGOOSE_OPTS: mongoose.ConnectOptions = {
  serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SEL_TIMEOUT_MS ?? 5_000),
  connectTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS ?? 5_000),
  socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS ?? 60_000),
  heartbeatFrequencyMS: Number(process.env.MONGO_HEARTBEAT_MS ?? 3_000),
  family: 4,
  readPreference: 'primaryPreferred',
  ...(process.env.MONGO_AUTH_SOURCE ? { authSource: process.env.MONGO_AUTH_SOURCE } : {}),
};

const HEAVY_RESULT_FIELDS = [
  'sheriffLogData', 'details', 'riskAssessment', 'vistaDuxiter', 'duxiterFilter',
  'duxiterRiskData', 'duxiterRiskList', 'duxiterMD', 'markdownResume', 'newSummaryData',
  'aiAnalysis', 'companyGeneralInfo',
];

const HEAVY_HISTORY_FIELDS = ['responseData', 'requestData'];

async function connectDB(MONGODB_URI: string) {
  const safeUriPrint = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
  console.log(`║  [connectDB] URI       : ${safeUriPrint.slice(0, 70).padEnd(54, ' ')} ║`);
  console.log(`║  [connectDB] family    : 4 (IPv4 forzato)                     ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝\n`);
  console.time('⏱️  Tempo totale connessione MongoDB');
  await mongoose.connect(MONGODB_URI, MONGOOSE_OPTS);
  const { host, port, name, readyState } = mongoose.connection;
  console.log(`✅ CONNESSIONE RIUSCITA: mongodb://${host}:${port}/${name} · readyState=${readyState}`);
  console.timeEnd('⏱️  Tempo totale connessione MongoDB');
  console.log('');
}

function stripFields(doc: any, heavyFields: string[]): any {
  if (!doc || typeof doc !== 'object') return doc;
  const out: any = {};
  for (const k of Object.keys(doc)) {
    const fieldVal = doc[k];
    if (heavyFields.includes(k)) {
      if (fieldVal === undefined || fieldVal === null) continue;
      out[k] = `[OMESSO – campi pesanti disabilitati con --light | type=${typeof fieldVal}` +
        (Array.isArray(fieldVal) ? `(${fieldVal.length})` : '') + ']';
    } else {
      out[k] = fieldVal;
    }
  }
  return out;
}

async function fetchResultsCollection(match: ReturnType<typeof buildRutMatchers>, opts: Args) {
  const db = mongoose.connection.db;
  const col = db.collection('results');

  const docsRaw = await col.find({}, { allowDiskUse: true }).toArray();
  const docs = docsRaw.filter((d) => {
    if (!opts.includeArchived && d.archived === true) return false;
    return match.matchAny(d.rut);
  });

  const ids = docs.map((d) => ({ _id: String(d._id) }));
  const cleaned = opts.light ? docs.map((d) => stripFields(d, HEAVY_RESULT_FIELDS)) : docs;
  return {
    count: cleaned.length,
    tenants: Array.from(new Set(docs.map((d) => String(d.tenantId ?? 'UNKNOWN')))),
    byQueryType: cleaned.reduce((acc: any, d: any) => {
      const qt = d.queryType || 'primary';
      acc[qt] = (acc[qt] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    ids,
    docs: cleaned.map((d: any) => JSON.parse(JSON.stringify(d))),
  };
}

async function fetchConsultaHistoryCollection(match: ReturnType<typeof buildRutMatchers>, opts: Args) {
  const db = mongoose.connection.db;
  let col;
  try {
    col = db.collection('consulta_history');
    await col.estimatedDocumentCount({ maxTimeMS: 2000 });
  } catch {
    col = null;
  }
  if (!col) return { count: 0, tenants: [], byConsultaType: {}, ids: [], docs: [] };

  const docsRaw = await col.find({}, { allowDiskUse: true }).toArray();
  const docs = docsRaw.filter((d: any) => {
    if (match.matchAny(d.rut)) return true;
    if (Array.isArray(d.ruts)) {
      for (const r of d.ruts) if (match.matchAny(r)) return true;
    }
    if (typeof d?.metadata?.rut === 'string' && match.matchAny(d.metadata.rut)) return true;
    if (typeof d?.requestData?.rut === 'string' && match.matchAny(d.requestData.rut)) return true;
    if (Array.isArray(d?.requestData?.ruts)) {
      for (const r of d.requestData.ruts) if (match.matchAny(r)) return true;
    }
    return false;
  });

  const ids = docs.map((d: any) => ({ _id: String(d._id) }));
  const cleaned = opts.light ? docs.map((d) => stripFields(d, HEAVY_HISTORY_FIELDS)) : docs;
  return {
    count: cleaned.length,
    tenants: Array.from(new Set(docs.map((d: any) => String(d.tenantId ?? 'UNKNOWN')))),
    byConsultaType: cleaned.reduce((acc: any, d: any) => {
      const ct = d.consultaType || 'individual';
      acc[ct] = (acc[ct] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    ids,
    docs: cleaned.map((d: any) => JSON.parse(JSON.stringify(d))),
  };
}

async function fetchEvaluationResults(match: ReturnType<typeof buildRutMatchers>, _opts: Args) {
  const db = mongoose.connection.db;
  let col;
  try {
    col = db.collection('evaluationresults');
    await col.estimatedDocumentCount({ maxTimeMS: 2000 });
  } catch {
    col = null;
  }
  if (!col) return { count: 0, tenants: [], byStatus: {}, ids: [], docs: [] };

  const docsRaw = await col.find({}, { allowDiskUse: true }).toArray();
  const docs = docsRaw.filter((d: any) => match.matchAny(d.rut));

  const ids = docs.map((d: any) => ({ _id: String(d._id) }));
  return {
    count: docs.length,
    tenants: Array.from(new Set(docs.map((d: any) => String(d.tenantId ?? 'UNKNOWN')))),
    byStatus: docs.reduce((acc: any, d: any) => {
      const s = d.status || 'unknown';
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    ids,
    docs: docs.map((d: any) => JSON.parse(JSON.stringify(d))),
  };
}

function humanDate(iso: string | number | Date): string {
  if (!iso) return 'N/A';
  try {
    const d = new Date(iso);
    return d.toISOString();
  } catch {
    return 'N/A';
  }
}

async function run() {
  printBanner();
  const opts = parseArgs(process.argv.slice(2));
  const matchers = buildRutMatchers(opts.rut);
  console.log(`║  RUT input         : ${(opts.rut || '').padEnd(47, ' ')} ║`);
  console.log(`║  RUT canonicalizzato: ${matchers.canonical.padEnd(46, ' ')} ║`);
  console.log(`║  RUT norm (dig+dv) : ${matchers.norm.padEnd(46, ' ')} ║`);
  console.log(`║  Modalità          : ${(opts.light ? 'LIGHT (campi pesanti omessi)' : 'COMPLETO').padEnd(47, ' ')} ║`);
  console.log(`║  Includi archiviati: ${(opts.includeArchived ? 'SI' : 'NO').padEnd(47, ' ')} ║`);
  const timestamp = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0];
  const outputPath = opts.output || path.resolve(process.cwd(), 'exports', `rut_${matchers.canonical.replace('-', '')}_${timestamp}.json`);
  console.log(`║  Output file       : ${(outputPath.length > 46 ? '...' + outputPath.slice(-43) : outputPath).padEnd(46, ' ')} ║`);
  console.log(`╠══════════════════════════════════════════════════════════════╝`);

  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('\n❌ ERRORE: MONGODB_URI non trovato nel file .env');
    process.exit(1);
  }

  try {
    await connectDB(MONGODB_URI);
  } catch (err) {
    console.error('\n❌ ERRORE connessione MongoDB:', (err as any)?.message ?? String(err));
    process.exit(1);
  }

  try {
    console.log('\n🔎 [1/3] Ricerca nella collezione «results» (FastCheck completi)...');
    console.time('⏱️  results');
    const results = await fetchResultsCollection(matchers, opts);
    console.timeEnd('⏱️  results');
    console.log(`   → Trovati ${results.count} documenti · tenant coinvolti=${results.tenants.length} · byQueryType=${JSON.stringify(results.byQueryType)}`);

    console.log('\n🔎 [2/3] Ricerca nella collezione «consulta_history» (log chiamate API)...');
    console.time('⏱️  consulta_history');
    const history = await fetchConsultaHistoryCollection(matchers, opts);
    console.timeEnd('⏱️  consulta_history');
    console.log(`   → Trovati ${history.count} documenti · tenant coinvolti=${history.tenants.length} · byConsultaType=${JSON.stringify(history.byConsultaType)}`);

    console.log('\n🔎 [3/3] Ricerca nella collezione «evaluationresults» (job valutazione)...');
    console.time('⏱️  evaluationresults');
    const evaluations = await fetchEvaluationResults(matchers, opts);
    console.timeEnd('⏱️  evaluationresults');
    console.log(`   → Trovati ${evaluations.count} documenti · tenant coinvolti=${evaluations.tenants.length} · byStatus=${JSON.stringify(evaluations.byStatus)}`);

    const totalDocs = results.count + history.count + evaluations.count;
    const allTenants = Array.from(new Set([...results.tenants, ...history.tenants, ...evaluations.tenants])).sort();

    const payload = {
      meta: {
        generatedAt: humanDate(new Date()),
        generator: 'export-rut-consultations v1.0 (30.09.2026)',
        rutInput: opts.rut,
        rutCanonical: matchers.canonical,
        rutNorm: matchers.norm,
        rutBodyDigits: matchers.bodyCanon,
        rutDv: matchers.dvCanon,
        options: {
          light: !!opts.light,
          includeArchived: !!opts.includeArchived,
          pretty: !!opts.pretty,
        },
        summary: {
          totalDocuments: totalDocs,
          distinctTenants: allTenants,
          distinctTenantsCount: allTenants.length,
          counts: {
            results: results.count,
            consultaHistory: history.count,
            evaluationResults: evaluations.count,
          },
        },
      },
      results: {
        summary: { count: results.count, byQueryType: results.byQueryType, tenants: results.tenants },
        ids: results.ids,
        docs: results.docs,
      },
      consultaHistory: {
        summary: { count: history.count, byConsultaType: history.byConsultaType, tenants: history.tenants },
        ids: history.ids,
        docs: history.docs,
      },
      evaluationResults: {
        summary: { count: evaluations.count, byStatus: evaluations.byStatus, tenants: evaluations.tenants },
        ids: evaluations.ids,
        docs: evaluations.docs,
      },
    };

    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const jsonStr = opts.pretty
      ? JSON.stringify(payload, null, 2)
      : JSON.stringify(payload);
    fs.writeFileSync(outputPath, jsonStr, 'utf-8');
    const sizeBytes = fs.statSync(outputPath).size;
    const sizeKB = (sizeBytes / 1024).toFixed(1);
    const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);

    console.log(`
═════════════════════════════════════════════════════════════════
  ✅ EXPORT COMPLETATO
     ├─ RUT canonico           : ${matchers.canonical}
     ├─ Documenti totali       : ${totalDocs}
     │   ├─ results            : ${results.count}
     │   ├─ consulta_history   : ${history.count}
     │   └─ evaluationresults  : ${evaluations.count}
     ├─ Tenant distinti        : ${allTenants.length}
     ├─ Output file            : ${outputPath}
     └─ Dimensione             : ${sizeKB} KB  (${sizeMB} MB)
═════════════════════════════════════════════════════════════════
`);
  } catch (err) {
    console.error('\n❌ ERRORE durante l\'export:', (err as any)?.stack ?? (err as any)?.message ?? String(err));
    process.exitCode = 1;
  } finally {
    try { await mongoose.disconnect(); } catch { /* noop */ }
    console.log('🔌 Disconnessione MongoDB effettuata.');
  }
}

run();
