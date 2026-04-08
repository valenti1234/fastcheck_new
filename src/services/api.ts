import axios from 'axios';
import { User, LoginCredentials, RegisterData } from '../types/auth';
import { Tenant, TenantUser } from '../types/tenant';
import { EvaluationJob, EvaluationResult } from '../models/evaluation';
import { EvaluationService } from './evaluationService'; // This seems to be a backend service, ensure it's correctly referenced or remove if not used on frontend
import { SupplierData } from '../types/evaluation';
import { SheriffDataLogResponse } from '../types/sheriff';
import { logger } from '../utils/logger';

const API_BASE_URL = globalThis.__APP_ENV__?.VITE_API_BASE_URL || 'https://duxiter.azurianlab.com/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

apiClient.interceptors.request.use(
  (config) => {
    // Attempt to get the token from localStorage (or your auth context/storage)
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

apiClient.interceptors.request.use(request => {
  logger.log('Starting Request', {
    method: request.method,
    url: request.url,
    data: request.data,
    params: request.params,
  });
  return request;
});

apiClient.interceptors.response.use(
  response => {
    logger.log('Response:', {
      status: response.status,
      data: response.data,
    });
    return response;
  },
  error => {
    logger.error('Response Error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    return Promise.reject(error);
  }
);


// Mock data for auth - Keeping auth mocked for now
const mockUsers: User[] = [
  {
    id: '1',
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'superuser',
    defaultTenantId: 'tenant-1',
    tenants: ['tenant-1', 'tenant-2'],
  },
  // ... other mock users
];

// Mock data for tenants - Keeping tenants mocked for now
const mockTenants: Tenant[] = [
  {
    id: 'tenant-1',
    name: 'ABC Company',
    slug: 'abc-company',
    plan: 'premium',
    status: 'active',
    createdAt: '2025-01-15T10:00:00Z',
    usageStats: {
      evaluationsTotal: 1000,
      evaluationsRemaining: 750,
      lastEvaluationDate: '2025-05-10T14:32:00Z',
    },
  },
  // ... other mock tenants
];

// Mock data for tenant users - Keeping tenant users mocked for now
const mockTenantUsers: TenantUser[] = [
  {
    id: '2',
    name: 'Tenant Admin',
    email: 'tenant@example.com',
    role: 'tenant_admin',
    status: 'active',
    createdAt: '2025-01-15T10:00:00Z',
    lastLogin: '2025-05-15T08:22:00Z',
  },
  // ... other mock tenant users
];

// Fake Auth API - Keeping auth API mocked for now
export const fakeAuthApi = {
  login: async (credentials: LoginCredentials): Promise<User> => {
    await new Promise(resolve => setTimeout(resolve, 800));
    const user = mockUsers.find(user => user.email === credentials.email);
    if (!user) throw new Error('Invalid credentials');
    return user;
  },
  
  register: async (data: RegisterData): Promise<User> => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const tenantId = 'tenant-1';
    const newUser: User = {
      id: `user-${Date.now()}`,
      email: data.email,
      name: data.name,
      role: 'tenant_admin',
      defaultTenantId: tenantId,
      tenants: [tenantId],
    };
    return newUser;
  },
};

// Fake Tenant API - Keeping tenant API mocked for now
export const fakeTenantApi = {
  getTenant: async (tenantId: string): Promise<Tenant> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const tenant = mockTenants.find(tenant => tenant.id === tenantId);
    if (!tenant) throw new Error('Tenant not found');
    return tenant;
  },
  
  getTenantUsers: async (tenantId: string): Promise<TenantUser[]> => {
    await new Promise(resolve => setTimeout(resolve, 700));
    return mockTenantUsers;
  },
  
  inviteUser: async (tenantId: string, email: string, role: 'tenant_admin' | 'evaluator'): Promise<TenantUser> => {
    await new Promise(resolve => setTimeout(resolve, 800));
    const newUser: TenantUser = {
      id: `user-${Date.now()}`,
      name: '',
      email,
      role,
      status: 'invited',
      createdAt: new Date().toISOString(),
      lastLogin: null,
    };
    return newUser;
  },
};

// Evaluation API - Now using MongoDB
export const fakeEvaluationApi = {
  getJobs: async (tenantId: string) => {
    await new Promise(resolve => setTimeout(resolve, 600)); // Keep delay for UX
    return EvaluationService.getJobs(tenantId);
  },
  
  getJob: async (jobId: string) => {
    await new Promise(resolve => setTimeout(resolve, 500)); // Keep delay for UX
    const job = await EvaluationService.getJob(jobId);
    if (!job) throw new Error('Job not found');
    return job;
  },
  
  getResults: async (jobId: string) => {
    await new Promise(resolve => setTimeout(resolve, 700)); // Keep delay for UX
    return EvaluationService.getResults(jobId);
  },
  
  createSingleEvaluation: async (tenantId: string, supplierData: SupplierData) => {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Keep delay for UX
    return EvaluationService.createSingleEvaluation(tenantId, 'system', supplierData);
  },
  
  createBulkEvaluation: async (tenantId: string, suppliers: SupplierData[]) => {
    await new Promise(resolve => setTimeout(resolve, 1500)); // Keep delay for UX
    return EvaluationService.createBulkEvaluation(tenantId, 'system', suppliers);
  },
};

// Admin Fast-Check summaries API (superuser only)
export interface FastCheckSummaryItem {
  id: string;
  rut: string;
  tenantId: string;
  tenantName: string | null;
  companyName: string | null;
  riskLevel: string | null;
  analysisDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FastCheckSummariesResponse {
  data: FastCheckSummaryItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const adminFastCheckApi = {
  async getSummaries(params: { page?: number; limit?: number; rut?: string; tenantId?: string; startDate?: string; endDate?: string } = {}): Promise<FastCheckSummariesResponse> {
    const response = await apiClient.get<FastCheckSummariesResponse>('/admin/fast-check-summaries', { params });
    return response.data;
  }
};

// Admin Results listing API (superuser only)
export interface AdminResultItem {
  _id: string;
  rut: string;
  tenantId?: string | { _id: string; name?: string } | null;
  tenantName?: string | null;
  createdAt: string;
  updatedAt?: string;
  markdownResume?: any;
  sheriffLogData?: any;
  details?: any;
  riskAssessment?: any;
  vistaDuxiter?: any;
  duxiterRiskLevel?: any;
  duxiterRiskData?: any;
  duxiterRiskList?: any;
  duxiterMD?: any;
  newSummaryData?: any;
  aiAnalysis?: any;
  aiAnalysisDate?: string | null;
}

export interface AdminResultsResponse {
  success: boolean;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  items: AdminResultItem[];
}

export const adminResultsApi = {
  async list(params: { page?: number; limit?: number; rut?: string; tenantId?: string; startDate?: string; endDate?: string } = {}): Promise<AdminResultsResponse> {
    const response = await apiClient.get<AdminResultsResponse>('/admin/results', { params });
    return response.data;
  }
};

// Helper function to validate Chilean RUT
export function validateChileanRut(rut: string): boolean {
  if (!rut) return false;
  
  // Remove dots, dashes and spaces, and convert to uppercase
  const cleanRut = rut.replace(/[.\-\s]/g, '').toUpperCase();
  
  // Basic format check: 7-8 digits followed by verification digit
  if (!/^[0-9]{7,8}[0-9K]$/.test(cleanRut)) {
    return false;
  }
  
  // Extract parts
  const dv = cleanRut.charAt(cleanRut.length - 1);
  const rutBody = cleanRut.substring(0, cleanRut.length - 1);
  
  // Calculate verification digit using modulus 11 method
  let sum = 0;
  let multiplier = 2;
  
  // Iterate from right to left
  for (let i = rutBody.length - 1; i >= 0; i--) {
    const digit = parseInt(rutBody.charAt(i));
    const product = digit * multiplier;
    sum += product;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  
  // Calculate verification digit
  const remainder = sum % 11;
  
  // Convert expected verification digit to character
  const calculatedDv = remainder === 0 ? '0' : 
                      remainder === 1 ? 'K' : 
                      (11 - remainder).toString();
  
  // Compare calculated vs provided verification digit
  return calculatedDv === dv;
}

// Helper function to format Chilean RUT
export function formatChileanRut(rut: string): string {
  if (!rut) return '';
  
  // Clean the RUT first (remove dots, dashes, spaces and any non-alphanumeric chars)
  const cleanRut = rut.replace(/[^0-9Kk]/g, '').toUpperCase();
  
  if (cleanRut.length < 2) return cleanRut;
  
  // Extract parts
  const dv = cleanRut.charAt(cleanRut.length - 1);
  let rutBody = cleanRut.substring(0, cleanRut.length - 1);
  
  // Remove leading zero if present
  rutBody = rutBody.replace(/^0+/, '') || '0';
  
  // Return format without dots, only dash before last digit
  return `${rutBody}-${dv}`;
}

// Sheriff Data Log API
export const getSheriffDataLogs = async (
  page = 1,
  limit = 10,
  filters?: { rut?: string; startDate?: string; endDate?: string }
): Promise<{ logs: SheriffDataLogResponse[], total: number, pages: number, currentPage: number }> => {
  try {
    const params: Record<string, any> = { page, limit };
    if (filters?.rut) params.rut = filters.rut;
    if (filters?.startDate) params.startDate = filters.startDate;
    if (filters?.endDate) params.endDate = filters.endDate;

    const response = await apiClient.get<{ logs: SheriffDataLogResponse[], total: number, pages: number, currentPage: number }>('/rut/sheriff-logs', { params });
    return response.data;
  } catch (error) {
    logger.error('Error fetching Sheriff data logs:', error);
    // Consider how to handle errors: rethrow, return default, etc.
    // For now, rethrowing to let the component handle it.
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(error.response.data.message || 'Failed to fetch Sheriff data logs');
    }
    throw new Error('Failed to fetch Sheriff data logs due to an unexpected error.');
  }
};

export const getSheriffLogById = async (logId: string): Promise<SheriffDataLogResponse> => {
  try {
    const response = await apiClient.get<SheriffDataLogResponse>(`/rut/sheriff-logs/${logId}`);
    return response.data;
  } catch (error) {
    logger.error(`Error fetching Sheriff data log by ID ${logId}:`, error);
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(error.response.data.message || `Failed to fetch  log ${logId}`);
    }
    throw new Error(`Failed to fetch  log ${logId} due to an unexpected error.`);
  }
};

export const getResults = async (params?: { page?: number; limit?: number; search?: string; sortField?: string; sortDirection?: 'asc' | 'desc' }): Promise<any> => {
  try {
    const response = await apiClient.get('/rut/results', { params });
    if (!response.data) {
      throw new Error('No data received from server');
    }
    return response.data;
  } catch (error) {
    logger.error('Error fetching results:', error);
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        throw new Error('Session expired. Please log in again.');
      } else if (error.response?.status === 403) {
        throw new Error('You do not have permission to access these results.');
      } else if (error.response?.status === 404) {
        throw new Error('Results not found.');
      }
      throw new Error(error.response?.data?.message || error.message || 'Error al cargar los datos');
    }
    throw new Error('Error al cargar los datos');
  }
};

export const deleteResult = async (id: string): Promise<{ message: string }> => {
  try {
    const response = await apiClient.delete<{ message: string }>(`/rut/results/${id}`);
    return response.data;
  } catch (error) {
    logger.error('Error deleting result:', error);
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(error.response.data.message || 'Failed to delete result');
    }
    throw new Error('Failed to delete result due to an unexpected error.');
  }
};

// User API
interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

// Add this before the changeUserPassword function

// Bulk Evaluation Progress API
export const getBulkEvaluations = async (): Promise<any[]> => {
  try {
    const response = await apiClient.get('/evaluations/bulk/recent');
    return response.data;
  } catch (error) {
    logger.error('Error fetching bulk evaluations:', error);
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        throw new Error('Session expired. Please log in again.');
      } else if (error.response?.status === 403) {
        throw new Error('You do not have permission to access these evaluations.');
      }
      throw new Error(error.response?.data?.message || 'Error al cargar las evaluaciones');
    }
    throw new Error('Error al cargar las evaluaciones');
  }
};

export const changeUserPassword = async (payload: ChangePasswordPayload): Promise<{ message: string }> => {
  try {
    const response = await apiClient.post<{ message: string }>('/users/change-password', payload);
    return response.data;
  } catch (error) {
    logger.error('Error changing user password:', error);
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(error.response.data.message || 'Failed to change password');
    }
    throw new Error('Failed to change password due to an unexpected error.');
  }
};

// Monitoring API
export const setupMonitoring = async (data: { rut: string; frequency: string }): Promise<{ message: string }> => {
  try {
    const response = await apiClient.post<{ message: string }>('/monitoring', data);
    return response.data;
  } catch (error) {
    logger.error('Error setting up monitoring:', error);
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(error.response.data.message || 'Failed to setup monitoring');
    }
    throw new Error('Failed to setup monitoring due to an unexpected error.');
  }
};

// User Notes API
export interface UserNote {
  _id: string;
  userId: string;
  tenantId: string;
  rut: string;
  note: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export const userNotesApi = {
  // Get note by RUT
  getNoteByRut: async (rut: string): Promise<UserNote | null> => {
    try {
      const response = await apiClient.get<UserNote[]>(`/user-notes/rut/${rut}`);
      // Return the first note if any exist, otherwise null
      return response.data.length > 0 ? response.data[0] : null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      logger.error('Error getting note by RUT:', error);
      throw error;
    }
  },

  // Create or update note
  saveNote: async (rut: string, note: string, tags: string[] = []): Promise<UserNote> => {
    try {
      const response = await apiClient.post<UserNote>('/user-notes', { rut, note, tags });
      return response.data;
    } catch (error) {
      logger.error('Error saving note:', error);
      throw error;
    }
  },

  // Update existing note
  updateNote: async (noteId: string, note: string, tags: string[] = []): Promise<UserNote> => {
    try {
      const response = await apiClient.put<UserNote>(`/user-notes/${noteId}`, { note, tags });
      return response.data;
    } catch (error) {
      logger.error('Error updating note:', error);
      throw error;
    }
  },

  // Delete note
  deleteNote: async (noteId: string): Promise<void> => {
    try {
      await apiClient.delete(`/user-notes/${noteId}`);
    } catch (error) {
      logger.error('Error deleting note:', error);
      throw error;
    }
  },

  // Get all notes by current user
  getMyNotes: async (page = 1, limit = 10): Promise<{ notes: UserNote[]; pagination: any }> => {
    try {
      const response = await apiClient.get<{ notes: UserNote[]; pagination: any }>(`/user-notes/user/my-notes?page=${page}&limit=${limit}`);
      return response.data;
    } catch (error) {
      logger.error('Error getting my notes:', error);
      throw error;
    }
  }
};

// Historical Consultas API
export interface HistoricalConsultaFilters {
  page?: number;
  limit?: number;
  consultaType?: 'individual' | 'massive';
  rut?: string;
  endpoint?: string;
  responseStatus?: number;
  startDate?: string;
  endDate?: string;
}

export interface UserInfo {
  _id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
}

export interface HistoricalConsulta {
  _id: string;
  tenantId: string;
  userId?: UserInfo;
  consultaType: 'individual' | 'massive';
  rut?: string;
  ruts?: string[];
  endpoint: string;
  requestData: any;
  responseStatus: number;
  responseData?: any;
  errorMessage?: string;
  processingTime: number;
  creditsUsed: number;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  metadata?: any;
  createdAt: string;
}

export interface HistoricalConsultasResponse {
  data: HistoricalConsulta[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface HistoricalConsultasStats {
  totalConsultas: number;
  consultasByType: Record<string, number>;
  consultasByEndpoint: Record<string, number>;
  consultasByStatus: Record<string, number>;
  consultasByDate: Array<{ date: string; count: number }>;
  averageProcessingTime: number;
  totalCreditsUsed: number;
}

export const historicalConsultasApi = {
  // Get historical consultas with filters and pagination
  getHistoricalConsultas: async (filters: HistoricalConsultaFilters = {}): Promise<HistoricalConsultasResponse> => {
    const response = await apiClient.get('/rut/historical-consultas', {
      params: filters
    });
    return response.data;
  },

  // Get historical consultas statistics
  getHistoricalConsultasStats: async (startDate?: string, endDate?: string): Promise<HistoricalConsultasStats> => {
    const response = await apiClient.get('/rut/historical-consultas/stats', {
      params: { startDate, endDate }
    });
    return response.data;
  }
};
