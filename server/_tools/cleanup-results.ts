import dotenv from 'dotenv';
import mongoose from 'mongoose';
import readline from 'readline';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || null;
const tenantId = process.env.TENANT_ID || '68f636029bc7f8592752d21a';
const days = parseInt(process.env.DAYS || '14', 10);
const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const DRY_RUN = (process.env.DRY_RUN || 'false').toLowerCase() === 'true';
const AUTO_CONFIRM = (process.env.AUTO_CONFIRM || 'false').toLowerCase() === 'true';
const SAMPLE_LIMIT = parseInt(process.env.SAMPLE_LIMIT || '5', 10);

function toObjectIdFromDate(d: Date) {
  const seconds = Math.floor(d.getTime() / 1000);
  const hexSeconds = seconds.toString(16).padStart(8, '0');
  return new mongoose.Types.ObjectId(hexSeconds + '0000000000000000');
}

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    const cutoffId = toObjectIdFromDate(cutoff);
    const query = { tenantId, _id: { $lte: cutoffId } };
    const collection = mongoose.connection.db.collection('results');
    const totalForTenant = await collection.countDocuments({ tenantId });
    const count = await collection.countDocuments(query);
    const oldest = await collection
      .find({ tenantId }, { projection: { _id: 1, tenantId: 1, createdAt: 1, rut: 1 } })
      .sort({ _id: 1 })
      .limit(1)
      .toArray();
    const sampleRaw = await collection
      .find(query, { projection: { _id: 1, tenantId: 1, createdAt: 1, rut: 1 } })
      .sort({ createdAt: -1 })
      .limit(SAMPLE_LIMIT)
      .toArray();
    const fromId = (id: any) => new Date(parseInt(id.toString().substring(0, 8), 16) * 1000);
    const sample = sampleRaw.map((d: any) => ({ ...d, createdAtFromId: fromId(d._id) }));
    const oldestDoc = oldest[0] ? { ...oldest[0], createdAtFromId: fromId(oldest[0]._id) } : null;
    console.log(
      JSON.stringify({ tenantId, totalForTenant, cutoff: cutoff.toISOString(), cutoffId: cutoffId.toHexString(), count, oldest: oldestDoc, sample })
    );
    if (count === 0) return;
    if (DRY_RUN) return;
    let proceed = AUTO_CONFIRM;
    if (!proceed && process.stdin.isTTY) {
      proceed = await new Promise<boolean>((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(`Delete ${count} records? Type YES to confirm: `, (answer) => {
          rl.close();
          resolve(answer.trim().toLowerCase() === 'yes');
        });
      });
    }
    if (!proceed) {
      console.log(JSON.stringify({ aborted: true, reason: 'Not confirmed' }));
      return;
    }
    const result = await collection.deleteMany(query);
    console.log(JSON.stringify({ tenantId, cutoff: cutoff.toISOString(), deletedCount: result.deletedCount }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();