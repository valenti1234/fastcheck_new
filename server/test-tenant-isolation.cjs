const mongoose = require('mongoose');

// Test per verificare l'isolamento per tenant nelle liste lpalto e lpmedio
async function testTenantIsolation() {
  console.log('🧪 Iniziando test di isolamento per tenant...');
  
  try {
    // Connessione al database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/duxiter');
    console.log('✅ Connesso al database MongoDB');

    // Verifica collezioni esistenti
    console.log('\n📋 Verifica collezioni esistenti...');
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    console.log('Collezioni trovate:', collectionNames);

    const hasLpaltos = collectionNames.includes('lpaltos');
    const hasLpmedios = collectionNames.includes('lpmedios');
    const hasTenants = collectionNames.includes('tenants');

    console.log(`- lpaltos: ${hasLpaltos ? '✅' : '❌'}`);
    console.log(`- lpmedios: ${hasLpmedios ? '✅' : '❌'}`);
    console.log(`- tenants: ${hasTenants ? '✅' : '❌'}`);

    if (!hasTenants) {
      console.log('❌ Collezione tenants non trovata. Impossibile procedere con il test.');
      return;
    }

    // Verifica tenant esistenti
    console.log('\n👥 Verifica tenant esistenti...');
    const tenants = await mongoose.connection.db.collection('tenants').find({}).toArray();
    console.log(`Trovati ${tenants.length} tenant nel sistema`);
    
    if (tenants.length === 0) {
      console.log('❌ Nessun tenant trovato. Impossibile procedere con il test.');
      return;
    }

    // Mostra primi 3 tenant
    for (const tenant of tenants.slice(0, 3)) {
      console.log(`- ${tenant.name} (${tenant._id})`);
    }

    // Test delle collezioni lpaltos e lpmedios se esistono
    if (hasLpaltos) {
      console.log('\n📊 Test collezione lpaltos...');
      const lpaltoCount = await mongoose.connection.db.collection('lpaltos').countDocuments({});
      console.log(`Totale documenti lpaltos: ${lpaltoCount}`);
      
      if (lpaltoCount > 0) {
        // Verifica struttura
        const lpaltoSample = await mongoose.connection.db.collection('lpaltos').findOne({});
        console.log('Struttura documento lpalto:', Object.keys(lpaltoSample));
        
        if (lpaltoSample.tenant) {
          console.log('✅ Campo tenant presente');
          
          // Conta per tenant
          for (const tenant of tenants.slice(0, 3)) {
            const count = await mongoose.connection.db.collection('lpaltos').countDocuments({ tenant: tenant._id });
            console.log(`  - Tenant ${tenant.name}: ${count} documenti`);
          }
        } else {
          console.log('❌ Campo tenant mancante');
        }
      }
    }

    if (hasLpmedios) {
      console.log('\n📊 Test collezione lpmedios...');
      const lpmedioCount = await mongoose.connection.db.collection('lpmedios').countDocuments({});
      console.log(`Totale documenti lpmedios: ${lpmedioCount}`);
      
      if (lpmedioCount > 0) {
        // Verifica struttura
        const lpmedioSample = await mongoose.connection.db.collection('lpmedios').findOne({});
        console.log('Struttura documento lpmedio:', Object.keys(lpmedioSample));
        
        if (lpmedioSample.tenant) {
          console.log('✅ Campo tenant presente');
          
          // Conta per tenant
          for (const tenant of tenants.slice(0, 3)) {
            const count = await mongoose.connection.db.collection('lpmedios').countDocuments({ tenant: tenant._id });
            console.log(`  - Tenant ${tenant.name}: ${count} documenti`);
          }
        } else {
          console.log('❌ Campo tenant mancante');
        }
      }
    }

    // Test degli indici se le collezioni esistono
    if (hasLpaltos) {
      console.log('\n🔍 Test indici lpaltos...');
      try {
        const indexes = await mongoose.connection.db.collection('lpaltos').indexes();
        console.log('Indici lpaltos:');
        indexes.forEach(index => {
          console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
        });
      } catch (error) {
        console.log('❌ Errore nel recupero indici lpaltos:', error.message);
      }
    }

    if (hasLpmedios) {
      console.log('\n🔍 Test indici lpmedios...');
      try {
        const indexes = await mongoose.connection.db.collection('lpmedios').indexes();
        console.log('Indici lpmedios:');
        indexes.forEach(index => {
          console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
        });
      } catch (error) {
        console.log('❌ Errore nel recupero indici lpmedios:', error.message);
      }
    }

    // Test di creazione dati di esempio per verificare l'isolamento
    if (tenants.length >= 2) {
      console.log('\n🧪 Test di isolamento con dati di esempio...');
      
      const tenant1 = tenants[0];
      const tenant2 = tenants[1];
      
      // Crea documenti di test
      const testRut = '12345678-9';
      
      // Inserisci in lpaltos per tenant1
      await mongoose.connection.db.collection('lpaltos').insertOne({
        rut: testRut,
        tenant: tenant1._id,
        createdAt: new Date(),
        testDocument: true
      });
      
      // Inserisci in lpmedios per tenant2
      await mongoose.connection.db.collection('lpmedios').insertOne({
        rut: testRut,
        tenant: tenant2._id,
        createdAt: new Date(),
        testDocument: true
      });
      
      console.log(`✅ Creati documenti di test con RUT ${testRut}`);
      console.log(`  - lpaltos per tenant ${tenant1.name}`);
      console.log(`  - lpmedios per tenant ${tenant2.name}`);
      
      // Verifica isolamento
      const lpaltoForTenant1 = await mongoose.connection.db.collection('lpaltos').findOne({ 
        rut: testRut, 
        tenant: tenant1._id 
      });
      const lpaltoForTenant2 = await mongoose.connection.db.collection('lpaltos').findOne({ 
        rut: testRut, 
        tenant: tenant2._id 
      });
      
      if (lpaltoForTenant1 && !lpaltoForTenant2) {
        console.log('✅ Isolamento lpaltos funziona correttamente');
      } else {
        console.log('❌ Problema con isolamento lpaltos');
      }
      
      // Cleanup documenti di test
      await mongoose.connection.db.collection('lpaltos').deleteMany({ testDocument: true });
      await mongoose.connection.db.collection('lpmedios').deleteMany({ testDocument: true });
      console.log('🧹 Documenti di test rimossi');
    }

    console.log('\n🎉 Test di isolamento per tenant completato!');
    
  } catch (error) {
    console.error('❌ Errore durante il test:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnesso dal database');
  }
}

// Esegui il test
testTenantIsolation().catch(console.error);