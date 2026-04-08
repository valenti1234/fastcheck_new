import mongoose from 'mongoose';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { createWriteStream, createReadStream } from 'fs';
import { finished } from 'stream/promises';
import zlib from 'zlib';
import * as readline from 'readline';

const execAsync = promisify(exec);

export interface DatabaseStats {
  collections: Array<{
    name: string;
    documentCount: number;
    avgObjSize: number;
    totalSize: number;
    indexes: number;
  }>;
  totalSize: string;
  totalDocuments: number;
  totalCollections: number;
  indexes: number;
  connectionInfo: {
    host: string;
    port: number;
    database: string;
    status: 'connected' | 'disconnected' | 'error';
  };
}

export interface DatabaseOperation {
  id: string;
  type: 'backup' | 'restore' | 'cleanup' | 'reindex';
  status: 'running' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  message?: string;
  progress?: number;
}

class DatabaseService {
  private operations: Map<string, DatabaseOperation> = new Map();

  async getDatabaseStats(): Promise<DatabaseStats> {
    try {
      const db = mongoose.connection.db;
      if (!db) {
        throw new Error('Database connection not available');
      }

      // Get database stats
      const dbStats = await db.stats();
      
      // Get collections info
      const collections = await db.listCollections().toArray();
      const collectionsStats = [];

      for (const collection of collections) {
        try {
          const collectionStats = await db.collection(collection.name).stats();
          const indexCount = await db.collection(collection.name).indexes();
          
          collectionsStats.push({
            name: collection.name,
            documentCount: collectionStats.count || 0,
            avgObjSize: collectionStats.avgObjSize || 0,
            totalSize: collectionStats.size || 0,
            indexes: indexCount.length || 0
          });
        } catch (error) {
          console.error(`Error getting stats for collection ${collection.name}:`, error);
          collectionsStats.push({
            name: collection.name,
            documentCount: 0,
            avgObjSize: 0,
            totalSize: 0,
            indexes: 0
          });
        }
      }

      // Calculate totals
      const totalDocuments = collectionsStats.reduce((sum, col) => sum + col.documentCount, 0);
      const totalIndexes = collectionsStats.reduce((sum, col) => sum + col.indexes, 0);

      // Get connection info
      const connectionInfo = {
        host: mongoose.connection.host || 'localhost',
        port: mongoose.connection.port || 27017,
        database: mongoose.connection.name || 'unknown',
        status: mongoose.connection.readyState === 1 ? 'connected' as const : 
                mongoose.connection.readyState === 0 ? 'disconnected' as const : 'error' as const
      };

      return {
        collections: collectionsStats,
        totalSize: this.formatBytes(dbStats.dataSize || 0),
        totalDocuments,
        totalCollections: collections.length,
        indexes: totalIndexes,
        connectionInfo
      };
    } catch (error) {
      console.error('Error getting database stats:', error);
      throw new Error('Failed to retrieve database statistics');
    }
  }

  async createBackup(): Promise<string> {
    const operationId = this.generateOperationId();
    const operation: DatabaseOperation = {
      id: operationId,
      type: 'backup',
      status: 'running',
      startTime: new Date().toISOString(),
      progress: 0
    };

    this.operations.set(operationId, operation);

    try {
      const backupDir = path.join(process.cwd(), 'backups');
      await fs.mkdir(backupDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `backup-${timestamp}`);

      const mongoUri = process.env.VITE_MONGODB_URI || process.env.MONGODB_URI;
      if (!mongoUri) {
        throw new Error('MongoDB URI not configured');
      }

      const command = `mongodump --uri="${mongoUri}" --out="${backupPath}"`;

      try {
        operation.progress = 50;
        this.operations.set(operationId, operation);
        await execAsync(command);
      } catch (error) {
        const message = (error as any)?.message?.toString?.() || '';
        const stderr = (error as any)?.stderr?.toString?.() || '';
        const code = (error as any)?.code;
        const isMissingBinary =
          code === 127 || /mongodump(.+)?not found/i.test(message) || /mongodump(.+)?not found/i.test(stderr);

        if (!isMissingBinary) {
          throw error;
        }

        await fs.mkdir(backupPath, { recursive: true });
        await this.createLogicalBackup(backupPath, operationId);
      }

      operation.status = 'completed';
      operation.endTime = new Date().toISOString();
      operation.message = `Backup created successfully at ${backupPath}`;
      operation.progress = 100;
      this.operations.set(operationId, operation);

      return operationId;
    } catch (error) {
      operation.status = 'failed';
      operation.endTime = new Date().toISOString();
      operation.message = `Backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.operations.set(operationId, operation);
      throw error;
    }
  }

  async restoreBackup(
    backupName: string,
    options?: {
      mode?: 'dropAndInsert' | 'upsert';
      collections?: string[];
    }
  ): Promise<string> {
    const operationId = this.generateOperationId();
    const operation: DatabaseOperation = {
      id: operationId,
      type: 'restore',
      status: 'running',
      startTime: new Date().toISOString(),
      progress: 0
    };

    this.operations.set(operationId, operation);

    try {
      const db = mongoose.connection.db;
      if (!db) {
        throw new Error('Database connection not available');
      }

      const safeBackupName = this.sanitizeBackupName(backupName);
      const backupDir = path.join(process.cwd(), 'backups');
      const backupPath = path.join(backupDir, safeBackupName);

      const st = await fs.stat(backupPath);
      if (!st.isDirectory()) {
        throw new Error(`Backup path is not a directory: ${backupPath}`);
      }

      const entries = await fs.readdir(backupPath);
      const files = entries
        .filter(f => f.endsWith('.jsonl.gz'))
        .sort((a, b) => a.localeCompare(b));

      if (files.length === 0) {
        throw new Error(`No .jsonl.gz files found in backup directory: ${backupPath}`);
      }

      const selectedCollections = options?.collections?.length ? new Set(options.collections) : null;
      const mode = options?.mode || 'dropAndInsert';

      const totalFiles = Math.max(files.length, 1);
      let processedFiles = 0;

      for (const f of files) {
        const collectionName = f.replace(/\.jsonl\.gz$/, '');
        if (selectedCollections && !selectedCollections.has(collectionName)) continue;

        const filePath = path.join(backupPath, f);
        const collection = db.collection(collectionName);

        if (mode === 'dropAndInsert') {
          await collection.deleteMany({});
        }

              await this.restoreJsonlGzFileToCollection(filePath, collectionName, collection, mode);

        processedFiles += 1;
        operation.progress = Math.min(99, Math.round((processedFiles / totalFiles) * 99));
        this.operations.set(operationId, operation);
      }

      operation.status = 'completed';
      operation.endTime = new Date().toISOString();
      operation.message = `Restore completed successfully from ${safeBackupName}`;
      operation.progress = 100;
      this.operations.set(operationId, operation);

      return operationId;
    } catch (error) {
      operation.status = 'failed';
      operation.endTime = new Date().toISOString();
      operation.message = `Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.operations.set(operationId, operation);
      throw error;
    }
  }

  private async createLogicalBackup(backupPath: string, operationId: string): Promise<void> {
    const operation = this.operations.get(operationId);
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not available');
    }

    const collections = await db.listCollections().toArray();
    const total = Math.max(collections.length, 1);

    for (let i = 0; i < collections.length; i++) {
      const name = collections[i].name;
      const filePath = path.join(backupPath, `${name}.jsonl.gz`);

      const collection = db.collection(name);
      const cursor = collection.find({});
      const gzip = zlib.createGzip();
      const out = createWriteStream(filePath);
      gzip.pipe(out);

      for await (const doc of cursor as any) {
        gzip.write(`${JSON.stringify(doc)}\n`);
      }

      gzip.end();
      await finished(out);

      if (operation) {
        operation.progress = Math.min(99, Math.round(((i + 1) / total) * 99));
        this.operations.set(operationId, operation);
      }
    }
  }

  async cleanupDatabase(collectionName?: string): Promise<string> {
    const operationId = this.generateOperationId();
    const operation: DatabaseOperation = {
      id: operationId,
      type: 'cleanup',
      status: 'running',
      startTime: new Date().toISOString(),
      progress: 0
    };

    this.operations.set(operationId, operation);

    try {
      const db = mongoose.connection.db;
      if (!db) {
        throw new Error('Database connection not available');
      }

      if (collectionName) {
        // Clean specific collection
        await this.cleanupCollection(db, collectionName);
        operation.message = `Cleanup completed for collection: ${collectionName}`;
      } else {
        // Clean all collections
        const collections = await db.listCollections().toArray();
        const totalCollections = collections.length;
        
        for (let i = 0; i < collections.length; i++) {
          await this.cleanupCollection(db, collections[i].name);
          operation.progress = Math.round(((i + 1) / totalCollections) * 100);
          this.operations.set(operationId, operation);
        }
        operation.message = `Cleanup completed for all collections`;
      }

      operation.status = 'completed';
      operation.endTime = new Date().toISOString();
      operation.progress = 100;
      this.operations.set(operationId, operation);

      return operationId;
    } catch (error) {
      operation.status = 'failed';
      operation.endTime = new Date().toISOString();
      operation.message = `Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.operations.set(operationId, operation);
      throw error;
    }
  }

  async reindexCollection(collectionName?: string): Promise<string> {
    const operationId = this.generateOperationId();
    const operation: DatabaseOperation = {
      id: operationId,
      type: 'reindex',
      status: 'running',
      startTime: new Date().toISOString(),
      progress: 0
    };

    this.operations.set(operationId, operation);

    try {
      const db = mongoose.connection.db;
      if (!db) {
        throw new Error('Database connection not available');
      }

      if (collectionName) {
        // Reindex specific collection
        await db.command({ reIndex: collectionName });
        operation.message = `Reindexing completed for collection: ${collectionName}`;
      } else {
        // Reindex all collections
        const collections = await db.listCollections().toArray();
        const totalCollections = collections.length;
        
        for (let i = 0; i < collections.length; i++) {
          try {
            await db.command({ reIndex: collections[i].name });
          } catch (error) {
            console.error(`Error reindexing collection ${collections[i].name}:`, error);
          }
          operation.progress = Math.round(((i + 1) / totalCollections) * 100);
          this.operations.set(operationId, operation);
        }
        operation.message = `Reindexing completed for all collections`;
      }

      operation.status = 'completed';
      operation.endTime = new Date().toISOString();
      operation.progress = 100;
      this.operations.set(operationId, operation);

      return operationId;
    } catch (error) {
      operation.status = 'failed';
      operation.endTime = new Date().toISOString();
      operation.message = `Reindexing failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.operations.set(operationId, operation);
      throw error;
    }
  }

  getOperations(): DatabaseOperation[] {
    return Array.from(this.operations.values()).sort((a, b) => 
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
  }

  getOperation(operationId: string): DatabaseOperation | undefined {
    return this.operations.get(operationId);
  }

  private async cleanupCollection(db: any, collectionName: string): Promise<void> {
    try {
      // Example cleanup operations - customize based on your needs
      const collection = db.collection(collectionName);
      
      // Remove documents older than 1 year (example)
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      
      // Only cleanup if the collection has a createdAt field
      const sampleDoc = await collection.findOne({});
      if (sampleDoc && sampleDoc.createdAt) {
        const result = await collection.deleteMany({
          createdAt: { $lt: oneYearAgo }
        });
        console.log(`Cleaned up ${result.deletedCount} old documents from ${collectionName}`);
      }
      
      // Compact collection
      await db.runCommand({ compact: collectionName });
    } catch (error) {
      console.error(`Error cleaning up collection ${collectionName}:`, error);
      // Don't throw error for individual collection cleanup failures
    }
  }

  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sanitizeBackupName(backupName: string): string {
    const trimmed = (backupName || '').trim();
    if (!trimmed) throw new Error('backupName is required');
    if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
      throw new Error('Invalid backupName');
    }
    return trimmed;
  }

  private normalizeMongoId(value: unknown): unknown {
    if (typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) {
      return new mongoose.Types.ObjectId(value);
    }
    if (value && typeof value === 'object' && '$oid' in (value as any) && typeof (value as any).$oid === 'string') {
      const oid = (value as any).$oid as string;
      if (/^[0-9a-fA-F]{24}$/.test(oid)) {
        return new mongoose.Types.ObjectId(oid);
      }
    }
    return value;
  }

  private restoreSchemaCache = new Map<string, { shouldNormalizeId: boolean; objectIdPaths: string[] }>();

  private getRestoreSchemaForCollection(collectionName: string): { shouldNormalizeId: boolean; objectIdPaths: string[] } {
    const cached = this.restoreSchemaCache.get(collectionName);
    if (cached) return cached;

    const models = Object.values(mongoose.models || {});
    const modelForCollection = models.find(m => (m as any)?.collection?.name === collectionName) as any | undefined;
    const schema = modelForCollection?.schema as mongoose.Schema | undefined;

    const objectIdPaths: string[] = [];
    let shouldNormalizeId = true;

    if (schema) {
      const idPath: any = (schema as any).path('_id');
      if (idPath && typeof idPath.instance === 'string' && idPath.instance.toLowerCase() === 'string') {
        shouldNormalizeId = false;
      }

      const paths = (schema as any).paths || {};
      for (const [pathName, schemaType] of Object.entries(paths)) {
        if (pathName === '_id') continue;
        const st: any = schemaType;
        const instance = typeof st?.instance === 'string' ? st.instance : '';
        if (instance === 'ObjectId') {
          objectIdPaths.push(pathName);
          continue;
        }
        if (instance === 'Array' && st?.caster?.instance === 'ObjectId') {
          objectIdPaths.push(pathName);
        }
      }
    }

    const resolved = { shouldNormalizeId, objectIdPaths };
    this.restoreSchemaCache.set(collectionName, resolved);
    return resolved;
  }

  private applyObjectIdNormalizationAtPath(root: any, path: string): void {
    const parts = path.split('.').filter(Boolean);
    if (!root || parts.length === 0) return;

    const recur = (obj: any, idx: number) => {
      if (obj == null) return;
      if (idx >= parts.length) return;

      const key = parts[idx];
      if (Array.isArray(obj)) {
        for (const el of obj) recur(el, idx);
        return;
      }

      if (typeof obj !== 'object') return;
      if (!(key in obj)) return;

      if (idx === parts.length - 1) {
        const current = obj[key];
        if (Array.isArray(current)) {
          obj[key] = current.map(v => this.normalizeMongoId(v));
        } else {
          obj[key] = this.normalizeMongoId(current);
        }
        return;
      }

      recur(obj[key], idx + 1);
    };

    recur(root, 0);
  }

  private async restoreJsonlGzFileToCollection(
    filePath: string,
    collectionName: string,
    collection: any,
    mode: 'dropAndInsert' | 'upsert'
  ): Promise<void> {
    const BATCH_SIZE = 1000;

    const input = createReadStream(filePath);
    const gunzip = zlib.createGunzip();

    const rl = readline.createInterface({
      input: input.pipe(gunzip),
      crlfDelay: Infinity
    });

    let batch: any[] = [];

    const flush = async () => {
      if (batch.length === 0) return;

      const docs = batch;
      batch = [];

      if (mode === 'dropAndInsert') {
        await collection.insertMany(docs, { ordered: false });
        return;
      }

      const ops = docs
        .filter(d => d && d._id != null)
        .map((doc: any) => ({
          replaceOne: {
            filter: { _id: doc._id },
            replacement: doc,
            upsert: true
          }
        }));

      if (ops.length > 0) {
        await collection.bulkWrite(ops, { ordered: false });
      }
    };

    for await (const line of rl) {
      const trimmed = (line || '').trim();
      if (!trimmed) continue;

      const parsed = JSON.parse(trimmed);
      const doc = parsed && typeof parsed === 'object' ? parsed : parsed;

      const schemaInfo = this.getRestoreSchemaForCollection(collectionName);
      if (doc && typeof doc === 'object') {
        if (schemaInfo.shouldNormalizeId && '_id' in (doc as any)) {
          (doc as any)._id = this.normalizeMongoId((doc as any)._id);
        }
        for (const p of schemaInfo.objectIdPaths) {
          this.applyObjectIdNormalizationAtPath(doc, p);
        }
      }
      batch.push(doc);

      if (batch.length >= BATCH_SIZE) {
        await flush();
      }
    }

    await flush();
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export const databaseService = new DatabaseService();
