const { MongoClient } = require('mongodb');

async function connectToMongo() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  return { client, db: client.db('duxiter') };
}

async function investigateOrphanedResults() {
  const { client, db } = await connectToMongo();
  
  try {
    console.log('🔍 Investigating Orphaned Results...');
    console.log('='.repeat(50));
    
    // Get all tenants
    const tenants = await db.collection('tenants').find({}).toArray();
    const tenantIds = tenants.map(t => t._id.toString());
    
    console.log(`📊 Valid Tenant IDs: ${tenantIds.length}`);
    tenantIds.forEach(id => console.log(`   - ${id}`));
    
    // Find orphaned results
    const orphanedResults = await db.collection('results').find({
      tenantId: { $nin: tenantIds }
    }).toArray();
    
    console.log(`\n🚨 Found ${orphanedResults.length} orphaned results:`);
    
    // Group by tenantId to see patterns
    const orphanedByTenant = {};
    orphanedResults.forEach(result => {
      const tenantId = result.tenantId;
      if (!orphanedByTenant[tenantId]) {
        orphanedByTenant[tenantId] = [];
      }
      orphanedByTenant[tenantId].push(result);
    });
    
    for (const [tenantId, results] of Object.entries(orphanedByTenant)) {
      console.log(`\n📋 Tenant ID: ${tenantId} (${results.length} results)`);
      console.log(`   Created dates: ${results.map(r => r.createdAt?.toISOString().split('T')[0]).join(', ')}`);
      
      // Check if this tenant exists but with different ID format
      const possibleTenant = await db.collection('tenants').findOne({
        $or: [
          { _id: tenantId },
          { name: { $regex: new RegExp(tenantId, 'i') } }
        ]
      });
      
      if (possibleTenant) {
        console.log(`   ✅ Found matching tenant: ${possibleTenant.name} (${possibleTenant._id})`);
      } else {
        console.log(`   ❌ No matching tenant found`);
      }
      
      // Show sample result data
      const sample = results[0];
      console.log(`   Sample result:`);
      console.log(`     - ID: ${sample._id}`);
      console.log(`     - Created: ${sample.createdAt}`);
      console.log(`     - Has markdownResume: ${!!sample.markdownResume}`);
    }
    
    // Check for results with null/undefined tenantId
    const nullTenantResults = await db.collection('results').find({
      $or: [
        { tenantId: null },
        { tenantId: undefined },
        { tenantId: { $exists: false } }
      ]
    }).toArray();
    
    console.log(`\n🔍 Results with null/undefined tenantId: ${nullTenantResults.length}`);
    
  } catch (error) {
    console.error('❌ Error during investigation:', error);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

investigateOrphanedResults();