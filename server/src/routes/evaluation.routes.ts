import express from 'express';
import mongoose from 'mongoose';
import { EvaluationService } from '../services/evaluationService';
import { authenticate } from '../middleware/auth.middleware';
import { tenantFilter } from '../middleware/tenant.middleware';
import { requirePermission, Permission } from '../middleware/permissions.middleware';
import { getRecentBulkEvaluations } from '../controllers/evaluationController';
import elkService from '../services/elkService';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Evaluations
 *   description: Provider evaluation operations
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     EvaluationJob:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: "507f1f77bcf86cd799439011"
 *         tenantId:
 *           type: string
 *           example: "507f1f77bcf86cd799439012"
 *         status:
 *           type: string
 *           enum: [pending, processing, completed, failed]
 *           example: "completed"
 *         type:
 *           type: string
 *           enum: [single, bulk]
 *           example: "single"
 *         createdBy:
 *           type: string
 *           example: "507f1f77bcf86cd799439013"
 *         totalEvaluations:
 *           type: number
 *           example: 1
 *         completedEvaluations:
 *           type: number
 *           example: 1
 *         failedEvaluations:
 *           type: number
 *           example: 0
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2024-03-20T15:30:00Z"
 *     EvaluationResult:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: "507f1f77bcf86cd799439014"
 *         jobId:
 *           type: string
 *           example: "507f1f77bcf86cd799439011"
 *         tenantId:
 *           type: string
 *           example: "507f1f77bcf86cd799439012"
 *         rut:
 *           type: string
 *           example: "12.345.678-9"
 *         name:
 *           type: string
 *           example: "Provider Name"
 *         status:
 *           type: string
 *           enum: [success, failed]
 *           example: "success"
 *         data:
 *           type: object
 *           properties:
 *             legalInfo:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                   example: "Provider Legal Name"
 *                 type:
 *                   type: string
 *                   example: "SPA"
 *                 status:
 *                   type: string
 *                   example: "Active"
 *             financialInfo:
 *               type: object
 *               properties:
 *                 creditScore:
 *                   type: number
 *                   example: 750
 *                 riskLevel:
 *                   type: string
 *                   example: "Low"
 *                 lastUpdated:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-03-20T15:30:00Z"
 *             judicialInfo:
 *               type: object
 *               properties:
 *                 hasLawsuits:
 *                   type: boolean
 *                   example: false
 *                 activeCases:
 *                   type: number
 *                   example: 0
 *                 lastUpdated:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-03-20T15:30:00Z"
 */

/**
 * @swagger
 * /evaluations:
 *   get:
 *     summary: Get evaluation jobs for a tenant
 *     tags: [Evaluations]
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
 *         description: List of evaluation jobs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 jobs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/EvaluationJob'
 *                 total:
 *                   type: number
 *                   example: 50
 *                 pages:
 *                   type: number
 *                   example: 5
 *       401:
 *         description: Unauthorized
 */
router.get('/', authenticate, tenantFilter, requirePermission(Permission.EVALUATION_READ), async (req, res) => {
  const { page: pageQuery, limit: limitQuery } = req.query;
  // Get tenant ID from authenticated user
  const tenantId = req.user?.tenant;
  
  console.log(`[${new Date().toISOString()}] [GET /evaluations] - Received request for tenantId: ${tenantId}`);
  try {
    const page = parseInt(pageQuery as string) || 1;
    const limit = parseInt(limitQuery as string) || 10;

    if (!tenantId) {
      console.warn(`[${new Date().toISOString()}] [GET /evaluations] - Tenant ID is required.`);
      return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
    }

    const jobs = await EvaluationService.getJobs(tenantId, page, limit);
    console.log(`[${new Date().toISOString()}] [GET /evaluations] - Successfully fetched jobs for tenantId: ${tenantId}`);
    res.json(jobs);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [GET /evaluations] - Failed to fetch jobs for tenantId: ${tenantId}:`, error);
    res.status(500).json({ message: 'Failed to fetch jobs' });
  }
});

/**
 * @swagger
 * /evaluations/{jobId}:
 *   get:
 *     summary: Get a specific evaluation job
 *     tags: [Evaluations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Evaluation job details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EvaluationJob'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Job not found
 */
router.get('/results/:jobId', authenticate, tenantFilter, requirePermission(Permission.EVALUATION_READ), async (req, res) => {
  const { jobId } = req.params;
  // Get tenant ID from authenticated user
  const tenantId = req.user?.tenant;
  const userId = req.user?.id;
  
  console.log(`[${new Date().toISOString()}] [GET /evaluations/${jobId}] - Received request.`);
  
  // Log evaluation job request
  elkService.logBusinessEvent('evaluation_job_requested', {
    jobId: jobId,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  }, userId, tenantId);
  
  try {
    if (!tenantId) {
      console.warn(`[${new Date().toISOString()}] [GET /evaluations/${jobId}] - Tenant ID is required.`);
      elkService.logBusinessEvent('evaluation_job_failed', {
        reason: 'missing_tenant_id',
        jobId: jobId,
        ipAddress: req.ip
      }, userId);
      return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
    }
    
    const job = await EvaluationService.getJob(jobId, tenantId);
    if (!job) {
      console.warn(`[${new Date().toISOString()}] [GET /evaluations/${jobId}] - Job not found.`);
      elkService.logBusinessEvent('evaluation_job_failed', {
        reason: 'job_not_found',
        jobId: jobId,
        ipAddress: req.ip
      }, userId, tenantId);
      return res.status(404).json({ message: 'Job not found' });
    }
    console.log(`[${new Date().toISOString()}] [GET /evaluations/${jobId}] - Successfully fetched job.`);
    
    // Log successful job fetch
    elkService.logBusinessEvent('evaluation_job_fetched', {
      jobId: job._id.toString(),
      status: job.status,
      type: job.type,
      totalEvaluations: job.totalEvaluations,
      completedEvaluations: job.completedEvaluations,
      failedEvaluations: job.failedEvaluations,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    }, userId, tenantId);
    
    res.json(job);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [GET /evaluations/${jobId}] - Failed to fetch job:`, error);
    
    // Log system error
    elkService.logSystemError(error as Error, 'evaluation_job_fetch', {
      jobId: jobId,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      userId,
      tenantId
    });
    
    res.status(500).json({ message: 'Failed to fetch job' });
  }
});

/**
 * @swagger
 * /evaluations/results:
 *   get:
 *     summary: Get detailed results for a specific evaluation job
 *     tags: [Evaluations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the evaluation job
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
 *         description: Number of results per page
 *     responses:
 *       200:
 *         description: Detailed evaluation results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/EvaluationResult'
 *                 total:
 *                   type: number
 *                   example: 50
 *                   description: Total number of results
 *                 pages:
 *                   type: number
 *                   example: 5
 *                   description: Total number of pages
 *       401:
 *         description: Unauthorized - Missing or invalid authentication
 *       404:
 *         description: Job not found
 *       500:
 *         description: Server error
 */
router.get('/results', authenticate, tenantFilter, requirePermission(Permission.EVALUATION_READ), async (req, res) => {
  const { jobId } = req.query;
  const { page: pageQuery, limit: limitQuery } = req.query;
  // Get tenant ID from authenticated user
  const tenantId = req.user?.tenant;
  const userId = req.user?.id;
  
  console.log(`[${new Date().toISOString()}] [GET /evaluations/results] - Received request.`);
  
  // Log evaluation results request
  elkService.logBusinessEvent('evaluation_results_requested', {
    jobId: jobId as string,
    page: parseInt(pageQuery as string) || 1,
    limit: parseInt(limitQuery as string) || 10,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  }, userId, tenantId);
  
  try {
    if (!tenantId) {
      console.warn(`[${new Date().toISOString()}] [GET /evaluations/results] - Tenant ID is required.`);
      elkService.logBusinessEvent('evaluation_results_failed', {
        reason: 'missing_tenant_id',
        jobId: jobId as string,
        ipAddress: req.ip
      }, userId);
      return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
    }
    
    const page = parseInt(pageQuery as string) || 1;
    const limit = parseInt(limitQuery as string) || 10;

    const results = await EvaluationService.getResults(jobId as string, tenantId, page, limit);
    console.log(`[${new Date().toISOString()}] [GET /evaluations/results] - Successfully fetched results.`);
    
    // Log successful results fetch
    elkService.logBusinessEvent('evaluation_results_fetched', {
      jobId: jobId as string,
      page: page,
      limit: limit,
      totalResults: results.total,
      resultsCount: results.results.length,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    }, userId, tenantId);
    
    res.json(results);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [GET /evaluations/results] - Failed to fetch results:`, error);
    
    // Log system error
    elkService.logSystemError(error as Error, 'evaluation_results_fetch', {
      jobId: jobId as string,
      page: parseInt(pageQuery as string) || 1,
      limit: parseInt(limitQuery as string) || 10,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      userId,
      tenantId
    });
    
    res.status(500).json({ message: 'Failed to fetch results' });
  }
});

/**
 * @swagger
 * /evaluations:
 *   post:
 *     summary: Create a single evaluation
 *     tags: [Evaluations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - supplierData
 *             properties:
 *               userId:
 *                 type: string
 *                 description: ID of the user creating the evaluation
 *               supplierData:
 *                 type: object
 *                 required:
 *                   - rut
 *                 properties:
 *                   rut:
 *                     type: string
 *                     example: "12.345.678-9"
 *                   name:
 *                     type: string
 *                     example: "Provider Name"
 *               companyData:
 *                 type: object
 *                 description: Additional company information (optional)
 *     responses:
 *       201:
 *         description: Evaluation job created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EvaluationJob'
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 */
router.post('/', authenticate, tenantFilter, requirePermission(Permission.EVALUATION_CREATE), async (req, res) => {
  const { userId, supplierData, companyData } = req.body;
  // Get tenant ID from authenticated user
  const tenantId = req.user?.tenant;
  
  console.log(`[${new Date().toISOString()}] [POST /evaluations] - Received request for tenantId: ${tenantId}`);
  
  // Log evaluation attempt
  elkService.logBusinessEvent('single_evaluation_attempted', {
    supplierRut: supplierData?.rut,
    supplierName: supplierData?.name,
    hasCompanyData: !!companyData,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  }, userId, tenantId);
  
  try {
    if (!tenantId) {
      console.warn(`[${new Date().toISOString()}] [POST /evaluations] - Tenant ID is required.`);
      elkService.logBusinessEvent('single_evaluation_failed', {
        reason: 'missing_tenant_id',
        supplierRut: supplierData?.rut,
        ipAddress: req.ip
      }, userId, tenantId);
      return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
    }

    if (!userId) {
      console.warn(`[${new Date().toISOString()}] [POST /evaluations] - User ID is required.`);
      elkService.logBusinessEvent('single_evaluation_failed', {
        reason: 'missing_user_id',
        supplierRut: supplierData?.rut,
        ipAddress: req.ip
      }, userId, tenantId);
      return res.status(400).json({ message: 'User ID is required' });
    }

    if (!supplierData || !supplierData.rut) {
      console.warn(`[${new Date().toISOString()}] [POST /evaluations] - Supplier RUT is required.`);
      elkService.logBusinessEvent('single_evaluation_failed', {
        reason: 'missing_supplier_rut',
        supplierData: supplierData,
        ipAddress: req.ip
      }, userId, tenantId);
      return res.status(400).json({ message: 'Supplier RUT is required' });
    }

    const job = await EvaluationService.createSingleEvaluation(tenantId, userId, supplierData, companyData);
    console.log(`[${new Date().toISOString()}] [POST /evaluations] - Successfully created single evaluation job: ${job._id}`);
    
    // Log successful evaluation creation
    elkService.logBusinessEvent('single_evaluation_created', {
      jobId: job._id.toString(),
      supplierRut: supplierData.rut,
      supplierName: supplierData.name,
      evaluationType: job.type,
      status: job.status,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    }, userId, tenantId);
    
    res.status(201).json(job);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [POST /evaluations] - Failed to create evaluation:`, error);
    
    // Log system error
    elkService.logSystemError(error as Error, 'single_evaluation_creation', {
      supplierRut: supplierData?.rut,
      supplierName: supplierData?.name,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      userId,
      tenantId
    });
    
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to create evaluation' });
  }
});

/**
 * @swagger
 * /evaluations/bulk:
 *   post:
 *     summary: Create bulk evaluations
 *     tags: [Evaluations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tenantId
 *               - userId
 *               - suppliers
 *             properties:
 *               tenantId:
 *                 type: string
 *               userId:
 *                 type: string
 *               suppliers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - rut
 *                   properties:
 *                     rut:
 *                       type: string
 *                       example: "12.345.678-9"
 *                     name:
 *                       type: string
 *                       example: "Provider Name"
 *     responses:
 *       201:
 *         description: Bulk evaluation job created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EvaluationJob'
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 */
router.post('/bulk', authenticate, tenantFilter, requirePermission(Permission.EVALUATION_BULK), async (req, res) => {
  const { userId, suppliers } = req.body;
  // Get tenant ID from authenticated user
  const tenantId = req.user?.tenant;
  
  console.log(`[${new Date().toISOString()}] [POST /evaluations/bulk] - Received request for tenantId: ${tenantId}`);
  
  // Log bulk evaluation attempt
  elkService.logBusinessEvent('bulk_evaluation_attempted', {
    suppliersCount: suppliers?.length || 0,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  }, userId, tenantId);
  
  try {
    if (!tenantId) {
      console.warn(`[${new Date().toISOString()}] [POST /evaluations/bulk] - Tenant ID is required.`);
      elkService.logBusinessEvent('bulk_evaluation_failed', {
        reason: 'missing_tenant_id',
        ipAddress: req.ip
      }, userId);
      return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
    }
    if (!userId) {
      console.warn(`[${new Date().toISOString()}] [POST /evaluations/bulk] - User ID is required.`);
      elkService.logBusinessEvent('bulk_evaluation_failed', {
        reason: 'missing_user_id',
        ipAddress: req.ip
      }, undefined, tenantId);
      return res.status(400).json({ message: 'User ID is required' });
    }
    if (!suppliers || !Array.isArray(suppliers) || suppliers.length === 0) {
      console.warn(`[${new Date().toISOString()}] [POST /evaluations/bulk] - Suppliers array is required.`);
      elkService.logBusinessEvent('bulk_evaluation_failed', {
        reason: 'missing_suppliers_array',
        suppliersProvided: suppliers,
        ipAddress: req.ip
      }, userId, tenantId);
      return res.status(400).json({ message: 'Suppliers array is required' });
    }

    const job = await EvaluationService.createBulkEvaluation(tenantId, userId, suppliers);
    const jobId = job._id.toString();
    console.log(`[${new Date().toISOString()}] [POST /evaluations/bulk] - Successfully created bulk evaluation job: ${jobId}`);
    
    // Log successful bulk evaluation creation
    elkService.logBusinessEvent('bulk_evaluation_created', {
      jobId: jobId,
      suppliersCount: suppliers.length,
      evaluationType: job.type,
      status: job.status,
      totalEvaluations: job.totalEvaluations,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    }, userId, tenantId);
    
    res.status(201).json({
      jobId,
      status: job.status,
      totalEvaluations: job.totalEvaluations
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [POST /evaluations/bulk] - Failed to create bulk evaluation:`, error);
    
    // Log system error
    elkService.logSystemError(error as Error, 'bulk_evaluation_creation', {
      suppliersCount: suppliers?.length || 0,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      userId,
      tenantId
    });
    
    res.status(500).json({ message: 'Failed to create bulk evaluation' });
  }
});

/**
 * @swagger
 * /evaluations/bulk/progress/{jobId}:
 *   get:
 *     summary: Get progress for a bulk evaluation job
 *     tags: [Evaluations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bulk evaluation progress
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 jobId:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [pending, processing, completed, failed]
 *                 totalSuppliers:
 *                   type: number
 *                 processedSuppliers:
 *                   type: number
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       rut:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [success, error]
 *                       data:
 *                         type: object
 *                       error:
 *                         type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Job not found
 */
router.get('/bulk/progress/:jobId', authenticate, tenantFilter, requirePermission(Permission.EVALUATION_READ), async (req, res) => {
  const { jobId } = req.params;
  const tenantId = req.user?.tenant;
  const userId = req.user?.id;

  console.log(`[${new Date().toISOString()}] [GET /evaluations/bulk/progress/${jobId}] - Received request.`);
  
  // Log bulk progress request
  elkService.logBusinessEvent('bulk_evaluation_progress_requested', {
    jobId: jobId,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  }, userId, tenantId);
  
  try {
    if (!tenantId) {
      console.warn(`[${new Date().toISOString()}] [GET /evaluations/bulk/progress/${jobId}] - Tenant ID is required.`);
      elkService.logBusinessEvent('bulk_evaluation_progress_failed', {
        reason: 'missing_tenant_id',
        jobId: jobId,
        ipAddress: req.ip
      }, userId);
      return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
    }

    if (!jobId || jobId === 'undefined') {
      console.warn(`[${new Date().toISOString()}] [GET /evaluations/bulk/progress] - Job ID is required.`);
      elkService.logBusinessEvent('bulk_evaluation_progress_failed', {
        reason: 'missing_job_id',
        jobId: jobId,
        ipAddress: req.ip
      }, userId, tenantId);
      return res.status(400).json({ message: 'Job ID is required' });
    }

    let validJobId = jobId;
    // If jobId is not a valid ObjectId, try to find the job by the original jobId
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      console.warn(`[${new Date().toISOString()}] [GET /evaluations/bulk/progress] - Non-ObjectId format, attempting to find job.`);
      // You might want to add additional validation here if needed
      validJobId = jobId;
    }

    const job = await EvaluationService.getJob(validJobId, tenantId);
    if (!job) {
      console.warn(`[${new Date().toISOString()}] [GET /evaluations/bulk/progress/${jobId}] - Job not found.`);
      elkService.logBusinessEvent('bulk_evaluation_progress_failed', {
        reason: 'job_not_found',
        jobId: jobId,
        ipAddress: req.ip
      }, userId, tenantId);
      return res.status(404).json({ message: 'Job not found' });
    }

    const results = await EvaluationService.getResults(validJobId, tenantId, 1, job.totalEvaluations);

    const progress = {
      jobId: job._id.toString(),
      status: job.status,
      totalSuppliers: job.totalEvaluations,
      processedSuppliers: job.completedEvaluations + job.failedEvaluations,
      results: results.results.map(result => ({
        rut: result.rut,
        status: result.status === 'success' ? 'success' : 'error',
        data: result.data,
        error: result.error
      }))
    };

    console.log(`[${new Date().toISOString()}] [GET /evaluations/bulk/progress/${jobId}] - Successfully fetched progress.`);
    
    // Log successful progress fetch
    elkService.logBusinessEvent('bulk_evaluation_progress_fetched', {
      jobId: job._id.toString(),
      status: job.status,
      totalSuppliers: job.totalEvaluations,
      processedSuppliers: job.completedEvaluations + job.failedEvaluations,
      completedEvaluations: job.completedEvaluations,
      failedEvaluations: job.failedEvaluations,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    }, userId, tenantId);
    
    res.json(progress);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [GET /evaluations/bulk/progress/${jobId}] - Failed to fetch progress:`, error);
    
    // Log system error
    elkService.logSystemError(error as Error, 'bulk_evaluation_progress_fetch', {
      jobId: jobId,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      userId,
      tenantId
    });
    
    res.status(500).json({ message: 'Failed to fetch progress' });
  }
});

/**
 * @swagger
 * /evaluations/bulk/recent:
 *   get:
 *     summary: Get recent bulk evaluations
 *     tags: [Evaluations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of recent bulk evaluations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   status:
 *                     type: string
 *                     enum: [pending, processing, completed, failed]
 *                   totalSuppliers:
 *                     type: number
 *                   processedSuppliers:
 *                     type: number
 *       401:
 *         description: Unauthorized
 */
router.get('/bulk/recent', authenticate, tenantFilter, requirePermission(Permission.EVALUATION_READ), getRecentBulkEvaluations);

/**
 * @swagger
 * /evaluations/{jobId}:
 *   delete:
 *     summary: Delete an evaluation job and its results
 *     tags: [Evaluations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: The evaluation job ID
 *     responses:
 *       200:
 *         description: Evaluation deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Evaluation deleted successfully"
 *                 deletedJob:
 *                   $ref: '#/components/schemas/EvaluationJob'
 *       404:
 *         description: Evaluation not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:jobId', authenticate, tenantFilter, requirePermission(Permission.EVALUATION_DELETE), async (req, res) => {
  try {
    const { jobId } = req.params;
    const tenantId = req.user!.tenant;

    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ message: 'Invalid job ID format' });
    }

    const result = await EvaluationService.deleteEvaluation(jobId, tenantId);
    
    if (!result) {
      return res.status(404).json({ message: 'Evaluation not found' });
    }

    // Log the deletion
    elkService.logBusinessEvent('evaluation_deleted', {
      jobId,
      tenantId,
      deletedBy: req.user?.id
    }, req.user?.id, tenantId);

    res.json({
      message: 'Evaluation deleted successfully',
      deletedJob: result
    });
  } catch (error) {
    console.error('Error deleting evaluation:', error);
    elkService.logSystemError(error as Error, 'delete_evaluation_route', {
      jobId: req.params.jobId,
      tenantId: req.user?.tenant,
      userId: req.user?.id
    });
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @swagger
 * /evaluations/bulk/delete:
 *   post:
 *     summary: Delete multiple evaluation jobs and their results
 *     tags: [Evaluations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               jobIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]
 *             required:
 *               - jobIds
 *     responses:
 *       200:
 *         description: Evaluations deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "2 evaluations deleted successfully"
 *                 deletedCount:
 *                   type: number
 *                   example: 2
 *                 failedCount:
 *                   type: number
 *                   example: 0
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
router.post('/bulk/delete', authenticate, tenantFilter, requirePermission(Permission.EVALUATION_DELETE), async (req, res) => {
  try {
    const { jobIds } = req.body;
    const tenantId = req.user!.tenant;

    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({ message: 'jobIds must be a non-empty array' });
    }

    // Validate all job IDs
    const invalidIds = jobIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({ 
        message: 'Invalid job ID format', 
        invalidIds 
      });
    }

    const result = await EvaluationService.deleteBulkEvaluations(jobIds, tenantId);

    // Log the bulk deletion
    elkService.logBusinessEvent('bulk_evaluations_deleted', {
      jobIds,
      tenantId,
      deletedCount: result.deletedCount,
      failedCount: result.failedCount,
      deletedBy: req.user?.id
    }, req.user?.id, tenantId);

    res.json({
      message: `${result.deletedCount} evaluations deleted successfully`,
      deletedCount: result.deletedCount,
      failedCount: result.failedCount,
      errors: result.errors
    });
  } catch (error) {
    console.error('Error deleting bulk evaluations:', error);
    elkService.logSystemError(error as Error, 'delete_bulk_evaluations_route', {
      jobIds: req.body.jobIds,
      tenantId: req.user?.tenant,
      userId: req.user?.id
    });
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;