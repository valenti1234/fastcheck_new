import express from 'express';
import { 
  getAllLey21121, 
  getLey21121ById, 
  getLey21121ByRut, 
  createLey21121, 
  updateLey21121, 
  deleteLey21121 
} from '../controllers/ley21121Controller';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission, Permission } from '../middleware/permissions.middleware';

const router = express.Router();

/**
 * @swagger
 * /ley21121:
 *   get:
 *     summary: Get all Ley 21.121 records
 *     description: Retrieves all records of convicted suppliers under Law 21.121
 *     responses:
 *       200:
 *         description: Records retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), getAllLey21121);

/**
 * @swagger
 * /ley21121/{id}:
 *   get:
 *     summary: Get a Ley 21.121 record by ID
 *     description: Retrieves a specific record by its ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID of the record to retrieve
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Record retrieved successfully
 *       404:
 *         description: Record not found
 *       500:
 *         description: Server error
 */
router.get('/:id', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), getLey21121ById);

/**
 * @swagger
 * /ley21121/rut/{rut}:
 *   get:
 *     summary: Get Ley 21.121 records by RUT
 *     description: Retrieves all records for a specific RUT
 *     parameters:
 *       - in: path
 *         name: rut
 *         required: true
 *         description: RUT of the company to search for
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Records retrieved successfully
 *       404:
 *         description: No records found for the provided RUT
 *       500:
 *         description: Server error
 */
router.get('/rut/:rut', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), getLey21121ByRut);

/**
 * @swagger
 * /ley21121:
 *   post:
 *     summary: Create a new Ley 21.121 record
 *     description: Creates a new record for a convicted supplier under Law 21.121
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rut
 *               - razonSocial
 *               - rolCausa
 *               - fechaDesde
 *               - fechaHasta
 *               - duracion
 *               - motivo
 *             properties:
 *               rut:
 *                 type: string
 *               razonSocial:
 *                 type: string
 *               rolCausa:
 *                 type: string
 *               fechaDesde:
 *                 type: string
 *                 format: date
 *               fechaHasta:
 *                 type: string
 *                 format: date
 *               duracion:
 *                 type: string
 *               motivo:
 *                 type: string
 *     responses:
 *       201:
 *         description: Record created successfully
 *       400:
 *         description: Invalid input data
 *       500:
 *         description: Server error
 */
router.post('/', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), createLey21121);

/**
 * @swagger
 * /ley21121/{id}:
 *   put:
 *     summary: Update a Ley 21.121 record
 *     description: Updates an existing record by its ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID of the record to update
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rut
 *               - razonSocial
 *               - rolCausa
 *               - fechaDesde
 *               - fechaHasta
 *               - duracion
 *               - motivo
 *             properties:
 *               rut:
 *                 type: string
 *               razonSocial:
 *                 type: string
 *               rolCausa:
 *                 type: string
 *               fechaDesde:
 *                 type: string
 *                 format: date
 *               fechaHasta:
 *                 type: string
 *                 format: date
 *               duracion:
 *                 type: string
 *               motivo:
 *                 type: string
 *     responses:
 *       200:
 *         description: Record updated successfully
 *       400:
 *         description: Invalid input data
 *       404:
 *         description: Record not found
 *       500:
 *         description: Server error
 */
router.put('/:id', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), updateLey21121);

/**
 * @swagger
 * /ley21121/{id}:
 *   delete:
 *     summary: Delete a Ley 21.121 record
 *     description: Deletes an existing record by its ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID of the record to delete
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Record deleted successfully
 *       404:
 *         description: Record not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), deleteLey21121);

export default router;