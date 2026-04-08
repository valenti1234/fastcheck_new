import express from 'express';
import { TenantUsageService } from '../services/tenantUsageService';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission, Permission } from '../middleware/permissions.middleware';
import ELKService from '../services/elkService';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: TenantUsage
 *   description: Tenant usage statistics management
 */

/**
 * @swagger
 * /tenant-usage/status:
 *   get:
 *     summary: Get tenant usage service status
 *     tags: [TenantUsage]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Service status information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     isInitialized:
 *                       type: boolean
 *                     isRunning:
 *                       type: boolean
 *                     nextRun:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/status', 
  authenticate, 
  requirePermission(Permission.ADMIN_DASHBOARD),
  async (req, res) => {
    try {
      const tenantUsageService = TenantUsageService.getInstance();
      const status = tenantUsageService.getStatus();
      
      ELKService.info('[TenantUsageAPI] Status requested', {
        userId: req.user?.id,
        status
      });
      
      res.json({
        status: 'success',
        data: status
      });
    } catch (error) {
      ELKService.error('[TenantUsageAPI] Error getting status', error as Error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get service status'
      });
    }
  }
);

/**
 * @swagger
 * /tenant-usage/manual-update:
 *   post:
 *     summary: Manually trigger tenant usage stats update
 *     tags: [TenantUsage]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Update completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Tenant usage stats updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */
router.post('/manual-update', 
  authenticate, 
  requirePermission(Permission.ADMIN_SETTINGS),
  async (req, res) => {
    try {
      const tenantUsageService = TenantUsageService.getInstance();
      const result = await tenantUsageService.manualUpdate();
      
      ELKService.info('[TenantUsageAPI] Manual update triggered', {
        userId: req.user?.id,
        result
      });
      
      ELKService.logBusinessEvent('tenant_usage_manual_update', {
        userId: req.user?.id,
        success: result.success,
        timestamp: new Date().toISOString()
      });
      
      if (result.success) {
        res.json({
          status: 'success',
          message: result.message
        });
      } else {
        res.status(500).json({
          status: 'error',
          message: result.message
        });
      }
    } catch (error) {
      ELKService.error('[TenantUsageAPI] Error in manual update', error as Error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to trigger manual update'
      });
    }
  }
);

/**
 * @swagger
 * /tenant-usage/restart:
 *   post:
 *     summary: Restart the tenant usage service
 *     tags: [TenantUsage]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Service restarted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Tenant usage service restarted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */
router.post('/restart', 
  authenticate, 
  requirePermission(Permission.ADMIN_SETTINGS),
  async (req, res) => {
    try {
      const tenantUsageService = TenantUsageService.getInstance();
      await tenantUsageService.restart();
      
      ELKService.info('[TenantUsageAPI] Service restarted', {
        userId: req.user?.id
      });
      
      ELKService.logBusinessEvent('tenant_usage_service_restarted', {
        userId: req.user?.id,
        timestamp: new Date().toISOString()
      });
      
      res.json({
        status: 'success',
        message: 'Tenant usage service restarted successfully'
      });
    } catch (error) {
      ELKService.error('[TenantUsageAPI] Error restarting service', error as Error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to restart service'
      });
    }
  }
);

export default router;