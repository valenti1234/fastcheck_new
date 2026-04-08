import mongoose, { Schema, Document } from 'mongoose';

export interface IUserInfo {
  _id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
}

export interface IConsultaHistoryWithUser extends Omit<IConsultaHistory, 'userId'> {
  userId?: IUserInfo;
}

export interface IConsultaHistory extends Document {
  tenantId: string;
  userId?: string | mongoose.Types.ObjectId;
  consultaType: 'individual' | 'massive';
  rut?: string; // For individual consultations
  ruts?: string[]; // For massive consultations
  endpoint: string; // The endpoint called (e.g., '/rut/lookup', '/rut/fast-check')
  requestData?: any; // Original request data
  responseStatus: number; // HTTP status code
  responseData?: any; // Response data (optional, for successful requests)
  errorMessage?: string; // Error message if any
  processingTime?: number; // Time taken to process in milliseconds
  creditsUsed?: number; // Number of credits consumed
  ipAddress?: string; // Client IP address
  userAgent?: string; // Client user agent
  sessionId?: string; // Session identifier
  metadata?: {
    companyName?: string;
    riskLevel?: string;
    evaluationType?: string;
    batchSize?: number; // For massive evaluations
    [key: string]: any;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ConsultaHistorySchema: Schema = new Schema({
  tenantId: { 
    type: String, 
    required: true, 
    index: true 
  },
  userId: { 
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true 
  },
  consultaType: {
    type: String,
    required: true,
    enum: ['individual', 'massive'],
    index: true
  },
  rut: { 
    type: String, 
    index: true,
    validate: {
      validator: function(this: IConsultaHistory, v: string) {
        // RUT is required for individual consultations
        return this.consultaType === 'massive' || (v && v.length > 0);
      },
      message: 'RUT is required for individual consultations'
    }
  },
  ruts: [{
    type: String,
    validate: {
      validator: function(this: IConsultaHistory, v: string[]) {
        // RUTs array is required for massive consultations
        return this.consultaType === 'individual' || (v && v.length > 0);
      },
      message: 'RUTs array is required for massive consultations'
    }
  }],
  endpoint: { 
    type: String, 
    required: true,
    index: true
  },
  requestData: { 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        if (!v) return true;
        return JSON.stringify(v).length <= 1000000; // 1MB limit
      },
      message: 'requestData exceeds size limit of 1MB'
    }
  },
  responseStatus: { 
    type: Number, 
    required: true,
    index: true
  },
  responseData: { 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        if (!v) return true;
        return JSON.stringify(v).length <= 5000000; // 5MB limit
      },
      message: 'responseData exceeds size limit of 5MB'
    }
  },
  errorMessage: { 
    type: String, 
    maxlength: 10000 
  },
  processingTime: { 
    type: Number, 
    min: 0 
  },
  creditsUsed: { 
    type: Number, 
    min: 0,
    default: 0
  },
  ipAddress: { 
    type: String, 
    maxlength: 45 // IPv6 max length
  },
  userAgent: { 
    type: String, 
    maxlength: 1000 
  },
  sessionId: { 
    type: String, 
    maxlength: 255 
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
    validate: {
      validator: function(v: any) {
        if (!v) return true;
        return JSON.stringify(v).length <= 100000; // 100KB limit
      },
      message: 'metadata exceeds size limit of 100KB'
    }
  }
}, { 
  timestamps: true,
  collection: 'consulta_history'
});

// Create compound indexes for efficient queries
ConsultaHistorySchema.index({ tenantId: 1, createdAt: -1 });
ConsultaHistorySchema.index({ tenantId: 1, consultaType: 1, createdAt: -1 });
ConsultaHistorySchema.index({ tenantId: 1, rut: 1, createdAt: -1 });
ConsultaHistorySchema.index({ tenantId: 1, responseStatus: 1, createdAt: -1 });
ConsultaHistorySchema.index({ tenantId: 1, endpoint: 1, createdAt: -1 });

// TTL index to automatically delete old records after 2 years (730 days)
ConsultaHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 63072000 });

export const ConsultaHistory = mongoose.model<IConsultaHistory>('ConsultaHistory', ConsultaHistorySchema);