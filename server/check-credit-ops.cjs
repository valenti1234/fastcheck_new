const { MongoClient } = require('mongodb');

async function checkCreditOperations() {
  const client = new MongoClient('mongodb://localhost:27017');
  
  try {
    await client.connect();
    console.log('🔌 Connected to MongoDB');
    
    const db = client.db('dux2');
    
    // Get all credit operations
    const allOps = await db.collection('creditoperations').find({}).toArray();
    console.log(`\n📊 Total Credit Operations: ${allOps.length}`);
    
    // Group by operation type
    const byType = {};
    allOps.forEach(op => {
      if (!byType[op.operationType]) {
        byType[op.operationType] = [];
      }
      byType[op.operationType].push(op);
    });
    
    console.log('\n📋 Operations by Type:');
    Object.keys(byType).forEach(type => {
      console.log(`   ${type}: ${byType[type].length}`);
    });
    
    // Check evaluation operations specifically
    const evalOps = allOps.filter(op => op.operationType === 'evaluation');
    console.log(`\n🎯 Evaluation Operations: ${evalOps.length}`);
    
    if (evalOps.length > 0) {
      console.log('\n📝 Evaluation Operations Details:');
      evalOps.forEach((op, i) => {
        console.log(`   ${i+1}. Tenant: ${op.tenantId}, Credits: ${op.creditsChanged}, Date: ${op.createdAt}`);
      });
    }
    
    // Check operations with negative credits
    const negativeOps = allOps.filter(op => op.creditsChanged < 0);
    console.log(`\n💸 Operations with Negative Credits: ${negativeOps.length}`);
    
    if (negativeOps.length > 0) {
      console.log('\n📝 Negative Credit Operations Details:');
      negativeOps.forEach((op, i) => {
        console.log(`   ${i+1}. Tenant: ${op.tenantId}, Type: ${op.operationType}, Credits: ${op.creditsChanged}, Date: ${op.createdAt}`);
      });
    }
    
    // Check Emilio's tenant specifically
    const emilioTenantId = '687a6922d620ed7f184952a6';
    const emilioOps = allOps.filter(op => op.tenantId.toString() === emilioTenantId);
    console.log(`\n🏢 Emilio's Organization Operations: ${emilioOps.length}`);
    
    if (emilioOps.length > 0) {
      console.log('\n📝 Emilio\'s Operations Details:');
      emilioOps.forEach((op, i) => {
        console.log(`   ${i+1}. Type: ${op.operationType}, Credits: ${op.creditsChanged}, Date: ${op.createdAt}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

checkCreditOperations();