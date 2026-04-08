import { Request, Response } from 'express';
import { Summary, ISummary } from '../models/Summary';

/**
 * Get all summaries for the current tenant
 */
export const getSummaries = async (req: Request, res: Response) => {
  try {
    const { tenant: tenantId } = req.user!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const summaryType = req.query.summaryType as string;
    const rut = req.query.rut as string;

    // Build query
    const query: any = { tenantId };
    if (summaryType) {
      query.summaryType = summaryType;
    }
    if (rut) {
      query.rut = rut;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get summaries with pagination
    const summaries = await Summary.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count
    const total = await Summary.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        summaries,
        pagination: {
          current: page,
          total: totalPages,
          limit,
          totalItems: total
        }
      }
    });
  } catch (error) {
    console.error('Error getting summaries:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving summaries'
    });
  }
};

/**
 * Get a specific summary by ID
 */
export const getSummaryById = async (req: Request, res: Response) => {
  try {
    const { tenant: tenantId } = req.user!;
    const { id } = req.params;

    const summary = await Summary.findOne({ _id: id, tenantId }).lean();

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: 'Summary not found'
      });
    }

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error getting summary by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving summary'
    });
  }
};

/**
 * Get summaries by RUT
 */
export const getSummariesByRut = async (req: Request, res: Response) => {
  try {
    const { tenant: tenantId } = req.user!;
    const { rut } = req.params;
    const summaryType = req.query.summaryType as string;

    // Build query
    const query: any = { tenantId, rut };
    if (summaryType) {
      query.summaryType = summaryType;
    }

    const summaries = await Summary.find(query)
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: summaries
    });
  } catch (error) {
    console.error('Error getting summaries by RUT:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving summaries for RUT'
    });
  }
};

/**
 * Delete a summary by ID
 */
export const deleteSummary = async (req: Request, res: Response) => {
  try {
    const { tenant: tenantId } = req.user!;
    const { id } = req.params;

    const summary = await Summary.findOneAndDelete({ _id: id, tenantId });

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: 'Summary not found'
      });
    }

    res.json({
      success: true,
      message: 'Summary deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting summary'
    });
  }
};

/**
 * Get summary statistics for the current tenant
 */
export const getSummaryStats = async (req: Request, res: Response) => {
  try {
    const { tenant: tenantId } = req.user!;

    // Get total count by type
    const statsByType = await Summary.aggregate([
      { $match: { tenantId } },
      {
        $group: {
          _id: '$summaryType',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get recent summaries (last 10)
    const recentSummaries = await Summary.find({ tenantId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('rut summaryType createdAt metadata.companyName')
      .lean();

    // Get total count
    const totalSummaries = await Summary.countDocuments({ tenantId });

    // Format stats by type
    const summariesByType = statsByType.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      success: true,
      data: {
        totalSummaries,
        summariesByType,
        recentSummaries
      }
    });
  } catch (error) {
    console.error('Error getting summary statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving summary statistics'
    });
  }
};