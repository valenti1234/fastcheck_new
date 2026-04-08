import {
  getSheriffDataLogs,
  getAllSheriffDataLogs,
  getSheriffDataLogById
} from '../sheriffDataLogService';
import { apiClient } from '../api';

// Mock the API client
jest.mock('../api', () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('SheriffDataLogService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockSheriffDataLog = {
    _id: '507f1f77bcf86cd799439011',
    tenantId: 'tenant123',
    rut: '12345678-9',
    empresa: 'Empresa Test S.A.',
    fechaConsulta: '2024-01-15T10:00:00Z',
    tipoConsulta: 'embargo',
    resultado: 'Con embargos',
    detalles: {
      embargos: [
        {
          tribunal: 'Juzgado Civil de Santiago',
          causa: 'C-12345-2023',
          fechaEmbargo: '2023-12-01',
          monto: 5000000
        }
      ]
    },
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z'
  };

  const mockSheriffDataLogsResponse = {
    success: true,
    logs: [mockSheriffDataLog],
    pagination: {
      current: 1,
      pages: 1,
      total: 1,
      limit: 10
    },
    pages: 1,
    total: 1
  };

  describe('getSheriffDataLogs', () => {
    it('should get sheriff data logs with pagination', async () => {
      const tenantId = 'tenant123';
      const page = 1;
      const limit = 10;

      mockApiClient.get.mockResolvedValue({ data: mockSheriffDataLogsResponse });

      const result = await getSheriffDataLogs(tenantId, page, limit);

      expect(mockApiClient.get).toHaveBeenCalledWith(
        `/sheriff-data-logs/tenant/${tenantId}`,
        {
          params: { page, limit }
        }
      );
      expect(result).toEqual(mockSheriffDataLogsResponse);
    });

    it('should handle different pagination parameters', async () => {
      const tenantId = 'tenant456';
      const page = 2;
      const limit = 25;

      mockApiClient.get.mockResolvedValue({ data: mockSheriffDataLogsResponse });

      const result = await getSheriffDataLogs(tenantId, page, limit);

      expect(mockApiClient.get).toHaveBeenCalledWith(
        `/sheriff-data-logs/tenant/${tenantId}`,
        {
          params: { page, limit }
        }
      );
      expect(result).toEqual(mockSheriffDataLogsResponse);
    });

    it('should handle API errors', async () => {
      const errorMessage = 'Error al obtener logs';
      mockApiClient.get.mockRejectedValue(new Error(errorMessage));

      await expect(getSheriffDataLogs('tenant123', 1, 10)).rejects.toThrow(errorMessage);
    });

    it('should handle empty response', async () => {
      const emptyResponse = {
        success: true,
        logs: [],
        pagination: {
          current: 1,
          pages: 0,
          total: 0,
          limit: 10
        },
        pages: 0,
        total: 0
      };

      mockApiClient.get.mockResolvedValue({ data: emptyResponse });

      const result = await getSheriffDataLogs('tenant123', 1, 10);

      expect(result).toEqual(emptyResponse);
    });
  });

  describe('getAllSheriffDataLogs', () => {
    it('should get all sheriff data logs from single page', async () => {
      const tenantId = 'tenant123';
      const singlePageResponse = {
        logs: [mockSheriffDataLog],
        pages: 1,
        total: 1
      };

      mockApiClient.get.mockResolvedValue({ data: singlePageResponse });

      const result = await getAllSheriffDataLogs(tenantId);

      expect(mockApiClient.get).toHaveBeenCalledWith(
        `/sheriff-data-logs/tenant/${tenantId}`,
        {
          params: { page: 1, limit: 100 }
        }
      );
      expect(result).toEqual({
        logs: [mockSheriffDataLog],
        total: 1,
        pages: 1
      });
    });

    it('should get all sheriff data logs from multiple pages', async () => {
      const tenantId = 'tenant123';
      const mockLog2 = { ...mockSheriffDataLog, _id: '507f1f77bcf86cd799439012' };
      const mockLog3 = { ...mockSheriffDataLog, _id: '507f1f77bcf86cd799439013' };

      // First page
      const firstPageResponse = {
        logs: [mockSheriffDataLog, mockLog2],
        pages: 2,
        total: 3
      };

      // Second page
      const secondPageResponse = {
        logs: [mockLog3],
        pages: 2,
        total: 3
      };

      mockApiClient.get
        .mockResolvedValueOnce({ data: firstPageResponse })
        .mockResolvedValueOnce({ data: secondPageResponse });

      const result = await getAllSheriffDataLogs(tenantId);

      expect(mockApiClient.get).toHaveBeenCalledTimes(2);
      expect(mockApiClient.get).toHaveBeenNthCalledWith(1,
        `/sheriff-data-logs/tenant/${tenantId}`,
        {
          params: { page: 1, limit: 100 }
        }
      );
      expect(mockApiClient.get).toHaveBeenNthCalledWith(2,
        `/sheriff-data-logs/tenant/${tenantId}`,
        {
          params: { page: 2, limit: 100 }
        }
      );
      expect(result).toEqual({
        logs: [mockSheriffDataLog, mockLog2, mockLog3],
        total: 3,
        pages: 1
      });
    });

    it('should handle empty response', async () => {
      const tenantId = 'tenant123';
      const emptyResponse = {
        logs: [],
        pages: 0,
        total: 0
      };

      mockApiClient.get.mockResolvedValue({ data: emptyResponse });

      const result = await getAllSheriffDataLogs(tenantId);

      expect(result).toEqual({
        logs: [],
        total: 0,
        pages: 0
      });
    });

    it('should handle response without logs property', async () => {
      const tenantId = 'tenant123';
      const responseWithoutLogs = {
        pages: 1,
        total: 0
      };

      mockApiClient.get.mockResolvedValue({ data: responseWithoutLogs });

      const result = await getAllSheriffDataLogs(tenantId);

      expect(result).toEqual({
        logs: [],
        total: 0,
        pages: 0
      });
    });

    it('should handle API errors', async () => {
      const errorMessage = 'Error al obtener todos los logs';
      mockApiClient.get.mockRejectedValue(new Error(errorMessage));

      await expect(getAllSheriffDataLogs('tenant123')).rejects.toThrow(errorMessage);
    });

    it('should handle large dataset with many pages', async () => {
      const tenantId = 'tenant123';
      const logsPerPage = 2;
      const totalPages = 3;
      
      // Create mock logs for each page
      const page1Logs = [
        { ...mockSheriffDataLog, _id: 'log1' },
        { ...mockSheriffDataLog, _id: 'log2' }
      ];
      const page2Logs = [
        { ...mockSheriffDataLog, _id: 'log3' },
        { ...mockSheriffDataLog, _id: 'log4' }
      ];
      const page3Logs = [
        { ...mockSheriffDataLog, _id: 'log5' }
      ];

      mockApiClient.get
        .mockResolvedValueOnce({ data: { logs: page1Logs, pages: totalPages } })
        .mockResolvedValueOnce({ data: { logs: page2Logs, pages: totalPages } })
        .mockResolvedValueOnce({ data: { logs: page3Logs, pages: totalPages } });

      const result = await getAllSheriffDataLogs(tenantId);

      expect(mockApiClient.get).toHaveBeenCalledTimes(3);
      expect(result.logs).toHaveLength(5);
      expect(result.total).toBe(5);
      expect(result.logs.map(log => log._id)).toEqual(['log1', 'log2', 'log3', 'log4', 'log5']);
    });
  });

  describe('getSheriffDataLogById', () => {
    it('should get sheriff data log by ID', async () => {
      const id = '507f1f77bcf86cd799439011';
      const mockResponse = {
        success: true,
        data: mockSheriffDataLog
      };

      mockApiClient.get.mockResolvedValue({ data: mockResponse });

      const result = await getSheriffDataLogById(id);

      expect(mockApiClient.get).toHaveBeenCalledWith(`/sheriff-data-logs/${id}`);
      expect(result).toEqual(mockResponse);
    });

    it('should handle different log IDs', async () => {
      const id = 'different-log-id';
      const differentLog = {
        ...mockSheriffDataLog,
        _id: id,
        rut: '98765432-1',
        empresa: 'Otra Empresa S.A.'
      };
      const mockResponse = {
        success: true,
        data: differentLog
      };

      mockApiClient.get.mockResolvedValue({ data: mockResponse });

      const result = await getSheriffDataLogById(id);

      expect(mockApiClient.get).toHaveBeenCalledWith(`/sheriff-data-logs/${id}`);
      expect(result).toEqual(mockResponse);
    });

    it('should handle API errors', async () => {
      const errorMessage = 'Log no encontrado';
      mockApiClient.get.mockRejectedValue(new Error(errorMessage));

      await expect(getSheriffDataLogById('invalid-id')).rejects.toThrow(errorMessage);
    });

    it('should handle 404 errors', async () => {
      const error = new Error('Not Found');
      (error as any).response = { status: 404 };
      mockApiClient.get.mockRejectedValue(error);

      await expect(getSheriffDataLogById('non-existent-id')).rejects.toThrow('Not Found');
    });

    it('should handle empty response', async () => {
      const mockResponse = {
        success: false,
        data: null,
        message: 'Log no encontrado'
      };

      mockApiClient.get.mockResolvedValue({ data: mockResponse });

      const result = await getSheriffDataLogById('empty-id');

      expect(result).toEqual(mockResponse);
    });
  });
});