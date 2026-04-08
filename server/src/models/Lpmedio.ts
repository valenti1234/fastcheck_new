import mongoose, { Document, Schema } from 'mongoose';

export interface ILpmedio extends Document {
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

const lpmedioSchema = new Schema<ILpmedio>(
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
      default: 'Mediano Impacto',
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
lpmedioSchema.index({ rut: 1 });
lpmedioSchema.index({ tenant: 1 });
lpmedioSchema.index({ tenant: 1, rut: 1 });

export const Lpmedio = mongoose.model<ILpmedio>('Lpmedio', lpmedioSchema);