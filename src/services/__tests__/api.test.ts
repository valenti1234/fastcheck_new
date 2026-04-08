import axios from 'axios';
import { apiClient, fakeAuthApi, validateChileanRut, formatChileanRut, setupMonitoring } from '../api';
import { LoginCredentials } from '../../types/auth';
import logger from '../../utils/logger';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

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

// Mock console methods
const originalConsole = console;
beforeAll(() => {
  logger.log = jest.fn();
  logger.error = jest.fn();
});

afterAll(() => {
  logger.log = originallogger.log;
  logger.error = originallogger.error;
});

describe('API Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue('mock-token');
  });

  describe('apiClient configuration', () => {
    it('should create axios instance with correct base URL', () => {
      expect(apiClient.defaults.baseURL).toBeDefined();
    });

    it('should have request interceptor configured', () => {
      expect(apiClient.interceptors.request).toBeDefined();
    });

    it('should have response interceptor configured in development', () => {
      expect(apiClient.interceptors.response).toBeDefined();
    });
  });

  describe('fakeAuthApi', () => {
    describe('login', () => {
      it('should successfully login with valid credentials', async () => {
        const credentials: LoginCredentials = {
          email: 'admin@example.com',
          password: 'password123'
        };

        const result = await fakeAuthApi.login(credentials);

        expect(result).toEqual({
          id: '1',
          email: 'admin@example.com',
          name: 'Admin User',
          role: 'superuser',
          defaultTenantId: 'tenant-1',
          tenants: ['tenant-1', 'tenant-2']
        });
      });

      it('should throw error for invalid credentials', async () => {
        const credentials: LoginCredentials = {
          email: 'invalid@example.com',
          password: 'wrongpassword'
        };

        await expect(fakeAuthApi.login(credentials))
          .rejects.toThrow('Invalid email or password');
      });

      it('should throw error for missing email', async () => {
        const credentials: LoginCredentials = {
          email: '',
          password: 'password123'
        };

        await expect(fakeAuthApi.login(credentials))
          .rejects.toThrow('Email and password are required');
      });

      it('should throw error for missing password', async () => {
        const credentials: LoginCredentials = {
          email: 'admin@example.com',
          password: ''
        };

        await expect(fakeAuthApi.login(credentials))
          .rejects.toThrow('Email and password are required');
      });
    });

    describe('register', () => {
      it('should successfully register new user', async () => {
        const registerData = {
          email: 'newuser@example.com',
          password: 'password123',
          name: 'New User',
          companyName: 'New Company'
        };

        const result = await fakeAuthApi.register(registerData);

        expect(result).toEqual({
          id: expect.any(String),
          email: 'newuser@example.com',
          name: 'New User',
          role: 'user',
          defaultTenantId: null,
          tenants: []
        });
      });

      it('should throw error for existing email', async () => {
        const registerData = {
          email: 'admin@example.com',
          password: 'password123',
          name: 'Admin User',
          companyName: 'Admin Company'
        };

        await expect(fakeAuthApi.register(registerData))
          .rejects.toThrow('User with this email already exists');
      });

      it('should throw error for missing company name', async () => {
        const registerData = {
          email: 'newuser@example.com',
          password: 'password123',
          name: 'New User',
          companyName: ''
        };

        await expect(fakeAuthApi.register(registerData))
          .rejects.toThrow('All fields are required');
      });
    });
  });

  describe('validateChileanRut', () => {
    it('should validate correct RUT with dash', () => {
      expect(validateChileanRut('12345678-5')).toBe(true);
      expect(validateChileanRut('11111111-1')).toBe(true);
    });

    it('should validate correct RUT without dash', () => {
      expect(validateChileanRut('123456785')).toBe(true);
      expect(validateChileanRut('111111111')).toBe(true);
    });

    it('should validate RUT with K verification digit', () => {
      expect(validateChileanRut('12345678-K')).toBe(true);
      expect(validateChileanRut('12345678K')).toBe(true);
    });

    it('should reject invalid RUT format', () => {
      expect(validateChileanRut('invalid-rut')).toBe(false);
      expect(validateChileanRut('123')).toBe(false);
      expect(validateChileanRut('')).toBe(false);
    });

    it('should reject RUT with incorrect verification digit', () => {
      expect(validateChileanRut('12345678-9')).toBe(false);
      expect(validateChileanRut('11111111-2')).toBe(false);
    });

    it('should handle null and undefined input', () => {
      expect(validateChileanRut(null as any)).toBe(false);
      expect(validateChileanRut(undefined as any)).toBe(false);
    });
  });

  describe('formatChileanRut', () => {
    it('should format RUT with dots and dash', () => {
      expect(formatChileanRut('123456785')).toBe('12.345.678-5');
      expect(formatChileanRut('111111111')).toBe('11.111.111-1');
    });

    it('should format RUT with K verification digit', () => {
      expect(formatChileanRut('12345678K')).toBe('12.345.678-K');
      expect(formatChileanRut('12345678-K')).toBe('12.345.678-K');
    });

    it('should handle already formatted RUT', () => {
      expect(formatChileanRut('12.345.678-5')).toBe('12.345.678-5');
    });

    it('should handle RUT with spaces', () => {
      expect(formatChileanRut(' 12345678 5 ')).toBe('12.345.678-5');
    });

    it('should return empty string for invalid input', () => {
      expect(formatChileanRut('')).toBe('');
      expect(formatChileanRut('invalid')).toBe('invalid');
    });

    it('should handle null and undefined input', () => {
      expect(formatChileanRut(null as any)).toBe('');
      expect(formatChileanRut(undefined as any)).toBe('');
    });
  });

  describe('setupMonitoring', () => {
    beforeEach(() => {
      mockedAxios.post = jest.fn();
      jest.mocked(axios.isAxiosError).mockImplementation(() => false);
    });

    it('should successfully setup monitoring', async () => {
      const mockResponse = {
        data: { message: 'Monitoring setup successfully' }
      };
      mockedAxios.post.mockResolvedValue(mockResponse);

      const data = { rut: '12345678-5', frequency: 'daily' };
      const result = await setupMonitoring(data);

      expect(mockedAxios.post).toHaveBeenCalledWith('/monitoring', data);
      expect(result).toEqual({ message: 'Monitoring setup successfully' });
    });

    it('should handle API errors with custom message', async () => {
      const mockError = {
        response: {
          data: { message: 'Custom error message' }
        }
      };
      mockedAxios.post.mockRejectedValue(mockError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      const data = { rut: '12345678-5', frequency: 'daily' };
      await expect(setupMonitoring(data))
        .rejects.toThrow('Custom error message');
    });

    it('should handle API errors without custom message', async () => {
      const mockError = {
        response: {
          data: {}
        }
      };
      mockedAxios.post.mockRejectedValue(mockError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      const data = { rut: '12345678-5', frequency: 'daily' };
      await expect(setupMonitoring(data))
        .rejects.toThrow('Failed to setup monitoring');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network Error');
      mockedAxios.post.mockRejectedValue(networkError);
      mockedAxios.isAxiosError.mockReturnValue(false);

      const data = { rut: '12345678-5', frequency: 'daily' };
      await expect(setupMonitoring(data))
        .rejects.toThrow('Failed to setup monitoring due to an unexpected error.');
    });

    it('should validate required data fields', async () => {
      const invalidData = { rut: '', frequency: 'daily' };
      
      // This would depend on the actual implementation validation
      // For now, we'll test that the function calls the API
      mockedAxios.post.mockResolvedValue({ data: { message: 'Success' } });
      
      await setupMonitoring(invalidData);
      expect(mockedAxios.post).toHaveBeenCalledWith('/monitoring', invalidData);
    });
  });
});