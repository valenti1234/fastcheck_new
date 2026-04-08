import express from 'express';
import {
  getCurrentTenant,
  updateTenant,
  getAllTenants,
  getTenantById,
  createTenant,
  updateTenantById,
  deleteTenant,
  getTenantUsers,
  getTenantStatistics,
  superAdminToggleTenantStatus
} from '../controllers/tenant.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission, Permission } from '../middleware/permissions.middleware';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Tenants
 *   description: Tenant management operations
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Tenant:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: "507f1f77bcf86cd799439011"
 *         name:
 *           type: string
 *           example: "My Organization"
 *         settings:
 *           type: object
 *           example: {}
 *         usageStats:
 *           type: object
 *           properties:
 *             evaluationsRemaining:
 *               type: number
 *               example: 100
 *             evaluationsUsed:
 *               type: number
 *               example: 50
 *             lastEvaluationDate:
 *               type: string
 *               format: date-time
 *               example: "2024-03-20T15:30:00Z"
 *     TenantUpdateRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           example: "Updated Organization Name"
 *         settings:
 *           type: object
 *           example: { "theme": "dark" }
 */

/**
 * @swagger
 * /tenant:
 *   get:
 *     summary: Get current tenant information
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current tenant information
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Tenant'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Tenant not found
 */
router.get('/', authenticate, requirePermission(Permission.TENANT_READ), getCurrentTenant);

/**
 * @swagger
 * /tenant:
 *   patch:
 *     summary: Update tenant information
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TenantUpdateRequest'
 *     responses:
 *       200:
 *         description: Tenant updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Tenant'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - User not authorized to update tenant
 *       404:
 *         description: Tenant not found
 */
router.patch('/', authenticate, requirePermission(Permission.TENANT_UPDATE), updateTenant);

/**
 * @swagger
 * /tenant/all:
 *   get:
 *     summary: Get all tenants (superuser only)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all tenants
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Tenant'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Superuser access required
 */
router.get('/all', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), getAllTenants);

/**
 * @swagger
 * /tenant/statistics:
 *   get:
 *     summary: Get aggregate statistics for all tenants (superuser only)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Aggregate tenant statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 overview:
 *                   type: object
 *                   properties:
 *                     totalTenants:
 *                       type: number
 *                     activeTenants:
 *                       type: number
 *                     recentlyActiveTenants:
 *                       type: number
 *                     totalEvaluationsUsed:
 *                       type: number
 *                     totalEvaluationsRemaining:
 *                       type: number
 *                     totalEvaluationsAllocated:
 *                       type: number
 *                     averageUsagePerTenant:
 *                       type: number
 *                 usageDistribution:
 *                   type: object
 *                   properties:
 *                     heavy:
 *                       type: number
 *                     moderate:
 *                       type: number
 *                     light:
 *                       type: number
 *                     inactive:
 *                       type: number
 *                 topTenants:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       evaluationsUsed:
 *                         type: number
 *                       evaluationsRemaining:
 *                         type: number
 *                       lastEvaluationDate:
 *                         type: string
 *                         format: date-time
 *                 monthlyCreation:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       month:
 *                         type: string
 *                       count:
 *                         type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Superuser access required
 */
router.get('/statistics', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), getTenantStatistics);

/**
 * @swagger
 * /tenant/{id}:
 *   get:
 *     summary: Get tenant by ID (superuser only)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     responses:
 *       200:
 *         description: Tenant information
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Tenant'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Superuser access required
 *       404:
 *         description: Tenant not found
 */
router.get('/:id', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), getTenantById);

/**
 * @swagger
 * /tenant:
 *   post:
 *     summary: Create a new tenant (superuser only)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "New Organization"
 *               settings:
 *                 type: object
 *                 example: {}
 *               usageStats:
 *                 type: object
 *                 properties:
 *                   evaluationsRemaining:
 *                     type: number
 *                     example: 100
 *     responses:
 *       201:
 *         description: Tenant created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Tenant'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Superuser access required
 */
router.post('/', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), createTenant);

/**
 * @swagger
 * /tenant/{id}:
 *   patch:
 *     summary: Update tenant by ID (superuser only)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TenantUpdateRequest'
 *     responses:
 *       200:
 *         description: Tenant updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Tenant'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Superuser access required
 *       404:
 *         description: Tenant not found
 */
router.patch('/:id', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), updateTenantById);

/**
 * @swagger
 * /tenant/{id}:
 *   delete:
 *     summary: Delete tenant by ID (superuser only)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     responses:
 *       200:
 *         description: Tenant deleted successfully
 *       400:
 *         description: Cannot delete tenant with associated users
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Superuser access required
 *       404:
 *         description: Tenant not found
 */
router.delete('/:id', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), deleteTenant);

/**
 * @swagger
 * /tenant/{id}/users:
 *   get:
 *     summary: Get all users for a tenant (superuser only)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     responses:
 *       200:
 *         description: List of users for the tenant
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 *                   role:
 *                     type: string
 *                   isActive:
 *                     type: boolean
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Superuser access required
 *       404:
 *         description: Tenant not found
 */
router.get('/:id/users', authenticate, requirePermission(Permission.TENANT_USERS_MANAGE), getTenantUsers);

/**
 * @swagger
 * /tenant/{id}/superadmin-toggle-status:
 *   patch:
 *     summary: Toggle tenant active status (superuser only)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the tenant to toggle status for.
 *     responses:
 *       200:
 *         description: Tenant status toggled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: "507f1f77bcf86cd799439011"
 *                 isActive:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Tenant activated successfully"
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (User does not have superuser role)
 *       404:
 *         description: Tenant not found
 */
router.patch('/:id/superadmin-toggle-status', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), superAdminToggleTenantStatus);

/**
 * @swagger
 * /tenant/statistics:
 *   get:
 *     summary: Get aggregate statistics for all tenants (superuser only)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Aggregate tenant statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 overview:
 *                   type: object
 *                   properties:
 *                     totalTenants:
 *                       type: number
 *                     activeTenants:
 *                       type: number
 *                     recentlyActiveTenants:
 *                       type: number
 *                     totalEvaluationsUsed:
 *                       type: number
 *                     totalEvaluationsRemaining:
 *                       type: number
 *                     totalEvaluationsAllocated:
 *                       type: number
 *                     averageUsagePerTenant:
 *                       type: number
 *                 usageDistribution:
 *                   type: object
 *                   properties:
 *                     heavy:
 *                       type: number
 *                     moderate:
 *                       type: number
 *                     light:
 *                       type: number
 *                     inactive:
 *                       type: number
 *                 topTenants:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       evaluationsUsed:
 *                         type: number
 *                       evaluationsRemaining:
 *                         type: number
 *                       lastEvaluationDate:
 *                         type: string
 *                 monthlyCreation:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       month:
 *                         type: string
 *                       count:
 *                         type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Superuser access required
 */
export default router;