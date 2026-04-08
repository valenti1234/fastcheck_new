import express from 'express';
import { LpmedioController } from '../controllers/lpmedioController';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission, Permission } from '../middleware/permissions.middleware';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Upload CSV/XLS/XLSX for bulk import
router.post(
  '/upload',
  requirePermission(Permission.ADMIN_DASHBOARD),
  (LpmedioController.uploadExcel.single('file') as unknown as express.RequestHandler),
  (req, res) => LpmedioController.uploadFile(req as any, res)
);

// Get all Lpmedio entries
router.get(
  '/',
  requirePermission(Permission.ADMIN_DASHBOARD),
  (req, res) => LpmedioController.getAllLpmedio(req as any, res)
);

// Get Lpmedio by ID
router.get(
  '/:id',
  requirePermission(Permission.ADMIN_DASHBOARD),
  (req, res) => LpmedioController.getLpmedioById(req as any, res)
);

// Create new Lpmedio entry
router.post(
  '/',
  requirePermission(Permission.ADMIN_DASHBOARD),
  (req, res) => LpmedioController.createLpmedio(req as any, res)
);

// Update Lpmedio entry
router.put(
  '/:id',
  requirePermission(Permission.ADMIN_DASHBOARD),
  (req, res) => LpmedioController.updateLpmedio(req as any, res)
);

// Delete Lpmedio entry
router.delete(
  '/:id',
  requirePermission(Permission.ADMIN_DASHBOARD),
  (req, res) => LpmedioController.deleteLpmedio(req as any, res)
);

// Search Lpmedio entries by RUT
router.get(
  '/search/rut/:rut',
  requirePermission(Permission.ADMIN_DASHBOARD),
  (req, res) => LpmedioController.searchByRut(req as any, res)
);

export default router;