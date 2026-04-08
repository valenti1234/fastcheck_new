import { Router } from 'express';
import { getSheriffDataLogsByTenant, getSheriffDataLogById, getSheriffDataLogByRut } from '../controllers/sheriffDataLogController';
import { authenticate } from '../middleware/auth.middleware';
import { tenantFilter } from '../middleware/tenant.middleware';
import { requirePermission, Permission } from '../middleware/permissions.middleware';

const router = Router();

// Apply both authentication and tenant filtering middleware
router.get('/tenant', authenticate, tenantFilter, requirePermission(Permission.SHERIFF_LOGS_READ), getSheriffDataLogsByTenant);
router.get('/rut/:rut', authenticate, tenantFilter, requirePermission(Permission.SHERIFF_LOGS_READ), getSheriffDataLogByRut);
router.get('/:id', authenticate, tenantFilter, requirePermission(Permission.SHERIFF_LOGS_READ), getSheriffDataLogById);

export default router;