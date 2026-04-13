#!/usr/bin/env node

/**
 * Test script for Equifax API endpoints
 * Tests authentication and Equifax service integration
 * 
 * Usage: node test-equifax-endpoint.js
 */

import axios from 'axios';
import colors from 'colors';

// Configuration
const CONFIG = {
  baseUrl: process.env.API_BASE_URL || 'https://fastcheck.duxiter.cl/api',
  testUser: {
    email: 'edeik@azurian.com',
    password: 'Emilio3465#'
  },
  testRut: '76231199-2'
};

// Global variables
let authToken = null;
let testResults = {
  passed: 0,
  failed: 0,
  total: 0
};

/**
 * Utility functions
 */
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}]`;
  
  switch (type) {
    case 'success':
      console.log(`${prefix} ✅ ${message}`.green);
      break;
    case 'error':
      console.log(`${prefix} ❌ ${message}`.red);
      break;
    case 'warning':
      console.log(`${prefix} ⚠️  ${message}`.yellow);
      break;
    case 'info':
    default:
      console.log(`${prefix} ℹ️  ${message}`.blue);
      break;
  }
}

function logTest(testName, passed, details = '') {
  testResults.total++;
  if (passed) {
    testResults.passed++;
    log(`TEST PASSED: ${testName} ${details}`, 'success');
  } else {
    testResults.failed++;
    log(`TEST FAILED: ${testName} ${details}`, 'error');
  }
}

/**
 * Authentication functions
 */
async function authenticate() {
  try {
    log('🔐 Authenticating user...');
    
    const response = await axios.post(`${CONFIG.baseUrl}/auth/login`, {
      email: CONFIG.testUser.email,
      password: CONFIG.testUser.password
    });

    log(`Authentication response status: ${response.status}`, 'info');
    log(`Authentication response data: ${JSON.stringify(response.data, null, 2)}`, 'info');

    if (response.data && response.data.token) {
      authToken = response.data.token;
      logTest('Authentication', true, `Token received: ${authToken.substring(0, 20)}...`);
      log(`User: ${response.data.user.name} (${response.data.user.email})`);
      log(`Role: ${response.data.user.role}`);
      if (response.data.user.tenant) {
        log(`Tenant: ${response.data.user.tenant}`);
      }
      return true;
    } else {
      logTest('Authentication', false, 'No token received');
      return false;
    }
  } catch (error) {
    logTest('Authentication', false, `Error: ${error.response?.data?.message || error.message}`);
    if (error.response) {
      log(`Error status: ${error.response.status}`, 'error');
      log(`Error data: ${JSON.stringify(error.response.data, null, 2)}`, 'error');
    }
    return false;
  }
}

async function verifyAuthentication() {
  try {
    log('🔍 Verifying authentication...');
    
    const response = await axios.get(`${CONFIG.baseUrl}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    log(`Verification response status: ${response.status}`, 'info');
    log(`Verification response data: ${JSON.stringify(response.data, null, 2)}`, 'info');

    if (response.data && response.data.user) {
      logTest('Authentication Verification', true, `User verified: ${response.data.user.email}`);
      return true;
    } else {
      logTest('Authentication Verification', false, 'User verification failed');
      return false;
    }
  } catch (error) {
    logTest('Authentication Verification', false, `Error: ${error.response?.data?.message || error.message}`);
    if (error.response) {
      log(`Verification error status: ${error.response.status}`, 'error');
      log(`Verification error data: ${JSON.stringify(error.response.data, null, 2)}`, 'error');
    }
    return false;
  }
}

/**
 * Equifax API test functions
 */
async function testEquifaxHealth() {
  try {
    log('🏥 Testing Equifax health endpoint...');
    
    const response = await axios.get(`${CONFIG.baseUrl}/equifax/health`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (response.data.status === 'healthy' || response.data.status === 'active') {
      logTest('Equifax Health Check', true, `Status: ${response.data.status}`);
      return true;
    } else {
      logTest('Equifax Health Check', false, `Unexpected status: ${response.data.status}`);
      return false;
    }
  } catch (error) {
    logTest('Equifax Health Check', false, `Error: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function testEquifaxQueryRut() {
  try {
    log(`🔍 Testing Equifax RUT query for: ${CONFIG.testRut}...`);
    
    const payload = {
      personalData: {
        firstName: 'Test',
        lastName: 'Company',
        nationalId: CONFIG.testRut
      },
      productData: {
        billTo: '003863B001',
        shipTo: '003863B001S0001',
        productName: 'CLREPORTEEMPRESARIAL',
        productOrch: 'REPORTEEMPRESARIALV1',
        configuration: 'Config',
        customer: 'CLREPROCSERV',
        model: 'REPROCSERV'
      }
    };

    const response = await axios.post(`${CONFIG.baseUrl}/equifax/query/${CONFIG.testRut}`, payload, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success) {
      logTest('Equifax RUT Query', true, `Response received for RUT: ${CONFIG.testRut}`);
      log(`Response data keys: ${Object.keys(response.data).join(', ')}`);
      
      // Log some response details if available
      if (response.data.data) {
        log(`Equifax response contains data: ${typeof response.data.data}`);
      }
      if (response.data.transactionId) {
        log(`Transaction ID: ${response.data.transactionId}`);
      }
      
      return true;
    } else {
      logTest('Equifax RUT Query', false, `Query failed: ${response.data.message || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    const statusCode = error.response?.status;
    
    logTest('Equifax RUT Query', false, `Error ${statusCode}: ${errorMessage}`);
    
    // Log full error response for debugging
    if (error.response) {
      log(`Full error response: ${JSON.stringify(error.response.data, null, 2)}`, 'error');
    }
    
    return false;
  }
}

async function testEquifaxBulkQuery() {
  try {
    log('📊 Testing Equifax bulk query...');
    
    const payload = {
      ruts: [CONFIG.testRut, '76597967-6'], // Test with valid and potentially invalid RUT
      personalData: {
        firstName: 'Test',
        lastName: 'Bulk'
      },
      productData: {
        productName: 'Bulk Credit Report Test'
      }
    };

    const response = await axios.post(`${CONFIG.baseUrl}/equifax/bulk-query`, payload, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success) {
      logTest('Equifax Bulk Query', true, `Bulk query completed`);
      log(`Results count: ${response.data.results?.length || 0}`);
      
      if (response.data.results && response.data.results.length > 0) {
        response.data.results.forEach((result, index) => {
          log(`  Result ${index + 1}: RUT ${result.rut} - ${result.success ? 'Success' : 'Failed'}`);
        });
      }
      
      return true;
    } else {
      logTest('Equifax Bulk Query', false, `Bulk query failed: ${response.data.message || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    const statusCode = error.response?.status;
    
    logTest('Equifax Bulk Query', false, `Error ${statusCode}: ${errorMessage}`);
    return false;
  }
}

/**
 * Test runner
 */
async function runTests() {
  console.log('🚀 Starting Equifax API Tests'.bold.cyan);
  console.log('='.repeat(50).cyan);
  
  log(`Base URL: ${CONFIG.baseUrl}`);
  log(`Test User: ${CONFIG.testUser.email}`);
  log(`Test RUT: ${CONFIG.testRut}`);
  console.log();

  // Step 1: Authenticate
  const authSuccess = await authenticate();
  if (!authSuccess) {
    log('Authentication failed. Cannot proceed with tests.', 'error');
    return;
  }

  // Step 2: Verify authentication
  const verifySuccess = await verifyAuthentication();
  if (!verifySuccess) {
    log('Authentication verification failed. Cannot proceed with tests.', 'error');
    return;
  }

  console.log();
  log('🧪 Running Equifax API tests...');
  console.log();

  // Step 3: Test Equifax endpoints
  await testEquifaxHealth();
  await testEquifaxQueryRut();
  await testEquifaxBulkQuery();

  // Summary
  console.log();
  console.log('📊 Test Results Summary'.bold.cyan);
  console.log('='.repeat(50).cyan);
  
  log(`Total tests: ${testResults.total}`);
  log(`Passed: ${testResults.passed}`, testResults.passed > 0 ? 'success' : 'info');
  log(`Failed: ${testResults.failed}`, testResults.failed > 0 ? 'error' : 'info');
  
  const successRate = testResults.total > 0 ? ((testResults.passed / testResults.total) * 100).toFixed(1) : 0;
  log(`Success rate: ${successRate}%`, successRate >= 80 ? 'success' : successRate >= 50 ? 'warning' : 'error');

  if (testResults.failed === 0) {
    console.log();
    log('🎉 All tests passed! Equifax integration is working correctly.', 'success');
  } else {
    console.log();
    log('⚠️  Some tests failed. Please check the error messages above.', 'warning');
  }
}

/**
 * Error handling
 */
process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled Rejection at: ${promise}, reason: ${reason}`, 'error');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  log(`Uncaught Exception: ${error.message}`, 'error');
  process.exit(1);
});

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch((error) => {
    log(`Test runner error: ${error.message}`, 'error');
    process.exit(1);
  });
}

export {
  runTests,
  authenticate,
  testEquifaxHealth,
  testEquifaxQueryRut,
  testEquifaxBulkQuery
};