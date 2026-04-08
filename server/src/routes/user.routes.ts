import express, { RequestHandler } from 'express';
import { UserService } from '../services/user.service';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { requirePermission, Permission } from '../middleware/permissions.middleware';
import { getTenantUsers, addTenantUser, updateTenantUser, toggleUserStatus, superAdminToggleUserStatus, getAllUsers, resetUserPassword, updateUserBySuperAdmin } from '../controllers/user.controller';
import { AuthenticatedRequest } from '../types/auth';
import { User } from '../models/user.model';

const router = express.Router();

// Wrap middlewares and handlers to satisfy Express typings and avoid AuthenticatedRequest mismatches
const authenticateMw: RequestHandler = (req, res, next) => authenticate(req as any, res as any, next);
const requirePermissionMw = (perm: Permission): RequestHandler => (req, res, next) => requirePermission(perm)(req as any, res as any, next);
const authorizeMw = (roles: string[]): RequestHandler => (req, res, next) => authorize(roles)(req as any, res as any, next);
const wrap = (handler: (req: any, res: any) => any): RequestHandler => (req, res) => { void handler(req as any, res as any); };

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management operations
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: "507f1f77bcf86cd799439011"
 *         email:
 *           type: string
 *           format: email
 *           example: "user@example.com"
 *         firstName:
 *           type: string
 *           example: "John"
 *         lastName:
 *           type: string
 *           example: "Doe"
 *         role:
 *           type: string
 *           enum: [admin, user]
 *           example: "user"
 *         tenantId:
 *           type: string
 *           example: "507f1f77bcf86cd799439012"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2024-03-20T15:30:00Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: "2024-03-20T15:30:00Z"
 */

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users for a tenant
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 total:
 *                   type: number
 *                   example: 50
 *                 pages:
 *                   type: number
 *                   example: 5
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - User does not have admin role
 */
router.get('/', authenticateMw, requirePermissionMw(Permission.USER_READ), wrap(getTenantUsers));

/**
 * @swagger
 * /users/{userId}:
 *   get:
 *     summary: Get a specific user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - User does not have admin role
 *       404:
 *         description: User not found
 */
router.get('/:userId', authenticateMw, requirePermissionMw(Permission.USER_READ), async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const user = await UserService.getProfile(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create a new user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - firstName
 *               - lastName
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [superuser, tenant_admin, evaluator, read_only, write_only]
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - User does not have admin role
 */
router.post('/', authenticateMw, requirePermissionMw(Permission.USER_CREATE), wrap(addTenantUser));

/**
 * @swagger
 * /users/{userId}:
 *   patch:
 *     summary: Update a user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               role:
 *                 type: string
 *                 enum: [superuser, tenant_admin, evaluator, read_only, write_only]
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - User does not have admin role
 *       404:
 *         description: User not found
 */
router.put('/:id', authenticateMw, requirePermissionMw(Permission.USER_UPDATE), wrap(updateTenantUser));

/**
 * @swagger
 * /users/{userId}:
 *   delete:
 *     summary: Delete a user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: User deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - User does not have admin role
 *       404:
 *         description: User not found
 */
router.delete('/:userId', authenticateMw, requirePermissionMw(Permission.USER_DELETE), async (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const deletedBy = req.user.id;
     const tenantId = req.user.tenant;
     const result = await UserService.deleteUser(req.params.userId, deletedBy, tenantId);
    if (!result) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(204).end();
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// All routes require authentication
router.use(authenticateMw);

// All routes require tenant_admin or superuser role
router.use(authorizeMw(['tenant_admin', 'superuser']));

/**
 * @swagger
 * /users/profile:
 *   get:
 *     summary: Get current user's profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get('/profile', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized: User not found in request (profile)' });
    }
    const user = await UserService.getProfile(req.user._id);
    res.json(user);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * @swagger
 * /users/profile:
 *   patch:
 *     summary: Update current user's profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: "John"
 *               lastName:
 *                 type: string
 *                 example: "Doe"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john.doe@example.com"
 *             # Add other updatable fields as necessary
 *     responses:
 *       200:
 *         description: User profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 */
router.patch('/profile', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized: User not found in request (update profile)' });
    }
    const user = await UserService.updateProfile(req.user._id, req.body);
    res.json(user);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * @swagger
 * /users/change-password:
 *   post:
 *     summary: Change current user's password
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *                 example: "oldPassword123"
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 example: "newSecurePassword456"
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Password changed successfully"
 *       400:
 *         description: Invalid request data or current password incorrect
 *       401:
 *         description: Unauthorized
 */
router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized: User not found in request (change password)' });
    }
    const result = await UserService.changePassword(
      req.user._id,
      currentPassword,
      newPassword
    );
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * @swagger
 * /users/{id}/toggle-status:
 *   patch:
 *     summary: Toggle a user's active status (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user to toggle status for.
 *     responses:
 *       200:
 *         description: User status toggled successfully
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
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (User does not have admin role or trying to toggle own status if not allowed)
 *       404:
 *         description: User not found
 */
// Toggle user status
router.patch('/:id/toggle-status', authenticateMw, requirePermissionMw(Permission.USER_UPDATE), wrap(toggleUserStatus));

/**
 * @swagger
 * /users/{id}/superadmin-toggle-status:
 *   patch:
 *     summary: Toggle a user's active status across all tenants (superuser only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user to toggle status for.
 *     responses:
 *       200:
 *         description: User status toggled successfully
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
 *                   example: "User activated successfully"
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (User does not have superuser role)
 *       404:
 *         description: User not found
 */
// Superadmin toggle user status (no tenant restriction)
router.patch('/:id/superadmin-toggle-status', authenticateMw, requirePermissionMw(Permission.ADMIN_DASHBOARD), wrap(superAdminToggleUserStatus));

// Superadmin routes for user management
router.get('/superadmin/all', authenticateMw, requirePermissionMw(Permission.ADMIN_DASHBOARD), wrap(getAllUsers));
router.patch('/:id/superadmin-reset-password', authenticateMw, requirePermissionMw(Permission.ADMIN_DASHBOARD), wrap(resetUserPassword));
router.put('/:id/superadmin-update', authenticateMw, requirePermissionMw(Permission.ADMIN_DASHBOARD), wrap(updateUserBySuperAdmin));

export default router;