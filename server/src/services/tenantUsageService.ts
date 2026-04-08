import { Tenant } from '../models/tenant.model';
import { CreditOperation } from '../models/creditOperation.model';
import { EvaluationResult } from '../models/evaluation';
import cron from 'node-cron';
import ELKService from './elkService';

export class TenantUsageService {
  private static instance: TenantUsageService;
  private cronJob: cron.ScheduledTask | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): TenantUsageService {
    if (!TenantUsageService.instance) {
      TenantUsageService.instance = new TenantUsageService();
    }
    return TenantUsageService.instance;
  }

  /**
   * Initialize the tenant usage service with hourly cron job
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      ELKService.info('[TenantUsageService] Already initialized');
      return;
    }

    ELKService.info('[TenantUsageService] Initializing tenant usage service...');

    // Schedule the update to run every hour at minute 0
    this.cronJob = cron.schedule('0 * * * *', async () => {
      await this.updateAllTenantUsageStats();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    this.cronJob.start();
    this.isInitialized = true;
    
    ELKService.info('[TenantUsageService] Tenant usage service initialized - will run every hour');
    ELKService.logBusinessEvent('tenant_usage_service_initialized', { 
      schedule: 'hourly',
      timezone: 'UTC'
    });
  }

  /**
   * Update usage statistics for all tenants
   */
  public async updateAllTenantUsageStats(): Promise<void> {
    try {
      ELKService.info('[TenantUsageService] Starting tenant usage stats update...');
      
      const tenants = await Tenant.find({});
      let updatedCount = 0;
      let errorCount = 0;

      for (const tenant of tenants) {
        try {
          const wasUpdated = await this.updateTenantUsageStats(tenant._id.toString());
          if (wasUpdated) {
            updatedCount++;
          }
        } catch (error) {
          errorCount++;
          ELKService.error(`[TenantUsageService] Failed to update tenant ${tenant._id}`, error as Error);
        }
      }

      ELKService.info(`[TenantUsageService] Completed tenant usage stats update`, {
        totalTenants: tenants.length,
        updatedTenants: updatedCount,
        errors: errorCount
      });

      ELKService.logBusinessEvent('tenant_usage_stats_updated', {
        totalTenants: tenants.length,
        updatedTenants: updatedCount,
        errors: errorCount,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      ELKService.error('[TenantUsageService] Failed to update tenant usage stats', error as Error);
    }
  }

  /**
   * Update usage statistics for a specific tenant
   */
  public async updateTenantUsageStats(tenantId: string): Promise<boolean> {
    try {
      // Count credit operations for this tenant
      const creditOperationsCount = await CreditOperation.countDocuments({
        tenantId: tenantId,
        type: 'evaluation'
      });

      // Count evaluation results for this tenant
      const evaluationResultsCount = await EvaluationResult.countDocuments({
        tenantId: tenantId
      });

      // Use the higher count between credit operations and evaluation results
      const evaluationsUsed = Math.max(creditOperationsCount, evaluationResultsCount);

      // Get the tenant to check current values and calculate remaining
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        ELKService.warn(`[TenantUsageService] Tenant ${tenantId} not found`);
        return false;
      }

      // Get current values
      const currentUsed = tenant.usageStats?.evaluationsUsed || 0;
      const currentRemaining = tenant.usageStats?.evaluationsRemaining || 100;
      const totalEvaluations = currentRemaining + currentUsed;
      
      // Calculate new remaining evaluations
      const evaluationsRemaining = Math.max(0, totalEvaluations - evaluationsUsed);

      // Get the most recent evaluation date
      const lastEvaluationResult = await EvaluationResult.findOne(
        { tenantId: tenantId },
        {},
        { sort: { createdAt: -1 } }
      );
      const lastEvaluationDate = lastEvaluationResult?.createdAt || tenant.usageStats?.lastEvaluationDate;

      // Check if update is needed
      
      if (currentUsed === evaluationsUsed && currentRemaining === evaluationsRemaining) {
        // No update needed
        return false;
      }

      // Update tenant usage stats
      const updateResult = await Tenant.findByIdAndUpdate(
        tenantId,
        {
          $set: {
            'usageStats.evaluationsUsed': evaluationsUsed,
            'usageStats.evaluationsRemaining': evaluationsRemaining,
            'usageStats.lastEvaluationDate': lastEvaluationDate,
            updatedAt: new Date()
          }
        },
        { new: true }
      );

      if (updateResult) {
        ELKService.info(`[TenantUsageService] Updated tenant ${tenantId}`, {
          tenantId,
          evaluationsUsed,
          evaluationsRemaining,
          creditOperationsCount,
          evaluationResultsCount
        });
        return true;
      }

      return false;
    } catch (error) {
      ELKService.error(`[TenantUsageService] Error updating tenant ${tenantId}`, error as Error);
      throw error;
    }
  }

  /**
   * Manually trigger an update for all tenants (useful for testing or manual sync)
   */
  public async manualUpdate(): Promise<{ success: boolean; message: string; stats?: any }> {
    try {
      await this.updateAllTenantUsageStats();
      return {
        success: true,
        message: 'Tenant usage stats updated successfully'
      };
    } catch (error) {
      ELKService.error('[TenantUsageService] Manual update failed', error as Error);
      return {
        success: false,
        message: `Update failed: ${(error as Error).message}`
      };
    }
  }

  /**
   * Get the current status of the service
   */
  public getStatus(): { isInitialized: boolean; isRunning: boolean; nextRun?: string } {
    return {
      isInitialized: this.isInitialized,
      isRunning: this.cronJob ? true : false,
      nextRun: this.cronJob ? 'Every hour at minute 0' : undefined
    };
  }

  /**
   * Stop the service
   */
  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    this.isInitialized = false;
    ELKService.info('[TenantUsageService] Service stopped');
  }

  /**
   * Restart the service
   */
  public async restart(): Promise<void> {
    this.stop();
    await this.initialize();
  }
}

export default TenantUsageService;