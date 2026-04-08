import mongoose, { Schema, Document } from 'mongoose';

export interface IResult extends Document {
  rut: string;
  tenantId: string; // Added tenantId field for tenant isolation
  markdownResume: string;
  sheriffLogData: any;
  details: any;
  riskAssessment: any;
  vistaDuxiter: any[];
  duxiterFilter: any;
  duxiterRiskLevel: string;
  duxiterRiskData: any;
  duxiterRiskList: any;
  duxiterMD: string;
  newSummaryData: any;
  aiAnalysis?: string; // AI-generated analysis text
  aiAnalysisDate?: Date; // Date when AI analysis was generated
  isPep?: boolean;
  queryType?: 'primary' | 'derived_socio_pep';
  archived?: boolean;
  archivedAt?: Date;
}

const ResultSchema: Schema = new Schema({
  rut: { type: String, required: true, index: true },
  tenantId: { type: String, required: true, index: true },
  queryType: { 
    type: String, 
    enum: ['primary', 'derived_socio_pep'],
    default: 'primary',
    required: true,
    index: true 
  },
  markdownResume: { type: String, maxlength: 1000000 }, // 1MB limit
  sheriffLogData: { 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        return JSON.stringify(v).length <= 15000000; // 15MB limit
      },
      message: 'sheriffLogData exceeds size limit of 15MB'
    }
  },
  details: { 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        return JSON.stringify(v).length <= 15000000; // 15MB limit
      },
      message: 'details exceeds size limit of 15MB'
    }
  },
  companyGeneralInfo: { 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        return JSON.stringify(v).length <= 5000000; // 5MB limit
      },
      message: 'companyGeneralInfo exceeds size limit of 5MB'
    }
  },
  riskAssessment: { 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        return JSON.stringify(v).length <= 5000000; // 5MB limit
      },
      message: 'riskAssessment exceeds size limit of 5MB'
    }
  },
  vistaDuxiter: [{ 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        return JSON.stringify(v).length <= 1000000; // 1MB limit per item
      },
      message: 'vistaDuxiter item exceeds size limit of 1MB'
    }
  }],
  duxiterFilter: { 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        return JSON.stringify(v).length <= 1000000; // 1MB limit
      },
      message: 'duxiterFilter exceeds size limit of 1MB'
    }
  },
  duxiterRiskLevel: { type: String, maxlength: 50 },
  duxiterRiskData: { 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        return JSON.stringify(v).length <= 5000000; // 5MB limit
      },
      message: 'duxiterRiskData exceeds size limit of 5MB'
    }
  },
  duxiterRiskList: { 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        return JSON.stringify(v).length <= 5000000; // 5MB limit
      },
      message: 'duxiterRiskList exceeds size limit of 5MB'
    }
  },
  duxiterMD: { type: String, maxlength: 1000000 }, // 1MB limit
  userEmail: { type: String },
  status: { type: Number, default: 200 },
  type: { type: String, default: 'individual' },
  processingTime: { type: String },
  creditsConsumed: { type: Number, default: 0 },
  newSummaryData: { 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        return JSON.stringify(v).length <= 5000000; // 5MB limit
      },
      message: 'newSummaryData exceeds size limit of 5MB'
    }
  },
  aiAnalysis: { type: String, maxlength: 50000 }, // AI analysis text with 50KB limit
  aiAnalysisDate: { type: Date }, // Date when AI analysis was generated
  isPep: { type: Boolean, default: false },
  archived: { type: Boolean, default: false, index: true },
  archivedAt: { type: Date },
}, { timestamps: true });

// Add TTL index for automatic deletion after 30 days (2592000 seconds)
//ResultSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

export const Result = mongoose.models.Result || mongoose.model<IResult>('Result', ResultSchema);
