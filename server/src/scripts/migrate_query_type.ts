
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Result } from '../models/Result';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function migrate() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    console.log('Starting migration...');
    
    // Set 'derived_socio_pep' for PEP results (since primary queries force isPep=false)
    const derivedResult = await Result.updateMany(
      { queryType: { $exists: false }, isPep: true },
      { $set: { queryType: 'derived_socio_pep' } }
    );
    console.log(`Updated ${derivedResult.modifiedCount} documents to derived_socio_pep.`);

    // Set 'primary' for the rest
    const primaryResult = await Result.updateMany(
      { queryType: { $exists: false } },
      { $set: { queryType: 'primary' } }
    );
    console.log(`Updated ${primaryResult.modifiedCount} documents to primary.`);

    console.log(`Migration complete.`);
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

migrate();
