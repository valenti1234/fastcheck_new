import axios, { AxiosError, AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';
import { promises as fs } from 'fs';
import * as path from 'path';
import ELKService from './elkService';
import { EquifaxResponse as EquifaxResponseModel } from '../models/EquifaxResponse';

dotenv.config();

// Environment variables for Equifax configuration
const EQUIFAX_ENVIRONMENT = process.env.EQUIFAX_ENVIRONMENT || 'uat'; // 'uat' or 'prod'
const EQUIFAX_LOG_TAG = '[EXT] [EQUIFAX]';

// Personal data from environment variables
const EQUIFAX_PERSONAL_DATA = {
  firstName: process.env.EQUIFAX_FIRST_NAME || '',
  middleName: process.env.EQUIFAX_MIDDLE_NAME || '',
  lastName: process.env.EQUIFAX_LAST_NAME || '',
  motherLastName: process.env.EQUIFAX_MOTHER_LAST_NAME || '',
  nationalId: process.env.EQUIFAX_NATIONAL_ID || '',
  chileanSerialNumber: process.env.EQUIFAX_CHILEAN_SERIAL_NUMBER || '',
  requestType: process.env.EQUIFAX_REQUEST_TYPE || 'RUT'
};

// Product data configuration
const EQUIFAX_PRODUCT_DATA = {
  billTo: process.env.BILL_TO || '',
  shipTo: process.env.SHIP_TO || '',
  productName: process.env.PRODUCT_NAME || '',
  productOrch: process.env.PRODUCT_ORCH || '',
  configuration: process.env.CONFIGURATION || 'Config',
  customer: process.env.CUSTOMER || '',
  model: process.env.MODEL || ''
};



interface EquifaxPersonalData {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  motherLastName?: string;
  nationalId?: string;
  chileanSerialNumber?: string;
  requestType?: string;
  chileanRut?: string;
}

interface EquifaxProductData {
  billTo: string;
  shipTo: string;
  productName: string;
  productOrch: string;
  configuration: string;
  customer: string;
  model: string;
}

interface EquifaxPayload {
  applicants: {
    primaryConsumer: {
      personalInformation: EquifaxPersonalData;
    };
  };
  productData: EquifaxProductData;
}

interface EquifaxRequest {
  rut: string;
  tenantId: string;
  personalData?: EquifaxPersonalData;
  productData?: EquifaxProductData;
  // requestType can be supplied via personalData.requestType; kept optional here if needed later
}

interface EquifaxResponse {
  success: boolean;
  data?: any;
  error?: string;
  statusCode?: number;
  responseTime?: number;
}

export class EquifaxService {
  private static instance: EquifaxService;
  private readonly axiosInstance: AxiosInstance;
  private readonly baseUrl: string;

  private constructor() {
//    this.baseUrl = 'http://localhost:8021';
    this.baseUrl = 'http://localhost:8022';

    console.warn(`${EQUIFAX_LOG_TAG} API Base URL: ${this.baseUrl} | env=${EQUIFAX_ENVIRONMENT}`);

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Request interceptor for logging
    this.axiosInstance.interceptors.request.use(
      (config) => {
        console.log(`${EQUIFAX_LOG_TAG} [HTTP_REQ] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error(`${EQUIFAX_LOG_TAG} [HTTP_REQ_ERR]`, error?.message || error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.axiosInstance.interceptors.response.use(
      (response) => {
        const len = typeof response?.data === 'string' ? response.data.length
          : JSON.stringify(response.data ?? '').length;
        console.log(`${EQUIFAX_LOG_TAG} [HTTP_RES] status=${response.status} ${response.statusText || ''} content_len=${len} url=${response.config?.url}`);
        return response;
      },
      (error) => {
        const status = error?.response?.status ?? 'no_status';
        console.error(`${EQUIFAX_LOG_TAG} [HTTP_RES_ERR] status=${status} msg=${error?.message || 'unknown'} url=${error?.config?.url || '<unknown>'}`);
        return Promise.reject(error);
      }
    );
  }

  public static getInstance(): EquifaxService {
    if (!EquifaxService.instance) {
      EquifaxService.instance = new EquifaxService();
    }
    return EquifaxService.instance;
  }



  /**
   * Build the payload for Equifax API request
   */
  private buildPayload(rut: string, personalData?: EquifaxPersonalData, productData?: EquifaxProductData): EquifaxPayload {
    // Simplified payload structure matching the required format
    const payload: EquifaxPayload = {
      applicants: {
        primaryConsumer: {
          personalInformation: {
            chileanRut: rut
          }
        }
      },
      productData: {
        billTo: EQUIFAX_PRODUCT_DATA.billTo,
        shipTo: EQUIFAX_PRODUCT_DATA.shipTo,
        productName: EQUIFAX_PRODUCT_DATA.productName,
        productOrch: EQUIFAX_PRODUCT_DATA.productOrch,
        configuration: EQUIFAX_PRODUCT_DATA.configuration,
        customer: EQUIFAX_PRODUCT_DATA.customer,
        model: EQUIFAX_PRODUCT_DATA.model
      }
    };

    console.debug?.(`${EQUIFAX_LOG_TAG} buildPayload | RUT=${rut} productName=${payload.productData.productName} productOrch=${payload.productData.productOrch}`);
    return payload;
  }

  /**
   * Execute transaction with Equifax API
   */
  private async executeTransaction(payload: EquifaxPayload, rut: string, tenantId: string, requestType?: string): Promise<any> {
    const startTime = Date.now();
    let statusCode: number | undefined;
    let success = false;
    let errorMessage: string | undefined;

    // Make environment and requestType available across try/catch
    const environment = EQUIFAX_ENVIRONMENT || 'uat';
    let usedRequestType = (requestType || 'personal').toLowerCase();

    console.log(`${EQUIFAX_LOG_TAG} executeTransaction START | RUT=${rut} tenant=${tenantId} env=${environment} requestType_attempt=${usedRequestType}`);

    try {
      console.log(`${EQUIFAX_LOG_TAG} Executing Equifax transaction for RUT: ${rut}`);
      // Use local test server endpoint
//      const url = `http://localhost:8021/transaction/${environment}/rut-only`;
      const url = `http://localhost:8022/transaction/${environment}/rut-only`;

      const postHeader = {
        'Content-Type': 'application/json'
      };

      const makeCall = async (reqType: string) => {
        const rutOnlyPayload = {
          chileanRut: rut,
          requestType: reqType
        };
        console.log(`${EQUIFAX_LOG_TAG} makeCall → POST ${url} | chileanRut=${rut} requestType=${reqType}`);
        console.log(`${EQUIFAX_LOG_TAG} makeCall payload:`, JSON.stringify(rutOnlyPayload));
        const t0 = Date.now();
        const r = await this.axiosInstance.post(url, rutOnlyPayload, { headers: postHeader });
        console.log(`${EQUIFAX_LOG_TAG} makeCall DONE | status=${r.status} rt_ms=${Date.now() - t0}`);
        return r;
      };

      // First attempt
      let response = await makeCall(usedRequestType);
      console.log(`${EQUIFAX_LOG_TAG} Attempt 1 (${usedRequestType}) HTTP OK status=${response.status} | keys_top=${Object.keys(response.data || {}).slice(0, 10)}`);

      // If Equifax returns a logical bad request in the body, retry with opposite type
      const responseData = response?.data;
      const badReq = responseData?.data?.type === 'BadRequestException' ? responseData?.data : null;
      const badMsg = badReq?.message?.toLowerCase?.() || '';
      if (badReq && typeof badMsg === 'string') {
        if (badMsg.includes('enterprise') || badMsg.includes('empresarial')) {
          if (usedRequestType !== 'empresarial') {
            console.warn(`${EQUIFAX_LOG_TAG} BadRequest detected: Equifax says enterprise RUT. Retrying automatically with requestType=empresarial. previous_was=${usedRequestType}`);
            usedRequestType = 'empresarial';
            response = await makeCall(usedRequestType);
            console.log(`${EQUIFAX_LOG_TAG} Retry empresarial HTTP OK status=${response.status}`);
          }
        } else if (badMsg.includes('personal') || badMsg.includes('persona')) {
          if (usedRequestType !== 'personal') {
            console.warn(`${EQUIFAX_LOG_TAG} BadRequest detected: Equifax says personal RUT. Retrying automatically with requestType=personal. previous_was=${usedRequestType}`);
            usedRequestType = 'personal';
            response = await makeCall(usedRequestType);
            console.log(`${EQUIFAX_LOG_TAG} Retry personal HTTP OK status=${response.status}`);
          }
        }
      }

      statusCode = response.status;
      success = true;
      const responseTime = Date.now() - startTime;

      // Log to Elasticsearch
      await ELKService.logSheriffApiCall({
        callName: 'equifax_transaction',
        method: 'POST',
        url: `${this.baseUrl}/api/transaction`,
        statusCode,
        responseTime,
        rut,
        logId: `equifax_${rut}_${Date.now()}`,
        tenantId,
        success: true,
        requestPayload: payload,
        responseData: response.data
      });

      console.log(`${EQUIFAX_LOG_TAG} Transaction OK | RUT=${rut} final_requestType=${usedRequestType} HTTP=${statusCode} total_rt_ms=${responseTime}`);

      let normalizedResponse = null;
      if (responseData.data) {
        if (responseData.data.commercialData) {
          console.log(`${EQUIFAX_LOG_TAG} Response format: EMPRESARIAL (data.commercialData present) for RUT=${rut}`);
 //         console.warn(244,"equifaxService company >>>>>>>>>>>>>>>>>>>>>>",responseData.data.commercialData.credit.debtsSummary);
          //normalize response
          normalizedResponse = {
            socios: responseData.data.commercialData.guarantees.accreditations.commercialPartnerPartnership.commercialPartners.commercialPartnerEmpresarial || [],
            // Deuda Previsional Publicada Persona Jurídica
            deudaPrevisionalPublicadaPersonaJuridica: responseData.data.commercialData.credit.debtsSummary.summaryBolab || null,
            // Deuda Previsional Publicada Persona Natural
            deudaPrevisionalPublicadaPersonaNatural: null,
            // Protestos y Morosidades Persona Jurídica
            protestosMorosidadesPersonaJuridica:responseData.data.commercialData.credit.debtsSummary.protestSummary.totalAmountProtests || 0,
            // Protestos y Morosidades Persona Natural
            protestosMorosidadesPersonaNatural: 0,
            bolabTypePersonaJuridica: responseData.data.commercialData.credit.debtsSummary.bolab?.commercialBolab || [],
            allData: responseData.data
          };
          normalizedResponse.protestosMorosidadesPersonaJuridica = responseData.data.commercialData.credit.debtsSummary.unpaidTotalAmount || 0;
        }
      } else if (responseData.platinum360) { // persona RUT
        console.log(`${EQUIFAX_LOG_TAG} Response format: PERSONA (platinum360 present) for RUT=${rut}`);
       // console.warn(244,"equifaxService persona >>>>>>>>>>>>>>>>>>>>>>",responseData.platinum360.getInformePlatinum360Response.response.Credit.DebtsSummary);
        normalizedResponse = {
          socios: [],
          deudaPrevisionalPublicadaPersonaJuridica: null,
          deudaPrevisionalPublicadaPersonaNatural: responseData.platinum360.getInformePlatinum360Response.response.Credit.DebtsSummary.SumaryBOLAB || null,
          protestosMorosidadesPersonaJuridica: 0,
          protestosMorosidadesPersonaNatural: responseData.platinum360.getInformePlatinum360Response.response.Credit.DebtsSummary.ProtestSummary.TotalAmountProtests || 0,
          protestosMorosidadesPersonaNaturalList: responseData.platinum360.getInformePlatinum360Response.response.Credit.DebtsSummary.BED?.BEDType || [],
          bolabTypePersonaNatural: responseData.platinum360.getInformePlatinum360Response.response.Credit.DebtsSummary.BOLAB?.BOLABType || [],
          allData: responseData
        };
     //   console.warn(270,`Equifax response data for persona RUT ${rut}:`, normalizedResponse.bolabTypePersonaNatural  );
      } else { //unrecognized response format
        console.warn(`${EQUIFAX_LOG_TAG} ⚠️ UNRECOGNIZED response format (no data.commercialData, no platinum360) RUT=${rut}. top_keys=${Object.keys(responseData || {}).slice(0, 12)}`);
        normalizedResponse = {
          socios: [],
          deudaPrevisionalPublicadaPersonaJuridica: null,
          deudaPrevisionalPublicadaPersonaNatural: null,
          protestosMorosidadesPersonaJuridica: 0,
          protestosMorosidadesPersonaNatural: 0,
          allData: responseData.data
        };
      }
     // console.warn(`Normalized Equifax response for RUT ${rut}:`, normalizedResponse);
      // Save response to file for debugging/logging
      try {
        const filepath = await this.saveResponseToFile(rut, response.data);
        console.log(`${EQUIFAX_LOG_TAG} Response JSON saved | file=${filepath}`);
      } catch (saveError) {
        console.warn(`${EQUIFAX_LOG_TAG} ⚠️ Failed to save Equifax response to file for RUT ${rut}:`, (saveError as Error)?.message || saveError);
      }
      // Save response to MongoDB collection equifax-responses
      try {
        const cacheInfo = response.data?._cache_info;
        const dbDoc = await EquifaxResponseModel.create({
          tenantId,
          rut,
          environment,
          requestType: usedRequestType,
          endpoint: `/transaction/${environment}/rut-only`,
          success: true,
          statusCode,
          responseTime,
          // Persist the actual RUT-only payload used in the call
          requestPayload: { chileanRut: rut, requestType: usedRequestType },
          data: response.data,
          normalizedData: normalizedResponse,
          cacheInfo
        });
        console.log(`${EQUIFAX_LOG_TAG} Response saved to MongoDB equifax-responses | _id=${(dbDoc as any)?._id ?? 'ok'} RUT=${rut} cached=${cacheInfo?.cached ?? false}`);
      } catch (dbError) {
        console.warn(`${EQUIFAX_LOG_TAG} ⚠️ Failed to save Equifax response to MongoDB for RUT ${rut}:`, (dbError as Error)?.message || dbError);
      }

      return normalizedResponse;

    } catch (error) {
      const err = error as AxiosError;
      statusCode = err.response?.status;
      success = false;
      errorMessage = err.message;
      const responseTime = Date.now() - startTime;

      // Log to Elasticsearch
      await ELKService.logSheriffApiCall({
        callName: 'equifax_transaction',
        method: 'POST',
        url: `${this.baseUrl}/api/transaction`,
        statusCode,
        responseTime,
        rut,
        logId: `equifax_${rut}_${Date.now()}`,
        tenantId,
        success: false,
        errorMessage,
        requestPayload: payload,
        responseData: err.response?.data
      });

      console.error(`${EQUIFAX_LOG_TAG} ❌ Transaction FAIL for RUT ${rut} | status=${statusCode ?? 'no_http'} rt_ms=${responseTime} msg=${errorMessage}`);

      // Save error response to MongoDB collection equifax-responses
      try {
        await EquifaxResponseModel.create({
          tenantId,
          rut,
          environment,
          requestType: usedRequestType,
          endpoint: `/transaction/${environment}/rut-only`,
          success: false,
          statusCode,
          responseTime,
          errorMessage,
          // Persist the actual RUT-only payload used in the call
          requestPayload: { chileanRut: rut, requestType: usedRequestType },
          data: err.response?.data
        });
        console.log(`${EQUIFAX_LOG_TAG} Error result saved to MongoDB equifax-responses | RUT=${rut}`);
      } catch (dbError) {
        console.warn(`${EQUIFAX_LOG_TAG} ⚠️ Failed to save Equifax error to MongoDB for RUT ${rut}:`, (dbError as Error)?.message || dbError);
      }

      throw error;
    }
  }

  /**
   * Query Equifax for company/person information
   */
  public async queryRut(request: EquifaxRequest): Promise<EquifaxResponse> {
    const { rut, tenantId, personalData, productData } = request;

    console.log(`${EQUIFAX_LOG_TAG} queryRut ENTRY | RUT=${rut} tenant=${tenantId} hasCustomPersonalData=${!!personalData} hasCustomProductData=${!!productData}`);

    try {



      // Build payload
      const payload = this.buildPayload(rut, personalData, productData);

//      console.log(369, payload);
      // Execute transaction (pass requestType from caller via personalData.requestType)
      const data = await this.executeTransaction(payload, rut, tenantId, personalData?.requestType);

      console.log(`${EQUIFAX_LOG_TAG} queryRut EXIT (success) | RUT=${rut} hasNormalizedData=${!!data}`);
      return {
        success: true,
        data,
        statusCode: 200
      };

    } catch (error) {
      const err = error as AxiosError;
      const statusCode = err.response?.status || 500;
      const errorMessage = err.message || 'Unknown error occurred';

      console.error(`${EQUIFAX_LOG_TAG} ❌ queryRut EXIT (fail) | RUT=${rut} status=${statusCode} err=${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        statusCode
      };
    }
  }

  /**
   * Save Equifax response to file (similar to Python implementation)
   */
  public async saveResponseToFile(rut: string, data: any): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `equifax_${rut}_${timestamp}.json`;
      const filepath = path.join(process.cwd(), 'equifax_responses', filename);
      const dir = path.dirname(filepath);

      console.debug?.(`${EQUIFAX_LOG_TAG} saveResponseToFile start | dir=${dir} filename=${filename}`);

      // Ensure directory exists
      await fs.mkdir(dir, { recursive: true });

      // Save response
      const jsonStr = JSON.stringify(data, null, 2);
      await fs.writeFile(filepath, jsonStr);

      console.log(`${EQUIFAX_LOG_TAG} saveResponseToFile OK | file=${filepath} size_bytes=${jsonStr.length}`);
      return filepath;

    } catch (error) {
      console.error(`${EQUIFAX_LOG_TAG} ❌ saveResponseToFile FAIL for RUT ${rut}:`, (error as Error)?.message || error);
      throw error;
    }
  }

  /**
   * Get service health status
   */
  public async getHealthStatus(): Promise<{ status: string; environment: string; baseUrl: string }> {
    const info = {
      status: 'active',
      environment: EQUIFAX_ENVIRONMENT,
      baseUrl: this.baseUrl
    };
    console.log(`${EQUIFAX_LOG_TAG} getHealthStatus →`, JSON.stringify(info));
    return info;
  }
}

export default EquifaxService;