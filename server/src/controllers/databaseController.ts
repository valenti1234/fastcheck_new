import { Request, Response } from 'express';
import { databaseService } from '../services/databaseService';
import { ConsultaHistoryService } from '../services/consultaHistoryService';

export class DatabaseController {
  // Get database statistics
  async getStats(req: Request, res: Response) {
    try {
      const stats = await databaseService.getDatabaseStats();
      res.json(stats);
    } catch (error) {
      console.error('Error getting database stats:', error);
      res.status(500).json({ error: 'Failed to get database statistics' });
    }
  }

  // Create database backup
  async createBackup(req: Request, res: Response) {
    try {
      const operationId = await databaseService.createBackup();
      res.json({ operationId, message: 'Backup started' });
    } catch (error) {
      console.error('Error creating backup:', error);
      res.status(500).json({ error: 'Failed to create backup' });
    }
  }

  async restore(req: Request, res: Response) {
    try {
      const body: any = req.body || {};
      const backupName = String(body.backupName || body.backup || '').trim();
      if (!backupName) {
        return res.status(400).json({ error: 'backupName is required' });
      }

      const mode = body.mode === 'upsert' ? 'upsert' : 'dropAndInsert';
      const collections = Array.isArray(body.collections) ? body.collections.map((v: any) => String(v)) : undefined;

      const operationId = await databaseService.restoreBackup(backupName, { mode, collections });
      res.json({ operationId, message: 'Restore started' });
    } catch (error) {
      console.error('Error restoring backup:', error);
      res.status(500).json({ error: 'Failed to restore backup' });
    }
  }

  async backfillConsultaHistory(req: Request, res: Response) {
    try {
      const body: any = req.body || {};
      const backupOperationId = await databaseService.createBackup();

      const backfill = await ConsultaHistoryService.backfillMassiveConsultas({
        tenantId: body.tenantId,
        since: body.since ? new Date(body.since) : undefined,
        until: body.until ? new Date(body.until) : undefined,
        dryRun: Boolean(body.dryRun),
        maxJobs: typeof body.maxJobs === 'number' ? body.maxJobs : undefined,
        maxRutsPerConsulta: typeof body.maxRutsPerConsulta === 'number' ? body.maxRutsPerConsulta : undefined
      });

      res.json({ backupOperationId, backfill });
    } catch (error) {
      console.error('Error backfilling consulta history:', error);
      res.status(500).json({ error: 'Failed to backfill consulta history' });
    }
  }

  // Clean up database
  async cleanup(req: Request, res: Response) {
    try {
      const { collectionName } = req.body;
      const operationId = await databaseService.cleanupDatabase(collectionName);
      res.json({ operationId, message: 'Cleanup started' });
    } catch (error) {
      console.error('Error cleaning up database:', error);
      res.status(500).json({ error: 'Failed to cleanup database' });
    }
  }

  // Reindex collections
  async reindex(req: Request, res: Response) {
    try {
      const { collectionName } = req.body;
      const operationId = await databaseService.reindexCollection(collectionName);
      res.json({ operationId, message: 'Reindexing started' });
    } catch (error) {
      console.error('Error reindexing collections:', error);
      res.status(500).json({ error: 'Failed to reindex collections' });
    }
  }

  // Get operation status
  async getOperationStatus(req: Request, res: Response) {
    try {
      const { operationId } = req.params;
      const status = databaseService.getOperation(operationId);
      
      if (!status) {
        return res.status(404).json({ error: 'Operation not found' });
      }
      
      res.json(status);
    } catch (error) {
      console.error('Error getting operation status:', error);
      res.status(500).json({ error: 'Failed to get operation status' });
    }
  }

  // Get recent operations
  async getRecentOperations(req: Request, res: Response) {
    try {
      const operations = databaseService.getOperations();
      res.json(operations);
    } catch (error) {
      console.error('Error getting recent operations:', error);
      res.status(500).json({ error: 'Failed to get recent operations' });
    }
  }
}
