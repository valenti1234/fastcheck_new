import { Router } from 'express';
import { AIController } from '../controllers/ai.controller';
import { authenticate } from '../middleware/auth.middleware';
import { tenantFilter } from '../middleware/tenant.middleware';
import { requirePermission, Permission } from '../middleware/permissions.middleware';

const router = Router();

/**
 * @swagger
 * /api/ai/analyze:
 *   post:
 *     summary: Analyze data using AI
 *     description: Perform AI analysis on provided data
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               data:
 *                 type: object
 *                 description: Data to be analyzed
 *               analysisType:
 *                 type: string
 *                 description: Type of analysis to perform
 *                 enum: [socios, general, risk]
 *                 default: general
 *               rut:
 *                 type: string
 *                 description: RUT associated with the analysis
 *     responses:
 *       200:
 *         description: AI analysis completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 analysis:
 *                   type: string
 *                   description: AI-generated analysis
 *                 analysisType:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Bad request - Invalid data provided
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/analyze', authenticate, tenantFilter, requirePermission(Permission.RUT_READ), AIController.analyzeData);

export default router;