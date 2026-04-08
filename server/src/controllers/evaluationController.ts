import { Request, Response } from 'express';
import { EvaluationService } from '../services/evaluationService';

export const getRecentBulkEvaluations = async (req: Request, res: Response) => {
  const tenantId = req.user?.tenant;

  console.log(`[${new Date().toISOString()}] [GET /evaluations/bulk/recent] - Received request.`);
  try {
    if (!tenantId) {
      console.warn(`[${new Date().toISOString()}] [GET /evaluations/bulk/recent] - Tenant ID is required.`);
      return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
    }

    const recentJobs = await EvaluationService.getRecentBulkJobs(tenantId);
    console.log(`[${new Date().toISOString()}] [GET /evaluations/bulk/recent] - Successfully fetched recent jobs.`);
    res.json(recentJobs);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [GET /evaluations/bulk/recent] - Failed to fetch recent jobs:`, error);
    res.status(500).json({ message: 'Failed to fetch recent jobs' });
  }
};