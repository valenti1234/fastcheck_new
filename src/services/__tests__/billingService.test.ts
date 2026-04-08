import axios from 'axios';
import billingService from '../billingService';
import { apiClient } from '../api';
import {
  TenantBilling,
  TrafficReport,
  BillingSettings,
  TenantCreditBalance,
  CreditDeductionRequest,
  CreditStats
} from '../../types/billing';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock apiClient
jest.mock('../api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn()
  }
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('BillingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getBillings', () => {
    const mockBillings = {
      billings: [
        {
          _id: '1',
          tenantId: 'tenant1',
          tenantName: 'Test Company',
          billingPeriod: { month: 1, year: 2024 },
          costs: { totalCost: 100 },
          usage: { totalEvaluations: 50 },
          invoice: { status: 'pending', invoiceNumber: 'INV-001' }
        }
      ],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
    };

    it('should fetch billings without filters', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockBillings });

      const result = await billingService.getBillings();

      expect(mockApiClient.get).toHaveBeenCalledWith('/admin/billing?page=1&limit=10');
      expect(result).toEqual(mockBillings);
    });

    it('should fetch billings with filters', async () => {
      const filters = { tenantId: 'tenant1', status: 'paid' };
      mockApiClient.get.mockResolvedValue({ data: mockBillings });

      const result = await billingService.getBillings(filters, 2, 20);

      expect(mockApiClient.get).toHaveBeenCalledWith('/admin/billing?page=2&limit=20&tenantId=tenant1&status=paid');
      expect(result).toEqual(mockBillings);
    });

    it('should handle API errors', async () => {
      const error = new Error('Network error');
      mockApiClient.get.mockRejectedValue(error);

      await expect(billingService.getBillings()).rejects.toThrow('Network error');
    });
  });

  describe('getBillingById', () => {
    const mockBilling: TenantBilling = {
      _id: '1',
      tenantId: 'tenant1',
      tenantName: 'Test Company',
      billingPeriod: {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        month: 1,
        year: 2024
      },
      usage: {
        totalEvaluations: 50,
        totalApiCalls: 100,
        totalTokensUsed: 1000,
        totalStorageUsed: 500,
        totalBandwidthUsed: 200
      },
      costs: {
        evaluationCost: 50,
        apiCallCost: 25,
        tokenCost: 10,
        storageCost: 5,
        bandwidthCost: 10,
        totalCost: 100
      },
      invoice: {
        invoiceNumber: 'INV-001',
        status: 'pending',
        dueDate: '2024-02-15'
      },
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    };

    it('should fetch billing by ID', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockBilling });

      const result = await billingService.getBillingById('1');

      expect(mockApiClient.get).toHaveBeenCalledWith('/admin/billing/1');
      expect(result).toEqual(mockBilling);
    });

    it('should handle not found error', async () => {
      const error = { response: { status: 404 } };
      mockApiClient.get.mockRejectedValue(error);

      await expect(billingService.getBillingById('999')).rejects.toEqual(error);
    });
  });

  describe('generateMonthlyBilling', () => {
    const mockGeneratedBilling = {
      _id: 'new-billing',
      tenantId: 'tenant1',
      billingMonth: 1,
      billingYear: 2024,
      totalAmount: 150
    };

    it('should generate monthly billing', async () => {
      mockApiClient.post.mockResolvedValue({ data: mockGeneratedBilling });

      const result = await billingService.generateMonthlyBilling('tenant1', 1, 2024);

      expect(mockApiClient.post).toHaveBeenCalledWith('/admin/billing/generate', {
        tenantId: 'tenant1',
        month: 1,
        year: 2024
      });
      expect(result).toEqual(mockGeneratedBilling);
    });

    it('should handle generation errors', async () => {
      const error = new Error('Billing already exists');
      mockApiClient.post.mockRejectedValue(error);

      await expect(billingService.generateMonthlyBilling('tenant1', 1, 2024))
        .rejects.toThrow('Billing already exists');
    });
  });

  describe('generateAllMonthlyBillings', () => {
    it('should generate all monthly billings', async () => {
      const mockResult = { generated: 5, errors: [] };
      mockApiClient.post.mockResolvedValue({ data: mockResult });

      const result = await billingService.generateAllMonthlyBillings(1, 2024);

      expect(mockApiClient.post).toHaveBeenCalledWith('/admin/billing/generate-all', {
        month: 1,
        year: 2024
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('updateInvoiceStatus', () => {
    it('should update invoice status', async () => {
      const mockUpdatedBilling = { _id: '1', status: 'paid' };
      mockApiClient.patch.mockResolvedValue({ data: mockUpdatedBilling });

      const result = await billingService.updateInvoiceStatus('1', 'paid');

      expect(mockApiClient.patch).toHaveBeenCalledWith('/admin/billing/1/status', {
        status: 'paid'
      });
      expect(result).toEqual(mockUpdatedBilling);
    });
  });

  describe('sendInvoice', () => {
    it('should send invoice', async () => {
      const mockResult = { sent: true, sentAt: '2024-01-15' };
      mockApiClient.post.mockResolvedValue({ data: mockResult });

      const result = await billingService.sendInvoice('1');

      expect(mockApiClient.post).toHaveBeenCalledWith('/admin/billing/1/send');
      expect(result).toEqual(mockResult);
    });
  });

  describe('downloadInvoice', () => {
    it('should download invoice as blob', async () => {
      const mockBlob = new Blob(['invoice data'], { type: 'application/pdf' });
      mockApiClient.get.mockResolvedValue({ data: mockBlob });

      const result = await billingService.downloadInvoice('1');

      expect(mockApiClient.get).toHaveBeenCalledWith('/admin/billing/1/download', {
        responseType: 'blob'
      });
      expect(result).toEqual(mockBlob);
    });
  });

  describe('getBillingSettings', () => {
    const mockSettings: BillingSettings = {
      _id: 'settings1',
      pricing: {
        evaluationPrice: 0.10,
        apiCallPrice: 0.05,
        tokenPrice: 0.001,
        storagePrice: 0.10,
        bandwidthPrice: 0.05
      },
      currency: 'EUR',
      taxRate: 0.21,
      invoiceSettings: {
        daysUntilDue: 30,
        autoSend: false,
        emailTemplate: 'default'
      },
      updatedAt: '2024-01-01'
    };

    it('should fetch billing settings', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockSettings });

      const result = await billingService.getBillingSettings();

      expect(mockApiClient.get).toHaveBeenCalledWith('/admin/billing/settings');
      expect(result).toEqual(mockSettings);
    });
  });

  describe('updateBillingSettings', () => {
    it('should update billing settings', async () => {
      const settingsUpdate = {
        pricing: {
          evaluationPrice: 0.15,
          apiCallPrice: 0.05,
          tokenPrice: 0.001,
          storagePrice: 0.10,
          bandwidthPrice: 0.05
        },
        currency: 'USD'
      };
      const mockUpdatedSettings = { ...settingsUpdate, _id: 'settings1' };
      mockApiClient.put.mockResolvedValue({ data: mockUpdatedSettings });

      const result = await billingService.updateBillingSettings(settingsUpdate);

      expect(mockApiClient.put).toHaveBeenCalledWith('/admin/billing/settings', settingsUpdate);
      expect(result).toEqual(mockUpdatedSettings);
    });
  });

  describe('getBillingStats', () => {
    it('should fetch billing stats without parameters', async () => {
      const mockStats = {
        totalRevenue: 5000,
        totalInvoices: 50,
        pendingAmount: 1000
      };
      mockApiClient.get.mockResolvedValue({ data: mockStats });

      const result = await billingService.getBillingStats();

      expect(mockApiClient.get).toHaveBeenCalledWith('/admin/billing/stats?');
      expect(result).toEqual(mockStats);
    });

    it('should fetch billing stats with month and year', async () => {
      const mockStats = {
        totalRevenue: 500,
        totalInvoices: 5,
        pendingAmount: 100
      };
      mockApiClient.get.mockResolvedValue({ data: mockStats });

      const result = await billingService.getBillingStats(1, 2024);

      expect(mockApiClient.get).toHaveBeenCalledWith('/admin/billing/stats?month=1&year=2024');
      expect(result).toEqual(mockStats);
    });
  });

  describe('Credit Management', () => {
    describe('getTenantCreditBalance', () => {
      const mockCreditBalance: TenantCreditBalance = {
        tenantId: 'tenant1',
        tenantName: 'Test Company',
        totalCredits: 1000,
        usedCredits: 300,
        remainingCredits: 700,
        updatedAt: '2024-01-01'
      };

      it('should fetch tenant credit balance', async () => {
        mockApiClient.get.mockResolvedValue({ data: mockCreditBalance });

        const result = await billingService.getTenantCreditBalance('tenant1');

        expect(mockApiClient.get).toHaveBeenCalledWith('/admin/billing/credits/tenant1');
        expect(result).toEqual(mockCreditBalance);
      });
    });

    describe('deductCredits', () => {
      const mockRequest: CreditDeductionRequest = {
        tenantId: 'tenant1',
        operationType: 'evaluation',
        creditsToDeduct: 10,
        description: 'Single evaluation',
        metadata: {
          evaluationId: 'eval1',
          evaluationType: 'single'
        }
      };

      const mockResponse = {
        success: true,
        creditsDeducted: 10,
        remainingCredits: 690
      };

      it('should deduct credits successfully', async () => {
        mockApiClient.post.mockResolvedValue({ data: mockResponse });

        const result = await billingService.deductCredits(mockRequest);

        expect(mockApiClient.post).toHaveBeenCalledWith('/admin/billing/credits/deduct', mockRequest);
        expect(result).toEqual(mockResponse);
      });

      it('should handle insufficient credits error', async () => {
        const error = { response: { status: 400, data: { error: 'Insufficient credits' } } };
        mockApiClient.post.mockRejectedValue(error);

        await expect(billingService.deductCredits(mockRequest)).rejects.toEqual(error);
      });
    });

    describe('getCreditStats', () => {
      const mockCreditStats: CreditStats = {
        period: {
          month: 1,
          year: 2024,
          startDate: '2024-01-01',
          endDate: '2024-01-31'
        },
        overview: {
          totalOperations: 100,
          totalCreditsChanged: -3000,
          totalCreditsAdded: 10000,
          totalCreditsDeducted: 3000,
          averageOperationValue: 30
        },
        tenantStats: [
          {
            tenantId: 'tenant1',
            tenantName: 'Company A',
            totalOperations: 50,
            totalCreditsChanged: -500,
            totalCreditsAdded: 1000,
            totalCreditsDeducted: 500,
            currentBalance: 500
          }
        ],
        operationTypeStats: [
          {
            _id: 'evaluation',
            count: 80,
            totalCreditsChanged: -2400
          }
        ],
        topTenantBalances: [
          {
            tenantId: 'tenant1',
            tenantName: 'Company A',
            currentBalance: 500
          }
        ]
      };

      it('should fetch credit stats without parameters', async () => {
        mockApiClient.get.mockResolvedValue({ data: mockCreditStats });

        const result = await billingService.getCreditStats();

        expect(mockApiClient.get).toHaveBeenCalledWith('/admin/billing/credit-stats?');
        expect(result).toEqual(mockCreditStats);
      });

      it('should fetch credit stats with month and year', async () => {
        mockApiClient.get.mockResolvedValue({ data: mockCreditStats });

        const result = await billingService.getCreditStats(1, 2024);

        expect(mockApiClient.get).toHaveBeenCalledWith('/admin/billing/credit-stats?month=1&year=2024');
        expect(result).toEqual(mockCreditStats);
      });
    });
  });

  describe('Traffic Reports', () => {
    describe('getTrafficReports', () => {
      const mockTrafficReports = {
        reports: [
          {
            _id: 'report1',
            tenantId: 'tenant1',
            tenantName: 'Test Company',
            reportPeriod: { month: 1, year: 2024 },
            summary: { totalEvaluations: 100 }
          }
        ],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
      };

      it('should fetch traffic reports', async () => {
        mockApiClient.get.mockResolvedValue({ data: mockTrafficReports });

        const result = await billingService.getTrafficReports();

        expect(mockApiClient.get).toHaveBeenCalledWith('/admin/billing/traffic-reports?page=1&limit=10');
        expect(result).toEqual(mockTrafficReports);
      });

      it('should fetch traffic reports with filters', async () => {
        const filters = { tenantId: 'tenant1', month: 1, year: 2024 };
        mockApiClient.get.mockResolvedValue({ data: mockTrafficReports });

        const result = await billingService.getTrafficReports(filters, 2, 20);

        expect(mockApiClient.get).toHaveBeenCalledWith('/admin/billing/traffic-reports?page=2&limit=20&tenantId=tenant1&month=1&year=2024');
        expect(result).toEqual(mockTrafficReports);
      });
    });

    describe('generateTrafficReport', () => {
      it('should generate traffic report', async () => {
        const mockReport = {
          _id: 'new-report',
          tenantId: 'tenant1',
          reportPeriod: { month: 1, year: 2024 }
        };
        mockApiClient.post.mockResolvedValue({ data: mockReport });

        const result = await billingService.generateTrafficReport('tenant1', 1, 2024);

        expect(mockApiClient.post).toHaveBeenCalledWith('/admin/billing/traffic-reports/generate', {
          tenantId: 'tenant1',
          month: 1,
          year: 2024
        });
        expect(result).toEqual(mockReport);
      });
    });
  });
});