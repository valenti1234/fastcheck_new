import mongoose, { Schema, Document } from 'mongoose';

export interface ILey20393 extends Document {
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

const Ley20393Schema: Schema = new Schema({
  rut: { type: String, required: true, index: true },
  razonSocial: { type: String, required: true },
  rolCausa: { type: String, required: true },
  fechaDesde: { type: Date, required: true },
  fechaHasta: { type: Date, required: true },
  duracion: { type: String, required: true },
  motivo: { type: String, required: true },
}, { timestamps: true });

export const Ley20393 = mongoose.model<ILey20393>('Ley20393', Ley20393Schema);