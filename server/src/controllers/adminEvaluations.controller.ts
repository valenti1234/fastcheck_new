import { Request, Response } from 'express';
import { EvaluationJob, EvaluationResult } from '../models/evaluation';
import { Summary } from '../models/Summary';
import { Tenant } from '../models/tenant.model';
import { Result } from '../models/Result';

export class AdminEvaluationsController {
  // GET /admin/evaluations
  public async getEvaluationsByTenant(req: Request, res: Response) {
    try {
      // Aggregate evaluations from jobs and results per tenant
      const jobsAgg = await EvaluationJob.aggregate([
        { $match: {} },
        {
          $group: {
            _id: '$tenantId',
            totalJobs: { $sum: 1 },
            totalEvaluationsFromJobs: { $sum: '$totalEvaluations' },
            completedEvaluationsFromJobs: { $sum: '$completedEvaluations' },
            failedEvaluationsFromJobs: { $sum: '$failedEvaluations' }
          }
        }
      ]);

      const resultsAgg = await EvaluationResult.aggregate([
        { $match: {} },
        {
          $group: {
            _id: '$tenantId',
            totalResults: { $sum: 1 },
            completedResults: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
            failedResults: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }
          }
        }
      ]);

      // Map aggregations by tenantId for easy merge
      const mapByTenant = new Map<string, any>();
      for (const j of jobsAgg) {
        mapByTenant.set(String(j._id), {
          tenantId: String(j._id),
          jobs: j.totalJobs || 0,
          totalEvaluationsFromJobs: j.totalEvaluationsFromJobs || 0,
          completedEvaluationsFromJobs: j.completedEvaluationsFromJobs || 0,
          failedEvaluationsFromJobs: j.failedEvaluationsFromJobs || 0
        });
      }

      for (const r of resultsAgg) {
        const key = String(r._id);
        const existing = mapByTenant.get(key) || { tenantId: key };
        existing.results = {
          totalResults: r.totalResults || 0,
          completedResults: r.completedResults || 0,
          failedResults: r.failedResults || 0
        };
        mapByTenant.set(key, existing);
      }

      // Fetch tenant names for mapping
      const tenantIds = Array.from(mapByTenant.keys());
      const tenants = await Tenant.find({ _id: { $in: tenantIds } }).lean();
      const tenantNameById = new Map<string, string>();
      for (const t of tenants) {
        // Some schemas may not define a separate tenantId field; rely on _id and name
        const idStr = String((t as any)._id);
        const nameStr = (t as any).name || '';
        tenantNameById.set(idStr, nameStr);
      }

      const items = Array.from(mapByTenant.values()).map(item => ({
        tenantId: item.tenantId,
        tenantName: tenantNameById.get(item.tenantId) || null,
        jobs: item.jobs || 0,
        totalEvaluationsFromJobs: item.totalEvaluationsFromJobs || 0,
        completedEvaluationsFromJobs: item.completedEvaluationsFromJobs || 0,
        failedEvaluationsFromJobs: item.failedEvaluationsFromJobs || 0,
        totalResults: item.results?.totalResults ?? 0,
        completedResults: item.results?.completedResults ?? 0,
        failedResults: item.results?.failedResults ?? 0
      }));

      return res.json({ data: items });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('adminEvaluations.getEvaluationsByTenant error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /admin/fast-check-summaries
  public async getFastCheckSummaries(req: Request, res: Response) {
    try {
      const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
      const limit = Math.max(parseInt(String(req.query.limit || '25'), 10) || 25, 1);
      const skip = (page - 1) * limit;

      // Optional filters
      const rut = typeof req.query.rut === 'string' ? req.query.rut.trim() : undefined;
      const tenantIdFilter = typeof req.query.tenantId === 'string' ? req.query.tenantId.trim() : undefined;
      const startDate = typeof req.query.startDate === 'string' ? new Date(req.query.startDate) : undefined;
      const endDate = typeof req.query.endDate === 'string' ? new Date(req.query.endDate) : undefined;

      const match: any = { summaryType: 'fast-check' };
      if (rut) match.rut = rut;
      if (tenantIdFilter) match.tenantId = tenantIdFilter;
      if (startDate || endDate) {
        match.createdAt = {};
        if (startDate && !isNaN(startDate.getTime())) match.createdAt.$gte = startDate;
        if (endDate && !isNaN(endDate.getTime())) match.createdAt.$lte = endDate;
      }

      const [summaries, total] = await Promise.all([
        Summary.find(match)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
          .exec(),
        Summary.countDocuments(match).exec()
      ]);

      const tenantIds = Array.from(new Set(summaries.map(s => String(s.tenantId))));
      const tenants = await Tenant.find({ _id: { $in: tenantIds } }).lean();
      const tenantNameById = new Map<string, string>();
      for (const t of tenants) {
        tenantNameById.set(String(t._id), t.name || '');
      }

      const items = summaries.map((s: any) => ({
        id: String(s._id),
        rut: s.rut,
        tenantId: String(s.tenantId),
        tenantName: tenantNameById.get(String(s.tenantId)) || null,
        companyName: s.metadata?.companyName ?? null,
        riskLevel: s.metadata?.riskLevel ?? null,
        analysisDate: s.metadata?.analysisDate ?? null,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      }));

      return res.json({
        data: items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('adminEvaluations.getFastCheckSummaries error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /admin/results - Global listing of Result documents with optional filters
  public async getResults(req: Request, res: Response) {
    try {
      const {
        page = '1',
        limit = '20',
        rut,
        tenantId,
        startDate,
        endDate
      } = req.query as Record<string, string>;

      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
      const skip = (pageNum - 1) * limitNum;

      const query: any = {};
      if (rut && rut.trim()) {
        const normalizedRut = rut.replace(/\./g, '');
        query.$or = [
          { rut: rut },
          { rut: normalizedRut },
          { rut: rut.replace('-', '') }
        ];
      }
      if (tenantId && tenantId.trim()) {
        query.tenantId = tenantId;
      }
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      const [total, results] = await Promise.all([
        Result.countDocuments(query),
        Result.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean()
          .exec()
      ]);

      // Map tenant names
      const tenantIds = Array.from(new Set(results.map(r => String(r.tenantId)))).filter(Boolean);
      const tenants = await Tenant.find({ _id: { $in: tenantIds } }).lean();
      const tenantNameMap = new Map<string, string>();
      for (const t of tenants) {
        const idStr = String((t as any)._id);
        const nameStr = (t as any).name || '';
        tenantNameMap.set(idStr, nameStr);
      }

      const items = results.map(r => ({
        ...r,
        tenantName: tenantNameMap.get(String(r.tenantId)) || null,
        user_email: (r as any).userEmail || null,
        status: (r as any).status || 200,
        type: (r as any).type || 'individual',
        time: (r as any).processingTime || null,
        credits: (r as any).creditsConsumed ?? 1
      }));

      return res.json({
        success: true,
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 0,
        items
      });
    } catch (error) {
      console.error('[AdminEvaluationsController.getResults] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export default new AdminEvaluationsController();