import axios from 'axios';
import { LogType } from './elkService';
import {
  indexMappings,
  indexLifecyclePolicies,
  ElasticsearchMapping
} from '../config/elasticsearch-mappings';

interface ElasticsearchConfig {
  url: string;
  auth?: {
    username: string;
    password: string;
  };
}

export class ElasticsearchIndexManager {
  private config: ElasticsearchConfig;
  private baseIndexName: string;

  constructor(config: ElasticsearchConfig, baseIndexName: string) {
    this.config = config;
    this.baseIndexName = baseIndexName;
  }

  /**
   * Initialize all indices with their respective mappings
   */
  public async initializeIndices(): Promise<void> {
    try {
      console.log('[ElasticsearchIndexManager] Initializing indices...');
      
      // Create indices for each log type
      await this.createIndexIfNotExists(
        `${this.baseIndexName}-requests`,
        indexMappings.httpRequest
      );
      
      await this.createIndexIfNotExists(
        `${this.baseIndexName}-business`,
        indexMappings.businessEvent
      );
      
      await this.createIndexIfNotExists(
        `${this.baseIndexName}-errors`,
        indexMappings.systemError
      );
      
      await this.createIndexIfNotExists(
        `${this.baseIndexName}-general`,
        indexMappings.general
      );
      
      await this.createIndexIfNotExists(
        `${this.baseIndexName}-sheriff`,
        indexMappings.sheriffApi
      );

      console.log('[ElasticsearchIndexManager] All indices initialized successfully');
    } catch (error) {
      console.error('[ElasticsearchIndexManager] Failed to initialize indices:', error);
      throw error;
    }
  }

  /**
   * Create an index if it doesn't exist
   */
  private async createIndexIfNotExists(
    indexName: string,
    mapping: ElasticsearchMapping
  ): Promise<void> {
    try {
      // Check if index exists
      const exists = await this.indexExists(indexName);
      
      if (exists) {
        console.log(`[ElasticsearchIndexManager] Index ${indexName} already exists`);
        // Optionally update mapping for existing index
        await this.updateIndexMapping(indexName, mapping.mappings);
        return;
      }

      // Create index with mapping
      await this.createIndex(indexName, mapping);
      console.log(`[ElasticsearchIndexManager] Created index: ${indexName}`);
    } catch (error) {
      console.error(`[ElasticsearchIndexManager] Failed to create index ${indexName}:`, error);
      throw error;
    }
  }

  /**
   * Check if an index exists
   */
  private async indexExists(indexName: string): Promise<boolean> {
    try {
      const response = await this.makeRequest('HEAD', `/${indexName}`);
      return response.status === 200;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Create an index with mapping
   */
  private async createIndex(
    indexName: string,
    mapping: ElasticsearchMapping
  ): Promise<void> {
    await this.makeRequest('PUT', `/${indexName}`, mapping);
  }

  /**
   * Update mapping for existing index
   */
  private async updateIndexMapping(
    indexName: string,
    mappings: any
  ): Promise<void> {
    try {
      await this.makeRequest('PUT', `/${indexName}/_mapping`, mappings);
      console.log(`[ElasticsearchIndexManager] Updated mapping for index: ${indexName}`);
    } catch (error) {
      console.warn(`[ElasticsearchIndexManager] Failed to update mapping for ${indexName}:`, error);
      // Don't throw error for mapping updates as they might conflict with existing mappings
    }
  }

  /**
   * Setup index lifecycle policies
   */
  public async setupLifecyclePolicies(): Promise<void> {
    try {
      console.log('[ElasticsearchIndexManager] Setting up lifecycle policies...');
      
      for (const [policyName, policy] of Object.entries(indexLifecyclePolicies)) {
        await this.createLifecyclePolicy(`${this.baseIndexName}-${policyName}-policy`, policy);
      }
      
      console.log('[ElasticsearchIndexManager] Lifecycle policies setup completed');
    } catch (error) {
      console.error('[ElasticsearchIndexManager] Failed to setup lifecycle policies:', error);
      // Don't throw error as lifecycle policies are optional
    }
  }

  /**
   * Create a lifecycle policy
   */
  private async createLifecyclePolicy(policyName: string, policy: any): Promise<void> {
    try {
      await this.makeRequest('PUT', `/_ilm/policy/${policyName}`, policy);
      console.log(`[ElasticsearchIndexManager] Created lifecycle policy: ${policyName}`);
    } catch (error) {
      console.warn(`[ElasticsearchIndexManager] Failed to create lifecycle policy ${policyName}:`, error);
    }
  }

  /**
   * Create index templates for automatic index creation
   */
  public async createIndexTemplates(): Promise<void> {
    try {
      console.log('[ElasticsearchIndexManager] Creating index templates...');
      
      // Template for request logs
      await this.createIndexTemplate(
        `${this.baseIndexName}-requests-template`,
        `${this.baseIndexName}-requests*`,
        indexMappings.httpRequest
      );
      
      // Template for business event logs
      await this.createIndexTemplate(
        `${this.baseIndexName}-business-template`,
        `${this.baseIndexName}-business*`,
        indexMappings.businessEvent
      );
      
      // Template for error logs
      await this.createIndexTemplate(
        `${this.baseIndexName}-errors-template`,
        `${this.baseIndexName}-errors*`,
        indexMappings.systemError
      );
      
      // Template for general logs
      await this.createIndexTemplate(
        `${this.baseIndexName}-general-template`,
        `${this.baseIndexName}-general*`,
        indexMappings.general
      );
      
      console.log('[ElasticsearchIndexManager] Index templates created successfully');
    } catch (error) {
      console.error('[ElasticsearchIndexManager] Failed to create index templates:', error);
    }
  }

  /**
   * Create an index template
   */
  private async createIndexTemplate(
    templateName: string,
    indexPattern: string,
    mapping: ElasticsearchMapping
  ): Promise<void> {
    const template = {
      index_patterns: [indexPattern],
      template: {
        settings: mapping.settings || {},
        mappings: mapping.mappings
      },
      priority: 100
    };
    
    try {
      await this.makeRequest('PUT', `/_index_template/${templateName}`, template);
      console.log(`[ElasticsearchIndexManager] Created index template: ${templateName}`);
    } catch (error) {
      console.warn(`[ElasticsearchIndexManager] Failed to create index template ${templateName}:`, error);
    }
  }

  /**
   * Get index statistics
   */
  public async getIndexStats(): Promise<any> {
    try {
      const response = await this.makeRequest('GET', `/${this.baseIndexName}-*/_stats`);
      return response.data;
    } catch (error) {
      console.error('[ElasticsearchIndexManager] Failed to get index stats:', error);
      return null;
    }
  }

  /**
   * Delete all indices (use with caution)
   */
  public async deleteAllIndices(): Promise<void> {
    try {
      console.log('[ElasticsearchIndexManager] Deleting all indices...');
      await this.makeRequest('DELETE', `/${this.baseIndexName}-*`);
      console.log('[ElasticsearchIndexManager] All indices deleted');
    } catch (error) {
      console.error('[ElasticsearchIndexManager] Failed to delete indices:', error);
      throw error;
    }
  }

  /**
   * Make HTTP request to Elasticsearch
   */
  private async makeRequest(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD',
    path: string,
    data?: any
  ): Promise<any> {
    const config: any = {
      method,
      url: `${this.config.url}${path}`,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    };

    if (data) {
      config.data = data;
    }

    if (this.config.auth) {
      config.auth = this.config.auth;
    }

    return await axios(config);
  }

  /**
   * Health check for Elasticsearch
   */
  public async healthCheck(): Promise<boolean> {
    try {
      const response = await this.makeRequest('GET', '/_cluster/health');
      return response.status === 200 && response.data.status !== 'red';
    } catch (error) {
      console.error('[ElasticsearchIndexManager] Health check failed:', error);
      return false;
    }
  }
}

// Factory function to create index manager
export function createElasticsearchIndexManager(
  elasticsearchUrl: string,
  baseIndexName: string,
  auth?: { username: string; password: string }
): ElasticsearchIndexManager {
  const config: ElasticsearchConfig = {
    url: elasticsearchUrl,
    auth
  };
  
  return new ElasticsearchIndexManager(config, baseIndexName);
}