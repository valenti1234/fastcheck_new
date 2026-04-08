import mongoose from 'mongoose';
import { EvaluationJob, EvaluationResult, IEvaluationJob, IEvaluationResult } from '../evaluation';

describe('Evaluation Models', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test');
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await EvaluationJob.deleteMany({});
    await EvaluationResult.deleteMany({});
  });

  describe('EvaluationJob Model', () => {
    describe('Schema Validation', () => {
      it('should create an evaluation job with valid data', async () => {
        const tenantId = new mongoose.Types.ObjectId();
        const createdBy = new mongoose.Types.ObjectId();
        
        const jobData = {
          tenantId: tenantId.toString(),
          status: 'pending',
          type: 'bulk',
          createdBy: createdBy.toString(),
          totalEvaluations: 100,
          completedEvaluations: 0,
          failedEvaluations: 0,
        };

        const job = new EvaluationJob(jobData);
        const savedJob = await job.save();

        expect(savedJob._id).toBeDefined();
        expect(savedJob.tenantId).toBe(tenantId.toString());
        expect(savedJob.status).toBe('pending');
        expect(savedJob.type).toBe('bulk');
        expect(savedJob.createdBy).toBe(createdBy.toString());
        expect(savedJob.totalEvaluations).toBe(100);
        expect(savedJob.completedEvaluations).toBe(0);
        expect(savedJob.failedEvaluations).toBe(0);
        expect(savedJob.createdAt).toBeDefined();
        expect(savedJob.updatedAt).toBeDefined();
      });

      it('should require tenantId field', async () => {
        const job = new EvaluationJob({
          status: 'pending',
          type: 'single',
          createdBy: new mongoose.Types.ObjectId().toString(),
        });
        
        await expect(job.save()).rejects.toThrow(/tenantId.*required/);
      });

      it('should require createdBy field', async () => {
        const job = new EvaluationJob({
          tenantId: new mongoose.Types.ObjectId().toString(),
          status: 'pending',
          type: 'single',
        });
        
        await expect(job.save()).rejects.toThrow(/createdBy.*required/);
      });

      it('should require type field', async () => {
        const job = new EvaluationJob({
          tenantId: new mongoose.Types.ObjectId().toString(),
          status: 'pending',
          createdBy: new mongoose.Types.ObjectId().toString(),
        });
        
        await expect(job.save()).rejects.toThrow(/type.*required/);
      });

      it('should validate status enum values', async () => {
        const job = new EvaluationJob({
          tenantId: new mongoose.Types.ObjectId().toString(),
          status: 'invalid-status' as any,
          type: 'single',
          createdBy: new mongoose.Types.ObjectId().toString(),
        });
        
        await expect(job.save()).rejects.toThrow();
      });

      it('should validate type enum values', async () => {
        const job = new EvaluationJob({
          tenantId: new mongoose.Types.ObjectId().toString(),
          status: 'pending',
          type: 'invalid-type' as any,
          createdBy: new mongoose.Types.ObjectId().toString(),
        });
        
        await expect(job.save()).rejects.toThrow();
      });

      it('should set default values for evaluation counts', async () => {
        const job = new EvaluationJob({
          tenantId: new mongoose.Types.ObjectId().toString(),
          status: 'pending',
          type: 'single',
          createdBy: new mongoose.Types.ObjectId().toString(),
        });
        
        const savedJob = await job.save();
        expect(savedJob.totalEvaluations).toBe(0);
        expect(savedJob.completedEvaluations).toBe(0);
        expect(savedJob.failedEvaluations).toBe(0);
      });
    });

    describe('Database Operations', () => {
      let tenantId: mongoose.Types.ObjectId;
      let job: IEvaluationJob;

      beforeEach(async () => {
        tenantId = new mongoose.Types.ObjectId();
        job = await EvaluationJob.create({
          tenantId: tenantId.toString(),
          status: 'pending',
          type: 'bulk',
          createdBy: new mongoose.Types.ObjectId().toString(),
          totalEvaluations: 50,
          completedEvaluations: 10,
          failedEvaluations: 2,
        });
      });

      it('should find job by id', async () => {
        const foundJob = await EvaluationJob.findById(job._id);
        
        expect(foundJob).toBeTruthy();
        expect(foundJob!.tenantId).toBe(tenantId.toString());
        expect(foundJob!.type).toBe('bulk');
      });

      it('should find jobs by tenant', async () => {
        const jobs = await EvaluationJob.find({ tenantId });
        
        expect(jobs).toHaveLength(1);
        expect(jobs[0]._id.toString()).toBe(job._id.toString());
      });

      it('should find jobs by status', async () => {
        await EvaluationJob.create({
          tenantId: tenantId.toString(),
          status: 'completed',
          type: 'single',
          createdBy: new mongoose.Types.ObjectId().toString(),
        });
        
        const pendingJobs = await EvaluationJob.find({ status: 'pending' });
        const completedJobs = await EvaluationJob.find({ status: 'completed' });
        
        expect(pendingJobs).toHaveLength(1);
        expect(completedJobs).toHaveLength(1);
        expect(pendingJobs[0].status).toBe('pending');
        expect(completedJobs[0].status).toBe('completed');
      });

      it('should update job progress', async () => {
        const updatedJob = await EvaluationJob.findByIdAndUpdate(
          job._id,
          {
            $inc: {
              completedEvaluations: 5,
              failedEvaluations: 1,
            },
            $set: {
              status: 'in_progress',
            },
          },
          { new: true }
        );
        
        expect(updatedJob!.completedEvaluations).toBe(15);
        expect(updatedJob!.failedEvaluations).toBe(3);
        expect(updatedJob!.status).toBe('in_progress');
      });

      it('should delete job', async () => {
        await EvaluationJob.findByIdAndDelete(job._id);
        
        const deletedJob = await EvaluationJob.findById(job._id);
        expect(deletedJob).toBeNull();
      });
    });
  });

  describe('EvaluationResult Model', () => {
    describe('Schema Validation', () => {
      it('should create an evaluation result with valid data', async () => {
        const tenantId = new mongoose.Types.ObjectId();
        const jobId = new mongoose.Types.ObjectId();
        
        const resultData = {
          tenantId: tenantId.toString(),
          jobId,
          rut: '12345678-9',
          name: 'Test Company',
          status: 'success',
          data: {
            legalInfo: {
              name: 'Test Company',
              type: 'Corporation',
              status: 'Active',
            },
            financialInfo: {
              creditScore: 750,
              riskLevel: 'Low',
              lastUpdated: new Date(),
            },
            judicialInfo: {
              hasLawsuits: false,
              activeCases: 0,
              lastUpdated: new Date(),
            },
          },
        };

        const result = new EvaluationResult(resultData);
        const savedResult = await result.save();

        expect(savedResult._id).toBeDefined();
        expect(savedResult.tenantId).toBe(tenantId.toString());
        expect(savedResult.jobId.toString()).toBe(jobId.toString());
        expect(savedResult.rut).toBe('12345678-9');
        expect(savedResult.name).toBe('Test Company');
        expect(savedResult.status).toBe('success');
        expect(savedResult.data?.legalInfo?.name).toBe('Test Company');
        expect(savedResult.data?.legalInfo?.type).toBe('Corporation');
        expect(savedResult.data?.financialInfo?.creditScore).toBe(750);
        expect(savedResult.data?.financialInfo?.riskLevel).toBe('Low');
        expect(savedResult.data?.judicialInfo?.hasLawsuits).toBe(false);
        expect(savedResult.data?.judicialInfo?.activeCases).toBe(0);
        expect(savedResult.createdAt).toBeDefined();
        expect(savedResult.updatedAt).toBeDefined();
      });

      it('should require tenantId field', async () => {
        const result = new EvaluationResult({
          jobId: new mongoose.Types.ObjectId(),
          rut: '12345678-9',
        });
        
        await expect(result.save()).rejects.toThrow(/tenantId.*required/);
      });

      it('should require jobId field', async () => {
        const result = new EvaluationResult({
          tenantId: new mongoose.Types.ObjectId(),
          rut: '12345678-9',
        });
        
        await expect(result.save()).rejects.toThrow(/jobId.*required/);
      });

      it('should require rut field', async () => {
        const result = new EvaluationResult({
          tenantId: new mongoose.Types.ObjectId(),
          jobId: new mongoose.Types.ObjectId(),
        });
        
        await expect(result.save()).rejects.toThrow(/rut.*required/);
      });

      it('should allow null error field', async () => {
        const result = new EvaluationResult({
          tenantId: new mongoose.Types.ObjectId(),
          jobId: new mongoose.Types.ObjectId(),
          rut: '12345678-9',
          error: null,
        });
        
        const savedResult = await result.save();
        expect(savedResult.error).toBeNull();
      });

      it('should store error information', async () => {
        const result = new EvaluationResult({
          tenantId: new mongoose.Types.ObjectId(),
          jobId: new mongoose.Types.ObjectId(),
          rut: '12345678-9',
          error: 'API connection failed',
        });
        
        const savedResult = await result.save();
        expect(savedResult.error).toBe('API connection failed');
      });
    });

    describe('Database Operations', () => {
      let tenantId: mongoose.Types.ObjectId;
      let jobId: mongoose.Types.ObjectId;
      let result: IEvaluationResult;

      beforeEach(async () => {
        tenantId = new mongoose.Types.ObjectId();
        jobId = new mongoose.Types.ObjectId();
        result = await EvaluationResult.create({
          tenantId,
          jobId,
          rut: '12345678-9',
          name: 'Test Company',
          data: {
            legal: {
              summary: 'Clean legal record',
              details: 'No legal issues found',
            },
            financial: {
              summary: 'Good financial standing',
              details: 'Positive credit history',
            },
            judicial: {
              summary: 'No judicial records',
              details: 'No court cases found',
            },
          },
        });
      });

      it('should find result by id', async () => {
        const foundResult = await EvaluationResult.findById(result._id);
        
        expect(foundResult).toBeTruthy();
        expect(foundResult!.rut).toBe('12345678-9');
        expect(foundResult!.name).toBe('Test Company');
      });

      it('should find results by tenant', async () => {
        const results = await EvaluationResult.find({ tenantId });
        
        expect(results).toHaveLength(1);
        expect(results[0]._id.toString()).toBe(result._id.toString());
      });

      it('should find results by job', async () => {
        const results = await EvaluationResult.find({ jobId });
        
        expect(results).toHaveLength(1);
        expect(results[0]._id.toString()).toBe(result._id.toString());
      });

      it('should find results by rut', async () => {
        const results = await EvaluationResult.find({ rut: '12345678-9' });
        
        expect(results).toHaveLength(1);
        expect(results[0]._id.toString()).toBe(result._id.toString());
      });

      it('should update result data', async () => {
        const updatedResult = await EvaluationResult.findByIdAndUpdate(
          result._id,
          {
            $set: {
              'data.legal.summary': 'Updated legal summary',
              name: 'Updated Company Name',
            },
          },
          { new: true }
        );
        
        expect(updatedResult!.data.legal.summary).toBe('Updated legal summary');
        expect(updatedResult!.name).toBe('Updated Company Name');
        expect(updatedResult!.data.financial.summary).toBe('Good financial standing'); // Should remain unchanged
      });

      it('should delete result', async () => {
        await EvaluationResult.findByIdAndDelete(result._id);
        
        const deletedResult = await EvaluationResult.findById(result._id);
        expect(deletedResult).toBeNull();
      });

      it('should find results with errors', async () => {
        await EvaluationResult.create({
          tenantId,
          jobId,
          rut: '87654321-0',
          name: 'Error Company',
          error: 'Failed to fetch data',
        });
        
        const errorResults = await EvaluationResult.find({ error: { $ne: null } });
        const successResults = await EvaluationResult.find({ error: null });
        
        expect(errorResults).toHaveLength(1);
        expect(successResults).toHaveLength(1);
        expect(errorResults[0].rut).toBe('87654321-0');
        expect(successResults[0].rut).toBe('12345678-9');
      });
    });
  });

  describe('Timestamps', () => {
    it('should set createdAt and updatedAt on job creation', async () => {
      const job = await EvaluationJob.create({
        tenantId: new mongoose.Types.ObjectId(),
        status: 'pending',
        type: 'single',
      });
      
      expect(job.createdAt).toBeDefined();
      expect(job.updatedAt).toBeDefined();
      expect(job.createdAt).toEqual(job.updatedAt);
    });

    it('should set createdAt and updatedAt on result creation', async () => {
      const result = await EvaluationResult.create({
        tenantId: new mongoose.Types.ObjectId(),
        jobId: new mongoose.Types.ObjectId(),
        rut: '12345678-9',
      });
      
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      expect(result.createdAt).toEqual(result.updatedAt);
    });

    it('should update updatedAt on job modification', async () => {
      const job = await EvaluationJob.create({
        tenantId: new mongoose.Types.ObjectId(),
        status: 'pending',
        type: 'single',
      });
      
      const originalUpdatedAt = job.updatedAt;
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      job.status = 'completed';
      await job.save();
      
      expect(job.updatedAt).not.toEqual(originalUpdatedAt);
      expect(job.updatedAt > originalUpdatedAt).toBe(true);
    });
  });
});
