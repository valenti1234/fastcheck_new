import express from 'express';
import { 
  getTenantCreditBalance, 
  deductCredits, 
  addCredits, 
  validateCredits, 
  getCreditOperations 
} from '../controllers/creditController';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// All credit routes require authentication
router.use(authenticate);

// Get tenant credit balance
router.get('/balance/:tenantId', getTenantCreditBalance);

// Validate if tenant has enough credits
router.post('/validate', validateCredits);

// Deduct credits from tenant (used by evaluation service)
router.post('/deduct', deductCredits);

// Add credits to tenant (admin only)
router.post('/add', authorize('superuser', 'tenant_admin'), addCredits);

// Get credit operations history
router.get('/operations/:tenantId', getCreditOperations);

export default router;