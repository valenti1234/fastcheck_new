import { Request, Response } from 'express';
import { z } from 'zod';
import { Tenant } from '../models/tenant.model';
import { CreditOperation } from '../models/creditOperation.model';
import mongoose from 'mongoose';

// Validation schemas
const creditDeductionSchema = z.object({
  tenantId: z.string(),
  operationType: z.enum(['evaluation', 'credit_purchase', 'credit_refund', 'admin_adjustment']),
  creditsToDeduct: z.number().positive(),
  description: z.string().min(1).max(500),
  metadata: z.object({
    evaluationId: z.string().optional(),
    evaluationType: z.enum(['single', 'bulk']).optional(),
    userId: z.string().optional(),
    transactionId: z.string().optional(),
    adminUserId: z.string().optional()
  }).optional()
});

const creditAdditionSchema = z.object({
  tenantId: z.string(),
  operationType: z.enum(['credit_purchase', 'credit_refund', 'admin_adjustment']),
  creditsToAdd: z.number().positive(),
  description: z.string().min(1).max(500),
  metadata: z.object({
    transactionId: z.string().optional(),
    adminUserId: z.string().optional()
  }).optional()
});

const creditValidationSchema = z.object({
  tenantId: z.string(),
  creditsNeeded: z.number().positive()
});

// Get tenant credit balance
export const getTenantCreditBalance = async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(tenantId)) {
      return res.status(400).json({ error: 'Invalid tenant ID' });
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const creditBalance = {
      availableCredits: tenant.creditBalance?.availableCredits || 0,
      totalCreditsUsed: tenant.creditBalance?.totalCreditsUsed || 0,
      lastCreditOperation: tenant.creditBalance?.lastCreditOperation || null
    };

    res.json(creditBalance);
  } catch (error) {
    console.error('Error getting tenant credit balance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Deduct credits from tenant
export const deductCredits = async (req: Request, res: Response) => {
  try {
    const validatedData = creditDeductionSchema.parse(req.body);
    const { tenantId, operationType, creditsToDeduct, description, metadata } = validatedData;

    if (!mongoose.Types.ObjectId.isValid(tenantId)) {
      return res.status(400).json({ error: 'Invalid tenant ID' });
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const currentCredits = tenant.creditBalance?.availableCredits || 0;
    if (currentCredits < creditsToDeduct) {
      return res.status(400).json({ 
        error: 'Insufficient credits',
        availableCredits: currentCredits,
        creditsNeeded: creditsToDeduct
      });
    }

    // Update tenant credit balance
    const newBalance = currentCredits - creditsToDeduct;
    const totalUsed = (tenant.creditBalance?.totalCreditsUsed || 0) + creditsToDeduct;

    await Tenant.findByIdAndUpdate(
      tenantId,
      {
        $set: {
          'creditBalance.availableCredits': newBalance,
          'creditBalance.totalCreditsUsed': totalUsed,
          'creditBalance.lastCreditOperation': new Date()
        }
      }
    );

    // Create credit operation record
    const creditOperation = new CreditOperation({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      userId: metadata?.userId ? new mongoose.Types.ObjectId(metadata.userId) : undefined,
      operationType,
      creditsChanged: -creditsToDeduct,
      balanceAfter: newBalance,
      description,
      metadata
    });

    await creditOperation.save();

    res.json({
      success: true,
      creditsDeducted: creditsToDeduct,
      remainingCredits: newBalance,
      operationId: creditOperation._id
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error deducting credits:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Add credits to tenant
export const addCredits = async (req: Request, res: Response) => {
  try {
    const validatedData = creditAdditionSchema.parse(req.body);
    const { tenantId, operationType, creditsToAdd, description, metadata } = validatedData;

    if (!mongoose.Types.ObjectId.isValid(tenantId)) {
      return res.status(400).json({ error: 'Invalid tenant ID' });
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const currentCredits = tenant.creditBalance?.availableCredits || 0;
    const newBalance = currentCredits + creditsToAdd;

    // Update tenant credit balance
    await Tenant.findByIdAndUpdate(
      tenantId,
      {
        $set: {
          'creditBalance.availableCredits': newBalance,
          'creditBalance.lastCreditOperation': new Date()
        }
      }
    );

    // Create credit operation record
    const creditOperation = new CreditOperation({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      operationType,
      creditsChanged: creditsToAdd,
      balanceAfter: newBalance,
      description,
      metadata
    });

    await creditOperation.save();

    res.json({
      success: true,
      creditsAdded: creditsToAdd,
      newBalance: newBalance,
      operationId: creditOperation._id
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error adding credits:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Validate if tenant has enough credits
export const validateCredits = async (req: Request, res: Response) => {
  try {
    const validatedData = creditValidationSchema.parse(req.body);
    const { tenantId, creditsNeeded } = validatedData;

    if (!mongoose.Types.ObjectId.isValid(tenantId)) {
      return res.status(400).json({ error: 'Invalid tenant ID' });
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const availableCredits = tenant.creditBalance?.availableCredits || 0;
    const hasEnoughCredits = availableCredits >= creditsNeeded;

    res.json({
      hasEnoughCredits,
      availableCredits,
      creditsNeeded,
      remainingCredits: availableCredits
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error validating credits:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get credit operations history
export const getCreditOperations = async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(tenantId)) {
      return res.status(400).json({ error: 'Invalid tenant ID' });
    }

    const operations = await CreditOperation.find({ tenantId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name email');

    const total = await CreditOperation.countDocuments({ tenantId });

    res.json({
      operations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting credit operations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};