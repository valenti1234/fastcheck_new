import { Request, Response } from 'express';
import { UserNote, IUserNote } from '../models/UserNote';
import { AuthenticatedRequest } from '../types/auth';

export class UserNoteController {
  // Get notes for a specific RUT
  static async getNotesByRut(req: AuthenticatedRequest, res: Response) {
    try {
      const { rut } = req.params;
      const tenantId = req.tenantId;

      if (!tenantId) {
        return res.status(400).json({ error: 'Tenant ID is required' });
      }

      const notes = await UserNote.find({ rut, tenantId })
        .populate('userId', 'firstName lastName email')
        .sort({ createdAt: -1 });

      res.json(notes);
    } catch (error) {
      console.error('Error fetching notes by RUT:', error);
      res.status(500).json({ error: 'Failed to fetch notes' });
    }
  }

  // Create a new note
  static async createNote(req: AuthenticatedRequest, res: Response) {
    try {
      const { rut, note, tags = [] } = req.body;
      const userId = req.user?.id;
      const tenantId = req.tenantId;

      if (!userId || !tenantId) {
        return res.status(400).json({ error: 'User ID and Tenant ID are required' });
      }

      if (!rut || !note) {
        return res.status(400).json({ error: 'RUT and note are required' });
      }

      if (note.length > 2000) {
        return res.status(400).json({ error: 'Note cannot exceed 2000 characters' });
      }

      if (tags.length > 10) {
        return res.status(400).json({ error: 'Cannot have more than 10 tags' });
      }

      const newNote = new UserNote({
        userId,
        tenantId,
        rut: rut.trim(),
        note: note.trim(),
        tags: tags.map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0)
      });

      await newNote.save();
      
      // Populate user info before returning
      await newNote.populate('userId', 'firstName lastName email');

      res.status(201).json(newNote);
    } catch (error) {
      console.error('Error creating note:', error);
      res.status(500).json({ error: 'Failed to create note' });
    }
  }

  // Update a note
  static async updateNote(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const { note, tags = [] } = req.body;
      const userId = req.user?.id;
      const tenantId = req.tenantId;

      if (!note) {
        return res.status(400).json({ error: 'Note is required' });
      }

      if (note.length > 2000) {
        return res.status(400).json({ error: 'Note cannot exceed 2000 characters' });
      }

      if (tags.length > 10) {
        return res.status(400).json({ error: 'Cannot have more than 10 tags' });
      }

      const existingNote = await UserNote.findOne({ 
        _id: id, 
        userId, 
        tenantId 
      });

      if (!existingNote) {
        return res.status(404).json({ error: 'Note not found or unauthorized' });
      }

      existingNote.note = note.trim();
      existingNote.tags = tags.map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0);
      await existingNote.save();
      
      // Populate user info before returning
      await existingNote.populate('userId', 'firstName lastName email');

      res.json(existingNote);
    } catch (error) {
      console.error('Error updating note:', error);
      res.status(500).json({ error: 'Failed to update note' });
    }
  }

  // Delete a note
  static async deleteNote(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const tenantId = req.tenantId;

      const deletedNote = await UserNote.findOneAndDelete({ 
        _id: id, 
        userId, 
        tenantId 
      });

      if (!deletedNote) {
        return res.status(404).json({ error: 'Note not found or unauthorized' });
      }

      res.json({ message: 'Note deleted successfully' });
    } catch (error) {
      console.error('Error deleting note:', error);
      res.status(500).json({ error: 'Failed to delete note' });
    }
  }

  // Get all notes by user
  static async getNotesByUser(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const tenantId = req.tenantId;
      const { page = 1, limit = 10 } = req.query;

      if (!userId || !tenantId) {
        return res.status(400).json({ error: 'User ID and Tenant ID are required' });
      }

      const skip = (Number(page) - 1) * Number(limit);
      
      const notes = await UserNote.find({ userId, tenantId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));

      const total = await UserNote.countDocuments({ userId, tenantId });

      res.json({
        notes,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      console.error('Error fetching user notes:', error);
      res.status(500).json({ error: 'Failed to fetch user notes' });
    }
  }
}