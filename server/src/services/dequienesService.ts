import axios, { AxiosError, AxiosInstance } from 'axios';
import ELKService from './elkService';

interface RelationshipsRequest {
  rut: string;
  tenantId: string;
  distance?: number;
  relationshipDirection?: 'BOTH' | 'OUTGOING' | 'INCOMING';
  onePathPerNode?: boolean;
  apiKey?: string;
}

interface RelationshipsResponse {
  success: boolean;
  data?: any;
  error?: string;
  statusCode?: number;
  responseTime?: number;
}

interface LegalEvent {
  cve?: string;
  publication_date?: string;
  published_at?: string;
  actuation_type: string;
  company_name?: string;
  source: string;
  url?: string;
}

interface LegalEventsQueryResponse {
  success: boolean;
  data?: {
    rut: string;
    count: number;
    cached: boolean;
    timestamp: string;
    events: LegalEvent[];
    constitution_date?: string;
  };
  error?: string;
  statusCode?: number;
  responseTime?: number;
}

export class DequienesService {
  private static instance: DequienesService;
  private readonly axiosInstance: AxiosInstance;
  private readonly baseUrl: string;

  private constructor() {
    this.baseUrl = process.env.DEQUIENES_BASE_URL || 'http://127.0.0.1:8023';
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Accept': 'application/json'
      }
    });

    this.axiosInstance.interceptors.request.use(
      (config) => {
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    this.axiosInstance.interceptors.response.use(
      (response) => {
        return response;
      },
      (error) => {
        return Promise.reject(error);
      }
    );
  }

  public static getInstance(): DequienesService {
    if (!DequienesService.instance) {
      DequienesService.instance = new DequienesService();
    }
    return DequienesService.instance;
  }

  private sanitizeRut(rut: string): string {
    const rutNoDots = rut.replace(/\./g, '').trim();
    const parts = rutNoDots.split('-');
    const numeric = parts[0].replace(/^0+/, '') || '0';
    return numeric;
  }

  public async queryRelationships(req: RelationshipsRequest): Promise<RelationshipsResponse> {
    const startTime = Date.now();
    let statusCode: number | undefined;
    let errorMessage: string | undefined;

    const distance = req.distance ?? 5;
    const relationshipDirection = req.relationshipDirection ?? 'BOTH';
    const onePathPerNode = req.onePathPerNode ?? false;
    const apiKey = (req.apiKey || process.env.DEQUIENES_API_KEY || '').trim();
    const rutSanitized = this.sanitizeRut(req.rut);

    try {
      const url = `/relationships/${rutSanitized}`;
      const headers: Record<string, string> = { 'accept': 'application/json' };
      if (apiKey) headers['x-api-key'] = apiKey;

      const response = await this.axiosInstance.get(url, {
        params: {
          distance,
          relationship_direction: relationshipDirection,
          one_path_per_node: onePathPerNode ? 'true' : 'false'
        },
        headers
      });

      statusCode = response.status;
      const responseTime = Date.now() - startTime;

      let augmentedData: any = response.data;
      try {
        const legalRes = await this.queryLegalEvents({ rut: req.rut, tenantId: req.tenantId, apiKey });
        if (legalRes.success && legalRes.data) {
          augmentedData = {
            ...augmentedData,
            legalentity: legalRes.data
          };
        }
      } catch (e) {
        // Swallow errors from secondary call but keep primary response
      }

      await ELKService.logSheriffApiCall({
        callName: 'dequienes_relationships',
        method: 'GET',
        url: `${this.baseUrl}${url}`,
        statusCode,
        responseTime,
        rut: req.rut,
        logId: `dequienes_${rutSanitized}_${Date.now()}`,
        tenantId: req.tenantId,
        success: true,
        requestPayload: {
          params: { distance, relationshipDirection, onePathPerNode },
          headers: apiKey ? { 'x-api-key': '***' } : undefined
        },
        responseData: augmentedData
      });

      return {
        success: true,
        data: augmentedData,
        statusCode,
        responseTime
      };
    } catch (error) {
      const err = error as AxiosError;
      statusCode = err.response?.status;
      errorMessage = err.message;
      const responseTime = Date.now() - startTime;

      await ELKService.logSheriffApiCall({
        callName: 'dequienes_relationships',
        method: 'GET',
        url: `${this.baseUrl}/relationships/${rutSanitized}`,
        statusCode,
        responseTime,
        rut: req.rut,
        logId: `dequienes_${rutSanitized}_${Date.now()}`,
        tenantId: req.tenantId,
        success: false,
        errorMessage,
        requestPayload: {
          params: { distance, relationshipDirection, onePathPerNode },
          headers: apiKey ? { 'x-api-key': '***' } : undefined
        },
        responseData: err.response?.data
      });

      return {
        success: false,
        error: errorMessage,
        statusCode,
        responseTime
      };
    }
  }

  public async queryLegalEvents(req: { rut: string; tenantId: string; apiKey?: string }): Promise<LegalEventsQueryResponse> {
    const startTime = Date.now();
    let statusCode: number | undefined;
    let errorMessage: string | undefined;

    const apiKey = (req.apiKey || process.env.DEQUIENES_API_KEY || '').trim();
    const rutSanitized = this.sanitizeRut(req.rut);

    try {
      const url = `/api/legal-events/${rutSanitized}`;
      const headers: Record<string, string> = { 'accept': 'application/json' };
      if (apiKey) headers['x-api-key'] = apiKey;

      const response = await this.axiosInstance.get(url, { headers });

      statusCode = response.status;
      const responseTime = Date.now() - startTime;

      await ELKService.logSheriffApiCall({
        callName: 'dequienes_legal_events',
        method: 'GET',
        url: `${this.baseUrl}${url}`,
        statusCode,
        responseTime,
        rut: req.rut,
        logId: `dequienes_legal_events_${rutSanitized}_${Date.now()}`,
        tenantId: req.tenantId,
        success: true,
        requestPayload: {
          headers: apiKey ? { 'x-api-key': '***' } : undefined
        },
        responseData: response.data
      });

      return {
        success: true,
        data: response.data,
        statusCode,
        responseTime
      };
    } catch (error) {
      const err = error as AxiosError;
      statusCode = err.response?.status;
      errorMessage = err.message;
      const responseTime = Date.now() - startTime;

      await ELKService.logSheriffApiCall({
        callName: 'dequienes_legal_events',
        method: 'GET',
        url: `${this.baseUrl}/api/legal-events/${rutSanitized}`,
        statusCode,
        responseTime,
        rut: req.rut,
        logId: `dequienes_legal_events_${rutSanitized}_${Date.now()}`,
        tenantId: req.tenantId,
        success: false,
        errorMessage,
        requestPayload: {
          headers: apiKey ? { 'x-api-key': '***' } : undefined
        },
        responseData: err.response?.data
      });

      return {
        success: false,
        error: errorMessage,
        statusCode,
        responseTime
      };
    }
  }

  public async getHealthStatus(): Promise<{ status: string; baseUrl: string }> {
    try {
      const res = await this.axiosInstance.get('/health');
      const status = res.data?.status || 'unknown';
      return { status, baseUrl: this.baseUrl };
    } catch {
      return { status: 'unreachable', baseUrl: this.baseUrl };
    }
  }
}

export default DequienesService;
