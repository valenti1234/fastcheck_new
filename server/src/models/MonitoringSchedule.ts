import mongoose, { Document, Schema } from 'mongoose';

export interface IMonitoringSchedule extends Document {
  rut: string;
  tenantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  companyName?: string;
  frequency: 'minute' | 'daily' | 'weekly' | 'monthly';
  isActive: boolean;
  lastExecuted?: Date;
  nextExecution: Date;
  createdAt: Date;
  updatedAt: Date;
  executionCount: number;
  lastExecutionStatus?: 'success' | 'error' | 'pending';
  lastExecutionError?: string;
  lastLogId?: string; // Reference to the last SheriffDataLog created
}

const MonitoringScheduleSchema = new Schema<IMonitoringSchedule>({
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
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  companyName: {
    type: String,
    required: false
  },
  frequency: {
    type: String,
    enum: ['minute', 'daily', 'weekly', 'monthly'],
    required: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  lastExecuted: {
    type: Date,
    required: false
  },
  nextExecution: {
    type: Date,
    required: true,
    index: true
  },
  executionCount: {
    type: Number,
    default: 0
  },
  lastExecutionStatus: {
    type: String,
    enum: ['success', 'error', 'pending'],
    required: false
  },
  lastExecutionError: {
    type: String,
    required: false
  },
  lastLogId: {
    type: String,
    required: false
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
MonitoringScheduleSchema.index({ tenantId: 1, rut: 1 }, { unique: true });
MonitoringScheduleSchema.index({ isActive: 1, nextExecution: 1 });

export const MonitoringSchedule = mongoose.model<IMonitoringSchedule>('MonitoringSchedule', MonitoringScheduleSchema);