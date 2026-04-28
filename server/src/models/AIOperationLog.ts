import mongoose, { Schema, Document } from 'mongoose';

const AI_OPERATION_LOG_TTL_SECONDS = (() => {
  const fallback = 86400;
  const parsed = Number.parseInt(process.env.AI_OPERATION_LOG_TTL_SECONDS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
})();

export interface IAIOperationLog extends Document {
  rut?: string;
  tenantId?: string;
  operationType: 'seekData' | 'analyzeSheriffData' | 'analyzeEvaluationParameters';
  promptUsed: string;
  promptConfigId?: mongoose.Types.ObjectId;
  inputData: any;
  aiResponse: string;
  aiModel: string;
  temperature: number;
  maxTokens: number;
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
  executionTime: number; // in milliseconds
  success: boolean;
  errorMessage?: string;
  userId?: string;
  createdAt: Date;
}

const AIOperationLogSchema: Schema = new Schema({
  rut: { type: String, index: true },
  tenantId: { type: String, index: true },
  operationType: { 
    type: String, 
    required: true, 
    enum: ['seekData', 'analyzeSheriffData', 'analyzeEvaluationParameters'],
    index: true 
  },
  promptUsed: { 
    type: String, 
    required: true,
    validate: {
      validator: function(v: string) {
        return v.length <= 50000; // 50KB limit for prompt
      },
      message: 'Prompt exceeds size limit of 50KB'
    }
  },
  promptConfigId: { type: Schema.Types.ObjectId, ref: 'PromptConfiguration' },
  inputData: { 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        return JSON.stringify(v).length <= 5000000; // 5MB limit for input data
      },
      message: 'Input data exceeds size limit of 5MB'
    }
  },
  aiResponse: { 
    type: String, 
    required: true,
    validate: {
      validator: function(v: string) {
        return v.length <= 100000; // 100KB limit for AI response
      },
      message: 'AI response exceeds size limit of 100KB'
    }
  },
  aiModel: { type: String, required: true },
  temperature: { type: Number, required: true },
  maxTokens: { type: Number, required: true },
  tokensUsed: {
    prompt: { type: Number },
    completion: { type: Number },
    total: { type: Number }
  },
  executionTime: { type: Number, required: true }, // in milliseconds
  success: { type: Boolean, required: true, index: true },
  errorMessage: { type: String },
  userId: { type: String, index: true },
}, { timestamps: { createdAt: true, updatedAt: false } }); // Only track creation time

// Add compound indexes for efficient querying
AIOperationLogSchema.index({ tenantId: 1, operationType: 1, createdAt: -1 });
AIOperationLogSchema.index({ rut: 1, createdAt: -1 });
AIOperationLogSchema.index({ success: 1, createdAt: -1 });

// Add TTL index to automatically delete documents after 24 hours
AIOperationLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: AI_OPERATION_LOG_TTL_SECONDS }); // 24 hours = 86400 seconds

export const AIOperationLog = mongoose.model<IAIOperationLog>('AIOperationLog', AIOperationLogSchema);
