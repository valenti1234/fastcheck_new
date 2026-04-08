const mongoose = require('mongoose');

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

async function checkOperations() {
  try {
    await mongoose.connect('mongodb://localhost:27017/duxiter');
    console.log('Connected to MongoDB');
    
    const operations = await CreditOperation.find({}).sort({ createdAt: 1 });
    console.log('All credit operations:');
    operations.forEach(op => {
      console.log({
        tenantId: op.tenantId,
        operationType: op.operationType,
        creditsChanged: op.creditsChanged,
        createdAt: op.createdAt,
        description: op.description
      });
    });
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkOperations();