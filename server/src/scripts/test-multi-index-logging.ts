/**
 * Test script to demonstrate multi-index Elasticsearch logging functionality
 * This script shows how different log types are routed to different indices
 */

import elkService, { LogType } from '../services/elkService.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testMultiIndexLogging() {
  console.log('=== Multi-Index Logging Test ===\n');

  // Check if ELK is enabled
  if (!process.env.ELK_ENABLED || process.env.ELK_ENABLED !== 'true') {
    console.log('⚠️  ELK is disabled. To test multi-index logging:');
    console.log('   1. Set ELK_ENABLED=true in your .env file');
    console.log('   2. Configure Elasticsearch connection settings');
    console.log('   3. Run this test again\n');
    
    console.log('📋 Current configuration would create these indices:');
    const baseIndex = process.env.ELASTICSEARCH_INDEX || 'duxiter-logs';
    console.log(`   • ${baseIndex}-requests (HTTP request logs)`);
    console.log(`   • ${baseIndex}-business (Business event logs)`);
    console.log(`   • ${baseIndex}-errors (System error logs)`);
    console.log(`   • ${baseIndex}-general (General application logs)\n`);
    return;
  }

  try {
    // Test connection
    console.log('🔍 Testing Elasticsearch connection...');
    const connectionTest = await elkService.testConnection();
    if (!connectionTest) {
      console.log('❌ Elasticsearch connection failed');
      return;
    }
    console.log('✅ Elasticsearch connection successful\n');

    // Get index configuration
    console.log('📋 Index Configuration:');
    const indexConfig = elkService.getIndexConfig();
    Object.entries(indexConfig).forEach(([logType, indexName]) => {
      console.log(`   ${logType}: ${indexName}`);
    });
    console.log('');

    // Test different log types
    console.log('📝 Testing different log types...\n');

    // 1. HTTP Request Log
    console.log('1. Testing HTTP Request logging...');
    elkService.logRequest({
      method: 'GET',
      url: '/api/test/multi-index',
      statusCode: 200,
      duration: 125,
      ip: '127.0.0.1',
      userAgent: 'Multi-Index-Test/1.0',
      userId: 'test-user-123',
      tenantId: 'test-tenant-456',
      requestId: 'req-multi-index-test'
    });
    console.log(`   → Logged to: ${elkService.getIndexName(LogType.HTTP_REQUEST)}`);

    // 2. Business Event Log
    console.log('2. Testing Business Event logging...');
    elkService.logBusinessEvent(
      'multi_index_test_event',
      {
        testType: 'multi-index-logging',
        timestamp: new Date().toISOString(),
        features: ['multiple-indices', 'log-routing', 'elasticsearch']
      },
      'test-user-123',
      'test-tenant-456'
    );
    console.log(`   → Logged to: ${elkService.getIndexName(LogType.BUSINESS_EVENT)}`);

    // 3. System Error Log
    console.log('3. Testing System Error logging...');
    const testError = new Error('Multi-index test error - this is expected');
    elkService.logSystemError(
      testError,
      'MultiIndexTest.testLogging',
      {
        testId: 'multi-index-test-001',
        component: 'logging-system',
        severity: 'low'
      }
    );
    console.log(`   → Logged to: ${elkService.getIndexName(LogType.SYSTEM_ERROR)}`);

    // 4. General Log
    console.log('4. Testing General logging...');
    elkService.info('Multi-index logging test completed successfully', {
      testSuite: 'multi-index-logging',
      totalTests: 4,
      status: 'completed'
    });
    console.log(`   → Logged to: ${elkService.getIndexName(LogType.GENERAL)}\n`);

    // Get index statistics
    console.log('📊 Fetching index statistics...');
    const stats = await elkService.getIndexStats();
    if (stats) {
      console.log('Index Statistics:');
      Object.entries(stats.indices).forEach(([indexName, indexStats]) => {
        const docCount = (indexStats as any).total?.docs?.count || 0;
        const sizeBytes = (indexStats as any).total?.store?.size_in_bytes || 0;
        const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);
        console.log(`   ${indexName}: ${docCount} documents, ${sizeMB} MB`);
      });
    } else {
      console.log('   Unable to fetch statistics');
    }

    console.log('\n✅ Multi-index logging test completed successfully!');
    console.log('\n💡 Tips:');
    console.log('   • Check Kibana to see logs in different indices');
    console.log('   • Use index patterns like "duxiter-logs-*" to view all logs');
    console.log('   • Create separate dashboards for different log types');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Export for use in other modules
export { testMultiIndexLogging };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testMultiIndexLogging()
    .then(() => {
      console.log('\n🎉 Test script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test script failed:', error);
      process.exit(1);
    });
}