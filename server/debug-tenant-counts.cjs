const { MongoClient } = require('mongodb');

// MongoDB connection
const uri = process.env.MONGODB_URI || null;
const client = new MongoClient(uri);

async function connectToMongo() {
  await client.connect();
  return client.db('dux2');
}

async function debugTenantCounts() {
  try {
    console.log('🔍 Debugging Tenant Counts...');
    console.log('=' .repeat(50));

    const db = await connectToMongo();
    
    // Get all tenants
    const tenants = await db.collection('tenants').find({}).toArray();
    console.log(`📊 Total Tenants: ${tenants.length}`);
    console.log('');

    // Check CreditOperation counts
    const totalCreditOps = await db.collection('creditoperations').countDocuments({});
    const evaluationOps = await db.collection('creditoperations').countDocuments({
      operationType: 'evaluation',
      creditsChanged: { $lt: 0 }
    });
    
    console.log(`💳 Total Credit Operations: ${totalCreditOps}`);
    console.log(`📈 Evaluation Operations (negative credits): ${evaluationOps}`);
    console.log('');

    // Check Result and Summary counts
    const totalResults = await db.collection('results').countDocuments({});
    const totalSummaries = await db.collection('summaries').countDocuments({});
    
    console.log(`📋 Total Results (cached): ${totalResults}`);
    console.log(`📄 Total Summaries (archived): ${totalSummaries}`);
    console.log('');

    // Per-tenant analysis
    console.log('🏢 Per-Tenant Analysis:');
    console.log('-'.repeat(80));
    
    for (const tenant of tenants) {
      const tenantId = tenant._id.toString();
      
      // Credit operations for this tenant
      const tenantEvalOps = await db.collection('creditoperations').countDocuments({
        tenantId: tenant._id,
        operationType: 'evaluation',
        creditsChanged: { $lt: 0 }
      });
      
      // Results for this tenant
      const tenantResults = await db.collection('results').countDocuments({ tenantId });
      
      // Summaries for this tenant
      const tenantSummaries = await db.collection('summaries').countDocuments({ tenantId });
      
      // Credit balance from tenant model
      const availableCredits = tenant.creditBalance?.availableCredits || 0;
      const totalCreditsUsed = tenant.creditBalance?.totalCreditsUsed || 0;
      
      // Legacy usage stats
      const legacyEvaluationsUsed = tenant.usageStats?.evaluationsUsed || 0;
      const legacyEvaluationsRemaining = tenant.usageStats?.evaluationsRemaining || 0;
      
      console.log(`\n🏢 ${tenant.name} (${tenantId})`);
      console.log(`   Credit Operations (evaluations): ${tenantEvalOps}`);
      console.log(`   Results (cached): ${tenantResults}`);
      console.log(`   Summaries (archived): ${tenantSummaries}`);
      console.log(`   Total evaluations (Results + Summaries): ${tenantResults + tenantSummaries}`);
      console.log(`   Available Credits: ${availableCredits}`);
      console.log(`   Total Credits Used: ${totalCreditsUsed}`);
      console.log(`   Legacy Evaluations Used: ${legacyEvaluationsUsed}`);
      console.log(`   Legacy Evaluations Remaining: ${legacyEvaluationsRemaining}`);
      
      // Check for discrepancies
      const discrepancies = [];
      
      if (tenantEvalOps !== totalCreditsUsed) {
        discrepancies.push(`❌ Credit ops (${tenantEvalOps}) != Total credits used (${totalCreditsUsed})`);
      }
      
      if (tenantEvalOps !== legacyEvaluationsUsed) {
        discrepancies.push(`❌ Credit ops (${tenantEvalOps}) != Legacy evaluations used (${legacyEvaluationsUsed})`);
      }
      
      if (tenantEvalOps !== (tenantResults + tenantSummaries)) {
        discrepancies.push(`❌ Credit ops (${tenantEvalOps}) != Total evaluations (${tenantResults + tenantSummaries})`);
      }
      
      if (discrepancies.length > 0) {
        console.log(`   🚨 DISCREPANCIES FOUND:`);
        discrepancies.forEach(d => console.log(`      ${d}`));
      } else {
        console.log(`   ✅ All counts are consistent`);
      }
    }
    
    console.log('');
    console.log('=' .repeat(50));
    
    // Summary statistics
    const tenantEvaluationStats = await db.collection('creditoperations').aggregate([
      {
        $match: {
          operationType: 'evaluation',
          creditsChanged: { $lt: 0 }
        }
      },
      {
        $group: {
          _id: '$tenantId',
          evaluationsUsed: { $sum: 1 },
          lastEvaluationDate: { $max: '$createdAt' }
        }
      }
    ]).toArray();
    
    const activeTenants = tenantEvaluationStats.length;
    const totalEvaluationsUsed = evaluationOps;
    const totalEvaluationsRemaining = tenants.reduce((sum, tenant) => sum + (tenant.creditBalance?.availableCredits || 0), 0);
    const totalEvaluationsAllocated = totalEvaluationsUsed + totalEvaluationsRemaining;
    
    console.log('📊 SUMMARY STATISTICS:');
    console.log(`   Total Tenants: ${tenants.length}`);
    console.log(`   Active Tenants: ${activeTenants}`);
    console.log(`   Total Evaluations Used: ${totalEvaluationsUsed}`);
    console.log(`   Total Evaluations Remaining: ${totalEvaluationsRemaining}`);
    console.log(`   Total Evaluations Allocated: ${totalEvaluationsAllocated}`);
    console.log(`   Average Usage Per Tenant: ${tenants.length > 0 ? Math.round(totalEvaluationsUsed / tenants.length) : 0}`);
    
    // Check for orphaned records
    console.log('');
    console.log('🔍 CHECKING FOR ORPHANED RECORDS:');
    
    const tenantIds = tenants.map(t => t._id.toString());
    
    const orphanedResults = await db.collection('results').countDocuments({
      tenantId: { $nin: tenantIds }
    });
    
    const orphanedSummaries = await db.collection('summaries').countDocuments({
      tenantId: { $nin: tenantIds }
    });
    
    const orphanedCreditOps = await db.collection('creditoperations').countDocuments({
      tenantId: { $nin: tenants.map(t => t._id) }
    });
    
    console.log(`   Orphaned Results: ${orphanedResults}`);
    console.log(`   Orphaned Summaries: ${orphanedSummaries}`);
    console.log(`   Orphaned Credit Operations: ${orphanedCreditOps}`);
    
    if (orphanedResults > 0 || orphanedSummaries > 0 || orphanedCreditOps > 0) {
      console.log(`   🚨 ORPHANED RECORDS FOUND! This may cause incorrect counts.`);
    } else {
      console.log(`   ✅ No orphaned records found`);
    }
    
  } catch (error) {
    console.error('❌ Error during debug:', error);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the debug script
debugTenantCounts();