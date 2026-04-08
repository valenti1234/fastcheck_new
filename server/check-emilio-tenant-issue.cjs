const { MongoClient } = require('mongodb');

// Connessione al database
const uri = 'mongodb://localhost:27017/duxiter';

async function checkEmilioTenantIssue() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Connesso al database duxiter');
    
    const db = client.db('duxiter');
    
    console.log('\n📋 Lista di tutti i tenant nel database:');
    const tenants = await db.collection('tenants').find({}).toArray();
    
    tenants.forEach((tenant, index) => {
      console.log(`${index + 1}. ID: ${tenant._id}`);
      console.log(`   Nome: "${tenant.name}"`);
      console.log(`   Crediti disponibili: ${tenant.creditBalance?.availableCredits || 0}`);
      console.log(`   Crediti utilizzati: ${tenant.creditBalance?.totalCreditsUsed || 0}`);
      console.log('');
    });
    
    // Cercare tenant che contengono "Emilio" nel nome
    console.log('🔍 Ricerca tenant con "Emilio" nel nome:');
    const emilioTenants = await db.collection('tenants').find({
      name: { $regex: /emilio/i }
    }).toArray();
    
    if (emilioTenants.length > 0) {
      for (const tenant of emilioTenants) {
        console.log(`\n✅ Trovato tenant: "${tenant.name}" (ID: ${tenant._id})`);
        
        // Verificare creditoperations per questo tenant
        const creditOpsString = await db.collection('creditoperations').find({
          tenantId: tenant._id.toString(),
          operationType: 'evaluation',
          creditsChanged: { $lt: 0 }
        }).toArray();
        
        const creditOpsObjectId = await db.collection('creditoperations').find({
          tenantId: tenant._id,
          operationType: 'evaluation', 
          creditsChanged: { $lt: 0 }
        }).toArray();
        
        console.log(`   💳 CreditOperations (string tenantId): ${creditOpsString.length}`);
        console.log(`   💳 CreditOperations (ObjectId tenantId): ${creditOpsObjectId.length}`);
        
        // Verificare evaluationjobs
        const evalJobsString = await db.collection('evaluationjobs').find({
          tenantId: tenant._id.toString()
        }).toArray();
        
        const evalJobsObjectId = await db.collection('evaluationjobs').find({
          tenantId: tenant._id
        }).toArray();
        
        console.log(`   📋 EvaluationJobs (string tenantId): ${evalJobsString.length}`);
        console.log(`   📋 EvaluationJobs (ObjectId tenantId): ${evalJobsObjectId.length}`);
        
        // Mostrare le creditoperations se esistono
        if (creditOpsString.length > 0 || creditOpsObjectId.length > 0) {
          console.log('\n   📊 Dettagli CreditOperations:');
          const allCreditOps = [...creditOpsString, ...creditOpsObjectId];
          allCreditOps.forEach((op, i) => {
            console.log(`     ${i + 1}. ${op.createdAt} - ${op.creditsChanged} crediti (${op.operationType})`);
          });
        }
      }
    } else {
      console.log('❌ Nessun tenant trovato con "Emilio" nel nome');
    }
    
    // Verificare anche il tenant con ID specifico che abbiamo visto prima
    console.log('\n🔍 Verifica tenant con ID specifico 6835b796a65fa4e8f06ba696:');
    const specificTenant = await db.collection('tenants').findOne({
      _id: db.collection('tenants').s.db.s.client.s.options.useUnifiedTopology ? 
        require('mongodb').ObjectId('6835b796a65fa4e8f06ba696') :
        '6835b796a65fa4e8f06ba696'
    });
    
    if (specificTenant) {
      console.log(`✅ Tenant trovato: "${specificTenant.name}" (ID: ${specificTenant._id})`);
      console.log(`   Crediti disponibili: ${specificTenant.creditBalance?.availableCredits || 0}`);
      console.log(`   Crediti utilizzati: ${specificTenant.creditBalance?.totalCreditsUsed || 0}`);
    } else {
      console.log('❌ Tenant con ID specifico non trovato');
    }
    
  } catch (error) {
    console.error('❌ Errore:', error);
  } finally {
    await client.close();
  }
}

checkEmilioTenantIssue();