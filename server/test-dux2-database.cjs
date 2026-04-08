const { MongoClient } = require('mongodb');
const { ObjectId } = require('mongodb');

// Connessione al database corretto
const uri = 'mongodb://localhost:27017/dux2';

async function testWithCorrectDatabase() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Connesso al database dux2');
    
    const db = client.db('dux2');
    
    console.log('\n📊 Verifica tenant nel database dux2:');
    const tenants = await db.collection('tenants').find({}).toArray();
    console.log('Tenant trovati:', tenants.length);
    
    tenants.forEach((tenant, i) => {
      console.log(`${i+1}. ${tenant.name} (ID: ${tenant._id})`);
      console.log(`   - Crediti disponibili: ${tenant.creditBalance?.availableCredits || 0}`);
      console.log(`   - Crediti utilizzati: ${tenant.creditBalance?.totalCreditsUsed || 0}`);
    });
    
    console.log('\n💳 Verifica CreditOperations nel database dux2:');
    const creditOps = await db.collection('creditoperations').find({
      creditsChanged: { $lt: 0 }
    }).toArray();
    console.log('Operazioni che consumano crediti:', creditOps.length);
    
    if (creditOps.length > 0) {
      console.log('\nDettagli operazioni:');
      creditOps.forEach((op, i) => {
        console.log(`${i+1}. Tenant: ${op.tenantId} - Tipo: ${op.operationType} - Crediti: ${op.creditsChanged}`);
      });
    }
    
    console.log('\n📊 Statistiche per tenant (database dux2):');
    const tenantStats = await db.collection('creditoperations').aggregate([
      {
        $match: {
          creditsChanged: { $lt: 0 }
        }
      },
      {
        $addFields: {
          tenantIdString: { $toString: '$tenantId' }
        }
      },
      {
        $group: {
          _id: '$tenantIdString',
          evaluationsUsed: { $sum: 1 },
          lastEvaluationDate: { $max: '$createdAt' }
        }
      }
    ]).toArray();
    
    if (tenantStats.length > 0) {
      tenantStats.forEach(stat => {
        console.log(`- Tenant ${stat._id}: ${stat.evaluationsUsed} operazioni`);
      });
    } else {
      console.log('Nessuna statistica trovata per i tenant.');
    }
    
    console.log('\n✅ CONCLUSIONE:');
    if (tenants.length === 0) {
      console.log('Il database dux2 sembra essere vuoto o non contenere dati di tenant.');
      console.log('Le correzioni al controller dovranno essere testate con il database corretto.');
    } else {
      console.log('Il database dux2 contiene dati. Le correzioni al controller sono valide.');
    }
    
  } catch (error) {
    console.error('❌ Errore:', error.message);
  } finally {
    await client.close();
  }
}

testWithCorrectDatabase();