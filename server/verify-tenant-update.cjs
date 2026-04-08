const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/duxiter';

async function verifyTenantUpdate() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('Connesso a MongoDB');
    
    const db = client.db();
    const tenants = await db.collection('tenants').find({}).toArray();
    
    console.log('\nTenant aggiornati:');
    console.log('==================');
    
    tenants.forEach(tenant => {
      console.log(`Nome: ${tenant.name}`);
      console.log(`  evaluationsUsed: ${tenant.usageStats?.evaluationsUsed || 0}`);
      console.log(`  evaluationsRemaining: ${tenant.usageStats?.evaluationsRemaining || 0}`);
      console.log(`  lastEvaluationDate: ${tenant.usageStats?.lastEvaluationDate || 'Never'}`);
      console.log(`  updatedAt: ${tenant.updatedAt}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('Errore:', error);
  } finally {
    await client.close();
  }
}

verifyTenantUpdate().catch(console.error);