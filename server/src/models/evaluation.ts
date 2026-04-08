import mongoose, { Document, Schema } from 'mongoose';

// Evaluation Job Interface
export interface IEvaluationJob extends Document {
  tenantId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  type: 'single' | 'bulk';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  totalEvaluations: number;
  completedEvaluations: number;
  failedEvaluations: number;
}

// Evaluation Result Interface
export interface IEvaluationResult extends Document {
  jobId: Schema.Types.ObjectId;
  tenantId: string;
  rut: string;
  name?: string;
  status: 'success' | 'failed';
  error?: string;
  data?: {
    legalInfo?: {
      name: string;
      type: string;
      status: string;
    };
    financialInfo?: {
      creditScore: number;
      riskLevel: string;
      lastUpdated: Date;
    };
    judicialInfo?: {
      hasLawsuits: boolean;
      activeCases: number;
      lastUpdated: Date;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

// Evaluation Job Schema
const EvaluationJobSchema = new Schema<IEvaluationJob>({
  tenantId: { type: String, required: true, index: true },
  status: { 
    type: String, 
    required: true, 
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  type: { 
    type: String, 
    required: true, 
    enum: ['single', 'bulk'] 
  },
  createdBy: { type: String, required: true },
  totalEvaluations: { type: Number, required: true, default: 0 },
  completedEvaluations: { type: Number, required: true, default: 0 },
  failedEvaluations: { type: Number, required: true, default: 0 }
}, {
  timestamps: true
});

// Evaluation Result Schema
const EvaluationResultSchema = new Schema<IEvaluationResult>({
  jobId: { type: Schema.Types.ObjectId, ref: 'EvaluationJob', required: true, index: true },
  tenantId: { type: String, required: true, index: true },
  rut: { type: String, required: true },
  name: { type: String },
  status: { 
    type: String, 
    required: true, 
    enum: ['success', 'failed'],
    default: 'success'
  },
  error: { type: String },
  data: {
    type: Object,
    required: true,
    default: () => ({
      legalInfo: {
        name: '',
        type: '',
        status: ''
      },
      financialInfo: {
        creditScore: 0,
        riskLevel: '',
        lastUpdated: new Date()
      },
      judicialInfo: {
        hasLawsuits: false,
        activeCases: 0,
        lastUpdated: new Date()
      }
    })
  }
}, {
  timestamps: true
});

// Indexes
EvaluationJobSchema.index({ createdAt: -1 });
EvaluationJobSchema.index({ tenantId: 1, createdAt: -1 });
EvaluationJobSchema.index({ status: 1, tenantId: 1 });

EvaluationResultSchema.index({ jobId: 1, status: 1 });
EvaluationResultSchema.index({ rut: 1 });

// Models
export const EvaluationJob = mongoose.models.EvaluationJob || mongoose.model<IEvaluationJob>('EvaluationJob', EvaluationJobSchema);
export const EvaluationResult = mongoose.models.EvaluationResult || mongoose.model<IEvaluationResult>('EvaluationResult', EvaluationResultSchema); 