import { Router } from 'express';
import { getEnvConfig, updateEnvConfig, validateEnvConfig } from '../controllers/envConfig.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';

const router = Router();

/**
 * @route GET /api/env-config
 * @desc Ottiene la configurazione .env corrente
 * @access Superadmin only
 */
router.get('/', authenticate, authorize(['superuser']), getEnvConfig);

/**
 * @route PUT /api/env-config
 * @desc Aggiorna la configurazione .env
 * @access Superadmin only
 */
router.put('/', authenticate, authorize(['superuser']), updateEnvConfig);

/**
 * @route GET /api/env-config/validate
 * @desc Valida la configurazione .env corrente
 * @access Superadmin only
 */
router.get('/validate', authenticate, authorize(['superuser']), validateEnvConfig);

export default router;