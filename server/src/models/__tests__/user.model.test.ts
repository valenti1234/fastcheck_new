import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, IUser } from '../user.model';
import { Tenant } from '../tenant.model';
import '../../../setupTests';

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

describe('User Model', () => {
  let tenantId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    // Create a test tenant
    const tenant = new Tenant({
      name: 'Test Tenant',
      settings: {},
      usageStats: {
        evaluationsRemaining: 100,
        evaluationsUsed: 0,
        lastEvaluationDate: null,
      },
      creditBalance: {
        availableCredits: 100,
        totalCreditsUsed: 0,
        lastCreditOperation: null,
      },
    });
    await tenant.save();
    tenantId = tenant._id;
  });

  afterEach(async () => {
    await User.deleteMany({});
    await Tenant.deleteMany({});
    jest.clearAllMocks();
  });

  describe('Schema Validation', () => {
    it('should create a valid user with all required fields', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'evaluator' as const,
        tenant: tenantId,
        isActive: true,
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser.name).toBe(userData.name);
      expect(savedUser.email).toBe(userData.email);
      expect(savedUser.password).toBe(userData.password);
      expect(savedUser.role).toBe(userData.role);
      expect(savedUser.tenant).toEqual(tenantId);
      expect(savedUser.isActive).toBe(userData.isActive);
      expect(savedUser.createdAt).toBeDefined();
      expect(savedUser.updatedAt).toBeDefined();
    });

    it('should create a user with default values', async () => {
      const userData = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'password123',
        tenant: tenantId,
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser.role).toBe('evaluator'); // Default role
      expect(savedUser.isActive).toBe(false); // Default isActive changed to false
    });

    it('should fail validation when required fields are missing', async () => {
      const userData = {
        email: 'incomplete@example.com',
        password: 'password123',
      };

      const user = new User(userData);
      
      await expect(user.save()).rejects.toThrow();
    });

    it('should fail validation when name is missing', async () => {
      const userData = {
        email: 'noname@example.com',
        password: 'password123',
        tenant: tenantId,
      };

      const user = new User(userData);
      
      await expect(user.save()).rejects.toThrow(/name.*required/);
    });

    it('should fail validation when email is missing', async () => {
      const userData = {
        name: 'No Email',
        password: 'password123',
        tenant: tenantId,
      };

      const user = new User(userData);
      
      await expect(user.save()).rejects.toThrow(/email.*required/);
    });

    it('should fail validation when password is missing', async () => {
      const userData = {
        name: 'No Password',
        email: 'nopassword@example.com',
        tenant: tenantId,
      };

      const user = new User(userData);
      
      await expect(user.save()).rejects.toThrow(/password.*required/);
    });

    it('should fail validation when tenant is missing', async () => {
      const userData = {
        name: 'No Tenant',
        email: 'notenant@example.com',
        password: 'password123',
      };

      const user = new User(userData);
      
      await expect(user.save()).rejects.toThrow(/tenant.*required/);
    });

    it('should fail validation when password is too short', async () => {
      const userData = {
        name: 'Short Password',
        email: 'short@example.com',
        password: '123', // Less than 6 characters
        tenant: tenantId,
      };

      const user = new User(userData);
      
      await expect(user.save()).rejects.toThrow(/shorter than the minimum/);
    });

    it('should fail validation with invalid role', async () => {
      const userData = {
        name: 'Invalid Role',
        email: 'invalid@example.com',
        password: 'password123',
        role: 'invalid_role' as any,
        tenant: tenantId,
      };

      const user = new User(userData);
      
      await expect(user.save()).rejects.toThrow(/not a valid enum value/);
    });

    it('should enforce unique email constraint', async () => {
      const userData1 = {
        name: 'User One',
        email: 'duplicate@example.com',
        password: 'password123',
        tenant: tenantId,
      };

      const userData2 = {
        name: 'User Two',
        email: 'duplicate@example.com', // Same email
        password: 'password456',
        tenant: tenantId,
      };

      const user1 = new User(userData1);
      await user1.save();

      const user2 = new User(userData2);
      await expect(user2.save()).rejects.toThrow(/duplicate key/);
    });

    it('should convert email to lowercase', async () => {
      const userData = {
        name: 'Uppercase Email',
        email: 'UPPERCASE@EXAMPLE.COM',
        password: 'password123',
        tenant: tenantId,
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser.email).toBe('uppercase@example.com');
    });

    it('should trim whitespace from name and email', async () => {
      const userData = {
        name: '  Trimmed Name  ',
        email: '  trimmed@example.com  ',
        password: 'password123',
        tenant: tenantId,
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser.name).toBe('Trimmed Name');
      expect(savedUser.email).toBe('trimmed@example.com');
    });
  });

  describe('Role Validation', () => {
    const validRoles = ['superuser', 'tenant_admin', 'evaluator', 'read_only', 'write_only'];

    validRoles.forEach(role => {
      it(`should accept valid role: ${role}`, async () => {
        const userData = {
          name: `User ${role}`,
          email: `${role}@example.com`,
          password: 'password123',
          role: role as any,
          tenant: tenantId,
        };

        const user = new User(userData);
        const savedUser = await user.save();

        expect(savedUser.role).toBe(role);
      });
    });
  });

  describe('comparePassword method', () => {
    let user: IUser;

    beforeEach(async () => {
      const userData = {
        name: 'Password Test',
        email: 'password@example.com',
        password: 'hashedpassword123',
        tenant: tenantId,
      };

      user = new User(userData);
      await user.save();
    });

    it('should return true for correct password', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await user.comparePassword('correctpassword');

      expect(result).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith('correctpassword', 'hashedpassword123');
    });

    it('should return false for incorrect password', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await user.comparePassword('wrongpassword');

      expect(result).toBe(false);
      expect(bcrypt.compare).toHaveBeenCalledWith('wrongpassword', 'hashedpassword123');
    });

    it('should handle bcrypt errors', async () => {
      (bcrypt.compare as jest.Mock).mockRejectedValue(new Error('Bcrypt error'));

      await expect(user.comparePassword('anypassword')).rejects.toThrow('Bcrypt error');
    });
  });

  describe('Database Operations', () => {
    it('should find user by email', async () => {
      const userData = {
        name: 'Findable User',
        email: 'findable@example.com',
        password: 'password123',
        tenant: tenantId,
      };

      const user = new User(userData);
      await user.save();

      const foundUser = await User.findOne({ email: 'findable@example.com' });
      expect(foundUser).toBeTruthy();
      expect(foundUser!.name).toBe('Findable User');
    });

    it('should find users by tenant', async () => {
      const userData1 = {
        name: 'Tenant User 1',
        email: 'tenant1@example.com',
        password: 'password123',
        tenant: tenantId,
      };

      const userData2 = {
        name: 'Tenant User 2',
        email: 'tenant2@example.com',
        password: 'password123',
        tenant: tenantId,
      };

      await new User(userData1).save();
      await new User(userData2).save();

      const tenantUsers = await User.find({ tenant: tenantId });
      expect(tenantUsers).toHaveLength(2);
    });

    it('should update user information', async () => {
      const userData = {
        name: 'Original Name',
        email: 'original@example.com',
        password: 'password123',
        tenant: tenantId,
      };

      const user = new User(userData);
      await user.save();

      user.name = 'Updated Name';
      user.isActive = false;
      await user.save();

      const updatedUser = await User.findById(user._id);
      expect(updatedUser!.name).toBe('Updated Name');
      expect(updatedUser!.isActive).toBe(false);
    });

    it('should delete user', async () => {
      const userData = {
        name: 'Deletable User',
        email: 'deletable@example.com',
        password: 'password123',
        tenant: tenantId,
      };

      const user = new User(userData);
      await user.save();
      const userId = user._id;

      await User.findByIdAndDelete(userId);

      const deletedUser = await User.findById(userId);
      expect(deletedUser).toBeNull();
    });

    it('should populate tenant information', async () => {
      const userData = {
        name: 'Populate Test',
        email: 'populate@example.com',
        password: 'password123',
        tenant: tenantId,
      };

      const user = new User(userData);
      await user.save();

      const userWithTenant = await User.findById(user._id).populate('tenant');
      expect(userWithTenant!.tenant).toBeTruthy();
      expect((userWithTenant!.tenant as any).name).toBe('Test Tenant');
    });
  });

  describe('Timestamps', () => {
    it('should have createdAt and updatedAt timestamps', async () => {
      const userData = {
        name: 'Timestamp Test',
        email: 'timestamp@example.com',
        password: 'password123',
        tenant: tenantId,
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser.createdAt).toBeDefined();
      expect(savedUser.updatedAt).toBeDefined();
      expect(savedUser.createdAt).toBeInstanceOf(Date);
      expect(savedUser.updatedAt).toBeInstanceOf(Date);
    });

    it('should update updatedAt on modification', async () => {
      const userData = {
        name: 'Update Test',
        email: 'update@example.com',
        password: 'password123',
        tenant: tenantId,
      };

      const user = new User(userData);
      await user.save();
      const originalUpdatedAt = user.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      user.name = 'Updated Name';
      await user.save();

      expect(user.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });
});
