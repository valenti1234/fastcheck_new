import mongoose, { Document, Schema } from 'mongoose';

export interface ILpalto extends Document {
  rut: string;
  nombre: string;
  tipoPersona: 'Empresa' | 'Persona';
  tipoLista: string;
  nombreSubLista: string;
  fechaIncorporacion: Date;
  tenant: string;
  createdAt: Date;
  updatedAt: Date;
}

const lpaltoSchema = new Schema<ILpalto>(
  {
    rut: {
      type: String,
      required: true,
      trim: true,
    },
    nombre: {
      type: String,
      required: true,
      trim: true,
    },
    tipoPersona: {
      type: String,
      required: true,
      enum: ['Empresa', 'Persona'],
    },
    tipoLista: {
      type: String,
      required: true,
      default: 'Alto Impacto',
    },
    nombreSubLista: {
      type: String,
      required: true,
    },
    fechaIncorporacion: {
      type: Date,
      required: true,
    },
    tenant: {
      type: String,
      required: true,
      ref: 'Tenant',
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes for faster queries
lpaltoSchema.index({ rut: 1 });
lpaltoSchema.index({ tenant: 1 });
lpaltoSchema.index({ tenant: 1, rut: 1 });

export const Lpalto = mongoose.model<ILpalto>('Lpalto', lpaltoSchema);