import { apiClient } from './api';

export interface AntiunionCase {
  _id: string;
  rut: string;
  companyName: string;
  rit: string;
  tribunal: string;
  date: string;
  description: string;
  complaintType: 'DT' | 'PARTICULAR' | 'UNKNOWN';
  fineAmount: string;
  pdfFileName?: string;
  pdfPath?: string;
  uploadedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AntiunionCaseFilters {
  page?: number;
  limit?: number;
  rut?: string;
  companyName?: string;
  tribunal?: string;
  complaintType?: string;
}

export interface AntiunionCaseResponse {
  success: boolean;
  data: AntiunionCase[];
  pagination: {
    current: number;
    pages: number;
    total: number;
    limit: number;
  };
}

export interface AntiunionCaseStats {
  totalCases: number;
  casesByType: Array<{ _id: string; count: number }>;
  casesByTribunal: Array<{ _id: string; count: number }>;
  recentCases: Array<{
    _id: string;
    companyName: string;
    rut: string;
    date: string;
    tribunal: string;
  }>;
}

export interface UploadResponse {
  success: boolean;
  message: string;
  data: AntiunionCase[];
  skipped?: Array<{
    rut: string;
    rit: string;
    companyName: string;
    reason: string;
  }>;
  summary?: {
    total: number;
    saved: number;
    skipped: number;
  };
}

class AntiunionCaseService {
  private baseUrl = '/antiunion-cases';

  /**
   * Upload a PDF file with real-time processing progress using Server-Sent Events
   */
  async uploadPDFWithProgress(
    file: File, 
    onProgress?: (data: {
      stage: string;
      progress: number;
      message: string;
      current?: number;
      total?: number;
      result?: UploadResponse;
      error?: string;
    }) => void
  ): Promise<UploadResponse> {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('pdf', file);

      // Ottieni il token di autenticazione
      const token = localStorage.getItem('token');
      
      // Crea EventSource per SSE
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api${this.baseUrl}/upload-pdf-progress`, true);
      
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      
      xhr.onreadystatechange = function() {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          if (xhr.status === 200) {
            // Il processo è completato, l'ultimo evento dovrebbe contenere il risultato
          } else {
            reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
          }
        }
      };
      
      xhr.onprogress = function() {
        const lines = xhr.responseText.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              if (onProgress) {
                onProgress(data);
              }
              
              // Se il processo è completato, risolvi la promise
              if (data.stage === 'completed' && data.result) {
                resolve(data.result);
                return;
              }
              
              // Se c'è un errore, rifiuta la promise
              if (data.stage === 'error') {
                reject(new Error(data.message || 'Errore durante l\'elaborazione'));
                return;
              }
              
            } catch (e) {
              // Ignora errori di parsing JSON per linee incomplete
            }
          }
        }
      };
      
      xhr.onerror = function() {
        reject(new Error('Errore di connessione'));
      };
      
      xhr.send(formData);
    });
  }

  /**
   * Upload a PDF file and extract antiunion cases (metodo tradizionale)
   */
  async uploadPDF(file: File, onProgress?: (progress: number) => void): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('pdf', file);

    const response = await apiClient.post(`${this.baseUrl}/upload-pdf`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });

    return response.data;
  }

  /**
   * Get all antiunion cases with optional filters and pagination
   */
  async getAllCases(filters: AntiunionCaseFilters = {}): Promise<AntiunionCaseResponse> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value.toString());
      }
    });

    const response = await apiClient.get(`${this.baseUrl}?${params.toString()}`);
    return response.data;
  }

  /**
   * Get a specific antiunion case by ID
   */
  async getCaseById(id: string): Promise<{ success: boolean; data: AntiunionCase }> {
    const response = await apiClient.get(`${this.baseUrl}/${id}`);
    return response.data;
  }

  /**
   * Search antiunion cases by RUT
   */
  async getCasesByRut(rut: string): Promise<{ success: boolean; count: number; data: AntiunionCase[] }> {
    const response = await apiClient.get(`${this.baseUrl}/rut/${rut}`);
    return response.data;
  }

  /**
   * Create a new antiunion case manually
   */
  async createCase(caseData: Omit<AntiunionCase, '_id' | 'createdAt' | 'updatedAt' | 'uploadedBy'>): Promise<{ success: boolean; message: string; data: AntiunionCase }> {
    const response = await apiClient.post(this.baseUrl, caseData);
    return response.data;
  }

  /**
   * Update an existing antiunion case
   */
  async updateCase(id: string, caseData: Partial<AntiunionCase>): Promise<{ success: boolean; message: string; data: AntiunionCase }> {
    const response = await apiClient.put(`${this.baseUrl}/${id}`, caseData);
    return response.data;
  }

  /**
   * Delete an antiunion case
   */
  async deleteCase(id: string): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.delete(`${this.baseUrl}/${id}`);
    return response.data;
  }

  /**
   * Get statistics about antiunion cases
   */
  async getStatistics(): Promise<AntiunionCaseStats> {
    const response = await apiClient.get(`${this.baseUrl}/stats`);
    return response.data.data;
  }

  /**
   * Export cases to CSV (if needed in the future)
   */
  async exportToCsv(filters: AntiunionCaseFilters = {}): Promise<Blob> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value.toString());
      }
    });

    const response = await apiClient.get(`${this.baseUrl}/export/csv?${params.toString()}`, {
      responseType: 'blob',
    });

    return response.data;
  }

  /**
   * Validate Chilean RUT format
   */
  static validateRut(rut: string): boolean {
    if (!rut) return false;
    
    // Remove dots and hyphens
    const cleanRut = rut.replace(/[.-]/g, '');
    
    // Check if it has the correct format (8-9 digits + 1 check digit)
    if (!/^\d{7,8}[0-9Kk]$/.test(cleanRut)) {
      return false;
    }
    
    const rutDigits = cleanRut.slice(0, -1);
    const checkDigit = cleanRut.slice(-1).toUpperCase();
    
    // Calculate check digit
    let sum = 0;
    let multiplier = 2;
    
    for (let i = rutDigits.length - 1; i >= 0; i--) {
      sum += parseInt(rutDigits[i]) * multiplier;
      multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }
    
    const remainder = sum % 11;
    const calculatedCheckDigit = remainder === 0 ? '0' : remainder === 1 ? 'K' : (11 - remainder).toString();
    
    return checkDigit === calculatedCheckDigit;
  }

  /**
   * Format RUT with dots and hyphen
   */
  static formatRut(rut: string): string {
    if (!rut) return '';
    
    // Remove existing formatting
    const cleanRut = rut.replace(/[.-]/g, '');
    
    if (cleanRut.length < 2) return cleanRut;
    
    const rutBody = cleanRut.slice(0, -1);
    const checkDigit = cleanRut.slice(-1);
    
    // Add dots every 3 digits from right to left
    const formattedBody = rutBody.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
    
    return `${formattedBody}-${checkDigit}`;
  }
}

export { AntiunionCaseService };
export const antiunionCaseService = new AntiunionCaseService();
export default antiunionCaseService;