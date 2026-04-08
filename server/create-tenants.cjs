const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: false
  },
  settings: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  usageStats: {
    evaluationsRemaining: {
      type: Number,
      default: 100
    },
    evaluationsUsed: {
      type: Number,
      default: 0
    },
    lastEvaluationDate: {
      type: Date,
      default: null
    }
  },
  creditBalance: {
    availableCredits: {
      type: Number,
      default: 100
    },
    totalCreditsUsed: {
      type: Number,
      default: 0
    },
    lastCreditOperation: {
      type: Date,
      default: null
    }
  }
}, {
  timestamps: true
});

const Tenant = mongoose.model('Tenant', tenantSchema);

async function createTestTenants() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/duxiter');
    console.log('Connected to MongoDB');
    
    // Clear existing tenants
    await Tenant.deleteMany({});
    console.log('Cleared existing tenants');
    
    // Create test tenants that match our monitoring schedule tenant IDs
    const testTenants = [
      {
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
        name: 'Empresa Tecnológica SpA',
        isActive: true,
        usageStats: {
          evaluationsRemaining: 85,
          evaluationsUsed: 15,
          lastEvaluationDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        },
        creditBalance: {
          availableCredits: 850,
          totalCreditsUsed: 150
        }
      },
      {
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439012'),
        name: 'Consultora Financiera Ltda',
        isActive: true,
        usageStats: {
          evaluationsRemaining: 92,
          evaluationsUsed: 8,
          lastEvaluationDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
        },
        creditBalance: {
          availableCredits: 920,
          totalCreditsUsed: 80
        }
      },
      {
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439013'),
        name: 'Servicios Profesionales SA',
        isActive: true,
        usageStats: {
          evaluationsRemaining: 75,
          evaluationsUsed: 25,
          lastEvaluationDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
        },
        creditBalance: {
          availableCredits: 750,
          totalCreditsUsed: 250
        }
      }
    ];
    
    await Tenant.insertMany(testTenants);
    console.log(`Created ${testTenants.length} test tenants`);
    
    // Verify data
    const count = await Tenant.countDocuments();
    console.log('Total tenants:', count);
    
    const tenants = await Tenant.find();
    console.log('Created tenants:');
    tenants.forEach(t => {
      console.log(`- ID: ${t._id}, Name: ${t.name}, Active: ${t.isActive}`);
    });
    
    await mongoose.disconnect();
    console.log('Test tenants created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createTestTenants();