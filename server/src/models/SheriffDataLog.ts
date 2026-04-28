import mongoose, { Schema, Document } from 'mongoose';

const SHERIFF_DATA_LOG_TTL_SECONDS = (() => {
  const fallback = 86400;
  const parsed = Number.parseInt(process.env.SHERIFF_DATA_LOG_TTL_SECONDS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
})();

// Define interfaces for the data from each Sheriff API call
// These are placeholders and should be refined based on actual API responses if possible
interface GenericApiResponseData { [key: string]: any; }

export interface ISheriffDataLog extends Document {
  rut: string;
  tenantId: string; // Added tenantId field for tenant isolation
  isMonitoringRequest: boolean; // From the initial request to our service
  fetchedAt: Date;
  allCallsSucceeded: boolean;
  apiCallErrors: { step: string; message: string; data?: any }[]; // Renamed from 'errors'
  associatedPdfs?: {
    sourcePath: string; // e.g., "mallaSocietariaData.socios[0].linkPdf"
    originalUrl: string;
    documentTitle?: string; // If available from source data
    contentBase64?: string;
    contentType?: string; // e.g., "application/pdf"
    downloadedAt?: Date;
    error?: string;
  }[];
  aiSummaryMarkdown?: string; // Added field for AI-generated summary
  duxiterMD?: string;
  summaryData?: any;
  mallaSocietariaData?: any;
  officialDiaryData?: any;
  civilCasesData?: any;
  laboralCasesData?: any;
  cobranzaCasesData?: any;
  moraPrevisionalCasesData?: any;
  multaLaboralCasesData?: any;
  commercialBulletinCasesData?: any;
  companyGeneralInfo?: any;
  filteredDetails?: any;
  createdAt: Date;
  updatedAt: Date;
}

const SheriffDataLogSchema: Schema = new Schema({
  rut: { type: String, required: true, index: true },
  tenantId: { type: String, required: true, index: true }, // Added tenantId field with index
  isMonitoringRequest: { type: Boolean, required: true },
  fetchedAt: { type: Date, default: Date.now },
  allCallsSucceeded: { type: Boolean, required: true, default: false },
  apiCallErrors: [{
    step: String,
    message: String,
    data: Schema.Types.Mixed,
  }],
  associatedPdfs: [{
    sourcePath: String,
    originalUrl: String,
    documentTitle: String,
    contentBase64: String,
    contentType: String,
    downloadedAt: Date,
    error: String,
  }],
  aiSummaryMarkdown: { type: String, maxlength: 1000000 }, // 1MB limit
  duxiterMD: { type: String, maxlength: 1000000 }, // 1MB limit
  summaryData: { 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        return JSON.stringify(v).length <= 15000000; // 15MB limit
      },
      message: 'summaryData exceeds size limit of 15MB'
    }
  },
  mallaSocietariaData: { 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        return JSON.stringify(v).length <= 10000000; // 10MB limit
      },
      message: 'mallaSocietariaData exceeds size limit of 10MB'
    }
  },
  officialDiaryData: { 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        return JSON.stringify(v).length <= 10000000; // 10MB limit
      },
      message: 'officialDiaryData exceeds size limit of 10MB'
    }
  },
  civilCasesData: { 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        return JSON.stringify(v).length <= 10000000; // 10MB limit
      },
      message: 'civilCasesData exceeds size limit of 10MB'
    }
  },
  laboralCasesData: { 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        return JSON.stringify(v).length <= 10000000; // 10MB limit
      },
      message: 'laboralCasesData exceeds size limit of 10MB'
    }
  },
  cobranzaCasesData: { 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        return JSON.stringify(v).length <= 10000000; // 10MB limit
      },
      message: 'cobranzaCasesData exceeds size limit of 10MB'
    }
  },
  moraPrevisionalCasesData: { 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        return JSON.stringify(v).length <= 10000000; // 10MB limit
      },
      message: 'moraPrevisionalCasesData exceeds size limit of 10MB'
    }
  },
  multaLaboralCasesData: { 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        return JSON.stringify(v).length <= 10000000; // 10MB limit
      },
      message: 'multaLaboralCasesData exceeds size limit of 10MB'
    }
  },
  commercialBulletinCasesData: { 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        return JSON.stringify(v).length <= 10000000; // 10MB limit
      },
      message: 'commercialBulletinCasesData exceeds size limit of 10MB'
    }
  },
}, { timestamps: true }); // Adds createdAt and updatedAt

// Add TTL index to automatically delete documents after 24 hours
SheriffDataLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: SHERIFF_DATA_LOG_TTL_SECONDS }); // 24 hours = 86400 seconds

export const SheriffDataLog = mongoose.model<ISheriffDataLog>('SheriffDataLog', SheriffDataLogSchema);
