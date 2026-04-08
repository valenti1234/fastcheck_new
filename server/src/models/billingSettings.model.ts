import mongoose, { Document } from 'mongoose';

export interface IBillingSettings extends Document {
  pricing: {
    evaluationPrice: number;
    apiCallPrice: number;
    tokenPrice: number; // per 1000 tokens
    storagePrice: number; // per GB per month
    bandwidthPrice: number; // per GB
  };
  currency: string;
  taxRate: number; // percentage
  invoiceSettings: {
    daysUntilDue: number;
    autoSend: boolean;
    emailTemplate: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const billingSettingsSchema = new mongoose.Schema({
  pricing: {
    evaluationPrice: {
      type: Number,
      required: true,
      default: 0.10
    },
    apiCallPrice: {
      type: Number,
      required: true,
      default: 0.05
    },
    tokenPrice: {
      type: Number,
      required: true,
      default: 0.001 // per 1000 tokens
    },
    storagePrice: {
      type: Number,
      required: true,
      default: 0.10 // per GB per month
    },
    bandwidthPrice: {
      type: Number,
      required: true,
      default: 0.05 // per GB
    }
  },
  currency: {
    type: String,
    required: true,
    default: 'EUR'
  },
  taxRate: {
    type: Number,
    required: true,
    default: 0.21 // 21% VAT
  },
  invoiceSettings: {
    daysUntilDue: {
      type: Number,
      required: true,
      default: 30
    },
    autoSend: {
      type: Boolean,
      required: true,
      default: false
    },
    emailTemplate: {
      type: String,
      required: true,
      default: 'default'
    }
  }
}, {
  timestamps: true
});

// Ensure only one settings document exists
billingSettingsSchema.index({}, { unique: true });

export const BillingSettings = mongoose.models.BillingSettings || mongoose.model<IBillingSettings>('BillingSettings', billingSettingsSchema);