import { Response } from 'express';
import { Tenant } from '../models/tenant.model';
import { User } from '../models/user.model';
import { AuthenticatedRequest } from '../types/auth';
import { EvaluationJob, EvaluationResult } from '../models/evaluation';
import { CreditOperation } from '../models/creditOperation.model';
import mongoose from 'mongoose';
import elkService from '../services/elkService';

export const getCurrentTenant = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // The tenant middleware ensures req.user exists and req.tenantId is set
    const userId = req.user!.id;
    const tenantId = req.tenantId;

    // Log tenant fetch attempt
    elkService.logBusinessEvent('tenant_fetch_requested', {
      tenantId,
      requestedBy: userId
    }, userId, tenantId);

    // Find the tenant directly using the tenantId from middleware
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      elkService.logBusinessEvent('tenant_fetch_failed', {
        tenantId,
        requestedBy: userId,
        reason: 'tenant_not_found'
      }, userId, tenantId);
      return res.status(404).json({ message: 'Tenant not found' });
    }

    // Log successful tenant fetch
    elkService.logBusinessEvent('tenant_fetched', {
      tenantId,
      tenantName: tenant.name,
      requestedBy: userId
    }, userId, tenantId);

    res.json(tenant);
  } catch (error) {
    console.error('Error fetching tenant:', error);
    elkService.logSystemError(
      error instanceof Error ? error : new Error('Unknown error'),
      'tenant_fetch',
      { tenantId: req.tenantId, userId: req.user?.id }
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateTenant = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // The tenant middleware ensures req.user exists and req.tenantId is set
    const tenantId = req.tenantId;
    const userId = req.user!.id;
    
    // Only allow tenant_admin or superuser to update tenant
    if (!['tenant_admin', 'superuser'].includes(req.user!.role)) {
      elkService.logBusinessEvent('tenant_update_failed', {
        tenantId,
        updatedBy: userId,
        reason: 'insufficient_permissions',
        userRole: req.user!.role
      }, userId, tenantId);
      return res.status(403).json({ message: 'Forbidden' });
    }

    // Log tenant update attempt
    elkService.logBusinessEvent('tenant_update_attempted', {
      tenantId,
      updatedBy: userId,
      updateData: req.body
    }, userId, tenantId);

    const updatedTenant = await Tenant.findByIdAndUpdate(
      tenantId,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    
    if (!updatedTenant) {
      elkService.logBusinessEvent('tenant_update_failed', {
        tenantId,
        updatedBy: userId,
        reason: 'tenant_not_found'
      }, userId, tenantId);
      return res.status(404).json({ message: 'Tenant not found' });
    }

    // Log successful tenant update
    elkService.logBusinessEvent('tenant_updated', {
      tenantId,
      tenantName: updatedTenant.name,
      updatedBy: userId,
      updatedFields: Object.keys(req.body)
    }, userId, tenantId);

    res.json(updatedTenant);
  } catch (error) {
    console.error('Error updating tenant:', error);
    elkService.logSystemError(
      error instanceof Error ? error : new Error('Unknown error'),
      'tenant_update',
      { tenantId: req.tenantId, userId: req.user?.id }
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Super Admin Tenant Management

export const getAllTenants = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Only superusers can access this endpoint
    if (req.user!.role !== 'superuser') {
      return res.status(403).json({ message: 'Forbidden - Superuser access required' });
    }

    const userId = req.user!.id;

    // Log tenants list request
    elkService.logBusinessEvent('tenants_list_requested', {
      requestedBy: userId
    }, userId);

    const tenants = await Tenant.find({});

    // Log successful tenants list fetch
    elkService.logBusinessEvent('tenants_list_fetched', {
      requestedBy: userId,
      tenantsCount: tenants.length
    }, userId);

    res.json(tenants);
  } catch (error) {
    console.error('Error fetching tenants:', error);
    elkService.logSystemError(
      error instanceof Error ? error : new Error('Unknown error'),
      'tenants_list_fetch',
      { userId: req.user?.id }
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getTenantById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Only superusers can access this endpoint
    if (req.user!.role !== 'superuser') {
      return res.status(403).json({ message: 'Forbidden - Superuser access required' });
    }

    const tenantId = req.params.id;
    const userId = req.user!.id;

    // Log tenant fetch by ID request
    elkService.logBusinessEvent('tenant_by_id_requested', {
      tenantId,
      requestedBy: userId
    }, userId, tenantId);

    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      elkService.logBusinessEvent('tenant_by_id_failed', {
        tenantId,
        requestedBy: userId,
        reason: 'tenant_not_found'
      }, userId, tenantId);
      return res.status(404).json({ message: 'Tenant not found' });
    }

    // Log successful tenant fetch by ID
    elkService.logBusinessEvent('tenant_by_id_fetched', {
      tenantId,
      tenantName: tenant.name,
      requestedBy: userId
    }, userId, tenantId);

    res.json(tenant);
  } catch (error) {
    console.error('Error fetching tenant:', error);
    elkService.logSystemError(
      error instanceof Error ? error : new Error('Unknown error'),
      'tenant_by_id_fetch',
      { tenantId: req.params.id, userId: req.user?.id }
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const createTenant = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Only superusers can access this endpoint
    if (req.user!.role !== 'superuser') {
      return res.status(403).json({ message: 'Forbidden - Superuser access required' });
    }

    const { name, settings, usageStats, creditBalance } = req.body;
    const userId = req.user!.id;

    // Log tenant creation attempt
    elkService.logBusinessEvent('tenant_creation_attempted', {
      tenantName: name,
      createdBy: userId,
      tenantData: { name, settings: !!settings, usageStats: !!usageStats, creditBalance: !!creditBalance }
    }, userId);

    const newTenant = new Tenant({
      name,
      isActive: false, // Tenant requires superadmin activation
      settings: settings || {},
      usageStats: {
        evaluationsRemaining: usageStats?.evaluationsRemaining || 100,
        evaluationsUsed: usageStats?.evaluationsUsed || 0,
        lastEvaluationDate: usageStats?.lastEvaluationDate || null
      },
      creditBalance: {
        availableCredits: creditBalance?.availableCredits ?? 100,
        totalCreditsUsed: creditBalance?.totalCreditsUsed ?? 0,
        lastCreditOperation: null
      }
    });

    const savedTenant = await newTenant.save();

    // Log successful tenant creation
    elkService.logBusinessEvent('tenant_created', {
      tenantId: savedTenant._id,
      tenantName: savedTenant.name,
      createdBy: userId
    }, userId, savedTenant._id.toString());

    res.status(201).json(savedTenant);
  } catch (error) {
    console.error('Error creating tenant:', error);
    elkService.logSystemError(
      error instanceof Error ? error : new Error('Unknown error'),
      'tenant_creation',
      { userId: req.user?.id }
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateTenantById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Only superusers can access this endpoint
    if (req.user!.role !== 'superuser') {
      return res.status(403).json({ message: 'Forbidden - Superuser access required' });
    }

    const updatedTenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    
    if (!updatedTenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    res.json(updatedTenant);
  } catch (error) {
    console.error('Error updating tenant:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteTenant = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Only superusers can access this endpoint
    if (req.user!.role !== 'superuser') {
      return res.status(403).json({ message: 'Forbidden - Superuser access required' });
    }

    const tenantId = req.params.id;
    const userId = req.user!.id;

    // Log tenant deletion attempt
    elkService.logBusinessEvent('tenant_deletion_attempted', {
      tenantId,
      deletedBy: userId
    }, userId, tenantId);

    // Find the tenant
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      elkService.logBusinessEvent('tenant_deletion_failed', {
        tenantId,
        deletedBy: userId,
        reason: 'tenant_not_found'
      }, userId, tenantId);
      return res.status(404).json({ message: 'Tenant not found' });
    }

    // Check if there are users associated with this tenant
    const usersCount = await User.countDocuments({ tenant: req.params.id });
    if (usersCount > 0) {
      elkService.logBusinessEvent('tenant_deletion_failed', {
        tenantId,
        deletedBy: userId,
        reason: 'has_associated_users',
        usersCount
      }, userId, tenantId);
      return res.status(400).json({
        message: 'Cannot delete tenant with associated users. Please delete or reassign users first.'
      });
    }

    // Delete the tenant
    await Tenant.findByIdAndDelete(req.params.id);
    
    // Log successful tenant deletion
    elkService.logBusinessEvent('tenant_deleted', {
      tenantId,
      tenantName: tenant.name,
      deletedBy: userId
    }, userId, tenantId);
    
    res.status(200).json({ message: 'Tenant deleted successfully' });
  } catch (error) {
    console.error('Error deleting tenant:', error);
    elkService.logSystemError(
      error instanceof Error ? error : new Error('Unknown error'),
      'tenant_deletion',
      { tenantId: req.params.id, userId: req.user?.id }
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getTenantUsers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // Only superusers can access this endpoint
    if (req.user!.role !== 'superuser') {
      return res.status(403).json({ message: 'Forbidden - Superuser access required' });
    }

    // Find the tenant
    const tenant = await Tenant.findById(id);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    // Get all users for this tenant
    const users = await User.find({ tenant: id }).select('-password');

    res.json(users);
  } catch (error) {
    console.error('Error fetching tenant users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Superadmin function to activate/deactivate tenants
export const superAdminToggleTenantStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    // Only superusers can use this endpoint
    if (req.user!.role !== 'superuser') {
      return res.status(403).json({ message: 'Access denied. Superuser role required.' });
    }

    // Log superadmin tenant status toggle attempt
    elkService.logBusinessEvent('superadmin_tenant_status_toggle_attempted', {
      toggledBy: req.user!.id,
      targetTenantId: id
    }, req.user!.id, 'system');

    // Find tenant
    const tenant = await Tenant.findById(id);
    if (!tenant) {
      elkService.logBusinessEvent('superadmin_tenant_status_toggle_failed', {
        toggledBy: req.user!.id,
        targetTenantId: id,
        reason: 'tenant_not_found'
      }, req.user!.id, 'system');
      
      return res.status(404).json({ message: 'Tenant not found' });
    }

    // Store original status for logging
    const originalStatus = tenant.isActive;

    // Toggle status
    tenant.isActive = !tenant.isActive;
    await tenant.save();

    // Log successful status toggle
    elkService.logBusinessEvent('superadmin_tenant_status_toggled', {
      toggledBy: req.user!.id,
      targetTenantId: id,
      originalStatus,
      newStatus: tenant.isActive
    }, req.user!.id, 'system');

    res.json({
      id: tenant._id,
      isActive: tenant.isActive,
      message: tenant.isActive ? 'Tenant activated successfully' : 'Tenant deactivated successfully'
    });
  } catch (error) {
    console.error('Error toggling tenant status:', error);
    
    elkService.logBusinessEvent('superadmin_tenant_status_toggle_failed', {
      toggledBy: req.user!.id,
      targetTenantId: req.params.id,
      reason: 'server_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, req.user!.id, 'system');
    
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getTenantStatistics = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Only superusers can access this endpoint
    if (req.user!.role !== 'superuser') {
      return res.status(403).json({ message: 'Forbidden - Superuser access required' });
    }

    // Get all tenants with their usage stats
    const tenants = await Tenant.find({});

    
    // Calculate real statistics from credit operations
    const totalTenants = tenants.length;
    
    // Get total operations that consumed credits (all types with negative creditsChanged)
    
    const creditConsumingOperations = await CreditOperation.find({
      creditsChanged: { $lt: 0 } // Only deductions (actual credit consumption)
    });
    
    // Calculate total evaluations from actual results
    const totalEvaluationsUsed = await EvaluationResult.countDocuments({});
    
    // Calculate remaining credits for all tenants
    const totalEvaluationsRemaining = tenants.reduce((sum, tenant) => sum + (tenant.creditBalance?.availableCredits || 0), 0);
    const totalEvaluationsAllocated = totalEvaluationsUsed + totalEvaluationsRemaining;
    
    // Get tenant evaluation statistics from actual evaluation results
    const tenantEvaluationStats = await EvaluationResult.aggregate([
      {
        $group: {
          _id: '$tenantId',
          evaluationsUsed: { $sum: 1 },
          lastEvaluationDate: { $max: '$createdAt' }
        }
      }
    ]);
    
    // Also get credit operation stats for comparison
    const tenantCreditStats = await CreditOperation.aggregate([
      {
        $match: {
          creditsChanged: { $lt: 0 }
        }
      },
      {
        $addFields: {
          tenantIdString: { $toString: '$tenantId' }
        }
      },
      {
        $group: {
          _id: '$tenantIdString',
          creditOperationsUsed: { $sum: 1 },
          lastCreditOperation: { $max: '$createdAt' }
        }
      }
    ]);
    
    // Create maps for quick lookup
    const tenantStatsMap = new Map();
    tenantEvaluationStats.forEach(stat => {
      tenantStatsMap.set(stat._id.toString(), {
        evaluationsUsed: stat.evaluationsUsed,
        lastEvaluationDate: stat.lastEvaluationDate
      });
    });
    
    const tenantCreditMap = new Map();
    tenantCreditStats.forEach(stat => {
      tenantCreditMap.set(stat._id.toString(), {
        creditOperationsUsed: stat.creditOperationsUsed,
        lastCreditOperation: stat.lastCreditOperation
      });
    });
    
    // Get evaluation statistics per tenant using real credit operations data
    const evaluationStats = await Promise.all(tenants.map(async (tenant) => {
      const tenantId = tenant._id.toString();
      
      // Count total evaluations from evaluationjobs collection
       const totalEvaluationsFromJobs = await EvaluationJob.aggregate([
         {
           $match: {
             tenantId: tenantId,
             $and: [
               { tenantId: { $ne: null } },
               { tenantId: { $exists: true } }
             ]
           }
         },
        {
          $group: {
            _id: null,
            totalEvaluations: { $sum: '$totalEvaluations' },
            completedEvaluations: { $sum: '$completedEvaluations' },
            failedEvaluations: { $sum: '$failedEvaluations' }
          }
        }
      ]);
      
      const jobStats = totalEvaluationsFromJobs[0] || {
        totalEvaluations: 0,
        completedEvaluations: 0,
        failedEvaluations: 0
      };
      
      // Get real evaluation data from tenantStatsMap (actual results)
      const realStats = tenantStatsMap.get(tenantId) || {
        evaluationsUsed: 0,
        lastEvaluationDate: null
      };
      
      // Get credit operation data for comparison
      const creditStats = tenantCreditMap.get(tenantId) || {
        creditOperationsUsed: 0,
        lastCreditOperation: null
      };
      
      return {
        tenantId,
        tenantName: tenant.name,
        totalEvaluationsFromJobs: jobStats.totalEvaluations,
        completedEvaluations: jobStats.completedEvaluations,
        failedEvaluations: jobStats.failedEvaluations,
        evaluationsUsed: realStats.evaluationsUsed, // From actual results
        creditOperationsUsed: creditStats.creditOperationsUsed, // From credit operations
        evaluationsRemaining: tenant.creditBalance?.availableCredits || 0,
        lastEvaluationDate: realStats.lastEvaluationDate,
        lastCreditOperation: creditStats.lastCreditOperation
      };
    }));
    
    // Get active tenants (those who have used at least one evaluation)
    const activeTenants = tenantEvaluationStats.length;
    
    // Get tenants with recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentlyActiveTenants = tenantEvaluationStats.filter(stat => 
      stat.lastEvaluationDate && new Date(stat.lastEvaluationDate) > thirtyDaysAgo
    ).length;
    
    // Get usage distribution based on real credit operations
    const usageDistribution = {
      heavy: tenantEvaluationStats.filter(stat => stat.evaluationsUsed > 50).length,
      moderate: tenantEvaluationStats.filter(stat => stat.evaluationsUsed > 10 && stat.evaluationsUsed <= 50).length,
      light: tenantEvaluationStats.filter(stat => stat.evaluationsUsed > 0 && stat.evaluationsUsed <= 10).length,
      inactive: totalTenants - tenantEvaluationStats.length
    };
    
    // Get top tenants by usage from credit operations
    const topTenantsLimit = Number(process.env.TOP_TENANTS_LIMIT || 5);
    const topTenants = tenantEvaluationStats
      .sort((a, b) => b.evaluationsUsed - a.evaluationsUsed)
      .slice(0, topTenantsLimit)
      .map(stat => {
        const tenant = tenants.find(t => t._id.toString() === stat._id.toString());
        return {
          id: stat._id,
          name: tenant?.name || 'Unknown',
          evaluationsUsed: stat.evaluationsUsed,
          evaluationsRemaining: tenant?.creditBalance?.availableCredits || 0,
          lastEvaluationDate: stat.lastEvaluationDate
        };
      });
    
    // Get tenant creation trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const recentTenants = tenants.filter(tenant => new Date(tenant.createdAt) > sixMonthsAgo);
    
    const monthlyCreation = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date();
      monthStart.setMonth(monthStart.getMonth() - i);
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      
      const count = recentTenants.filter(tenant => {
        const createdAt = new Date(tenant.createdAt);
        return createdAt >= monthStart && createdAt < monthEnd;
      }).length;
      
      monthlyCreation.push({
        month: monthStart.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' }),
        count
      });
    }
    
    const statistics = {
      overview: {
        totalTenants,
        activeTenants,
        recentlyActiveTenants,
        totalEvaluationsUsed,
        totalEvaluationsRemaining,
        totalEvaluationsAllocated,
        averageUsagePerTenant: totalTenants > 0 ? Math.round(totalEvaluationsUsed / totalTenants) : 0
      },
      usageDistribution,
      topTenants,
      monthlyCreation,
      evaluationStats: {
        perTenant: evaluationStats,
        totals: {
          totalEvaluationsFromJobs: evaluationStats.reduce((sum, stat) => sum + stat.totalEvaluationsFromJobs, 0),
          totalCompletedEvaluations: evaluationStats.reduce((sum, stat) => sum + stat.completedEvaluations, 0),
          totalFailedEvaluations: evaluationStats.reduce((sum, stat) => sum + stat.failedEvaluations, 0)
        }
      }
    };
    
    res.json(statistics);
  } catch (error) {
    console.error('Error fetching tenant statistics:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
