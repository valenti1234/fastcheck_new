import mongoose, { Schema, Document } from 'mongoose';

export interface ICompanyRisks extends Document {
  rut: string;
  tenantId: mongoose.Types.ObjectId; // Reference to the Tenant document
  newSummaryData?: any;
  duxiterFilter?: any;
  duxiterRiskLevel?: string;
  duxiterRiskData?: any;
  duxiterRiskList?: {
    compliance?: any[];
    legal?: any[];
    capitalHumano?: any[];
    financieroTributario?: any[];
  };
  duxiterMD?: string;
  riskAssessment?: {
    globalSemaphore?: string;
    riskData?: any;
  };
  vistaDuxiter?: any[];
  resultId?: mongoose.Types.ObjectId; // Reference to the Result document
  sheriffLogId?: mongoose.Types.ObjectId; // Reference to the SheriffDataLog document
  createdAt: Date;
  updatedAt: Date;
}

const CompanyRisksSchema: Schema = new Schema({
  rut: { type: String, required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  newSummaryData: { type: Schema.Types.Mixed },
  duxiterFilter: { type: Schema.Types.Mixed },
  duxiterRiskLevel: { type: String },
  duxiterRiskData: { type: Schema.Types.Mixed },
  duxiterRiskList: {
    compliance: [{ type: Schema.Types.Mixed }],
    legal: [{ type: Schema.Types.Mixed }],
    capitalHumano: [{ type: Schema.Types.Mixed }],
    financieroTributario: [{ type: Schema.Types.Mixed }]
  },
  duxiterMD: { type: String },
  riskAssessment: {
    globalSemaphore: { type: String },
    riskData: { type: Schema.Types.Mixed }
  },
  vistaDuxiter: [{ type: Schema.Types.Mixed }],
  resultId: { type: Schema.Types.ObjectId, ref: 'Result' },
  sheriffLogId: { type: Schema.Types.ObjectId, ref: 'SheriffDataLog' },
}, { timestamps: true });

export const CompanyRisks = mongoose.model<ICompanyRisks>('CompanyRisks', CompanyRisksSchema);