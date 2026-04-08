const { MongoClient, ObjectId } = require('mongodb');

async function connectToMongo() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  return { client, db: client.db('dux2') };
}

async function fixTenantCreditInconsistencies() {
  const { client, db } = await connectToMongo();
  
  try {
    console.log('🔧 Fixing Tenant Credit Inconsistencies...');
    console.log('='.repeat(60));
    
    // Get all tenants
    const tenants = await db.collection('tenants').find({}).toArray();
    
    for (const tenant of tenants) {
      const tenantId = tenant._id;
      console.log(`\n🏢 Processing: ${tenant.name} (${tenantId})`);
      
      // Get all credit operations for this tenant
      const creditOps = await db.collection('creditoperations').find({ 
        tenantId: tenantId 
      }).toArray();
      
      if (creditOps.length === 0) {
        console.log('   No credit operations found.');
        continue;
      }
      
      // Calculate totals from credit operations
      const totalCreditsUsed = creditOps.reduce((sum, op) => {
        return sum + Math.abs(op.creditsChanged < 0 ? op.creditsChanged : 0);
      }, 0);
      
      const totalCreditsAdded = creditOps.reduce((sum, op) => {
        return sum + (op.creditsChanged > 0 ? op.creditsChanged : 0);
      }, 0);
      
      // Get the latest operation for lastCreditOperation
      const latestOp = creditOps.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      
      // Calculate available credits (starting from 100, adding credits added, subtracting credits used)
      const availableCredits = 100 + totalCreditsAdded - totalCreditsUsed;
      
      console.log(`   Credit Operations: ${creditOps.length}`);
      console.log(`   Total Credits Used (calculated): ${totalCreditsUsed}`);
      console.log(`   Total Credits Added (calculated): ${totalCreditsAdded}`);
      console.log(`   Available Credits (calculated): ${availableCredits}`);
      console.log(`   Current Total Credits Used: ${tenant.creditBalance?.totalCreditsUsed || 0}`);
      console.log(`   Current Available Credits: ${tenant.creditBalance?.availableCredits || 100}`);
      
      // Check if update is needed
      const needsUpdate = 
        (tenant.creditBalance?.totalCreditsUsed || 0) !== totalCreditsUsed ||
        (tenant.creditBalance?.availableCredits || 100) !== availableCredits;
      
      if (needsUpdate) {
        console.log('   🚨 INCONSISTENCY DETECTED - Updating...');
        
        const updateResult = await db.collection('tenants').updateOne(
          { _id: tenantId },
          {
            $set: {
              'creditBalance.totalCreditsUsed': totalCreditsUsed,
              'creditBalance.availableCredits': availableCredits,
              'creditBalance.lastCreditOperation': latestOp.createdAt
            }
          }
        );
        
        if (updateResult.modifiedCount > 0) {
          console.log('   ✅ Successfully updated tenant credit balance.');
        } else {
          console.log('   ❌ Failed to update tenant credit balance.');
        }
      } else {
        console.log('   ✅ Credit balance is already consistent.');
      }
    }
    
    console.log('\n🎉 Credit inconsistency fix completed!');
    
  } catch (error) {
    console.error('❌ Error during fix:', error);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

fixTenantCreditInconsistencies();