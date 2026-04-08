import { apiClient, validateChileanRut, formatChileanRut } from './api';

export interface EquifaxResponseDoc {
  _id?: string;
  tenantId: string;
  rut: string;
  environment: 'sandbox' | 'production' | string;
  requestType: string;
  endpoint: string;
  success: boolean;
  statusCode?: number;
  responseTime?: number;
  errorMessage?: string;
  requestPayload?: Record<string, any> | null;
  data?: Record<string, any> | null;
  normalizedData?: Record<string, any> | null;
  cacheInfo?: Record<string, any> | null;
  createdAt?: string;
}

export interface GetEquifaxResponsesParams {
  limit?: number;
  page?: number;
  startDate?: string; // ISO string
  endDate?: string;   // ISO string
}

export interface GetEquifaxResponsesResult {
  success: boolean;
  rut?: string;
  tenantId: string;
  count: number;
  total?: number;
  page?: number;
  limit?: number;
  data: EquifaxResponseDoc[];
  responseTime?: number;
  timestamp?: string;
}

export async function getEquifaxResponsesByRut(rut: string, params: GetEquifaxResponsesParams = {}): Promise<GetEquifaxResponsesResult> {
  if (!validateChileanRut(rut)) {
    throw new Error('El formato del RUT no es válido');
  }

  const formatted = formatChileanRut(rut).replace(/\./g, '');

  const response = await apiClient.get(`/equifax/responses/${formatted}`, {
    params: {
      limit: params.limit ?? 20,
      page: params.page ?? 1,
      startDate: params.startDate,
      endDate: params.endDate,
    },
  });

  return response.data as GetEquifaxResponsesResult;
}

export async function getAllEquifaxResponses(params: GetEquifaxResponsesParams = {}): Promise<GetEquifaxResponsesResult> {
  const response = await apiClient.get(`/equifax/responses`, {
    params: {
      limit: params.limit ?? 20,
      page: params.page ?? 1,
      startDate: params.startDate,
      endDate: params.endDate,
    },
  });

  return response.data as GetEquifaxResponsesResult;
}