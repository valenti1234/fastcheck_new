import express from 'express';
import { LpaltoController } from '../controllers/lpaltoController';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission, Permission } from '../middleware/permissions.middleware';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Upload CSV/XLS/XLSX for bulk import
router.post(
  '/upload',
  requirePermission(Permission.ADMIN_DASHBOARD),
  // Cast multer middleware to satisfy Express typings
  (LpaltoController.uploadExcel.single('file') as unknown as express.RequestHandler),
  // Wrap controller to avoid type mismatch between Express.Request and AuthenticatedRequest
  (req, res) => LpaltoController.uploadFile(req as any, res)
);

// Get all Lpalto entries
router.get(
  '/',
  requirePermission(Permission.ADMIN_DASHBOARD),
  (req, res) => LpaltoController.getAllLpalto(req as any, res)
);

// Get Lpalto by ID
router.get(
  '/:id',
  requirePermission(Permission.ADMIN_DASHBOARD),
  (req, res) => LpaltoController.getLpaltoById(req as any, res)
);

// Create new Lpalto entry
router.post(
  '/',
  requirePermission(Permission.ADMIN_DASHBOARD),
  (req, res) => LpaltoController.createLpalto(req as any, res)
);

// Update Lpalto entry
router.put(
  '/:id',
  requirePermission(Permission.ADMIN_DASHBOARD),
  (req, res) => LpaltoController.updateLpalto(req as any, res)
);

// Delete Lpalto entry
router.delete(
  '/:id',
  requirePermission(Permission.ADMIN_DASHBOARD),
  (req, res) => LpaltoController.deleteLpalto(req as any, res)
);

// Search Lpalto entries by RUT
router.get(
  '/search/rut/:rut',
  requirePermission(Permission.ADMIN_DASHBOARD),
  (req, res) => LpaltoController.searchByRut(req as any, res)
);

export default router;