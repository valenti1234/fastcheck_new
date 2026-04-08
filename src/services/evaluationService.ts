import { EvaluationJob, EvaluationResult } from '../types/evaluation';
import { validateChileanRut } from './api';
import axios from 'axios';
import logger from '../utils/logger';

const API_URL = globalThis.__APP_ENV__?.VITE_API_BASE_URL || 'https://duxiter.azurianlab.com/api';

// Helper function to get headers with auth token
const getHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
};

interface EvaluationRequest {
  type: 'single' | 'bulk';
  supplierData: {
    rut: string;
    name: string;
  };
  tenantId: string;
  userId: string;
  companyData?: any;
}

interface EvaluationResponse {
  id: string;
  type: 'single' | 'bulk';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  supplierData: {
    rut: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

export const createEvaluation = async (data: EvaluationRequest): Promise<EvaluationResponse> => {
  try {
    logger.log('Creating evaluation with:', data);
    
    // Validate required fields
    if (!data.tenantId) {
      throw new Error('Tenant ID is required');
    }
    
    if (!data.userId) {
      throw new Error('User ID is required');
    }
    
    const response = await axios.post<EvaluationResponse>(`${API_URL}/evaluations`, data);
    
    if (!response.data) {
      throw new Error('No se recibió respuesta del servidor');
    }
    
    return response.data;
  } catch (error) {
    logger.error('Error creating evaluation:', error);
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        throw new Error('No autorizado. Por favor inicie sesión nuevamente.');
      }
      if (error.response?.status === 403) {
        throw new Error('No tiene permisos para realizar esta acción.');
      }
      if (error.response?.status === 404) {
        throw new Error('Tenant no encontrado');
      }
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
    }
    throw new Error('Error al crear la evaluación. Por favor intente nuevamente.');
  }
}

// Export convenience functions
export const deleteEvaluation = (jobId: string) => EvaluationService.deleteEvaluation(jobId);
export const deleteBulkEvaluations = (jobIds: string[]) => EvaluationService.deleteBulkEvaluations(jobIds);;

export class EvaluationService {
  // Get jobs for a tenant
  static async getJobs(tenantId: string, page = 1, limit = 10): Promise<{
    jobs: EvaluationJob[];
    total: number;
    pages: number;
  }> {
    const response = await fetch(`${API_URL}/evaluations?tenantId=${tenantId}&page=${page}&limit=${limit}`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch jobs');
    return response.json();
  }

  // Get all jobs for a tenant
  static async getAllJobs(tenantId: string): Promise<EvaluationJob[]> {
    let allJobs: EvaluationJob[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(`${API_URL}/evaluations?tenantId=${tenantId}&page=${page}&limit=100`, {
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }

      const data = await response.json();
      allJobs = allJobs.concat(data.jobs);
      hasMore = page < data.pages;
      page++;
    }

    return allJobs;
  }

  // Get a specific job
  static async getJob(jobId: string): Promise<EvaluationJob | null> {
    const response = await fetch(`${API_URL}/evaluations/results/${jobId}`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error('Failed to fetch job');
    }
    return response.json();
  }

  // Get results for a job
  static async getResults(jobId: string, page = 1, limit = 10): Promise<{
    results: EvaluationResult[];
    total: number;
    pages: number;
  }> {
    const response = await fetch(`${API_URL}/evaluations/results/${jobId}/results?page=${page}&limit=${limit}`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch results');
    return response.json();
  }

  // Create a single evaluation
  static async createSingleEvaluation(tenantId: string, userId: string, supplierData: { rut: string; name?: string }): Promise<EvaluationJob> {
    // Validate RUT format
    if (!validateChileanRut(supplierData.rut)) {
      throw new Error('Invalid RUT format');
    }

    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    if (!userId) {
      throw new Error('User ID is required');
    }

    const response = await fetch(`${API_URL}/evaluations`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        tenantId,
        userId,
        type: 'single',
        supplierData: {
          rut: supplierData.rut,
          name: supplierData.name || undefined
        }
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      if (response.status === 401) {
        throw new Error('Unauthorized. Please log in again.');
      }
      throw new Error(error.message || 'Failed to create evaluation');
    }

    const evaluationJob = await response.json();
    return evaluationJob;
  }

  // Create bulk evaluation
  static async createBulkEvaluation(tenantId: string, userId: string, suppliers: { rut: string; name?: string }[]): Promise<EvaluationJob> {
    // Validate RUT format for all entries
    const invalidRuts = suppliers.filter(s => !validateChileanRut(s.rut));
    if (invalidRuts.length > 0) {
      throw new Error(`Invalid RUT format for: ${invalidRuts.map(s => s.rut).join(', ')}`);
    }

    const response = await fetch(`${API_URL}/evaluations/bulk`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        tenantId,
        userId,
        suppliers,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      if (response.status === 401) {
        throw new Error('Unauthorized. Please log in again.');
      }
      throw new Error(error.message || 'Failed to create bulk evaluation');
    }

    const evaluationJob = await response.json();
    return evaluationJob;
  }

  // Delete a single evaluation
  static async deleteEvaluation(jobId: string): Promise<{ message: string; deletedJob: EvaluationJob }> {
    const response = await fetch(`${API_URL}/evaluations/${jobId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      if (response.status === 401) {
        throw new Error('Unauthorized. Please log in again.');
      }
      if (response.status === 404) {
        throw new Error('Evaluation not found.');
      }
      throw new Error(error.message || 'Failed to delete evaluation');
    }

    return response.json();
  }

  // Delete multiple evaluations
  static async deleteBulkEvaluations(jobIds: string[]): Promise<{
    message: string;
    deletedCount: number;
    failedCount: number;
    errors: string[];
  }> {
    const response = await fetch(`${API_URL}/evaluations/bulk/delete`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ jobIds }),
    });

    if (!response.ok) {
      const error = await response.json();
      if (response.status === 401) {
        throw new Error('Unauthorized. Please log in again.');
      }
      if (response.status === 400) {
        throw new Error(error.message || 'Invalid request');
      }
      throw new Error(error.message || 'Failed to delete evaluations');
    }

    return response.json();
  }
}
