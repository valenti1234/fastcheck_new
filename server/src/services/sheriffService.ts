import axios, { AxiosError } from 'axios';
import { SheriffDataLog, ISheriffDataLog } from '../models/SheriffDataLog';
import { SheriffApiCallLog } from '../models/SheriffApiCallLog'; // Import the new model
import { Result, IResult } from '../models/Result'; // Import the Result model
import { OpenAIService } from './OpenAIService';
import { CompanyAnalysisService } from './companyAnalysisService'; // Import company analysis service
import { log } from 'console';
import ELKService from './elkService'; // Import ELK service for logging

import dotenv from 'dotenv';

dotenv.config();

const SHERIFF_API_URL = process.env.SHERIFF_API_URL || 'https://prod.api.thesheriff.cl/api/v1';

interface RutLookupRequest {
  rut: string;
  isMonitoring: boolean;
}

// This interface is for the in-memory object, not the DB model
interface IInMemorySheriffDataLog extends Partial<ISheriffDataLog> {
  [key: string]: any;
}


export class SheriffService {
  private static instance: SheriffService;
  private readonly axiosInstance;
  private readonly companyAnalysisService: CompanyAnalysisService;

  private constructor() {
    this.companyAnalysisService = new CompanyAnalysisService();
    this.axiosInstance = axios.create({
      baseURL: SHERIFF_API_URL,
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

  public static getInstance(): SheriffService {
    if (!SheriffService.instance) {
      SheriffService.instance = new SheriffService();
    }
    return SheriffService.instance;
  }

  async queryRut(data: RutLookupRequest, tenantId: string, refresh: boolean): Promise<Partial<ISheriffDataLog>> {
    console.log(60, "calling sheriffService.queryRut", tenantId, refresh);
    const { rut, isMonitoring } = data;
    // Remove dots, then strip leading zeros from the numeric part while preserving possible dash and verifier
    const rutNoDots = rut.replace(/\./g, '');
    // Match numeric part and optional verifier with dash (e.g., 12345678-9 or 12345678-K)
    const match = rutNoDots.match(/^(\d+)(-[A-Za-z0-9])?$/);
    let sanitizedRut = rutNoDots;
    if (match) {
      const numericPart = match[1].replace(/^0+/, '') || '0';
      const suffix = match[2] || '';
      sanitizedRut = suffix ? `${numericPart}${suffix}` : numericPart;
    }
    console.log(`[DEBUG] Original RUT: ${rut}, Sanitized RUT: ${sanitizedRut}`);

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
        if (payload && payload.isMonitoring) {
          payload.isMonitoring = false;
          console.warn(132, payload);
        }
        console.log(`Attempting ${callName} call to ${SHERIFF_API_URL}${url}`);
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
          url: `${SHERIFF_API_URL}${url}`,
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

        console.error(`Error in ${callName} call to ${url}:`, err);

        // Log to Elasticsearch
        await ELKService.logSheriffApiCall({
          callName,
          method: method.toUpperCase(),
          url: `${SHERIFF_API_URL}${url}`,
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

    const loadRutData = await makeApiCall('loadRutData', 'post', '/helper/loadRut', sanitizedData);
    //console.log(209, loadRutData);
    console.warn(222, "[DEBUG] loadRutData", loadRutData);

    if (loadRutData == null) {
      console.error('loadRutData failed is null');
      await logEntry.save();
      return logEntry.toObject();
    }
    //must wait at least 30 seconds before starting the next
    await new Promise(resolve => setTimeout(resolve, parseInt(process.env.SHERIFF_API_DELAY || '30000')));
    console.log(`[DEBUG] About to call summaryData with RUT: ${sanitizedRut}`);
    const summaryData = await makeApiCall('summaryData', 'get', `/helper/${sanitizedRut}/summary?complete=true`); //added complete true
    console.log(`[DEBUG] After summaryData call, sanitizedRut is still: ${sanitizedRut}`);

    if (summaryData == null) {
      console.error('summaryData failed is null');
      await logEntry.save();
      return logEntry.toObject();
    }

    let societaryMeshExternal: any[] | null = null;

    if (summaryData.data.societaryMeshExternal && summaryData.data.societaryMeshExternal.length > 0) {
      societaryMeshExternal = summaryData.data.societaryMeshExternal[0];
    } else {
      if (summaryData.data.empresaEnUnDiaCases && summaryData.data.empresaEnUnDiaCases.length > 0) {
        societaryMeshExternal = summaryData.data.empresaEnUnDiaCases[0].socios;
      }
      console.log("sheriffService extract societaryMeshExternal from empresaEnUnDiaCases", societaryMeshExternal);
    }
    //normalize socios
    // Ensure societaryMeshExternal is an array before mapping
    if (Array.isArray(societaryMeshExternal)) {
      try {
        let socios = societaryMeshExternal.map((socio: any) => ({
          name: socio?.name ?? socio?.socio ?? '',
          rut: socio?.rut ?? '',
        }));
        const sociosLimit = Number(process.env.SOCIOS_LIMIT || 10);
        if (socios.length > sociosLimit) {
          socios = socios.slice(0, sociosLimit);
        }
        societaryMeshExternal = socios;
        console.log(252, "sheriffService normalized societaryMeshExternal", societaryMeshExternal);
      } catch (err) {
        console.warn('normalize socios failed', err);
        societaryMeshExternal = [];
      }
    } else {
      console.warn('societaryMeshExternal is not an array, setting to empty array');
      societaryMeshExternal = [];
    }

    //AV  summaryData.data.societaryMeshExternal = societaryMeshExternal;
    inMemoryLog.empresaEnUnDiaSocios = societaryMeshExternal;
    if (!summaryData.data.compliance) {
      console.warn("no compliance data for:", summaryData.data.rut);
      summaryData.data.compliance = {
        "id": summaryData.corporationId,
        "scrappedRutId": null,
        "userId": null,
        "corporationId": summaryData.data.corporationId,
        "name": summaryData.data.sii.razonSocial,
        "secondName": null,
        "surname": null,
        "secondSurname": null,
        "personType": "juridical",
        "risk": "free",
        "summary": [
          {
            "countResults": null,
            "textCountResults": null,
            "table": "PEP Chile",
            "risk": "free",
            "useColor": true
          },
          {
            "countResults": null,
            "textCountResults": null,
            "table": "Funcionarios Públicos",
            "risk": "free",
            "useColor": true
          },
          {
            "countResults": null,
            "textCountResults": null,
            "table": "Familiares PEP",
            "risk": "free",
            "useColor": true
          },
          {
            "countResults": null,
            "textCountResults": null,
            "table": "Listas Internacionales",
            "risk": "free",
            "useColor": true
          },
          {
            "countResults": null,
            "textCountResults": null,
            "table": "Penal",
            "risk": "free",
            "useColor": true
          },
          {
            "countResults": 1,
            "textCountResults": 1,
            "table": "Socios y Sociedades",
            "risk": null,
            "useColor": null
          },
          {
            "countResults": null,
            "textCountResults": null,
            "table": "Noticias",
            "risk": null,
            "useColor": null
          }
        ],
        "selectedRowsSocietaryMesh": [
          ""
        ],
        "selectedRowsPepChile": [],
        "selectedRowsPublicOfficial": [],
        "selectedRowsPepChileFamily": [],
        "selectedRowsBlacklist": [],
        "selectedRowsPenal": [],
        "selectedRowsNews": [],
        "lastDataUpdate": null,
        "createdAt": null,
        "updatedAt": null
      }
      if (!summaryData.data.isJuridicalPerson) {
        summaryData.data.compliance.personType = "natural";
      } else {
        summaryData.data.compliance.personType = "juridical";
      }
    }
    console.warn(355,"--------------------> ", logEntry);
    console.log(`[DEBUG] About to call civilCasesData with RUT: ${sanitizedRut}`);
    const civilCasesData = await makeApiCall('civilCasesData', 'get', `/helper/${sanitizedRut}/getCivilCases`);
    //console.log(145,'civilCasesData', civilCasesData);
    if (civilCasesData.data && Array.isArray(civilCasesData.data)) {
      const casesLimit = Number(process.env.CASES_LIMIT || 10);
      inMemoryLog.civilCasesData = civilCasesData.data.slice(0, casesLimit);
      console.log(`[SheriffService] Limiting civilCasesData to 10 items from ${civilCasesData.data.length} total cases`);
    }
    // Get laboralCasesData and limit to 10 items
    console.log(`[DEBUG] About to call laboralCasesData with RUT: ${sanitizedRut}`);
    const laboralCases = await makeApiCall('laboralCasesData', 'get', `/helper/${sanitizedRut}/getLaboralCases`);
    // console.log(147,'laboralCases', laboralCases);
    if (laboralCases.data && Array.isArray(laboralCases.data)) {
      const casesLimit = Number(process.env.CASES_LIMIT || 10);
      inMemoryLog.laboralCasesData = laboralCases.data.slice(0, casesLimit);
      console.log(`[SheriffService] Limiting laboralCasesData to 10 items from ${laboralCases.data.length} total cases`);
    }
    const cobranzaCasesData = await makeApiCall('cobranzaCasesData', 'get', `/helper/${sanitizedRut}/getCobranzaCases`);
    //console.log(149, 'cobranzaCasesData', cobranzaCasesData);
    if (cobranzaCasesData.data && Array.isArray(cobranzaCasesData.data)) {
      const casesLimit = Number(process.env.CASES_LIMIT || 10);
      inMemoryLog.cobranzaCasesData = cobranzaCasesData.data.slice(0, casesLimit);
      console.log(`[SheriffService] Limiting cobranzaCasesData to 10 items from ${cobranzaCasesData.data.length} total cases`);
    } else {
      console.warn(`[SheriffService] No cobranzaCasesData for RUT: ${sanitizedRut}`);
    }
    const moraPrevisionalCasesData = await makeApiCall('moraPrevisionalCasesData', 'get', `/helper/${sanitizedRut}/getMoraPrevisionalCases`);
    //console.log(151, 'moraPrevisionalCasesData', moraPrevisionalCasesData);
    if (moraPrevisionalCasesData.data && Array.isArray(moraPrevisionalCasesData.data)) {
      const casesLimit = Number(process.env.CASES_LIMIT || 10);
      inMemoryLog.moraPrevisionalCasesData = moraPrevisionalCasesData.data.slice(0, casesLimit);
      console.log(`[SheriffService] Limiting moraPrevisionalCasesData to 10 items from ${moraPrevisionalCasesData.data.length} total cases`);
    } else {
      console.warn(`[SheriffService] No moraPrevisionalCasesData for RUT: ${sanitizedRut}`);
    }

    const multaLaboralCasesData = await makeApiCall('multaLaboralCasesData', 'get', `/helper/${sanitizedRut}/getMultaLaboralCases`);
    // console.log(153, 'multaLaboralCasesData', multaLaboralCasesData);
    if (multaLaboralCasesData.data && Array.isArray(multaLaboralCasesData.data)) {
      const casesLimit = Number(process.env.CASES_LIMIT || 10);
      inMemoryLog.multaLaboralCasesData = multaLaboralCasesData.data.slice(0, casesLimit);
      console.log(`[SheriffService] Limiting multaLaboralCasesData to 10 items from ${multaLaboralCasesData.data.length} total cases`);
    } else {
      console.warn(`[SheriffService] No multaLaboralCasesData for RUT: ${sanitizedRut}`);
    }

    const mallaSocietariaData = societaryMeshExternal;

    const officialDiaryData = await makeApiCall('officialDiaryData', 'get', `/helper/${sanitizedRut}/getOfficialDiary`);
    // console.log(157, 'officialDiaryData', officialDiaryData);
    if (officialDiaryData.data && Array.isArray(officialDiaryData.data)) {
      const casesLimit = Number(process.env.CASES_LIMIT || 10);
      inMemoryLog.officialDiaryData = officialDiaryData.data.slice(0, casesLimit);
      console.log(`[SheriffService] Limiting officialDiaryData to 10 items from ${officialDiaryData.data.length} total cases`);
    } else {
      console.warn(`[SheriffService] No officialDiaryData for RUT: ${sanitizedRut}`);
    }
    const commercialBulletinCasesData = await makeApiCall('commercialBulletinCasesData', 'get', `/helper/${sanitizedRut}/getCommercialBulletinCases`);
    // console.log(159, 'commercialBulletinCasesData', commercialBulletinCasesData);
    if (commercialBulletinCasesData.data && Array.isArray(commercialBulletinCasesData.data)) {
      const casesLimit = Number(process.env.CASES_LIMIT || 10);
      inMemoryLog.commercialBulletinCasesData = commercialBulletinCasesData.data.slice(0, casesLimit);
      console.log(`[SheriffService] Limiting commercialBulletinCasesData to 10 items from ${commercialBulletinCasesData.data.length} total cases`);
    } else {
      console.warn(`[SheriffService] No commercialBulletinCasesData for RUT: ${sanitizedRut}`);
    }

    const creditScoringData = await makeApiCall('creditScoringData', 'get', `/notification/creditScoring/${sanitizedRut}/getByRut`);
    // console.log(161, 'creditScoringData', creditScoringData);
    if (!creditScoringData) {
      console.warn(`[SheriffService] No creditScoringData for RUT: ${sanitizedRut}`);
    } else {
      if (creditScoringData.data && creditScoringData.data.length > 0) {
        const scoringLimit = Number(process.env.CREDIT_SCORING_LIMIT || 10);
        inMemoryLog.creditScoringData = creditScoringData.data.slice(0, scoringLimit);
        console.log(`[SheriffService] Limiting creditScoringData to 10 items from ${creditScoringData.data.length} total cases`);
      } else {
        console.warn(`[SheriffService] No creditScoringData for RUT: ${sanitizedRut}`);
      }
    }
    try {
      console.log(`[SheriffService] Attempting to generate AI summary for RUT: ${data.rut}`);
      //o const riskLevel = this.calculateRiskLevelFromSheriff(inMemoryLog);
      const aiSummary = "N/D"; // Placeholder
      logEntry.aiSummaryMarkdown = aiSummary;
      inMemoryLog.aiSummaryMarkdown = aiSummary;
      console.log(`Successfully generated AI summary for RUT: ${data.rut}`);
    } catch (aiError) {
      console.error(`Error generating AI summary for RUT ${data.rut}:`, aiError);
      const errorMessage = aiError instanceof Error ? aiError.message : 'Unknown AI summary generation error';
      logEntry.apiCallErrors.push({
        step: 'aiSummaryGeneration',
        message: errorMessage,
      });
    }
    // Save the final state of the main log entry
    await logEntry.save();
    console.log(`[SheriffService] Final log for RUT ${data.rut} saved with ID: ${logEntry._id}`);
    // Trigger company analysis after sheriff data is saved
    try {
      await this.companyAnalysisService.analyzeCompanyData(
        logEntry,
        tenantId
      );
      console.log(`[SheriffService] Company analysis triggered for RUT ${data.rut}`);
    } catch (analysisError) {
      console.error(`[SheriffService] Failed to trigger company analysis for RUT ${data.rut}:`, analysisError);
      // Don't throw error to avoid breaking the main sheriff flow
    }
    //console.warn (444,"queryRut end",inMemoryLog);
    return inMemoryLog;
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
