const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || null;

async function analyzeEvaluationResults() {
  const client = await MongoClient.connect(uri);
  const db = client.db('dux2');
  
  try {
    // Find Emilio's Organization
    const emilioTenant = await db.collection('tenants').findOne({ 
      name: "Emilio's Organization" 
    });
    
    if (!emilioTenant) {
      console.log('❌ Tenant not found');
      return;
    }
    
    console.log(`🏢 Found tenant: ${emilioTenant.name} (ID: ${emilioTenant._id})`);
    
    // Get all evaluation results
    const evaluationResults = await db.collection('evaluationresults').find({
      tenantId: emilioTenant._id.toString()
    }).toArray();
    
    console.log('\n📊 EVALUATION RESULTS ANALYSIS:');
    evaluationResults.forEach((result, index) => {
      console.log(`   Result ${index + 1}:`);
      console.log(`   - ID: ${result._id}`);
      console.log(`   - RUT: ${result.rut}`);
      console.log(`   - Status: ${result.status}`);
      console.log(`   - Error: ${result.error || 'None'}`);
      console.log(`   - Created: ${result.createdAt}`);
      console.log('');
    });
    
    const failedResults = evaluationResults.filter(r => r.status === 'failed');
    const successResults = evaluationResults.filter(r => r.status === 'success');
    
    console.log(`\n🔍 SUMMARY:`);
    console.log(`   Total Results: ${evaluationResults.length}`);
    console.log(`   Success: ${successResults.length}`);
    console.log(`   Failed: ${failedResults.length}`);
    
    // Check if these are created by RabbitMQ consumer (failed results)
    if (failedResults.length > 0) {
      console.log('\n❌ FAILED RESULTS DETECTED:');
      console.log('   These results were likely created by the RabbitMQ consumer');
      console.log('   when processing failed, bypassing the credit deduction system.');
    }
    
  } finally {
    await client.close();
  }
}

analyzeEvaluationResults().catch(console.error);