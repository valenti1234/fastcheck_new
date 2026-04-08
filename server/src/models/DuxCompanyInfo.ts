import mongoose, { Schema, Document } from 'mongoose';

export interface IDuxCompanyInfo extends Document {
  rut: string;
  tenantId: string;
  sheriffLogId: mongoose.Types.ObjectId;
  analysisDate: Date;
  companyName?: string;
  totalPartners: number;
  totalAdministrators: number;
  analysisResults: {
    companyGeneralInfo?: {
      count: number;
      partners: any[];
    };
    empresaEnUnDia?: {
      count: number;
      partners: any[];
    };
    diarioOficial?: {
      count: number;
      partners: any[];
    };
  };
  aiAnalysis?: string;
  manualAnalysis?: {
    summary: string;
    details: any;
  };
  createdAt: Date;
  updatedAt: Date;
}

const DuxCompanyInfoSchema: Schema = new Schema({
  rut: { type: String, required: true, index: true },
  tenantId: { type: String, required: true, index: true },
  sheriffLogId: { type: Schema.Types.ObjectId, ref: 'SheriffDataLog', required: true },
  analysisDate: { type: Date, default: Date.now },
  companyName: { type: String },
  totalPartners: { type: Number, default: 0 },
  totalAdministrators: { type: Number, default: 0 },
  analysisResults: {
    companyGeneralInfo: {
      count: { type: Number, default: 0 },
      partners: [{ type: Schema.Types.Mixed }]
    },
    empresaEnUnDia: {
      count: { type: Number, default: 0 },
      partners: [{ type: Schema.Types.Mixed }]
    },
    diarioOficial: {
      count: { type: Number, default: 0 },
      partners: [{ type: Schema.Types.Mixed }]
    }
  },
  aiAnalysis: { type: String },
  manualAnalysis: {
    summary: { type: String },
    details: { type: Schema.Types.Mixed }
  }
}, { timestamps: true });

// Compound index for efficient queries
DuxCompanyInfoSchema.index({ rut: 1, tenantId: 1 });
DuxCompanyInfoSchema.index({ sheriffLogId: 1 });
DuxCompanyInfoSchema.index({ analysisDate: -1 });

export const DuxCompanyInfo = mongoose.model<IDuxCompanyInfo>('DuxCompanyInfo', DuxCompanyInfoSchema);