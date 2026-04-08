import mongoose from 'mongoose';
import { CreditOperation, ICreditOperation } from '../creditOperation.model';

describe('CreditOperation Model', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test');
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await CreditOperation.deleteMany({});
  });

  describe('Schema Validation', () => {
    it('should create a credit operation with valid data', async () => {
      const operationData: Partial<ICreditOperation> = {
        tenantId: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        operationType: 'credit_purchase',
        creditsChanged: 100,
        balanceAfter: 500,
        description: 'Credit purchase'
      };

      const operation = await CreditOperation.create(operationData);

      expect(operation._id).toBeDefined();
      expect(operation.tenantId.toString()).toBe(operationData.tenantId!.toString());
      expect(operation.userId!.toString()).toBe(operationData.userId!.toString());
      expect(operation.operationType).toBe('credit_purchase');
      expect(operation.creditsChanged).toBe(100);
      expect(operation.balanceAfter).toBe(500);
      expect(operation.description).toBe('Credit purchase');
      expect(operation).toHaveProperty('createdAt');
      expect(operation).toHaveProperty('updatedAt');
    });

    it('should require tenantId field', async () => {
      const operationData = {
        userId: new mongoose.Types.ObjectId(),
        operationType: 'credit_purchase',
        creditsChanged: 100,
        balanceAfter: 500
      };

      await expect(CreditOperation.create(operationData)).rejects.toThrow(/tenantId.*required/);
    });

    it('should require userId field', async () => {
      const operationData = {
        tenantId: new mongoose.Types.ObjectId(),
        operationType: 'credit_purchase',
        creditsChanged: 100,
        balanceAfter: 500
      };

      await expect(CreditOperation.create(operationData)).rejects.toThrow(/userId.*required/);
    });

    it('should require operationType field', async () => {
      const operationData = {
        tenantId: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        creditsChanged: 100,
        balanceAfter: 500
      };

      await expect(CreditOperation.create(operationData)).rejects.toThrow(/operationType.*required/);
    });

    it('should validate operationType enum values', async () => {
      const operationData = {
        tenantId: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        operationType: 'invalid_type' as any,
        creditsChanged: 100,
        balanceAfter: 500
      };

      await expect(CreditOperation.create(operationData)).rejects.toThrow();
    });

    it('should require creditsChanged field', async () => {
      const operationData = {
        tenantId: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        operationType: 'credit_purchase',
        balanceAfter: 500
      };

      await expect(CreditOperation.create(operationData)).rejects.toThrow(/creditsChanged.*required/);
    });

    it('should require balanceAfter field', async () => {
      const operationData = {
        tenantId: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        operationType: 'credit_purchase',
        creditsChanged: 100
      };

      await expect(CreditOperation.create(operationData)).rejects.toThrow(/balanceAfter.*required/);
    });

    it('should allow negative creditsChanged for deductions', async () => {
      const operationData = {
        tenantId: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        operationType: 'evaluation',
        creditsChanged: -50,
        balanceAfter: 450
      };

      const operation = await CreditOperation.create(operationData);
      expect(operation.creditsChanged).toBe(-50);
    });

    it('should allow optional description field', async () => {
      const operationData = {
        tenantId: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        operationType: 'credit_purchase',
        creditsChanged: 100,
        balanceAfter: 500
      };

      const operation = await CreditOperation.create(operationData);
      expect(operation.description).toBeUndefined();
    });
  });

  describe('Database Operations', () => {
    let tenantId: mongoose.Types.ObjectId;
    let userId: mongoose.Types.ObjectId;
    let operation: ICreditOperation;

    beforeEach(async () => {
      tenantId = new mongoose.Types.ObjectId();
      userId = new mongoose.Types.ObjectId();
      operation = await CreditOperation.create({
        tenantId: tenantId,
        userId: userId,
        operationType: 'credit_purchase',
        creditsChanged: 100,
        balanceAfter: 500,
        description: 'Initial purchase'
      });
    });

    it('should find operation by id', async () => {
      const foundOperation = await CreditOperation.findById(operation._id);
      
      expect(foundOperation).toBeTruthy();
      expect(foundOperation!.tenantId.toString()).toBe(tenantId.toString());
      expect(foundOperation!.operationType).toBe('credit_purchase');
    });

    it('should find operations by tenant', async () => {
      const anotherTenantId = new mongoose.Types.ObjectId();
      await CreditOperation.create({
        tenantId: anotherTenantId.toString(),
        userId: userId.toString(),
        operationType: 'usage',
        creditsChanged: -25,
        balanceAfter: 475
      });

      const tenantOperations = await CreditOperation.find({ tenantId: tenantId.toString() });
      
      expect(tenantOperations).toHaveLength(1);
      expect(tenantOperations[0].tenantId).toBe(tenantId.toString());
    });

    it('should find operations by user', async () => {
      const anotherUserId = new mongoose.Types.ObjectId();
      await CreditOperation.create({
        tenantId: tenantId.toString(),
        userId: anotherUserId.toString(),
        operationType: 'usage',
        creditsChanged: -25,
        balanceAfter: 475
      });

      const userOperations = await CreditOperation.find({ userId: userId.toString() });
      
      expect(userOperations).toHaveLength(1);
      expect(userOperations[0].userId).toBe(userId.toString());
    });

    it('should find operations by type', async () => {
      await CreditOperation.create({
        tenantId: tenantId.toString(),
        userId: userId.toString(),
        operationType: 'usage',
        creditsChanged: -25,
        balanceAfter: 475
      });

      const purchaseOperations = await CreditOperation.find({ operationType: 'purchase' });
      const usageOperations = await CreditOperation.find({ operationType: 'usage' });
      
      expect(purchaseOperations).toHaveLength(1);
      expect(usageOperations).toHaveLength(1);
      expect(purchaseOperations[0].creditsChanged).toBe(100);
      expect(usageOperations[0].creditsChanged).toBe(-25);
    });

    it('should update operation', async () => {
      const updatedOperation = await CreditOperation.findByIdAndUpdate(
        operation._id,
        { description: 'Updated description' },
        { new: true }
      );

      expect(updatedOperation!.description).toBe('Updated description');
    });

    it('should delete operation', async () => {
      await CreditOperation.findByIdAndDelete(operation._id);
      
      const deletedOperation = await CreditOperation.findById(operation._id);
      expect(deletedOperation).toBeNull();
    });

    it('should sort operations by creation date', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const secondOperation = await CreditOperation.create({
        tenantId: tenantId.toString(),
        userId: userId.toString(),
        operationType: 'usage',
        creditsChanged: -25,
        balanceAfter: 475
      });

      const operations = await CreditOperation.find({ tenantId: tenantId.toString() })
        .sort({ createdAt: -1 });
      
      expect(operations).toHaveLength(2);
      expect(operations[0]._id.toString()).toBe(secondOperation._id.toString());
      expect(operations[1]._id.toString()).toBe(operation._id.toString());
    });
  });

  describe('Aggregation Queries', () => {
    let tenantId: mongoose.Types.ObjectId;
    let userId: mongoose.Types.ObjectId;

    beforeEach(async () => {
      tenantId = new mongoose.Types.ObjectId();
      userId = new mongoose.Types.ObjectId();
      
      // Create multiple operations
      await CreditOperation.create([
        {
          tenantId: tenantId.toString(),
          userId: userId.toString(),
          operationType: 'purchase',
          creditsChanged: 100,
          balanceAfter: 100
        },
        {
          tenantId: tenantId.toString(),
          userId: userId.toString(),
          operationType: 'usage',
          creditsChanged: -25,
          balanceAfter: 75
        },
        {
          tenantId: tenantId.toString(),
          userId: userId.toString(),
          operationType: 'usage',
          creditsChanged: -15,
          balanceAfter: 60
        }
      ]);
    });

    it('should calculate total credits purchased', async () => {
      const result = await CreditOperation.aggregate([
        { $match: { tenantId: tenantId.toString(), operationType: 'purchase' } },
        { $group: { _id: null, totalPurchased: { $sum: '$creditsChanged' } } }
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].totalPurchased).toBe(100);
    });

    it('should calculate total credits used', async () => {
      const result = await CreditOperation.aggregate([
        { $match: { tenantId: tenantId.toString(), operationType: 'usage' } },
        { $group: { _id: null, totalUsed: { $sum: { $abs: '$creditsChanged' } } } }
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].totalUsed).toBe(40);
    });
  });
});
