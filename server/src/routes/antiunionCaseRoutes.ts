import { Router } from 'express';
import {
  uploadPDF,
  uploadPDFWithProgress,
  upload,
  getAllAntiunionCases,
  getAntiunionCaseById,
  getAntiunionCaseByRut,
  createAntiunionCase,
  updateAntiunionCase,
  deleteAntiunionCase,
  getAntiunionCaseStats
} from '../controllers/antiunionCaseController';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';

const router = Router();

// Middleware di autenticazione per tutte le route
router.use(authenticate);

// Route per l'upload PDF con progress (solo superuser)
router.post('/upload-pdf-progress', 
  authorize(['superuser']), 
  upload.single('pdf'), 
  uploadPDFWithProgress
);

// Route per l'upload PDF tradizionale (solo superuser)
router.post('/upload-pdf', 
  authorize(['superuser']), 
  upload.single('pdf'), 
  uploadPDF
);

// Route per ottenere tutti i casi (con paginazione e filtri)
router.get('/', 
  authorize(['superuser', 'admin']), 
  getAllAntiunionCases
);

// Route per ottenere le statistiche
router.get('/stats', 
  authorize(['superuser', 'admin']), 
  getAntiunionCaseStats
);

// Route per cercare per RUT
router.get('/rut/:rut', 
  authorize(['superuser', 'admin', 'user', 'tenant_admin', 'evaluator', 'read_only']), 
  getAntiunionCaseByRut
);

// Route per ottenere un caso specifico per ID
router.get('/:id', 
  authorize(['superuser', 'admin']), 
  getAntiunionCaseById
);

// Route per creare un nuovo caso manualmente
router.post('/', 
  authorize(['superuser']), 
  createAntiunionCase
);

// Route per aggiornare un caso esistente
router.put('/:id', 
  authorize(['superuser']), 
  updateAntiunionCase
);

// Route per eliminare un caso
router.delete('/:id', 
  authorize(['superuser']), 
  deleteAntiunionCase
);

export default router;
