const mongoose = require('mongoose');

// Connect to MongoDB and test evaluation creation
async function testEvaluationService() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect('mongodb://localhost:27017/dux2');
    console.log('✅ Connected to MongoDB');

    // Get Emilio's tenant data
    const db = mongoose.connection.db;
    const emilioTenant = await db.collection('tenants').findOne({
      name: "Emilio's Organization"
    });
    
    if (!emilioTenant) {
      console.log('❌ Emilio tenant not found');
      return;
    }
    
    console.log('\n📊 EMILIO TENANT DATA:');
    console.log(`   ID: ${emilioTenant._id}`);
    console.log(`   Name: ${emilioTenant.name}`);
    console.log(`   Available Credits: ${emilioTenant.creditBalance?.availableCredits || 0}`);
    console.log(`   Total Credits Used: ${emilioTenant.creditBalance?.totalCreditsUsed || 0}`);
    
    // Check evaluation jobs
    const evaluationJobs = await db.collection('evaluationjobs').find({
      tenantId: emilioTenant._id.toString()
    }).toArray();
    
    console.log(`\n📋 EVALUATION JOBS: ${evaluationJobs.length}`);
    evaluationJobs.forEach((job, index) => {
      console.log(`   Job ${index + 1}:`);
      console.log(`   - ID: ${job._id}`);
      console.log(`   - Type: ${job.type}`);
      console.log(`   - Status: ${job.status}`);
      console.log(`   - Total Evaluations: ${job.totalEvaluations}`);
      console.log(`   - Created: ${job.createdAt}`);
      console.log('');
    });
    
    // Check evaluation results
    const evaluationResults = await db.collection('evaluationresults').find({
      tenantId: emilioTenant._id.toString()
    }).toArray();
    
    console.log(`📊 EVALUATION RESULTS: ${evaluationResults.length}`);
    
    // Check credit operations
    const creditOperations = await db.collection('creditoperations').find({
      tenantId: emilioTenant._id
    }).toArray();
    
    console.log(`\n💳 CREDIT OPERATIONS: ${creditOperations.length}`);
    if (creditOperations.length > 0) {
      creditOperations.forEach((op, index) => {
        console.log(`   Operation ${index + 1}:`);
        console.log(`   - ID: ${op._id}`);
        console.log(`   - Type: ${op.operationType}`);
        console.log(`   - Credits Changed: ${op.creditsChanged}`);
        console.log(`   - Balance After: ${op.balanceAfter}`);
        console.log(`   - Description: ${op.description}`);
        console.log(`   - Created: ${op.createdAt}`);
        console.log('');
      });
    } else {
      console.log('   ❌ No credit operations found!');
    }
    
    // Calculate expected vs actual
    const totalEvaluations = evaluationResults.length;
    const totalCreditOps = creditOperations.filter(op => op.operationType === 'evaluation').length;
    
    console.log('\n🔍 ANALYSIS:');
    console.log(`   Total Evaluation Results: ${totalEvaluations}`);
    console.log(`   Total Credit Operations (evaluation): ${totalCreditOps}`);
    console.log(`   Discrepancy: ${totalEvaluations - totalCreditOps}`);
    
    if (totalEvaluations > totalCreditOps) {
      console.log('   ⚠️  PROBLEM: More evaluation results than credit operations!');
      console.log('   This means evaluations were created without deducting credits.');
    } else if (totalEvaluations === totalCreditOps) {
      console.log('   ✅ Credit operations match evaluation results.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

testEvaluationService();