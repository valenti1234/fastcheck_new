import mongoose, { Schema, Document } from 'mongoose';

export interface ISummary extends Document {
  rut: string;
  tenantId: string;
  summaryType: 'fast-check' | 'ai-analysis' | 'evaluation-result' | 'other';
  content: string;
  metadata?: {
    companyName?: string;
    riskLevel?: string;
    analysisDate?: Date;
    [key: string]: any;
  };
  createdAt: Date;
  updatedAt: Date;
}

const SummarySchema: Schema = new Schema({
  rut: { 
    type: String, 
    required: true, 
    index: true 
  },
  tenantId: { 
    type: String, 
    required: true, 
    index: true 
  },
  summaryType: {
    type: String,
    required: true,
    enum: ['fast-check', 'ai-analysis', 'evaluation-result', 'other'],
    default: 'fast-check'
  },
  content: { 
    type: String, 
    required: true,
    maxlength: 500000 // 500KB limit
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, { 
  timestamps: true,
  collection: 'summaries' // Explicitly set collection name
});

// Create compound index for efficient queries
SummarySchema.index({ rut: 1, tenantId: 1, summaryType: 1 });
SummarySchema.index({ createdAt: -1 });

export const Summary = mongoose.model<ISummary>('Summary', SummarySchema);