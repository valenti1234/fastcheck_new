import { EvaluationService, createEvaluation } from '../evaluationService';
import { validateChileanRut } from '../api';
import axios from 'axios';
import { EvaluationJob } from '../../types/evaluation';

// Mock dependencies
jest.mock('../api');
jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedValidateChileanRut = validateChileanRut as jest.MockedFunction<typeof validateChileanRut>;

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

describe('EvaluationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue('mock-token');
  });

  describe('getJobs', () => {
    it('should fetch evaluation jobs successfully', async () => {
      const mockJobs: EvaluationJob[] = [
        {
          id: 'job-1',
          tenantId: 'tenant-1',
          createdBy: 'user-1',
          status: 'completed',
          type: 'single',
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-01T00:00:00Z',
          completedAt: '2023-01-01T01:00:00Z',
          totalEvaluations: 1,
          completedEvaluations: 1
        }
      ];

      const mockResponse = {
        data: {
          jobs: mockJobs,
          total: 1,
          pages: 1
        }
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await EvaluationService.getJobs('tenant-1', 1, 10);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        '/evaluations/tenant-1?page=1&limit=10',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-token'
          })
        })
      );
      expect(result).toEqual({
        jobs: mockJobs,
        total: 1,
        pages: 1
      });
    });

    it('should handle API errors', async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: 'Internal server error' }
        }
      };

      mockedAxios.get.mockRejectedValue(mockError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(EvaluationService.getJobs('tenant-1')).rejects.toThrow('Error al obtener las evaluaciones');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network Error');
      mockedAxios.get.mockRejectedValue(networkError);
      mockedAxios.isAxiosError.mockReturnValue(false);

      await expect(EvaluationService.getJobs('tenant-1')).rejects.toThrow('Error de conexión');
    });
  });

  describe('createSingleEvaluation', () => {
    it('should create single evaluation successfully', async () => {
      const mockJob: EvaluationJob = {
        id: 'job-1',
        tenantId: 'tenant-1',
        createdBy: 'user-1',
        status: 'queued',
        type: 'single',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
        completedAt: null,
        supplierData: {
          rut: '12345678-9',
          name: 'Test Company'
        },
        totalEvaluations: 1,
        completedEvaluations: 0
      };

      mockedAxios.post.mockResolvedValue({ data: mockJob });
      mockedValidateChileanRut.mockReturnValue(true);

      const supplierData = { rut: '12345678-9', name: 'Test Company' };
      const result = await EvaluationService.createSingleEvaluation('tenant-1', 'user-1', supplierData);

      expect(mockedValidateChileanRut).toHaveBeenCalledWith('12345678-9');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/evaluations/single',
        {
          tenantId: 'tenant-1',
          userId: 'user-1',
          supplierData
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-token'
          })
        })
      );
      expect(result).toEqual(mockJob);
    });

    it('should throw error for invalid RUT', async () => {
      mockedValidateChileanRut.mockReturnValue(false);

      const supplierData = { rut: 'invalid-rut', name: 'Test Company' };
      await expect(
        EvaluationService.createSingleEvaluation('tenant-1', 'user-1', supplierData)
      ).rejects.toThrow('RUT inválido');
    });
  });
});

describe('createEvaluation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue('mock-token');
  });

  describe('successful creation', () => {
    it('should create evaluation successfully', async () => {
      const mockResponse = {
        id: 'eval-1',
        tenantId: 'tenant-1',
        createdBy: 'user-1',
        status: 'pending' as const,
        type: 'single' as const,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
        completedAt: null,
        supplierData: { rut: '12345678-5', name: 'Test Company' },
        totalEvaluations: 1,
        completedEvaluations: 0
      };

      mockedAxios.post.mockResolvedValue({ data: mockResponse });

      const result = await createEvaluation({
        type: 'single',
        tenantId: 'tenant-1',
        userId: 'user-1',
        supplierData: { rut: '12345678-5', name: 'Test Company' }
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/evaluations',
        {
          type: 'single',
          tenantId: 'tenant-1',
          userId: 'user-1',
          supplierData: { rut: '12345678-5', name: 'Test Company' }
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-token'
          })
        })
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('validation errors', () => {
    it('should throw error for missing tenant ID', async () => {
      await expect(createEvaluation({
        type: 'single',
        tenantId: '',
        userId: 'user-1',
        supplierData: { rut: '12345678-5', name: 'Test Company' }
      })).rejects.toThrow('Tenant ID is required');
    });

    it('should throw error for missing user ID', async () => {
      await expect(createEvaluation({
        type: 'single',
        tenantId: 'tenant-1',
        userId: '',
        supplierData: { rut: '12345678-5', name: 'Test Company' }
      })).rejects.toThrow('User ID is required');
    });
  });

  describe('API error handling', () => {
    it('should handle 401 unauthorized error', async () => {
      const mockError = {
        response: {
          status: 401,
          data: { message: 'Unauthorized' }
        }
      };

      mockedAxios.post.mockRejectedValue(mockError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(createEvaluation({
        type: 'single',
        tenantId: 'tenant-1',
        userId: 'user-1',
        supplierData: { rut: '12345678-5', name: 'Test Company' }
      })).rejects.toThrow('No autorizado. Por favor inicie sesión nuevamente.');
    });

    it('should handle 403 forbidden error', async () => {
      const mockError = {
        response: {
          status: 403,
          data: { message: 'Forbidden' }
        }
      };

      mockedAxios.post.mockRejectedValue(mockError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(createEvaluation({
        type: 'single',
        tenantId: 'tenant-1',
        userId: 'user-1',
        supplierData: { rut: '12345678-5', name: 'Test Company' }
      })).rejects.toThrow('No tiene permisos para realizar esta acción.');
    });

    it('should handle 404 not found error', async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: 'Not found' }
        }
      };

      mockedAxios.post.mockRejectedValue(mockError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(createEvaluation({
        type: 'single',
        tenantId: 'tenant-1',
        userId: 'user-1',
        supplierData: { rut: '12345678-5', name: 'Test Company' }
      })).rejects.toThrow('Tenant no encontrado');
    });

    it('should handle custom error messages', async () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: 'Custom error message' }
        }
      };

      mockedAxios.post.mockRejectedValue(mockError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(createEvaluation({
        type: 'single',
        tenantId: 'tenant-1',
        userId: 'user-1',
        supplierData: { rut: '12345678-5', name: 'Test Company' }
      })).rejects.toThrow('Custom error message');
    });

    it('should handle generic server errors', async () => {
      const mockError = {
        response: {
          status: 500,
          data: {}
        }
      };

      mockedAxios.post.mockRejectedValue(mockError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(createEvaluation({
        type: 'single',
        tenantId: 'tenant-1',
        userId: 'user-1',
        supplierData: { rut: '12345678-5', name: 'Test Company' }
      })).rejects.toThrow('Error al crear la evaluación. Por favor intente nuevamente.');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network Error');
      mockedAxios.post.mockRejectedValue(networkError);
      mockedAxios.isAxiosError.mockReturnValue(false);

      await expect(createEvaluation({
        type: 'single',
        tenantId: 'tenant-1',
        userId: 'user-1',
        supplierData: { rut: '12345678-5', name: 'Test Company' }
      })).rejects.toThrow('No se recibió respuesta del servidor');
    });
  });
});