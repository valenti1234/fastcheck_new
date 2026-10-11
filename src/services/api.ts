import axios from 'axios';
import { User, LoginCredentials, RegisterData } from '../types/auth';
import { Tenant, TenantUser } from '../types/tenant';
import { EvaluationJob, EvaluationResult } from '../models/evaluation';
import { EvaluationService } from './evaluationService'; // This seems to be a backend service, ensure it's correctly referenced or remove if not used on frontend
import { SupplierData } from '../types/evaluation';
import { SheriffDataLogResponse } from '../types/sheriff';
import { logger } from '../utils/logger';
import { canonicalizeChileanRut, calculateDvMod11 } from '../utils/rutCanonical';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  (globalThis as any).__APP_ENV__?.VITE_API_BASE_URL ||
  'http://localhost:8181/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
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
  const result = canonicalizeChileanRut(rut);
  if (result.bodyLength < 7 || result.bodyLength > 8) return false;
  // Si el usuario escribió un DV explícitamente NO válido (coincide con mod11),
  // rechazamos — incluso si el cuerpo tiene longitud correcta.
  // Solo permitimos "faltante" cuando el usuario está digitando sin DV aún
  // (input sin guion y < 8 dígitos limpios) pero en ese caso bodyLength sería
  // <7 y ya lo rechazamos arriba.
  if (!result.originalDvValid) {
    const clean = String(rut).replace(/[^0-9Kk-]/g, '').toUpperCase();
    const hasDash = /-/.test(clean);
    const digitsOnly = clean.replace(/-/g, '');
    // Si el RUT traía guion, el DV fue especificado (aunque esté vacío) y debe ser correcto.
    if (hasDash) return false;
    // Si no traía guion pero tiene al menos 8 dígitos contiguos, el usuario
    // intentó poner el DV dentro (body+DV todo junto): exigir que coincida.
    if (digitsOnly.length >= 8) {
      return calculateDvMod11(result.body) === result.dv && result.originalDvValid;
    }
    return false;
  }
  return true;
}

/**
 * "Lee respetuosamente" un RUT escrito por el usuario separando cuerpo y DV.
 * A diferencia de canonicalizeChileanRut, NUNCA recalcula ni sobreescribe el DV
 * que el usuario escribió.  Solo se usa para el formatter de UI.
 *
 * Reglas de parseo (formato final):
 *   1. Si hay guion: lo que está a la izquierda (solo dígitos) = cuerpo.
 *      Primer carácter a la derecha (0-9/K-k) = DV.  Ambos se conservan.
 *   2. Si NO hay guion:
 *      a. Longitud 8: primeros 7 dígitos cuerpo, último carácter DV (RUT viejo).
 *      b. Longitud 9: primeros 8 dígitos cuerpo, último carácter DV (RUT nuevo).
 *      c. Otras longitudes >9: quitar leading zeros y repetir (a)/(b) si aplica.
 *   3. Si nada coincide: cadena limpia.
 *
 * Devuelve { body, dv } donde dv es '' si no se pudo detectar.
 */
function parseUserRutRespectfully(raw: string): { body: string; dv: string } {
  if (!raw) return { body: '', dv: '' };
  const str = String(raw);
  const hasDash = /-/.test(str);
  if (hasDash) {
    const idx = str.lastIndexOf('-');
    const left = str.substring(0, idx).replace(/[^0-9]/g, '');
    const right = str.substring(idx + 1).replace(/[^0-9Kk]/g, '').toUpperCase();
    return { body: left, dv: right.charAt(0) || '' };
  }
  const dgts = str.replace(/[^0-9Kk]/g, '').toUpperCase();
  if (dgts.length === 0) return { body: '', dv: '' };
  // Si el último carácter es K y hay al menos 1 dígito antes, probablemente es DV.
  if (dgts.length >= 2 && dgts.charAt(dgts.length - 1) === 'K' && /^[0-9]+$/.test(dgts.slice(0, -1))) {
    return { body: dgts.slice(0, -1), dv: 'K' };
  }
  if (dgts.length === 8 && /^[0-9]+$/.test(dgts)) {
    // RUT de 7 dígitos + DV numérico (ej: 12345672 => 1.234.567-2)
    return { body: dgts.substring(0, 7), dv: dgts.charAt(7) };
  }
  if (dgts.length === 9 && /^[0-9]+$/.test(dgts)) {
    // RUT de 8 dígitos + DV numérico (ej: 123456785 => 12.345.678-5)
    return { body: dgts.substring(0, 8), dv: dgts.charAt(8) };
  }
  // Caso ambiguo o sin DV: solo cuerpo.
  return { body: dgts, dv: '' };
}

/**
 * Aplica separadores de miles al cuerpo numérico y arma la cadena final
 * `XX.XXX.XXX-DV`.  Si dv está vacío devuelve solo el cuerpo con separadores.
 */
function prettyPrintRut(body: string, dv: string): string {
  if (!body && !dv) return '';
  let withDots = '';
  if (/^\d+$/.test(body)) {
    let n = 0;
    for (let i = body.length - 1; i >= 0; i--) {
      if (n > 0 && n % 3 === 0) withDots = '.' + withDots;
      withDots = body.charAt(i) + withDots;
      n++;
    }
  } else {
    withDots = body;
  }
  if (dv) return `${withDots}-${dv}`;
  return withDots;
}

/**
 * 🩹 FIX 29.09.2026: La antigua implementación usaba slice(0,-1) sobre el RUT
 *    limpio, trocando 1 dígito del cuerpo cuando el input ERA DE 8+ CIFRAS y
 *    NO tenía guion (ej. 20779347 => 2077934-7 erróneo en vez de 20779347-7).
 *    Ahora desambigüa automáticamente con validación módulo 11 en ambas hipótesis
 *    (ver canonicalizeChileanRut en rutCanonical.ts).
 *
 * 🩹 FIX 01.10.2026 #1 (máx 2 dígitos): Durante la escritura parcial (menos de
 *    8 caracteres limpios y SIN separadores) NO calcular DV ni forzar formato
 *    canónico.  Simplemente devolvemos los dígitos tal cual para que el usuario
 *    pueda seguir escribiendo sin perder pulsaciones.
 *
 * 🩹 FIX 01.10.2026 #2 (backspace bloqueado): Detectar edición transitoria — el
 *    usuario acaba de borrar el DV (guion colgado), el propio guion (string de
 *    8-9 chars todo dígitos sin separadores), o un dígito del cuerpo y el RUT
 *    aún no cuadra.  En esos escenarios NO re-insertamos guion/DV, lo que
 *    permitía borrar caracteres indefinidamente.
 *
 * 🩹 FIX 01.10.2026 #3 (respetar DV escrito por el usuario + pretty-print): En
 *    lugar de canonicalizeChileanRut (que corrige el DV cuando no coincide con
 *    mod11), usamos parseUserRutRespectfully + prettyPrintRut.  Esto garantiza
 *    que si el usuario escribe "12345678k" se muestre "12.345.678-K" aunque el
 *    DV sea incorrecto (luego validateChileanRut se encargará de marcarlo).
 */
export function formatChileanRut(rut: string): string {
  if (!rut) return '';
  const raw = String(rut);
  const hasDash = /-/.test(raw);
  const hasAnySeparator = /[.\-\s]/.test(raw);
  const digitsOnly = raw.replace(/[^0-9Kk]/g, '').toUpperCase();

  // CASO 1 — SIN separadores y <8 dígitos: escritura parcial libre.
  if (!hasAnySeparator && digitsOnly.length < 8) {
    return digitsOnly;
  }

  // CASO 1b — SIN separadores NINGUNO y el input cae en "edición parcial
  // sin guion aún" 8-9 dígitos (pero NO es un candidato claro a RUT completo
  // con DV final numérico O es K en el último pero el usuario SÓLO escribió
  // dígitos y acaba de quitar el guion).  Para permitir backspace sobre el
  // guion, si el string carece de CUALQUIER separador y es solo dígitos/K,
  // permitimos el passthrough SIEMPRE QUE no haya estructura clara.
  // Nota: para input tipo "12345678k" o "960426701" (9 dígitos) necesitamos
  // formatear porque se supone que son RUTs.  Pero para que backspace sobre
  // el guion funcione ("12.345.678-5" → user borra guion → queda "123456785")
  // debemos detectar que el original venía con separadores... pero perdemos
  // ese contexto aquí.  Compromiso: usamos parseo respetuoso + pretty-print
  // (ver parseUserRutRespectfully) que siempre produce un guion y puntos si
  // la longitud cuadra; la validación de mod11 corre por validateChileanRut.
  // Así que CASO 1b lo limitamos a longitudes NO-canónicas (<=7 o >=10).

  // CASO 2 — CON guion y edición transitoria (backspace en curso).
  if (hasDash) {
    const idx = raw.lastIndexOf('-');
    const leftRaw = raw.substring(0, idx).replace(/[^0-9]/g, '');
    const rightRaw = raw.substring(idx + 1).replace(/[^0-9Kk]/g, '').toUpperCase();

    // 2a — Guion colgado (acaba de borrar DV): devolvemos solo el cuerpo, sin
    // guion, sin DV.  El usuario puede seguir borrando el cuerpo sin loop.
    if (rightRaw.length === 0) {
      return leftRaw;
    }

    // 2b — DV trunco a más de 1 carácter: preservar lo escrito.
    if (rightRaw.length > 1) {
      return prettyPrintRut(leftRaw, rightRaw.charAt(0)) + rightRaw.substring(1);
    }

    // 2c — Cuerpo <7 dígitos y ya hay guion: respetar lo escrito (no validar).
    if (leftRaw.length < 7) {
      return prettyPrintRut(leftRaw, rightRaw.charAt(0));
    }
  }

  // CASO 3 — RUT "compuesto" (tiene separadores, o bien 8-9 caracteres sin
  // separadores que se interpretan como cuerpo+DV).  Usamos parseo
  // RESPETUOSO + pretty-print.  NUNCA recalculamos DV.
  const parsed = parseUserRutRespectfully(raw);
  if (!parsed.body && !parsed.dv) return digitsOnly;
  return prettyPrintRut(parsed.body, parsed.dv);
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

// ===== User Profile Enriched (Avatar Click) =====
export interface ProfilePermisoItem {
  codigo: string;
  categoria: string;
  es_sensible: boolean;
  descripcion?: string;
  origen?: 'ROLE' | 'GRANT' | 'DENY' | 'WILDCARD';
}

export interface ProfilePlanPool {
  plan_codigo: string;
  nombre_plan: string;
  nivel_pool_plan: number;
  creditos_mensuales_org: number;
  saldo_actual: number;
  creditos_usados: number;
  overshoot_actual: number;
  overshoot_pct_max: number;
  fecha_actualizacion?: string;
}

export interface ProfileOrganizacion {
  _id: string;
  name: string;
  isActive: boolean;
  usuariosCount: number;
  evaluacionesUsadas: number;
  planCodigo?: string | null;
}

export interface ProfileUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  isSuperuser: boolean;
  cacheVersion: number;
  createdAt?: string;
  avatarInicial?: string;
}

export interface ProfilePermisosBlock {
  totalPermisos: number;
  totalSensibles: number;
  lista: ProfilePermisoItem[];
  vienePorRoles: string[];
  overridesGranted: string[];
  overridesDenied: string[];
}

export interface ProfileHistorialConsultas {
  totalConsultasUsuario: number;
  totalCreditsUsedHistorial: number;
  totalConsultasOrganizacion: number;
}

export interface ProfileAuditoriaItem {
  _id?: string;
  accion?: string;
  entidad?: string;
  entidad_id?: string;
  fecha?: string;
  createdAt?: string;
  detalles?: Record<string, any>;
  [k: string]: any;
}

export interface UserProfileEnriched {
  user: ProfileUser;
  organizacion: ProfileOrganizacion | null;
  planPool: ProfilePlanPool | null;
  permisos: ProfilePermisosBlock;
  historialConsultas: ProfileHistorialConsultas;
  auditoriasUltimas10: ProfileAuditoriaItem[];
}

export const userProfileApi = {
  getMyProfileEnriched: async (): Promise<UserProfileEnriched> => {
    const response = await apiClient.get<UserProfileEnriched>('/users/me/enriched');
    return response.data;
  }
};
