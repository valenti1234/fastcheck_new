import { ConsultaHistory, IConsultaHistory, IConsultaHistoryWithUser } from '../models/ConsultaHistory';
import { AuthenticatedRequest } from '../types/auth';
import { Request, Response } from 'express';
import { EvaluationJob, EvaluationResult } from '../models/evaluation';

export interface ConsultaLogData {
  tenantId: string;
  userId?: string;
  consultaType: 'individual' | 'massive';
  rut?: string;
  ruts?: string[];
  endpoint: string;
  requestData?: any;
  responseStatus: number;
  responseData?: any;
  errorMessage?: string;
  processingTime?: number;
  creditsUsed?: number;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  metadata?: any;
}

export class ConsultaHistoryService {
  /**
   * Log a consultation to the history
   */
  static async logConsulta(data: ConsultaLogData): Promise<IConsultaHistory | null> {
    try {
      const consultaHistory = new ConsultaHistory(data);
      return await consultaHistory.save();
    } catch (error) {
      console.error('Error logging consultation history:', error);
      return null;
    }
  }


 /**
   * Extract request information from Express request object
   */
  static extractRequestInfo(req: AuthenticatedRequest): Partial<ConsultaLogData> {
    const headers: Record<string, any> = (req as any)?.headers || {};
    const socketRemoteAddress: string | undefined = (req as any)?.socket?.remoteAddress;
    const reqGet = (req as any)?.get;
    const userAgentFromGet =
      typeof reqGet === 'function'
        ? (reqGet.call(req, 'User-Agent') as string | undefined)
        : undefined;

    return {
      tenantId: req.user?.tenant || '',
      userId: req.user?.id,
      ipAddress: req.ip || socketRemoteAddress || (headers['x-forwarded-for'] as string | undefined),
      userAgent: (headers['user-agent'] as string | undefined) || userAgentFromGet,
      sessionId: req.sessionID || (headers['x-session-id'] as string | undefined)
    };
  }

  /**
   * Log an individual RUT consultation
   */
  static async logIndividualConsulta(
    req: AuthenticatedRequest,
    rut: string,
    endpoint: string,
    responseStatus: number,
    responseData?: any,
    errorMessage?: string,
    processingTime?: number,
    creditsUsed?: number,
    metadata?: any
  ): Promise<IConsultaHistory | null> {
    const baseInfo = this.extractRequestInfo(req);
    
    // Ensure tenantId is available
    if (!baseInfo.tenantId) {
      console.error('Cannot log consultation: tenantId is missing');
      return null;
    }
    
    return this.logConsulta({
      ...baseInfo,
      tenantId: baseInfo.tenantId,
      consultaType: 'individual',
      rut,
      endpoint,
      requestData: {
        rut,
        isMonitoring: req.body?.isMonitoring,
        isRefreshing: req.body?.isRefreshing,
        ...req.body
      },
      responseStatus,
      responseData,
      errorMessage,
      processingTime,
      creditsUsed,
      metadata
    });
  }

  /**
   * Log a massive consultation (bulk evaluation)
   */
  static async logMassiveConsulta(
    req: AuthenticatedRequest,
    ruts: string[],
    endpoint: string,
    responseStatus: number,
    responseData?: any,
    errorMessage?: string,
    processingTime?: number,
    creditsUsed?: number,
    metadata?: any
  ): Promise<IConsultaHistory | null> {
    const baseInfo = this.extractRequestInfo(req);
    
    // Ensure tenantId is available
    if (!baseInfo.tenantId) {
      console.error('Cannot log consultation: tenantId is missing');
      return null;
    }
    
    return this.logConsulta({
      ...baseInfo,
      tenantId: baseInfo.tenantId,
      consultaType: 'massive',
      ruts,
      endpoint,
      requestData: req.body,
      responseStatus,
      responseData,
      errorMessage,
      processingTime,
      creditsUsed,
      metadata: {
        ...metadata,
        batchSize: ruts.length
      }
    });
  }

  /**
   * Get consultation history for a tenant with pagination and filters
   */
  static async getConsultaHistory(
    tenantId: string,
    options: {
      page?: number;
      limit?: number;
      consultaType?: 'individual' | 'massive';
      rut?: string;
      endpoint?: string;
      responseStatus?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{
    consultations: IConsultaHistoryWithUser[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      limit = 50,
      consultaType,
      rut,
      endpoint,
      responseStatus,
      startDate,
      endDate
    } = options;

    // Build query
    const query: any = { tenantId };

    // Exclude PEP-only evaluations by default
    query['metadata.isPep'] = { $ne: true };
    query['requestData.isPep'] = { $ne: true };

    if (consultaType) {
      query.consultaType = consultaType;
    }

    if (rut) {
      query.rut = rut;
    }

    if (endpoint) {
      query.endpoint = { $regex: endpoint, $options: 'i' };
    }

    if (responseStatus) {
      query.responseStatus = responseStatus;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = startDate;
      }
      if (endDate) {
        query.createdAt.$lte = endDate;
      }
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    
    const [consultations, total] = await Promise.all([
      ConsultaHistory.find(query)
        .populate('userId', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ConsultaHistory.countDocuments(query)
    ]);

    return {
      consultations: consultations as IConsultaHistoryWithUser[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Get consultation statistics for a tenant
   */
  static async getConsultaStats(
    tenantId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalConsultations: number;
    individualConsultations: number;
    massiveConsultations: number;
    successfulConsultations: number;
    failedConsultations: number;
    totalCreditsUsed: number;
    averageProcessingTime: number;
    consultationsByDay: Array<{ date: string; count: number }>;
    consultationsByEndpoint: Array<{ endpoint: string; count: number }>;
  }> {
    const query: any = { tenantId };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = startDate;
      }
      if (endDate) {
        query.createdAt.$lte = endDate;
      }
    }

    const [
      totalConsultations,
      individualConsultations,
      massiveConsultations,
      successfulConsultations,
      failedConsultations,
      creditsStats,
      processingTimeStats,
      consultationsByDay,
      consultationsByEndpoint
    ] = await Promise.all([
      ConsultaHistory.countDocuments(query),
      ConsultaHistory.countDocuments({ ...query, consultaType: 'individual' }),
      ConsultaHistory.countDocuments({ ...query, consultaType: 'massive' }),
      ConsultaHistory.countDocuments({ ...query, responseStatus: { $gte: 200, $lt: 300 } }),
      ConsultaHistory.countDocuments({ ...query, responseStatus: { $gte: 400 } }),
      ConsultaHistory.aggregate([
        { $match: query },
        { $group: { _id: null, totalCredits: { $sum: '$creditsUsed' } } }
      ]),
      ConsultaHistory.aggregate([
        { $match: { ...query, processingTime: { $exists: true, $ne: null } } },
        { $group: { _id: null, avgTime: { $avg: '$processingTime' } } }
      ]),
      ConsultaHistory.aggregate([
        { $match: query },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } },
        { $limit: 30 }
      ]),
      ConsultaHistory.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$endpoint',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);

    return {
      totalConsultations,
      individualConsultations,
      massiveConsultations,
      successfulConsultations,
      failedConsultations,
      totalCreditsUsed: creditsStats[0]?.totalCredits || 0,
      averageProcessingTime: processingTimeStats[0]?.avgTime || 0,
      consultationsByDay: consultationsByDay.map(item => ({
        date: item._id,
        count: item.count
      })),
      consultationsByEndpoint: consultationsByEndpoint.map(item => ({
        endpoint: item._id,
        count: item.count
      }))
    };
  }

  static async backfillMassiveConsultas(options: {
    tenantId?: string;
    since?: Date;
    until?: Date;
    dryRun?: boolean;
    maxJobs?: number;
    maxRutsPerConsulta?: number;
  } = {}): Promise<{
    scannedJobs: number;
    existingHistory: number;
    inserted: number;
    skippedNoResults: number;
    truncated: number;
  }> {
    const {
      tenantId,
      since,
      until,
      dryRun = false,
      maxJobs = 1000,
      maxRutsPerConsulta = 5000
    } = options;

    const jobQuery: any = { type: 'bulk' };
    if (tenantId) jobQuery.tenantId = tenantId;
    if (since || until) {
      jobQuery.createdAt = {};
      if (since) jobQuery.createdAt.$gte = since;
      if (until) jobQuery.createdAt.$lte = until;
    }

    const jobs = await EvaluationJob.find(jobQuery)
      .sort({ createdAt: -1 })
      .limit(maxJobs)
      .lean();

    const isObjectIdLike = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);

    let existingHistory = 0;
    let inserted = 0;
    let skippedNoResults = 0;
    let truncated = 0;

    const pendingInserts: any[] = [];
    const flush = async () => {
      if (pendingInserts.length === 0) return;
      const docs = pendingInserts.splice(0, pendingInserts.length);
      if (dryRun) {
        inserted += docs.length;
        return;
      }
      await ConsultaHistory.insertMany(docs, { ordered: false });
      inserted += docs.length;
    };

    for (const job of jobs) {
      const jobId = (job as any)?._id?.toString?.() || '';
      if (!jobId) continue;

      const historyExists = await ConsultaHistory.exists({
        tenantId: job.tenantId,
        consultaType: 'massive',
        $or: [
          { 'responseData.jobId': jobId },
          { 'requestData.jobId': jobId },
          { 'metadata.jobId': jobId }
        ]
      });

      if (historyExists) {
        existingHistory += 1;
        continue;
      }

      const rutsAll = (await EvaluationResult.distinct('rut', { jobId: (job as any)._id })) as string[];
      if (!rutsAll || rutsAll.length === 0) {
        skippedNoResults += 1;
        continue;
      }

      let ruts = rutsAll;
      let isTruncated = false;
      if (maxRutsPerConsulta > 0 && rutsAll.length > maxRutsPerConsulta) {
        truncated += 1;
        isTruncated = true;
        ruts = rutsAll.slice(0, maxRutsPerConsulta);
      }

      const createdBy = (job as any)?.createdBy;
      const userId = isObjectIdLike(createdBy) ? createdBy : undefined;

      pendingInserts.push({
        tenantId: job.tenantId,
        userId,
        consultaType: 'massive',
        ruts,
        endpoint: '/api/evaluations/bulk',
        requestData: {
          jobId,
          type: 'bulk',
          totalEvaluations: (job as any)?.totalEvaluations
        },
        responseStatus: 201,
        responseData: {
          jobId,
          status: (job as any)?.status
        },
        creditsUsed: Math.max(0, Number((job as any)?.totalEvaluations || rutsAll.length || 0)),
        metadata: {
          evaluationType: 'bulk',
          batchSize: rutsAll.length,
          backfilled: true,
          truncated: isTruncated,
          totalRuts: rutsAll.length,
          jobStatus: (job as any)?.status
        },
        createdAt: (job as any)?.createdAt,
        updatedAt: (job as any)?.updatedAt || (job as any)?.createdAt
      });

      if (pendingInserts.length >= 50) {
        await flush();
      }
    }

    await flush();

    return {
      scannedJobs: jobs.length,
      existingHistory,
      inserted,
      skippedNoResults,
      truncated
    };
  }
}
