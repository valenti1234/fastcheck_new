import { Router, RequestHandler } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import tenantRoutes from './tenant.routes';
import evaluationRoutes from './evaluation.routes';
import scraperRoutes from './scraper.routes';
import companyRoutes from './companyRoutes';
import rutRoutes from './rutRoutes';
import sheriffDataLogRoutes from './sheriffDataLog.routes';
import evaluationParameterRoutes from './evaluationParameter.routes';
import ley21121Routes from './ley21121.routes';
import ley20393Routes from './ley20393.routes';
import lpaltoRoutes from './lpalto.routes';
import lpmedioRoutes from './lpmedio.routes';
import monitoringRoutes from './monitoring';
import notificationRoutes from './notification.routes';
import userNoteRoutes from './userNote.routes';
import promptConfigurationRoutes from './promptConfiguration.routes';
import billingRoutes from './billing';
import adminEvaluationsRoutes from './adminEvaluations';
import creditRoutes from './credit.routes';
import systemRoutes from './system.routes';
import tenantUsageRoutes from './tenantUsage.routes';
import envConfigRoutes from './envConfig.routes';
import antiunionCaseRoutes from './antiunionCaseRoutes';
import summaryRoutes from './summary.routes';
import aiRoutes from './ai.routes';
import companyAnalysisRoutes from './companyAnalysis.routes';
import databaseRoutes from './databaseRoutes';
import equifaxRoutes from './equifax.routes';
import snifaRoutes from './snifa.routes';
import { authenticate } from '../middleware/auth.middleware';
import { tenantFilter } from '../middleware/tenant.middleware';
// import { Router as ExpressRouter } from 'express';

const router = Router();
console.log(`[${new Date().toISOString()}] [Router] - Initializing main router...`);

// Wrap middlewares to satisfy Express typings and avoid AuthenticatedRequest mismatch
const authenticateMw: RequestHandler = (req, res, next) => authenticate(req as any, res as any, next);
const tenantFilterMw: RequestHandler = (req, res, next) => tenantFilter(req as any, res as any, next);
const conditionalTenantFilterMw: RequestHandler = (req, res, next) => {
  // Skip tenant filtering for super admin tenant management endpoints
  if (
    req.path === '/all' ||
    req.path === '/statistics' ||
    req.path.match(/^\/[^\/]+\/users$/) || // /:id/users
    (req.path.match(/^\/[^\/]+$/) && req.method !== 'GET') || // /:id with POST, PATCH, DELETE
    (req.path === '/' && req.method === 'POST') // / with POST (create tenant)
  ) {
    next();
  } else {
    tenantFilter(req as any, res as any, next);
  }
};

// Mount all routes without /api prefix since it's already added in main app

// Auth routes don't need tenant filtering
router.use('/auth', authRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /auth routes.`);

// Apply tenant filtering to all tenant-specific routes
// This ensures proper tenant isolation by automatically filtering data by tenant

// User management routes
router.use('/users', authenticateMw, tenantFilterMw, userRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /users routes with tenant isolation.`);

// Tenant management routes
// We need to bypass the tenant filter for super admin tenant management endpoints
// but apply it for regular tenant endpoints
router.use('/tenant', authenticateMw, conditionalTenantFilterMw, tenantRoutes);

console.log(`[${new Date().toISOString()}] [Router] - Mounted /tenant routes with conditional tenant isolation.`);

// Evaluation routes
router.use('/evaluations', authenticateMw, tenantFilterMw, evaluationRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /evaluations routes with tenant isolation.`);

// Scraper routes
router.use('/scraper', authenticateMw, tenantFilterMw, scraperRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /scraper routes with tenant isolation.`);

// Company routes
router.use('/company', authenticateMw, tenantFilterMw, companyRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /company routes with tenant isolation.`);

// RUT routes
router.use('/rut', authenticateMw, tenantFilterMw, rutRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /rut routes with tenant isolation.`);

// Sheriff data log routes
router.use('/sheriff-data-logs', authenticateMw, tenantFilterMw, sheriffDataLogRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /sheriff-data-logs routes with tenant isolation.`);

// Evaluation parameter routes
router.use('/evaluation-parameters', authenticateMw, tenantFilterMw, evaluationParameterRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /evaluation-parameters routes with tenant isolation.`);

// Law-specific routes
router.use('/ley21121', authenticateMw, tenantFilterMw, ley21121Routes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /ley21121 routes with tenant isolation.`);

router.use('/ley20393', authenticateMw, tenantFilterMw, ley20393Routes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /ley20393 routes with tenant isolation.`);

router.use('/lpalto', authenticateMw, tenantFilterMw, lpaltoRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /lpalto routes with tenant isolation.`);

router.use('/lpmedio', authenticateMw, tenantFilterMw, lpmedioRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /lpmedio routes with tenant isolation.`);

// Monitoring routes
router.use('/monitoring', authenticateMw, tenantFilterMw, monitoringRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /monitoring routes with tenant isolation.`);

// Notification routes
router.use('/notifications', authenticateMw, tenantFilterMw, notificationRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /notifications routes with tenant isolation.`);

// User note routes
router.use('/user-notes', authenticateMw, tenantFilterMw, userNoteRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /user-notes routes with tenant isolation.`);

// Prompt configuration routes (admin only, no tenant filtering needed)
router.use('/prompt-configurations', promptConfigurationRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /prompt-configurations routes.`);

// Admin billing routes for superusers only - no tenant filtering needed
router.use('/admin/billing', billingRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /admin/billing routes.`);

// Admin evaluations routes for superusers only - no tenant filtering needed
router.use('/admin', adminEvaluationsRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /admin/evaluations routes.`);

// Credit management routes
router.use('/credits', authenticateMw, tenantFilterMw, creditRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /credits routes with tenant isolation.`);

// System status routes (admin only, no tenant filtering needed)// System routes
router.use('/system', systemRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /system routes.`);

// Tenant usage routes (admin only, no tenant filtering needed)
router.use('/tenant-usage', tenantUsageRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /tenant-usage routes.`);

// Environment configuration routes (superuser only)
router.use('/env-config', envConfigRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /env-config routes.`);

// Antiunion cases routes (admin only, no tenant filtering// Antiunion cases routes
router.use('/antiunion-cases', antiunionCaseRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /antiunion-cases routes.`);

// SNIFA sancionatorios routes
router.use('/snifa', snifaRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /snifa routes.`);

// Summary routes
router.use('/summaries', authenticateMw, tenantFilterMw, summaryRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /summaries routes with tenant isolation.`);

// AI routes
router.use('/ai', authenticateMw, tenantFilterMw, aiRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /ai routes with tenant isolation.`);

// Company analysis routes
router.use('/company-analysis', authenticateMw, tenantFilterMw, companyAnalysisRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /company-analysis routes with tenant isolation.`);

// Database management routes (superuser only, no tenant filtering needed)
router.use('/admin/database', databaseRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /admin/database routes.`);

// Equifax data provider routes
router.use('/equifax', authenticateMw, tenantFilterMw, equifaxRoutes);
console.log(`[${new Date().toISOString()}] [Router] - Mounted /equifax routes with tenant isolation.`);

console.log(`[${new Date().toISOString()}] [Router] - All routes mounted successfully.`);
export default router;
