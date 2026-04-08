import express from 'express';
import { MonitoringService } from '../services/monitoringService';
import { authenticate } from '../middleware/auth.middleware';
import { tenantFilter } from '../middleware/tenant.middleware';
import { requirePermission, Permission } from '../middleware/permissions.middleware';
import { AuthenticatedRequest } from '../types/auth';

const router = express.Router();
const monitoringService = MonitoringService.getInstance();

/**
 * @swagger
 * components:
 *   schemas:
 *     MonitoringSchedule:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         rut:
 *           type: string
 *         tenantId:
 *           type: string
 *         userId:
 *           type: string
 *         companyName:
 *           type: string
 *         frequency:
 *           type: string
 *           enum: [minute, daily, weekly, monthly]
 *         isActive:
 *           type: boolean
 *         lastExecuted:
 *           type: string
 *           format: date-time
 *         nextExecution:
 *           type: string
 *           format: date-time
 *         executionCount:
 *           type: number
 *         lastExecutionStatus:
 *           type: string
 *           enum: [success, error, pending]
 *         lastExecutionError:
 *           type: string
 *         lastLogId:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     CreateMonitoringSchedule:
 *       type: object
 *       required:
 *         - rut
 *         - frequency
 *       properties:
 *         rut:
 *           type: string
 *           description: Company RUT to monitor
 *         frequency:
 *           type: string
 *           enum: [minute, daily, weekly, monthly]
 *           description: Monitoring frequency
 *         companyName:
 *           type: string
 *           description: Optional company name
 *     UpdateMonitoringSchedule:
 *       type: object
 *       properties:
 *         frequency:
 *           type: string
 *           enum: [minute, daily, weekly, monthly]
 *         isActive:
 *           type: boolean
 *         companyName:
 *           type: string
 */

/**
 * @swagger
 * /api/monitoring/all:
 *   get:
 *     summary: Get all monitoring schedules across all tenants (superuser only)
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of all monitoring schedules
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 schedules:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MonitoringSchedule'
 *                 total:
 *                   type: number
 *                 pages:
 *                   type: number
 *                 currentPage:
 *                   type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Superuser access required
 *       500:
 *         description: Internal server error
 */
/**
 * @swagger
 * /api/monitoring/statistics:
 *   get:
 *     summary: Get monitoring statistics by tenant (superuser only)
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Monitoring statistics by tenant
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tenantStats:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       tenantId:
 *                         type: string
 *                       tenantName:
 *                         type: string
 *                       totalSchedules:
 *                         type: number
 *                       activeSchedules:
 *                         type: number
 *                       inactiveSchedules:
 *                         type: number
 *                       totalExecutions:
 *                         type: number
 *                       successfulExecutions:
 *                         type: number
 *                       failedExecutions:
 *                         type: number
 *                       lastExecution:
 *                         type: string
 *                         format: date-time
 *                       nextExecution:
 *                         type: string
 *                         format: date-time
 *                       averageExecutionsPerSchedule:
 *                         type: number
 *                       schedulesByFrequency:
 *                         type: object
 *                         properties:
 *                           minute:
 *                             type: number
 *                           daily:
 *                             type: number
 *                           weekly:
 *                             type: number
 *                           monthly:
 *                             type: number
 *                 globalStats:
 *                   type: object
 *                   properties:
 *                     totalTenants:
 *                       type: number
 *                     totalSchedules:
 *                       type: number
 *                     totalActiveSchedules:
 *                       type: number
 *                     totalExecutions:
 *                       type: number
 *                     averageSchedulesPerTenant:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Superuser access required
 *       500:
 *         description: Internal server error
 */
router.get('/statistics', authenticate, requirePermission(Permission.MONITORING_READ), async (req: AuthenticatedRequest, res) => {
  try {
    console.log('[MonitoringRoutes] GET /statistics - Request received:', {
      userId: req.user?.id,
      userRole: req.user?.role
    });
    
    // Only superusers can access this endpoint
    if (req.user!.role !== 'superuser') {
      console.log('[MonitoringRoutes] GET /statistics - Access denied:', {
        userId: req.user?.id,
        userRole: req.user?.role,
        reason: 'Not a superuser'
      });
      return res.status(403).json({ message: 'Forbidden - Superuser access required' });
    }

    console.log('[MonitoringRoutes] GET /statistics - Calling service');

    const result = await monitoringService.getMonitoringStatisticsByTenant();
    
    console.log('[MonitoringRoutes] GET /statistics - Service response:', {
      tenantsCount: result.tenantStats?.length || 0,
      globalStats: result.globalStats
    });
    
    res.json(result);
  } catch (error) {
    console.error('[MonitoringRoutes] GET /statistics - Error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId: req.user?.id
    });
    res.status(500).json({ 
      error: 'Failed to get monitoring statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.get('/all', authenticate, requirePermission(Permission.MONITORING_READ), async (req: AuthenticatedRequest, res) => {
  try {
    console.log('[MonitoringRoutes] GET /all - Request received:', {
      userId: req.user?.id,
      userRole: req.user?.role,
      tenant: req.user?.tenant,
      query: req.query,
      headers: {
        authorization: req.headers.authorization ? 'Bearer [REDACTED]' : 'None',
        'content-type': req.headers['content-type']
      }
    });
    
    // Only superusers can access this endpoint
    if (req.user!.role !== 'superuser') {
      console.log('[MonitoringRoutes] GET /all - Access denied:', {
        userId: req.user?.id,
        userRole: req.user?.role,
        reason: 'Not a superuser'
      });
      return res.status(403).json({ message: 'Forbidden - Superuser access required' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const activeOnly = req.query.activeOnly === 'true';
    console.log('[Monitoring Route] /all - activeOnly filter:', activeOnly);

    console.log('[MonitoringRoutes] GET /all - Calling service:', {
      page,
      limit,
      activeOnly,
      userId: req.user?.id
    });

    const result = await monitoringService.getAllMonitoringSchedules(page, limit, activeOnly);
    
    console.log('[MonitoringRoutes] GET /all - Service response:', {
      schedulesCount: result.schedules?.length || 0,
      total: result.total,
      pages: result.pages,
      currentPage: result.currentPage
    });
    
    res.json(result);
  } catch (error) {
    console.error('[MonitoringRoutes] GET /all - Error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId: req.user?.id,
      query: req.query
    });
    res.status(500).json({ 
      error: 'Failed to get all monitoring schedules',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /api/monitoring:
 *   get:
 *     summary: Get all monitoring schedules for the tenant
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of monitoring schedules
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 schedules:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MonitoringSchedule'
 *                 total:
 *                   type: number
 *                 pages:
 *                   type: number
 *                 currentPage:
 *                   type: number
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/', authenticate, tenantFilter, requirePermission(Permission.MONITORING_READ), async (req: AuthenticatedRequest, res) => {
  try {
    console.log('[MonitoringRoutes] GET / - Request received:', {
      userId: req.user?.id,
      userRole: req.user?.role,
      tenantId: req.tenantId,
      query: req.query,
      headers: {
        authorization: req.headers.authorization ? 'Bearer [REDACTED]' : 'None',
        'content-type': req.headers['content-type']
      }
    });
    
    const tenantId = req.tenantId;
    
    if (!tenantId) {
      console.log('[MonitoringRoutes] GET / - Missing tenant ID:', {
        userId: req.user?.id,
        userRole: req.user?.role
      });
      return res.status(400).json({ error: 'Tenant ID is required' });
    }
    
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const activeOnly = req.query.activeOnly === 'true';

    console.log('[MonitoringRoutes] GET / - Calling service:', {
      tenantId,
      page,
      limit,
      activeOnly,
      userId: req.user?.id
    });

    const result = await monitoringService.getMonitoringSchedules(tenantId, page, limit, activeOnly);
    
    console.log('[MonitoringRoutes] GET / - Service response:', {
      schedulesCount: result.schedules?.length || 0,
      total: result.total,
      pages: result.pages,
      currentPage: result.currentPage,
      tenantId
    });
    
    res.json(result);
  } catch (error) {
    console.error('[MonitoringRoutes] GET / - Error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId: req.user?.id,
      tenantId: req.tenantId,
      query: req.query
    });
    res.status(500).json({ 
      error: 'Failed to get monitoring schedules',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /api/monitoring/rut/{rut}:
 *   get:
 *     summary: Get monitoring schedule by RUT
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: rut
 *         required: true
 *         schema:
 *           type: string
 *         description: Company RUT
 *     responses:
 *       200:
 *         description: Monitoring schedule details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MonitoringSchedule'
 *       404:
 *         description: Monitoring schedule not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/rut/:rut', authenticate, tenantFilter, requirePermission(Permission.MONITORING_READ), async (req: AuthenticatedRequest, res) => {
  try {
    const { rut } = req.params;
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    if (!rut || rut.trim() === '') {
      return res.status(400).json({ error: 'RUT is required' });
    }

    const schedule = await monitoringService.getMonitoringScheduleByRut(rut, tenantId);
    
    if (!schedule) {
      return res.status(404).json({ error: 'Monitoring schedule not found for this RUT' });
    }
    
    res.json(schedule);
  } catch (error) {
    console.error('Error getting monitoring schedule by RUT:', error);
    res.status(500).json({ 
      error: 'Failed to get monitoring schedule',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /api/monitoring/{id}:
 *   get:
 *     summary: Get a specific monitoring schedule
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Monitoring schedule ID
 *     responses:
 *       200:
 *         description: Monitoring schedule details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MonitoringSchedule'
 *       404:
 *         description: Monitoring schedule not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/:id', authenticate, tenantFilter, requirePermission(Permission.MONITORING_READ), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const schedule = await monitoringService.getMonitoringSchedule(id, tenantId);
    
    if (!schedule) {
      return res.status(404).json({ error: 'Monitoring schedule not found' });
    }
    
    res.json(schedule);
  } catch (error) {
    console.error('Error getting monitoring schedule:', error);
    res.status(500).json({ 
      error: 'Failed to get monitoring schedule',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /api/monitoring:
 *   post:
 *     summary: Create a new monitoring schedule
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateMonitoringSchedule'
 *     responses:
 *       201:
 *         description: Monitoring schedule created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MonitoringSchedule'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Monitoring schedule already exists
 *       500:
 *         description: Internal server error
 */
router.post('/', authenticate, tenantFilter, requirePermission(Permission.MONITORING_CREATE), async (req: AuthenticatedRequest, res) => {
  try {
    console.log('[MonitoringRoutes] POST / - Request received:', {
      userId: req.user?.id,
      userRole: req.user?.role,
      tenantId: req.tenantId,
      body: req.body,
      headers: {
        authorization: req.headers.authorization ? 'Bearer [REDACTED]' : 'None',
        'content-type': req.headers['content-type']
      }
    });
    
    const { rut, frequency, companyName } = req.body;
    const tenantId = req.tenantId;
    const userId = req.user!.id;

    if (!tenantId) {
      console.log('[MonitoringRoutes] POST / - Missing tenant ID:', {
        userId: req.user?.id,
        userRole: req.user?.role
      });
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    // Validate required fields
    if (!rut || !frequency) {
      console.log('[MonitoringRoutes] POST / - Missing required fields:', {
        rut: !!rut,
        frequency: !!frequency,
        userId,
        tenantId
      });
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'RUT and frequency are required'
      });
    }

    // Validate frequency
    if (!['minute','daily', 'weekly', 'monthly'].includes(frequency)) {
      console.log('[MonitoringRoutes] POST / - Invalid frequency:', {
        frequency,
        validFrequencies: ['minute','daily', 'weekly', 'monthly'],
        userId,
        tenantId
      });
      return res.status(400).json({ 
        error: 'Invalid frequency',
        message: 'Frequency must be minute, daily, weekly, or monthly'
      });
    }

    console.log('[MonitoringRoutes] POST / - Calling service:', {
      rut,
      tenantId,
      userId,
      companyName,
      frequency
    });

    const schedule = await monitoringService.createMonitoringSchedule({
      rut,
      tenantId,
      userId,
      companyName,
      frequency
    });
    
    console.log('[MonitoringRoutes] POST / - Schedule created:', {
      scheduleId: schedule._id,
      rut: schedule.rut,
      companyName: schedule.companyName,
      frequency: schedule.frequency,
      tenantId: schedule.tenantId,
      userId: schedule.userId
    });
    
    res.status(201).json(schedule);
  } catch (error) {
    console.error('[MonitoringRoutes] POST / - Error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId: req.user?.id,
      tenantId: req.tenantId,
      body: req.body
    });
    
    if (error instanceof Error && error.message.includes('already exists')) {
      return res.status(409).json({ 
        error: 'Monitoring schedule already exists',
        message: error.message
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create monitoring schedule',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /api/monitoring/{id}:
 *   put:
 *     summary: Update a monitoring schedule
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Monitoring schedule ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateMonitoringSchedule'
 *     responses:
 *       200:
 *         description: Monitoring schedule updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MonitoringSchedule'
 *       400:
 *         description: Bad request
 *       404:
 *         description: Monitoring schedule not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put('/:id', authenticate, tenantFilter, requirePermission(Permission.MONITORING_UPDATE), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { frequency, isActive, companyName } = req.body;
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    // Validate schedule ID
    if (!id || id === 'undefined' || id.trim() === '') {
      return res.status(400).json({ 
        error: 'Invalid schedule ID',
        message: 'Schedule ID is required and must be a valid ObjectId'
      });
    }

    // Validate ObjectId format (24 hex characters)
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({ 
        error: 'Invalid schedule ID format',
        message: 'Schedule ID must be a valid 24-character hex string'
      });
    }

    // Validate frequency if provided
    if (frequency && !['minute','daily', 'weekly', 'monthly'].includes(frequency)) {
      return res.status(400).json({ 
        error: 'Invalid frequency',
        message: 'Frequency must be daily, weekly, or monthly'
      });
    }

    const updates: any = {};
    if (frequency !== undefined) updates.frequency = frequency;
    if (isActive !== undefined) updates.isActive = isActive;
    if (companyName !== undefined) updates.companyName = companyName;

    const schedule = await monitoringService.updateMonitoringSchedule(id, tenantId, updates);
    
    if (!schedule) {
      return res.status(404).json({ error: 'Monitoring schedule not found' });
    }
    
    res.json(schedule);
  } catch (error) {
    console.error('Error updating monitoring schedule:', error);
    res.status(500).json({ 
      error: 'Failed to update monitoring schedule',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /api/monitoring/{id}:
 *   delete:
 *     summary: Delete a monitoring schedule
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Monitoring schedule ID
 *     responses:
 *       200:
 *         description: Monitoring schedule deleted successfully
 *       404:
 *         description: Monitoring schedule not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', authenticate, tenantFilter, requirePermission(Permission.MONITORING_DELETE), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const deleted = await monitoringService.deleteMonitoringSchedule(id, tenantId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Monitoring schedule not found' });
    }
    
    res.json({ message: 'Monitoring schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting monitoring schedule:', error);
    res.status(500).json({ 
      error: 'Failed to delete monitoring schedule',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /api/monitoring/{id}/trigger:
 *   post:
 *     summary: Manually trigger a monitoring execution
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Monitoring schedule ID
 *     responses:
 *       200:
 *         description: Monitoring execution triggered successfully
 *       404:
 *         description: Monitoring schedule not found
 *       400:
 *         description: Monitoring schedule is not active
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/:id/execute', authenticate, tenantFilter, requirePermission(Permission.MONITORING_EXECUTE), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    await monitoringService.triggerMonitoring(id, tenantId);
    
    res.json({ message: 'Monitoring execution triggered successfully' });
  } catch (error) {
    console.error('Error triggering monitoring:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('not active')) {
        return res.status(400).json({ error: error.message });
      }
    }
    
    res.status(500).json({ 
      error: 'Failed to trigger monitoring',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /api/monitoring/{id}/executions:
 *   get:
 *     summary: Get execution history for a monitoring schedule
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Monitoring schedule ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [success, error, pending, running]
 *         description: Filter by execution status
 *     responses:
 *       200:
 *         description: Execution history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 executions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       scheduleId:
 *                         type: string
 *                       rut:
 *                         type: string
 *                       executedAt:
 *                         type: string
 *                         format: date-time
 *                       status:
 *                         type: string
 *                         enum: [success, error, pending, running]
 *                       duration:
 *                         type: number
 *                       error:
 *                         type: string
 *                       riskChanged:
 *                         type: boolean
 *                       metadata:
 *                         type: object
 *                 total:
 *                   type: number
 *                 pages:
 *                   type: number
 *                 currentPage:
 *                   type: number
 *       404:
 *         description: Monitoring schedule not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/:id/executions', authenticate, tenantFilter, requirePermission(Permission.MONITORING_READ), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string; // Not used currently; service does not support status filter

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const result = await monitoringService.getMonitoringExecutions(id, tenantId, page, limit);
    
    res.json(result);
  } catch (error) {
    console.error('Error getting monitoring executions:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ 
      error: 'Failed to get monitoring executions',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /api/monitoring/executions/{executionId}:
 *   get:
 *     summary: Get detailed information about a specific execution
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: executionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Monitoring execution ID
 *     responses:
 *       200:
 *         description: Execution details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 scheduleId:
 *                   type: string
 *                 rut:
 *                   type: string
 *                 executedAt:
 *                   type: string
 *                   format: date-time
 *                 status:
 *                   type: string
 *                   enum: [success, error, pending, running]
 *                 startedAt:
 *                   type: string
 *                   format: date-time
 *                 completedAt:
 *                   type: string
 *                   format: date-time
 *                 duration:
 *                   type: number
 *                 error:
 *                   type: string
 *                 errorDetails:
 *                   type: object
 *                 riskAssessment:
 *                   type: object
 *                 previousRisk:
 *                   type: object
 *                 riskChanged:
 *                   type: boolean
 *                 executionDetails:
 *                   type: object
 *                 metadata:
 *                   type: object
 *       404:
 *         description: Execution not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/executions/:executionId', authenticate, tenantFilter, requirePermission(Permission.MONITORING_READ), async (req: AuthenticatedRequest, res) => {
  try {
    const { executionId } = req.params;
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const execution = await monitoringService.getMonitoringExecution(executionId, tenantId);
    
    if (!execution) {
      return res.status(404).json({ error: 'Monitoring execution not found' });
    }
    
    res.json(execution);
  } catch (error) {
    console.error('Error getting monitoring execution details:', error);
    res.status(500).json({ 
      error: 'Failed to get monitoring execution details',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;