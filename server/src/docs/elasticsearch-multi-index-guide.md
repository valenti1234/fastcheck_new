# Elasticsearch Multi-Index Logging Implementation Guide

This guide explains the implementation of different Elasticsearch indices for different logging groups in the Duxiter application.

## Overview

The logging system now uses separate Elasticsearch indices for different types of logs:

- **HTTP Request Logs** (`{base}-requests`): API requests, responses, and performance metrics
- **Business Event Logs** (`{base}-business`): Business logic events, user actions, and audit trails
- **System Error Logs** (`{base}-errors`): Application errors, exceptions, and system failures
- **General Logs** (`{base}-general`): General application logs and debug information

## Architecture

### Components

1. **ELK Service** (`src/services/elkService.ts`)
   - Enhanced with multi-index support
   - Automatic log type detection
   - Index configuration management

2. **Index Manager** (`src/services/elasticsearchIndexManager.ts`)
   - Handles index creation and management
   - Applies proper mappings and settings
   - Manages lifecycle policies

3. **Index Mappings** (`src/config/elasticsearch-mappings.ts`)
   - Defines field mappings for each log type
   - Configures index settings and lifecycle policies

4. **Initialization Script** (`src/scripts/initializeElasticsearch.ts`)
   - Sets up indices during application startup
   - Validates Elasticsearch connection

## Configuration

### Environment Variables

Copy `src/config/elasticsearch.env.example` to your `.env` file and configure:

```bash
# Enable ELK logging
ELK_ENABLED=true

# Elasticsearch connection
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=changeme

# Base index name
ELASTICSEARCH_INDEX=duxiter-logs
```

### Index Naming Convention

With base name `duxiter-logs`, the following indices are created:
- `duxiter-logs-requests`
- `duxiter-logs-business`
- `duxiter-logs-errors`
- `duxiter-logs-general`

## Integration

### Application Startup

Add the initialization to your application startup process:

```typescript
import { initializeElasticsearch } from './src/scripts/initializeElasticsearch';

// During application startup
async function startApplication() {
  try {
    // Initialize Elasticsearch indices
    await initializeElasticsearch();
    
    // Continue with your application startup
    // ...
  } catch (error) {
    console.error('Failed to initialize Elasticsearch:', error);
    // Handle error appropriately
  }
}
```

### Manual Initialization

You can also run the initialization script manually:

```bash
# From the server directory
npx ts-node src/scripts/initializeElasticsearch.ts
```

## Usage

### Logging Different Types

The ELK service automatically routes logs to the appropriate index based on the log type:

```typescript
import elkService from './src/services/elkService';

// HTTP Request logging (goes to requests index)
elkService.logRequest({
  method: 'GET',
  url: '/api/users',
  statusCode: 200,
  duration: 150,
  userId: 'user123',
  tenantId: 'tenant456'
});

// Business Event logging (goes to business index)
elkService.logBusinessEvent('user_created', {
  userId: 'user123',
  email: 'user@example.com',
  tenantId: 'tenant456'
}, 'admin123', 'tenant456');

// System Error logging (goes to errors index)
elkService.logSystemError(
  new Error('Database connection failed'),
  'UserService.createUser',
  { userId: 'user123', tenantId: 'tenant456' }
);

// General logging (goes to general index)
elkService.info('Application started successfully', {
  version: '1.0.0',
  environment: 'production'
});
```

### Getting Index Information

```typescript
// Get index configuration
const indexConfig = elkService.getIndexConfig();
console.log('Available indices:', indexConfig);

// Get specific index name
const requestsIndex = elkService.getIndexName(LogType.HTTP_REQUEST);
console.log('Requests index:', requestsIndex);

// Get index statistics
const stats = await elkService.getIndexStats();
console.log('Index statistics:', stats);
```

## Index Mappings

### HTTP Request Logs

```json
{
  "@timestamp": "date",
  "level": "keyword",
  "message": "text",
  "method": "keyword",
  "url": "text with keyword field",
  "statusCode": "integer",
  "duration": "integer",
  "ip": "ip",
  "userAgent": "text with keyword field",
  "userId": "keyword",
  "tenantId": "keyword"
}
```

### Business Event Logs

```json
{
  "@timestamp": "date",
  "level": "keyword",
  "message": "text",
  "event": "keyword",
  "data": "object (dynamic)",
  "userId": "keyword",
  "tenantId": "keyword",
  "entityType": "keyword",
  "entityId": "keyword",
  "action": "keyword",
  "result": "keyword"
}
```

### System Error Logs

```json
{
  "@timestamp": "date",
  "level": "keyword",
  "message": "text",
  "error": {
    "name": "keyword",
    "message": "text",
    "stack": "text (not indexed)"
  },
  "context": "keyword",
  "severity": "keyword",
  "component": "keyword",
  "operation": "keyword"
}
```

## Lifecycle Management

### Index Lifecycle Policies

Each index type has different retention policies:

| Index Type | Hot Phase | Warm Phase | Delete After |
|------------|-----------|------------|--------------|
| HTTP Requests | 30 days, 50GB | 30 days, 0 replicas | 90 days |
| Business Events | 7 days, 10GB | 7 days, 0 replicas | 365 days |
| System Errors | 7 days, 5GB | 7 days, 1 replica | 180 days |
| General Logs | 30 days, 20GB | 30 days, 0 replicas | 60 days |

### Customizing Lifecycle Policies

Modify the policies in `src/config/elasticsearch-mappings.ts`:

```typescript
export const indexLifecyclePolicies = {
  httpRequest: {
    policy: {
      phases: {
        hot: {
          actions: {
            rollover: {
              max_size: '50gb',
              max_age: '30d'
            }
          }
        },
        // ... customize as needed
      }
    }
  }
};
```

## Monitoring and Maintenance

### Health Checks

```typescript
// Check Elasticsearch connection
const connectionTest = await elkService.testConnection();
console.log('Connection:', connectionTest);

// Check cluster health
const isHealthy = await elkService.checkElasticsearchClusterHealth();
console.log('Cluster healthy:', isHealthy);

// Check basic connectivity
const basicHealth = await elkService.checkElasticsearchHealth();
console.log('Basic health:', basicHealth);
```

### Index Statistics

```typescript
const stats = await elkService.getIndexStats();
if (stats) {
  Object.entries(stats.indices).forEach(([indexName, indexStats]) => {
    console.log(`${indexName}:`, {
      documents: indexStats.total.docs.count,
      size: `${(indexStats.total.store.size_in_bytes / 1024 / 1024).toFixed(2)} MB`
    });
  });
}
```

## Troubleshooting

### Common Issues

1. **Index Creation Fails**
   - Check Elasticsearch connection
   - Verify authentication credentials
   - Ensure sufficient permissions

2. **Logs Not Appearing in Expected Index**
   - Verify log type detection logic
   - Check index configuration
   - Review log metadata

3. **Performance Issues**
   - Monitor index sizes
   - Review lifecycle policies
   - Consider index sharding

### Debug Mode

Enable debug logging to troubleshoot issues:

```bash
LOG_LEVEL=debug
```

## Migration from Single Index

If migrating from a single-index setup:

1. **Backup existing data**
2. **Run initialization script** to create new indices
3. **Update application code** to use new logging methods
4. **Migrate existing data** if needed using Elasticsearch reindex API
5. **Update Kibana dashboards** to use new index patterns

## Best Practices

1. **Use appropriate log types** for better organization
2. **Include relevant metadata** for better searchability
3. **Monitor index sizes** and adjust lifecycle policies
4. **Use structured logging** for consistent data format
5. **Implement proper error handling** for logging failures
6. **Regular health checks** to ensure system reliability

## Performance Considerations

- **Index Templates**: Automatically apply mappings to new indices
- **Lifecycle Policies**: Manage index growth and retention
- **Sharding Strategy**: Configure appropriate shard counts
- **Refresh Intervals**: Balance real-time visibility with performance
- **Bulk Operations**: Use bulk indexing for high-volume scenarios