import { Request, Response } from 'express';
import { z } from 'zod';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import { it } from 'date-fns/locale';
import { TenantBilling } from '../models/tenantBilling.model';
import { AIOperationLog } from '../models/AIOperationLog';
import { Tenant } from '../models/tenant.model';
import { CreditOperation } from '../models/creditOperation.model';
import { BillingSettings } from '../models/billingSettings.model';
import mongoose from 'mongoose';

// Validation schemas
const billingFiltersSchema = z.object({
  tenantId: z.string().optional(),
  status: z.string().optional().refine((val) => !val || ['pending', 'paid', 'overdue'].includes(val), {
    message: "Status must be 'pending', 'paid', 'overdue', or empty"
  }),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional()
});

const trafficReportFiltersSchema = z.object({
  tenantId: z.string().optional(),
  month: z.string().optional(),
  year: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional()
});

const generateInvoiceSchema = z.object({
  tenantId: z.string(),
  month: z.number().min(1).max(12),
  year: z.number().min(2020)
});

const updateInvoiceStatusSchema = z.object({
  status: z.enum(['pending', 'paid', 'overdue'])
});

const generateAllInvoicesSchema = z.object({
  month: z.number().min(1).max(12),
  year: z.number().min(2020)
});

const billingSettingsSchema = z.object({
  pricing: z.object({
    evaluationPrice: z.number().min(0),
    apiCallPrice: z.number().min(0),
    tokenPrice: z.number().min(0),
    storagePrice: z.number().min(0),
    bandwidthPrice: z.number().min(0)
  }).optional(),
  currency: z.string().optional(),
  taxRate: z.number().min(0).max(1).optional(),
  invoiceSettings: z.object({
    daysUntilDue: z.number().min(1),
    autoSend: z.boolean(),
    emailTemplate: z.string()
  }).optional()
});

// Get tenant billings with filters and pagination
export const getBillings = async (req: Request, res: Response) => {
  try {
    const filters = billingFiltersSchema.parse(req.query);
    const page = parseInt(filters.page || '1');
    const limit = parseInt(filters.limit || '10');
    const skip = (page - 1) * limit;

    const where: any = {};
    
    if (filters.tenantId) {
      where.tenantId = filters.tenantId;
    }
    
    if (filters.status) {
      where.status = filters.status;
    }
    
    if (filters.startDate || filters.endDate) {
      where.billingDate = {};
      if (filters.startDate) {
        where.billingDate.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.billingDate.lte = new Date(filters.endDate);
      }
    }

    const [rawBillings, total] = await Promise.all([
      TenantBilling.find(where)
        .populate('tenantId', 'name')
        .sort({ billingDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      TenantBilling.countDocuments(where)
    ]);

    // Transform data to match frontend expectations
    const billings = rawBillings.map((billing: any) => {
      // Generate invoice number if not exists
      const invoiceNumber = `INV-${billing.billingYear}-${String(billing.billingMonth).padStart(2, '0')}-${billing.tenantId._id.toString().slice(-6).toUpperCase()}`;
      
      // Calculate due date (30 days from billing date)
      const dueDate = new Date(billing.billingDate);
      dueDate.setDate(dueDate.getDate() + 30);

      return {
        _id: billing._id,
        tenantId: billing.tenantId._id,
        tenantName: billing.tenantId.name,
        billingPeriod: {
          month: billing.billingMonth,
          year: billing.billingYear
        },
        costs: {
          evaluationCost: billing.operationsDetail?.evaluations?.amount || 0,
          apiCallCost: billing.operationsDetail?.rutLookups?.amount || 0,
          tokenCost: 0, // Not used in current implementation
          storageCost: 0, // Not used in current implementation
          totalCost: billing.totalAmount
        },
        usage: {
          totalEvaluations: billing.operationsDetail?.evaluations?.count || 0,
          totalApiCalls: billing.operationsDetail?.rutLookups?.count || 0,
          totalTokensUsed: 0, // Not used in current implementation
          totalStorageUsed: 0 // Not used in current implementation
        },
        invoice: {
          invoiceNumber: invoiceNumber,
          status: billing.status,
          dueDate: dueDate,
          createdAt: billing.createdAt
        },
        totalOperations: billing.totalOperations,
        totalCreditsUsed: billing.totalCreditsUsed,
        creditOperations: billing.creditOperations,
        paidAt: billing.paidAt,
        createdAt: billing.createdAt,
        updatedAt: billing.updatedAt
      };
    });

    res.json({
      billings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching billings:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
};

// Get billing by ID
export const getBillingById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const rawBilling = await TenantBilling.findById(id)
      .populate('tenantId', 'name')
      .lean();
    
    if (!rawBilling) {
      return res.status(404).json({ error: 'Fattura non trovata' });
    }
    
    // Transform data to match frontend expectations
    const billing: any = rawBilling;
    const invoiceNumber = `INV-${billing.billingYear}-${String(billing.billingMonth).padStart(2, '0')}-${billing.tenantId._id.toString().slice(-6).toUpperCase()}`;
    
    // Calculate due date (30 days from billing date)
    const dueDate = new Date(billing.billingDate);
    dueDate.setDate(dueDate.getDate() + 30);

    const transformedBilling = {
      _id: billing._id,
      tenantId: billing.tenantId._id,
      tenantName: billing.tenantId.name,
      billingPeriod: {
        month: billing.billingMonth,
        year: billing.billingYear
      },
      costs: {
        evaluationCost: billing.operationsDetail?.evaluations?.amount || 0,
        apiCallCost: billing.operationsDetail?.rutLookups?.amount || 0,
        tokenCost: 0, // Not used in current implementation
        storageCost: 0, // Not used in current implementation
        totalCost: billing.totalAmount
      },
      usage: {
        totalEvaluations: billing.operationsDetail?.evaluations?.count || 0,
        totalApiCalls: billing.operationsDetail?.rutLookups?.count || 0,
        totalTokensUsed: 0, // Not used in current implementation
        totalStorageUsed: 0 // Not used in current implementation
      },
      invoice: {
        invoiceNumber: invoiceNumber,
        status: billing.status,
        dueDate: dueDate,
        createdAt: billing.createdAt
      },
      totalOperations: billing.totalOperations,
      totalCreditsUsed: billing.totalCreditsUsed,
      creditOperations: billing.creditOperations,
      paidAt: billing.paidAt,
      createdAt: billing.createdAt,
      updatedAt: billing.updatedAt
    };
    
    res.json(transformedBilling);
  } catch (error) {
    console.error('Error fetching billing:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
};

// Generate invoice for a tenant
export const generateInvoice = async (req: Request, res: Response) => {
  try {
    const data = generateInvoiceSchema.parse(req.body);
    const { tenantId, month, year } = data;
    
    // Check if tenant exists
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant non trovato' });
    }
    
    // Check if billing already exists for this period
    const existingBilling = await TenantBilling.findOne({
      tenantId,
      billingMonth: month,
      billingYear: year
    });
    
    if (existingBilling) {
      return res.status(400).json({ error: 'Fattura già esistente per questo periodo' });
    }
    
    // Calculate billing period
    const billingDate = new Date(year, month - 1, 1);
    const startDate = startOfMonth(billingDate);
    const endDate = endOfMonth(billingDate);
    
    // Get credit operations for the period
    const creditOperations = await CreditOperation.find({
      tenantId,
      createdAt: {
        $gte: startDate,
        $lte: endDate
      },
      creditsChanged: { $lt: 0 } // Only deductions (negative values)
    }).populate('userId', 'name email').lean();

    if (creditOperations.length === 0) {
      return res.status(400).json({ error: 'Nessuna operazione trovata per questo periodo' });
    }

    // Aggregate operations by type
    const operationsDetail = {
      evaluations: { count: 0, credits: 0, amount: 0 },
      rutLookups: { count: 0, credits: 0, amount: 0 },
      other: { count: 0, credits: 0, amount: 0 }
    };

    const costPerCredit = 0.10; // €0.10 per credit
    let totalCreditsUsed = 0;

    creditOperations.forEach(op => {
      const credits = Math.abs(op.creditsChanged);
      const amount = credits * costPerCredit;
      totalCreditsUsed += credits;

      if (op.operationType === 'evaluation') {
        operationsDetail.evaluations.count++;
        operationsDetail.evaluations.credits += credits;
        operationsDetail.evaluations.amount += amount;
      } else if (op.operationType === 'rut_lookup') {
        operationsDetail.rutLookups.count++;
        operationsDetail.rutLookups.credits += credits;
        operationsDetail.rutLookups.amount += amount;
      } else {
        operationsDetail.other.count++;
        operationsDetail.other.credits += credits;
        operationsDetail.other.amount += amount;
      }
    });

    const totalOperations = creditOperations.length;
    const totalAmount = totalCreditsUsed * costPerCredit;

    // Create billing record
    const billing = await TenantBilling.create({
      tenantId,
      billingMonth: month,
      billingYear: year,
      billingDate,
      totalOperations,
      totalCreditsUsed,
      totalAmount,
      status: 'pending',
      operationsDetail,
      creditOperations: JSON.stringify(creditOperations)
    });
    
    await billing.populate('tenantId', 'name');

    res.status(201).json(billing);
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
};

// Generate invoices for all tenants
export const generateAllMonthlyBillings = async (req: Request, res: Response) => {
  try {
    const data = generateAllInvoicesSchema.parse(req.body);
    const { month, year } = data;
    
    // Get all tenants
    const tenants = await Tenant.find({}).select('_id name');
    
    if (tenants.length === 0) {
      return res.status(404).json({ error: 'Nessun tenant attivo trovato' });
    }
    
    const results = [];
    const errors = [];
    
    // Calculate billing period
    const billingDate = new Date(year, month - 1, 1);
    const startDate = startOfMonth(billingDate);
    const endDate = endOfMonth(billingDate);
    
    for (const tenant of tenants) {
      try {
        // Check if billing already exists for this period
        const existingBilling = await TenantBilling.findOne({
          tenantId: tenant._id,
          billingMonth: month,
          billingYear: year
        });
        
        if (existingBilling) {
          errors.push({
            tenantId: tenant._id,
            tenantName: tenant.name,
            error: 'Fattura già esistente per questo periodo'
          });
          continue;
        }
        
        // Get credit operations for the period
        const creditOperations = await CreditOperation.find({
          tenantId: tenant._id,
          createdAt: {
            $gte: startDate,
            $lte: endDate
          },
          creditsChanged: { $lt: 0 } // Only deductions (negative values)
        }).populate('userId', 'name email').lean();

        // Skip if no operations found
        if (creditOperations.length === 0) {
          errors.push({
            tenantId: tenant._id,
            tenantName: tenant.name,
            error: 'Nessuna operazione trovata per questo periodo'
          });
          continue;
        }

        // Aggregate operations by type
        const operationsDetail = {
          evaluations: { count: 0, credits: 0, amount: 0 },
          rutLookups: { count: 0, credits: 0, amount: 0 },
          other: { count: 0, credits: 0, amount: 0 }
        };

        const costPerCredit = 0.10; // €0.10 per credit
        let totalCreditsUsed = 0;

        creditOperations.forEach(op => {
          const credits = Math.abs(op.creditsChanged);
          const amount = credits * costPerCredit;
          totalCreditsUsed += credits;

          if (op.operationType === 'evaluation') {
            operationsDetail.evaluations.count++;
            operationsDetail.evaluations.credits += credits;
            operationsDetail.evaluations.amount += amount;
          } else if (op.operationType === 'rut_lookup') {
            operationsDetail.rutLookups.count++;
            operationsDetail.rutLookups.credits += credits;
            operationsDetail.rutLookups.amount += amount;
          } else {
            operationsDetail.other.count++;
            operationsDetail.other.credits += credits;
            operationsDetail.other.amount += amount;
          }
        });

        const totalOperations = creditOperations.length;
        const totalAmount = totalCreditsUsed * costPerCredit;

        // Create billing record
        const billing = await TenantBilling.create({
          tenantId: tenant._id,
          billingMonth: month,
          billingYear: year,
          billingDate,
          totalOperations,
          totalCreditsUsed,
          totalAmount,
          status: 'pending',
          operationsDetail,
          creditOperations: JSON.stringify(creditOperations)
        });
        
        await billing.populate('tenantId', 'name');
        results.push(billing);
        
      } catch (tenantError) {
        console.error(`Error generating billing for tenant ${tenant._id}:`, tenantError);
        errors.push({
          tenantId: tenant._id,
          tenantName: tenant.name,
          error: 'Errore durante la generazione della fattura'
        });
      }
    }
    
    res.status(201).json({
      message: `Generazione completata. ${results.length} fatture create, ${errors.length} errori`,
      billings: results,
      errors: errors,
      summary: {
        totalTenants: tenants.length,
        successfulBillings: results.length,
        failedBillings: errors.length
      }
    });
    
  } catch (error) {
    console.error('Error generating all monthly billings:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
};

// Update invoice status
export const updateInvoiceStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = updateInvoiceStatusSchema.parse(req.body);

    const billing = await TenantBilling.findByIdAndUpdate(
      id,
      {
        status: data.status,
        paidAt: data.status === 'paid' ? new Date() : null
      },
      { new: true }
    ).populate('tenantId', 'name');

    if (!billing) {
      return res.status(404).json({ error: 'Fattura non trovata' });
    }

    res.json(billing);
  } catch (error) {
    console.error('Error updating invoice status:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
};

// Get traffic reports
export const getTrafficReports = async (req: Request, res: Response) => {
  try {
    const { tenantId, month, year, page = '1', limit = '10' } = req.query;
    
    const matchConditions: any = {};
    
    if (tenantId) {
      matchConditions.tenantId = new mongoose.Types.ObjectId(tenantId as string);
    }
    
    // Use month/year if provided
    if (month && year) {
      const startOfMonthDate = new Date(parseInt(year as string), parseInt(month as string) - 1, 1);
      const endOfMonthDate = new Date(parseInt(year as string), parseInt(month as string), 0, 23, 59, 59, 999);
      matchConditions.createdAt = {
        $gte: startOfMonthDate,
        $lte: endOfMonthDate
      };
    }

    // Get aggregated traffic data by tenant based on credit operations
    const trafficData = await CreditOperation.aggregate([
      { $match: matchConditions },
      {
        $group: {
          _id: {
            tenantId: '$tenantId',
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt'
              }
            }
          },
          evaluations: {
            $sum: {
              $cond: [
                { $eq: ['$operationType', 'evaluation'] },
                { $abs: '$creditsChanged' },
                0
              ]
            }
          },
          apiCalls: {
            $sum: {
              $cond: [
                { $in: ['$operationType', ['evaluation', 'rut_lookup']] },
                1,
                0
              ]
            }
          },
          creditsUsed: {
            $sum: {
              $cond: [
                { $lt: ['$creditsChanged', 0] },
                { $abs: '$creditsChanged' },
                0
              ]
            }
          }
        }
      },
      {
        $group: {
          _id: '$_id.tenantId',
          dailyStats: {
            $push: {
              date: '$_id.date',
              evaluations: '$evaluations',
              apiCalls: '$apiCalls',
              tokensUsed: '$creditsUsed',
              storageUsed: 0,
              bandwidthUsed: 0
            }
          },
          totalEvaluations: { $sum: '$evaluations' },
          totalApiCalls: { $sum: '$apiCalls' },
          totalTokensUsed: { $sum: '$creditsUsed' }
        }
      },
      {
        $lookup: {
          from: 'tenants',
          localField: '_id',
          foreignField: '_id',
          as: 'tenant'
        }
      },
      {
        $addFields: {
          tenantName: { $arrayElemAt: ['$tenant.name', 0] },
          averageDailyEvaluations: {
            $cond: {
              if: { $gt: [{ $size: '$dailyStats' }, 0] },
              then: { $divide: ['$totalEvaluations', { $size: '$dailyStats' }] },
              else: 0
            }
          },
          peakDayEvaluations: { $max: '$dailyStats.evaluations' }
        }
      },
      {
        $addFields: {
          peakDate: {
            $let: {
              vars: {
                maxEval: '$peakDayEvaluations'
              },
              in: {
                $arrayElemAt: [
                  {
                    $map: {
                      input: {
                        $filter: {
                          input: '$dailyStats',
                          cond: { $eq: ['$$this.evaluations', '$$maxEval'] }
                        }
                      },
                      as: 'day',
                      in: '$$day.date'
                    }
                  },
                  0
                ]
              }
            }
          }
        }
      },
      {
        $project: {
          _id: { $toString: '$_id' },
          tenantId: { $toString: '$_id' },
          tenantName: 1,
          reportPeriod: {
            month: parseInt(month as string) || new Date().getMonth() + 1,
            year: parseInt(year as string) || new Date().getFullYear(),
            startDate: month && year ? new Date(parseInt(year as string), parseInt(month as string) - 1, 1).toISOString() : null,
            endDate: month && year ? new Date(parseInt(year as string), parseInt(month as string), 0, 23, 59, 59, 999).toISOString() : null
          },
          dailyStats: 1,
          summary: {
            totalEvaluations: '$totalEvaluations',
            totalApiCalls: '$totalApiCalls',
            totalTokensUsed: '$totalTokensUsed',
            averageDailyEvaluations: { $round: ['$averageDailyEvaluations', 2] },
            peakDayEvaluations: '$peakDayEvaluations',
            peakDate: '$peakDate'
          },
          createdAt: new Date().toISOString()
        }
      },
      {
        $sort: { 'reportPeriod.year': -1, 'reportPeriod.month': -1 }
      }
    ]);

    // Apply pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;
    
    const paginatedData = trafficData.slice(skip, skip + limitNum);
    const total = trafficData.length;
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      data: paginatedData,
      pagination: {
        currentPage: pageNum,
        totalPages,
        total,
        limit: limitNum
      }
    });
  } catch (error) {
    console.error('Error fetching traffic reports:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
};

// Generate traffic report for specific tenant
export const generateTrafficReport = async (req: Request, res: Response) => {
  try {
    // Handle both GET (params) and POST (body) requests
    const tenantId = req.params.tenantId || req.body.tenantId;
    const startDate = req.query.startDate || req.body.startDate;
    const endDate = req.query.endDate || req.body.endDate;
    const month = req.body.month;
    const year = req.body.year;
    
    const matchConditions: any = { tenantId };
    
    // Use month/year if provided, otherwise use startDate/endDate
    if (month && year) {
      const startOfMonthDate = new Date(year, month - 1, 1);
      const endOfMonthDate = new Date(year, month, 0, 23, 59, 59, 999);
      matchConditions.timestamp = {
        $gte: startOfMonthDate,
        $lte: endOfMonthDate
      };
    } else if (startDate && endDate) {
      matchConditions.timestamp = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string)
      };
    }

    const trafficData = await AIOperationLog.aggregate([
      { $match: matchConditions },
      {
        $group: {
          _id: '$operationType',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalOperations = trafficData.reduce((sum: number, item: any) => sum + item.count, 0);
    const costPerOperation = 0.10;
    const totalCost = totalOperations * costPerOperation;

    // Prepare period information
    let period;
    if (month && year) {
      period = { month, year };
    } else {
      period = { startDate, endDate };
    }

    res.json({
      tenantId,
      period,
      trafficData,
      totalOperations,
      totalCost
    });
  } catch (error) {
    console.error('Error generating traffic report:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
};

// Generate traffic reports for all tenants
export const generateAllTrafficReports = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.body;
    
    const matchConditions: any = {};
    
    if (startDate && endDate) {
      matchConditions.timestamp = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Get all tenants with traffic data
    const trafficData = await AIOperationLog.aggregate([
      { $match: matchConditions },
      {
        $group: {
          _id: {
            tenantId: '$tenantId',
            operationType: '$operationType'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.tenantId',
          operations: {
            $push: {
              type: '$_id.operationType',
              count: '$count'
            }
          },
          totalOperations: { $sum: '$count' }
        }
      },
      {
        $lookup: {
          from: 'tenants',
          localField: '_id',
          foreignField: '_id',
          as: 'tenant'
        }
      },
      {
        $project: {
          tenantId: '$_id',
          tenantName: { $arrayElemAt: ['$tenant.name', 0] },
          operations: 1,
          totalOperations: 1,
          totalCost: { $multiply: ['$totalOperations', 0.10] }
        }
      }
    ]);

    res.json({
      period: { startDate, endDate },
      reports: trafficData,
      totalTenants: trafficData.length,
      grandTotalOperations: trafficData.reduce((sum: number, item: any) => sum + item.totalOperations, 0),
      grandTotalCost: trafficData.reduce((sum: number, item: any) => sum + item.totalCost, 0)
    });
  } catch (error) {
    console.error('Error generating all traffic reports:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
};

// Get billing statistics
export const getBillingStats = async (req: Request, res: Response) => {
  try {
    const currentDate = new Date();
    const lastMonth = subMonths(currentDate, 1);
    const startOfLastMonth = startOfMonth(lastMonth);
    const endOfLastMonth = endOfMonth(lastMonth);

    const [totalRevenue, pendingInvoices, overdue, monthlyRevenue] = await Promise.all([
      TenantBilling.aggregate([
        {
          $match: { status: 'paid' }
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$totalAmount' }
          }
        }
      ]),
      
      TenantBilling.countDocuments({
        status: 'pending'
      }),
      
      TenantBilling.countDocuments({
        status: 'overdue'
      }),
      
      TenantBilling.aggregate([
        {
          $match: {
            billingDate: {
              $gte: startOfLastMonth,
              $lte: endOfLastMonth
            },
            status: 'paid'
          }
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$totalAmount' }
          }
        }
      ])
    ]);

    res.json({
      totalRevenue: totalRevenue[0]?.totalAmount || 0,
      pendingInvoices,
      overdueInvoices: overdue,
      lastMonthRevenue: monthlyRevenue[0]?.totalAmount || 0
    });
  } catch (error) {
    console.error('Error fetching billing stats:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
};

// Get credit statistics from creditoperations collection
export const getCreditStats = async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;
    const currentDate = new Date();
    const targetMonth = month ? parseInt(month as string) : currentDate.getMonth() + 1;
    const targetYear = year ? parseInt(year as string) : currentDate.getFullYear();
    
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    // Aggregate credit operations statistics
    const [creditStats, tenantCreditStats, operationTypeStats] = await Promise.all([
      // Overall credit statistics
      CreditOperation.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: null,
            totalOperations: { $sum: 1 },
            totalCreditsChanged: { $sum: '$creditsChanged' },
            totalCreditsDeducted: {
              $sum: {
                $cond: [{ $lt: ['$creditsChanged', 0] }, { $abs: '$creditsChanged' }, 0]
              }
            },
            totalCreditsAdded: {
              $sum: {
                $cond: [{ $gt: ['$creditsChanged', 0] }, '$creditsChanged', 0]
              }
            },
            averageOperation: { $avg: { $abs: '$creditsChanged' } }
          }
        }
      ]),
      
      // Credit statistics by tenant
      CreditOperation.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$tenantId',
            totalOperations: { $sum: 1 },
            totalCreditsDeducted: {
              $sum: {
                $cond: [{ $lt: ['$creditsChanged', 0] }, { $abs: '$creditsChanged' }, 0]
              }
            },
            totalCreditsAdded: {
              $sum: {
                $cond: [{ $gt: ['$creditsChanged', 0] }, '$creditsChanged', 0]
              }
            },
            lastOperation: { $max: '$createdAt' }
          }
        },
        {
          $lookup: {
            from: 'tenants',
            localField: '_id',
            foreignField: '_id',
            as: 'tenant'
          }
        },
        {
          $unwind: '$tenant'
        },
        {
          $project: {
            tenantId: '$_id',
            tenantName: '$tenant.name',
            totalOperations: 1,
            totalCreditsDeducted: 1,
            totalCreditsAdded: 1,
            lastOperation: 1
          }
        },
        {
          $sort: { totalCreditsDeducted: -1 }
        },
        {
          $limit: 10
        }
      ]),
      
      // Statistics by operation type
      CreditOperation.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$operationType',
            count: { $sum: 1 },
            totalCredits: { $sum: { $abs: '$creditsChanged' } },
            averageCredits: { $avg: { $abs: '$creditsChanged' } }
          }
        },
        {
          $sort: { count: -1 }
        }
      ])
    ]);

    // Get current credit balances for all tenants
    const tenantBalances = await Tenant.aggregate([
      {
        $project: {
          name: 1,
          availableCredits: '$creditBalance.availableCredits',
          totalCreditsUsed: '$creditBalance.totalCreditsUsed',
          lastCreditOperation: '$creditBalance.lastCreditOperation'
        }
      },
      {
        $sort: { availableCredits: -1 }
      }
    ]);

    const stats = creditStats[0] || {
      totalOperations: 0,
      totalCreditsChanged: 0,
      totalCreditsDeducted: 0,
      totalCreditsAdded: 0,
      averageOperation: 0
    };

    res.json({
      period: {
        month: targetMonth,
        year: targetYear,
        startDate,
        endDate
      },
      overview: {
        totalOperations: stats.totalOperations,
        totalCreditsDeducted: stats.totalCreditsDeducted,
        totalCreditsAdded: stats.totalCreditsAdded,
        netCreditsChange: stats.totalCreditsChanged,
        averageOperationSize: Math.round(stats.averageOperation || 0)
      },
      tenantStats: tenantCreditStats,
      operationTypeStats,
      tenantBalances: tenantBalances.slice(0, Number(process.env.TENANT_BALANCES_LIMIT || 10))
    });
  } catch (error) {
    console.error('Error fetching credit stats:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
};

// Get billing settings
export const getBillingSettings = async (req: Request, res: Response) => {
  try {
    let settings = await BillingSettings.findOne().lean();
    
    // If no settings exist, create default settings
    if (!settings) {
      settings = await BillingSettings.create({
        pricing: {
          evaluationPrice: 0.10,
          apiCallPrice: 0.05,
          tokenPrice: 0.001,
          storagePrice: 0.10,
          bandwidthPrice: 0.05
        },
        currency: 'EUR',
        taxRate: 0.21,
        invoiceSettings: {
          daysUntilDue: 30,
          autoSend: false,
          emailTemplate: 'default'
        }
      });
    }
    
    res.json(settings);
  } catch (error) {
    console.error('Error fetching billing settings:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
};

// Update billing settings
export const updateBillingSettings = async (req: Request, res: Response) => {
  try {
    const data = billingSettingsSchema.parse(req.body);
    
    let settings = await BillingSettings.findOne();
    
    if (!settings) {
      // Create new settings if none exist
      settings = await BillingSettings.create(data);
    } else {
      // Update existing settings
      Object.assign(settings, data);
      await settings.save();
    }
    
    res.json(settings);
  } catch (error) {
    console.error('Error updating billing settings:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
};
