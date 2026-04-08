import express from 'express';
import { UserNoteController } from '../controllers/userNoteController';
import { authenticate } from '../middleware/auth.middleware';
import { tenantFilter } from '../middleware/tenant.middleware';
import { requirePermission, Permission } from '../middleware/permissions.middleware';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: User Notes
 *   description: User notes management operations
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     UserNote:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "507f1f77bcf86cd799439011"
 *         userId:
 *           type: string
 *           example: "507f1f77bcf86cd799439012"
 *         tenantId:
 *           type: string
 *           example: "507f1f77bcf86cd799439013"
 *         rut:
 *           type: string
 *           example: "12345678-9"
 *         note:
 *           type: string
 *           example: "Esta empresa tiene un buen historial crediticio"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2024-03-20T15:30:00Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: "2024-03-20T15:30:00Z"
 *     CreateUserNote:
 *       type: object
 *       required:
 *         - rut
 *         - note
 *       properties:
 *         rut:
 *           type: string
 *           example: "12345678-9"
 *         note:
 *           type: string
 *           example: "Esta empresa tiene un buen historial crediticio"
 *           maxLength: 2000
 *     UpdateUserNote:
 *       type: object
 *       required:
 *         - note
 *       properties:
 *         note:
 *           type: string
 *           example: "Nota actualizada sobre la empresa"
 *           maxLength: 2000
 */

/**
 * @swagger
 * /api/user-notes/rut/{rut}:
 *   get:
 *     summary: Get all notes for a specific RUT
 *     tags: [User Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: rut
 *         required: true
 *         schema:
 *           type: string
 *         description: Company RUT
 *     responses:
 *       200:
 *         description: List of notes for the RUT
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UserNote'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/rut/:rut', 
  authenticate, 
  tenantFilter, 
  requirePermission(Permission.RUT_READ),
  UserNoteController.getNotesByRut
);

/**
 * @swagger
 * /api/user-notes:
 *   post:
 *     summary: Create a new note
 *     tags: [User Notes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserNote'
 *     responses:
 *       201:
 *         description: Note created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserNote'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/', 
  authenticate, 
  tenantFilter, 
  requirePermission(Permission.RUT_READ),
  UserNoteController.createNote
);

/**
 * @swagger
 * /api/user-notes/{id}:
 *   put:
 *     summary: Update a note
 *     tags: [User Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Note ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUserNote'
 *     responses:
 *       200:
 *         description: Note updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserNote'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Note not found
 *       500:
 *         description: Internal server error
 */
router.put('/:id', 
  authenticate, 
  tenantFilter, 
  requirePermission(Permission.RUT_READ),
  UserNoteController.updateNote
);

/**
 * @swagger
 * /api/user-notes/{id}:
 *   delete:
 *     summary: Delete a note
 *     tags: [User Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Note ID
 *     responses:
 *       200:
 *         description: Note deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Note not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', 
  authenticate, 
  tenantFilter, 
  requirePermission(Permission.RUT_READ),
  UserNoteController.deleteNote
);

/**
 * @swagger
 * /api/user-notes/user/my-notes:
 *   get:
 *     summary: Get all notes created by the current user
 *     tags: [User Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of user notes with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 notes:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/UserNote'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/user/my-notes', 
  authenticate, 
  tenantFilter, 
  requirePermission(Permission.RUT_READ),
  UserNoteController.getNotesByUser
);

export default router;