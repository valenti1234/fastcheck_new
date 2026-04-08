import express from 'express';
import {
  getPromptConfigurations,
  getPromptConfigurationById,
  getActivePromptByCategory,
  createPromptConfiguration,
  updatePromptConfiguration,
  deletePromptConfiguration,
  togglePromptConfiguration
} from '../controllers/promptConfigurationController';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission, Permission } from '../middleware/permissions.middleware';

const router = express.Router();

// Applica autenticazione a tutte le rotte
router.use(authenticate);

// Ottieni tutte le configurazioni di prompt
router.get('/', requirePermission(Permission.ADMIN_DASHBOARD), getPromptConfigurations);

// Ottieni una configurazione specifica per ID
router.get('/:id', requirePermission(Permission.ADMIN_DASHBOARD), getPromptConfigurationById);

// Ottieni il prompt attivo per una categoria
router.get('/active/:category', requirePermission(Permission.ADMIN_DASHBOARD), getActivePromptByCategory);

// Crea una nuova configurazione di prompt
router.post('/', requirePermission(Permission.ADMIN_DASHBOARD), createPromptConfiguration);

// Aggiorna una configurazione esistente
router.put('/:id', requirePermission(Permission.ADMIN_DASHBOARD), updatePromptConfiguration);

// Elimina una configurazione
router.delete('/:id', requirePermission(Permission.ADMIN_DASHBOARD), deletePromptConfiguration);

// Attiva/disattiva una configurazione
router.patch('/:id/toggle', requirePermission(Permission.ADMIN_DASHBOARD), togglePromptConfiguration);

export default router;