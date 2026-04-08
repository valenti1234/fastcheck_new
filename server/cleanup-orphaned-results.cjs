const { MongoClient } = require('mongodb');

async function cleanupOrphanedResults() {
  const client = new MongoClient('mongodb://localhost:27017');
  
  try {
    await client.connect();
    const db = client.db('dux2');
    
    // Get all valid tenant IDs
    const validTenants = await db.collection('tenants').find({}, { _id: 1 }).toArray();
    const validTenantIds = validTenants.map(t => t._id.toString());
    
    console.log('Valid tenant IDs:', validTenantIds);
    
    // Find orphaned results
    const allResults = await db.collection('results').find({}).toArray();
    const orphanedResults = allResults.filter(r => !validTenantIds.includes(r.tenantId));
    
    console.log(`\nFound ${orphanedResults.length} orphaned results:`);
    orphanedResults.forEach(r => {
      console.log(`- RUT: ${r.rut}, Orphaned TenantId: ${r.tenantId}, Created: ${r.createdAt}`);
    });
    
    if (orphanedResults.length > 0) {
      console.log('\nOptions to fix:');
      console.log('1. Delete orphaned results');
      console.log('2. Reassign to an existing tenant');
      console.log('\nTo delete orphaned results, run:');
      console.log('db.results.deleteMany({ tenantId: { $nin: validTenantIds } })');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

cleanupOrphanedResults();