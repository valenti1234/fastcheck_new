import { Router } from 'express';
import { getCompanyByRut } from '../controllers/companyController';
import { requirePermission, Permission } from '../middleware/permissions.middleware';

const router = Router();

/**
 * @swagger
 * /company/{rut}:
 *   get:
 *     summary: Get company information by RUT
 *     description: Retrieves company information from datos.gob.cl using the provided RUT
 *     parameters:
 *       - in: path
 *         name: rut
 *         required: true
 *         description: RUT of the company to search for
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Company information retrieved successfully
 *       400:
 *         description: Invalid RUT provided
 *       404:
 *         description: Company not found
 *       500:
 *         description: Server error
 */
router.get('/:rut', requirePermission(Permission.COMPANY_READ), getCompanyByRut);

export default router;