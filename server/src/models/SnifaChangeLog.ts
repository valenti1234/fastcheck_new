import mongoose, { Schema, Document } from 'mongoose';

export interface ISnifaChangeLog extends Document {
  recordId: mongoose.Types.ObjectId;
  userId: string;
  userEmail?: string;
  changedAt: Date;
  reason?: string;
  before: Record<string, any>;
  after: Record<string, any>;
}

const SnifaChangeLogSchema: Schema = new Schema({
  recordId: { type: Schema.Types.ObjectId, ref: 'SnifaSancionatorio', required: true, index: true },
  userId: { type: String, required: true, index: true },
  userEmail: { type: String, required: false },
  changedAt: { type: Date, required: true, default: () => new Date(), index: true },
  reason: { type: String, required: false, trim: true },
  before: { type: Schema.Types.Mixed, required: true },
  after: { type: Schema.Types.Mixed, required: true }
}, { timestamps: true });

SnifaChangeLogSchema.index({ recordId: 1, changedAt: -1 });
SnifaChangeLogSchema.index({ userId: 1, changedAt: -1 });

export const SnifaChangeLog = mongoose.model<ISnifaChangeLog>('SnifaChangeLog', SnifaChangeLogSchema);

