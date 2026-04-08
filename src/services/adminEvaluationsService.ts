import { apiClient } from './api';
import axios from 'axios';
import logger from '../utils/logger';

export interface AdminTenantEvaluationsItem {
  tenantId: string;
  tenantName: string | null;
  jobs: number;
  totalEvaluationsFromJobs: number;
  completedEvaluationsFromJobs: number;
  failedEvaluationsFromJobs: number;
  totalResults: number;
  completedResults: number;
  failedResults: number;
}

export interface AdminEvaluationsResponse {
  data: AdminTenantEvaluationsItem[];
}

export const adminEvaluationsService = {
  async getEvaluationsByTenant(): Promise<AdminTenantEvaluationsItem[]> {
    try {
      const response = await apiClient.get<AdminEvaluationsResponse>('/admin/evaluations');
      return response.data.data;
    } catch (error) {
      logger.error('Error fetching admin evaluations by tenant:', error);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('Session expired. Please log in again.');
        }
        if (error.response?.status === 403) {
          throw new Error('You do not have permission to access admin evaluations.');
        }
        throw new Error(error.response?.data?.message || 'Failed to load admin evaluations');
      }
      throw new Error('Failed to load admin evaluations');
    }
  }
};