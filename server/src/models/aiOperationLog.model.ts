import mongoose, { Document } from 'mongoose';

export interface IAIOperationLog extends Document {
  tenantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  operationType: 'seekData' | 'analyzeSheriffData' | 'analyzeEvaluationParameters' | 'other';
  rut?: string;
  success: boolean;
  responseTime: number; // in milliseconds
  errorMessage?: string;
  requestData?: any;
  responseData?: any;
  createdAt: Date;
}

const aiOperationLogSchema = new mongoose.Schema({
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
    enum: ['seekData', 'analyzeSheriffData', 'analyzeEvaluationParameters', 'other'],
    required: true,
    index: true
  },
  rut: {
    type: String,
    index: true
  },
  success: {
    type: Boolean,
    required: true,
    index: true
  },
  responseTime: {
    type: Number,
    required: true
  },
  errorMessage: {
    type: String
  },
  requestData: {
    type: mongoose.Schema.Types.Mixed
  },
  responseData: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Create compound indexes for efficient querying
aiOperationLogSchema.index({ tenantId: 1, createdAt: -1 });
aiOperationLogSchema.index({ tenantId: 1, operationType: 1, createdAt: -1 });
aiOperationLogSchema.index({ tenantId: 1, success: 1, createdAt: -1 });

export const AIOperationLog = mongoose.models.AIOperationLog || mongoose.model<IAIOperationLog>('AIOperationLog', aiOperationLogSchema);