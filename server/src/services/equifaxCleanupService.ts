import cron from 'node-cron';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import ELKService from './elkService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class EquifaxCleanupService {
  private static instance: EquifaxCleanupService;
  private cronJob: cron.ScheduledTask | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): EquifaxCleanupService {
    if (!EquifaxCleanupService.instance) {
      EquifaxCleanupService.instance = new EquifaxCleanupService();
    }
    return EquifaxCleanupService.instance;
  } 

  public async initialize(): Promise<void> { 
    if (this.isInitialized) {
      ELKService.info('[EquifaxCleanupService] Already initialized');
      return;
    }

    ELKService.info('[EquifaxCleanupService] Initializing cleanup service...');

    this.cronJob = cron.schedule('*/30 * * * *', async () => {
      await this.cleanupOldResponses();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    this.cronJob.start();
    this.isInitialized = true;

    ELKService.logBusinessEvent('equifax_cleanup_service_initialized', {
      schedule: 'every_30_minutes',
      timezone: 'UTC'
    });

    // Run an immediate cleanup on service start
    try {
      ELKService.info('[EquifaxCleanupService] Running immediate cleanup after initialization');
      await this.cleanupOldResponses();
    } catch (error) {
      ELKService.error('[EquifaxCleanupService] Immediate cleanup failed', error as Error);
    }
  }

  public async cleanupOldResponses(): Promise<void> {
    const directories = [
      path.resolve(__dirname, '../../equifax_responses'),
      path.resolve(__dirname, '../../json_data')
    ];
    const now = Date.now();
    const ttlMs = 24 * 60 * 60 * 1000;

    for (const dir of directories) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        let deleted = 0;
        let scanned = 0;

        for (const entry of entries) {
          if (!entry.isFile()) continue;
          if (!entry.name.toLowerCase().endsWith('.json')) continue;
          scanned++;
          const filePath = path.join(dir, entry.name);
          try {
            const stat = await fs.stat(filePath);
            if ((now - stat.mtimeMs) > ttlMs) {
              await fs.unlink(filePath);
              deleted++;
            }
          } catch (e) {
            ELKService.error('[EquifaxCleanupService] Error processing file', e as Error);
          }
        }

        ELKService.info('[EquifaxCleanupService] Cleanup run completed', {
          directory: dir,
          scanned,
          deleted
        });
        ELKService.logBusinessEvent('equifax_cleanup_run_completed', {
          directory: dir,
          scanned,
          deleted,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        ELKService.error('[EquifaxCleanupService] Cleanup run failed', error as Error);
      }
    }
  }

  public getStatus(): { isInitialized: boolean; isRunning: boolean; nextRun?: string } {
    return {
      isInitialized: this.isInitialized,
      isRunning: this.cronJob ? true : false,
      nextRun: this.cronJob ? 'Every 30 minutes' : undefined
    };
  }

  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    this.isInitialized = false;
    ELKService.info('[EquifaxCleanupService] Service stopped');
  }

  public async restart(): Promise<void> {
    this.stop();
    await this.initialize();
  }
}

export default EquifaxCleanupService;
