import { Router } from 'express';
import {
  getBillings,
  getBillingById,
  generateInvoice,
  generateAllMonthlyBillings,
  updateInvoiceStatus,
  getTrafficReports,
  generateTrafficReport,
  generateAllTrafficReports,
  getBillingStats,
  getCreditStats,
  getBillingSettings,
  updateBillingSettings
} from '../controllers/billingController';
import {
  getTenantCreditBalance,
  deductCredits,
  addCredits,
  validateCredits,
  getCreditOperations
} from '../controllers/creditController';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';

const router = Router();

// All billing routes require authentication and superuser role
router.use(authenticate);
router.use(authorize(['superuser']));

// Admin billing management routes
router.get('/', getBillings);
router.get('/stats', getBillingStats);
router.get('/credit-stats', getCreditStats);
router.get('/settings', getBillingSettings);
router.put('/settings', updateBillingSettings);

// Traffic reports routes (must come before /:id to avoid conflicts)
router.get('/traffic-reports', getTrafficReports);
router.get('/traffic-reports/:tenantId', generateTrafficReport);
router.post('/traffic-reports/generate', generateTrafficReport);
router.post('/traffic-reports/generate-all', generateAllTrafficReports);

// Specific billing routes (must come after more specific routes)
router.get('/:id', getBillingById);
router.post('/generate', generateInvoice);
router.post('/generate-all', generateAllMonthlyBillings);
router.patch('/:id/status', updateInvoiceStatus);

// Credit management routes under /admin/billing/credits
router.get('/credits/:tenantId', getTenantCreditBalance);
router.post('/credits/validate', validateCredits);
router.post('/credits/deduct', deductCredits);
router.post('/credits/:tenantId/add', addCredits);
router.get('/credits/:tenantId/operations', getCreditOperations);

export default router;