const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = 'mongodb://localhost:27017/duxiter';

async function testEmilioEvaluationJobs() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('🔌 Connected to MongoDB');
    
    const db = client.db();
    
    // Find Emilio tenant
    const emilioTenant = await db.collection('tenants').findOne({
      name: { $regex: /emilio/i }
    });
    
    if (!emilioTenant) {
      console.log('❌ Emilio tenant not found');
      return;
    }
    
    console.log('\n🏢 Testing Emilio Tenant with EvaluationJob Collection');
    console.log('================================================================================');
    console.log(`Tenant: ${emilioTenant.name} (${emilioTenant._id})`);
    
    const tenantId = emilioTenant._id.toString();
    
    // Count EvaluationJobs for this tenant
    const evaluationJobs = await db.collection('evaluationjobs').find({
      tenantId: tenantId,
      $and: [
        { tenantId: { $ne: null } },
        { tenantId: { $exists: true } }
      ]
    }).toArray();
    
    console.log(`\n📊 EvaluationJobs found: ${evaluationJobs.length}`);
    
    if (evaluationJobs.length > 0) {
      console.log('\n📋 EvaluationJob Details:');
      evaluationJobs.forEach((job, index) => {
        console.log(`   Job ${index + 1}:`);
        console.log(`     - ID: ${job._id}`);
        console.log(`     - Status: ${job.status}`);
        console.log(`     - Type: ${job.type}`);
        console.log(`     - Total Evaluations: ${job.totalEvaluations || 0}`);
        console.log(`     - Completed Evaluations: ${job.completedEvaluations || 0}`);
        console.log(`     - Failed Evaluations: ${job.failedEvaluations || 0}`);
        console.log(`     - Created: ${job.createdAt}`);
      });
    }
    
    // Aggregate stats like in the controller
    const totalEvaluationsFromJobs = await db.collection('evaluationjobs').aggregate([
      {
        $match: {
          tenantId: tenantId,
          $and: [
            { tenantId: { $ne: null } },
            { tenantId: { $exists: true } }
          ]
        }
      },
      {
        $group: {
          _id: null,
          totalEvaluations: { $sum: '$totalEvaluations' },
          completedEvaluations: { $sum: '$completedEvaluations' },
          failedEvaluations: { $sum: '$failedEvaluations' }
        }
      }
    ]).toArray();
    
    const jobStats = totalEvaluationsFromJobs[0] || {
      totalEvaluations: 0,
      completedEvaluations: 0,
      failedEvaluations: 0
    };
    
    console.log('\n📈 Aggregated Statistics from EvaluationJobs:');
    console.log(`   Total Evaluations: ${jobStats.totalEvaluations}`);
    console.log(`   Completed Evaluations: ${jobStats.completedEvaluations}`);
    console.log(`   Failed Evaluations: ${jobStats.failedEvaluations}`);
    
    // Compare with credit operations
    const creditOps = await db.collection('creditoperations').find({
      tenantId: new ObjectId(tenantId),
      credits: { $lt: 0 } // evaluation operations have negative credits
    }).toArray();
    
    console.log(`\n💳 Credit Operations (evaluations): ${creditOps.length}`);
    
    // Check tenant credit balance
    console.log('\n💰 Tenant Credit Balance:');
    console.log(`   Available Credits: ${emilioTenant.creditBalance?.availableCredits || 0}`);
    console.log(`   Total Credits Used: ${emilioTenant.creditBalance?.totalCreditsUsed || 0}`);
    
    console.log('\n✅ Test completed for Emilio tenant with EvaluationJob collection');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

testEmilioEvaluationJobs();