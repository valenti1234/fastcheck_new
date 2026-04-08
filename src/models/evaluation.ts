import mongoose, { Schema, Document } from 'mongoose';

// Credit Report Interface
interface ICreditReport {
  score: number | null;
  hasDebt: boolean;
  debtAmount: number | null;
}

// Evaluation Details Interface
interface IEvaluationDetails {
  legalStatus: 'active' | 'inactive' | 'unknown';
  incorporationDate: Date | null;
  financialRisk: 'low' | 'medium' | 'high' | 'unknown';
  creditReport: ICreditReport;
  governmentContracts: number;
  judicialRecords: number;
  complianceFlags: string[];
}

// Evaluation Result Interface
export interface IEvaluationResult extends Document {
  jobId: Schema.Types.ObjectId;
  tenantId: string;
  rut: string;
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

// Credit Report Schema
const CreditReportSchema = new Schema<ICreditReport>({
  score: { type: Number, default: null },
  hasDebt: { type: Boolean, default: false },
  debtAmount: { type: Number, default: null },
});

// Evaluation Details Schema
const EvaluationDetailsSchema = new Schema<IEvaluationDetails>({
  legalStatus: { 
    type: String, 
    enum: ['active', 'inactive', 'unknown'],
    default: 'unknown' 
  },
  incorporationDate: { type: Date, default: null },
  financialRisk: { 
    type: String,
    enum: ['low', 'medium', 'high', 'unknown'],
    default: 'unknown'
  },
  creditReport: { type: CreditReportSchema, required: true },
  governmentContracts: { type: Number, default: 0 },
  judicialRecords: { type: Number, default: 0 },
  complianceFlags: [{ type: String }],
});

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
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
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
  status: { 
    type: String, 
    required: true, 
    enum: ['success', 'failed'],
    default: 'success'
  },
  error: { type: String },
  data: {
    legalInfo: {
      name: String,
      type: String,
      status: String
    },
    financialInfo: {
      creditScore: Number,
      riskLevel: String,
      lastUpdated: Date
    },
    judicialInfo: {
      hasLawsuits: Boolean,
      activeCases: Number,
      lastUpdated: Date
    }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Indexes
EvaluationJobSchema.index({ createdAt: -1 });
EvaluationJobSchema.index({ tenantId: 1, createdAt: -1 });
EvaluationJobSchema.index({ status: 1, tenantId: 1 });

EvaluationResultSchema.index({ createdAt: -1 });
EvaluationResultSchema.index({ tenantId: 1, rut: 1 });
EvaluationResultSchema.index({ jobId: 1, status: 1 });

// Models
export const EvaluationJob = mongoose.model<IEvaluationJob>('EvaluationJob', EvaluationJobSchema);
export const EvaluationResult = mongoose.model<IEvaluationResult>('EvaluationResult', EvaluationResultSchema); 