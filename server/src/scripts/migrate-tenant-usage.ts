import mongoose from 'mongoose';
import { Tenant } from '../models/tenant.model';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function migrateTenants() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || null;
    
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Update all tenants that don't have usageStats
    const result = await Tenant.updateMany(
      { usageStats: { $exists: false } },
      {
        $set: {
          usageStats: {
            evaluationsRemaining: 100,
            evaluationsUsed: 0,
            lastEvaluationDate: null
          }
        }
      }
    );

    console.log(`Updated ${result.modifiedCount} tenants`);
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

migrateTenants(); 