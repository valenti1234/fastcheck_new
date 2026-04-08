import mongoose from 'mongoose';
import { EvaluationService } from './src/services/evaluationService.ts';
import { Tenant } from './src/models/tenant.model.ts';

async function testCreditDeduction() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/duxiter');
    console.log('Connected to MongoDB');

    // Get the tenant
    const tenantId = '6827419eecdd4cff1cd6ad69';
    const userId = '6827419eecdd4cff1cd6ad6b';
    
    console.log('\n=== BEFORE EVALUATION ===');
    const tenantBefore = await Tenant.findById(tenantId);
    console.log('Tenant credit balance before:', tenantBefore.creditBalance);

    // Create a single evaluation
    console.log('\n=== CREATING EVALUATION ===');
    const supplierData = {
      rut: '12345678-9',
      name: 'Test Company'
    };
    
    const companyData = {
      legalInfo: {
        name: 'Test Company Legal Name',
        type: 'SPA',
        status: 'Active'
      }
    };

    const job = await EvaluationService.createSingleEvaluation(tenantId, userId, supplierData, companyData);
    console.log('Evaluation job created:', job._id);

    console.log('\n=== AFTER EVALUATION ===');
    const tenantAfter = await Tenant.findById(tenantId);
    console.log('Tenant credit balance after:', tenantAfter.creditBalance);

    // Check credit operations
    const { CreditOperation } = await import('./src/models/creditOperation.model.ts');
    const creditOps = await CreditOperation.find({ tenantId }).sort({ createdAt: -1 }).limit(1);
    console.log('\n=== CREDIT OPERATIONS ===');
    console.log('Latest credit operation:', creditOps[0]);

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

testCreditDeduction();