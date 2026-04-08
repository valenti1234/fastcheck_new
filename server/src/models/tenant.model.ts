import mongoose from 'mongoose';

export interface ITenant extends mongoose.Document {
  name: string;
  isActive: boolean;
  settings: Record<string, any>;
  usageStats: {
    evaluationsRemaining: number;
    evaluationsUsed: number;
    lastEvaluationDate: Date;
  };
  creditBalance: {
    availableCredits: number;
    totalCreditsUsed: number;
    lastCreditOperation: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

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
      default: 100 // Default number of evaluations
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
      default: 100 // Default number of credits
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

export const Tenant = mongoose.models.Tenant || mongoose.model<ITenant>('Tenant', tenantSchema);