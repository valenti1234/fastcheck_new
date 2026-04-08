import mongoose, { Document, Schema } from 'mongoose';

export interface IPromptConfiguration extends Document {
  name: string;
  description: string;
  promptTemplate: string;
  category: 'seekData' | 'analyzeSheriffData' | 'analyzeEvaluationParameters';
  isActive: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const PromptConfigurationSchema: Schema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  promptTemplate: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['seekData', 'analyzeSheriffData', 'analyzeEvaluationParameters']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: String,
    required: true
  },
  updatedBy: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Indice per garantire che ci sia solo un prompt attivo per categoria
PromptConfigurationSchema.index({ category: 1, isActive: 1 }, { 
  unique: true, 
  partialFilterExpression: { isActive: true } 
});

export const PromptConfiguration = mongoose.model<IPromptConfiguration>('PromptConfiguration', PromptConfigurationSchema);