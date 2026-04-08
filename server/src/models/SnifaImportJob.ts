import mongoose, { Schema, Document } from 'mongoose';

export interface ISnifaImportJob extends Document {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'canceled';
  startedAt?: Date;
  completedAt?: Date;
  processed: number;
  saved: number;
  duplicates: number;
  errorCount: number;
  errorDetails?: Array<{ rowIndex: number; error: string }>;
  warnings?: Array<{ rowIndex: number; warning: string }>;
  total?: number;
  createdBy: string;
}

const SnifaImportJobSchema: Schema = new Schema({
  status: { type: String, enum: ['pending', 'processing', 'completed', 'failed', 'canceled'], default: 'pending', index: true },
  startedAt: { type: Date },
  completedAt: { type: Date },
  processed: { type: Number, default: 0 },
  saved: { type: Number, default: 0 },
  duplicates: { type: Number, default: 0 },
  errorCount: { type: Number, default: 0 },
  errorDetails: [{
    rowIndex: Number,
    error: String
  }],
  warnings: [{
    rowIndex: Number,
    warning: String
  }],
  total: { type: Number },
  createdBy: { type: String, required: true }
}, { timestamps: true });

SnifaImportJobSchema.index({ createdAt: -1 });

export const SnifaImportJob = mongoose.model<ISnifaImportJob>('SnifaImportJob', SnifaImportJobSchema);
