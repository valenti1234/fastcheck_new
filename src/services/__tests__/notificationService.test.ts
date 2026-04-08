import { apiClient } from '../api';
import { NotificationService } from '../notificationService';

// Mock the API client
jest.mock('../api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('NotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPendingNotifications', () => {
    const mockNotifications = [
      {
        _id: '1',
        tenantId: 'tenant1',
        rut: '12345678-9',
        companyName: 'Test Company',
        previousRisk: { level: 'low', score: 2 },
        newRisk: { level: 'high', score: 8 },
        changeDetectedAt: '2024-01-15T10:00:00Z',
        notificationSent: false,
      },
      {
        _id: '2',
        tenantId: 'tenant1',
        rut: '87654321-0',
        companyName: 'Another Company',
        previousRisk: { level: 'medium', score: 5 },
        newRisk: { level: 'low', score: 3 },
        changeDetectedAt: '2024-01-14T15:30:00Z',
        notificationSent: false,
      },
    ];

    const mockResponse = {
      success: true,
      data: {
        notifications: mockNotifications,
        pagination: {
          total: 2,
          limit: 50,
          skip: 0,
          hasMore: false,
        },
      },
    };

    it('should fetch pending notifications successfully', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockResponse });

      const result = await NotificationService.getPendingNotifications();

      expect(mockApiClient.get).toHaveBeenCalledWith('/notifications/pending', {
        params: { limit: 50, skip: 0 },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should fetch pending notifications with custom pagination', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockResponse });

      await NotificationService.getPendingNotifications(10, 20);

      expect(mockApiClient.get).toHaveBeenCalledWith('/notifications/pending', {
        params: { limit: 10, skip: 20 },
      });
    });

    it('should handle API errors', async () => {
      const errorMessage = 'Failed to fetch notifications';
      mockApiClient.get.mockRejectedValue(new Error(errorMessage));

      await expect(NotificationService.getPendingNotifications()).rejects.toThrow(errorMessage);
    });

    it('should handle empty response', async () => {
      const emptyResponse = {
        success: true,
        data: {
          notifications: [],
          pagination: {
            total: 0,
            limit: 50,
            skip: 0,
            hasMore: false,
          },
        },
      };
      mockApiClient.get.mockResolvedValue({ data: emptyResponse });

      const result = await NotificationService.getPendingNotifications();

      expect(result).toEqual(emptyResponse);
    });
  });

  describe('getNotificationHistory', () => {
    const mockHistoryNotifications = [
      {
        _id: '3',
        tenantId: 'tenant1',
        rut: '11111111-1',
        companyName: 'Historical Company',
        previousRisk: { level: 'low', score: 2 },
        newRisk: { level: 'medium', score: 6 },
        changeDetectedAt: '2024-01-10T09:00:00Z',
        notificationSent: true,
        notificationSentAt: '2024-01-10T09:05:00Z',
        recipientEmail: 'user@example.com',
      },
    ];

    const mockHistoryResponse = {
      success: true,
      data: {
        notifications: mockHistoryNotifications,
        pagination: {
          total: 1,
          limit: 50,
          skip: 0,
          hasMore: false,
        },
      },
    };

    it('should fetch notification history successfully', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockHistoryResponse });

      const result = await NotificationService.getNotificationHistory();

      expect(mockApiClient.get).toHaveBeenCalledWith('/notifications/history', {
        params: { limit: 50, skip: 0 },
      });
      expect(result).toEqual(mockHistoryResponse);
    });

    it('should fetch notification history with custom pagination', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockHistoryResponse });

      await NotificationService.getNotificationHistory(25, 10);

      expect(mockApiClient.get).toHaveBeenCalledWith('/notifications/history', {
        params: { limit: 25, skip: 10 },
      });
    });
  });

  describe('getNotificationStats', () => {
    const mockStats = {
      success: true,
      data: {
        total: 15,
        pending: 3,
        sent: 12,
        failed: 0,
        lastWeek: {
          total: 5,
          sent: 5,
          failed: 0,
        },
        lastMonth: {
          total: 15,
          sent: 12,
          failed: 3,
        },
      },
    };

    it('should fetch notification statistics successfully', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockStats });

      const result = await NotificationService.getNotificationStats();

      expect(mockApiClient.get).toHaveBeenCalledWith('/notifications/stats');
      expect(result).toEqual(mockStats);
    });

    it('should handle API errors when fetching stats', async () => {
      const errorMessage = 'Failed to fetch notification stats';
      mockApiClient.get.mockRejectedValue(new Error(errorMessage));

      await expect(NotificationService.getNotificationStats()).rejects.toThrow(errorMessage);
    });
  });

  describe('processPendingNotifications', () => {
    const mockProcessResponse = {
      success: true,
      message: 'Pending notifications processed successfully',
    };

    it('should process pending notifications successfully', async () => {
      mockApiClient.post.mockResolvedValue({ data: mockProcessResponse });

      const result = await NotificationService.processPendingNotifications();

      expect(mockApiClient.post).toHaveBeenCalledWith('/notifications/process');
      expect(result).toEqual(mockProcessResponse);
    });

    it('should handle API errors when processing notifications', async () => {
      const errorMessage = 'Failed to process notifications';
      mockApiClient.post.mockRejectedValue(new Error(errorMessage));

      await expect(NotificationService.processPendingNotifications()).rejects.toThrow(errorMessage);
    });
  });

  describe('testNotificationConfiguration', () => {
    const mockTestResponse = {
      success: true,
      message: 'Test notification sent successfully',
    };

    it('should send test notification successfully', async () => {
      const testEmail = 'test@example.com';
      mockApiClient.post.mockResolvedValue({ data: mockTestResponse });

      const result = await NotificationService.testNotificationConfiguration(testEmail);

      expect(mockApiClient.post).toHaveBeenCalledWith('/notifications/test', {
        email: testEmail,
      });
      expect(result).toEqual(mockTestResponse);
    });

    it('should handle invalid email format', async () => {
      const invalidEmail = 'invalid-email';
      const errorResponse = {
        response: {
          status: 400,
          data: { message: 'Invalid email format' },
        },
      };
      mockApiClient.post.mockRejectedValue(errorResponse);

      await expect(NotificationService.testNotificationConfiguration(invalidEmail)).rejects.toEqual(errorResponse);
    });

    it('should handle API errors when testing configuration', async () => {
      const testEmail = 'test@example.com';
      const errorMessage = 'SendGrid configuration error';
      mockApiClient.post.mockRejectedValue(new Error(errorMessage));

      await expect(NotificationService.testNotificationConfiguration(testEmail)).rejects.toThrow(errorMessage);
    });
  });

  describe('markNotificationAsRead', () => {
    const mockMarkReadResponse = {
      success: true,
      message: 'Notification marked as read',
    };

    it('should mark notification as read successfully', async () => {
      const notificationId = 'notification123';
      mockApiClient.put.mockResolvedValue({ data: mockMarkReadResponse });

      const result = await NotificationService.markNotificationAsRead(notificationId);

      expect(mockApiClient.put).toHaveBeenCalledWith(`/notifications/${notificationId}/read`);
      expect(result).toEqual(mockMarkReadResponse);
    });

    it('should handle API errors when marking as read', async () => {
      const notificationId = 'notification123';
      const errorMessage = 'Notification not found';
      mockApiClient.put.mockRejectedValue(new Error(errorMessage));

      await expect(NotificationService.markNotificationAsRead(notificationId)).rejects.toThrow(errorMessage);
    });
  });

  describe('deleteNotification', () => {
    const mockDeleteResponse = {
      success: true,
      message: 'Notification deleted successfully',
    };

    it('should delete notification successfully', async () => {
      const notificationId = 'notification123';
      mockApiClient.delete.mockResolvedValue({ data: mockDeleteResponse });

      const result = await NotificationService.deleteNotification(notificationId);

      expect(mockApiClient.delete).toHaveBeenCalledWith(`/notifications/${notificationId}`);
      expect(result).toEqual(mockDeleteResponse);
    });

    it('should handle API errors when deleting notification', async () => {
      const notificationId = 'notification123';
      const errorMessage = 'Failed to delete notification';
      mockApiClient.delete.mockRejectedValue(new Error(errorMessage));

      await expect(NotificationService.deleteNotification(notificationId)).rejects.toThrow(errorMessage);
    });
  });

  describe('retryFailedNotification', () => {
    const mockRetryResponse = {
      success: true,
      message: 'Notification retry initiated',
    };

    it('should retry failed notification successfully', async () => {
      const notificationId = 'notification123';
      mockApiClient.post.mockResolvedValue({ data: mockRetryResponse });

      const result = await NotificationService.retryFailedNotification(notificationId);

      expect(mockApiClient.post).toHaveBeenCalledWith(`/notifications/${notificationId}/retry`);
      expect(result).toEqual(mockRetryResponse);
    });

    it('should handle API errors when retrying notification', async () => {
      const notificationId = 'notification123';
      const errorMessage = 'Cannot retry notification';
      mockApiClient.post.mockRejectedValue(new Error(errorMessage));

      await expect(NotificationService.retryFailedNotification(notificationId)).rejects.toThrow(errorMessage);
    });
  });

  describe('Error handling', () => {
    it('should handle network errors', async () => {
      const networkError = new Error('Network Error');
      networkError.name = 'NetworkError';
      mockApiClient.get.mockRejectedValue(networkError);

      await expect(NotificationService.getPendingNotifications()).rejects.toThrow('Network Error');
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      mockApiClient.get.mockRejectedValue(timeoutError);

      await expect(NotificationService.getNotificationStats()).rejects.toThrow('Request timeout');
    });

    it('should handle server errors', async () => {
      const serverError = {
        response: {
          status: 500,
          data: { message: 'Internal server error' },
        },
      };
      mockApiClient.post.mockRejectedValue(serverError);

      await expect(NotificationService.processPendingNotifications()).rejects.toEqual(serverError);
    });

    it('should handle unauthorized errors', async () => {
      const unauthorizedError = {
        response: {
          status: 401,
          data: { message: 'Unauthorized' },
        },
      };
      mockApiClient.get.mockRejectedValue(unauthorizedError);

      await expect(NotificationService.getPendingNotifications()).rejects.toEqual(unauthorizedError);
    });
  });
});