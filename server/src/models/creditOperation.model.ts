import mongoose, { Document } from 'mongoose';

export interface ICreditOperation extends Document {
  tenantId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  operationType: 'evaluation' | 'credit_purchase' | 'credit_refund' | 'admin_adjustment' | 'rut_lookup' | 'user_refresh';
  creditsChanged: number; // Positive for additions, negative for deductions
  balanceAfter: number;
  description: string;
  metadata?: {
    evaluationId?: string;
    evaluationType?: 'single' | 'bulk';
    transactionId?: string;
    adminUserId?: string;
    [key: string]: any;
  };
  createdAt: Date;
}

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
    required: false,
    index: true
  },
  operationType: {
    type: String,
    enum: ['evaluation', 'credit_purchase', 'credit_refund', 'admin_adjustment', 'rut_lookup', 'user_refresh'],
    required: true,
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
    required: true,
    maxlength: 500
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: { createdAt: true, updatedAt: false } // Only track creation time
});

// Create compound indexes for efficient querying
creditOperationSchema.index({ tenantId: 1, createdAt: -1 });
creditOperationSchema.index({ tenantId: 1, operationType: 1, createdAt: -1 });
creditOperationSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });

export const CreditOperation = mongoose.models.CreditOperation || mongoose.model<ICreditOperation>('CreditOperation', creditOperationSchema);
