const mongoose = require('mongoose');

async function checkCollections() {
  try {
    await mongoose.connect('mongodb://localhost:27017/dux2');
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    console.log('\nAvailable collections:');
    collections.forEach(col => {
      console.log('- ' + col.name);
    });
    
    // Check tenantbillings collection specifically
    const billingCollection = db.collection('tenantbillings');
    const allBillings = await billingCollection.find({}).toArray();
    
    console.log('\nAll billing records in tenantbillings collection:');
    console.log('Total count:', allBillings.length);
    
    allBillings.forEach((billing, index) => {
      console.log('\n--- Billing Record ' + (index + 1) + ' ---');
      console.log('ID:', billing._id);
      console.log('Tenant ID:', billing.tenantId);
      console.log('Period:', billing.billingMonth + '/' + billing.billingYear);
      console.log('Total Operations:', billing.totalOperations);
      console.log('Total Credits Used:', billing.totalCreditsUsed);
      console.log('Total Amount: $' + billing.totalAmount.toFixed(2));
      console.log('Status:', billing.status);
      console.log('Created:', billing.createdAt);
    });
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkCollections();