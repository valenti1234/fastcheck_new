import { Router, Response, RequestHandler } from 'express';
import { Request } from 'express-serve-static-core';
import { ScraperService } from '../services/scraperService';
import { authenticate } from '../middleware/auth.middleware';
import { LogService } from '../services/logService';
import { AuthenticatedRequest } from '../types/auth';
import { Query } from 'express-serve-static-core';
import { requirePermission, Permission } from '../middleware/permissions.middleware';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Scraper
 *   description: PDF scraping operations
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     DownloadLog:
 *       type: object
 *       properties:
 *         userId:
 *           type: string
 *           example: "507f1f77bcf86cd799439011"
 *         tenantId:
 *           type: string
 *           example: "507f1f77bcf86cd799439012"
 *         filename:
 *           type: string
 *           example: "I_Semestre_2024.pdf"
 *         downloadedAt:
 *           type: string
 *           format: date-time
 *           example: "2024-03-20T15:30:00Z"
 *         fileSize:
 *           type: number
 *           example: 1048576
 *         success:
 *           type: boolean
 *           example: true
 *         error:
 *           type: string
 *           example: "Failed to download file: Network error"
 */

/**
 * @swagger
 * /scraper/download-pdfs:
 *   post:
 *     summary: Download all PDFs from DT website
 *     tags: [Scraper]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: PDFs downloaded successfully
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
 *                   example: Successfully downloaded 38 PDFs
 *                 downloadedFiles:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["I_Semestre_2024.pdf", "II_Semestre_2023.pdf"]
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.use(authenticate);

// Start downloading PDFs
router.post('/download-pdfs', requirePermission(Permission.ADMIN_DASHBOARD), (async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    // TODO: Implement downloadAllPDFs method in ScraperService
    res.json({
      success: false,
      message: 'Download functionality not yet implemented'
    });
  } catch (error) {
    console.error('Error in download-pdfs route:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to download PDFs'
    });
  }
}) as RequestHandler);

/**
 * @swagger
 * /scraper/downloaded-files:
 *   get:
 *     summary: Get list of downloaded PDFs
 *     tags: [Scraper]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of downloaded files
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 files:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["I_Semestre_2024.pdf", "II_Semestre_2023.pdf"]
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
// Get list of downloaded PDFs
router.get('/downloaded-files', requirePermission(Permission.ADMIN_DASHBOARD), (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const files = await ScraperService.getDownloadedFiles();
    res.json({
      success: true,
      files
    });
  } catch (error) {
    console.error('Error in downloaded-files route:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get downloaded files'
    });
  }
}) as RequestHandler);

/**
 * @swagger
 * /scraper/download-logs:
 *   get:
 *     summary: Get download logs for a tenant
 *     tags: [Scraper]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: List of download logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DownloadLog'
 *                 total:
 *                   type: number
 *                   example: 50
 *                 pages:
 *                   type: number
 *                   example: 5
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
// Get download logs
router.get('/download-logs', requirePermission(Permission.ADMIN_DASHBOARD), (async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const logs = await LogService.getDownloadLogs(req.user.tenant, page, limit);
    res.json(logs);
  } catch (error) {
    console.error('Error in download-logs route:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get download logs'
    });
  }
}) as RequestHandler);

/**
 * @swagger
 * /scraper/analyze-pdfs:
 *   get:
 *     summary: Analyze all downloaded PDFs and extract their text content
 *     tags: [Scraper]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: PDFs analyzed successfully
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
 *                   example: Successfully analyzed 38 PDF files
 *                 analyzedFiles:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       filename:
 *                         type: string
 *                         example: I_Semestre_2024.pdf
 *                       isTextBased:
 *                         type: boolean
 *                         example: true
 *                       textContent:
 *                         type: string
 *                         example: Extracted text content from the PDF...
 *                       pageCount:
 *                         type: number
 *                         example: 10
 *                       metadata:
 *                         type: object
 *                         properties:
 *                           title:
 *                             type: string
 *                           author:
 *                             type: string
 *                           subject:
 *                             type: string
 *                           keywords:
 *                             type: string
 *                           creationDate:
 *                             type: string
 *                           modificationDate:
 *                             type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/analyze-pdfs', requirePermission(Permission.ADMIN_DASHBOARD), (async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const result = await ScraperService.analyzeAllPDFs();
    res.json(result);
  } catch (error) {
    console.error('Error in analyze-pdfs route:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to analyze PDFs'
    });
  }
}) as RequestHandler);

/**
 * @swagger
 * components:
 *   schemas:
 *     AntiUnionCase:
 *       type: object
 *       properties:
 *         rut:
 *           type: string
 *           example: "76.543.210-K"
 *         companyName:
 *           type: string
 *           example: "Empresa Ejemplo S.A."
 *         rit:
 *           type: string
 *           example: "T-123-2024"
 *         tribunal:
 *           type: string
 *           example: "1er JLT SANTIAGO"
 *         date:
 *           type: string
 *           example: "15-03-2024"
 *         description:
 *           type: string
 *           example: "NO OTORGAR TRABAJO CONVENIDO"
 *         complaintType:
 *           type: string
 *           enum: [PARTICULAR, DT, RESERVADA]
 *           example: "PARTICULAR"
 *         fineAmount:
 *           type: string
 *           example: "50 UTM"
 *         source_pdf:
 *           type: string
 *           example: "I_Semestre_2024.pdf"
 */

/**
 * @swagger
 * /scraper/dt-cases:
 *   get:
 *     summary: Get DT (Dirección del Trabajo) cases with pagination and filtering
 *     tags: [Scraper]
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
 *         description: Number of cases per page
 *       - in: query
 *         name: rut
 *         schema:
 *           type: string
 *         description: Filter by company RUT
 *       - in: query
 *         name: companyName
 *         schema:
 *           type: string
 *         description: Filter by company name
 *       - in: query
 *         name: rit
 *         schema:
 *           type: string
 *         description: Filter by RIT number
 *       - in: query
 *         name: tribunal
 *         schema:
 *           type: string
 *         description: Filter by tribunal
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *         description: Filter by date
 *       - in: query
 *         name: complaintType
 *         schema:
 *           type: string
 *           enum: [PARTICULAR, DT, RESERVADA]
 *         description: Filter by complaint type
 *       - in: query
 *         name: fineAmount
 *         schema:
 *           type: string
 *         description: Filter by fine amount
 *     responses:
 *       200:
 *         description: Successfully retrieved DT cases
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
 *                   example: "Successfully retrieved 10 cases"
 *                 cases:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AntiUnionCase'
 *                 total:
 *                   type: number
 *                   example: 100
 *                 page:
 *                   type: number
 *                   example: 1
 *                 limit:
 *                   type: number
 *                   example: 10
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       500:
 *         description: Internal server error
 */
router.get('/dt-cases', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), (async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    
    // Extract filter parameters from query
    const filters: any = {};
    const filterableFields = ['rut', 'companyName', 'rit', 'tribunal', 'date', 'complaintType', 'fineAmount'];
    
    filterableFields.forEach(field => {
      if (req.query[field]) {
        filters[field] = req.query[field] as string;
      }
    });

    const result = await ScraperService.getDTCases(page, limit, filters);
    res.json(result);
  } catch (error) {
    console.error('Error in /dt-cases endpoint:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}) as RequestHandler);

export default router;