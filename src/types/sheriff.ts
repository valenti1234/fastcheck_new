export interface DuxiterRiskCategory {
  semaphore: string;
  list: string[];
}

export interface DuxiterRiskData {
  compliance: DuxiterRiskCategory;
  legal: DuxiterRiskCategory;
  capitalHumano: DuxiterRiskCategory;
  financieroTributario: DuxiterRiskCategory;
}

export interface SheriffDataLogResponse {
  _id: string;
  rut: string;
  isMonitoringRequest: boolean;
  fetchedAt: string;
  loadRutData?: object;
  summaryData?: object;
  civilCasesData?: object;
  laboralCasesData?: object;
  cobranzaCasesData?: object;
  moraPrevisionalCasesData?: object;
  multaLaboralCasesData?: object;
  mallaSocietariaData?: object;
  officialDiaryData?: object;
  commercialBulletinCasesData?: object;
  siiData?: object;
  creditScoringData?: object;
  allCallsSucceeded: boolean;
  apiCallErrors?: { step: string; message: string; data?: object }[];
  createdAt: string;
  updatedAt: string;
  duxiterMD?: string;
  duxiterRiskData?: DuxiterRiskData;
  associatedPdfs?: any[];
  isPep?: boolean;
}
