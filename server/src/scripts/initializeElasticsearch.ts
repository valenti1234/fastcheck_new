#!/usr/bin/env node

/**
 * Elasticsearch Initialization Script
 * 
 * This script initializes Elasticsearch indices with proper mappings
 * for different log types. It should be run during application startup
 * or deployment.
 */

import elkService from '../services/elkService';

async function initializeElasticsearch(): Promise<void> {
  console.log('=== Elasticsearch Initialization Started ===');
  
  try {
    // Check if ELK is enabled
    if (!elkService.isELKEnabled()) {
      console.log('ELK logging is disabled. Skipping initialization.');
      return;
    }

    // Check Elasticsearch connection
    console.log('Checking Elasticsearch connection...');
    const connectionTest = await elkService.testConnection();
    if (!connectionTest.success) {
      throw new Error(`Elasticsearch connection failed: ${connectionTest.message}`);
    }
    console.log('✓ Elasticsearch connection successful');

    // Check cluster health
    console.log('Checking Elasticsearch cluster health...');
    const isHealthy = await elkService.checkElasticsearchClusterHealth();
    if (!isHealthy) {
      console.warn('⚠ Elasticsearch cluster health check failed, but continuing...');
    } else {
      console.log('✓ Elasticsearch cluster is healthy');
    }

    // Initialize indices
    console.log('Initializing Elasticsearch indices...');
    await elkService.initializeIndices();
    console.log('✓ Elasticsearch indices initialized successfully');

    // Get index statistics
    console.log('Getting index statistics...');
    const stats = await elkService.getIndexStats();
    if (stats) {
      const indices = Object.keys(stats.indices || {});
      console.log(`✓ Found ${indices.length} indices:`);
      indices.forEach(index => {
        const indexStats = stats.indices[index];
        const docCount = indexStats.total?.docs?.count || 0;
        const storeSize = indexStats.total?.store?.size_in_bytes || 0;
        console.log(`  - ${index}: ${docCount} documents, ${(storeSize / 1024 / 1024).toFixed(2)} MB`);
      });
    }

    console.log('=== Elasticsearch Initialization Completed Successfully ===');
  } catch (error) {
    console.error('=== Elasticsearch Initialization Failed ===');
    console.error('Error:', error);
    
    // In production, you might want to exit with error code
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    
    throw error;
  }
}

// Export for use in other modules
export { initializeElasticsearch };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeElasticsearch()
    .then(() => {
      console.log('Initialization script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Initialization script failed:', error);
      process.exit(1);
    });
}