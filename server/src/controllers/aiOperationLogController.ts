import { Request, Response } from 'express';
import { AIOperationLog } from '../models/AIOperationLog';
import { AuthenticatedRequest } from '../types/auth';

export class AIOperationLogController {
  static async getAIOperationLogs(req: AuthenticatedRequest, res: Response) {
    try {
      const {
        page = 1,
        limit = 20,
        operationType,
        success,
        rut,
        startDate,
        endDate
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Build filter object
      const filter: any = {};
      
      // Add tenant filter if user has tenant
      if (req.user?.tenant) {
        filter.tenantId = req.user.tenant;
      }

      if (operationType) {
        filter.operationType = operationType;
      }

      if (success !== undefined && success !== '') {
        filter.success = success === 'true';
      }

      if (rut) {
        filter.rut = { $regex: rut, $options: 'i' };
      }

      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) {
          filter.createdAt.$gte = new Date(startDate as string);
        }
        if (endDate) {
          const endDateTime = new Date(endDate as string);
          endDateTime.setHours(23, 59, 59, 999); // End of day
          filter.createdAt.$lte = endDateTime;
        }
      }

      // Get logs with pagination
      const [logs, total] = await Promise.all([
        AIOperationLog.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        AIOperationLog.countDocuments(filter)
      ]);

      res.json({
        logs,
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum
      });
    } catch (error) {
      console.error('Error fetching AI operation logs:', error);
      res.status(500).json({ 
        message: 'Error fetching AI operation logs',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  static async getAIOperationLogById(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      
      const filter: any = { _id: id };
      
      // Add tenant filter if user has tenant
      if (req.user?.tenant) {
        filter.tenantId = req.user.tenant;
      }

      const log = await AIOperationLog.findOne(filter);
      
      if (!log) {
        return res.status(404).json({ message: 'AI operation log not found' });
      }

      res.json(log);
    } catch (error) {
      console.error('Error fetching AI operation log:', error);
      res.status(500).json({ 
        message: 'Error fetching AI operation log',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  static async getAIOperationStats(req: AuthenticatedRequest, res: Response) {
    try {
      const filter: any = {};
      
      // Add tenant filter if user has tenant
      if (req.user?.tenant) {
        filter.tenantId = req.user.tenant;
      }

      // Get stats for the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      filter.createdAt = { $gte: thirtyDaysAgo };

      const [totalOperations, successfulOperations, operationsByType] = await Promise.all([
        AIOperationLog.countDocuments(filter),
        AIOperationLog.countDocuments({ ...filter, success: true }),
        AIOperationLog.aggregate([
          { $match: filter },
          {
            $group: {
              _id: '$operationType',
              count: { $sum: 1 },
              successCount: {
                $sum: { $cond: ['$success', 1, 0] }
              },
              avgExecutionTime: { $avg: '$executionTime' },
              totalTokens: { $sum: '$tokensUsed.total' }
            }
          }
        ])
      ]);

      const successRate = totalOperations > 0 ? (successfulOperations / totalOperations) * 100 : 0;

      res.json({
        totalOperations,
        successfulOperations,
        successRate: Math.round(successRate * 100) / 100,
        operationsByType,
        period: '30 days'
      });
    } catch (error) {
      console.error('Error fetching AI operation stats:', error);
      res.status(500).json({ 
        message: 'Error fetching AI operation stats',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}