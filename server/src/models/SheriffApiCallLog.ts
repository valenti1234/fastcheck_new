import mongoose, { Schema, Document } from 'mongoose';

const SHERIFF_API_CALL_LOG_TTL_SECONDS = (() => {
  const fallback = 86400;
  const parsed = Number.parseInt(process.env.SHERIFF_API_CALL_LOG_TTL_SECONDS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
})();

export interface ISheriffApiCallLog extends Document {
  rut: string;
  logId: mongoose.Types.ObjectId; // Reference to the main SheriffDataLog
  callName: string;
  data: any;
  createdAt: Date;
}

const SheriffApiCallLogSchema: Schema = new Schema({
  rut: { type: String, required: true, index: true },
  logId: { type: Schema.Types.ObjectId, ref: 'SheriffDataLog', required: true, index: true },
  callName: { type: String, required: true },
  data: { 
    type: Schema.Types.Mixed,
    validate: {
      validator: function(v: any) {
        return JSON.stringify(v).length <= 10000000; // 10MB limit
      },
      message: 'API call data exceeds size limit of 10MB'
    }
  },
}, { timestamps: { createdAt: true, updatedAt: false } }); // Only track creation time

// Add TTL index to automatically delete documents after 24 hours
SheriffApiCallLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: SHERIFF_API_CALL_LOG_TTL_SECONDS }); // 24 hours = 86400 seconds

export const SheriffApiCallLog = mongoose.model<ISheriffApiCallLog>('SheriffApiCallLog', SheriffApiCallLogSchema);
