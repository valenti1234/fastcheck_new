import mongoose, { Schema, Document } from 'mongoose';

export interface ILey21121 extends Document {
  rut: string;
  razonSocial: string;
  rolCausa: string;
  fechaDesde: Date;
  fechaHasta: Date;
  duracion: string;
  motivo: string;
  createdAt: Date;
  updatedAt: Date;
}

const Ley21121Schema: Schema = new Schema({
  rut: { type: String, required: true, index: true },
  razonSocial: { type: String, required: true },
  rolCausa: { type: String, required: true },
  fechaDesde: { type: Date, required: true },
  fechaHasta: { type: Date, required: true },
  duracion: { type: String, required: true },
  motivo: { type: String, required: true },
}, { timestamps: true });

export const Ley21121 = mongoose.model<ILey21121>('Ley21121', Ley21121Schema);