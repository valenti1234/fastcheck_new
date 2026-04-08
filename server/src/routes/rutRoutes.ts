import { Router, RequestHandler } from 'express';
import { RutController } from '../controllers/rutController';
import { authenticate } from '../middleware/auth.middleware';
import { tenantFilter } from '../middleware/tenant.middleware';
import { requirePermission, Permission } from '../middleware/permissions.middleware';

const router = Router();

// Wrap middlewares and handlers to satisfy Express typings
const authenticateMw: RequestHandler = (req, res, next) => authenticate(req as any, res as any, next);
const tenantFilterMw: RequestHandler = (req, res, next) => tenantFilter(req as any, res as any, next);
const rutReadMw: RequestHandler = (req, res, next) => requirePermission(Permission.RUT_READ)(req as any, res as any, next);
// Generic wrappers to minimize typing issues across routes
const wrapPermission = (perm: Permission): RequestHandler => (req, res, next) => requirePermission(perm)(req as any, res as any, next);
const wrapController = (handler: (req: any, res: any) => any): RequestHandler => (req, res) => { void handler(req as any, res as any); };
const sheriffPermission = (Permission as any).SHERIFF_LOGS_READ ?? Permission.RUT_READ;
const sheriffLogsReadMw: RequestHandler = (req, res, next) => requirePermission(sheriffPermission as any)(req as any, res as any, next);
const getAllSheriffLogsHandler: RequestHandler = (req, res) => { void RutController.getAllSheriffLogs(req as any, res as any); };
const getSheriffLogDetailHandler: RequestHandler = (req, res) => { void RutController.getSheriffLogDetail(req as any, res as any); };

/**
 * @swagger
 * tags:
 *   name: RUT
 *   description: RUT validation and lookup operations
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     RutLookupRequest:
 *       type: object
 *       required:
 *         - rut
 *       properties:
 *         rut:
 *           type: string
 *           description: The RUT to lookup.
 *           example: "12345678-9"
 *         isMonitoring:
 *           type: boolean
 *           description: Indicates if this lookup is for monitoring purposes.
 *           default: false
 *           example: false
 *     SheriffDataLogResponse: # New response schema
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "60d5ec49f72e4c001f8e4d2a"
 *         rut:
 *           type: string
 *           example: "12345678-9"
 *         isMonitoringRequest:
 *           type: boolean
 *           example: false
 *         fetchedAt:
 *           type: string
 *           format: date-time
 *           example: "2023-06-25T10:30:00.000Z"
 *         loadRutData:
 *           type: object
 *           description: Response from /helper/loadRut
 *         summaryData:
 *           type: object
 *           description: Response from /helper/{RUT}/summary
 *         civilCasesData:
 *           type: object
 *           description: Response from /helper/{RUT}/getCivilCases
 *         laboralCasesData:
 *           type: object
 *           description: Response from /helper/{RUT}/getLaboralCases
 *         cobranzaCasesData:
 *           type: object
 *           description: Response from /helper/{RUT}/getCobranzaCases
 *         moraPrevisionalCasesData:
 *           type: object
 *           description: Response from /helper/{RUT}/getMoraPrevisionalCases
 *         multaLaboralCasesData:
 *           type: object
 *           description: Response from /helper/{RUT}/getMultaLaboralCases
 *         mallaSocietariaData:
 *           type: object
 *           description: Response from /helper/{RUT}/mallaSocietaria
 *         officialDiaryData:
 *           type: object
 *           description: Response from /helper/{RUT}/getOfficialDiary
 *         commercialBulletinCasesData:
 *           type: object
 *           description: Response from /helper/{RUT}/getCommercialBulletinCases
 *         siiData:
 *           type: object
 *           description: Response from /helper/{RUT}/getSiiData
 *         creditScoringData:
 *           type: object
 *           description: Response from /notification/creditScoring/{RUT}/getByRut
 *         allCallsSucceeded:
 *           type: boolean
 *           example: true
 *         apiCallErrors:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               step:
 *                 type: string
 *                 example: "summaryData"
 *               message:
 *                 type: string
 *                 example: "Request failed with status code 404"
 *               data:
 *                 type: object
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *         details:
 *           type: array
 *           items:
 *             type: object
 *         message:
 *           type: string
 */

/**
 * @swagger
 * /rut/lookup:
 *   post:
 *     summary: Lookup RUT information
 *     tags: [RUT]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RutLookupRequest'
 *     responses:
 *       200:
 *         description: Aggregated RUT information retrieved and logged successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SheriffDataLogResponse'
 *       400:
 *         description: Invalid request data / Validation error (e.g., RUT missing from request)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/lookup', authenticateMw, tenantFilterMw, wrapPermission(Permission.RUT_LOOKUP), wrapController(RutController.lookupRut));

/**
 * @swagger
 * /rut/resume/{rut}:
 *   get:
 *     summary: Get an AI-generated resume for a RUT based on stored data
 *     tags: [RUT]
 *     parameters:
 *       - in: path
 *         name: rut
 *         required: true
 *         description: The RUT to generate a resume for.
 *         schema:
 *           type: string
 *           example: "12345678-9"
 *     responses:
 *       200:
 *         description: Resume generated successfully, including Markdown and PDF information.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rut:
 *                   type: string
 *                   example: "12345678-9"
 *                 markdownResume:
 *                   type: string
 *                   description: The AI-generated Markdown summary.
 *                   example: "# Resumen Empresa RUT 12345678-9\n## Evaluación General\nParece estable..."
 *                 sheriffLogData:
 *                   $ref: '#/components/schemas/SheriffDataLogResponse' # Re-use existing detailed schema
 *                   description: The complete SheriffDataLog object, including base64 PDF content.
 *                 availablePdfs:
 *                   type: array
 *                   description: List of successfully downloaded PDFs.
 *                   items:
 *                     type: object
 *                     properties:
 *                       title:
 *                         type: string
 *                       filename:
 *                         type: string
 *                       contentType:
 *                         type: string
 *                       originalUrl:
 *                         type: string
 *                       sourcePath:
 *                         type: string
 *                       downloaded:
 *                         type: boolean
 *                         example: true
 *                 failedPdfDownloads:
 *                   type: array
 *                   description: List of PDFs that failed to download.
 *                   items:
 *                     type: object
 *                     properties:
 *                       title:
 *                         type: string
 *                       originalUrl:
 *                         type: string
 *                       error:
 *                         type: string
 *                       downloaded:
 *                         type: boolean
 *                         example: false
 *       400:
 *         description: Invalid request (e.g., RUT parameter missing).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No data found for the given RUT. Run the lookup first.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error (e.g., OpenAI API issue).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *     security: # Assuming this might also need authentication like other routes
 *       - bearerAuth: []
 */
router.get('/resume/:rut', authenticateMw, tenantFilterMw, rutReadMw, wrapController(RutController.getRutResume));

/**
 * @swagger
 * /rut/sheriff-logs:
 *   get:
 *     summary: Get all Sheriff data logs with pagination
 *     tags: [RUT]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page.
  *       - in: query
  *         name: rut
  *         schema:
  *           type: string
  *         description: Filter by RUT (e.g., "12.345.678-9" or "12345678-9"). Dots are ignored.
  *       - in: query
  *         name: startDate
  *         schema:
  *           type: string
  *           format: date-time
  *         description: Filter records created at or after this date (ISO string).
  *       - in: query
  *         name: endDate
  *         schema:
  *           type: string
  *           format: date-time
  *         description: Filter records created at or before this date (ISO string).
 *     responses:
 *       200:
 *         description: A list of Sheriff data logs.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SheriffDataLogResponse'
 *                 total:
 *                   type: integer
 *                 pages:
 *                   type: integer
 *                 currentPage:
 *                   type: integer
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *     security:
 *       - bearerAuth: [] # Assuming this route also requires authentication
 */
router.get('/sheriff-logs', authenticateMw, tenantFilterMw, sheriffLogsReadMw, getAllSheriffLogsHandler);

/**
 * @swagger
 * /rut/sheriff-logs/{logId}:
 *   get:
 *     summary: Get a specific Sheriff data log by its ID
 *     tags: [RUT]
 *     parameters:
 *       - in: path
 *         name: logId
 *         required: true
 *         description: The ID of the Sheriff data log to retrieve.
 *         schema:
 *           type: string
 *           example: "60d5ec49f72e4c001f8e4d2a"
 *     responses:
 *       200:
 *         description: Sheriff data log retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SheriffDataLogResponse'
 *       400:
 *         description: Invalid request (e.g., logId parameter missing).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Sheriff data log not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *     security:
 *       - bearerAuth: [] # Assuming this route also requires authentication
 */
router.get('/sheriff-logs/:logId', authenticateMw, tenantFilterMw, sheriffLogsReadMw, getSheriffLogDetailHandler);

/**
 * @swagger
 * /rut/results:
 *   get:
 *     summary: Get all results
 *     tags: [RUT]
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
 *           default: 20
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for RUT or Razon Social
 *       - in: query
 *         name: sortField
 *         schema:
 *           type: string
 *           default: createdAt
 *           enum: [rut, razonSocial, createdAt, riskLevel, isPep]
 *         description: Field to sort by
 *       - in: query
 *         name: sortDirection
 *         schema:
 *           type: string
 *           default: desc
 *           enum: [asc, desc]
 *         description: Sort direction (asc or desc)
 *     responses:
 *       200:
 *         description: A list of results.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SheriffDataLogResponse' # This should be a new ResultResponse schema
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *     security:
 *       - bearerAuth: []
 */
router.get('/results', authenticateMw, tenantFilterMw, rutReadMw, wrapController(RutController.getResults));

/**
 * @swagger
 * /rut/results/latest:
 *   get:
 *     summary: Get the latest result
 *     tags: [RUT]
 *     responses:
 *       200:
 *         description: Latest result retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SheriffDataLogResponse' # This should be a new ResultResponse schema
 *       404:
 *         description: No results found.
 *       500:
 *         description: Internal server error.
 *     security:
 *       - bearerAuth: []
 */
router.get('/results/latest', authenticateMw, tenantFilterMw, rutReadMw, wrapController(RutController.getLatestResult));

/**
 * @swagger
 * /rut/results/rut/{rut}:
 *   get:
 *     summary: Get a specific result by its RUT
 *     tags: [RUT]
 *     parameters:
 *       - in: path
 *         name: rut
 *         required: true
 *         description: The RUT of the result to retrieve.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Result retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SheriffDataLogResponse' # This should be a new ResultResponse schema
 *       404:
 *         description: Result not found.
 *       500:
 *         description: Internal server error.
 *     security:
 *       - bearerAuth: []
 */
router.get('/results/rut/:rut', authenticateMw, tenantFilterMw, rutReadMw, wrapController(RutController.getResultByRut));

/**
 * @swagger
 * /rut/results/{id}:
 *   get:
 *     summary: Get a specific result by its ID
 *     tags: [RUT]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the result to retrieve.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Result retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SheriffDataLogResponse' # This should be a new ResultResponse schema
 *       404:
 *         description: Result not found.
 *       500:
 *         description: Internal server error.
 *     security:
 *       - bearerAuth: []
 */
router.get('/results/:id', authenticateMw, tenantFilterMw, rutReadMw, wrapController(RutController.getResultById));

/**
 * @swagger
 * /rut/company-details/{rut}:
 *   get:
 *     summary: Get company details by RUT
 *     tags: [RUT]
 *     parameters:
 *       - in: path
 *         name: rut
 *         required: true
 *         description: The RUT of the company to retrieve details for.
 *         schema:
 *           type: string
 *           example: "12345678-9"
 *     responses:
 *       200:
 *         description: Company details retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 rut:
 *                   type: string
 *                 razonSocial:
 *                   type: string
 *                 presentaActividades:
 *                   type: string
 *                 inicioActividades:
 *                   type: string
 *                 autorizadoMonedaExtranjera:
 *                   type: string
 *                 empresaMenor:
 *                   type: string
 *                 observaciones:
 *                   type: string
 *                 notas:
 *                   type: string
 *                 situacionActual:
 *                   type: string
 *                 fetchedAt:
 *                   type: string
 *                   format: date-time
 *                 resultId:
 *                   type: string
 *                 sheriffLogId:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: Company details not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *     security:
 *       - bearerAuth: []
 */
router.get('/company-details/:rut', authenticateMw, tenantFilterMw, wrapPermission(Permission.COMPANY_READ), wrapController(RutController.getCompanyDetailsByRut));

/**
 * @swagger
 * /rut/company-risks/{rut}:
 *   get:
 *     summary: Get company risks by RUT
 *     tags: [RUT]
 *     parameters:
 *       - in: path
 *         name: rut
 *         required: true
 *         description: The RUT of the company to retrieve risks for.
 *         schema:
 *           type: string
 *           example: "12345678-9"
 *     responses:
 *       200:
 *         description: Company risks retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 rut:
 *                   type: string
 *                 newSummaryData:
 *                   type: object
 *                 duxiterFilter:
 *                   type: object
 *                 duxiterRiskLevel:
 *                   type: string
 *                 duxiterRiskData:
 *                   type: object
 *                 duxiterRiskList:
 *                   type: object
 *                 duxiterMD:
 *                   type: string
 *                 riskAssessment:
 *                   type: object
 *                 vistaDuxiter:
 *                   type: array
 *                 resultId:
 *                   type: string
 *                 sheriffLogId:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: Company risks not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *     security:
 *       - bearerAuth: []
 */
router.get('/company-risks/:rut', authenticateMw, tenantFilterMw, wrapPermission(Permission.COMPANY_READ), wrapController(RutController.getCompanyRisksByRut));

/**
 * @swagger
 * /rut/results/{id}:
 *   delete:
 *     summary: Delete a specific result by its ID
 *     tags: [RUT]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the result to delete.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Result deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Result deleted successfully"
 *       400:
 *         description: Invalid request (e.g., ID parameter missing).
 *       404:
 *         description: Result not found.
 *       500:
 *         description: Internal server error.
 *     security:
 *       - bearerAuth: []
 */
router.delete('/results/:id', authenticateMw, tenantFilterMw, rutReadMw, wrapController(RutController.deleteResult));

/**
 * @swagger
 * /api/rut/ai-analysis/{rut}:
 *   get:
 *     summary: Get AI analysis for evaluation parameters
 *     description: Generate an AI-powered analysis of evaluation parameters for a specific RUT
 *     tags: [RUT]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: rut
 *         required: true
 *         schema:
 *           type: string
 *         description: The RUT to analyze
 *         example: "12345678-9"
 *     responses:
 *       200:
 *         description: AI analysis generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rut:
 *                   type: string
 *                   example: "12345678-9"
 *                 aiAnalysis:
 *                   type: string
 *                   description: AI-generated analysis in markdown format
 *                 analysisDate:
 *                   type: string
 *                   format: date-time
 *                 riskSummary:
 *                   type: object
 *                   description: Risk assessment summary
 *       400:
 *         description: Bad request - RUT parameter missing
 *       404:
 *         description: No evaluation data found for the RUT
 *       500:
 *         description: Internal server error
 */
router.get('/ai-analysis/:rut', authenticateMw, tenantFilterMw, rutReadMw, wrapController(RutController.getAIAnalysis));

/**
 * @swagger
 * /api/rut/save-pdf:
 *   post:
 *     summary: Save PDF report statically and return access URL
 *     description: Save a PDF report to the server and return a unique URL for access
 *     tags: [RUT]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pdfData:
 *                 type: string
 *                 description: Base64 encoded PDF data
 *               rut:
 *                 type: string
 *                 description: Company RUT
 *               companyName:
 *                 type: string
 *                 description: Company name
 *     responses:
 *       200:
 *         description: PDF saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 pdfId:
 *                   type: string
 *                 accessUrl:
 *                   type: string
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post('/save-pdf', authenticateMw, tenantFilterMw, rutReadMw, wrapController(RutController.savePdfReport));

/**
 * @swagger
 * /api/rut/pdf/{pdfId}:
 *   get:
 *     summary: Access saved PDF report
 *     description: Retrieve a previously saved PDF report by its ID
 *     tags: [RUT]
 *     parameters:
 *       - in: path
 *         name: pdfId
 *         required: true
 *         schema:
 *           type: string
 *         description: The PDF ID
 *     responses:
 *       200:
 *         description: PDF retrieved successfully
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: PDF not found
 *       500:
 *         description: Internal server error
 */
router.get('/pdf/:pdfId', wrapController(RutController.getPdfReport));

/**
 * @swagger
 * /api/rut/fast-check-summary/{rut}:
 *   post:
 *     summary: Save Fast-Check summary to database
 *     description: Save the Fast-Check summary for a specific RUT to the database
 *     tags: [RUT]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: rut
 *         required: true
 *         schema:
 *           type: string
 *         description: The RUT to save the summary for
 *         example: "12345678-9"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               summary:
 *                 type: string
 *                 description: The Fast-Check summary content
 *                 maxLength: 500000
 *             required:
 *               - summary
 *     responses:
 *       200:
 *         description: Fast-Check summary saved successfully
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
 *                   example: "Fast-Check summary created successfully"
 *                 rut:
 *                   type: string
 *                 summaryId:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 action:
 *                   type: string
 *                   enum: [created, updated]
 *       400:
 *         description: Bad request - RUT or summary missing
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 *   get:
 *     summary: Get Fast-Check summary from database
 *     description: Retrieve the Fast-Check summary for a specific RUT from the database
 *     tags: [RUT]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: rut
 *         required: true
 *         schema:
 *           type: string
 *         description: The RUT to get the Fast-Check summary for
 *         example: "12345678-9"
 *     responses:
 *       200:
 *         description: Fast-Check summary retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 rut:
 *                   type: string
 *                 summaryId:
 *                   type: string
 *                 content:
 *                   type: string
 *                   description: The Fast-Check summary content
 *                 metadata:
 *                   type: object
 *                   description: Complete company and analysis metadata
 *                   properties:
 *                     analysisDate:
 *                       type: string
 *                       format: date-time
 *                     companyName:
 *                       type: string
 *                     riskLevel:
 *                       type: string
 *                     businessActivity:
 *                       type: string
 *                     constitutionDate:
 *                       type: string
 *                     fullCompanyDetails:
 *                       type: object
 *                     riskAssessment:
 *                       type: object
 *                     sheriffLogData:
 *                       type: object
 *                     aiAnalysis:
 *                       type: string
 *                     aiAnalysisDate:
 *                       type: string
 *                       format: date-time
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Bad request - RUT parameter missing
 *       401:
 *         description: Authentication required
 *       404:
 *         description: No Fast-Check summary found for RUT
 *       500:
 *         description: Internal server error
 */
router.post('/fast-check-summary/:rut', authenticateMw, tenantFilterMw, rutReadMw, wrapController(RutController.saveFastCheckSummary));
router.get('/fast-check-summary/:rut', authenticateMw, tenantFilterMw, rutReadMw, wrapController(RutController.getFastCheckSummary));

/**
 * @swagger
 * /api/rut/results/rut/{rut}/update-pep-status:
 *   put:
 *     summary: Update PEP status for a specific RUT
 *     tags: [RUT]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: rut
 *         required: true
 *         schema:
 *           type: string
 *         description: The RUT to update PEP status for
 *         example: "12345678-9"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: PEP status update payload
 *     responses:
 *       200:
 *         description: PEP status updated successfully
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
 *                   example: "PEP status updated successfully"
 *                 rut:
 *                   type: string
 *                   example: "12345678-9"
 *                 resultId:
 *                   type: string
 *                   example: "60d5ec49f72e4c001f8e4d2a"
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Bad request - missing RUT or PEP parameters
 *       401:
 *         description: Unauthorized - authentication required
 *       404:
 *         description: Not found - no result found for RUT
 *       500:
 *         description: Internal server error
 */
router.put('/results/rut/:rut/update-pep-status', authenticateMw, tenantFilterMw, rutReadMw, wrapController(RutController.updatePepStatus));

/**
 * @swagger
 * /api/rut/results/rut/{rut}/evaluate-pep-socios:
 *   post:
 *     summary: Verifica PEP dei soci e aggiorna il record
 *     tags: [RUT]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: rut
 *         required: true
 *         schema:
 *           type: string
 *         description: RUT dell'azienda da verificare
 *         example: "12345678-9"
 *     responses:
 *       200:
 *         description: Verifica completata e record aggiornato (se PEP rilevato)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 rut:
 *                   type: string
 *                 detectado:
 *                   type: boolean
 *                 pepChileDetected:
 *                   type: boolean
 *                 familiaresPepDetected:
 *                   type: boolean
 *       400:
 *         description: Parametri mancanti o non validi
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Nessun risultato trovato per il RUT
 *       500:
 *         description: Errore interno del server
 */
router.post('/results/rut/:rut/evaluate-pep-socios', authenticateMw, tenantFilterMw, rutReadMw, wrapController(RutController.evaluatePepForSocios));

/**
 * @swagger
 * /api/rut/check-socios-evaluations:
 *   post:
 *     summary: Check if socios have already been evaluated
 *     description: Checks if the provided RUTs have already been evaluated and returns their evaluation status and results
 *     tags: [RUT]
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
 *                 description: Array of RUTs to check
 *                 example: ["12345678-9", "98765432-1"]
 *     responses:
 *       200:
 *         description: Successfully checked socios evaluations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 evaluations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       rut:
 *                         type: string
 *                         example: "12345678-9"
 *                       isEvaluated:
 *                         type: boolean
 *                         example: true
 *                       evaluationDate:
 *                         type: string
 *                         format: date-time
 *                         example: "2023-06-25T10:30:00.000Z"
 *                       evaluationResult:
 *                         type: object
 *                         properties:
 *                           hasPepChile:
 *                             type: boolean
 *                             example: false
 *                           hasFamiliaresPep:
 *                             type: boolean
 *                             example: true
 *       400:
 *         description: Bad request - missing or invalid parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/check-socios-evaluations', authenticateMw, tenantFilterMw, rutReadMw, wrapController(RutController.checkSociosEvaluations));

/**
 * @swagger
 * /api/rut/reset-socios-evaluations:
 *   post:
 *     summary: Reset socios evaluations
 *     description: Deletes existing evaluation results for the provided socios RUTs within the current tenant
 *     tags: [RUT]
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
 *               - confirm
 *             properties:
 *               ruts:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array de RUTs de socios a resetear
 *               confirm:
 *                 type: boolean
 *                 description: Confirmación explícita para proceder con el reset
 *     responses:
 *       200:
 *         description: Reset completado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 deletedCount:
 *                   type: integer
 *       400:
 *         description: Parámetros inválidos o confirmación ausente
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error interno del servidor
 */
router.post('/reset-socios-evaluations', authenticateMw, tenantFilterMw, rutReadMw, wrapController(RutController.resetSociosEvaluations));

/**
 * @swagger
 * /api/rut/historical-consultas:
 *   get:
 *     summary: Get historical consultas report for the tenant
 *     tags: [RUT]
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
 *           default: 50
 *         description: Number of items per page
 *       - in: query
 *         name: consultaType
 *         schema:
 *           type: string
 *           enum: [individual, massive]
 *         description: Filter by consultation type
 *       - in: query
 *         name: rut
 *         schema:
 *           type: string
 *         description: Filter by specific RUT
 *       - in: query
 *         name: endpoint
 *         schema:
 *           type: string
 *         description: Filter by endpoint
 *       - in: query
 *         name: responseStatus
 *         schema:
 *           type: integer
 *         description: Filter by response status code
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter until this date
 *     responses:
 *       200:
 *         description: Historical consultas report retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/historical-consultas', authenticateMw, tenantFilterMw, rutReadMw, wrapController(RutController.getHistoricalConsultas));

/**
 * @swagger
 * /api/rut/historical-consultas/stats:
 *   get:
 *     summary: Get historical consultas statistics for the tenant
 *     tags: [RUT]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter until this date
 *     responses:
 *       200:
 *         description: Historical consultas statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalConsultas:
 *                   type: integer
 *                 consultasByType:
 *                   type: object
 *                 consultasByEndpoint:
 *                   type: object
 *                 consultasByStatus:
 *                   type: object
 *                 consultasByDate:
 *                   type: array
 *                 averageProcessingTime:
 *                   type: number
 *                 totalCreditsUsed:
 *                   type: integer
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/historical-consultas/stats', authenticateMw, tenantFilterMw, rutReadMw, wrapController(RutController.getHistoricalConsultasStats));

/**
 * @swagger
 * /api/rut/sheriff-logs:
 *   get:
 *     summary: Lista i log Sheriff del tenant corrente con paginazione
 *     tags: [RUT]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Numero di pagina
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: Elementi per pagina
 *     responses:
 *       200:
 *         description: Logs recuperati con successo
 *       401:
 *         description: Autenticazione richiesta
 *       500:
 *         description: Errore interno del server
 */
// Duplicate sheriff routes removed; first definitions above use typed wrappers

/**
 * @swagger
 * /api/rut/sheriff-logs/{logId}:
 *   get:
 *     summary: Dettaglio di un log Sheriff per ID
 *     tags: [RUT]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: logId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del log Sheriff
 *     responses:
 *       200:
 *         description: Dettaglio del log recuperato con successo
 *       401:
 *         description: Autenticazione richiesta
 *       404:
 *         description: Log non trovato
 *       500:
 *         description: Errore interno del server
 */
// Duplicate sheriff routes removed; first definitions above use typed wrappers

export default router;
