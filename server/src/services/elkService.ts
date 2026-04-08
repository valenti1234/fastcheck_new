import winston from 'winston';
import axios from 'axios';
import { ElasticsearchIndexManager, createElasticsearchIndexManager } from './elasticsearchIndexManager';

interface LogData {
  level: string;
  message: string;
  timestamp?: string;
  service?: string;
  userId?: string;
  tenantId?: string;
  requestId?: string;
  method?: string;
  url?: string;
  statusCode?: number;
  duration?: number;
  ip?: string;
  userAgent?: string;
  error?: any;
  metadata?: any;
}

// Enum for different log types and their corresponding indices
enum LogType {
  HTTP_REQUEST = 'http_request',
  BUSINESS_EVENT = 'business_event',
  SYSTEM_ERROR = 'system_error',
  GENERAL = 'general',
  SHERIFF_API = 'sheriff_api'
}

// Index configuration for different log types
interface IndexConfig {
  [LogType.HTTP_REQUEST]: string;
  [LogType.BUSINESS_EVENT]: string;
  [LogType.SYSTEM_ERROR]: string;
  [LogType.GENERAL]: string;
  [LogType.SHERIFF_API]: string;
}

class ELKService {
  private static instance: ELKService;
  private logger: winston.Logger;
  private isEnabled: boolean;
  private elasticsearchUrl: string;
  private baseIndexName: string;
  private indexConfig: IndexConfig;
  private auth?: { username: string; password: string };
  private indexManager?: ElasticsearchIndexManager;

  private constructor() {
    this.isEnabled = process.env.ELK_ENABLED === 'true';
    this.elasticsearchUrl = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
    this.baseIndexName = process.env.ELASTICSEARCH_INDEX || 'duxiter-logs';
    
    // Initialize index configuration for different log types
    this.indexConfig = {
      [LogType.HTTP_REQUEST]: `${this.baseIndexName}-requests`,
      [LogType.BUSINESS_EVENT]: `${this.baseIndexName}-business`,
      [LogType.SYSTEM_ERROR]: `${this.baseIndexName}-errors`,
      [LogType.GENERAL]: `${this.baseIndexName}-general`,
      [LogType.SHERIFF_API]: `${this.baseIndexName}-sheriff`
    };
    
    if (process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD) {
      this.auth = {
        username: process.env.ELASTICSEARCH_USERNAME,
        password: process.env.ELASTICSEARCH_PASSWORD
      };
    }
    
    // Initialize index manager if ELK is enabled
    if (this.isEnabled) {
      this.indexManager = createElasticsearchIndexManager(
        this.elasticsearchUrl,
        this.baseIndexName,
        this.auth
      );
    }
    
    this.logger = this.createLogger();
  }

  public static getInstance(): ELKService {
    if (!ELKService.instance) {
      ELKService.instance = new ELKService();
    }
    return ELKService.instance;
  }

  private createLogger(): winston.Logger {
    if (!this.isEnabled) {
      return winston.createLogger({
        silent: true,
        transports: []
      });
    }

    const transports: winston.transport[] = [
      // Console transport per sviluppo
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
            return `${timestamp} [${level}]: ${message} ${metaStr}`;
          })
        )
      })
    ];

    // File transport per produzione
    if (process.env.NODE_ENV === 'production') {
      transports.push(
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        }),
        new winston.transports.File({
          filename: 'logs/combined.log',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        })
      );
    }

    const logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports,
      defaultMeta: {
        service: 'duxiter-server',
        environment: process.env.NODE_ENV || 'development'
      }
    });

    // Hook per inviare logs a Elasticsearch
    if (this.isEnabled) {
      logger.on('data', (info) => {
        // Determine log type from metadata
        const logType = this.determineLogType(info);
        this.sendToElasticsearch(info, logType).catch(error => {
          console.error(`[${new Date().toISOString()}] [ELK] - Failed to send log to Elasticsearch:`, error.message);
        });
      });
      console.log(`[${new Date().toISOString()}] [ELK] - Elasticsearch logging enabled`);
    }

    return logger;
  }

  // Helper method to determine log type from log metadata
  private determineLogType(logInfo: any): LogType {
    if (logInfo.type) {
      switch (logInfo.type) {
        case 'http_request':
          return LogType.HTTP_REQUEST;
        case 'business_event':
          return LogType.BUSINESS_EVENT;
        case 'system_error':
          return LogType.SYSTEM_ERROR;
        default:
          return LogType.GENERAL;
      }
    }
    
    // Fallback: determine by log level and content
    if (logInfo.level === 'error' && (logInfo.error || logInfo.stack)) {
      return LogType.SYSTEM_ERROR;
    }
    
    return LogType.GENERAL;
  }

  private async sendToElasticsearch(logData: any, logType: LogType = LogType.GENERAL): Promise<void> {
    if (!this.isEnabled) return;

    try {
      const document = {
        '@timestamp': new Date().toISOString(),
        level: logData.level,
        message: logData.message,
        service: 'duxiter-server',
        environment: process.env.NODE_ENV || 'development',
        logType: logType,
        ...logData
      };

      const indexName = this.indexConfig[logType];
      const url = `${this.elasticsearchUrl}/${indexName}/_doc`;
      
      const config: any = {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000
      };

      if (this.auth) {
        config.auth = this.auth;
      }

      await axios.post(url, document, config);
    } catch (error) {
      // Non rilanciare l'errore per evitare loop infiniti
      // Solo logga l'errore nella console
    }
  }

  // Metodi di logging
  public info(message: string, meta?: any): void {
    if (!this.isEnabled) return;
    this.logger.info(message, meta);
  }

  public error(message: string, error?: Error, meta?: any): void {
    if (!this.isEnabled) return;
    const errorMeta = error ? {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    } : {};
    
    this.logger.error(message, { ...errorMeta, ...meta });
  }

  public warn(message: string, meta?: any): void {
    if (!this.isEnabled) return;
    this.logger.warn(message, meta);
  }

  public debug(message: string, meta?: any): void {
    if (!this.isEnabled) return;
    this.logger.debug(message, meta);
  }

  // Logging specifico per richieste HTTP
  public logRequest(data: {
    method: string;
    url: string;
    statusCode: number;
    duration: number;
    ip?: string;
    userAgent?: string;
    userId?: string;
    tenantId?: string;
    requestId?: string;
  }): void {
    if (!this.isEnabled) return;
    const level = data.statusCode >= 400 ? 'error' : data.statusCode >= 300 ? 'warn' : 'info';
    const message = `${data.method} ${data.url} - ${data.statusCode} - ${data.duration}ms`;
    
    this.logger.log(level, message, {
      type: LogType.HTTP_REQUEST,
      method: data.method,
      url: data.url,
      statusCode: data.statusCode,
      duration: data.duration,
      ip: data.ip,
      userAgent: data.userAgent,
      userId: data.userId,
      tenantId: data.tenantId,
      requestId: data.requestId
    });
  }

  // Logging per operazioni di business
  public logBusinessEvent(event: string, data: any, userId?: string, tenantId?: string): void {
    if (!this.isEnabled) return;
    this.logger.info(`Business Event: ${event}`, {
      type: LogType.BUSINESS_EVENT,
      event,
      data,
      userId,
      tenantId
    });
  }

  // Logging per errori di sistema
  public logSystemError(error: Error, context?: string, meta?: any): void {
    if (!this.isEnabled) return;
    this.logger.error(`System Error${context ? ` in ${context}` : ''}`, {
      type: LogType.SYSTEM_ERROR,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      context,
      ...meta
    });
  }

  // Verifica la salute della connessione Elasticsearch
  public async checkElasticsearchHealth(): Promise<boolean> {
    if (!this.isEnabled) {
      return false;
    }

    try {
      const config: any = {
        timeout: 5000
      };

      if (this.auth) {
        config.auth = this.auth;
      }

      const response = await axios.get(`${this.elasticsearchUrl}/_cluster/health`, config);
      return response.status === 200;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [ELK] - Elasticsearch health check failed:`, error);
      return false;
    }
  }

  // Ottieni statistiche sui logs
  public async getLogStats(timeRange: string = '1h'): Promise<any> {
    if (!this.isEnabled) {
      return null;
    }

    try {
      const config: any = {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      };

      if (this.auth) {
        config.auth = this.auth;
      }

      const searchBody = {
        query: {
          range: {
            '@timestamp': {
              gte: `now-${timeRange}`
            }
          }
        },
        aggs: {
          levels: {
            terms: {
              field: 'level.keyword'
            }
          },
          timeline: {
            date_histogram: {
              field: '@timestamp',
              interval: '5m'
            }
          }
        },
        size: 0
      };

      const response = await axios.post(
        `${this.elasticsearchUrl}/${this.baseIndexName}-*/_search`,
        searchBody,
        config
      );

      return response.data.aggregations;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [ELK] - Failed to get log stats:`, error);
      return null;
    }
  }

  public isELKEnabled(): boolean {
    return this.isEnabled;
  }

  // Get index configuration for external use
  public getIndexConfig(): IndexConfig {
    return { ...this.indexConfig };
  }

  // Get specific index name by log type
  public getIndexName(logType: LogType): string {
    return this.indexConfig[logType];
  }

  // Initialize Elasticsearch indices with proper mappings
  public async initializeIndices(): Promise<void> {
    if (!this.isEnabled || !this.indexManager) {
      console.log('[ELK] - Index initialization skipped (ELK disabled)');
      return;
    }

    try {
      console.log('[ELK] - Initializing Elasticsearch indices...');
      await this.indexManager.initializeIndices();
      await this.indexManager.createIndexTemplates();
      await this.indexManager.setupLifecyclePolicies();
      console.log('[ELK] - Elasticsearch indices initialized successfully');
    } catch (error) {
      console.error('[ELK] - Failed to initialize indices:', error);
      throw error;
    }
  }

  // Get index statistics
  public async getIndexStats(): Promise<any> {
    if (!this.isEnabled || !this.indexManager) {
      return null;
    }
    return await this.indexManager.getIndexStats();
  }

  // Health check for Elasticsearch cluster
  public async checkElasticsearchClusterHealth(): Promise<boolean> {
    if (!this.isEnabled || !this.indexManager) {
      return false;
    }
    return await this.indexManager.healthCheck();
  }

  // Metodo per testare la connessione
  public async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.isEnabled) {
      return { success: false, message: 'ELK is disabled' };
    }

    try {
      const isHealthy = await this.checkElasticsearchHealth();
      if (isHealthy) {
        // Invia un log di test
        this.info('ELK connection test', { type: 'connection_test' });
        return { success: true, message: 'ELK connection successful' };
      } else {
        // Log warning but don't fail server startup
        console.warn('[ELK] Elasticsearch not available, continuing with local logging only');
        return { success: false, message: 'Elasticsearch health check failed - continuing with local logging' };
      }
    } catch (error) {
      // Log warning but don't fail server startup
      console.warn('[ELK] Elasticsearch connection failed, continuing with local logging only:', error instanceof Error ? error.message : 'Unknown error');
      return { 
        success: false, 
        message: `ELK connection failed: ${error instanceof Error ? error.message : 'Unknown error'} - continuing with local logging` 
      };
    }
  }

  // Metodo per inviare log manualmente a Elasticsearch
  public async sendLogToElk(level: string, message: string, meta?: any): Promise<void> {
    if (!this.isEnabled) return;

    const logData = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...meta
    };

    await this.sendToElasticsearch(logData);
  }

  // Metodo specifico per il logging delle chiamate Sheriff API
  public async logSheriffApiCall(data: {
    callName: string;
    method: string;
    url: string;
    statusCode?: number;
    responseTime: number;
    rut: string;
    logId: string;
    tenantId: string;
    success: boolean;
    errorMessage?: string;
    requestPayload?: any;
    responseData?: any;
  }): Promise<void> {
    if (!this.isEnabled) return;

    const logData = {
      '@timestamp': new Date().toISOString(),
      level: data.success ? 'info' : 'error',
      message: `Sheriff API call: ${data.callName}`,
      logType: LogType.SHERIFF_API,
      service: 'sheriff-api',
      environment: process.env.NODE_ENV || 'development',
      ...data
    };

    await this.sendToElasticsearch(logData, LogType.SHERIFF_API);
  }
}

export { ELKService, LogData, LogType, IndexConfig };
export default ELKService.getInstance();
