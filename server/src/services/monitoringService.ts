import { MonitoringSchedule, IMonitoringSchedule } from '../models/MonitoringSchedule';
import { MonitoringExecution, IMonitoringExecution } from '../models/MonitoringExecution';
import { RiskChangeNotification } from '../models/RiskChangeNotification';
import { SheriffService } from './sheriffService';
import { RutController } from '../controllers/rutController';
import { NotificationService } from './notificationService';
import cron from 'node-cron';
import { Request, Response } from 'express';

export class MonitoringService {
  private static instance: MonitoringService;
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();
  private isInitialized = false;
  private notificationService: NotificationService;

  private constructor() {
    this.notificationService = NotificationService.getInstance();
  }

  public static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  /**
   * Initialize the monitoring service and start all active schedules
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[MonitoringService] Already initialized');
      return;
    }

    console.log('[MonitoringService] Initializing monitoring service...');

    // Start the main cron job that checks for due executions every minute
    const mainCronJob = cron.schedule('* * * * *', async () => {
      await this.checkAndExecuteDueMonitoring();
    }, {
      scheduled: false
    });

    this.cronJobs.set('main', mainCronJob);
    mainCronJob.start();

    this.isInitialized = true;
    console.log('[MonitoringService] Monitoring service initialized successfully');
  }

  /**
   * Create a new monitoring schedule
   */
  public async createMonitoringSchedule(data: {
    rut: string;
    tenantId: string;
    userId: string;
    companyName?: string;
    frequency: 'minute' | 'daily' | 'weekly' | 'monthly';
  }): Promise<IMonitoringSchedule> {
    console.log('[MonitoringService] createMonitoringSchedule - Starting:', {
      rut: data.rut,
      tenantId: data.tenantId,
      userId: data.userId,
      companyName: data.companyName,
      frequency: data.frequency
    });
    
    const { rut, tenantId, userId, companyName, frequency } = data;

    try {
      // Check if a schedule already exists for this RUT and tenant
      console.log('[MonitoringService] createMonitoringSchedule - Checking for existing schedule:', {
        rut,
        tenantId
      });
      
      const existingSchedule = await MonitoringSchedule.findOne({ rut, tenantId });
      if (existingSchedule) {
        console.log('[MonitoringService] createMonitoringSchedule - Schedule already exists:', {
          existingScheduleId: existingSchedule._id,
          rut,
          tenantId
        });
        throw new Error(`Monitoring schedule already exists for RUT ${rut} in this tenant`);
      }

      // Calculate next execution time
      const nextExecution = this.calculateNextExecution(frequency);
      console.log('[MonitoringService] createMonitoringSchedule - Calculated next execution:', {
        frequency,
        nextExecution
      });

      const schedule = new MonitoringSchedule({
        rut,
        tenantId,
        userId,
        companyName,
        frequency,
        nextExecution,
        isActive: true,
        executionCount: 0
      });

      await schedule.save();
      console.log('[MonitoringService] createMonitoringSchedule - Schedule created successfully:', {
        scheduleId: schedule._id,
        rut: schedule.rut,
        tenantId: schedule.tenantId,
        frequency: schedule.frequency,
        nextExecution: schedule.nextExecution,
        isActive: schedule.isActive
      });

      return schedule;
    } catch (error) {
      console.error('[MonitoringService] createMonitoringSchedule - Error:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        data
      });
      throw error;
    }
  }

  /**
   * Update an existing monitoring schedule
   */
  public async updateMonitoringSchedule(
    scheduleId: string,
    tenantId: string,
    updates: Partial<{
      frequency: 'minute' | 'daily' | 'weekly' | 'monthly';
      isActive: boolean;
      companyName: string;
      nextExecution: Date;
    }>
  ): Promise<IMonitoringSchedule | null> {
    
    const schedule = await MonitoringSchedule.findOne({ _id: scheduleId, tenantId });
    if (!schedule) {
      return null;
    }
     console.log(`[MonitoringService] found monitoring schedule ${scheduleId}`);

    // If frequency is being updated, recalculate next execution
    if (updates.frequency && updates.frequency !== schedule.frequency) {
      updates.nextExecution = this.calculateNextExecution(updates.frequency);
    }

    Object.assign(schedule, updates);
    await schedule.save();

    console.log(`[MonitoringService] Updated monitoring schedule ${scheduleId}`);
    return schedule;
  }

  /**
   * Delete a monitoring schedule
   */
  public async deleteMonitoringSchedule(scheduleId: string, tenantId: string): Promise<boolean> {
    const result = await MonitoringSchedule.deleteOne({ _id: scheduleId, tenantId });
    if (result.deletedCount > 0) {
      console.log(`[MonitoringService] Deleted monitoring schedule ${scheduleId}`);
      return true;
    }
    return false;
  }

  /**
   * Get all monitoring schedules for a tenant
   */
  public async getMonitoringSchedules(
    tenantId: string,
    page = 1,
    limit = 10,
    activeOnly = false
  ): Promise<{
    schedules: IMonitoringSchedule[];
    total: number;
    pages: number;
    currentPage: number;
  }> {
    console.log('[MonitoringService] getMonitoringSchedules - Starting:', {
      tenantId,
      page,
      limit,
      activeOnly,
      skip: (page - 1) * limit
    });
    
    const skip = (page - 1) * limit;
    const filter: any = { tenantId };
    
    if (activeOnly) {
      filter.isActive = true;
    }

    try {
      const [schedules, total] = await Promise.all([
        MonitoringSchedule.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        MonitoringSchedule.countDocuments(filter)
      ]);

      console.log('[MonitoringService] getMonitoringSchedules - Query results:', {
        tenantId,
        schedulesFound: schedules.length,
        totalCount: total,
        pages: Math.ceil(total / limit),
        currentPage: page,
        scheduleIds: schedules.map(s => s._id)
      });

      return {
        schedules: schedules as IMonitoringSchedule[],
        total,
        pages: Math.ceil(total / limit),
        currentPage: page
      };
    } catch (error) {
      console.error('[MonitoringService] getMonitoringSchedules - Error:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        tenantId,
        page,
        limit
      });
      throw error;
    }
  }

  /**
   * Get all monitoring schedules across all tenants (superuser only)
   */
  public async getAllMonitoringSchedules(
    page = 1,
    limit = 10,
    activeOnly = false
  ): Promise<{
    schedules: any[];
    total: number;
    pages: number;
    currentPage: number;
  }> {
    console.log('[MonitoringService] getAllMonitoringSchedules - Starting:', {
      page,
      limit,
      activeOnly,
      skip: (page - 1) * limit
    });
    
    const skip = (page - 1) * limit;
    const filter: any = {};
    
    if (activeOnly) {
      filter.isActive = true;
    }

    try {
      const [schedules, total] = await Promise.all([
        MonitoringSchedule.find(filter)
          .populate('tenantId', 'name')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        MonitoringSchedule.countDocuments(filter)
      ]);

      console.log('[MonitoringService] getAllMonitoringSchedules - Query results:', {
        schedulesFound: schedules.length,
        totalCount: total,
        pages: Math.ceil(total / limit),
        currentPage: page,
        scheduleIds: schedules.map(s => s._id)
      });

      return {
        schedules,
        total,
        pages: Math.ceil(total / limit),
        currentPage: page
      };
    } catch (error) {
      console.error('[MonitoringService] getAllMonitoringSchedules - Error:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        page,
        limit
      });
      throw error;
    }
  }

  /**
   * Get monitoring statistics by tenant (superuser only)
   */
  public async getMonitoringStatisticsByTenant(): Promise<{
    tenantStats: Array<{
      tenantId: string;
      tenantName: string;
      totalSchedules: number;
      activeSchedules: number;
      inactiveSchedules: number;
      totalExecutions: number;
      successfulExecutions: number;
      failedExecutions: number;
      lastExecution?: Date;
      nextExecution?: Date;
      averageExecutionsPerSchedule: number;
      schedulesByFrequency: {
        minute: number;
        daily: number;
        weekly: number;
        monthly: number;
      };
    }>;
    globalStats: {
      totalTenants: number;
      totalSchedules: number;
      totalActiveSchedules: number;
      totalExecutions: number;
      averageSchedulesPerTenant: number;
    };
  }> {
    console.log('[MonitoringService] getMonitoringStatisticsByTenant - Starting');

    try {
      // Get all schedules with tenant information
      const schedules = await MonitoringSchedule.find({})
        .populate('tenantId', 'name')
        .lean();

      console.log('[MonitoringService] getMonitoringStatisticsByTenant - Found schedules:', {
        totalSchedules: schedules.length
      });

      // Debug: Log the first few schedules to see the populate structure
      if (schedules.length > 0) {
        console.log('[MonitoringService] Sample schedule data:', {
          firstSchedule: {
            _id: schedules[0]._id,
            tenantId: schedules[0].tenantId,
            tenantIdType: typeof schedules[0].tenantId,
            tenantIdKeys: schedules[0].tenantId ? Object.keys(schedules[0].tenantId) : 'null'
          }
        });
      }

      // Group schedules by tenant and store tenant info
        const tenantGroups = new Map<string, {schedules: any[], tenantName: string}>();
        
        schedules.forEach((schedule, index) => {
          const tenant = schedule.tenantId as any;
          const tenantId = tenant?._id?.toString() || tenant?.toString() || 'unknown';
          const tenantName = tenant?.name || 'Unknown Tenant';
          
          // Debug: Log tenant data for first few schedules
          if (index < 3) {
            console.log(`[MonitoringService] Schedule ${index} tenant data:`, {
              tenant,
              tenantId,
              tenantName,
              tenantType: typeof tenant,
              tenantKeys: tenant ? Object.keys(tenant) : 'null'
            });
          }
          
          if (!tenantGroups.has(tenantId)) {
            tenantGroups.set(tenantId, {schedules: [], tenantName});
          }
          tenantGroups.get(tenantId)!.schedules.push(schedule);
        });

      // Calculate statistics for each tenant
      const tenantStats = Array.from(tenantGroups.entries()).map(([tenantId, tenantData]) => {
        const tenantSchedules = tenantData.schedules;
        const tenantName = tenantData.tenantName;
        
        const totalSchedules = tenantSchedules.length;
        const activeSchedules = tenantSchedules.filter(s => s.isActive).length;
        const inactiveSchedules = totalSchedules - activeSchedules;
        
        const totalExecutions = tenantSchedules.reduce((sum, s) => sum + (s.executionCount || 0), 0);
        const successfulExecutions = tenantSchedules.filter(s => s.lastExecutionStatus === 'success').length;
        const failedExecutions = tenantSchedules.filter(s => s.lastExecutionStatus === 'error').length;
        
        const lastExecutions = tenantSchedules
          .map(s => s.lastExecuted)
          .filter(date => date)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        
        const nextExecutions = tenantSchedules
          .map(s => s.nextExecution)
          .filter(date => date)
          .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

        const schedulesByFrequency = {
          minute: tenantSchedules.filter(s => s.frequency === 'minute').length,
          daily: tenantSchedules.filter(s => s.frequency === 'daily').length,
          weekly: tenantSchedules.filter(s => s.frequency === 'weekly').length,
          monthly: tenantSchedules.filter(s => s.frequency === 'monthly').length
        };

        return {
          tenantId,
          tenantName,
          totalSchedules,
          activeSchedules,
          inactiveSchedules,
          totalExecutions,
          successfulExecutions,
          failedExecutions,
          lastExecution: lastExecutions[0] ? new Date(lastExecutions[0]) : undefined,
          nextExecution: nextExecutions[0] ? new Date(nextExecutions[0]) : undefined,
          averageExecutionsPerSchedule: totalSchedules > 0 ? Math.round(totalExecutions / totalSchedules) : 0,
          schedulesByFrequency
        };
      });

      // Calculate global statistics
      const globalStats = {
        totalTenants: tenantGroups.size,
        totalSchedules: schedules.length,
        totalActiveSchedules: schedules.filter(s => s.isActive).length,
        totalExecutions: schedules.reduce((sum, s) => sum + (s.executionCount || 0), 0),
        averageSchedulesPerTenant: tenantGroups.size > 0 ? Math.round(schedules.length / tenantGroups.size) : 0
      };

      console.log('[MonitoringService] getMonitoringStatisticsByTenant - Calculated stats:', {
        tenantsCount: tenantStats.length,
        globalStats
      });

      return {
        tenantStats: tenantStats.sort((a, b) => b.totalSchedules - a.totalSchedules),
        globalStats
      };
    } catch (error) {
      console.error('[MonitoringService] getMonitoringStatisticsByTenant - Error:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Get a specific monitoring schedule
   */
  public async getMonitoringSchedule(scheduleId: string, tenantId: string): Promise<IMonitoringSchedule | null> {
    return await MonitoringSchedule.findOne({ _id: scheduleId, tenantId }).lean();
  }

  /**
   * Get monitoring schedule by RUT
   */
  public async getMonitoringScheduleByRut(rut: string, tenantId: string): Promise<IMonitoringSchedule | null> {
    console.log('[MonitoringService] getMonitoringScheduleByRut - Starting:', {
      rut,
      tenantId
    });
    
    try {
      const schedule = await MonitoringSchedule.findOne({ rut, tenantId }).lean();
      
      console.log('[MonitoringService] getMonitoringScheduleByRut - Query result:', {
        rut,
        tenantId,
        found: !!schedule,
        scheduleId: schedule?._id
      });
      
      return schedule as IMonitoringSchedule | null;
    } catch (error) {
      console.error('[MonitoringService] getMonitoringScheduleByRut - Error:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        rut,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Check for due monitoring executions and execute them
   */
  private async checkAndExecuteDueMonitoring(): Promise<void> {
    try {
      const now = new Date();
      const dueSchedules = await MonitoringSchedule.find({
        isActive: true,
        nextExecution: { $lte: now }
      });

      if (dueSchedules.length === 0) {
        return;
      }

      console.log(`[MonitoringService] Found ${dueSchedules.length}, existing monitoring schedules`);

      for (const schedule of dueSchedules) {
        await this.executeMonitoring(schedule);
      }
    } catch (error) {
      console.error('[MonitoringService] Error checking existing monitoring:', error);
    }
  }

  /**
   * Execute a monitoring schedule
   */
  private async executeMonitoring(schedule: IMonitoringSchedule): Promise<void> {
    let execution: IMonitoringExecution | null = null;
    
    try {
      console.log(`[MonitoringService] Executing monitoring for RUT ${schedule.rut}`);

      // Create execution record
      execution = await this.createMonitoringExecution(
        schedule._id.toString(),
        schedule.rut,
        schedule.tenantId.toString()
      );

      // Update status to pending
      schedule.lastExecutionStatus = 'pending';
      await schedule.save();

      // Add execution step
      execution.executionDetails.processingSteps = execution.executionDetails.processingSteps || [];
      execution.executionDetails.processingSteps.push({
        step: 'initialization',
        status: 'success',
        timestamp: new Date(),
        duration: 0,
        details: 'Monitoring execution started'
      });

      // Create mock request and response objects to call rutController.lookupRut
      const mockReq = {
        body: {
          rut: schedule.rut,
          isMonitoring: true
        },
        user: {
          tenant: schedule.tenantId
        }
      } as unknown as Request;

      let result: any = null;
      const mockRes = {
        status: (code: number) => ({
          json: (data: any) => {
            if (code === 200) {
              result = data;
            } else {
              throw new Error(`RutController returned status ${code}: ${JSON.stringify(data)}`);
            }
            return mockRes;
          }
        })
      } as unknown as Response;

      // Add execution step for data lookup
      const dataLookupStartTime = Date.now();
      execution.executionDetails.processingSteps.push({
        step: 'data_lookup',
        status: 'success',
        timestamp: new Date(),
        duration: 0,
        details: 'Fetching RUT data from Sheriff service'
      });

      console.log(226,"execute lookupRut",mockReq,mockRes);
      // Call the rutController.lookupRut method
      await RutController.lookupRut(mockReq, mockRes);

      if (!result) {
        throw new Error('No result returned from RutController.lookupRut');
      }

      // Update data lookup step duration
      const dataLookupDuration = Date.now() - dataLookupStartTime;
      execution.executionDetails.processingSteps[execution.executionDetails.processingSteps.length - 1].duration = dataLookupDuration;
      execution.executionDetails.processingSteps[execution.executionDetails.processingSteps.length - 1].details = 'RUT data fetched successfully';

      // Add risk assessment step
      execution.executionDetails.processingSteps.push({
        step: 'risk_assessment',
        status: 'success',
        timestamp: new Date(),
        duration: 0,
        details: 'Risk assessment completed'
      });

      // Update schedule with success
      schedule.lastExecuted = new Date();
      schedule.nextExecution = this.calculateNextExecution(schedule.frequency, schedule.lastExecuted);
      schedule.executionCount += 1;
      schedule.lastExecutionStatus = 'success';
      schedule.lastExecutionError = undefined;
      schedule.lastLogId = result._id?.toString();

      await schedule.save();

      // Update execution record with success
      execution.status = 'success';
      execution.completedAt = new Date();
      execution.duration = Date.now() - execution.startedAt.getTime();
      execution.riskAssessment = result.riskAssessment;
      execution.sheriffLogId = result._id;
      execution.executionDetails.responseData = result;
      await execution.save();

      console.log(`[MonitoringService] Successfully executed monitoring for RUT ${schedule.rut}`);
      const newRisk = result.riskAssessment;
      const previousRisk = result.previousRisk;

      // Compare previous risk with new risk
      if (previousRisk && newRisk) {
        const previousRiskSummary = previousRisk.riskSummary;
        const newRiskSummary = newRisk.riskSummary;
        
        // Use JSON.stringify for proper object comparison
        if (JSON.stringify(previousRiskSummary) !== JSON.stringify(newRiskSummary)) {
          console.log(`[MonitoringService] Risk change detected for RUT ${schedule.rut}:`);
          console.log(`  Previous risk: ${JSON.stringify(previousRiskSummary)}`);
          console.log(`  New risk: ${JSON.stringify(newRiskSummary)}`);
          
          // Save risk change notification to database and send notifications
          try {
            const notification = new RiskChangeNotification({
              rut: schedule.rut,
              tenantId: schedule.tenantId,
              scheduleId: schedule._id.toString(),
              companyName: schedule.companyName,
              previousRisk: previousRiskSummary,
              newRisk: newRiskSummary,
              changeDetectedAt: new Date(),
              notificationSent: false,
              notificationMethod: 'email'
            });
            
            await notification.save();
            console.log(`[MonitoringService] Risk change notification saved for RUT ${schedule.rut}`);
            
            // Send email notifications to tenant users
            await this.sendRiskChangeNotifications(notification);
            
          } catch (notificationError) {
            console.error(`[MonitoringService] Error saving risk change notification for RUT ${schedule.rut}:`, notificationError);
          }
        } else {
          console.log(`[MonitoringService] No risk change detected for RUT ${schedule.rut} (${JSON.stringify(newRiskSummary)})`);
        }
      } else {
        console.log(`[MonitoringService] Risk comparison skipped for RUT ${schedule.rut} - missing risk data`);
        console.log(`  Previous risk available: ${!!previousRisk}`);
        console.log(`  New risk available: ${!!newRisk}`);
      }
    } catch (error) {
      console.error(`[MonitoringService] Error executing monitoring for RUT ${schedule.rut}:`, error);

      // Update execution record with error
      if (execution) {
        execution.status = 'error';
        execution.completedAt = new Date();
        execution.duration = Date.now() - execution.startedAt.getTime();
        execution.error = error instanceof Error ? error.message : 'Unknown error';
        execution.errorDetails = {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        };
        
        // Add error step
        execution.executionDetails.processingSteps = execution.executionDetails.processingSteps || [];
        execution.executionDetails.processingSteps.push({
          step: 'error',
          status: 'error',
          timestamp: new Date(),
          duration: 0,
          details: `Execution failed: ${execution.error}`
        });
        
        await execution.save();
      }

      // Update schedule with error
      schedule.lastExecuted = new Date();
      schedule.nextExecution = this.calculateNextExecution(schedule.frequency, schedule.lastExecuted);
      schedule.executionCount += 1;
      schedule.lastExecutionStatus = 'error';
      schedule.lastExecutionError = error instanceof Error ? error.message : 'Unknown error';

      await schedule.save();
    }
  }

  /**
   * Calculate the next execution time based on frequency
   */
  private calculateNextExecution(frequency: 'minute' | 'daily' | 'weekly' | 'monthly', fromDate?: Date): Date {
    const baseDate = fromDate || new Date();
    const nextExecution = new Date(baseDate);

    switch (frequency) {
      case 'minute':
        nextExecution.setMinutes(nextExecution.getMinutes() + 1);
        break;
      case 'daily':
        nextExecution.setDate(nextExecution.getDate() + 1);
        break;
      case 'weekly':
        nextExecution.setDate(nextExecution.getDate() + 7);
        break;
      case 'monthly':
        nextExecution.setMonth(nextExecution.getMonth() + 1);
        break;
    }

    return nextExecution;
  }

  /**
   * Manually trigger a monitoring execution
   */
  public async triggerMonitoring(scheduleId: string, tenantId: string): Promise<void> {
    const schedule = await MonitoringSchedule.findOne({ _id: scheduleId, tenantId });
    if (!schedule) {
      throw new Error('Monitoring schedule not found');
    }

    if (!schedule.isActive) {
      throw new Error('Monitoring schedule is not active');
    }

    await this.executeMonitoring(schedule);
  }

  /**
   * Send risk change notifications to tenant users
   */
  private async sendRiskChangeNotifications(notification: any): Promise<void> {
    try {
      // Get tenant users' email addresses
      const recipientEmails = await this.notificationService.getTenantNotificationEmails(notification.tenantId);
      
      if (recipientEmails.length === 0) {
        console.warn(`[MonitoringService] No recipient emails found for tenant ${notification.tenantId}`);
        return;
      }

      console.log(`[MonitoringService] Sending risk change notifications to ${recipientEmails.length} recipients for RUT ${notification.rut}`);
      
      let notificationSent = false;
      let errorMessage = '';
      
      // Send notifications to all tenant users
      for (const email of recipientEmails) {
        try {
          const success = await this.notificationService.sendRiskChangeNotification(notification, email);
          if (success) {
            notificationSent = true;
            notification.recipientEmail = email; // Store the last successful email
          }
        } catch (emailError) {
          console.error(`[MonitoringService] Failed to send notification to ${email}:`, emailError);
          errorMessage += `Failed to send to ${email}: ${emailError}; `;
        }
      }
      
      // Update notification record
      notification.notificationSent = notificationSent;
      notification.notificationSentAt = notificationSent ? new Date() : undefined;
      notification.errorMessage = errorMessage || undefined;
      
      await notification.save();
      
      if (notificationSent) {
        console.log(`[MonitoringService] Risk change notifications sent successfully for RUT ${notification.rut}`);
      } else {
        console.error(`[MonitoringService] Failed to send any risk change notifications for RUT ${notification.rut}`);
      }
      
    } catch (error) {
      console.error(`[MonitoringService] Error sending risk change notifications for RUT ${notification.rut}:`, error);
      
      // Update notification record with error
      try {
        notification.notificationSent = false;
        notification.errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await notification.save();
      } catch (saveError) {
        console.error(`[MonitoringService] Error updating notification record:`, saveError);
      }
    }
  }

  /**
   * Manually send notifications for pending risk change notifications
   */
  public async processPendingNotifications(tenantId?: string): Promise<void> {
    try {
      const filter: any = { notificationSent: false };
      if (tenantId) {
        filter.tenantId = tenantId;
      }
      
      const pendingNotifications = await RiskChangeNotification.find(filter);
      
      console.log(`[MonitoringService] Processing ${pendingNotifications.length} pending notifications`);
      
      for (const notification of pendingNotifications) {
        await this.sendRiskChangeNotifications(notification);
      }
      
    } catch (error) {
      console.error('[MonitoringService] Error processing pending notifications:', error);
    }
  }

  /**
   * Get monitoring execution history for a schedule
   */
  public async getMonitoringExecutions(
    scheduleId: string,
    tenantId: string,
    page = 1,
    limit = 20
  ): Promise<{
    executions: IMonitoringExecution[];
    total: number;
    pages: number;
    currentPage: number;
  }> {
    try {
      const skip = (page - 1) * limit;
      
      const filter: any = { scheduleId };
      if (tenantId) {
        filter.tenantId = tenantId;
      }

      const [executions, total] = await Promise.all([
        MonitoringExecution.find(filter)
          .sort({ startedAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        MonitoringExecution.countDocuments(filter)
      ]);

      return {
        executions,
        total,
        pages: Math.ceil(total / limit),
        currentPage: page
      };
    } catch (error) {
      console.error('[MonitoringService] Error getting monitoring executions:', error);
      throw error;
    }
  }

  /**
   * Get specific monitoring execution details
   */
  public async getMonitoringExecution(
    executionId: string,
    tenantId?: string
  ): Promise<IMonitoringExecution | null> {
    try {
      const filter: any = { _id: executionId };
      if (tenantId) {
        filter.tenantId = tenantId;
      }

      return await MonitoringExecution.findOne(filter).lean();
    } catch (error) {
      console.error('[MonitoringService] Error getting monitoring execution:', error);
      throw error;
    }
  }

  /**
   * Create a new monitoring execution record
   */
  private async createMonitoringExecution(
    scheduleId: string,
    rut: string,
    tenantId: string
  ): Promise<IMonitoringExecution> {
    try {
      const execution = new MonitoringExecution({
        scheduleId,
        rut,
        tenantId,
        executedAt: new Date(),
        status: 'running',
        startedAt: new Date(),
        riskChanged: false,
        executionDetails: {
          processingSteps: []
        },
        metadata: {
          triggeredBy: 'schedule'
        }
      });

      return await execution.save();
    } catch (error) {
      console.error('[MonitoringService] Error creating monitoring execution:', error);
      throw error;
    }
  }

  /**
   * Update monitoring execution with results
   */
  private async updateMonitoringExecution(
    executionId: string,
    updates: Partial<IMonitoringExecution>
  ): Promise<void> {
    try {
      await MonitoringExecution.findByIdAndUpdate(executionId, updates);
    } catch (error) {
      console.error('[MonitoringService] Error updating monitoring execution:', error);
      throw error;
    }
  }

  /**
   * Stop the monitoring service
   */
  public stop(): void {
    console.log('[MonitoringService] Stopping monitoring service...');

    for (const [name, job] of this.cronJobs) {
      job.stop();
      console.log(`[MonitoringService] Stopped cron job: ${name}`);
    }

    this.cronJobs.clear();
    this.isInitialized = false;

    console.log('[MonitoringService] Monitoring service stopped');
  }
}