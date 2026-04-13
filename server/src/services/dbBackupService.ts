import cron from 'node-cron';
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import ELKService from './elkService';

export class DbBackupService {
  private static instance: DbBackupService;
  private cronJob: cron.ScheduledTask | null = null;
  private isInitialized = false;
  private isRunning = false;

  private constructor() {}

  public static getInstance(): DbBackupService {
    if (!DbBackupService.instance) {
      DbBackupService.instance = new DbBackupService();
    }
    return DbBackupService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      ELKService.info('[DbBackupService] Already initialized');
      return;
    }

    const rawEnabled = process.env.DB_BACKUP_ENABLED;
    const enabled = typeof rawEnabled === 'string' && rawEnabled.toLowerCase() === 'true';
    if (!enabled) {
      this.isInitialized = true;
      ELKService.info('[DbBackupService] Disabled (DB_BACKUP_ENABLED not set to true)');
      return;
    }

    const schedule = process.env.DB_BACKUP_CRON || '0 2 * * *';
    const timezone = process.env.DB_BACKUP_TIMEZONE || 'UTC';

    this.cronJob = cron.schedule(schedule, async () => {
      await this.runBackup();
    }, { scheduled: false, timezone });

    this.cronJob.start();
    this.isInitialized = true;

    ELKService.info('[DbBackupService] Initialized');
    ELKService.logBusinessEvent('db_backup_service_initialized', { schedule, timezone });
  }

  private getBackupDir(): string {
    return process.env.DB_BACKUP_DIR || path.resolve(process.cwd(), 'backups');
  }

  private getRetentionDays(): number {
    const v = parseInt(process.env.DB_BACKUP_RETENTION_DAYS || '7', 10);
    return Number.isFinite(v) && v > 0 ? v : 7;
  }

  private async runBackup(): Promise<void> {
    if (this.isRunning) {
      ELKService.warn('[DbBackupService] Backup already running, skipping');
      return;
    }
    this.isRunning = true;

    const startedAt = Date.now();
    try {
      const uri = process.env.MONGODB_URI;
      if (!uri) {
        ELKService.error('[DbBackupService] Missing MONGODB_URI, cannot run backup', new Error('MONGODB_URI is not set'));
        return;
      }

      const backupDir = this.getBackupDir();
      await fs.mkdir(backupDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(backupDir, `mongo-backup-${timestamp}.archive.gz`);

      await this.runMongodump(uri, backupFile);
      const { deletedCount } = await this.applyRetention(backupDir, this.getRetentionDays());

      ELKService.info('[DbBackupService] Backup completed', {
        backupFile: path.basename(backupFile),
        retentionDays: this.getRetentionDays(),
        deletedCount,
        durationMs: Date.now() - startedAt
      });
      ELKService.logBusinessEvent('db_backup_completed', {
        backupFile: path.basename(backupFile),
        retentionDays: this.getRetentionDays(),
        deletedCount
      });
    } catch (error) {
      ELKService.error('[DbBackupService] Backup failed', error as Error);
      ELKService.logBusinessEvent('db_backup_failed', { message: (error as Error)?.message || 'Unknown error' });
    } finally {
      this.isRunning = false;
    }
  }

  private async runMongodump(mongoUri: string, archivePath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('mongodump', [`--uri=${mongoUri}`, `--archive=${archivePath}`, '--gzip'], {
        stdio: ['ignore', 'ignore', 'pipe']
      });

      let stderr = '';
      child.stderr.on('data', chunk => {
        stderr += chunk?.toString?.() || '';
        if (stderr.length > 20000) stderr = stderr.slice(-20000);
      });

      child.on('error', err => reject(err));
      child.on('close', code => {
        if (code === 0) return resolve();
        reject(new Error(`mongodump exited with code ${code}${stderr ? `: ${stderr}` : ''}`));
      });
    });
  }

  private async applyRetention(backupDir: string, retentionDays: number): Promise<{ deletedCount: number }> {
    const now = Date.now();
    const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
    const files = await fs.readdir(backupDir);
    let deletedCount = 0;

    for (const f of files) {
      if (!f.startsWith('mongo-backup-') || !f.endsWith('.archive.gz')) continue;
      const full = path.join(backupDir, f);
      try {
        const st = await fs.stat(full);
        const ageMs = now - st.mtimeMs;
        if (ageMs > maxAgeMs) {
          await fs.unlink(full);
          deletedCount += 1;
        }
      } catch {
      }
    }

    return { deletedCount };
  }
}
