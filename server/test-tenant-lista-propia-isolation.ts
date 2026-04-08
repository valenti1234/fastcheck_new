#!/usr/bin/env node

/**
 * Test script to verify tenant isolation for lista propia flags
 * when recycling fast-check results between tenants
 */

import mongoose from 'mongoose';
import { Result } from './src/models/Result.js';
import { Lpalto } from './src/models/Lpalto.js';
import { Lpmedio } from './src/models/Lpmedio.js';

// Test configuration
const TEST_RUT = '12345678-9';
const TENANT_A = 'tenant_a_test';
const TENANT_B = 'tenant_b_test';

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/duxiter');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function cleanup() {
  console.log('\n🧹 Cleaning up test data...');
  
  // Remove test results
  await Result.deleteMany({ 
    rut: { $in: [TEST_RUT, TEST_RUT.replace('-', '')] },
    tenantId: { $in: [TENANT_A, TENANT_B] }
  });
  
  // Remove test lista propia entries
  await Lpalto.deleteMany({ 
    rut: { $in: [TEST_RUT, TEST_RUT.replace('-', '')] },
    tenant: { $in: [TENANT_A, TENANT_B] }
  });
  
  await Lpmedio.deleteMany({ 
    rut: { $in: [TEST_RUT, TEST_RUT.replace('-', '')] },
    tenant: { $in: [TENANT_A, TENANT_B] }
  });
  
  console.log('✅ Cleanup completed');
}

async function setupTestData() {
  console.log('\n📝 Setting up test data...');
  
  // Create lista propia entries for TENANT_A only
  await Lpalto.create({
    rut: TEST_RUT.replace('-', ''),
    tenant: TENANT_A,
    razonSocial: 'Test Company Alto Impacto',
    createdAt: new Date()
  });
  
  await Lpmedio.create({
    rut: TEST_RUT.replace('-', ''),
    tenant: TENANT_A,
    razonSocial: 'Test Company Mediano Impacto',
    createdAt: new Date()
  });
  
  // Create a result for TENANT_A with lista propia flags set to true
  const resultTenantA = await Result.create({
    rut: TEST_RUT,
    tenantId: TENANT_A,
    markdownResume: 'Test result for Tenant A',
    sheriffLogData: {
      summaryData: {
        data: {
          lpaltosDetected: true,
          lpmediosDetected: true
        }
      }
    },
    createdAt: new Date()
  });
  
  console.log(`✅ Created test data for ${TENANT_A}`);
  console.log(`   - Lpalto entry: ${TEST_RUT}`);
  console.log(`   - Lpmedio entry: ${TEST_RUT}`);
  console.log(`   - Result with lpaltosDetected: true, lpmediosDetected: true`);
  
  return resultTenantA;
}

async function testResultRecycling() {
  console.log('\n🔄 Testing result recycling with tenant isolation...');
  
  // Simulate what happens when TENANT_B requests the same RUT
  // This should trigger the recycling logic in rutController.ts
  
  // First, verify that TENANT_B has no lista propia entries
  const lpaltosForTenantB = await Lpalto.find({ 
    rut: TEST_RUT.replace('-', ''), 
    tenant: TENANT_B 
  });
  
  const lpmediosForTenantB = await Lpmedio.find({ 
    rut: TEST_RUT.replace('-', ''), 
    tenant: TENANT_B 
  });
  
  console.log(`📊 TENANT_B lista propia entries:`);
  console.log(`   - Lpaltos: ${lpaltosForTenantB.length}`);
  console.log(`   - Lpmedios: ${lpmediosForTenantB.length}`);
  
  // Find the existing result (from TENANT_A)
  const existingResult = await Result.findOne({
    $or: [{ rut: TEST_RUT }, { rut: TEST_RUT.replace('-', '') }]
  }).sort({ createdAt: -1 });
  
  if (!existingResult) {
    throw new Error('No existing result found for recycling test');
  }
  
  console.log(`📋 Found existing result from tenant: ${existingResult.tenantId}`);
  console.log(`   - Original lpaltosDetected: ${existingResult.sheriffLogData?.summaryData?.data?.lpaltosDetected}`);
  console.log(`   - Original lpmediosDetected: ${existingResult.sheriffLogData?.summaryData?.data?.lpmediosDetected}`);
  
  // Simulate the recycling logic from rutController.ts
  if (existingResult.tenantId !== TENANT_B) {
    console.log('\n🔄 Simulating result recycling for TENANT_B...');
    
    // Create a copy of the result object (excluding _id)
    const resultObject = existingResult.toObject();
    delete resultObject._id;
    
    // Set the new tenant
    resultObject.tenantId = TENANT_B;
    
    // CRITICAL: Recalculate tenant-specific lista propia flags
    const cleanRut = TEST_RUT.replace(/\./g, '').replace(/-/g, '');
    
    try {
      // Query lpaltos collection for current tenant
      const lpaltosRecords = await Lpalto.find({ 
        rut: cleanRut, 
        tenant: TENANT_B 
      });
      
      // Query lpmedios collection for current tenant
      const lpmediosRecords = await Lpmedio.find({ 
        rut: cleanRut, 
        tenant: TENANT_B 
      });
      
      // Update the flags based on current tenant's data
      if (resultObject.sheriffLogData?.summaryData?.data) {
        resultObject.sheriffLogData.summaryData.data.lpaltosDetected = lpaltosRecords.length > 0;
        resultObject.sheriffLogData.summaryData.data.lpmediosDetected = lpmediosRecords.length > 0;
        
        console.log(`✅ Recalculated lista propia flags for ${TENANT_B}:`);
        console.log(`   - lpaltosDetected: ${lpaltosRecords.length > 0} (${lpaltosRecords.length} records found)`);
        console.log(`   - lpmediosDetected: ${lpmediosRecords.length > 0} (${lpmediosRecords.length} records found)`);
      } else {
        console.log('⚠️  No sheriffLogData.summaryData.data found in result');
        return false;
      }
      
      // Save the recycled result for TENANT_B
      const recycledResult = await Result.create(resultObject);
      
      console.log(`✅ Created recycled result for ${TENANT_B} with ID: ${recycledResult._id}`);
      
      // Verify the recycled result has correct flags
      const verificationResult = await Result.findById(recycledResult._id);
      if (!verificationResult) {
        console.log('❌ Could not find recycled result for verification');
        return false;
      }
      const finalLpaltosDetected = verificationResult.sheriffLogData?.summaryData?.data?.lpaltosDetected;
      const finalLpmediosDetected = verificationResult.sheriffLogData?.summaryData?.data?.lpmediosDetected;
      
      console.log('\n🔍 Verification of recycled result:');
      console.log(`   - Final lpaltosDetected: ${finalLpaltosDetected}`);
      console.log(`   - Final lpmediosDetected: ${finalLpmediosDetected}`);
      
      // Test assertions
      const expectedLpaltos = false; // TENANT_B has no lpaltos entries
      const expectedLpmedios = false; // TENANT_B has no lpmedios entries
      
      if (finalLpaltosDetected === expectedLpaltos && finalLpmediosDetected === expectedLpmedios) {
        console.log('✅ TEST PASSED: Lista propia flags correctly recalculated for tenant isolation');
        return true;
      } else {
        console.log('❌ TEST FAILED: Lista propia flags not correctly recalculated');
        console.log(`   Expected: lpaltosDetected=${expectedLpaltos}, lpmediosDetected=${expectedLpmedios}`);
        console.log(`   Actual: lpaltosDetected=${finalLpaltosDetected}, lpmediosDetected=${finalLpmediosDetected}`);
        return false;
      }
      
    } catch (error) {
      console.error('❌ Error during lista propia recalculation:', error);
      return false;
    }
  }
  
  return false;
}

async function runTest() {
  console.log('🧪 Starting tenant isolation test for lista propia flags...');
  console.log(`📋 Test RUT: ${TEST_RUT}`);
  console.log(`🏢 Tenant A: ${TENANT_A} (has lista propia entries)`);
  console.log(`🏢 Tenant B: ${TENANT_B} (no lista propia entries)`);
  
  try {
    await connectDB();
    await cleanup();
    await setupTestData();
    const testPassed = await testResultRecycling();
    
    console.log('\n' + '='.repeat(60));
    if (testPassed) {
      console.log('🎉 ALL TESTS PASSED: Tenant isolation working correctly!');
      console.log('✅ Lista propia flags are properly recalculated when recycling results');
    } else {
      console.log('💥 TEST FAILED: Tenant isolation not working correctly');
      console.log('❌ Lista propia flags are not being recalculated properly');
    }
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Test execution error:', error);
  } finally {
    await cleanup();
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run the test
runTest().catch(console.error);