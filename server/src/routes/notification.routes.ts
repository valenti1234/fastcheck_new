import express from 'express';
import { NotificationService } from '../services/notificationService';
import { MonitoringService } from '../services/monitoringService';
import { RiskChangeNotification } from '../models/RiskChangeNotification';
import { authenticate } from '../middleware/auth.middleware';
import { tenantFilter } from '../middleware/tenant.middleware';
import { requirePermission, Permission } from '../middleware/permissions.middleware';
import { AuthenticatedRequest } from '../types/auth';

const router = express.Router();
const notificationService = NotificationService.getInstance();
const monitoringService = MonitoringService.getInstance();

/**
 * @swagger
 * /api/notifications/test:
 *   post:
 *     summary: Test SendGrid configuration
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address to send test notification
 *             required:
 *               - email
 *     responses:
 *       200:
 *         description: Test email sent successfully
 *       400:
 *         description: Invalid email address
 *       500:
 *         description: Failed to send test email
 */
router.post('/test', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), async (req: AuthenticatedRequest, res) => {
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
});

/**
 * @swagger
 * /api/notifications/pending:
 *   get:
 *     summary: Get pending notifications for tenant
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of notifications to return
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of notifications to skip
 *     responses:
 *       200:
 *         description: List of pending notifications
 *       500:
 *         description: Internal server error
 */
router.get('/pending', authenticate, tenantFilter, requirePermission(Permission.NOTIFICATION_READ), async (req: AuthenticatedRequest, res) => {
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
});

/**
 * @swagger
 * /api/notifications/history:
 *   get:
 *     summary: Get notification history for tenant
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of notifications to return
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of notifications to skip
 *       - in: query
 *         name: sent
 *         schema:
 *           type: boolean
 *         description: Filter by notification sent status
 *     responses:
 *       200:
 *         description: List of notifications
 *       500:
 *         description: Internal server error
 */
router.get('/history', authenticate, tenantFilter, requirePermission(Permission.NOTIFICATION_READ), async (req: AuthenticatedRequest, res) => {
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
});

/**
 * @swagger
 * /api/notifications/process-pending:
 *   post:
 *     summary: Process pending notifications for tenant
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending notifications processed successfully
 *       500:
 *         description: Internal server error
 */
router.post('/process-pending', authenticate, tenantFilter, requirePermission(Permission.NOTIFICATION_CREATE), async (req: AuthenticatedRequest, res) => {
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
});

/**
 * @swagger
 * /api/notifications/stats:
 *   get:
 *     summary: Get notification statistics for tenant
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification statistics
 *       500:
 *         description: Internal server error
 */
router.get('/stats', authenticate, tenantFilter, requirePermission(Permission.NOTIFICATION_READ), async (req: AuthenticatedRequest, res) => {
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
});

export default router;