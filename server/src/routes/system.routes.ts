import { Router } from 'express';
import { getSystemStatus, getVmIp } from '../controllers/system.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission, Permission } from '../middleware/permissions.middleware';

const router = Router();

/**
 * @swagger
 * /system/status:
 *   get:
 *     summary: Get system status information
 *     tags: [System]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System status information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 server:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [online, offline, warning]
 *                     uptime:
 *                       type: string
 *                     version:
 *                       type: string
 *                     lastRestart:
 *                       type: string
 *                 database:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [connected, disconnected, slow]
 *                     responseTime:
 *                       type: number
 *                     connections:
 *                       type: number
 *                     size:
 *                       type: string
 *                 performance:
 *                   type: object
 *                   properties:
 *                     cpuUsage:
 *                       type: number
 *                     memoryUsage:
 *                       type: number
 *                     diskUsage:
 *                       type: number
 *                     activeRequests:
 *                       type: number
 *                     diskSpace:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: string
 *                         used:
 *                           type: string
 *                         free:
 *                           type: string
 *                         usagePercentage:
 *                           type: number
 *                 services:
 *                   type: object
 *                   properties:
 *                     sheriff:
 *                       type: string
 *                       enum: [active, inactive, error]
 *                     notifications:
 *                       type: string
 *                       enum: [active, inactive, error]
 *                     monitoring:
 *                       type: string
 *                       enum: [active, inactive, error]
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 */
router.get('/status', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), getSystemStatus);
router.get('/vm-ip', authenticate, getVmIp);

export default router;
