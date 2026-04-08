export interface TenantBilling {
  _id: string;
  tenantId: string;
  tenantName: string;
  billingPeriod: {
    startDate: string;
    endDate: string;
    month: number;
    year: number;
  };
  usage: {
    totalEvaluations: number;
    totalApiCalls: number;
    totalTokensUsed: number;
    totalStorageUsed: number; // in MB
    totalBandwidthUsed: number; // in MB
  };
  costs: {
    evaluationCost: number;
    apiCallCost: number;
    tokenCost: number;
    storageCost: number;
    bandwidthCost: number;
    totalCost: number;
  };
  invoice: {
    invoiceNumber: string;
    status: 'pending' | 'sent' | 'paid' | 'overdue';
    sentDate?: string;
    paidDate?: string;
    dueDate: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface TrafficReport {
  _id: string;
  tenantId: string;
  tenantName: string;
  reportPeriod: {
    startDate: string;
    endDate: string;
    month: number;
    year: number;
  };
  dailyStats: Array<{
    date: string;
    evaluations: number;
    apiCalls: number;
    tokensUsed: number;
    storageUsed: number;
    bandwidthUsed: number;
  }>;
  summary: {
    totalEvaluations: number;
    totalApiCalls: number;
    totalTokensUsed: number;
    averageDailyEvaluations: number;
    peakDayEvaluations: number;
    peakDate: string;
  };
  createdAt: string;
}

export interface BillingSettings {
  _id: string;
  pricing: {
    evaluationPrice: number;
    apiCallPrice: number;
    tokenPrice: number; // per 1000 tokens
    storagePrice: number; // per GB per month
    bandwidthPrice: number; // per GB
  };
  currency: string;
  taxRate: number; // percentage
  invoiceSettings: {
    daysUntilDue: number;
    autoSend: boolean;
    emailTemplate: string;
  };
  updatedAt: string;
}

export interface InvoiceFilters {
  tenantId?: string;
  status?: string;
  month?: number;
  year?: number;
  startDate?: string;
  endDate?: string;
}

export interface TrafficReportFilters {
  tenantId?: string;
  month?: number;
  year?: number;
  startDate?: string;
  endDate?: string;
}

// Credit Management Interfaces
export interface CreditOperation {
  _id: string;
  tenantId: string;
  operationType: 'evaluation' | 'api_call' | 'credit_purchase' | 'credit_refund';
  creditsUsed: number;
  creditsRemaining: number;
  description: string;
  metadata?: {
    evaluationId?: string;
    evaluationType?: 'single' | 'bulk';
    supplierRut?: string;
    supplierName?: string;
    userId?: string;
  };
  createdAt: string;
}

export interface TenantCreditBalance {
  tenantId: string;
  tenantName: string;
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
  lastOperation?: CreditOperation;
  updatedAt: string;
}

export interface CreditDeductionRequest {
  tenantId: string;
  operationType: 'evaluation' | 'api_call';
  creditsToDeduct: number;
  description: string;
  metadata?: {
    evaluationId?: string;
    evaluationType?: 'single' | 'bulk';
    supplierRut?: string;
    supplierName?: string;
    userId?: string;
  };
}

export interface CreditDeductionResponse {
  success: boolean;
  message: string;
  operation?: CreditOperation;
  remainingCredits?: number;
}

// Credit Statistics Types
export interface CreditStats {
  period: {
    month: number;
    year: number;
    startDate: string;
    endDate: string;
  };
  overview: {
    totalOperations: number;
    totalCreditsChanged: number;
    totalCreditsAdded: number;
    totalCreditsDeducted: number;
    averageOperationValue: number;
  };
  tenantStats: Array<{
    tenantId: string;
    tenantName: string;
    totalOperations: number;
    totalCreditsChanged: number;
    totalCreditsAdded: number;
    totalCreditsDeducted: number;
    currentBalance: number;
  }>;
  operationTypeStats: Array<{
    _id: string;
    count: number;
    totalCreditsChanged: number;
  }>;
  topTenantBalances: Array<{
    tenantId: string;
    tenantName: string;
    currentBalance: number;
  }>;
}