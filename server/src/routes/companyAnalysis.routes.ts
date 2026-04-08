import { Router } from 'express';
import { CompanyAnalysisController } from '../controllers/companyAnalysisController';
import { authenticate } from '../middleware/auth.middleware';
import { tenantFilter } from '../middleware/tenant.middleware';
import { requirePermission, Permission } from '../middleware/permissions.middleware';

const router = Router();
const companyAnalysisController = new CompanyAnalysisController();

/**
 * @swagger
 * tags:
 *   name: Company Analysis
 *   description: Company societal analysis operations
 */

/**
 * @swagger
 * /api/company-analysis/rut/{rut}:
 *   get:
 *     summary: Get company analysis by RUT
 *     tags: [Company Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: rut
 *         required: true
 *         schema:
 *           type: string
 *         description: The company RUT
 *     responses:
 *       200:
 *         description: Company analysis data
 *       404:
 *         description: Analysis not found
 *       401:
 *         description: Unauthorized
 */
router.get('/rut/:rut', 
  authenticate, 
  tenantFilter, 
  requirePermission(Permission.COMPANY_READ), 
  companyAnalysisController.getAnalysisByRut
);

/**
 * @swagger
 * /api/company-analysis:
 *   get:
 *     summary: Get all company analyses for tenant
 *     tags: [Company Analysis]
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
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of company analyses
 *       401:
 *         description: Unauthorized
 */
router.get('/', 
  authenticate, 
  tenantFilter, 
  requirePermission(Permission.COMPANY_READ), 
  companyAnalysisController.getAllAnalyses
);

/**
 * @swagger
 * /api/company-analysis/trigger:
 *   post:
 *     summary: Manually trigger company analysis
 *     tags: [Company Analysis]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rut
 *               - sheriffLogId
 *             properties:
 *               rut:
 *                 type: string
 *                 description: Company RUT
 *               sheriffLogId:
 *                 type: string
 *                 description: Sheriff log ID
 *     responses:
 *       200:
 *         description: Analysis completed successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 */
router.post('/trigger', 
  authenticate, 
  tenantFilter, 
  requirePermission(Permission.EVALUATION_CREATE), 
  companyAnalysisController.triggerAnalysis
);

/**
 * @swagger
 * /api/company-analysis/{analysisId}/manual:
 *   put:
 *     summary: Update manual analysis
 *     tags: [Company Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: analysisId
 *         required: true
 *         schema:
 *           type: string
 *         description: Analysis ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - manualAnalysis
 *             properties:
 *               manualAnalysis:
 *                 type: object
 *                 description: Manual analysis data
 *     responses:
 *       200:
 *         description: Manual analysis updated successfully
 *       404:
 *         description: Analysis not found
 *       401:
 *         description: Unauthorized
 */
router.put('/:analysisId/manual', 
  authenticate, 
  tenantFilter, 
  requirePermission(Permission.EVALUATION_UPDATE), 
  companyAnalysisController.updateManualAnalysis
);

export default router;