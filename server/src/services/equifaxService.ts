import axios, { AxiosError, AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';
import { promises as fs } from 'fs';
import * as path from 'path';
import ELKService from './elkService';
import { EquifaxResponse as EquifaxResponseModel } from '../models/EquifaxResponse';

dotenv.config();

// Environment variables for Equifax configuration
const EQUIFAX_ENVIRONMENT = process.env.EQUIFAX_ENVIRONMENT || 'uat'; // 'uat' or 'prod'

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

    console.warn(`Equifax API Base URL: ${this.baseUrl}`);

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
        console.log(`Equifax API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('Equifax API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.axiosInstance.interceptors.response.use(
      (response) => {
        console.log(`Equifax API Response: ${response.status} ${response.statusText}`);
        return response;
      },
      (error) => {
        console.error('Equifax API Response Error:', error.response?.status, error.message);
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

    try {
      console.log(`Executing Equifax transaction for RUT: ${rut}`);
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
        console.log(`Calling local test server: ${url} with payload:`, rutOnlyPayload);
        return await this.axiosInstance.post(url, rutOnlyPayload, { headers: postHeader });
      };

      // First attempt
      let response = await makeCall(usedRequestType);
      //console.warn(`Equifax response data:`, response.data);

      // If Equifax returns a logical bad request in the body, retry with opposite type
      const responseData = response?.data;
      const badReq = responseData?.data?.type === 'BadRequestException' ? responseData?.data : null;
      const badMsg = badReq?.message?.toLowerCase?.() || '';
      if (badReq && typeof badMsg === 'string') {
        if (badMsg.includes('enterprise') || badMsg.includes('empresarial')) {
          if (usedRequestType !== 'empresarial') {
            console.warn('Equifax indicates enterprise RUT. Retrying with empresarial requestType.');
            usedRequestType = 'empresarial';
            response = await makeCall(usedRequestType);
          }
        } else if (badMsg.includes('personal') || badMsg.includes('persona')) {
          if (usedRequestType !== 'personal') {
            console.warn('Equifax indicates personal RUT. Retrying with personal requestType.');
            usedRequestType = 'personal';
            response = await makeCall(usedRequestType);
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

      console.log(`Equifax transaction completed successfully for RUT: ${rut} - Time: ${responseTime}ms`);

      let normalizedResponse = null;
      if (responseData.data) {
        if (responseData.data.commercialData) {
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
        console.warn(`Unrecognized Equifax response format for RUT ${rut}:`, response.data);
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
        await this.saveResponseToFile(rut, response.data);
      } catch (saveError) {
        console.warn(`Failed to save Equifax response to file for RUT ${rut}:`, saveError);
      }
      // Save response to MongoDB collection equifax-responses
      try {
        const cacheInfo = response.data?._cache_info;
        await EquifaxResponseModel.create({
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
      } catch (dbError) {
        console.warn(`Failed to save Equifax response to MongoDB for RUT ${rut}:`, dbError);
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

      console.error(`Error in Equifax transaction for RUT ${rut}:`, err.message);

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
      } catch (dbError) {
        console.warn(`Failed to save Equifax error to MongoDB for RUT ${rut}:`, dbError);
      }

      throw error;
    }
  }

  /**
   * Query Equifax for company/person information
   */
  public async queryRut(request: EquifaxRequest): Promise<EquifaxResponse> {
    const { rut, tenantId, personalData, productData } = request;

    try {



      // Build payload
      const payload = this.buildPayload(rut, personalData, productData);

//      console.log(369, payload);
      // Execute transaction (pass requestType from caller via personalData.requestType)
      const data = await this.executeTransaction(payload, rut, tenantId, personalData?.requestType);

      return {
        success: true,
        data,
        statusCode: 200
      };

    } catch (error) {
      const err = error as AxiosError;
      const statusCode = err.response?.status || 500;
      const errorMessage = err.message || 'Unknown error occurred';

      console.error(` ! Equifax service error for RUT ${rut}:`, errorMessage);

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

      // Ensure directory exists
      await fs.mkdir(path.dirname(filepath), { recursive: true });

      // Save response
      await fs.writeFile(filepath, JSON.stringify(data, null, 2));

      console.log(`Equifax response saved to: ${filepath}`);
      return filepath;

    } catch (error) {
      console.error('Error saving Equifax response to file:', error);
      throw error;
    }
  }

  /**
   * Get service health status
   */
  public async getHealthStatus(): Promise<{ status: string; environment: string; baseUrl: string }> {
    return {
      status: 'active',
      environment: EQUIFAX_ENVIRONMENT,
      baseUrl: this.baseUrl
    };
  }
}

export default EquifaxService;