import mongoose, { Schema, Document } from 'mongoose';

export interface ISnifaSancionatorio extends Document {
  procesoSancionId: number;
  expediente: string;
  procesoSancionTipoNombre: string;
  procesoSancionEstado: string;
  fechaInicio: Date;
  fechaTermino?: Date;
  confirmaPdC?: string;
  multaTotalUTA?: number;
  linkSNIFA?: string;
  unidadFiscalizableId?: number;
  nombre: string;
  regionNombre: string;
  comunaNombre?: string;
  latitud?: number;
  longitud?: number;
  categoriaEconomicaNombre: string;
  subCategoriaEconomicaNombre?: string;
  linkSNIFA_UF?: string;
  fechaActualizacion?: Date;
  uploadedBy?: string;
  
  // Nuevos campos del Excel
  razonSocial?: string;
  rut?: string;
  unidadFiscalizable?: string;
  lista?: string;
  fastCheckProcesoSancionatorio?: string;
  fastCheckSanciones?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

const SnifaSancionatorioSchema: Schema = new Schema({
  procesoSancionId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  expediente: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  procesoSancionTipoNombre: {
    type: String,
    required: true,
    trim: true
  },
  procesoSancionEstado: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  fechaInicio: {
    type: Date,
    required: true,
    index: true
  },
  fechaTermino: {
    type: Date,
    required: false
  },
  confirmaPdC: {
    type: String,
    required: false,
    trim: true
  },
  multaTotalUTA: {
    type: Number,
    required: false,
    index: true
  },
  linkSNIFA: {
    type: String,
    required: false,
    trim: true
  },
  unidadFiscalizableId: {
    type: Number,
    required: false,
    index: true
  },
  nombre: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  regionNombre: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  comunaNombre: {
    type: String,
    required: false,
    trim: true,
    index: true
  },
  latitud: {
    type: Number,
    required: false
  },
  longitud: {
    type: Number,
    required: false
  },
  categoriaEconomicaNombre: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  subCategoriaEconomicaNombre: {
    type: String,
    required: false,
    trim: true
  },
  linkSNIFA_UF: {
    type: String,
    required: false,
    trim: true
  },
  fechaActualizacion: {
    type: Date,
    required: false
  },
  uploadedBy: {
    type: String,
    required: false,
    trim: true
  },
  
  // Nuevos campos mapeados
  razonSocial: {
    type: String,
    required: false,
    trim: true,
    index: true
  },
  rut: {
    type: String,
    required: false,
    trim: true,
    index: true
  },
  unidadFiscalizable: {
    type: String,
    required: false,
    trim: true,
    index: true
  },
  lista: {
    type: String,
    required: false,
    trim: true
  },
  fastCheckProcesoSancionatorio: {
    type: String,
    required: false,
    trim: true
  },
  fastCheckSanciones: {
    type: String,
    required: false,
    trim: true
  }
}, {
  timestamps: true,
  collection: 'snifasancionatorios'
});

// Indices compuestos para búsquedas frecuentes
SnifaSancionatorioSchema.index({ nombre: 'text', razonSocial: 'text', expediente: 'text' });
SnifaSancionatorioSchema.index({ rut: 1 });

export const SnifaSancionatorio = mongoose.model<ISnifaSancionatorio>('SnifaSancionatorio', SnifaSancionatorioSchema);
