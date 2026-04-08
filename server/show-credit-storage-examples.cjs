const { MongoClient } = require('mongodb');

// MongoDB connection
const uri = 'mongodb://localhost:27017/dux2';
const client = new MongoClient(uri);

async function showCreditStorageExamples() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await client.connect();
    const db = client.db('duxiter');
    
    console.log('\n📊 COME VENGONO MEMORIZZATI I CREDITI SOTTRATTI PER OGNI EVALUATION\n');
    
    // 1. Mostra la struttura della collection CreditOperation
    console.log('1️⃣ STRUTTURA DELLA COLLECTION "creditoperations":\n');
    const sampleCreditOp = await db.collection('creditoperations').findOne({});
    if (sampleCreditOp) {
      console.log('   Esempio di record CreditOperation:');
      console.log('   {');
      console.log(`     _id: ${sampleCreditOp._id}`);
      console.log(`     tenantId: ${sampleCreditOp.tenantId}`);
      console.log(`     userId: ${sampleCreditOp.userId || 'null'}`);
      console.log(`     operationType: "${sampleCreditOp.operationType}"`);
      console.log(`     creditsChanged: ${sampleCreditOp.creditsChanged} (negativo = sottrazione)`);
      console.log(`     balanceAfter: ${sampleCreditOp.balanceAfter}`);
      console.log(`     description: "${sampleCreditOp.description}"`);
      console.log(`     metadata: ${JSON.stringify(sampleCreditOp.metadata || {}, null, 6)}`);
      console.log(`     createdAt: ${sampleCreditOp.createdAt}`);
      console.log('   }\n');
    } else {
      console.log('   ❌ Nessun record trovato nella collection creditoperations\n');
    }
    
    // 2. Mostra tutte le operazioni di tipo 'evaluation'
    console.log('2️⃣ OPERAZIONI DI SOTTRAZIONE CREDITI PER EVALUATIONS:\n');
    const evaluationOps = await db.collection('creditoperations').find({
      operationType: 'evaluation'
    }).sort({ createdAt: -1 }).limit(5).toArray();
    
    if (evaluationOps.length > 0) {
      evaluationOps.forEach((op, index) => {
        console.log(`   Operazione ${index + 1}:`);
        console.log(`   - ID: ${op._id}`);
        console.log(`   - Tenant: ${op.tenantId}`);
        console.log(`   - Crediti sottratti: ${Math.abs(op.creditsChanged)}`);
        console.log(`   - Saldo dopo: ${op.balanceAfter}`);
        console.log(`   - Tipo evaluation: ${op.metadata?.evaluationType || 'N/A'}`);
        console.log(`   - Descrizione: ${op.description}`);
        console.log(`   - Data: ${op.createdAt}`);
        console.log('');
      });
    } else {
      console.log('   ❌ Nessuna operazione di evaluation trovata\n');
    }
    
    // 3. Mostra il bilancio crediti nei tenant
    console.log('3️⃣ BILANCIO CREDITI NEI TENANT:\n');
    const tenants = await db.collection('tenants').find({}).toArray();
    
    tenants.forEach(tenant => {
      console.log(`   Tenant: ${tenant.name}`);
      console.log(`   - ID: ${tenant._id}`);
      console.log(`   - Crediti disponibili: ${tenant.creditBalance?.availableCredits || 0}`);
      console.log(`   - Crediti totali usati: ${tenant.creditBalance?.totalCreditsUsed || 0}`);
      console.log(`   - Ultima operazione: ${tenant.creditBalance?.lastCreditOperation || 'N/A'}`);
      console.log('');
    });
    
    // 4. Statistiche aggregate
    console.log('4️⃣ STATISTICHE AGGREGATE:\n');
    
    const stats = await db.collection('creditoperations').aggregate([
      {
        $match: { operationType: 'evaluation' }
      },
      {
        $group: {
          _id: '$tenantId',
          totalEvaluations: { $sum: 1 },
          totalCreditsUsed: { $sum: { $abs: '$creditsChanged' } },
          lastEvaluation: { $max: '$createdAt' }
        }
      },
      {
        $lookup: {
          from: 'tenants',
          localField: '_id',
          foreignField: '_id',
          as: 'tenant'
        }
      },
      {
        $unwind: '$tenant'
      }
    ]).toArray();
    
    stats.forEach(stat => {
      console.log(`   Tenant: ${stat.tenant.name}`);
      console.log(`   - Totale evaluations: ${stat.totalEvaluations}`);
      console.log(`   - Crediti totali usati: ${stat.totalCreditsUsed}`);
      console.log(`   - Ultima evaluation: ${stat.lastEvaluation}`);
      console.log('');
    });
    
    console.log('\n📝 RIEPILOGO DEL SISTEMA DI MEMORIZZAZIONE CREDITI:\n');
    console.log('   ✅ Ogni evaluation crea un record nella collection "creditoperations"');
    console.log('   ✅ Il campo "creditsChanged" è negativo per le sottrazioni');
    console.log('   ✅ Il campo "balanceAfter" mostra il saldo dopo l\'operazione');
    console.log('   ✅ Il campo "operationType" identifica il tipo di operazione');
    console.log('   ✅ I metadata contengono dettagli specifici dell\'evaluation');
    console.log('   ✅ Il saldo del tenant viene aggiornato in tempo reale');
    console.log('   ✅ Ogni operazione è tracciata con timestamp per audit');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

showCreditStorageExamples();