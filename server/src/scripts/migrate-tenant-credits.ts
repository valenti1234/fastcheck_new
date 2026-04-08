import mongoose from 'mongoose';
import { Tenant } from '../models/tenant.model';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function migrateTenantCredits() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || null;
    
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Update all tenants that don't have creditBalance
    const result = await Tenant.updateMany(
      { creditBalance: { $exists: false } },
      {
        $set: {
          creditBalance: {
            availableCredits: 100,
            totalCreditsUsed: 0,
            lastCreditOperation: null
          }
        }
      }
    );

    console.log(`Updated ${result.modifiedCount} tenants with creditBalance field`);
    
    // Also update tenants that have creditBalance but with missing fields
    const resultPartial = await Tenant.updateMany(
      { 
        $or: [
          { 'creditBalance.availableCredits': { $exists: false } },
          { 'creditBalance.totalCreditsUsed': { $exists: false } },
          { 'creditBalance.lastCreditOperation': { $exists: false } }
        ]
      },
      {
        $set: {
          'creditBalance.availableCredits': 100,
          'creditBalance.totalCreditsUsed': 0,
          'creditBalance.lastCreditOperation': null
        }
      }
    );

    console.log(`Updated ${resultPartial.modifiedCount} tenants with partial creditBalance fields`);
    
    // Show current state
    const tenants = await Tenant.find({}, { name: 1, creditBalance: 1 });
    console.log('\nCurrent tenant credit balances:');
    tenants.forEach(tenant => {
      console.log(`- ${tenant.name}: ${tenant.creditBalance?.availableCredits || 0} credits`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

migrateTenantCredits();