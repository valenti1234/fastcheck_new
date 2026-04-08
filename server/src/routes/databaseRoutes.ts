import express from 'express';
import { DatabaseController } from '../controllers/databaseController';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';

const router = express.Router();
const databaseController = new DatabaseController();

// Apply authentication and super admin role requirement to all routes
router.use(authenticate);
router.use(authorize(['superuser']));

// Database statistics
router.get('/stats', databaseController.getStats.bind(databaseController));

// Database operations
router.post('/backup', databaseController.createBackup.bind(databaseController));
router.post('/restore', databaseController.restore.bind(databaseController));
router.post('/backfill-consulta-history', databaseController.backfillConsultaHistory.bind(databaseController));
router.post('/cleanup', databaseController.cleanup.bind(databaseController));
router.post('/reindex', databaseController.reindex.bind(databaseController));

// Operation status and history
router.get('/operations', databaseController.getRecentOperations.bind(databaseController));
router.get('/operations/:operationId', databaseController.getOperationStatus.bind(databaseController));

export default router;
