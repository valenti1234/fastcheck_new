import mongoose, { Schema, Document } from 'mongoose';

export interface IRiskChangeNotification extends Document {
  rut: string;
  tenantId: string;
  scheduleId: string;
  companyName?: string;
  previousRisk: any;
  newRisk: any;
  changeDetectedAt: Date;
  notificationSent: boolean;
  notificationSentAt?: Date;
  notificationMethod?: 'email' | 'webhook' | 'sms';
  recipientEmail?: string;
  webhookUrl?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RiskChangeNotificationSchema = new Schema<IRiskChangeNotification>({
  rut: {
    type: String,
    required: true,
    index: true
  },
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  scheduleId: {
    type: String,
    required: true,
    index: true
  },
  companyName: {
    type: String
  },
  previousRisk: {
    type: Schema.Types.Mixed,
    required: true
  },
  newRisk: {
    type: Schema.Types.Mixed,
    required: true
  },
  changeDetectedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  notificationSent: {
    type: Boolean,
    default: false,
    index: true
  },
  notificationSentAt: {
    type: Date
  },
  notificationMethod: {
    type: String,
    enum: ['email', 'webhook', 'sms']
  },
  recipientEmail: {
    type: String
  },
  webhookUrl: {
    type: String
  },
  errorMessage: {
    type: String
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
RiskChangeNotificationSchema.index({ tenantId: 1, rut: 1 });
RiskChangeNotificationSchema.index({ tenantId: 1, notificationSent: 1 });
RiskChangeNotificationSchema.index({ changeDetectedAt: 1 });

export const RiskChangeNotification = mongoose.model<IRiskChangeNotification>('RiskChangeNotification', RiskChangeNotificationSchema);