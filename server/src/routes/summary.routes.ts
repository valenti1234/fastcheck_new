import { Router } from 'express';
import {
  getSummaries,
  getSummaryById,
  getSummariesByRut,
  deleteSummary,
  getSummaryStats
} from '../controllers/summary.controller';
import { authenticate } from '../middleware/auth.middleware';
import { tenantFilter } from '../middleware/tenant.middleware';
import { requirePermission, Permission } from '../middleware/permissions.middleware';

const router = Router();

/**
 * @swagger
 * /summaries:
 *   get:
 *     summary: Get all summaries for the current tenant
 *     tags: [Summaries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of summaries per page
 *       - in: query
 *         name: summaryType
 *         schema:
 *           type: string
 *           enum: [fast-check, ai-analysis, evaluation-result, other]
 *         description: Filter by summary type
 *       - in: query
 *         name: rut
 *         schema:
 *           type: string
 *         description: Filter by RUT
 *     responses:
 *       200:
 *         description: List of summaries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     summaries:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Summary'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         current:
 *                           type: number
 *                         total:
 *                           type: number
 *                         limit:
 *                           type: number
 *                         totalItems:
 *                           type: number
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/', authenticate, tenantFilter, requirePermission(Permission.RUT_READ), getSummaries);

/**
 * @swagger
 * /summaries/stats:
 *   get:
 *     summary: Get summary statistics for the current tenant
 *     tags: [Summaries]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Summary statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalSummaries:
 *                       type: number
 *                       example: 150
 *                     summariesByType:
 *                       type: object
 *                       properties:
 *                         fast-check:
 *                           type: number
 *                         ai-analysis:
 *                           type: number
 *                         evaluation-result:
 *                           type: number
 *                         other:
 *                           type: number
 *                     recentSummaries:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           rut:
 *                             type: string
 *                           summaryType:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           metadata:
 *                             type: object
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/stats', authenticate, tenantFilter, requirePermission(Permission.RUT_READ), getSummaryStats);

/**
 * @swagger
 * /summaries/rut/{rut}:
 *   get:
 *     summary: Get summaries by RUT
 *     tags: [Summaries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: rut
 *         required: true
 *         schema:
 *           type: string
 *         description: The RUT to get summaries for
 *         example: "12345678-9"
 *       - in: query
 *         name: summaryType
 *         schema:
 *           type: string
 *           enum: [fast-check, ai-analysis, evaluation-result, other]
 *         description: Filter by summary type
 *     responses:
 *       200:
 *         description: Summaries for the specified RUT
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Summary'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/rut/:rut', authenticate, tenantFilter, requirePermission(Permission.RUT_READ), getSummariesByRut);

/**
 * @swagger
 * /summaries/{id}:
 *   get:
 *     summary: Get a specific summary by ID
 *     tags: [Summaries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The summary ID
 *     responses:
 *       200:
 *         description: Summary details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Summary'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Summary not found
 *       500:
 *         description: Internal server error
 *   delete:
 *     summary: Delete a summary by ID
 *     tags: [Summaries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The summary ID
 *     responses:
 *       200:
 *         description: Summary deleted successfully
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
 *                   example: "Summary deleted successfully"
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Summary not found
 *       500:
 *         description: Internal server error
 */
router.get('/:id', authenticate, tenantFilter, requirePermission(Permission.RUT_READ), getSummaryById);
router.delete('/:id', authenticate, tenantFilter, requirePermission(Permission.RUT_LOOKUP), deleteSummary);

export default router;