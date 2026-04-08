export interface EvaluationJob {
  id: string;
  tenantId: string;
  createdBy: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  type: 'single' | 'bulk';
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  supplierData?: { // Added optional supplierData
    rut: string;
    name?: string;
  };
  totalEvaluations: number;
  completedEvaluations: number;
}

export interface InherentRiskData {
  rut: string;
  razonSocial: string;
  riskLevel: string;
  creditScoring: any;
}

export interface SupplierData {
  rut: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  category?: string;
}

export interface EvaluationResult {
  id: string;
  jobId: string;
  supplierRut: string;
  supplierName: string | null;
  status: 'completed' | 'failed' | 'skipped';
  score: number | null;
  legalScore: number | null;
  financialScore: number | null;
  complianceScore: number | null;
  createdAt: string;
  completedAt: string | null;
  error?: string;
  details: {
    legalStatus: 'active' | 'inactive' | 'unknown';
    incorporationDate: string | null;
    financialRisk: 'low' | 'medium' | 'high' | 'unknown';
    creditReport: {
      score: number | null;
      hasDebt: boolean;
      debtAmount: number | null;
    };
    governmentContracts: number;
    judicialRecords: number;
    complianceFlags: string[];
  };
}