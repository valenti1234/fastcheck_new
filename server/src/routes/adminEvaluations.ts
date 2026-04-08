import { Router, RequestHandler } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import adminEvaluationsController from '../controllers/adminEvaluations.controller';

const router = Router();

// Ensure middlewares conform to Express typings
const authenticateMw: RequestHandler = (req, res, next) => authenticate(req as any, res as any, next);
const authorizeSuperuserMw: RequestHandler = (req, res, next) => authorize(['superuser'])(req as any, res as any, next);
const wrap = (handler: (req: any, res: any) => any): RequestHandler => (req, res) => { void handler(req as any, res as any); };

// GET /admin/evaluations -> grouped by tenant
router.get('/evaluations', authenticateMw, authorizeSuperuserMw, wrap(adminEvaluationsController.getEvaluationsByTenant));
// GET /admin/fast-check-summaries -> list of Fast-Check summaries across tenants
router.get('/fast-check-summaries', authenticateMw, authorizeSuperuserMw, wrap(adminEvaluationsController.getFastCheckSummaries));

/**
 * @swagger
 * /admin/results:
 *   get:
 *     summary: Retrieve evaluation results with detailed metrics
 *     tags: [Admin]
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
 *           default: 20
 *         description: Items per page
 *       - in: query
 *         name: rut
 *         schema:
 *           type: string
 *         description: Filter by RUT
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *         description: Filter by Tenant ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by start date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by end date
 *     responses:
 *       200:
 *         description: List of evaluation results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 20
 *                 total:
 *                   type: integer
 *                   example: 100
 *                 totalPages:
 *                   type: integer
 *                   example: 5
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       rut:
 *                         type: string
 *                       tenantId:
 *                         type: string
 *                       tenantName:
 *                         type: string
 *                       user_email:
 *                         type: string
 *                         description: The email address of the tenant/user associated with the request
 *                       status:
 *                         type: number
 *                         description: The HTTP response status code
 *                         example: 200
 *                       type:
 *                         type: string
 *                         description: Type of evaluation (individual or masiva)
 *                         enum: [individual, masiva]
 *                       time:
 *                         type: string
 *                         description: Total processing duration
 *                         example: "123.456ms"
 *                       credits:
 *                         type: number
 *                         description: Number of credits consumed
 *                         example: 1
 *       500:
 *         description: Internal server error
 */
// GET /admin/results -> list Result documents across tenants
router.get('/results', authenticateMw, authorizeSuperuserMw, wrap(adminEvaluationsController.getResults));

export default router;