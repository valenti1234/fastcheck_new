const mongoose = require('mongoose');

// Define the CreditOperation schema directly
const creditOperationSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  operationType: {
    type: String,
    required: true,
    enum: ['evaluation', 'credit_purchase', 'credit_refund', 'rut_lookup', 'other'],
    index: true
  },
  creditsChanged: {
    type: Number,
    required: true
  },
  balanceAfter: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

const CreditOperation = mongoose.model('CreditOperation', creditOperationSchema);

// Define the Tenant schema
const tenantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  // ... other fields
}, { timestamps: true });

const Tenant = mongoose.model('Tenant', tenantSchema);

async function createTestCreditOperations() {
  try {
    await mongoose.connect('mongodb://localhost:27017/dux2');
    console.log('Connected to MongoDB');
    
    // Get existing tenants
    const tenants = await Tenant.find({});
    console.log('Found tenants:', tenants.map(t => ({ id: t._id, name: t.name })));
    
    if (tenants.length === 0) {
      console.log('No tenants found');
      return;
    }
    
    const tenant = tenants[0]; // Use first tenant
    const currentDate = new Date();
    const lastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 15);
    
    // Create some test credit operations for last month
    const testOperations = [
      {
        tenantId: tenant._id,
        userId: tenant._id, // Using tenant as user for simplicity
        operationType: 'evaluation',
        creditsChanged: -10,
        balanceAfter: 90,
        description: 'Evaluation operation test',
        metadata: { evaluationType: 'document_analysis' },
        createdAt: lastMonth
      },
      {
        tenantId: tenant._id,
        userId: tenant._id,
        operationType: 'rut_lookup',
        creditsChanged: -5,
        balanceAfter: 85,
        description: 'RUT lookup test',
        metadata: { rutNumber: '12345678-9' },
        createdAt: lastMonth
      },
      {
        tenantId: tenant._id,
        userId: tenant._id,
        operationType: 'other',
        creditsChanged: -3,
        balanceAfter: 82,
        description: 'Other operation test',
        metadata: { operationDetails: 'Custom operation' },
        createdAt: lastMonth
      }
    ];
    
    // Insert test operations
    await CreditOperation.insertMany(testOperations);
    console.log('Created test credit operations:', testOperations.length);
    
    // Verify operations were created
    const count = await CreditOperation.countDocuments({ tenantId: tenant._id });
    console.log('Total credit operations for tenant:', count);
    
    await mongoose.disconnect();
    console.log('Test data created successfully');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createTestCreditOperations();