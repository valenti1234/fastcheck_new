import { Response } from 'express';
import { NotificationService } from '../services/notificationService';
import { MonitoringService } from '../services/monitoringService';
import { RiskChangeNotification } from '../models/RiskChangeNotification';
import { AuthenticatedRequest } from '../types/auth';

const notificationService = NotificationService.getInstance();
const monitoringService = MonitoringService.getInstance();

/**
 * Test SendGrid configuration by sending a test email
 */
export const testNotificationConfiguration = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address format'
      });
    }
    
    const success = await notificationService.testConfiguration(email);
    
    if (success) {
      res.json({
        success: true,
        message: `Test email sent successfully to ${email}`
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send test email. Please check SendGrid configuration.'
      });
    }
  } catch (error) {
    console.error('Error testing notification configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get pending notifications for the authenticated user's tenant
 */
export const getPendingNotifications = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = parseInt(req.query.skip as string) || 0;
    
    const notifications = await RiskChangeNotification.find({
      tenantId,
      notificationSent: false
    })
    .sort({ changeDetectedAt: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
    
    const total = await RiskChangeNotification.countDocuments({
      tenantId,
      notificationSent: false
    });
    
    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          total,
          limit,
          skip,
          hasMore: skip + limit < total
        }
      }
    });
  } catch (error) {
    console.error('Error fetching pending notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get notification history for the authenticated user's tenant
 */
export const getNotificationHistory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = parseInt(req.query.skip as string) || 0;
    const sent = req.query.sent !== undefined ? req.query.sent === 'true' : undefined;
    
    const filter: any = { tenantId };
    if (sent !== undefined) {
      filter.notificationSent = sent;
    }
    
    const notifications = await RiskChangeNotification.find(filter)
      .sort({ changeDetectedAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();
    
    const total = await RiskChangeNotification.countDocuments(filter);
    
    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          total,
          limit,
          skip,
          hasMore: skip + limit < total
        }
      }
    });
  } catch (error) {
    console.error('Error fetching notification history:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Process pending notifications for the authenticated user's tenant
 */
export const processPendingNotifications = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    
    // Process pending notifications for this tenant
    await monitoringService.processPendingNotifications(tenantId);
    
    res.json({
      success: true,
      message: 'Pending notifications processed successfully'
    });
  } catch (error) {
    console.error('Error processing pending notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get notification statistics for the authenticated user's tenant
 */
export const getNotificationStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    
    const [totalNotifications, sentNotifications, pendingNotifications, failedNotifications] = await Promise.all([
      RiskChangeNotification.countDocuments({ tenantId }),
      RiskChangeNotification.countDocuments({ tenantId, notificationSent: true }),
      RiskChangeNotification.countDocuments({ tenantId, notificationSent: false }),
      RiskChangeNotification.countDocuments({ tenantId, notificationSent: false, errorMessage: { $exists: true } })
    ]);
    
    // Get recent notifications (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentNotifications = await RiskChangeNotification.countDocuments({
      tenantId,
      changeDetectedAt: { $gte: sevenDaysAgo }
    });
    
    res.json({
      success: true,
      data: {
        total: totalNotifications,
        sent: sentNotifications,
        pending: pendingNotifications,
        failed: failedNotifications,
        recentCount: recentNotifications,
        successRate: totalNotifications > 0 ? ((sentNotifications / totalNotifications) * 100).toFixed(2) : '0'
      }
    });
  } catch (error) {
    console.error('Error fetching notification stats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};