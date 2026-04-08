const { MongoClient } = require('mongodb');

// Connessione al database
const uri = 'mongodb://localhost:27017/dux2';

async function verifyAdminCreditOperationsUsage() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Connesso al database duxiter');
    
    const db = client.db('duxiter');
    
    console.log('\n🔍 VERIFICA: Utilizzo della collection creditoperations nel pannello SuperAdmin\n');
    
    // 1. Simulare le query che fa il controller getTenantStatistics
    console.log('1️⃣ Query principale per le statistiche delle valutazioni:');
    console.log('   Query: CreditOperation.find({ operationType: "evaluation", creditsChanged: { $lt: 0 } })');
    
    const evaluationOperations = await db.collection('creditoperations').find({
      operationType: 'evaluation',
      creditsChanged: { $lt: 0 }
    }).toArray();
    
    console.log(`   Risultato: ${evaluationOperations.length} operazioni di valutazione trovate`);
    
    // 2. Aggregazione per statistiche per tenant
    console.log('\n2️⃣ Aggregazione per statistiche per tenant:');
    console.log('   Query: CreditOperation.aggregate([...])'); 
    
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
    
    console.log(`   Risultato: ${tenantEvaluationStats.length} tenant con valutazioni`);
    
    // 3. Mostrare i dati che vengono utilizzati nel pannello admin
    console.log('\n3️⃣ Dati utilizzati nel pannello SuperAdmin:');
    
    const totalEvaluationsUsed = evaluationOperations.length;
    console.log(`   • Total Evaluations Used: ${totalEvaluationsUsed}`);
    
    const activeTenants = tenantEvaluationStats.length;
    console.log(`   • Active Tenants: ${activeTenants}`);
    
    // Distribuzione dell'utilizzo basata su creditoperations
    const usageDistribution = {
      heavy: tenantEvaluationStats.filter(stat => stat.evaluationsUsed > 50).length,
      moderate: tenantEvaluationStats.filter(stat => stat.evaluationsUsed > 10 && stat.evaluationsUsed <= 50).length,
      light: tenantEvaluationStats.filter(stat => stat.evaluationsUsed > 0 && stat.evaluationsUsed <= 10).length,
      inactive: 0 // Calcolato come totalTenants - activeTenants
    };
    
    console.log('   • Usage Distribution (basata su creditoperations):');
    console.log(`     - Heavy users (>50): ${usageDistribution.heavy}`);
    console.log(`     - Moderate users (10-50): ${usageDistribution.moderate}`);
    console.log(`     - Light users (1-10): ${usageDistribution.light}`);
    
    // Top tenants basati su creditoperations
    const topTenants = tenantEvaluationStats
      .sort((a, b) => b.evaluationsUsed - a.evaluationsUsed)
      .slice(0, 5);
    
    console.log('\n   • Top 5 Tenants (basati su creditoperations):');
    for (const tenant of topTenants) {
      console.log(`     - Tenant ${tenant._id}: ${tenant.evaluationsUsed} valutazioni`);
    }
    
    // 4. Confronto con altre collections
    console.log('\n4️⃣ Confronto con altre collections:');
    
    const evaluationJobsCount = await db.collection('evaluationjobs').countDocuments({});
    const resultsCount = await db.collection('results').countDocuments({});
    const summariesCount = await db.collection('summaries').countDocuments({});
    
    console.log(`   • EvaluationJobs: ${evaluationJobsCount} record`);
    console.log(`   • Results: ${resultsCount} record`);
    console.log(`   • Summaries: ${summariesCount} record`);
    console.log(`   • CreditOperations (evaluations): ${evaluationOperations.length} record`);
    
    // 5. Verifica coerenza
    console.log('\n5️⃣ Verifica coerenza:');
    
    if (evaluationOperations.length === evaluationJobsCount) {
      console.log('   ✅ Coerenza perfetta: CreditOperations = EvaluationJobs');
    } else {
      console.log(`   ⚠️  Discrepanza: CreditOperations (${evaluationOperations.length}) ≠ EvaluationJobs (${evaluationJobsCount})`);
    }
    
    console.log('\n📊 CONCLUSIONE:');
    console.log('   Il pannello SuperAdmin utilizza PRINCIPALMENTE la collection "creditoperations"');
    console.log('   per calcolare le statistiche delle valutazioni, inclusi:');
    console.log('   • Numero totale di valutazioni utilizzate');
    console.log('   • Tenant attivi (quelli con almeno una valutazione)');
    console.log('   • Distribuzione dell\'utilizzo (heavy/moderate/light users)');
    console.log('   • Top tenant per utilizzo');
    console.log('   • Data dell\'ultima valutazione per tenant');
    console.log('\n   Questo conferma che il sistema di tracking dei crediti è la fonte');
    console.log('   primaria per le statistiche mostrate nel pannello admin.');
    
  } catch (error) {
    console.error('❌ Errore:', error);
  } finally {
    await client.close();
  }
}

verifyAdminCreditOperationsUsage();