import { apiClient } from './api';
import { 
  TenantBilling, 
  TrafficReport, 
  BillingSettings, 
  InvoiceFilters, 
  TrafficReportFilters,
  CreditOperation,
  TenantCreditBalance,
  CreditDeductionRequest,
  CreditDeductionResponse,
  CreditStats
} from '../types/billing';

export const billingService = {
  // Billing/Invoice management
  async getBillings(filters?: InvoiceFilters, page = 1, limit = 10) {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    });
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, value.toString());
        }
      });
    }
    
    const response = await apiClient.get(`/admin/billing?${params}`);
    return response.data;
  },

  async getBillingById(billingId: string) {
    const response = await apiClient.get(`/admin/billing/${billingId}`);
    return response.data;
  },

  async generateMonthlyBilling(tenantId: string, month: number, year: number) {
    const response = await apiClient.post('/admin/billing/generate', {
      tenantId,
      month,
      year
    });
    return response.data;
  },

  async generateAllMonthlyBillings(month: number, year: number) {
    const response = await apiClient.post('/admin/billing/generate-all', {
      month,
      year
    });
    return response.data;
  },

  async updateInvoiceStatus(billingId: string, status: string) {
    const response = await apiClient.patch(`/admin/billing/${billingId}/status`, {
      status
    });
    return response.data;
  },

  async sendInvoice(billingId: string) {
    const response = await apiClient.post(`/admin/billing/${billingId}/send`);
    return response.data;
  },

  async downloadInvoice(billingId: string) {
    const response = await apiClient.get(`/admin/billing/${billingId}/download`, {
      responseType: 'blob'
    });
    return response.data;
  },

  // Traffic Reports
  async getTrafficReports(filters?: TrafficReportFilters, page = 1, limit = 10) {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    });
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, value.toString());
        }
      });
    }
    
    const response = await apiClient.get(`/admin/billing/traffic-reports?${params}`);
    return response.data;
  },

  async getTrafficReportById(reportId: string) {
    const response = await apiClient.get(`/admin/billing/traffic-reports/${reportId}`);
    return response.data;
  },

  async generateTrafficReport(tenantId: string, month: number, year: number) {
    const response = await apiClient.post('/admin/billing/traffic-reports/generate', {
      tenantId,
      month,
      year
    });
    return response.data;
  },

  async generateAllTrafficReports(month: number, year: number) {
    const response = await apiClient.post('/admin/billing/traffic-reports/generate-all', {
      month,
      year
    });
    return response.data;
  },

  async sendTrafficReport(reportId: string) {
    const response = await apiClient.post(`/admin/billing/traffic-reports/${reportId}/send`);
    return response.data;
  },

  async downloadTrafficReport(reportId: string) {
    const response = await apiClient.get(`/admin/billing/traffic-reports/${reportId}/download`, {
      responseType: 'blob'
    });
    return response.data;
  },

  // Billing Settings
  async getBillingSettings() {
    const response = await apiClient.get('/admin/billing/settings');
    return response.data;
  },

  async updateBillingSettings(settings: Partial<BillingSettings>) {
    const response = await apiClient.put('/admin/billing/settings', settings);
    return response.data;
  },

  // Statistics
  async getBillingStats(month?: number, year?: number) {
    const params = new URLSearchParams();
    if (month) params.append('month', month.toString());
    if (year) params.append('year', year.toString());
    
    const response = await apiClient.get(`/admin/billing/stats?${params}`);
    return response.data;
  },

  // Credit Management
  async getTenantCreditBalance(tenantId: string): Promise<TenantCreditBalance> {
    const response = await apiClient.get(`/admin/billing/credits/${tenantId}`);
    return response.data;
  },

  async deductCredits(request: CreditDeductionRequest): Promise<CreditDeductionResponse> {
    const response = await apiClient.post('/admin/billing/credits/deduct', request);
    return response.data;
  },

  async getCreditOperations(tenantId: string, page = 1, limit = 10): Promise<{
    operations: CreditOperation[];
    total: number;
    pages: number;
  }> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    });
    
    const response = await apiClient.get(`/admin/billing/credits/${tenantId}/operations?${params}`);
    return response.data;
  },

  async addCredits(tenantId: string, credits: number, description: string): Promise<CreditOperation> {
    const response = await apiClient.post(`/admin/billing/credits/${tenantId}/add`, {
      tenantId,
      operationType: 'admin_adjustment',
      creditsToAdd: credits,
      description,
      metadata: {
        adminUserId: 'current_user' // This could be enhanced to pass actual admin user ID
      }
    });
    return response.data;
  },

  async validateCredits(tenantId: string, creditsNeeded: number): Promise<{ hasEnoughCredits: boolean; remainingCredits: number }> {
    const response = await apiClient.get(`/admin/billing/credits/${tenantId}/validate?credits=${creditsNeeded}`);
    return response.data;
  },

  // Credit Statistics
  async getCreditStats(month?: number, year?: number): Promise<CreditStats> {
    const params = new URLSearchParams();
    if (month) params.append('month', month.toString());
    if (year) params.append('year', year.toString());
    
    const response = await apiClient.get(`/admin/billing/credit-stats?${params}`);
    return response.data;
  }
};

export default billingService;