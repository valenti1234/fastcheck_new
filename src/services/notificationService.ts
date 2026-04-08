import { apiClient } from './api';

export interface NotificationResponse {
  success: boolean;
  data?: any;
  message?: string;
}

export interface PendingNotificationsResponse {
  success: boolean;
  data: {
    notifications: RiskChangeNotification[];
    pagination: {
      total: number;
      limit: number;
      skip: number;
      hasMore: boolean;
    };
  };
}

export interface RiskChangeNotification {
  _id: string;
  tenantId: string;
  rut: string;
  companyName: string;
  previousRisk: {
    level: string;
    score: number;
  };
  newRisk: {
    level: string;
    score: number;
  };
  changeDetectedAt: string;
  notificationSent: boolean;
  notificationSentAt?: string;
  recipientEmail?: string;
  errorMessage?: string;
}

export interface NotificationStats {
  success: boolean;
  data: {
    total: number;
    pending: number;
    sent: number;
    failed: number;
    lastWeek: {
      total: number;
      sent: number;
      failed: number;
    };
    lastMonth: {
      total: number;
      sent: number;
      failed: number;
    };
  };
}

export class NotificationService {
  /**
   * Get pending notifications for the current tenant
   */
  static async getPendingNotifications(
    limit: number = 50,
    skip: number = 0
  ): Promise<PendingNotificationsResponse> {
    const response = await apiClient.get('/notifications/pending', {
      params: { limit, skip },
    });
    return response.data;
  }

  /**
   * Get notification history for the current tenant
   */
  static async getNotificationHistory(
    limit: number = 50,
    skip: number = 0
  ): Promise<PendingNotificationsResponse> {
    const response = await apiClient.get('/notifications/history', {
      params: { limit, skip },
    });
    return response.data;
  }

  /**
   * Get notification statistics for the current tenant
   */
  static async getNotificationStats(): Promise<NotificationStats> {
    const response = await apiClient.get('/notifications/stats');
    return response.data;
  }

  /**
   * Process pending notifications for the current tenant
   */
  static async processPendingNotifications(): Promise<NotificationResponse> {
    const response = await apiClient.post('/notifications/process');
    return response.data;
  }

  /**
   * Test notification configuration by sending a test email
   */
  static async testNotificationConfiguration(email: string): Promise<NotificationResponse> {
    const response = await apiClient.post('/notifications/test', {
      email,
    });
    return response.data;
  }

  /**
   * Mark a notification as read
   */
  static async markNotificationAsRead(notificationId: string): Promise<NotificationResponse> {
    const response = await apiClient.put(`/notifications/${notificationId}/read`);
    return response.data;
  }

  /**
   * Delete a notification
   */
  static async deleteNotification(notificationId: string): Promise<NotificationResponse> {
    const response = await apiClient.delete(`/notifications/${notificationId}`);
    return response.data;
  }

  /**
   * Retry a failed notification
   */
  static async retryFailedNotification(notificationId: string): Promise<NotificationResponse> {
    const response = await apiClient.post(`/notifications/${notificationId}/retry`);
    return response.data;
  }

  /**
   * Get notification by ID
   */
  static async getNotificationById(notificationId: string): Promise<{ success: boolean; data: RiskChangeNotification }> {
    const response = await apiClient.get(`/notifications/${notificationId}`);
    return response.data;
  }

  /**
   * Update notification settings for the current tenant
   */
  static async updateNotificationSettings(settings: {
    emailEnabled: boolean;
    riskLevelThreshold: string;
    frequency: string;
  }): Promise<NotificationResponse> {
    const response = await apiClient.put('/notifications/settings', settings);
    return response.data;
  }

  /**
   * Get notification settings for the current tenant
   */
  static async getNotificationSettings(): Promise<{
    success: boolean;
    data: {
      emailEnabled: boolean;
      riskLevelThreshold: string;
      frequency: string;
    };
  }> {
    const response = await apiClient.get('/notifications/settings');
    return response.data;
  }
}

export default NotificationService;