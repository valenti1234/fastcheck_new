import { monitoringService } from '../monitoringService';
import { apiClient } from '../api';
import type {
  MonitoringSchedule,
  CreateMonitoringScheduleRequest,
  UpdateMonitoringScheduleRequest,
  MonitoringSchedulesResponse,
  MonitoringStatistics,
  RiskChangeNotification
} from '../monitoringService';

// Mock the API client
jest.mock('../api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn()
  }
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('MonitoringService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockMonitoringSchedule: MonitoringSchedule = {
    _id: '507f1f77bcf86cd799439011',
    rut: '12345678-9',
    companyName: 'Test Company',
    frequency: 'daily',
    isActive: true,
    lastExecuted: '2024-01-15T10:00:00Z',
    nextExecution: '2024-01-16T10:00:00Z',
    executionCount: 5,
    lastExecutionStatus: 'success',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    tenantId: {
      _id: '507f1f77bcf86cd799439012',
      name: 'Test Tenant'
    }
  };

  const mockSchedulesResponse: MonitoringSchedulesResponse = {
    schedules: [mockMonitoringSchedule],
    total: 1,
    pages: 1,
    currentPage: 1
  };

  const mockRiskChangeNotification: RiskChangeNotification = {
    _id: '507f1f77bcf86cd799439013',
    rut: '12345678-9',
    tenantId: '507f1f77bcf86cd799439012',
    scheduleId: '507f1f77bcf86cd799439011',
    companyName: 'Test Company',
    previousRisk: { level: 'low', score: 2 },
    newRisk: { level: 'medium', score: 5 },
    changeDetectedAt: '2024-01-15T10:00:00Z',
    notificationSent: false,
    notificationMethod: 'email',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z'
  };

  describe('getMonitoringSchedules', () => {
    it('should fetch monitoring schedules successfully', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockSchedulesResponse });

      const result = await monitoringService.getMonitoringSchedules(1, 10);

      expect(mockApiClient.get).toHaveBeenCalledWith('/monitoring?page=1&limit=10');
      expect(result).toEqual(mockSchedulesResponse);
    });

    it('should use default pagination parameters', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockSchedulesResponse });

      await monitoringService.getMonitoringSchedules();

      expect(mockApiClient.get).toHaveBeenCalledWith('/monitoring?page=1&limit=10');
    });

    it('should handle API errors', async () => {
      const error = new Error('Network error');
      mockApiClient.get.mockRejectedValue(error);

      await expect(monitoringService.getMonitoringSchedules()).rejects.toThrow('Network error');
    });
  });

  describe('getAllMonitoringSchedules', () => {
    it('should fetch all monitoring schedules for superuser', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockSchedulesResponse });

      const result = await monitoringService.getAllMonitoringSchedules(1, 10);

      expect(mockApiClient.get).toHaveBeenCalledWith('/monitoring/all?page=1&limit=10');
      expect(result).toEqual(mockSchedulesResponse);
    });

    it('should handle unauthorized access', async () => {
      const error = { response: { status: 403, data: { message: 'Forbidden' } } };
      mockApiClient.get.mockRejectedValue(error);

      await expect(monitoringService.getAllMonitoringSchedules()).rejects.toEqual(error);
    });
  });

  describe('getMonitoringSchedule', () => {
    it('should fetch a specific monitoring schedule', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockMonitoringSchedule });

      const result = await monitoringService.getMonitoringSchedule('507f1f77bcf86cd799439011');

      expect(mockApiClient.get).toHaveBeenCalledWith('/monitoring/507f1f77bcf86cd799439011');
      expect(result).toEqual(mockMonitoringSchedule);
    });

    it('should handle schedule not found', async () => {
      const error = { response: { status: 404, data: { message: 'Schedule not found' } } };
      mockApiClient.get.mockRejectedValue(error);

      await expect(monitoringService.getMonitoringSchedule('nonexistent')).rejects.toEqual(error);
    });
  });

  describe('createMonitoringSchedule', () => {
    const createData: CreateMonitoringScheduleRequest = {
      rut: '12345678-9',
      frequency: 'daily',
      companyName: 'Test Company'
    };

    it('should create a monitoring schedule successfully', async () => {
      mockApiClient.post.mockResolvedValue({ data: mockMonitoringSchedule });

      const result = await monitoringService.createMonitoringSchedule(createData);

      expect(mockApiClient.post).toHaveBeenCalledWith('/monitoring', createData);
      expect(result).toEqual(mockMonitoringSchedule);
    });

    it('should handle validation errors', async () => {
      const error = {
        response: {
          status: 400,
          data: { message: 'Invalid RUT format' }
        }
      };
      mockApiClient.post.mockRejectedValue(error);

      await expect(monitoringService.createMonitoringSchedule(createData)).rejects.toEqual(error);
    });

    it('should handle duplicate schedule errors', async () => {
      const error = {
        response: {
          status: 409,
          data: { message: 'Monitoring schedule already exists' }
        }
      };
      mockApiClient.post.mockRejectedValue(error);

      await expect(monitoringService.createMonitoringSchedule(createData)).rejects.toEqual(error);
    });
  });

  describe('updateMonitoringSchedule', () => {
    const updateData: UpdateMonitoringScheduleRequest = {
      frequency: 'weekly',
      isActive: false,
      companyName: 'Updated Company'
    };

    it('should update a monitoring schedule successfully', async () => {
      const updatedSchedule = { ...mockMonitoringSchedule, ...updateData };
      mockApiClient.put.mockResolvedValue({ data: updatedSchedule });

      const result = await monitoringService.updateMonitoringSchedule('507f1f77bcf86cd799439011', updateData);

      expect(mockApiClient.put).toHaveBeenCalledWith('/monitoring/507f1f77bcf86cd799439011', updateData);
      expect(result).toEqual(updatedSchedule);
    });

    it('should handle schedule not found', async () => {
      const error = { response: { status: 404, data: { message: 'Schedule not found' } } };
      mockApiClient.put.mockRejectedValue(error);

      await expect(monitoringService.updateMonitoringSchedule('nonexistent', updateData)).rejects.toEqual(error);
    });
  });

  describe('deleteMonitoringSchedule', () => {
    it('should delete a monitoring schedule successfully', async () => {
      const response = { message: 'Schedule deleted successfully' };
      mockApiClient.delete.mockResolvedValue({ data: response });

      const result = await monitoringService.deleteMonitoringSchedule('507f1f77bcf86cd799439011');

      expect(mockApiClient.delete).toHaveBeenCalledWith('/monitoring/507f1f77bcf86cd799439011');
      expect(result).toEqual(response);
    });

    it('should handle schedule not found', async () => {
      const error = { response: { status: 404, data: { message: 'Schedule not found' } } };
      mockApiClient.delete.mockRejectedValue(error);

      await expect(monitoringService.deleteMonitoringSchedule('nonexistent')).rejects.toEqual(error);
    });
  });

  describe('triggerMonitoring', () => {
    it('should trigger monitoring execution successfully', async () => {
      const response = { message: 'Monitoring triggered successfully' };
      mockApiClient.post.mockResolvedValue({ data: response });

      const result = await monitoringService.triggerMonitoring('507f1f77bcf86cd799439011');

      expect(mockApiClient.post).toHaveBeenCalledWith('/monitoring/507f1f77bcf86cd799439011/trigger');
      expect(result).toEqual(response);
    });

    it('should handle inactive schedule error', async () => {
      const error = {
        response: {
          status: 400,
          data: { message: 'Monitoring schedule is not active' }
        }
      };
      mockApiClient.post.mockRejectedValue(error);

      await expect(monitoringService.triggerMonitoring('507f1f77bcf86cd799439011')).rejects.toEqual(error);
    });
  });

  describe('getMonitoringStatistics', () => {
    const mockStatistics: MonitoringStatistics = {
      tenantStats: [
        {
          tenantId: '507f1f77bcf86cd799439012',
          tenantName: 'Test Tenant',
          totalSchedules: 5,
          activeSchedules: 3,
          inactiveSchedules: 2,
          lastExecutionCounts: {
            success: 10,
            error: 2,
            pending: 1
          }
        }
      ],
      globalStats: {
        totalSchedules: 5,
        activeSchedules: 3,
        totalExecutions: 13,
        successfulExecutions: 10,
        failedExecutions: 2
      }
    };

    it('should fetch monitoring statistics successfully', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockStatistics });

      const result = await monitoringService.getMonitoringStatistics();

      expect(mockApiClient.get).toHaveBeenCalledWith('/monitoring/statistics');
      expect(result).toEqual(mockStatistics);
    });

    it('should handle unauthorized access', async () => {
      const error = { response: { status: 403, data: { message: 'Forbidden' } } };
      mockApiClient.get.mockRejectedValue(error);

      await expect(monitoringService.getMonitoringStatistics()).rejects.toEqual(error);
    });
  });

  describe('getRiskChangeNotifications', () => {
    const mockNotificationsResponse = {
      notifications: [mockRiskChangeNotification],
      total: 1,
      pages: 1,
      currentPage: 1
    };

    it('should fetch risk change notifications successfully', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockNotificationsResponse });

      const result = await monitoringService.getRiskChangeNotifications(1, 10);

      expect(mockApiClient.get).toHaveBeenCalledWith('/monitoring/risk-changes?page=1&limit=10');
      expect(result).toEqual(mockNotificationsResponse);
    });

    it('should use default pagination parameters', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockNotificationsResponse });

      await monitoringService.getRiskChangeNotifications();

      expect(mockApiClient.get).toHaveBeenCalledWith('/monitoring/risk-changes?page=1&limit=10');
    });
  });

  describe('markRiskChangeNotificationAsRead', () => {
    it('should mark notification as read successfully', async () => {
      const response = { message: 'Notification marked as read' };
      mockApiClient.patch.mockResolvedValue({ data: response });

      const result = await monitoringService.markRiskChangeNotificationAsRead('507f1f77bcf86cd799439013');

      expect(mockApiClient.patch).toHaveBeenCalledWith('/monitoring/risk-changes/507f1f77bcf86cd799439013/read');
      expect(result).toEqual(response);
    });
  });

  describe('getMonitoringHistory', () => {
    const mockHistoryResponse = {
      executions: [
        {
          _id: '507f1f77bcf86cd799439014',
          scheduleId: '507f1f77bcf86cd799439011',
          executedAt: '2024-01-15T10:00:00Z',
          status: 'success' as const,
          riskAssessment: { level: 'medium', score: 5 },
          previousRisk: { level: 'low', score: 2 }
        }
      ],
      total: 1,
      pages: 1,
      currentPage: 1
    };

    it('should fetch monitoring history successfully', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockHistoryResponse });

      const result = await monitoringService.getMonitoringHistory('507f1f77bcf86cd799439011', 1, 10);

      expect(mockApiClient.get).toHaveBeenCalledWith('/monitoring/507f1f77bcf86cd799439011/history?page=1&limit=10');
      expect(result).toEqual(mockHistoryResponse);
    });
  });

  describe('setupMonitoring', () => {
    it('should setup monitoring with legacy function', async () => {
      const response = { message: 'Monitoring setup successfully' };
      mockApiClient.post.mockResolvedValue({ data: response });

      const result = await monitoringService.setupMonitoring({
        rut: '12345678-9',
        frequency: 'daily'
      });

      expect(mockApiClient.post).toHaveBeenCalledWith('/monitoring', {
        rut: '12345678-9',
        frequency: 'daily'
      });
      expect(result).toEqual(response);
    });
  });

  describe('pauseMonitoringSchedule', () => {
    it('should pause a monitoring schedule', async () => {
      const pausedSchedule = { ...mockMonitoringSchedule, isActive: false };
      mockApiClient.put.mockResolvedValue({ data: pausedSchedule });

      const result = await monitoringService.pauseMonitoringSchedule('507f1f77bcf86cd799439011');

      expect(mockApiClient.put).toHaveBeenCalledWith('/monitoring/507f1f77bcf86cd799439011', {
        isActive: false
      });
      expect(result).toEqual(pausedSchedule);
    });
  });

  describe('resumeMonitoringSchedule', () => {
    it('should resume a monitoring schedule', async () => {
      const resumedSchedule = { ...mockMonitoringSchedule, isActive: true };
      mockApiClient.put.mockResolvedValue({ data: resumedSchedule });

      const result = await monitoringService.resumeMonitoringSchedule('507f1f77bcf86cd799439011');

      expect(mockApiClient.put).toHaveBeenCalledWith('/monitoring/507f1f77bcf86cd799439011', {
        isActive: true
      });
      expect(result).toEqual(resumedSchedule);
    });
  });

  describe('getMonitoringScheduleByRut', () => {
    it('should fetch monitoring schedule by RUT', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockMonitoringSchedule });

      const result = await monitoringService.getMonitoringScheduleByRut('12345678-9');

      expect(mockApiClient.get).toHaveBeenCalledWith('/monitoring/rut/12345678-9');
      expect(result).toEqual(mockMonitoringSchedule);
    });

    it('should return null when schedule not found', async () => {
      const error = { response: { status: 404 } };
      mockApiClient.get.mockRejectedValue(error);

      const result = await monitoringService.getMonitoringScheduleByRut('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw error for other API errors', async () => {
      const error = { response: { status: 500 } };
      mockApiClient.get.mockRejectedValue(error);

      await expect(monitoringService.getMonitoringScheduleByRut('12345678-9')).rejects.toEqual(error);
    });
  });

  describe('bulkCreateMonitoringSchedules', () => {
    const bulkData = [
      { rut: '12345678-9', frequency: 'daily' as const },
      { rut: '98765432-1', frequency: 'weekly' as const }
    ];

    it('should create multiple monitoring schedules', async () => {
      const response = {
        created: [mockMonitoringSchedule],
        errors: [{ rut: '98765432-1', error: 'Invalid RUT' }]
      };
      mockApiClient.post.mockResolvedValue({ data: response });

      const result = await monitoringService.bulkCreateMonitoringSchedules(bulkData);

      expect(mockApiClient.post).toHaveBeenCalledWith('/monitoring/bulk', { schedules: bulkData });
      expect(result).toEqual(response);
    });
  });

  describe('exportMonitoringSchedules', () => {
    it('should export monitoring schedules as CSV', async () => {
      const mockBlob = new Blob(['csv,data'], { type: 'text/csv' });
      mockApiClient.get.mockResolvedValue({ data: mockBlob });

      const result = await monitoringService.exportMonitoringSchedules();

      expect(mockApiClient.get).toHaveBeenCalledWith('/monitoring/export', {
        responseType: 'blob'
      });
      expect(result).toEqual(mockBlob);
    });
  });

  describe('Error handling', () => {
    it('should handle network errors', async () => {
      const networkError = new Error('Network Error');
      mockApiClient.get.mockRejectedValue(networkError);

      await expect(monitoringService.getMonitoringSchedules()).rejects.toThrow('Network Error');
    });

    it('should handle server errors', async () => {
      const serverError = {
        response: {
          status: 500,
          data: { message: 'Internal Server Error' }
        }
      };
      mockApiClient.get.mockRejectedValue(serverError);

      await expect(monitoringService.getMonitoringSchedules()).rejects.toEqual(serverError);
    });

    it('should handle timeout errors', async () => {
      const timeoutError = {
        code: 'ECONNABORTED',
        message: 'timeout of 5000ms exceeded'
      };
      mockApiClient.get.mockRejectedValue(timeoutError);

      await expect(monitoringService.getMonitoringSchedules()).rejects.toEqual(timeoutError);
    });
  });
});