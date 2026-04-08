const mongoose = require('mongoose');

const tenantBillingSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  billingMonth: {
    type: Number,
    required: true,
    min: 1,
    max: 12,
    index: true
  },
  billingYear: {
    type: Number,
    required: true,
    min: 2020,
    index: true
  },
  billingDate: {
    type: Date,
    required: true,
    index: true
  },
  totalOperations: {
    type: Number,
    required: true,
    default: 0
  },
  totalCreditsUsed: {
    type: Number,
    required: true,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    default: 0
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'paid', 'overdue'],
    default: 'pending',
    index: true
  },
  operationsDetail: {
    evaluations: {
      count: { type: Number, default: 0 },
      credits: { type: Number, default: 0 },
      amount: { type: Number, default: 0 }
    },
    rutLookups: {
      count: { type: Number, default: 0 },
      credits: { type: Number, default: 0 },
      amount: { type: Number, default: 0 }
    },
    other: {
      count: { type: Number, default: 0 },
      credits: { type: Number, default: 0 },
      amount: { type: Number, default: 0 }
    }
  },
  creditOperations: {
    type: String,
    default: '[]'
  }
}, {
  timestamps: true
});

const TenantBilling = mongoose.model('TenantBilling', tenantBillingSchema);

async function checkBillings() {
  try {
    await mongoose.connect('mongodb://localhost:27017/dux2');
    console.log('Connected to MongoDB');
    
    const billings = await TenantBilling.find({}).sort({ createdAt: -1 });
    console.log('Found billings:', billings.length);
    
    billings.forEach(billing => {
      console.log('\n--- Billing Record ---');
      console.log('Tenant ID:', billing.tenantId);
      console.log('Period:', billing.billingMonth + '/' + billing.billingYear);
      console.log('Total Operations:', billing.totalOperations);
      console.log('Total Credits Used:', billing.totalCreditsUsed);
      console.log('Total Amount: $' + billing.totalAmount.toFixed(2));
      console.log('Status:', billing.status);
      console.log('Operations Detail:');
      console.log('  Evaluations:', billing.operationsDetail.evaluations);
      console.log('  RUT Lookups:', billing.operationsDetail.rutLookups);
      console.log('  Other:', billing.operationsDetail.other);
      console.log('Created:', billing.createdAt);
    });
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkBillings();