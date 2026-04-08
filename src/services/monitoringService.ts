import { apiClient } from './api';

export interface MonitoringSchedule {
  _id: string;
  rut: string;
  companyName?: string;
  frequency: 'minute' | 'daily' | 'weekly' | 'monthly';
  isActive: boolean;
  lastExecuted?: string;
  nextExecution: string;
  executionCount: number;
  lastExecutionStatus?: 'success' | 'error' | 'pending';
  lastExecutionError?: string;
  createdAt: string;
  updatedAt: string;
  tenantId?: {
    _id: string;
    name: string;
  };
}

export interface CreateMonitoringScheduleRequest {
  rut: string;
  frequency: 'minute' | 'daily' | 'weekly' | 'monthly';
  companyName?: string;
}

export interface UpdateMonitoringScheduleRequest {
  frequency?: 'minute' | 'daily' | 'weekly' | 'monthly';
  isActive?: boolean;
  companyName?: string;
}

export interface MonitoringSchedulesResponse {
  schedules: MonitoringSchedule[];
  total: number;
  pages: number;
  currentPage: number;
}

export interface MonitoringStatistics {
  tenantStats: Array<{
    tenantId: string;
    tenantName: string;
    totalSchedules: number;
    activeSchedules: number;
    inactiveSchedules: number;
    lastExecutionCounts: {
      success: number;
      error: number;
      pending: number;
    };
  }>;
  globalStats: {
    totalSchedules: number;
    activeSchedules: number;
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
  };
}

export interface RiskChangeNotification {
  _id: string;
  rut: string;
  tenantId: string;
  scheduleId: string;
  companyName?: string;
  previousRisk: any;
  newRisk: any;
  changeDetectedAt: string;
  notificationSent: boolean;
  notificationMethod: string;
  createdAt: string;
  updatedAt: string;
}

export interface MonitoringExecution {
  _id: string;
  scheduleId: string;
  rut: string;
  tenantId: string;
  executedAt: string;
  status: 'success' | 'error' | 'pending' | 'running';
  startedAt: string;
  completedAt?: string;
  duration?: number;
  error?: string;
  errorDetails?: {
    code?: string;
    message?: string;
    stack?: string;
  };
  riskAssessment?: any;
  previousRisk?: any;
  riskChanged: boolean;
  sheriffLogId?: string;
  executionDetails: {
    requestData?: any;
    responseData?: any;
    apiCalls?: Array<{
      endpoint: string;
      method: string;
      timestamp: string;
      duration: number;
      status: number;
      error?: string;
    }>;
    processingSteps?: Array<{
      step: string;
      timestamp: string;
      duration: number;
      status: 'success' | 'error' | 'skipped';
      details?: any;
    }>;
  };
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
    triggeredBy: 'schedule' | 'manual' | 'api';
    triggeredByUserId?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface MonitoringExecutionsResponse {
  executions: MonitoringExecution[];
  total: number;
  pages: number;
  currentPage: number;
}

class MonitoringService {
  /**
   * Get monitoring schedules for the current tenant
   */
  async getMonitoringSchedules(page = 1, limit = 10): Promise<MonitoringSchedulesResponse> {
    const response = await apiClient.get<MonitoringSchedulesResponse>(
      `/monitoring?page=${page}&limit=${limit}`
    );
    return response.data;
  }

  /**
   * Get all monitoring schedules across all tenants (superuser only)
   */
  async getAllMonitoringSchedules(page = 1, limit = 10): Promise<MonitoringSchedulesResponse> {
    const response = await apiClient.get<MonitoringSchedulesResponse>(
      `/monitoring/all?page=${page}&limit=${limit}`
    );
    return response.data;
  }

  /**
   * Get a specific monitoring schedule by ID
   */
  async getMonitoringSchedule(scheduleId: string): Promise<MonitoringSchedule> {
    // Validate schedule ID
    if (!scheduleId || scheduleId === 'undefined' || scheduleId.trim() === '') {
      throw new Error('Schedule ID is required and cannot be undefined or empty');
    }

    // Validate ObjectId format (24 hex characters)
    if (!/^[0-9a-fA-F]{24}$/.test(scheduleId)) {
      throw new Error('Schedule ID must be a valid 24-character hex string');
    }

    const response = await apiClient.get<MonitoringSchedule>(`/monitoring/${scheduleId}`);
    return response.data;
  }

  /**
   * Create a new monitoring schedule
   */
  async createMonitoringSchedule(data: CreateMonitoringScheduleRequest): Promise<MonitoringSchedule> {
    const response = await apiClient.post<MonitoringSchedule>('/monitoring', data);
    return response.data;
  }

  /**
   * Update an existing monitoring schedule
   */
  async updateMonitoringSchedule(
    scheduleId: string,
    data: UpdateMonitoringScheduleRequest
  ): Promise<MonitoringSchedule> {
    // Validate schedule ID
    if (!scheduleId || scheduleId === 'undefined' || scheduleId.trim() === '') {
      throw new Error('Schedule ID is required and cannot be undefined or empty');
    }

    // Validate ObjectId format (24 hex characters)
    if (!/^[0-9a-fA-F]{24}$/.test(scheduleId)) {
      throw new Error('Schedule ID must be a valid 24-character hex string');
    }

    const response = await apiClient.put<MonitoringSchedule>(`/monitoring/${scheduleId}`, data);
    return response.data;
  }

  /**
   * Delete a monitoring schedule
   */
  async deleteMonitoringSchedule(scheduleId: string): Promise<{ message: string }> {
    // Validate schedule ID
    if (!scheduleId || scheduleId === 'undefined' || scheduleId.trim() === '') {
      throw new Error('Schedule ID is required and cannot be undefined or empty');
    }

    // Validate ObjectId format (24 hex characters)
    if (!/^[0-9a-fA-F]{24}$/.test(scheduleId)) {
      throw new Error('Schedule ID must be a valid 24-character hex string');
    }

    const response = await apiClient.delete<{ message: string }>(`/monitoring/${scheduleId}`);
    return response.data;
  }

  /**
   * Manually trigger a monitoring execution
   */
  async triggerMonitoring(scheduleId: string): Promise<{ message: string }> {
    // Validate schedule ID
    if (!scheduleId || scheduleId === 'undefined' || scheduleId.trim() === '') {
      throw new Error('Schedule ID is required and cannot be undefined or empty');
    }

    // Validate ObjectId format (24 hex characters)
    if (!/^[0-9a-fA-F]{24}$/.test(scheduleId)) {
      throw new Error('Schedule ID must be a valid 24-character hex string');
    }

    const response = await apiClient.post<{ message: string }>(`/monitoring/${scheduleId}/trigger`);
    return response.data;
  }

  /**
   * Get monitoring statistics (superuser only)
   */
  async getMonitoringStatistics(): Promise<MonitoringStatistics> {
    const response = await apiClient.get<MonitoringStatistics>('/monitoring/statistics');
    return response.data;
  }

  /**
   * Get risk change notifications for the current tenant
   */
  async getRiskChangeNotifications(page = 1, limit = 10): Promise<{
    notifications: RiskChangeNotification[];
    total: number;
    pages: number;
    currentPage: number;
  }> {
    const response = await apiClient.get(
      `/monitoring/risk-changes?page=${page}&limit=${limit}`
    );
    return response.data;
  }

  /**
   * Mark a risk change notification as read
   */
  async markRiskChangeNotificationAsRead(notificationId: string): Promise<{ message: string }> {
    const response = await apiClient.patch<{ message: string }>(
      `/monitoring/risk-changes/${notificationId}/read`
    );
    return response.data;
  }

  /**
   * Get monitoring execution history for a specific schedule
   */
  /**
   * Get monitoring execution history for a schedule
   */
  async getMonitoringExecutions(
    scheduleId: string,
    page = 1,
    limit = 20
  ): Promise<MonitoringExecutionsResponse> {
    const response = await apiClient.get<MonitoringExecutionsResponse>(
      `/monitoring/${scheduleId}/executions?page=${page}&limit=${limit}`
    );
    return response.data;
  }

  /**
   * Get specific monitoring execution details
   */
  async getMonitoringExecution(executionId: string): Promise<MonitoringExecution> {
    const response = await apiClient.get<MonitoringExecution>(
      `/monitoring/executions/${executionId}`
    );
    return response.data;
  }

  /**
   * Get monitoring execution history for a schedule (legacy method for backward compatibility)
   */
  async getMonitoringHistory(
    scheduleId: string,
    page = 1,
    limit = 10
  ): Promise<{
    executions: Array<{
      _id: string;
      scheduleId: string;
      executedAt: string;
      status: 'success' | 'error' | 'pending';
      error?: string;
      riskAssessment?: any;
      previousRisk?: any;
    }>;
    total: number;
    pages: number;
    currentPage: number;
  }> {
    // Use the new endpoint but transform the response for backward compatibility
    const response = await this.getMonitoringExecutions(scheduleId, page, limit);
    return {
      executions: response.executions.map(exec => ({
        _id: exec._id,
        scheduleId: exec.scheduleId,
        executedAt: exec.executedAt,
        status: exec.status === 'running' ? 'pending' : exec.status as 'success' | 'error' | 'pending',
        error: exec.error,
        riskAssessment: exec.riskAssessment,
        previousRisk: exec.previousRisk
      })),
      total: response.total,
      pages: response.pages,
      currentPage: response.currentPage
    };
  }

  /**
   * Setup monitoring (legacy function for backward compatibility)
   */
  async setupMonitoring(data: { rut: string; frequency: string }): Promise<{ message: string }> {
    const response = await apiClient.post<{ message: string }>('/monitoring', {
      rut: data.rut,
      frequency: data.frequency as 'minute' | 'daily' | 'weekly' | 'monthly'
    });
    return response.data;
  }

  /**
   * Pause a monitoring schedule
   */
  async pauseMonitoringSchedule(scheduleId: string): Promise<MonitoringSchedule> {
    return this.updateMonitoringSchedule(scheduleId, { isActive: false });
  }

  /**
   * Resume a monitoring schedule
   */
  async resumeMonitoringSchedule(scheduleId: string): Promise<MonitoringSchedule> {
    return this.updateMonitoringSchedule(scheduleId, { isActive: true });
  }

  /**
   * Get monitoring schedule by RUT
   */
  async getMonitoringScheduleByRut(rut: string): Promise<MonitoringSchedule | null> {
    try {
      const response = await apiClient.get<MonitoringSchedule>(`/monitoring/rut/${rut}`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Bulk create monitoring schedules
   */
  async bulkCreateMonitoringSchedules(
    schedules: CreateMonitoringScheduleRequest[]
  ): Promise<{
    created: MonitoringSchedule[];
    errors: Array<{ rut: string; error: string }>;
  }> {
    const response = await apiClient.post('/monitoring/bulk', { schedules });
    return response.data;
  }

  /**
   * Export monitoring schedules to CSV
   */
  async exportMonitoringSchedules(): Promise<Blob> {
    const response = await apiClient.get('/monitoring/export', {
      responseType: 'blob'
    });
    return response.data;
  }
}

export const monitoringService = new MonitoringService();
export default monitoringService;