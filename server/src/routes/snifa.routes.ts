import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { snifaUpload, previewFile, importFile, cancelImportJob, getImportJobStatus, updateSnifaRecord, listSnifaRecords, getSnifaSummary, getSanctionById, deleteSanction, getSanctionStats } from '../controllers/snifaController';

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: Snifa
 *     description: SNIFA (Sistema Nacional de Información de Fiscalización Ambiental) management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     SnifaSancionatorio:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         procesoSancionId:
 *           type: number
 *         expediente:
 *           type: string
 *         procesoSancionTipoNombre:
 *           type: string
 *         procesoSancionEstado:
 *           type: string
 *         fechaInicio:
 *           type: string
 *           format: date-time
 *         fechaTermino:
 *           type: string
 *           format: date-time
 *         multaTotalUTA:
 *           type: number
 *         linkSNIFA:
 *           type: string
 *         unidadFiscalizableId:
 *           type: number
 *         nombre:
 *           type: string
 *         regionNombre:
 *           type: string
 *         comunaNombre:
 *           type: string
 *         latitud:
 *           type: number
 *         longitud:
 *           type: number
 *         categoriaEconomicaNombre:
 *           type: string
 *         subCategoriaEconomicaNombre:
 *           type: string
 *         linkSNIFA_UF:
 *           type: string
 *         razonSocial:
 *           type: string
 *         rut:
 *           type: string
 *         unidadFiscalizable:
 *           type: string
 *         lista:
 *           type: string
 *         fastCheckProcesoSancionatorio:
 *           type: string
 *         fastCheckSanciones:
 *           type: string
 *         confirmaPdC:
 *           type: string
 *         fechaActualizacion:
 *           type: string
 *           format: date-time
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

router.use(authenticate);

/**
 * @swagger
 * /snifa/preview:
 *   post:
 *     summary: Preview SNIFA Excel file content
 *     tags: [Snifa]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: File preview data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 headers:
 *                   type: array
 *                   items:
 *                     type: string
 *                 preview:
 *                   type: array
 *                   items:
 *                     type: object
 *                 warnings:
 *                   type: array
 *                   items:
 *                     type: object
 *                 summary:
 *                   type: object
 *       400:
 *         description: Invalid file or format
 *       401:
 *         description: Unauthorized
 */
router.post('/preview', authorize(['superuser']), snifaUpload.single('file'), previewFile);

/**
 * @swagger
 * /snifa/import:
 *   post:
 *     summary: Import SNIFA Excel file
 *     tags: [Snifa]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Import job started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 jobId:
 *                   type: string
 *                 summary:
 *                   type: object
 *       400:
 *         description: Invalid file
 *       401:
 *         description: Unauthorized
 */
router.post('/import', authorize(['superuser']), snifaUpload.single('file'), importFile);

/**
 * @swagger
 * /snifa/import-jobs/{id}/cancel:
 *   patch:
 *     summary: Cancel a running import job
 *     tags: [Snifa]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Job ID
 *     responses:
 *       200:
 *         description: Job canceled successfully
 *       404:
 *         description: Job not found
 *       401:
 *         description: Unauthorized
 */
router.patch('/import-jobs/:id/cancel', authorize(['superuser']), cancelImportJob);

/**
 * @swagger
 * /snifa/import-jobs/{id}/status:
 *   get:
 *     summary: Get status of an import job
 *     tags: [Snifa]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Job ID
 *     responses:
 *       200:
 *         description: Job status details
 *       404:
 *         description: Job not found
 *       401:
 *         description: Unauthorized
 */
router.get('/import-jobs/:id/status', authorize(['superuser']), getImportJobStatus);

/**
 * @swagger
 * /snifa/summary:
 *   get:
 *     summary: Get summary of SNIFA records
 *     tags: [Snifa]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Summary statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: number
 *                 byEstado:
 *                   type: object
 *                 byRegion:
 *                   type: array
 *                 lastUpdate:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 */
router.get('/summary', authorize(['superuser']), getSnifaSummary);

/**
 * @swagger
 * /snifa/stats:
 *   get:
 *     summary: Get detailed statistics of SNIFA records
 *     tags: [Snifa]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Detailed statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalSanctions:
 *                   type: number
 *                 sanctionsByState:
 *                   type: array
 *                 sanctionsByRegion:
 *                   type: array
 *                 sanctionsByCategory:
 *                   type: array
 *                 totalFines:
 *                   type: number
 *                 recentSanctions:
 *                   type: array
 *       401:
 *         description: Unauthorized
 */
router.get('/stats', authorize(['superuser']), getSanctionStats);

/**
 * @swagger
 * /snifa:
 *   get:
 *     summary: List SNIFA records with pagination and search
 *     tags: [Snifa]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, expediente, razonSocial, or rut
 *       - in: query
 *         name: sortField
 *         schema:
 *           type: string
 *           default: fechaInicio
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: List of records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SnifaSancionatorio'
 *                 total:
 *                   type: number
 *                 page:
 *                   type: number
 *                 totalPages:
 *                   type: number
 *       401:
 *         description: Unauthorized
 */
router.get('/', authorize(['superuser']), listSnifaRecords);

/**
 * @swagger
 * /snifa/{id}:
 *   get:
 *     summary: Get a single SNIFA record by ID
 *     tags: [Snifa]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: SNIFA record details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SnifaSancionatorio'
 *       404:
 *         description: Record not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', authorize(['superuser']), getSanctionById);

/**
 * @swagger
 * /snifa/{id}:
 *   put:
 *     summary: Update a SNIFA record
 *     tags: [Snifa]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SnifaSancionatorio'
 *     responses:
 *       200:
 *         description: Updated record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SnifaSancionatorio'
 *       404:
 *         description: Record not found
 *       401:
 *         description: Unauthorized
 */
router.put('/:id', authorize(['superuser']), updateSnifaRecord);

/**
 * @swagger
 * /snifa/{id}:
 *   delete:
 *     summary: Delete a SNIFA record
 *     tags: [Snifa]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Record deleted successfully
 *       404:
 *         description: Record not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:id', authorize(['superuser']), deleteSanction);

export default router;
