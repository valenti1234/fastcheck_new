import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

/**
 * 🔧 [MONGOOSE OPTIMIZED v1.0 • 15.09.2026] Opzioni connessione MongoDB.
 * Copia 1:1 di db.ts (stesse identiche ottimizzazioni).
 * File usato SOLO da scripts/create-superadmin.ts e script CLI isolati.
 * Per entrypoint principale vedi: server/src/config/db.ts
 */
const MONGOOSE_OPTS: mongoose.ConnectOptions = {
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SEL_TIMEOUT_MS ?? 5_000),
    connectTimeoutMS:         Number(process.env.MONGO_CONNECT_TIMEOUT_MS      ?? 5_000),
    socketTimeoutMS:          Number(process.env.MONGO_SOCKET_TIMEOUT_MS       ?? 60_000),
    heartbeatFrequencyMS:     Number(process.env.MONGO_HEARTBEAT_MS            ?? 3_000),
    family: 4,               // ← PRINCIPALE: forza IPv4, salta AAAA/IPv6 (salva 30-60s!)
    readPreference: 'primaryPreferred',
    ...(process.env.MONGO_AUTH_SOURCE ? { authSource: process.env.MONGO_AUTH_SOURCE } : {}),
};

const VERSION_BANNER = '[MONGOOSE OPTIMIZED v1.0 • 15.09.2026]';

export const connectDB = async () => {
    try {
        if (!MONGODB_URI) {
            throw new Error('MONGODB_URI is not set');
        }
        const safeUriPrint = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
        console.log(`[database:connectDB] 🟢 ${VERSION_BANNER} · family=${MONGOOSE_OPTS.family} · srvSelMS=${MONGOOSE_OPTS.serverSelectionTimeoutMS} · URI=${safeUriPrint.slice(0, 90)}`);
        console.time('⏱️  [database:connectDB] Tempo totale');
        await mongoose.connect(MONGODB_URI, MONGOOSE_OPTS);
        const { host, port, name, readyState } = mongoose.connection;
        console.log(`MongoDB connected successfully → mongodb://${host}:${port}/${name} · readyState=${readyState}`);
        console.timeEnd('⏱️  [database:connectDB] Tempo totale');

        mongoose.connection.on('disconnected', () => {
            console.warn('MongoDB disconnected');
        });

        mongoose.connection.on('error', (err) => {
            console.error('MongoDB error:', (err as any)?.message ?? String(err));
        });
    } catch (error) {
        console.error('MongoDB connection error:', (error as any)?.message ?? String(error));
        console.timeEnd && console.timeEnd('⏱️  [database:connectDB] Tempo totale');
        process.exit(1);
    }
};

export default mongoose;
