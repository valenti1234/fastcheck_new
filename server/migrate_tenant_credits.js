import mongoose from 'mongoose';

async function migrateTenantCredits() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/duxiter');
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const tenantsCollection = db.collection('tenants');

    // Find all tenants without creditBalance field
    const tenantsWithoutCredits = await tenantsCollection.find({
      creditBalance: { $exists: false }
    }).toArray();

    console.log(`Found ${tenantsWithoutCredits.length} tenants without creditBalance field`);

    if (tenantsWithoutCredits.length === 0) {
      console.log('All tenants already have creditBalance field');
      return;
    }

    // Update each tenant to add creditBalance
    for (const tenant of tenantsWithoutCredits) {
      const initialCredits = tenant.usageStats?.evaluationsRemaining || 100;
      const usedCredits = tenant.usageStats?.evaluationsUsed || 0;
      
      await tenantsCollection.updateOne(
        { _id: tenant._id },
        {
          $set: {
            creditBalance: {
              availableCredits: initialCredits,
              totalCreditsUsed: usedCredits,
              lastCreditOperation: null
            }
          }
        }
      );
      
      console.log(`Updated tenant ${tenant.name} (${tenant._id}) with ${initialCredits} available credits`);
    }

    console.log('\nMigration completed successfully!');
    
    // Verify the migration
    const allTenants = await tenantsCollection.find({}).toArray();
    console.log('\n=== VERIFICATION ===');
    for (const tenant of allTenants) {
      console.log(`${tenant.name}: ${tenant.creditBalance.availableCredits} available, ${tenant.creditBalance.totalCreditsUsed} used`);
    }

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

migrateTenantCredits();