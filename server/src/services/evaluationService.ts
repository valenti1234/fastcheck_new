import mongoose from 'mongoose';
import { EvaluationJob, EvaluationResult } from '../models/evaluation';
import { SheriffService } from './sheriffService';
import { RabbitMQService } from './rabbitmqService';
import { ISheriffDataLog } from '../models/SheriffDataLog';
import { RutController } from '../controllers/rutController';
import { Tenant } from '../models/tenant.model';
import { CreditOperation } from '../models/creditOperation.model';
import { ConsultaHistoryService } from './consultaHistoryService';
import elkService from './elkService';
import { Result } from '../models/Result';

export class EvaluationService {
  private static rabbitMQService: RabbitMQService;

  static async initialize() {
    this.rabbitMQService = RabbitMQService.getInstance();
    await this.rabbitMQService.initialize();
    
    // Start consumer for processing evaluations
    await this.rabbitMQService.startConsumer(async (data) => {
      const { rut, name, jobId, tenantId, userId } = data;

      try {
        console.log(20,"calling RutController.lookupRut from EvaluationService",tenantId);
        
        // Create mock request and response objects for RutController
        const mockReq = {
          body: { rut, isMonitoring: false, type: 'masiva' },
          user: { tenant: tenantId, id: userId }
        } as any;
        
        let resultData: any = null;
        const mockRes = {
          status: (code: number) => ({
            json: (data: any) => {
              if (code === 200) {
                resultData = data;
                return data;
              } else {
                throw new Error(`HTTP ${code}: ${JSON.stringify(data)}`);
              }
            }
          })
        } as any;
        
        // Call RutController.lookupRut
        await RutController.lookupRut(mockReq, mockRes);
        //console.log(22,"EvaluationService result from RutController.lookupRut",resultData?.rut);
        
        // Auto-save summary for bulk evaluations
        if (resultData) {
          try {
            // Use aiAnalysis if available, otherwise use a default summary
            const summaryContent = resultData.aiAnalysis || 'Resultado de evaluación sin análisis AI disponible';
            
            const summaryMockReq = {
              params: { rut },
              body: { summary: summaryContent },
              user: { tenant: tenantId, id: userId }
            } as any;
            
            const summaryMockRes = {
              status: (code: number) => ({
                json: (data: any) => {
                  console.log(`Auto-saved summary for RUT ${rut} in bulk evaluation`);
                  return data;
                }
              })
            } as any;
            
            await RutController.saveFastCheckSummary(summaryMockReq, summaryMockRes);
          } catch (summaryError) {
            console.error(`Failed to auto-save summary for RUT ${rut}:`, summaryError);
            // Don't fail the evaluation if summary saving fails
          }
        }
        
        await EvaluationResult.create({
          jobId,
          tenantId,
          rut,
          name,
          status: 'success',
          data: resultData,
        });

        // Update job progress
        const [completed, failed] = await Promise.all([
          EvaluationResult.countDocuments({ jobId, status: 'success' }),
          EvaluationResult.countDocuments({ jobId, status: 'failed' })
        ]);

        await EvaluationJob.findByIdAndUpdate(jobId, {
          completedEvaluations: completed,
          failedEvaluations: failed,
          status: completed + failed === (await EvaluationJob.findById(jobId))?.totalEvaluations ? 'completed' : 'processing'
        });
      } catch (error) {
        console.error(`Failed to process supplier ${rut}:`, error);
        
        await EvaluationResult.create({
          jobId,
          tenantId,
          rut,
          name,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        });

        const [completed, failed] = await Promise.all([
          EvaluationResult.countDocuments({ jobId, status: 'success' }),
          EvaluationResult.countDocuments({ jobId, status: 'failed' })
        ]);

        await EvaluationJob.findByIdAndUpdate(jobId, {
          completedEvaluations: completed,
          failedEvaluations: failed,
          status: completed + failed === (await EvaluationJob.findById(jobId))?.totalEvaluations ? 'completed' : 'processing'
        });
      }
    });
  }

  // Get jobs for a tenant
  static async getJobs(tenantId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [jobs, total] = await Promise.all([
      EvaluationJob.find({ tenantId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      EvaluationJob.countDocuments({ tenantId })
    ]);

    return {
      jobs,
      total,
      pages: Math.ceil(total / limit)
    };
  }

  // Get a specific job
  static async getJob(jobId: string, tenantId: string) {
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    // Find job by ID and tenant ID to ensure tenant isolation
    const query = mongoose.Types.ObjectId.isValid(jobId)
      ? { _id: jobId, tenantId }
      : { _id: jobId, tenantId };
    return EvaluationJob.findOne(query).exec();
  }

  // Get results for a job
  static async getResults(jobId: string, tenantId: string, page = 1, limit = 10) {
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    // First verify that the job belongs to the tenant
    const query = mongoose.Types.ObjectId.isValid(jobId)
      ? { _id: jobId, tenantId }
      : { _id: jobId, tenantId };
    const job = await EvaluationJob.findOne(query).exec();
    if (!job) {
      throw new Error('Job not found or does not belong to this tenant');
    }

    const skip = (page - 1) * limit;
    const [results, total] = await Promise.all([
      EvaluationResult.find({ jobId, tenantId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      EvaluationResult.countDocuments({ jobId, tenantId })
    ]);

    return {
      results,
      total,
      pages: Math.ceil(total / limit)
    };
  }

  // Create a single evaluation
  static async createSingleEvaluation(tenantId: string, userId: string, supplierData: { rut: string; name?: string }, companyData?: any) {
    console.log('[CREDIT_SYSTEM] Starting createSingleEvaluation for tenant:', tenantId, 'user:', userId, 'supplier:', supplierData.rut);
    
    // Log single evaluation attempt
    elkService.logBusinessEvent('single_evaluation_attempted', {
      supplierRut: supplierData.rut,
      supplierName: supplierData.name,
      hasCompanyData: !!companyData
    }, userId, tenantId);
    
    if (!tenantId) {
      console.error('[CREDIT_SYSTEM] ERROR: Tenant ID is required');
      elkService.logBusinessEvent('single_evaluation_failed', {
        reason: 'missing_tenant_id',
        supplierRut: supplierData.rut
      }, userId);
      throw new Error('Tenant ID is required');
    }

    if (!userId) {
      console.error('[CREDIT_SYSTEM] ERROR: User ID is required');
      elkService.logBusinessEvent('single_evaluation_failed', {
        reason: 'missing_user_id',
        supplierRut: supplierData.rut
      }, undefined, tenantId);
      throw new Error('User ID is required');
    }

    const creditsNeeded = 1;
    console.log('[CREDIT_SYSTEM] Credits needed for single evaluation:', creditsNeeded);
    
    try {
      // Validate and deduct credits first
      console.log('[CREDIT_SYSTEM] Finding tenant by ID:', tenantId);
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        console.error('[CREDIT_SYSTEM] ERROR: Tenant not found for ID:', tenantId);
        throw new Error('Tenant not found');
      }

      const availableCredits = tenant.creditBalance.availableCredits;
      console.log('[CREDIT_SYSTEM] Current available credits:', availableCredits, 'Credits needed:', creditsNeeded);
      
      if (availableCredits < creditsNeeded) {
        console.error('[CREDIT_SYSTEM] ERROR: Insufficient credits. Available:', availableCredits, 'Needed:', creditsNeeded);
        elkService.logBusinessEvent('single_evaluation_failed', {
          reason: 'insufficient_credits',
          supplierRut: supplierData.rut,
          availableCredits,
          creditsNeeded
        }, userId, tenantId);
        throw new Error(`Crediti insufficienti. Crediti rimanenti: ${availableCredits}. È necessario ${creditsNeeded} credito per questa valutazione.`);
      }

      // Deduct credits
      const newBalance = availableCredits - creditsNeeded;
      console.log('[CREDIT_SYSTEM] Deducting credits. New balance will be:', newBalance);
      
      const updateResult = await Tenant.findByIdAndUpdate(
        tenantId,
        { 
          'creditBalance.availableCredits': newBalance,
          'creditBalance.totalCreditsUsed': tenant.creditBalance.totalCreditsUsed + creditsNeeded,
          'creditBalance.lastCreditOperation': new Date(),
          updatedAt: new Date()
        }
      );
      console.log('[CREDIT_SYSTEM] Tenant credit balance updated successfully:', updateResult ? 'SUCCESS' : 'FAILED');

      // Create credit operation record
      console.log('[CREDIT_SYSTEM] Creating credit operation record');
      const creditOperation = await CreditOperation.create({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        userId: new mongoose.Types.ObjectId(userId),
        operationType: 'evaluation',
        creditsChanged: -creditsNeeded,
        balanceAfter: newBalance,
        description: `Valutazione singola per ${supplierData.rut}`,
        metadata: {
          evaluationType: 'single',
          supplierRut: supplierData.rut,
          supplierName: supplierData.name
        }
      });
      console.log('[CREDIT_SYSTEM] Credit operation created successfully with ID:', creditOperation._id);

      // Create evaluation job
      console.log('[CREDIT_SYSTEM] Creating evaluation job');
      const job = await EvaluationJob.create({
        tenantId,
        createdBy: userId,
        type: 'single',
        status: 'pending',
        supplierData: {
          rut: supplierData.rut,
          name: supplierData.name || 'N/A'
        },
        totalEvaluations: 1,
        completedEvaluations: 0,
        failedEvaluations: 0
      });
      console.log('[CREDIT_SYSTEM] Evaluation job created successfully with ID:', job._id);

      // Create evaluation result
      console.log('[CREDIT_SYSTEM] Creating evaluation result');
      const result = await EvaluationResult.create({
        jobId: job._id,
        tenantId,
        rut: supplierData.rut,
        name: supplierData.name,
        status: 'success',
        data: companyData
      });
      console.log('[CREDIT_SYSTEM] Evaluation result created successfully with ID:', result._id);
      console.log('[CREDIT_SYSTEM] Single evaluation process completed successfully');

      // Log successful single evaluation
      elkService.logBusinessEvent('single_evaluation_completed', {
        jobId: job._id.toString(),
        supplierRut: supplierData.rut,
        supplierName: supplierData.name,
        creditsUsed: creditsNeeded,
        newCreditBalance: newBalance,
        creditOperationId: creditOperation._id.toString(),
        evaluationResultId: result._id.toString()
      }, userId, tenantId);

      return job;
    } catch (error) {
      console.error('[CREDIT_SYSTEM] ERROR in createSingleEvaluation:', error);
      
      // Log system error
      elkService.logSystemError(error as Error, 'single_evaluation_service', {
        supplierRut: supplierData.rut,
        supplierName: supplierData.name,
        userId,
        tenantId
      });
      
      throw error;
    }
  }

  // Get recent bulk evaluations
  static async getRecentBulkJobs(tenantId: string, limit = 10) {
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    return EvaluationJob.find({
      tenantId,
      type: 'bulk'
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  // Create bulk evaluation
  static async createBulkEvaluation(tenantId: string, userId: string, suppliers: { rut: string; name?: string }[]) {
    const normalizeRut = (input: string) => {
      const raw = String(input || '').trim();
      if (!raw) return '';
      const cleaned = raw.replace(/\./g, '').replace(/\s+/g, '').toUpperCase();
      if (!cleaned) return '';
      if (cleaned.includes('-')) return cleaned;
      if (cleaned.length < 2) return cleaned;
      return `${cleaned.slice(0, -1)}-${cleaned.slice(-1)}`;
    };

    const uniqueSupplierMap = new Map<string, { rut: string; name?: string }>();
    for (const supplier of suppliers || []) {
      const rut = normalizeRut(supplier?.rut);
      if (!rut) continue;
      if (!uniqueSupplierMap.has(rut)) {
        uniqueSupplierMap.set(rut, { rut, name: supplier?.name });
      }
    }

    const uniqueSuppliers = Array.from(uniqueSupplierMap.values());
    const supplierRuts = uniqueSuppliers.map(s => s.rut);

    const existingResults = supplierRuts.length
      ? await Result.find({ tenantId, rut: { $in: supplierRuts }, archived: { $ne: true } })
          .sort({ createdAt: -1 })
          .lean()
          .exec()
      : [];

    const latestResultByRut = new Map<string, any>();
    for (const r of existingResults) {
      if (r?.rut && !latestResultByRut.has(r.rut)) {
        latestResultByRut.set(r.rut, r);
      }
    }

    const cachedSuppliers = uniqueSuppliers.filter(s => latestResultByRut.has(s.rut));
    const suppliersToProcess = uniqueSuppliers.filter(s => !latestResultByRut.has(s.rut));
    const creditsNeeded = suppliersToProcess.length;

    console.log('[CREDIT_SYSTEM] Starting createBulkEvaluation for tenant:', tenantId, 'user:', userId, 'suppliers count:', uniqueSuppliers.length);
    console.log('[CREDIT_SYSTEM] Credits needed for bulk evaluation:', creditsNeeded, 'Cached suppliers:', cachedSuppliers.length);

    elkService.logBusinessEvent(
      'bulk_evaluation_attempted',
      {
        suppliersCount: uniqueSuppliers.length,
        suppliersToProcessCount: suppliersToProcess.length,
        cachedSuppliersCount: cachedSuppliers.length,
        creditsNeeded,
        supplierRuts
      },
      userId,
      tenantId
    );
    
    try {
      // Validate and deduct credits first
      console.log('[CREDIT_SYSTEM] Finding tenant by ID:', tenantId);
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        console.error('[CREDIT_SYSTEM] ERROR: Tenant not found for ID:', tenantId);
        throw new Error('Tenant not found');
      }

      const availableCredits = tenant.creditBalance.availableCredits;
      console.log('[CREDIT_SYSTEM] Current available credits:', availableCredits, 'Credits needed:', creditsNeeded);
      
      if (availableCredits < creditsNeeded) {
        console.error('[CREDIT_SYSTEM] ERROR: Insufficient credits for bulk evaluation. Available:', availableCredits, 'Needed:', creditsNeeded);
        elkService.logBusinessEvent('bulk_evaluation_failed', {
          reason: 'insufficient_credits',
          suppliersCount: uniqueSuppliers.length,
          availableCredits,
          creditsNeeded
        }, userId, tenantId);
        throw new Error(`Crediti insufficienti. Crediti rimanenti: ${availableCredits}. Sono necessari ${creditsNeeded} crediti per questa valutazione bulk.`);
      }

      let newBalance = availableCredits;
      let creditOperationId: string | undefined;

      if (creditsNeeded > 0) {
        // Deduct credits
        newBalance = availableCredits - creditsNeeded;
        console.log('[CREDIT_SYSTEM] Deducting credits for bulk evaluation. New balance will be:', newBalance);

        const updateResult = await Tenant.findByIdAndUpdate(tenantId, {
          'creditBalance.availableCredits': newBalance,
          'creditBalance.totalCreditsUsed': tenant.creditBalance.totalCreditsUsed + creditsNeeded,
          'creditBalance.lastCreditOperation': new Date(),
          updatedAt: new Date()
        });
        console.log('[CREDIT_SYSTEM] Tenant credit balance updated for bulk evaluation:', updateResult ? 'SUCCESS' : 'FAILED');

        // Create credit operation record
        console.log('[CREDIT_SYSTEM] Creating credit operation record for bulk evaluation');
        const creditOperation = await CreditOperation.create({
          tenantId: new mongoose.Types.ObjectId(tenantId),
          userId: new mongoose.Types.ObjectId(userId),
          operationType: 'evaluation',
          creditsChanged: -creditsNeeded,
          balanceAfter: newBalance,
          description: `Valutazione bulk (${creditsNeeded} nuovi / ${uniqueSuppliers.length} totali)`,
          metadata: {
            evaluationType: 'bulk',
            suppliersCount: uniqueSuppliers.length,
            suppliersToProcessCount: suppliersToProcess.length,
            cachedSuppliersCount: cachedSuppliers.length
          }
        });
        creditOperationId = creditOperation._id.toString();
        console.log('[CREDIT_SYSTEM] Credit operation created for bulk evaluation with ID:', creditOperationId);
      }

      // Create evaluation job
      console.log('[CREDIT_SYSTEM] Creating evaluation job for bulk evaluation');
      const job = await EvaluationJob.create({
        tenantId,
        type: 'bulk',
        status: creditsNeeded === 0 ? 'completed' : 'processing',
        createdBy: userId,
        supplierData: {
          rut: 'N/A',
          name: 'Bulk Evaluation'
        },
        totalEvaluations: uniqueSuppliers.length,
        completedEvaluations: cachedSuppliers.length,
        failedEvaluations: 0,
      });
      console.log('[CREDIT_SYSTEM] Evaluation job created for bulk evaluation with ID:', job._id);

      // Publish each supplier to RabbitMQ queue
      console.log('[CREDIT_SYSTEM] Publishing suppliers to RabbitMQ queue for bulk evaluation');
      if (cachedSuppliers.length > 0) {
        await EvaluationResult.insertMany(
          cachedSuppliers.map((s) => ({
            jobId: job._id.toString(),
            tenantId,
            rut: s.rut,
            name: s.name,
            status: 'success',
            data: latestResultByRut.get(s.rut)
          }))
        );
      }

      for (const supplier of suppliersToProcess) {
        await this.rabbitMQService.publishEvaluation({
          rut: supplier.rut,
          name: supplier.name,
          jobId: job._id.toString(),
          tenantId,
          userId
        });
      }
      console.log('[CREDIT_SYSTEM] All suppliers published to RabbitMQ queue for bulk evaluation');

      // Log massive consultation to history
      try {
        const mockReq = {
          user: { tenant: tenantId, id: userId },
          ip: '127.0.0.1', // Default IP for internal service calls
          get: (header: string) => header === 'User-Agent' ? 'EvaluationService/1.0' : undefined,
          body: {
            suppliers: uniqueSuppliers,
            evaluationType: 'bulk'
          }
        } as any;

        await ConsultaHistoryService.logMassiveConsulta(
          mockReq,
          uniqueSuppliers.map(s => s.rut),
          '/api/evaluations/bulk',
          201, // HTTP status for successful creation
          {
            jobId: job._id.toString(),
            totalEvaluations: uniqueSuppliers.length,
            status: job.status
          },
          undefined, // errorMessage
          undefined, // processingTime - will be calculated when job completes
          creditsNeeded, // creditsUsed
          {
            evaluationType: 'bulk',
            suppliersCount: uniqueSuppliers.length,
            suppliersToProcessCount: suppliersToProcess.length,
            cachedSuppliersCount: cachedSuppliers.length,
            creditOperationId
          }
        );
        console.log('[CONSULTA_HISTORY] Successfully logged massive consultation for', uniqueSuppliers.length, 'RUTs');
      } catch (logError) {
        console.error('[CONSULTA_HISTORY] Error logging massive consultation:', logError);
        // Don't fail the main operation if logging fails
      }

      console.log('[CREDIT_SYSTEM] Bulk evaluation completed successfully. Job ID:', job._id, 'Credits deducted:', creditsNeeded);
      
      // Log successful bulk evaluation
      elkService.logBusinessEvent('bulk_evaluation_completed', {
        jobId: job._id.toString(),
        suppliersCount: uniqueSuppliers.length,
        suppliersToProcessCount: suppliersToProcess.length,
        cachedSuppliersCount: cachedSuppliers.length,
        creditsUsed: creditsNeeded,
        newCreditBalance: newBalance,
        creditOperationId,
        supplierRuts
      }, userId, tenantId);
      
      return job;
    } catch (error) {
      console.error('[CREDIT_SYSTEM] ERROR in createBulkEvaluation for tenant:', tenantId, 'Error:', error);
      
      // Log system error
      elkService.logSystemError(error as Error, 'bulk_evaluation_service', {
        suppliersCount: suppliers.length,
        creditsNeeded,
        userId,
        tenantId
      });
      
      throw error;
    }
  }

  // Delete a single evaluation
  static async deleteEvaluation(jobId: string, tenantId: string) {
    console.log('[EVALUATION_DELETE] Starting deleteEvaluation for jobId:', jobId, 'tenantId:', tenantId);
    
    try {
      // Find the evaluation job
      const job = await EvaluationJob.findOne({ 
        _id: new mongoose.Types.ObjectId(jobId), 
        tenantId 
      });

      if (!job) {
        console.log('[EVALUATION_DELETE] Job not found for jobId:', jobId);
        return null;
      }

      // Delete all evaluation results for this job
      const deleteResultsResult = await EvaluationResult.deleteMany({ 
        jobId: new mongoose.Types.ObjectId(jobId),
        tenantId 
      });
      console.log('[EVALUATION_DELETE] Deleted', deleteResultsResult.deletedCount, 'evaluation results');

      // Delete the job itself
      const deletedJob = await EvaluationJob.findByIdAndDelete(jobId);
      console.log('[EVALUATION_DELETE] Deleted evaluation job:', jobId);

      // Log the deletion
      elkService.logBusinessEvent('evaluation_deleted', {
        jobId,
        tenantId,
        deletedResultsCount: deleteResultsResult.deletedCount,
        jobType: job.type,
        totalEvaluations: job.totalEvaluations
      }, undefined, tenantId);

      return deletedJob;
    } catch (error) {
      console.error('[EVALUATION_DELETE] ERROR in deleteEvaluation:', error);
      
      // Log system error
      elkService.logSystemError(error as Error, 'delete_evaluation_service', {
        jobId,
        tenantId
      });
      
      throw error;
    }
  }

  // Delete multiple evaluations
  static async deleteBulkEvaluations(jobIds: string[], tenantId: string) {
    console.log('[BULK_EVALUATION_DELETE] Starting deleteBulkEvaluations for', jobIds.length, 'jobs, tenantId:', tenantId);
    
    let deletedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    try {
      for (const jobId of jobIds) {
        try {
          const result = await this.deleteEvaluation(jobId, tenantId);
          if (result) {
            deletedCount++;
            console.log('[BULK_EVALUATION_DELETE] Successfully deleted job:', jobId);
          } else {
            failedCount++;
            errors.push(`Job ${jobId} not found`);
            console.log('[BULK_EVALUATION_DELETE] Job not found:', jobId);
          }
        } catch (error) {
          failedCount++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Failed to delete job ${jobId}: ${errorMessage}`);
          console.error('[BULK_EVALUATION_DELETE] Error deleting job:', jobId, error);
        }
      }

      console.log('[BULK_EVALUATION_DELETE] Bulk deletion completed. Deleted:', deletedCount, 'Failed:', failedCount);

      // Log the bulk deletion
      elkService.logBusinessEvent('bulk_evaluations_deleted', {
        tenantId,
        totalRequested: jobIds.length,
        deletedCount,
        failedCount,
        jobIds
      }, undefined, tenantId);

      return {
        deletedCount,
        failedCount,
        errors
      };
    } catch (error) {
      console.error('[BULK_EVALUATION_DELETE] ERROR in deleteBulkEvaluations:', error);
      
      // Log system error
      elkService.logSystemError(error as Error, 'delete_bulk_evaluations_service', {
        jobIds,
        tenantId,
        deletedCount,
        failedCount
      });
      
      throw error;
    }
  }
}
