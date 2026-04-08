import { Router, RequestHandler } from 'express';
import { EquifaxController } from '../controllers/equifaxController';
import { authenticate } from '../middleware/auth.middleware';
import { tenantFilter } from '../middleware/tenant.middleware';
import { requirePermission, Permission } from '../middleware/permissions.middleware';

const router = Router();
const equifaxController = new EquifaxController();

// Ensure middleware and handlers conform to Express RequestHandler types
const authenticateMw: RequestHandler = (req, res, next) => authenticate(req as any, res as any, next);
const tenantFilterMw: RequestHandler = (req, res, next) => tenantFilter(req as any, res as any, next);
const requireCompanyReadMw: RequestHandler = (req, res, next) => requirePermission(Permission.COMPANY_READ)(req as any, res as any, next);
const queryRutHandler: RequestHandler = (req, res, next) => { void equifaxController.queryRut(req as any, res as any); };
const bulkQueryHandler: RequestHandler = (req, res, next) => { void equifaxController.bulkQueryRuts(req as any, res as any); };
const healthHandler: RequestHandler = (req, res, next) => { void equifaxController.getHealthStatus(req as any, res as any); };
const getResponsesByRutHandler: RequestHandler = (req, res, next) => { void equifaxController.getResponsesByRut(req as any, res as any); };
const getAllResponsesHandler: RequestHandler = (req, res, next) => { void equifaxController.getAllResponses(req as any, res as any); };

/**
 * @swagger
 * tags:
 *   name: Equifax
 *   description: Equifax data provider operations
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     EquifaxPersonalData:
 *       type: object
 *       properties:
 *         firstName:
 *           type: string
 *           example: "Juan"
 *         middleName:
 *           type: string
 *           example: "Carlos"
 *         lastName:
 *           type: string
 *           example: "Pérez"
 *         motherLastName:
 *           type: string
 *           example: "González"
 *         nationalId:
 *           type: string
 *           example: "12345678-9"
 *         chileanSerialNumber:
 *           type: string
 *           example: "123456789"
 *         requestType:
 *           type: string
 *           enum: [RUT, PASSPORT]
 *           example: "RUT"
 *     EquifaxProductData:
 *       type: object
 *       properties:
 *         billTo:
 *           type: string
 *           example: "BILL001"
 *         shipTo:
 *           type: string
 *           example: "SHIP001"
 *         productName:
 *           type: string
 *           example: "Credit Report"
 *         productOrch:
 *           type: string
 *           example: "ORCH001"
 *         configuration:
 *           type: string
 *           example: "Config"
 *         customer:
 *           type: string
 *           example: "CUSTOMER001"
 *         model:
 *           type: string
 *           example: "MODEL001"
 *     EquifaxResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           description: Equifax response data
 *         rut:
 *           type: string
 *           example: "12345678-9"
 *         responseTime:
 *           type: number
 *           example: 1500
 *         timestamp:
 *           type: string
 *           format: date-time
 *         source:
 *           type: string
 *           example: "equifax"
 */

/**
 * @swagger
 * /api/equifax/query/{rut}:
 *   post:
 *     summary: Query Equifax for company/person information by RUT
 *     tags: [Equifax]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: rut
 *         required: true
 *         schema:
 *           type: string
 *         description: The RUT to query
 *         example: "12345678-9"
 *     requestBody:
 *       description: Optional personal and product data for the query
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               personalData:
 *                 $ref: '#/components/schemas/EquifaxPersonalData'
 *               productData:
 *                 $ref: '#/components/schemas/EquifaxProductData'
 *     responses:
 *       200:
 *         description: Successful query
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EquifaxResponse'
 *       400:
 *         description: Bad request - RUT is required
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.post('/query/:rut', 
  authenticateMw, 
  tenantFilterMw, 
  requireCompanyReadMw, 
  queryRutHandler
);

/**
 * @swagger
 * /api/equifax/responses/{rut}:
 *   get:
 *     summary: List Equifax response logs by RUT for the current tenant
 *     tags: [Equifax]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: rut
 *         required: true
 *         schema:
 *           type: string
 *         description: The RUT to filter
 *         example: "12345678-9"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *         description: Max number of records to return
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter records created at or after this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter records created at or before this date
 *     responses:
 *       200:
 *         description: Logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 rut:
 *                   type: string
 *                 tenantId:
 *                   type: string
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Bad request - RUT is required
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */
router.get('/responses/:rut',
  authenticateMw,
  tenantFilterMw,
  requireCompanyReadMw,
  getResponsesByRutHandler
);

/**
 * @swagger
 * /api/equifax/responses:
 *   get:
 *     summary: List ALL Equifax response logs for the current tenant
 *     tags: [Equifax]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *         description: Max number of records to return
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter records created at or after this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter records created at or before this date
 *     responses:
 *       200:
 *         description: Logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 tenantId:
 *                   type: string
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */
router.get('/responses',
  authenticateMw,
  tenantFilterMw,
  requireCompanyReadMw,
  getAllResponsesHandler
);

/**
 * @swagger
 * /api/equifax/bulk-query:
 *   post:
 *     summary: Bulk query multiple RUTs from Equifax
 *     tags: [Equifax]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ruts
 *             properties:
 *               ruts:
 *                 type: array
 *                 items:
 *                   type: string
 *                 maxItems: 10
 *                 example: ["12345678-9", "98765432-1"]
 *               personalData:
 *                 $ref: '#/components/schemas/EquifaxPersonalData'
 *               productData:
 *                 $ref: '#/components/schemas/EquifaxProductData'
 *     responses:
 *       200:
 *         description: Bulk query completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       rut:
 *                         type: string
 *                       success:
 *                         type: boolean
 *                       data:
 *                         type: object
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       rut:
 *                         type: string
 *                       success:
 *                         type: boolean
 *                       error:
 *                         type: string
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                     successful:
 *                       type: number
 *                     failed:
 *                       type: number
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Bad request - Invalid RUTs array
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */
router.post('/bulk-query', 
  authenticateMw, 
  tenantFilterMw, 
  requireCompanyReadMw, 
  bulkQueryHandler
);

/**
 * @swagger
 * /api/equifax/health:
 *   get:
 *     summary: Get Equifax service health status
 *     tags: [Equifax]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Service health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: string
 *                   example: "active"
 *                 environment:
 *                   type: string
 *                   example: "uat"
 *                 baseUrl:
 *                   type: string
 *                   example: "https://api.uat.equifax.cl"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/health', 
  authenticateMw, 
  tenantFilterMw, 
  healthHandler
);

export default router;