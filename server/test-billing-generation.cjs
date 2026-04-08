const mongoose = require('mongoose');

// Mock Express Request and Response objects
class MockRequest {
  constructor(body = {}) {
    this.body = body;
  }
}

class MockResponse {
  constructor() {
    this.statusCode = 200;
    this.data = null;
  }
  
  status(code) {
    this.statusCode = code;
    return this;
  }
  
  json(data) {
    this.data = data;
    console.log('Response Status:', this.statusCode);
    console.log('Response Data:', JSON.stringify(data, null, 2));
    return this;
  }
}

// Define schemas
const tenantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true }
}, { timestamps: true });

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
    type: String, // JSON string of detailed credit operations
    default: '[]'
  }
}, {
  timestamps: true
});

// Create compound unique index
tenantBillingSchema.index({ tenantId: 1, billingMonth: 1, billingYear: 1 }, { unique: true });

const Tenant = mongoose.model('Tenant', tenantSchema);
const CreditOperation = mongoose.model('CreditOperation', creditOperationSchema);
const TenantBilling = mongoose.model('TenantBilling', tenantBillingSchema);

// Simplified billing generation function
async function generateAllMonthlyBillings(req, res) {
  try {
    const { month, year } = req.body;
    
    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);
    const billingDate = new Date();

    console.log(`Generating billings for ${month}/${year}`);
    console.log(`Date range: ${startDate} to ${endDate}`);

    const tenants = await Tenant.find({});
    console.log(`Found ${tenants.length} tenants`);

    const results = [];
    const errors = [];
    const costPerCredit = 0.10; // $0.10 per credit

    for (const tenant of tenants) {
      try {
        console.log(`Processing tenant: ${tenant.name}`);
        
        // Get credit operations for this tenant in the specified period
        const creditOperations = await CreditOperation.find({
          tenantId: tenant._id,
          creditsChanged: { $lt: 0 }, // Only deductions
          createdAt: {
            $gte: startDate,
            $lte: endDate
          }
        }).sort({ createdAt: 1 });

        console.log(`Found ${creditOperations.length} credit operations for ${tenant.name}`);

        if (creditOperations.length > 0) {
          // Aggregate operations by type
          const operationsDetail = {
            evaluations: { count: 0, credits: 0, amount: 0 },
            rutLookups: { count: 0, credits: 0, amount: 0 },
            other: { count: 0, credits: 0, amount: 0 }
          };

          let totalCreditsUsed = 0;

          creditOperations.forEach(op => {
            const credits = Math.abs(op.creditsChanged);
            totalCreditsUsed += credits;
            const amount = credits * costPerCredit;

            if (op.operationType === 'evaluation') {
              operationsDetail.evaluations.count++;
              operationsDetail.evaluations.credits += credits;
              operationsDetail.evaluations.amount += amount;
            } else if (op.operationType === 'rut_lookup') {
              operationsDetail.rutLookups.count++;
              operationsDetail.rutLookups.credits += credits;
              operationsDetail.rutLookups.amount += amount;
            } else {
              operationsDetail.other.count++;
              operationsDetail.other.credits += credits;
              operationsDetail.other.amount += amount;
            }
          });

          const totalOperations = creditOperations.length;
          const totalAmount = totalCreditsUsed * costPerCredit;

          // Check if billing already exists
          const existingBilling = await TenantBilling.findOne({
            tenantId: tenant._id,
            billingMonth: month,
            billingYear: year
          });

          if (existingBilling) {
            console.log(`Billing already exists for ${tenant.name}`);
            continue;
          }

          // Create new billing
          const billing = new TenantBilling({
            tenantId: tenant._id,
            billingMonth: month,
            billingYear: year,
            billingDate,
            totalOperations,
            totalCreditsUsed,
            totalAmount,
            status: 'pending',
            operationsDetail,
            creditOperations: JSON.stringify(creditOperations)
          });

          await billing.save();
          await billing.populate('tenantId', 'name');
          results.push(billing);
          
          console.log(`Created billing for ${tenant.name}: ${totalOperations} operations, ${totalCreditsUsed} credits, $${totalAmount.toFixed(2)}`);
        } else {
          console.log(`No operations found for ${tenant.name}`);
        }
      } catch (tenantError) {
        console.error(`Error processing tenant ${tenant.name}:`, tenantError);
        errors.push({
          tenantId: tenant._id,
          tenantName: tenant.name,
          error: tenantError.message
        });
      }
    }

    res.status(201).json({
      message: `Generation completed. ${results.length} billings created, ${errors.length} errors`,
      billings: results,
      errors: errors,
      summary: {
        totalTenants: tenants.length,
        successfulBillings: results.length,
        failedBillings: errors.length
      }
    });

  } catch (error) {
    console.error('Error generating all monthly billings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function testBillingGeneration() {
  try {
    await mongoose.connect('mongodb://localhost:27017/duxiter');
    console.log('Connected to MongoDB');
    
    const req = new MockRequest({
      month: 7,
      year: 2025
    });
    
    const res = new MockResponse();
    
    await generateAllMonthlyBillings(req, res);
    
    await mongoose.disconnect();
    console.log('Test completed');
  } catch (error) {
    console.error('Test error:', error);
    process.exit(1);
  }
}

testBillingGeneration();