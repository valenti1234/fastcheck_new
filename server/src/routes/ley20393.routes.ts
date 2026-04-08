import express from 'express';
import { 
  getAllLey20393, 
  getLey20393ById, 
  getLey20393ByRut, 
  createLey20393, 
  updateLey20393, 
  deleteLey20393 
} from '../controllers/ley20393Controller';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission, Permission } from '../middleware/permissions.middleware';

const router = express.Router();

/**
 * @swagger
 * /ley20393:
 *   get:
 *     summary: Get all Ley 20.393 records
 *     description: Retrieves all records of convicted suppliers under Law 20.393
 *     responses:
 *       200:
 *         description: Records retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), getAllLey20393);

/**
 * @swagger
 * /ley20393/{id}:
 *   get:
 *     summary: Get a Ley 20.393 record by ID
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
router.get('/:id', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), getLey20393ById);

/**
 * @swagger
 * /ley20393/rut/{rut}:
 *   get:
 *     summary: Get Ley 20.393 records by RUT
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
router.get('/rut/:rut', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), getLey20393ByRut);

/**
 * @swagger
 * /ley20393:
 *   post:
 *     summary: Create a new Ley 20.393 record
 *     description: Creates a new record for a convicted supplier under Law 20.393
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
router.post('/', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), createLey20393);

/**
 * @swagger
 * /ley20393/{id}:
 *   put:
 *     summary: Update a Ley 20.393 record
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
router.put('/:id', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), updateLey20393);

/**
 * @swagger
 * /ley20393/{id}:
 *   delete:
 *     summary: Delete a Ley 20.393 record
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
router.delete('/:id', authenticate, requirePermission(Permission.ADMIN_DASHBOARD), deleteLey20393);

export default router;