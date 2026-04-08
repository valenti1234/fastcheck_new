import { apiClient } from './api';

export interface SnifaRecord {
  _id: string;
  procesoSancionId: number;
  expediente: string;
  procesoSancionTipoNombre: string;
  procesoSancionEstado: string;
  fechaInicio: string;
  fechaTermino?: string;
  multaTotalUTA?: number;
  linkSNIFA?: string;
  unidadFiscalizableId?: number;
  nombre: string;
  regionNombre: string;
  comunaNombre?: string;
  latitud?: number;
  longitud?: number;
  categoriaEconomicaNombre: string;
  subCategoriaEconomicaNombre?: string;
  linkSNIFA_UF?: string;
  fechaActualizacion?: string;
  razonSocial?: string;
  rut?: string;
  unidadFiscalizable?: string;
  lista?: string;
  fastCheckProcesoSancionatorio?: string;
  fastCheckSanciones?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SnifaImportPreview {
  headers: string[];
  preview: Partial<SnifaRecord>[];
  warnings: Array<{ rowIndex: number; warning: string }>;
  summary: {
    totalRows: number;
    previewCount: number;
    missingCount: number;
    distinctEstados: string[];
    distinctRegiones: string[];
  };
}

export interface SnifaImportSummary {
  total: number;
  processed: number;
  saved: number;
  duplicates: number;
  errors: number;
  warnings: number;
}

export interface SnifaImportJob {
  _id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'canceled';
  processed: number;
  saved: number;
  duplicates: number;
  errorCount: number;
  total?: number;
  errorDetails?: Array<{ rowIndex: number; error: string }>;
  warnings?: Array<{ rowIndex: number; warning: string }>;
  startedAt?: string;
  completedAt?: string;
}

export interface SnifaGlobalSummary {
  total: number;
  byEstado: Record<string, number>;
  byRegion: Array<{ region: string; count: number }>;
  lastUpdate?: string;
}

export interface SnifaFilters {
  page?: number;
  limit?: number;
  search?: string;
  estado?: string;
  region?: string;
  categoria?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface SnifaStats {
  totalSanctions: number;
  sanctionsByState: Array<{ _id: string; count: number }>;
  sanctionsByRegion: Array<{ _id: string; count: number }>;
  sanctionsByCategory: Array<{ _id: string; count: number }>;
  totalFines: number;
  recentSanctions: Array<Partial<SnifaRecord>>;
}

export interface SnifaListResponse {
  success: boolean;
  data: SnifaRecord[];
  pagination: {
    current: number;
    pages: number;
    total: number;
    limit: number;
  };
}

class SnifaService {
  private baseUrl = '/snifa';

  async getSummary(): Promise<SnifaGlobalSummary> {
    const response = await apiClient.get(`${this.baseUrl}/summary`);
    return response.data;
  }

  async getStats(): Promise<SnifaStats> {
    const response = await apiClient.get(`${this.baseUrl}/stats`);
    return response.data;
  }

  async getSanctions(filters: SnifaFilters = {}): Promise<SnifaListResponse> {
    const response = await apiClient.get(this.baseUrl, { params: filters });
    return response.data;
  }

  async getSanctionById(id: string): Promise<SnifaRecord> {
    const response = await apiClient.get(`${this.baseUrl}/${id}`);
    return response.data;
  }

  async deleteSanction(id: string): Promise<void> {
    await apiClient.delete(`${this.baseUrl}/${id}`);
  }

  async preview(file: File): Promise<SnifaImportPreview> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post(`${this.baseUrl}/preview`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  }

  async import(file: File, onUploadProgress?: (p: number) => void): Promise<{ message: string; summary: SnifaImportSummary; jobId: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post(`${this.baseUrl}/import`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (evt) => {
        if (onUploadProgress && evt.total) {
          onUploadProgress(Math.round((evt.loaded * 100) / evt.total));
        }
      }
    });
    return response.data;
  }

  async cancelJob(jobId: string): Promise<{ success: boolean }> {
    const response = await apiClient.patch(`${this.baseUrl}/import-jobs/${jobId}/cancel`);
    return response.data;
  }

  async getJobStatus(jobId: string): Promise<{ success: boolean; job: SnifaImportJob }> {
    const response = await apiClient.get(`${this.baseUrl}/import-jobs/${jobId}/status`);
    return response.data;
  }

  async list(params: { 
    page?: number; 
    limit?: number; 
    nombre?: string; 
    expediente?: string; 
    regionNombre?: string; 
    procesoSancionEstado?: string;
    fechaInicioFrom?: string | Date;
    fechaInicioTo?: string | Date;
    multaMin?: number;
    multaMax?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{ success: boolean; data: SnifaRecord[]; pagination: { current: number; pages: number; total: number; limit: number } }> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, String(v));
    });
    const response = await apiClient.get(`${this.baseUrl}?${query.toString()}`);
    return response.data;
  }
}

export const snifaService = new SnifaService();
export default snifaService;
