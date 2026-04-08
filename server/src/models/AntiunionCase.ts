import mongoose, { Schema, Document } from 'mongoose';

export interface IAntiunionCase extends Document {
  rut: string;
  companyName: string;
  rit: string;
  tribunal: string;
  date: Date;
  description: string;
  complaintType: 'DT' | 'PARTICULAR' | 'UNKNOWN';
  fineAmount: string;
  pdfFileName?: string;
  pdfPath?: string;
  uploadedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AntiunionCaseSchema: Schema = new Schema({
  rut: { 
    type: String, 
    required: true, 
    index: true,
    trim: true
  },
  companyName: { 
    type: String, 
    required: true,
    trim: true
  },
  rit: { 
    type: String, 
    required: true,
    trim: true
  },
  tribunal: { 
    type: String, 
    required: true,
    trim: true
  },
  date: { 
    type: Date, 
    required: true 
  },
  description: { 
    type: String, 
    required: true 
  },
  complaintType: { 
    type: String, 
    enum: ['DT', 'PARTICULAR', 'UNKNOWN'],
    default: 'UNKNOWN'
  },
  fineAmount: { 
    type: String, 
    required: true,
    trim: true
  },
  pdfFileName: {
    type: String,
    required: false
  },
  pdfPath: {
    type: String,
    required: false
  },
  uploadedBy: {
    type: String,
    required: false
  }
}, { timestamps: true });

// Indici per migliorare le performance delle query
AntiunionCaseSchema.index({ rut: 1 });
AntiunionCaseSchema.index({ companyName: 1 });
AntiunionCaseSchema.index({ date: -1 });
AntiunionCaseSchema.index({ tribunal: 1 });

export const AntiunionCase = mongoose.model<IAntiunionCase>('AntiunionCase', AntiunionCaseSchema);