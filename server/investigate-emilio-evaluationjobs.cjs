const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = 'mongodb://localhost:27017/duxiter';

async function investigateEmilioEvaluationJobs() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('🔌 Connected to MongoDB');
    
    const db = client.db();
    
    const emilioTenantId = '687a6922d620ed7f184952a6';
    
    console.log('\n🔍 Investigating Emilio Tenant EvaluationJobs');
    console.log('================================================================================');
    console.log(`Tenant ID: ${emilioTenantId}`);
    
    // Find tenant info
    const tenant = await db.collection('tenants').findOne({
      _id: new ObjectId(emilioTenantId)
    });
    
    if (tenant) {
      console.log(`Tenant Name: ${tenant.name}`);
    } else {
      console.log('❌ Tenant not found');
    }
    
    // Search for EvaluationJobs with this exact tenantId
    console.log('\n📊 Searching EvaluationJobs with exact tenantId match...');
    
    // Try different variations of tenantId matching
    const queries = [
      { tenantId: emilioTenantId },
      { tenantId: new ObjectId(emilioTenantId) },
      { 'tenantId': emilioTenantId },
      { 'tenantId': new ObjectId(emilioTenantId) }
    ];
    
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      console.log(`\n🔍 Query ${i + 1}: ${JSON.stringify(query, null, 2)}`);
      
      const jobs = await db.collection('evaluationjobs').find(query).toArray();
      console.log(`   Found: ${jobs.length} jobs`);
      
      if (jobs.length > 0) {
        console.log('   📋 Job Details:');
        jobs.forEach((job, index) => {
          console.log(`     Job ${index + 1}:`);
          console.log(`       - ID: ${job._id}`);
          console.log(`       - TenantId: ${job.tenantId} (type: ${typeof job.tenantId})`);
          console.log(`       - Status: ${job.status}`);
          console.log(`       - Type: ${job.type}`);
          console.log(`       - Total Evaluations: ${job.totalEvaluations || 0}`);
          console.log(`       - Completed Evaluations: ${job.completedEvaluations || 0}`);
          console.log(`       - Failed Evaluations: ${job.failedEvaluations || 0}`);
          console.log(`       - Created: ${job.createdAt}`);
        });
      }
    }
    
    // Check all EvaluationJobs to see tenantId formats
    console.log('\n🔍 Checking all EvaluationJobs to understand tenantId formats...');
    const allJobs = await db.collection('evaluationjobs').find({}).limit(10).toArray();
    
    console.log(`Total EvaluationJobs in collection: ${await db.collection('evaluationjobs').countDocuments()}`);
    console.log('\nSample tenantId formats:');
    
    const tenantIdFormats = new Set();
    allJobs.forEach((job, index) => {
      const tenantIdType = typeof job.tenantId;
      const tenantIdValue = job.tenantId;
      const format = `${tenantIdType}: ${tenantIdValue}`;
      
      if (!tenantIdFormats.has(format)) {
        tenantIdFormats.add(format);
        console.log(`   ${index + 1}. TenantId: ${tenantIdValue} (type: ${tenantIdType})`);
      }
    });
    
    // Check if there are jobs with Emilio's tenantId in any format
    console.log('\n🔍 Searching for any jobs that might belong to Emilio...');
    
    const emilioJobs = await db.collection('evaluationjobs').find({
      $or: [
        { tenantId: emilioTenantId },
        { tenantId: new ObjectId(emilioTenantId) },
        { 'createdBy': new ObjectId(emilioTenantId) },
        { 'evaluation.tenantId': emilioTenantId },
        { 'evaluation.tenantId': new ObjectId(emilioTenantId) }
      ]
    }).toArray();
    
    console.log(`Found ${emilioJobs.length} jobs potentially related to Emilio`);
    
    if (emilioJobs.length > 0) {
      console.log('\n📋 Related Jobs Details:');
      emilioJobs.forEach((job, index) => {
        console.log(`   Job ${index + 1}:`);
        console.log(`     - ID: ${job._id}`);
        console.log(`     - TenantId: ${job.tenantId}`);
        console.log(`     - CreatedBy: ${job.createdBy}`);
        console.log(`     - Status: ${job.status}`);
        console.log(`     - Total Evaluations: ${job.totalEvaluations || 0}`);
        console.log(`     - Completed: ${job.completedEvaluations || 0}`);
        console.log(`     - Failed: ${job.failedEvaluations || 0}`);
      });
    }
    
    // Test the aggregation query used in the controller
    console.log('\n🧪 Testing controller aggregation query...');
    
    const aggregationResult = await db.collection('evaluationjobs').aggregate([
      {
        $match: {
          tenantId: emilioTenantId,
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
    
    console.log('Aggregation result (string tenantId):', aggregationResult);
    
    // Try with ObjectId
    const aggregationResultObjectId = await db.collection('evaluationjobs').aggregate([
      {
        $match: {
          tenantId: new ObjectId(emilioTenantId),
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
    
    console.log('Aggregation result (ObjectId tenantId):', aggregationResultObjectId);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

investigateEmilioEvaluationJobs();