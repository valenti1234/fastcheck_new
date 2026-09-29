import axios, { AxiosError } from 'axios';
import { SheriffDataLog, ISheriffDataLog } from '../models/SheriffDataLog';
import { SheriffApiCallLog } from '../models/SheriffApiCallLog'; // Import the new model
import { Result, IResult } from '../models/Result'; // Import the Result model
import { OpenAIService } from './OpenAIService';
import { CompanyAnalysisService } from './companyAnalysisService'; // Import company analysis service
import { log } from 'console';
import ELKService from './elkService'; // Import ELK service for logging
import { canonicalizeChileanRut } from '../helpers/rutCanonical';

import dotenv from 'dotenv';

dotenv.config();

const SHERIFF_V2_SERVICE_URL = process.env.SHERIFF_V2_SERVICE_URL || 'http://127.0.0.1:8024';

interface RutLookupRequest {
  rut: string;
  isMonitoring: boolean;
}

// This interface is for the in-memory object, not the DB model
interface IInMemorySheriffDataLog extends Partial<ISheriffDataLog> {
  [key: string]: any;
}


export class sheriffV2Service {
  private static instance: sheriffV2Service;
  private readonly axiosInstance;
  private readonly companyAnalysisService: CompanyAnalysisService;

  private constructor() {
    this.companyAnalysisService = new CompanyAnalysisService();
    this.axiosInstance = axios.create({
      baseURL: SHERIFF_V2_SERVICE_URL,
      headers: {
        'Content-Type': 'application/json',
        'accept': 'application/json',
        'x-client-identifier': process.env.SHERIFF_CLIENT_IDENTIFIER || 'SheriffSecureClient-v1'
      }
    });

    this.axiosInstance.interceptors.request.use(config => {
      const token = process.env.SHERIFF_API_TOKEN;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      } else {
        console.error('SHERIFF_API_TOKEN is not set in environment variables.');
      }
      return config;
    }, error => {
      return Promise.reject(error);
    });
  }

  public static getInstance(): sheriffV2Service {
    if (!sheriffV2Service.instance) {
      sheriffV2Service.instance = new sheriffV2Service();
    }
    return sheriffV2Service.instance;
  }

  public isHealthy(): boolean {
    return !!process.env.SHERIFF_API_TOKEN;
  }

  async queryRut(data: RutLookupRequest, tenantId: string, refresh: boolean): Promise<Partial<ISheriffDataLog>> {
    console.log(60, "calling sheriffV2Service.queryRut", tenantId, refresh);
    const { rut, isMonitoring } = data;
    /**
     * 🩹 FIX 29.09.2026: La antigua version trataba el RUT sin guion con un regex
     *    /^(\d+)(-[A-Za-z0-9])?$/ y luego removía ceros al principio, pero
     *    cuando el input era de 8 cifras TODO numérico (ej. 20779347) y NO tenía
     *    guion, el regex aceptaba todo el match[2] = '', dejando el cuerpo 20779347
     *    que se interpretaba implícitamente como sin-DV. Sin embargo el
     *    RutController.normalizeRut VIEJO hacía slice(0,-1) resultando en un
     *    cuerpo de 7 cifras (2077934) y DV=7, RUT erróneo. Usamos helper
     *    canonicalizeChileanRut para desambiguar con validación módulo-11.
     */
    const canonical = canonicalizeChileanRut(rut);
    const sanitizedRut = canonical.canonical; // Cuerpo-DV
    console.log(`[DEBUG] Original RUT: ${rut}, Canonical: ${sanitizedRut} (body=${canonical.body}, DV=${canonical.dv}, disambiguated=${canonical.disambiguatedNoDash})`);

    if (!tenantId) {
      throw new Error('Tenant ID is required to create a log entry');
    }

    // Check if data exists in Result collection
    const existingResult = await Result.findOne({
      rut: sanitizedRut,
      tenantId,
      archived: { $ne: true }
    }).sort({ createdAt: -1 });

    if (!refresh) {
      if (existingResult) {
        console.log(`[SheriffService.lookupRut] Found existing result for RUT ${sanitizedRut} with ID: ${existingResult._id}`);
        //console.log(76,"existingResult.sheriffLogData",existingResult.sheriffLogData);
        return existingResult.sheriffLogData || existingResult.toObject();
      }
    }

    // If no existing log found, proceed with API calls
    // 1. Create the main log entry to get a stable logId
    const logEntry = new SheriffDataLog({
      rut: sanitizedRut,
      tenantId,
      isMonitoringRequest: isMonitoring,
      fetchedAt: new Date(),
      apiCallErrors: [],
      allCallsSucceeded: true,
    });
    await logEntry.save();

    // This object will hold the data in memory for processing
    const inMemoryLog: IInMemorySheriffDataLog = {
      _id: logEntry._id,
      rut: sanitizedRut,
      tenantId, // Add tenant ID to in-memory log
      isMonitoringRequest: isMonitoring,
      fetchedAt: logEntry.fetchedAt,
      apiCallErrors: [],
      allCallsSucceeded: true,
    };

    const makeApiCall = async (
      callName: string, // No longer keyof ISheriffDataLog
      method: 'get' | 'post',
      url: string,
      payload?: any
    ): Promise<any> => {
      const startTime = Date.now();
      let statusCode: number | undefined;
      let success = false;
      let errorMessage: string | undefined;

      try {
        console.log(`[DEBUG] makeApiCall - callName: ${callName}, sanitizedRut: ${sanitizedRut}, url: ${url}`);
        console.log(136, `Attempting ${callName} call to ${SHERIFF_V2_SERVICE_URL}${url}`);
        const response = method === 'post'
          ? await this.axiosInstance.post(url, payload)
          : await this.axiosInstance.get(url);

        statusCode = response.status;
        success = true;
        const responseTime = Date.now() - startTime;

        console.log(`Success: ${callName} - Status ${response.status} - Time: ${responseTime}ms`);

        // Log to Elasticsearch
        await ELKService.logSheriffApiCall({
          callName,
          method: method.toUpperCase(),
          url: `${SHERIFF_V2_SERVICE_URL}${url}`,
          statusCode,
          responseTime,
          rut: sanitizedRut,
          logId: logEntry._id.toString(),
          tenantId,
          success: true,
          requestPayload: payload,
          responseData: response.data
        });

        // Save to separate collection
        const apiLog = new SheriffApiCallLog({
          rut: sanitizedRut,
          logId: logEntry._id,
          callName: callName,
          data: response.data,
        });
        await apiLog.save();

        // Also store in memory for current operation
        inMemoryLog[callName] = response.data;

        return response.data;
      } catch (error) {
        const err = error as AxiosError;
        statusCode = err.response?.status;
        success = false;
        errorMessage = err.message;
        const responseTime = Date.now() - startTime;

        console.error(`Error in ${callName} call to ${url}:`, err.message);

        // Log to Elasticsearch
        await ELKService.logSheriffApiCall({
          callName,
          method: method.toUpperCase(),
          url: `${SHERIFF_V2_SERVICE_URL}${url}`,
          statusCode,
          responseTime,
          rut: sanitizedRut,
          logId: logEntry._id.toString(),
          tenantId,
          success: false,
          errorMessage,
          requestPayload: payload
        });

        logEntry.apiCallErrors.push({
          step: callName,
          message: err.message,
          data: err.response?.data || err.config || 'No additional error data',
        });
        logEntry.allCallsSucceeded = false;
        // Also update in-memory log
        inMemoryLog.allCallsSucceeded = false;
        inMemoryLog.apiCallErrors?.push(logEntry.apiCallErrors[logEntry.apiCallErrors.length - 1]);
        return null;
      }
    };

    if (!sanitizedRut) {
      const errorMessage = 'RUT is missing in the request data.';
      console.error(errorMessage);
      logEntry.apiCallErrors.push({ step: 'initialization', message: errorMessage });
      logEntry.allCallsSucceeded = false;
      await logEntry.save();
      return logEntry.toObject();
    }

    const sanitizedData = { ...data, rut: sanitizedRut };
    console.log(`[DEBUG] About to call loadRutData with RUT: ${sanitizedRut}`);

    const summaryData = await makeApiCall('loadRutData', 'post', '/queryRut', sanitizedData);
    //console.log(209, loadRutData); 
    //console.log(`[DEBUG] loadRutData response RUT: ${loadRutData?.data?.rut || 'No RUT in response'}`);

    // 🔧 FIX 29.09.2026: NULL-SAFETY COMPLETO
    // Si sheriff_v2 retorna 400/500 → makeApiCall retorna null → evitar TypeError al acceder a .data / .resumen
    if (summaryData == null) {
      console.error('[sheriffV2Service.queryRut] loadRutData FAILED (null response from sheriff_v2) — returning fallback stub with valid empty structure');
      const fallback: any = {
        success: false,
        rut: sanitizedRut,
        sheriffFetchFailed: true,
        resumen: { data: { rut: sanitizedRut, identificacion: {}, esPersonaJuridica: false, boletinLaboral: {}, bienes: { vehiculos: {}, propiedades: {} } } },
        data: { compliance: { personType: 'natural', summary: [] } },
        compliance: { data: {} },
        creditScore: { data: {} },
        summaryData: null,
        _fallbackReason: 'sheriff_v2_queryrut_failed',
        apiCallErrors: [{ step: 'loadRutData', message: 'Null response from sheriff_v2 (/queryRut)' }],
      };
      // Marcar log como fallido
      logEntry.allCallsSucceeded = false;
      inMemoryLog.allCallsSucceeded = false;
      logEntry.apiCallErrors.push({ step: 'loadRutData', message: 'Null response from sheriff_v2 (/queryRut)' });
      try { await logEntry.save(); } catch {} // fire-and-forget
      return fallback;
    }

    // Inicializar estructura con null-safety (evitar "Cannot set property of undefined")
    if (!summaryData.data) summaryData.data = {};
    if (!summaryData.data.compliance) summaryData.data.compliance = {};
    if (!summaryData.resumen) summaryData.resumen = {};
    if (!summaryData.resumen.data) summaryData.resumen.data = {};

    const isJuridica = Boolean(summaryData.resumen.data?.esPersonaJuridica);
    summaryData.data.compliance.personType = isJuridica ? "juridical" : "natural";

    // Asegurar flags que el controller espera en la raíz
    if (typeof summaryData.success === 'undefined') summaryData.success = true;
    if (!summaryData.compliance) summaryData.compliance = { data: summaryData.data.compliance };
    if (!summaryData.creditScore) summaryData.creditScore = { data: {} };

  //  console.warn(230, "sheriffV2Seervice summaryData", summaryData);

    return summaryData;
  }

  public calculateRiskLevelFromSheriff(log: IInMemorySheriffDataLog): string {
    const summary = log.summaryData?.data?.compliance?.summary || [];
    const judicial = log.summaryData?.data?.judicialSummary || {};
    const mora = log.summaryData?.data?.moraPrevisionalSummary || { totalCases: 0 };

    let highRiskCount = 0;
    const totalParams = Number(process.env.RISK_TOTAL_PARAMS) || 10;

    const isRisky = (tableName: string): boolean =>
      summary.find((s: any) => s.table === tableName)?.countResults! > 0;

    if (isRisky("PEP Chile")) highRiskCount++;
    if (isRisky("Funcionarios Públicos")) highRiskCount++;
    if (isRisky("Familiares PEP")) highRiskCount++;
    if (isRisky("Listas Internacionales")) highRiskCount++;
    if (isRisky("Penal")) highRiskCount++;
    if (isRisky("Noticias")) highRiskCount++;

    if ((judicial?.civilFiledCases || 0) > (Number(process.env.RISK_CIVIL_CASES_THRESHOLD) || 70)) highRiskCount++;
    if ((judicial?.laboralFiledCases || 0) > (Number(process.env.RISK_LABORAL_CASES_THRESHOLD) || 10)) highRiskCount++;
    if (mora?.totalCases > 0) highRiskCount++;

    const percentage = (highRiskCount / totalParams) * 100;

    if (percentage >= (Number(process.env.RISK_CRITICAL_PERCENTAGE) || 70) || (isRisky("Penal") && highRiskCount >= 1)) return "Crítico";
    if (percentage >= (Number(process.env.RISK_HIGH_PERCENTAGE) || 50)) return "Alto";
    if (percentage >= (Number(process.env.RISK_MEDIUM_PERCENTAGE) || 30)) return "Medio";
    return "Bajo";
  }

  public calculateHumanCapitalRisk(log: IInMemorySheriffDataLog): any {
    const laboralFines = log.summaryData?.data?.multaLaboralSummary?.totalFines || 0;
    const previsionalDebt = log.summaryData?.data?.moraPrevisionalSummary?.totalCases || 0;

    const results = {
      'Prácticas Antisindicales': {
        impacto: 'Severo',
        coincidencia: 'No Disponible',
        riesgo: 'No Disponible',
        semaforo: '⚪️',
      },
      'Deuda y Previsional': {
        impacto: 'Significativo',
        coincidencia: previsionalDebt > 0 ? 'Sí' : 'No',
        riesgo: previsionalDebt > 0 ? 'Alto' : 'Bajo',
        semaforo: previsionalDebt > 0 ? '🔴' : '🟢',
      },
      'Multas Laborales': {
        impacto: 'Significativo',
        coincidencia: laboralFines > 0 ? 'Sí' : 'No',
        riesgo: laboralFines > 0 ? 'Alto' : 'Bajo',
        semaforo: laboralFines > 0 ? '🔴' : '🟢',
      },
      'Deuda Previsional Presunta': {
        impacto: 'Significativo',
        coincidencia: 'No Disponible',
        riesgo: 'No Disponible',
        semaforo: '⚪️',
      },
    };

    return results;
  }

  static async getAllLogs(params: { tenantId: string, page?: number, limit?: number, rut?: string, startDate?: string, endDate?: string }): Promise<{ logs: ISheriffDataLog[], total: number, pages: number, currentPage: number }> {
    const { tenantId, page = 1, limit = Number(process.env.SHERIFF_PAGINATION_LIMIT) || 10, rut, startDate, endDate } = params;
    try {
      if (!tenantId) {
        throw new Error('Tenant ID is required to fetch logs');
      }

      const skip = (page - 1) * limit;
      const query: any = { tenantId };
      if (rut) {
        query.rut = rut;
      }
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      const logs = await SheriffDataLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await SheriffDataLog.countDocuments(query);

      return {
        logs: logs as ISheriffDataLog[],
        total,
        pages: Math.ceil(total / limit),
        currentPage: page,
      };
    } catch (error) {
      console.error(`Error fetching SheriffDataLogs for tenant ${tenantId}:`, error);
      throw new Error('Failed to retrieve Sheriff data logs.');
    }
  }

  /**
   * Get all logs across all tenants (superuser only)
   */
  static async getAllLogsAcrossTenants(params: { page?: number, limit?: number, rut?: string, startDate?: string, endDate?: string }): Promise<{ logs: ISheriffDataLog[], total: number, pages: number, currentPage: number }> {
    const { page = 1, limit = Number(process.env.SHERIFF_PAGINATION_LIMIT) || 10, rut, startDate, endDate } = params;
    try {
      const skip = (page - 1) * limit;
      const query: any = {};
      if (rut) {
        query.rut = rut;
      }
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      const logs = await SheriffDataLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await SheriffDataLog.countDocuments(query);

      return {
        logs: logs as ISheriffDataLog[],
        total,
        pages: Math.ceil(total / limit),
        currentPage: page,
      };
    } catch (error) {
      console.error('Error fetching SheriffDataLogs across tenants:', error);
      throw new Error('Failed to retrieve Sheriff data logs across tenants.');
    }
  }

  static async getLogById(logId: string, tenantId: string): Promise<any | null> {
    try {
      if (!tenantId) {
        throw new Error('Tenant ID is required to fetch log');
      }

      // Find log by ID and tenant ID to ensure tenant isolation
      const log = await SheriffDataLog.findOne({ _id: logId, tenantId }).lean();
      if (!log) {
        return null;
      }
      const apiCallLogs = await SheriffApiCallLog.find({ logId: log._id }).lean();
      const fullLog = { ...log, apiCalls: {} as Record<string, any> };
      apiCallLogs.forEach(callLog => {
        fullLog.apiCalls[callLog.callName] = callLog.data;
        (fullLog as any)[callLog.callName] = callLog.data;
      });
      return fullLog;
    } catch (error) {
      console.error(`Error fetching SheriffDataLog by ID ${logId} for tenant ${tenantId}:`, error);
      throw new Error('Failed to retrieve Sheriff data log by ID.');
    }
  }

  /**
   * Get log by ID ignoring tenant filter (superuser only)
   */
  static async getLogByIdAcrossTenants(logId: string): Promise<any | null> {
    try {
      const log = await SheriffDataLog.findOne({ _id: logId }).lean();
      if (!log) {
        return null;
      }
      const apiCallLogs = await SheriffApiCallLog.find({ logId: log._id }).lean();
      const fullLog = { ...log, apiCalls: {} as Record<string, any> };
      apiCallLogs.forEach(callLog => {
        fullLog.apiCalls[callLog.callName] = callLog.data;
        (fullLog as any)[callLog.callName] = callLog.data;
      });
      return fullLog;
    } catch (error) {
      console.error(`Error fetching SheriffDataLog by ID ${logId} across tenants:`, error);
      throw new Error('Failed to retrieve Sheriff data log by ID across tenants.');
    }
  }
}
