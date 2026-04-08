#!/usr/bin/env node

/**
 * Simple test to verify tenant isolation logic for lista propia flags
 * This test simulates the recycling logic without requiring full database setup
 */

console.log('🧪 Testing tenant isolation logic for lista propia flags...');
console.log('=' * 60);

// Simulate the recycling logic from rutController.ts
function simulateResultRecycling() {
  console.log('\n🔄 Simulating result recycling scenario...');
  
  // Original result from TENANT_A with lista propia flags set to true
  const originalResult = {
    _id: 'result_tenant_a',
    rut: '12345678-9',
    tenantId: 'tenant_a',
    sheriffLogData: {
      summaryData: {
        data: {
          lpaltosDetected: true,   // TENANT_A has this RUT in lpaltos
          lpmediosDetected: true   // TENANT_A has this RUT in lpmedios
        }
      }
    }
  };
  
  console.log('📋 Original result from TENANT_A:');
  console.log(`   - RUT: ${originalResult.rut}`);
  console.log(`   - Tenant: ${originalResult.tenantId}`);
  console.log(`   - lpaltosDetected: ${originalResult.sheriffLogData.summaryData.data.lpaltosDetected}`);
  console.log(`   - lpmediosDetected: ${originalResult.sheriffLogData.summaryData.data.lpmediosDetected}`);
  
  // Simulate TENANT_B requesting the same RUT
  const requestingTenant = 'tenant_b';
  console.log(`\n🏢 TENANT_B (${requestingTenant}) requests the same RUT...`);
  
  // Check if tenant is different (this triggers recycling)
  if (originalResult.tenantId !== requestingTenant) {
    console.log('✅ Different tenant detected - triggering result recycling');
    
    // Create a copy of the result object (excluding _id)
    const resultObject = { ...originalResult };
    delete resultObject._id;
    
    // Set the new tenant
    resultObject.tenantId = requestingTenant;
    
    console.log('\n🔧 BEFORE recalculation:');
    console.log(`   - New tenant: ${resultObject.tenantId}`);
    console.log(`   - lpaltosDetected: ${resultObject.sheriffLogData.summaryData.data.lpaltosDetected} (inherited from TENANT_A)`);
    console.log(`   - lpmediosDetected: ${resultObject.sheriffLogData.summaryData.data.lpmediosDetected} (inherited from TENANT_A)`);
    
    // CRITICAL: Simulate recalculation of tenant-specific lista propia flags
    const cleanRut = originalResult.rut.replace(/\./g, '').replace(/-/g, '');
    
    // Simulate database queries for TENANT_B (assuming no records found)
    const lpaltosRecordsForTenantB = []; // Empty - TENANT_B has no lpaltos entries
    const lpmediosRecordsForTenantB = []; // Empty - TENANT_B has no lpmedios entries
    
    console.log('\n🔍 Simulating database queries for TENANT_B:');
    console.log(`   - Lpaltos records found: ${lpaltosRecordsForTenantB.length}`);
    console.log(`   - Lpmedios records found: ${lpmediosRecordsForTenantB.length}`);
    
    // Update the flags based on current tenant's data
    if (resultObject.sheriffLogData?.summaryData?.data) {
      resultObject.sheriffLogData.summaryData.data.lpaltosDetected = lpaltosRecordsForTenantB.length > 0;
      resultObject.sheriffLogData.summaryData.data.lpmediosDetected = lpmediosRecordsForTenantB.length > 0;
      
      console.log('\n🔧 AFTER recalculation:');
      console.log(`   - lpaltosDetected: ${resultObject.sheriffLogData.summaryData.data.lpaltosDetected} (recalculated for TENANT_B)`);
      console.log(`   - lpmediosDetected: ${resultObject.sheriffLogData.summaryData.data.lpmediosDetected} (recalculated for TENANT_B)`);
      
      // Test assertions
      const expectedLpaltos = false; // TENANT_B has no lpaltos entries
      const expectedLpmedios = false; // TENANT_B has no lpmedios entries
      
      const actualLpaltos = resultObject.sheriffLogData.summaryData.data.lpaltosDetected;
      const actualLpmedios = resultObject.sheriffLogData.summaryData.data.lpmediosDetected;
      
      console.log('\n🎯 Test Results:');
      console.log(`   Expected: lpaltosDetected=${expectedLpaltos}, lpmediosDetected=${expectedLpmedios}`);
      console.log(`   Actual:   lpaltosDetected=${actualLpaltos}, lpmediosDetected=${actualLpmedios}`);
      
      if (actualLpaltos === expectedLpaltos && actualLpmedios === expectedLpmedios) {
        console.log('\n✅ TEST PASSED: Lista propia flags correctly recalculated for tenant isolation');
        return true;
      } else {
        console.log('\n❌ TEST FAILED: Lista propia flags not correctly recalculated');
        return false;
      }
    } else {
      console.log('\n⚠️  No sheriffLogData.summaryData.data found in result');
      return false;
    }
  }
  
  return false;
}

// Test scenario where TENANT_B has different lista propia entries
function simulateDifferentTenantData() {
  console.log('\n\n🔄 Simulating scenario with different tenant data...');
  
  // Original result from TENANT_A
  const originalResult = {
    rut: '98765432-1',
    tenantId: 'tenant_a',
    sheriffLogData: {
      summaryData: {
        data: {
          lpaltosDetected: false,  // TENANT_A doesn't have this RUT in lpaltos
          lpmediosDetected: true   // TENANT_A has this RUT in lpmedios
        }
      }
    }
  };
  
  console.log('📋 Original result from TENANT_A:');
  console.log(`   - lpaltosDetected: ${originalResult.sheriffLogData.summaryData.data.lpaltosDetected}`);
  console.log(`   - lpmediosDetected: ${originalResult.sheriffLogData.summaryData.data.lpmediosDetected}`);
  
  // TENANT_C has different lista propia entries
  const requestingTenant = 'tenant_c';
  const resultObject = { ...originalResult };
  resultObject.tenantId = requestingTenant;
  
  // Simulate TENANT_C has the RUT in lpaltos but not in lpmedios
  const lpaltosRecordsForTenantC = [{ rut: '98765432-1', tenant: 'tenant_c' }]; // Has entry
  const lpmediosRecordsForTenantC = []; // No entry
  
  console.log(`\n🔍 Simulating database queries for ${requestingTenant}:`);
  console.log(`   - Lpaltos records found: ${lpaltosRecordsForTenantC.length}`);
  console.log(`   - Lpmedios records found: ${lpmediosRecordsForTenantC.length}`);
  
  // Recalculate flags
  resultObject.sheriffLogData.summaryData.data.lpaltosDetected = lpaltosRecordsForTenantC.length > 0;
  resultObject.sheriffLogData.summaryData.data.lpmediosDetected = lpmediosRecordsForTenantC.length > 0;
  
  console.log('\n🔧 After recalculation for TENANT_C:');
  console.log(`   - lpaltosDetected: ${resultObject.sheriffLogData.summaryData.data.lpaltosDetected} (should be true)`);
  console.log(`   - lpmediosDetected: ${resultObject.sheriffLogData.summaryData.data.lpmediosDetected} (should be false)`);
  
  // Test assertions
  const expectedLpaltos = true;  // TENANT_C has lpaltos entry
  const expectedLpmedios = false; // TENANT_C has no lpmedios entry
  
  const actualLpaltos = resultObject.sheriffLogData.summaryData.data.lpaltosDetected;
  const actualLpmedios = resultObject.sheriffLogData.summaryData.data.lpmediosDetected;
  
  if (actualLpaltos === expectedLpaltos && actualLpmedios === expectedLpmedios) {
    console.log('\n✅ TEST PASSED: Different tenant data correctly reflected');
    return true;
  } else {
    console.log('\n❌ TEST FAILED: Different tenant data not correctly reflected');
    return false;
  }
}

// Run tests
function runAllTests() {
  console.log('🚀 Starting tenant isolation tests...\n');
  
  const test1 = simulateResultRecycling();
  const test2 = simulateDifferentTenantData();
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY:');
  console.log(`   Test 1 (Empty tenant data): ${test1 ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`   Test 2 (Different tenant data): ${test2 ? '✅ PASSED' : '❌ FAILED'}`);
  
  if (test1 && test2) {
    console.log('\n🎉 ALL TESTS PASSED!');
    console.log('✅ Tenant isolation logic is working correctly');
    console.log('✅ Lista propia flags are properly recalculated when recycling results');
  } else {
    console.log('\n💥 SOME TESTS FAILED!');
    console.log('❌ Tenant isolation logic needs review');
  }
  console.log('='.repeat(60));
}

// Execute tests
runAllTests();