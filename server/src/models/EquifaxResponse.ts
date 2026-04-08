import mongoose, { Schema, Document } from 'mongoose';

const EQUIFAX_RESPONSE_TTL_SECONDS = Number.parseInt(process.env.EQUIFAX_RESPONSE_TTL_SECONDS || '604800', 10);

export interface IEquifaxResponse extends Document {
  tenantId: string;
  rut: string;
  environment: 'uat' | 'prod' | string;
  requestType?: string; // e.g., 'RUT'
  endpoint?: string; // e.g., '/transaction/uat/rut-only'
  success: boolean;
  statusCode?: number;
  responseTime?: number;
  errorMessage?: string;
  requestPayload?: any;
  data?: any; // raw Equifax response
  normalizedData?: any; // optional normalized subset used by app
  cacheInfo?: any; // _cache_info from provider if present
  createdAt: Date;
  updatedAt: Date;
}

const EquifaxResponseSchema: Schema = new Schema({
  tenantId: { type: String, required: true, index: true },
  rut: { type: String, required: true, index: true },
  environment: { type: String, required: true, index: true },
  requestType: { type: String, default: 'RUT' },
  endpoint: { type: String },
  success: { type: Boolean, required: true, index: true },
  statusCode: { type: Number, index: true },
  responseTime: { type: Number, min: 0 },
  errorMessage: { type: String, maxlength: 10000 },
  requestPayload: {
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        if (!v) return true;
        return JSON.stringify(v).length <= 1000000; // 1MB limit
      },
      message: 'requestPayload exceeds size limit of 1MB'
    }
  },
  data: {
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        if (!v) return true;
        return JSON.stringify(v).length <= 10000000; // 10MB limit
      },
      message: 'response data exceeds size limit of 10MB'
    }
  },
  normalizedData: {
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        if (!v) return true;
        return JSON.stringify(v).length <= 2000000; // 2MB limit
      },
      message: 'normalizedData exceeds size limit of 2MB'
    }
  },
  cacheInfo: {
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        if (!v) return true;
        return JSON.stringify(v).length <= 200000; // 200KB limit
      },
      message: 'cacheInfo exceeds size limit of 200KB'
    }
  }
}, { 
  timestamps: true,
  collection: 'equifax-responses'
});

// Helpful compound indexes
EquifaxResponseSchema.index({ tenantId: 1, rut: 1, createdAt: -1 });
EquifaxResponseSchema.index({ tenantId: 1, environment: 1, createdAt: -1 });
EquifaxResponseSchema.index({ createdAt: 1 }, { expireAfterSeconds: EQUIFAX_RESPONSE_TTL_SECONDS });

export const EquifaxResponse = mongoose.model<IEquifaxResponse>('EquifaxResponse', EquifaxResponseSchema);