const { MongoClient, ObjectId } = require('mongodb');

async function connectToMongo() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  return { client, db: client.db('dux2') };
}

async function investigateAleDiscrepancy() {
  const { client, db } = await connectToMongo();
  
  try {
    console.log('🔍 Investigating Ale\'s Organization Discrepancy...');
    console.log('='.repeat(60));
    
    const aleId = '6827419eecdd4cff1cd6ad69';
    
    // Get Ale's tenant data
    const aleTenant = await db.collection('tenants').findOne({ _id: new ObjectId(aleId) });
    console.log('🏢 Ale\'s Tenant Data:');
    console.log(`   Name: ${aleTenant?.name}`);
    console.log(`   Available Credits: ${aleTenant?.creditBalance?.availableCredits}`);
    console.log(`   Total Credits Used: ${aleTenant?.creditBalance?.totalCreditsUsed}`);
    console.log(`   Last Credit Operation: ${aleTenant?.creditBalance?.lastCreditOperation}`);
    console.log(`   Legacy Evaluations Used: ${aleTenant?.usageStats?.evaluationsUsed}`);
    console.log(`   Legacy Evaluations Remaining: ${aleTenant?.usageStats?.evaluationsRemaining}`);
    
    // Get all credit operations for Ale
    const aleCredits = await db.collection('creditoperations').find({ 
      tenantId: new ObjectId(aleId) 
    }).toArray();
    
    console.log(`\n💳 Credit Operations for Ale (${aleCredits.length} total):`);
    aleCredits.forEach((op, index) => {
      console.log(`   ${index + 1}. Type: ${op.operationType}`);
      console.log(`      Credits Changed: ${op.creditsChanged}`);
      console.log(`      Balance After: ${op.balanceAfter}`);
      console.log(`      Created: ${op.createdAt}`);
      console.log(`      Metadata: ${JSON.stringify(op.metadata || {})}`);
      console.log('');
    });
    
    // Count evaluation operations specifically
    const evalOps = aleCredits.filter(op => 
      op.operationType === 'evaluation' && op.creditsChanged < 0
    );
    
    console.log(`📈 Evaluation Operations Analysis:`);
    console.log(`   Total evaluation operations: ${evalOps.length}`);
    console.log(`   Total credits deducted: ${evalOps.reduce((sum, op) => sum + Math.abs(op.creditsChanged), 0)}`);
    
    // Check if there are any inconsistencies in the tenant's creditBalance
    const expectedTotalUsed = evalOps.reduce((sum, op) => sum + Math.abs(op.creditsChanged), 0);
    const actualTotalUsed = aleTenant?.creditBalance?.totalCreditsUsed || 0;
    
    console.log(`\n🔍 Consistency Check:`);
    console.log(`   Expected total credits used (from operations): ${expectedTotalUsed}`);
    console.log(`   Actual total credits used (from tenant): ${actualTotalUsed}`);
    console.log(`   Difference: ${expectedTotalUsed - actualTotalUsed}`);
    
    if (expectedTotalUsed !== actualTotalUsed) {
      console.log(`   🚨 INCONSISTENCY DETECTED!`);
      console.log(`   The tenant's creditBalance.totalCreditsUsed needs to be updated.`);
    } else {
      console.log(`   ✅ Credit totals are consistent.`);
    }
    
  } catch (error) {
    console.error('❌ Error during investigation:', error);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

investigateAleDiscrepancy();