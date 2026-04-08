const axios = require('axios');

async function testTenantStats() {
  try {
    console.log('🔍 Testing tenant statistics endpoint...');
    
    // First login to get authentication token
    console.log('🔐 Logging in as superadmin...');
    const loginResponse = await axios.post('http://localhost:4040/api/auth/login', {
      email: 'superadmin@gmail.com',
      password: 'SuperAdmin3465#'
    });
    
    if (loginResponse.status !== 200) {
      throw new Error(`Login failed with status: ${loginResponse.status}`);
    }
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful');
    
    const response = await axios.get('http://localhost:4040/api/tenant/statistics', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.status === 200) {
      console.log('✅ Tenant statistics endpoint working');
      console.log('\n📊 Tenant Statistics Response:');
      console.log(JSON.stringify(response.data, null, 2));
      
      // Check if response has topTenants array
      const tenants = response.data.topTenants || [];
      
      if (tenants.length > 0) {
        console.log('\n📋 Top Tenants:');
        tenants.forEach((tenant, index) => {
        console.log(`\n${index + 1}. ${tenant.tenantName} (ID: ${tenant.tenantId})`);
        console.log(`   📈 Evaluations Used (from results): ${tenant.evaluationsUsed}`);
        console.log(`   💳 Credit Operations Used: ${tenant.creditOperationsUsed}`);
        console.log(`   📋 Total Evaluations from Jobs: ${tenant.totalEvaluationsFromJobs}`);
        console.log(`   ✅ Completed Evaluations: ${tenant.completedEvaluations}`);
        console.log(`   ❌ Failed Evaluations: ${tenant.failedEvaluations}`);
        console.log(`   💰 Evaluations Remaining: ${tenant.evaluationsRemaining}`);
        console.log(`   📅 Last Evaluation: ${tenant.lastEvaluationDate || 'N/A'}`);
        console.log(`   💳 Last Credit Operation: ${tenant.lastCreditOperation || 'N/A'}`);
        
        // Highlight discrepancies
        if (tenant.evaluationsUsed !== tenant.creditOperationsUsed) {
          console.log(`   ⚠️  DISCREPANCY: ${tenant.evaluationsUsed} results vs ${tenant.creditOperationsUsed} credit operations`);
        }
      });
        
        // Find Emilio's Organization specifically
        const emilioTenant = tenants.find(t => t.name && t.name.includes('Emilio'));
        if (emilioTenant) {
          console.log('\n🎯 Emilio\'s Organization Details:');
          console.log(`   Evaluation Results: ${emilioTenant.evaluationsUsed}`);
          console.log(`   Credit Operations: ${emilioTenant.creditOperationsUsed || 'N/A'}`);
          console.log(`   Discrepancy: ${emilioTenant.evaluationsUsed - (emilioTenant.creditOperationsUsed || 0)}`);
        }
      } else {
        console.log('\n⚠️ No tenant data found in topTenants');
      }
        
    } else {
      console.log(`❌ Request failed with status: ${response.status}`);
    }
    
  } catch (error) {
    console.error('❌ Error testing tenant statistics:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testTenantStats();