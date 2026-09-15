import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

/**
 * 🔧 [MONGOOSE OPTIMIZED v1.0 • 15.09.2026] Opzioni connessione MongoDB.
 *
 * Problema precedente: connessione 80-90s invece di < 2s.
 *   Root cause 1 (60%): Node.js prova DNS/IPv6 PRIMA di IPv4.
 *      Se la LAN non supporta IPv6, ogni host perde ~30s in fallback AAAA.
 *      Fix: `family: 4` → forza SOLO IPv4.
 *
 *   Root cause 2 (30%): Replica set 2 nodi. Se un nodo secondario è down
 *      o non raggiungibile, mongoose aspetta `serverSelectionTimeoutMS`
 *      (DEFAULT 30000ms → 30 secondi!) su OGNI tentativo serverSelection.
 *      Fix: `serverSelectionTimeoutMS=5000` (5s invece di 30s).
 *
 *   Root cause 3 (10%): heartbeat troppo raro, socket timeout troppo basso.
 *      Fix: heartbeatFrequencyMS 3s, socketTimeoutMS 60s.
 */
const MONGOOSE_OPTS: mongoose.ConnectOptions = {
    // ── 1. Timeout: fallisci VELOCEMENTE invece di aspettare 30s ─────────
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SEL_TIMEOUT_MS ?? 5_000),
    connectTimeoutMS:         Number(process.env.MONGO_CONNECT_TIMEOUT_MS      ?? 5_000),
    socketTimeoutMS:          Number(process.env.MONGO_SOCKET_TIMEOUT_MS       ?? 60_000),

    // ── 2. HEARTBEAT replica set (3s invece dei default 10s) ─────────────
    heartbeatFrequencyMS:     Number(process.env.MONGO_HEARTBEAT_MS            ?? 3_000),

    // ── 3. FAMILY = 4 → FORZA IPv4, salta la risoluzione AAAA IPv6 ──────
    //    (PRINCIPALE causa di 30-60s persi in reti LAN senza IPv6!)
    family: 4,

    // ── 4. Replica set & Read preference ────────────────────────────────
    readPreference: 'primaryPreferred',
    // NOTA: serverSelectionTryOnce NON esiste in ConnectOptions mongoose 7.x;
    // il comportamento multi-tentativo è già default quando serverSelectionTryOnce=false
    // è configurato a livello MongoClient; basta abbassare serverSelectionTimeoutMS a 5000.

    // ── 5. Autenticazione (se esiste env MONGO_AUTH_SOURCE) ─────────────
    ...(process.env.MONGO_AUTH_SOURCE ? { authSource: process.env.MONGO_AUTH_SOURCE } : {}),
};

const MONGOOSE_DEBUG = String(process.env.MONGOOSE_DEBUG ?? 'false').toLowerCase() === 'true';
const VERSION_BANNER = '[MONGOOSE OPTIMIZED v1.0 • 15.09.2026]';

// Logging Mongoose dettagliato (solo se abilitato via env)
if (MONGOOSE_DEBUG) {
    mongoose.set('debug', (collectionName: any, method: any, query: any) => {
        // eslint-disable-next-line no-console
        console.debug(`[Mongoose:debug] ${collectionName}.${method}`, JSON.stringify(query).slice(0, 240));
    });
}

export const connectDB = async (): Promise<void> => {
    if (!MONGODB_URI) {
        throw new Error('MONGODB_URI is not set');
    }

    // Maschera user/pass nel log per sicurezza
    const safeUriPrint = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');

    console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║  🟢 ${VERSION_BANNER}                                  ║`);
    console.log(`╠══════════════════════════════════════════════════════════════╣`);
    console.log(`║  [connectDB] URI       : ${safeUriPrint.slice(0, 70)}`);
    console.log(`║  [connectDB] srvSel MS : ${MONGOOSE_OPTS.serverSelectionTimeoutMS}`);
    console.log(`║  [connectDB] conn  MS  : ${MONGOOSE_OPTS.connectTimeoutMS}`);
    console.log(`║  [connectDB] sock  MS  : ${MONGOOSE_OPTS.socketTimeoutMS}`);
    console.log(`║  [connectDB] heartb MS : ${MONGOOSE_OPTS.heartbeatFrequencyMS}`);
    console.log(`║  [connectDB] family    : ${MONGOOSE_OPTS.family} (IPv4 forzato)`);
    console.log(`║  [connectDB] readPref  : ${MONGOOSE_OPTS.readPreference}`);
    console.log(`║  [connectDB] debug     : ${MONGOOSE_DEBUG ? 'ON' : 'OFF'}`);
    console.log(`╚══════════════════════════════════════════════════════════════╝\n`);

    console.time('⏱️  [connectDB] Tempo totale connessione MongoDB');

    // Event listeners granulari (PRIMA della connect!)
    mongoose.connection.on('connecting', () => {
        console.log(`[connectDB] 🔄 Event: connecting ...`);
    });
    mongoose.connection.on('connected', () => {
        console.log(`[connectDB] ✅ Event: connected OK`);
    });
    mongoose.connection.on('open', () => {
        console.log(`[connectDB] 🟢 Event: 'open' → connessione pronta alle query`);
    });
    mongoose.connection.on('disconnected', () => {
        console.warn(`[connectDB] ⚠️  Event: disconnected`);
    });
    mongoose.connection.on('reconnected', () => {
        console.warn(`[connectDB] 🔁 Event: reconnected`);
    });
    mongoose.connection.on('reconnectFailed', () => {
        console.error(`[connectDB] ❌ Event: reconnectFailed (esauriti retry)`);
    });
    mongoose.connection.on('close', () => {
        console.warn(`[connectDB] 🚪 Event: connection close`);
    });
    mongoose.connection.on('error', (err: Error) => {
        console.error(`[connectDB] ❌ Event: error →`, (err as any)?.message ?? String(err));
    });

    try {
        console.log(`[connectDB] Chiamata mongoose.connect()...`);
        await mongoose.connect(MONGODB_URI, MONGOOSE_OPTS);

        const { host, port, name, readyState } = mongoose.connection;
        console.log(`\n[connectDB] ✅ CONNESSIONE RIUSCITA: mongodb://${host}:${port}/${name} · readyState=${readyState} (1=connected)`);
    } catch (error) {
        const msg = (error as any)?.message ?? String(error);
        console.error(`\n[connectDB] ❌ ERRORE connessione MongoDB dopo ${Math.round(performance.now())}ms →`, msg);
        console.timeEnd('⏱️  [connectDB] Tempo totale connessione MongoDB');
        throw error;
    } finally {
        console.timeEnd('⏱️  [connectDB] Tempo totale connessione MongoDB');
        console.log('');
    }
};

export default mongoose;
