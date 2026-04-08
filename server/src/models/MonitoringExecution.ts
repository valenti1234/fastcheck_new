import mongoose, { Document, Schema } from 'mongoose';

export interface IMonitoringExecution extends Document {
  scheduleId: mongoose.Types.ObjectId;
  rut: string;
  tenantId: mongoose.Types.ObjectId;
  executedAt: Date;
  status: 'success' | 'error' | 'pending' | 'running';
  startedAt: Date;
  completedAt?: Date;
  duration?: number; // in milliseconds
  error?: string;
  errorDetails?: {
    code?: string;
    message?: string;
    stack?: string;
  };
  riskAssessment?: any; // The risk assessment result
  previousRisk?: any; // Previous risk for comparison
  riskChanged: boolean;
  sheriffLogId?: mongoose.Types.ObjectId; // Reference to SheriffDataLog
  executionDetails: {
    requestData?: any;
    responseData?: any;
    apiCalls?: Array<{
      endpoint: string;
      method: string;
      timestamp: Date;
      duration: number;
      status: number;
      error?: string;
    }>;
    processingSteps?: Array<{
      step: string;
      timestamp: Date;
      duration: number;
      status: 'success' | 'error' | 'skipped';
      details?: any;
    }>;
  };
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
    triggeredBy: 'schedule' | 'manual' | 'api';
    triggeredByUserId?: mongoose.Types.ObjectId;
  };
  createdAt: Date;
  updatedAt: Date;
}

const MonitoringExecutionSchema = new Schema<IMonitoringExecution>({
  scheduleId: {
    type: Schema.Types.ObjectId,
    ref: 'MonitoringSchedule',
    required: true,
    index: true
  },
  rut: {
    type: String,
    required: true,
    index: true
  },
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  executedAt: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['success', 'error', 'pending', 'running'],
    required: true,
    index: true
  },
  startedAt: {
    type: Date,
    required: true
  },
  completedAt: {
    type: Date,
    required: false
  },
  duration: {
    type: Number,
    required: false
  },
  error: {
    type: String,
    required: false
  },
  errorDetails: {
    code: String,
    message: String,
    stack: String
  },
  riskAssessment: {
    type: Schema.Types.Mixed,
    required: false
  },
  previousRisk: {
    type: Schema.Types.Mixed,
    required: false
  },
  riskChanged: {
    type: Boolean,
    default: false,
    index: true
  },
  sheriffLogId: {
    type: Schema.Types.ObjectId,
    ref: 'SheriffDataLog',
    required: false
  },
  executionDetails: {
    requestData: Schema.Types.Mixed,
    responseData: Schema.Types.Mixed,
    apiCalls: [{
      endpoint: String,
      method: String,
      timestamp: Date,
      duration: Number,
      status: Number,
      error: String
    }],
    processingSteps: [{
      step: String,
      timestamp: Date,
      duration: Number,
      status: {
        type: String,
        enum: ['success', 'error', 'skipped']
      },
      details: Schema.Types.Mixed
    }]
  },
  metadata: {
    userAgent: String,
    ipAddress: String,
    triggeredBy: {
      type: String,
      enum: ['schedule', 'manual', 'api'],
      required: true
    },
    triggeredByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false
    }
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
MonitoringExecutionSchema.index({ scheduleId: 1, executedAt: -1 });
MonitoringExecutionSchema.index({ tenantId: 1, executedAt: -1 });
MonitoringExecutionSchema.index({ rut: 1, executedAt: -1 });
MonitoringExecutionSchema.index({ status: 1, executedAt: -1 });

export const MonitoringExecution = mongoose.model<IMonitoringExecution>('MonitoringExecution', MonitoringExecutionSchema);