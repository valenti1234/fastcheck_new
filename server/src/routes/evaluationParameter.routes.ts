import { Router } from 'express';
import { getParameters, updateParameters } from '../controllers/evaluationParameterController';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission, Permission } from '../middleware/permissions.middleware';

const router = Router();

router.get('/', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), getParameters);
router.post('/', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), updateParameters);

export default router;