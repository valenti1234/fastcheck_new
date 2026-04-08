import mongoose from 'mongoose';
import { Result, IResult } from '../Result';

describe('Result Model', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test');
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await Result.deleteMany({});
  });

  describe('Schema Validation', () => {
    it('should create a result with valid data', async () => {
      const resultData: Partial<IResult> = {
        rut: '12345678-9',
        tenantId: new mongoose.Types.ObjectId().toString(),
        markdownResume: '# Company Resume\nThis is a test resume',
        sheriffLogData: {
          searchDate: new Date(),
          results: ['No records found'],
          status: 'completed'
        },
        details: {
          companyName: 'Test Company',
          industry: 'Technology',
          foundedYear: 2020
        },
        riskAssessment: {
          overallRisk: 'Low',
          riskFactors: ['New company'],
          riskScore: 25
        }
      };

      const result = await Result.create(resultData);

      expect(result._id).toBeDefined();
      expect(result.rut).toBe('12345678-9');
      expect(result.tenantId).toBe(resultData.tenantId);
      expect(result.markdownResume).toBe(resultData.markdownResume);
      expect(result.sheriffLogData.status).toBe('completed');
      expect(result.details.companyName).toBe('Test Company');
      expect(result.riskAssessment.overallRisk).toBe('Low');
      expect(result).toHaveProperty('createdAt');
      expect(result).toHaveProperty('updatedAt');
    });

    it('should require rut field', async () => {
      const resultData = {
        tenantId: new mongoose.Types.ObjectId().toString(),
        markdownResume: 'Test resume'
      };

      await expect(Result.create(resultData)).rejects.toThrow(/rut.*required/);
    });

    it('should require tenantId field', async () => {
      const resultData = {
        rut: '12345678-9',
        markdownResume: 'Test resume'
      };

      await expect(Result.create(resultData)).rejects.toThrow(/tenantId.*required/);
    });

    it('should validate RUT format', async () => {
      const resultData = {
        rut: 'invalid-rut',
        tenantId: new mongoose.Types.ObjectId().toString(),
        markdownResume: 'Test resume'
      };

      await expect(Result.create(resultData)).rejects.toThrow();
    });

    it('should allow optional fields to be undefined', async () => {
      const resultData = {
        rut: '12345678-9',
        tenantId: new mongoose.Types.ObjectId().toString()
      };

      const result = await Result.create(resultData);

      expect(result.markdownResume).toBeUndefined();
      expect(result.sheriffLogData).toBeUndefined();
      expect(result.details).toBeUndefined();
      expect(result.riskAssessment).toBeUndefined();
    });
  });

  describe('Database Operations', () => {
    let tenantId: mongoose.Types.ObjectId;
    let result: IResult;

    beforeEach(async () => {
      tenantId = new mongoose.Types.ObjectId();
      result = await Result.create({
        rut: '12345678-9',
        tenantId: tenantId.toString(),
        markdownResume: 'Test resume',
        details: {
          companyName: 'Test Company',
          industry: 'Technology'
        }
      });
    });

    it('should find result by id', async () => {
      const foundResult = await Result.findById(result._id);
      
      expect(foundResult).toBeTruthy();
      expect(foundResult!.rut).toBe('12345678-9');
      expect(foundResult!.details?.companyName).toBe('Test Company');
    });

    it('should find results by RUT', async () => {
      await Result.create({
        rut: '98765432-1',
        tenantId: tenantId.toString(),
        markdownResume: 'Another resume'
      });

      const results = await Result.find({ rut: '12345678-9' });
      
      expect(results).toHaveLength(1);
      expect(results[0].rut).toBe('12345678-9');
    });

    it('should find results by tenant', async () => {
      const anotherTenantId = new mongoose.Types.ObjectId();
      await Result.create({
        rut: '98765432-1',
        tenantId: anotherTenantId.toString(),
        markdownResume: 'Another tenant result'
      });

      const tenantResults = await Result.find({ tenantId: tenantId.toString() });
      
      expect(tenantResults).toHaveLength(1);
      expect(tenantResults[0].tenantId).toBe(tenantId.toString());
    });

    it('should update result', async () => {
      const updatedResult = await Result.findByIdAndUpdate(
        result._id,
        { 
          markdownResume: 'Updated resume',
          'details.companyName': 'Updated Company'
        },
        { new: true }
      );

      expect(updatedResult!.markdownResume).toBe('Updated resume');
      expect(updatedResult!.details?.companyName).toBe('Updated Company');
    });

    it('should delete result', async () => {
      await Result.findByIdAndDelete(result._id);
      
      const deletedResult = await Result.findById(result._id);
      expect(deletedResult).toBeNull();
    });
  });

  describe('Timestamps', () => {
    it('should have createdAt and updatedAt timestamps', async () => {
      const result = await Result.create({
        rut: '12345678-9',
        tenantId: new mongoose.Types.ObjectId().toString(),
        markdownResume: 'Test resume'
      });

      expect(result).toHaveProperty('createdAt');
      expect(result).toHaveProperty('updatedAt');
      expect((result as any).createdAt).toEqual((result as any).updatedAt);
    });

    it('should update updatedAt on modification', async () => {
      const result = await Result.create({
        rut: '12345678-9',
        tenantId: new mongoose.Types.ObjectId().toString(),
        markdownResume: 'Test resume'
      });

      const originalUpdatedAt = (result as any).updatedAt;
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      result.markdownResume = 'Updated resume';
      await result.save();

      expect((result as any).updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });
});
