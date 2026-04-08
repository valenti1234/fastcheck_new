const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = 'mongodb://localhost:27017/dux2';

async function checkEmilioTenant() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db();
    
    // Find Emilio's tenant
    const emilioTenant = await db.collection('tenants').findOne({
      name: { $regex: /emilio/i }
    });
    
    if (!emilioTenant) {
      console.log('Tenant Emilio not found');
      return;
    }
    
    console.log('\n=== EMILIO TENANT DATA ===');
    console.log('Tenant ID:', emilioTenant._id);
    console.log('Name:', emilioTenant.name);
    console.log('Credit Balance:', emilioTenant.creditBalance);
    
    // Check credit operations
    const creditOps = await db.collection('creditoperations').find({
      tenantId: emilioTenant._id
    }).toArray();
    
    console.log('\n=== CREDIT OPERATIONS ===');
    console.log('Total credit operations:', creditOps.length);
    
    let totalCreditsUsed = 0;
    let totalCreditsAdded = 0;
    const operationTypes = {};
    
    creditOps.forEach(op => {
      if (op.operationType === 'evaluation') {
        totalCreditsUsed += op.creditsUsed || 0;
      } else if (op.operationType === 'credit_purchase') {
        totalCreditsAdded += op.creditsAdded || 0;
      }
      
      operationTypes[op.operationType] = (operationTypes[op.operationType] || 0) + 1;
    });
    
    console.log('Operation types:', operationTypes);
    console.log('Total credits used (from ops):', totalCreditsUsed);
    console.log('Total credits added (from ops):', totalCreditsAdded);
    
    // Check Results
    const resultCount = await db.collection('results').countDocuments({
      tenantId: emilioTenant._id
    });
    
    console.log('\n=== RESULTS ===');
    console.log('Total Results:', resultCount);
    
    // Check Summaries
    const summaryCount = await db.collection('summaries').countDocuments({
      tenantId: emilioTenant._id
    });
    
    console.log('\n=== SUMMARIES ===');
    console.log('Total Summaries:', summaryCount);
    
    // Check for consistency
    console.log('\n=== CONSISTENCY CHECK ===');
    const expectedCreditsUsed = totalCreditsUsed;
    const actualCreditsUsed = emilioTenant.creditBalance?.totalCreditsUsed || 0;
    
    console.log('Expected total credits used:', expectedCreditsUsed);
    console.log('Actual total credits used:', actualCreditsUsed);
    
    if (expectedCreditsUsed !== actualCreditsUsed) {
      console.log('❌ INCONSISTENCY FOUND: Credit usage mismatch');
      console.log('Difference:', expectedCreditsUsed - actualCreditsUsed);
    } else {
      console.log('✅ Credit usage is consistent');
    }
    
    // Check evaluation operations count vs results
    const evaluationOpsCount = operationTypes.evaluation || 0;
    console.log('\nEvaluation operations:', evaluationOpsCount);
    console.log('Result records:', resultCount);
    
    if (evaluationOpsCount !== resultCount) {
      console.log('❌ INCONSISTENCY: Evaluation ops vs Results mismatch');
    } else {
      console.log('✅ Evaluation operations match Result records');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    console.log('\nDisconnected from MongoDB');
  }
}

checkEmilioTenant();