import mongoose, { Document } from 'mongoose';

export interface ITenantBilling extends Document {
  tenantId: mongoose.Types.ObjectId;
  billingMonth: number;
  billingYear: number;
  billingDate: Date;
  totalOperations: number;
  totalCreditsUsed: number;
  totalAmount: number;
  status: 'pending' | 'paid' | 'overdue';
  operationsDetail: {
    evaluations: { count: number; credits: number; amount: number };
    rutLookups: { count: number; credits: number; amount: number };
    other: { count: number; credits: number; amount: number };
  };
  creditOperations: string; // JSON string of detailed credit operations
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

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
    max: 12
  },
  billingYear: {
    type: Number,
    required: true,
    min: 2020
  },
  billingDate: {
    type: Date,
    required: true
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
    enum: ['pending', 'paid', 'overdue'],
    default: 'pending'
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
  },
  paidAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Create compound index for unique billing periods per tenant
tenantBillingSchema.index({ tenantId: 1, billingMonth: 1, billingYear: 1 }, { unique: true });

export const TenantBilling = mongoose.models.TenantBilling || mongoose.model<ITenantBilling>('TenantBilling', tenantBillingSchema);