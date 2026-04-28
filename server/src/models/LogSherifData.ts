import mongoose, { Schema, Document } from 'mongoose';

const LOG_SHERIFF_DATA_TTL_SECONDS = (() => {
  const fallback = 86400;
  const parsed = Number.parseInt(process.env.LOG_SHERIFF_DATA_TTL_SECONDS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
})();

export interface IlogSherifData extends Document {
   sheriffLogData: any;
}

const logSherifSchema: Schema = new Schema({
   sheriffLogData: { type: Schema.Types.Mixed },
}, { timestamps: true });

// Add TTL index to automatically delete documents after 24 hours
logSherifSchema.index({ createdAt: 1 }, { expireAfterSeconds: LOG_SHERIFF_DATA_TTL_SECONDS }); // 24 hours = 86400 seconds

export const logSherifData = mongoose.model<IlogSherifData>('logSherifData', logSherifSchema);
