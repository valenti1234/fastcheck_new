import mongoose, { Schema, Document } from 'mongoose';

export interface ICompanyDetails extends Document {
  rut: string;
  tenantId: mongoose.Types.ObjectId; // Reference to the Tenant document
  razonSocial?: string;
  presentaActividades?: string;
  inicioActividades?: string;
  autorizadoMonedaExtranjera?: string;
  empresaMenor?: string;
  observaciones?: string;
  notas?: string;
  situacionActual?: string;
  fetchedAt?: Date;
  creditScoringData?: any;
  compliance?: any;
  boletinComercialSummary?: any;
  boletinLaboralSummary?: any;
  boletinLaboralLastUpdate?: any;
  vehiclesSummary?: any;
  propertiesSummary?: any;
  deudaBancariaSummary?: any;
  mallaSocietariaData?: any;
  officialDiaryData?: any;
  civilCasesData?: any;
  laboralCasesData?: any;
  cobranzaCasesData?: any;
  moraPrevisionalCasesData?: any;
  multaLaboralCasesData?: any;
  commercialBulletinCasesData?: any;
  timestampsSubHelpers?: any;
  ratings?: any;
  complianceId?: string;
  complianceRisk?: string;
  complianceCreatedAt?: Date;
  complianceUpdatedAt?: Date;
  complianceName?: string;
  complianceSecondName?: string;
  complianceSurname?: string;
  complianceSecondSurname?: string;
  compliancePersonType?: string;
  complianceScrappedRutId?: string;
  complianceUserId?: string;
  complianceCorporationId?: string;
  complianceSelectedRowsSocietaryMesh?: any[];
  complianceSelectedRowsPepChile?: any[];
  complianceSelectedRowsPublicOfficial?: any[];
  complianceSelectedRowsPepChileFamily?: any[];
  complianceSelectedRowsBlacklist?: any[];
  complianceSelectedRowsPenal?: any[];
  complianceSelectedRowsNews?: any[];
  complianceLastDataUpdate?: Date;
  complianceSummary?: any[];
  allCallsSucceeded?: boolean;
  resultId?: mongoose.Types.ObjectId; // Reference to the Result document
  sheriffLogId?: mongoose.Types.ObjectId; // Reference to the SheriffDataLog document
  createdAt: Date;
  updatedAt: Date;
}

const CompanyDetailsSchema: Schema = new Schema({
  rut: { type: String, required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  razonSocial: { type: String },
  presentaActividades: { type: String },
  inicioActividades: { type: String },
  autorizadoMonedaExtranjera: { type: String },
  empresaMenor: { type: String },
  observaciones: { type: String },
  notas: { type: String },
  situacionActual: { type: String },
  fetchedAt: { type: Date },
  creditScoringData: { type: Schema.Types.Mixed },
  compliance: { type: Schema.Types.Mixed },
  boletinComercialSummary: { type: Schema.Types.Mixed },
  boletinLaboralSummary: { type: Schema.Types.Mixed },
  boletinLaboralLastUpdate: { type: Schema.Types.Mixed },
  vehiclesSummary: { type: Schema.Types.Mixed },
  propertiesSummary: { type: Schema.Types.Mixed },
  deudaBancariaSummary: { type: Schema.Types.Mixed },
  mallaSocietariaData: { type: Schema.Types.Mixed },
  officialDiaryData: { type: Schema.Types.Mixed },
  civilCasesData: { type: Schema.Types.Mixed },
  laboralCasesData: { type: Schema.Types.Mixed },
  cobranzaCasesData: { type: Schema.Types.Mixed },
  moraPrevisionalCasesData: { type: Schema.Types.Mixed },
  multaLaboralCasesData: { type: Schema.Types.Mixed },
  commercialBulletinCasesData: { type: Schema.Types.Mixed },
  timestampsSubHelpers: { type: Schema.Types.Mixed },
  ratings: { type: Schema.Types.Mixed },
  complianceId: { type: String },
  complianceRisk: { type: String },
  complianceCreatedAt: { type: Date },
  complianceUpdatedAt: { type: Date },
  complianceName: { type: String },
  complianceSecondName: { type: String },
  complianceSurname: { type: String },
  complianceSecondSurname: { type: String },
  compliancePersonType: { type: String },
  complianceScrappedRutId: { type: String },
  complianceUserId: { type: String },
  complianceCorporationId: { type: String },
  complianceSelectedRowsSocietaryMesh: [{ type: Schema.Types.Mixed }],
  complianceSelectedRowsPepChile: [{ type: Schema.Types.Mixed }],
  complianceSelectedRowsPublicOfficial: [{ type: Schema.Types.Mixed }],
  complianceSelectedRowsPepChileFamily: [{ type: Schema.Types.Mixed }],
  complianceSelectedRowsBlacklist: [{ type: Schema.Types.Mixed }],
  complianceSelectedRowsPenal: [{ type: Schema.Types.Mixed }],
  complianceSelectedRowsNews: [{ type: Schema.Types.Mixed }],
  complianceLastDataUpdate: { type: Date },
  complianceSummary: [{ type: Schema.Types.Mixed }],
  allCallsSucceeded: { type: Boolean },
  resultId: { type: Schema.Types.ObjectId, ref: 'Result' },
  sheriffLogId: { type: Schema.Types.ObjectId, ref: 'SheriffDataLog' },
}, { timestamps: true });

export const CompanyDetails = mongoose.model<ICompanyDetails>('CompanyDetails', CompanyDetailsSchema);