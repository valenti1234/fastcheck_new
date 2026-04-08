import { Schema, model, Document } from 'mongoose';

export interface IEvaluationParameter extends Document {
  name: string;
  value: any;
  condicion: string;
  createdAt: Date;
  updatedAt: Date;
}

const EvaluationParameterSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  value: {
    type: Schema.Types.Mixed,
    required: true,
  },
  condicion: {
    type: String,
    required: false,
  },
}, {
  timestamps: true,
});

export default model<IEvaluationParameter>('EvaluationParameter', EvaluationParameterSchema);