const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/duxiter';

async function updateTenantUsageStats() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('Connesso a MongoDB');
    
    const db = client.db();
    const tenantsCollection = db.collection('tenants');
    const creditOpsCollection = db.collection('creditoperations');
    const evaluationResultsCollection = db.collection('evaluationresults');
    
    // Ottieni tutti i tenant
    const tenants = await tenantsCollection.find({}).toArray();
    console.log(`Trovati ${tenants.length} tenant da aggiornare`);
    
    for (const tenant of tenants) {
      console.log(`\nAggiornando tenant: ${tenant.name} (${tenant._id})`);
      
      // Conta le operazioni di credito per questo tenant
      const creditOpsCount = await creditOpsCollection.countDocuments({
        tenantId: tenant._id
      });
      
      // Conta i risultati di valutazione per questo tenant
      const evaluationResultsCount = await evaluationResultsCollection.countDocuments({
        tenantId: tenant._id
      });
      
      // Calcola le valutazioni rimanenti
      const totalCredits = tenant.credits || 100; // Default 100 se non specificato
      const evaluationsRemaining = Math.max(0, totalCredits - creditOpsCount);
      
      // Prepara i nuovi usageStats
      const newUsageStats = {
        evaluationsUsed: creditOpsCount,
        evaluationsRemaining: evaluationsRemaining,
        lastEvaluationDate: tenant.usageStats?.lastEvaluationDate || null
      };
      
      console.log(`  Dati attuali:`);
      console.log(`    evaluationsUsed: ${tenant.usageStats?.evaluationsUsed || 0} -> ${newUsageStats.evaluationsUsed}`);
      console.log(`    evaluationsRemaining: ${tenant.usageStats?.evaluationsRemaining || 0} -> ${newUsageStats.evaluationsRemaining}`);
      console.log(`    Risultati valutazione nel DB: ${evaluationResultsCount}`);
      console.log(`    Operazioni credito nel DB: ${creditOpsCount}`);
      
      // Aggiorna il tenant
      const updateResult = await tenantsCollection.updateOne(
        { _id: tenant._id },
        { 
          $set: { 
            usageStats: newUsageStats,
            updatedAt: new Date()
          } 
        }
      );
      
      if (updateResult.modifiedCount > 0) {
        console.log(`  ✅ Tenant aggiornato con successo`);
      } else {
        console.log(`  ⚠️  Nessuna modifica necessaria`);
      }
    }
    
    console.log('\n🎉 Aggiornamento completato!');
    
  } catch (error) {
    console.error('Errore durante l\'aggiornamento:', error);
  } finally {
    await client.close();
    console.log('Disconnesso da MongoDB');
  }
}

// Esegui lo script
updateTenantUsageStats().catch(console.error);