import mongoose, { Schema, Document } from 'mongoose';

export interface IlogSherifData extends Document {
   sheriffLogData: any;
}

const logSherifSchema: Schema = new Schema({
   sheriffLogData: { type: Schema.Types.Mixed },
}, { timestamps: true });

// Add TTL index to automatically delete documents after 24 hours
logSherifSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 }); // 24 hours = 86400 seconds

export const logSherifData = mongoose.model<IlogSherifData>('logSherifData', logSherifSchema);