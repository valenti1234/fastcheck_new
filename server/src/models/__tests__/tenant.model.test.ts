import mongoose from 'mongoose';
import { Tenant, ITenant } from '../tenant.model';

describe('Tenant Model', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test');
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await Tenant.deleteMany({});
  });

  describe('Schema Validation', () => {
    it('should create a tenant with valid data', async () => {
      const tenantData = {
        name: 'Test Company',
        settings: {
          evaluationThreshold: 75,
          autoApproval: true,
          notificationEmail: 'admin@testcompany.com',
        },
        usageStats: {
          evaluationsRemaining: 90,
          evaluationsUsed: 10,
        },
        creditBalance: {
          availableCredits: 500,
          totalCreditsUsed: 100,
        },
      };

      const tenant = new Tenant(tenantData);
      const savedTenant = await tenant.save();

      expect(savedTenant._id).toBeDefined();
      expect(savedTenant.name).toBe('Test Company');
      expect(savedTenant.settings.get('evaluationThreshold')).toBe(75);
      expect(savedTenant.settings.get('autoApproval')).toBe(true);
      expect(savedTenant.settings.get('notificationEmail')).toBe('admin@testcompany.com');
      expect(savedTenant.usageStats.evaluationsRemaining).toBe(90);
      expect(savedTenant.usageStats.evaluationsUsed).toBe(10);
      expect(savedTenant.creditBalance.availableCredits).toBe(500);
      expect(savedTenant.createdAt).toBeDefined();
      expect(savedTenant.updatedAt).toBeDefined();
    });

    it('should require name field', async () => {
      const tenant = new Tenant({});
      
      await expect(tenant.save()).rejects.toThrow(/name.*required/);
    });

    it('should trim whitespace from name', async () => {
      const tenant = new Tenant({
        name: '  Test Company  ',
      });
      
      const savedTenant = await tenant.save();
      expect(savedTenant.name).toBe('Test Company');
    });

    it('should set default values for settings', async () => {
      const tenant = new Tenant({
        name: 'Test Company',
      });
      
      const savedTenant = await tenant.save();
      expect(savedTenant.settings.size).toBe(0); // Empty Map by default
    });

    it('should set default values for usageStats', async () => {
      const tenant = new Tenant({
        name: 'Test Company',
      });
      
      const savedTenant = await tenant.save();
      expect(savedTenant.usageStats.evaluationsRemaining).toBe(100);
      expect(savedTenant.usageStats.evaluationsUsed).toBe(0);
    });

    it('should set default credit balance', async () => {
      const tenant = new Tenant({
        name: 'Test Company',
      });
      
      const savedTenant = await tenant.save();
      expect(savedTenant.creditBalance.availableCredits).toBe(100);
      expect(savedTenant.creditBalance.totalCreditsUsed).toBe(0);
    });
  });

  describe('Database Operations', () => {
    let tenant: ITenant;

    beforeEach(async () => {
      tenant = await Tenant.create({
        name: 'Test Company',
        settings: {
          evaluationThreshold: 80,
          autoApproval: true,
          notificationEmail: 'admin@test.com',
        },
        usageStats: {
          evaluationsRemaining: 95,
          evaluationsUsed: 5,
        },
        creditBalance: {
          availableCredits: 1000,
          totalCreditsUsed: 200,
        },
      });
    });

    it('should find tenant by id', async () => {
      const foundTenant = await Tenant.findById(tenant._id);
      
      expect(foundTenant).toBeTruthy();
      expect(foundTenant!.name).toBe('Test Company');
      expect(foundTenant!.creditBalance.availableCredits).toBe(1000);
    });

    it('should find tenant by name', async () => {
      const foundTenant = await Tenant.findOne({ name: 'Test Company' });
      
      expect(foundTenant).toBeTruthy();
      expect(foundTenant!._id.toString()).toBe(tenant._id.toString());
    });

    it('should update tenant settings', async () => {
      const updatedTenant = await Tenant.findByIdAndUpdate(
        tenant._id,
        {
          $set: {
            'settings.evaluationThreshold': 90,
            'settings.autoApproval': false,
          },
        },
        { new: true }
      );
      
      expect(updatedTenant!.settings.get('evaluationThreshold')).toBe(90);
      expect(updatedTenant!.settings.get('autoApproval')).toBe(false);
      expect(updatedTenant!.settings.get('notificationEmail')).toBe('admin@test.com');
    });

    it('should update usage statistics', async () => {
      const updatedTenant = await Tenant.findByIdAndUpdate(
        tenant._id,
        {
          $inc: {
            'usageStats.evaluationsUsed': 3,
          },
          $set: {
            'usageStats.evaluationsRemaining': 92,
          },
        },
        { new: true }
      );
      
      expect(updatedTenant!.usageStats.evaluationsUsed).toBe(8);
      expect(updatedTenant!.usageStats.evaluationsRemaining).toBe(92);
    });

    it('should update credit balance', async () => {
      const updatedTenant = await Tenant.findByIdAndUpdate(
        tenant._id,
        {
          $inc: {
            'creditBalance.availableCredits': -100,
            'creditBalance.totalCreditsUsed': 100,
          },
        },
        { new: true }
      );
      
      expect(updatedTenant!.creditBalance.availableCredits).toBe(900);
      expect(updatedTenant!.creditBalance.totalCreditsUsed).toBe(300);
    });

    it('should delete tenant', async () => {
      await Tenant.findByIdAndDelete(tenant._id);
      
      const deletedTenant = await Tenant.findById(tenant._id);
      expect(deletedTenant).toBeNull();
    });

    it('should find tenants with low credit balance', async () => {
      await Tenant.create({
        name: 'Low Credit Company',
        creditBalance: {
          availableCredits: 50,
          totalCreditsUsed: 0,
        },
      });
      
      await Tenant.create({
        name: 'High Credit Company',
        creditBalance: {
          availableCredits: 2000,
          totalCreditsUsed: 0,
        },
      });
      
      const lowCreditTenants = await Tenant.find({ 'creditBalance.availableCredits': { $lt: 100 } });
      
      expect(lowCreditTenants).toHaveLength(1);
      expect(lowCreditTenants[0].name).toBe('Low Credit Company');
    });

    it('should find tenants with high usage', async () => {
      await Tenant.create({
        name: 'High Usage Company',
        usageStats: {
          evaluationsRemaining: 0,
          evaluationsUsed: 100,
        },
      });
      
      const highUsageTenants = await Tenant.find({
        'usageStats.evaluationsUsed': { $gte: 50 },
      });
      
      expect(highUsageTenants).toHaveLength(1);
      expect(highUsageTenants[0].name).toBe('High Usage Company');
    });
  });

  describe('Timestamps', () => {
    it('should set createdAt and updatedAt on creation', async () => {
      const tenant = await Tenant.create({
        name: 'Test Company',
      });
      
      expect(tenant.createdAt).toBeDefined();
      expect(tenant.updatedAt).toBeDefined();
      expect(tenant.createdAt).toEqual(tenant.updatedAt);
    });

    it('should update updatedAt on modification', async () => {
      const tenant = await Tenant.create({
        name: 'Test Company',
      });
      
      const originalUpdatedAt = tenant.updatedAt;
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      tenant.name = 'Updated Company';
      await tenant.save();
      
      expect(tenant.updatedAt).not.toEqual(originalUpdatedAt);
      expect(tenant.updatedAt > originalUpdatedAt).toBe(true);
    });
  });
});
