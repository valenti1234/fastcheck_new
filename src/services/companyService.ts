import axios from 'axios';
import { apiClient } from './api';
import { SheriffDataLogResponse } from '../types/sheriff';
import logger from '../utils/logger';

export const lookupRut = async (
  rut: string,
  isMonitoring = false,
  options?: { isPep?: boolean; isRefreshing?: boolean }
): Promise<SheriffDataLogResponse> => {
  try {
    const cleanRut = rut.replace(/\./g, '').toUpperCase();
    logger.log('>>>>> lookupRut - Request Data:', { rut: cleanRut, isMonitoring });

    const response = await apiClient.post<SheriffDataLogResponse>('/rut/lookup',
      { rut: cleanRut, isMonitoring, isRefreshing: options?.isRefreshing ?? false, isPep: options?.isPep ?? false },
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.data) {
      throw new Error('No se recibieron datos del servidor');
    }
    logger.log('lookupRut - Response Data:', response.data);
    return response.data;
  } catch (error) {
    logger.error('Error in lookupRut:', error);
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        throw new Error('No autorizado. Por favor, inicia sesión nuevamente');
      }
      if (error.response?.status === 404) {
        throw new Error('No se encontró información para el RUT ingresado');
      }
      if (error.response?.status === 400) {
        throw new Error('El formato del RUT no es válido');
      }
      if (error.response?.status === 500) {
        throw new Error('Error interno del servidor');
      }
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
    }
    throw new Error('Error al obtener información de la empresa');
  }
};

export const getCompanyByRut = async (rut: string): Promise<SheriffDataLogResponse> => {
  return await lookupRut(rut, false);
};

export interface SocioEvaluation {
  rut: string;
  isEvaluated: boolean;
  evaluationDate: string | null;
  evaluationResult: {
    hasPepChile: boolean;
    hasFamiliaresPep: boolean;
  } | null;
}

export interface CheckSociosEvaluationsResponse {
  success: boolean;
  evaluations: SocioEvaluation[];
}

export const checkSociosEvaluations = async (ruts: string[]): Promise<CheckSociosEvaluationsResponse> => {
  try {
    logger.log('checkSociosEvaluations - Request Data:', { ruts });

    const response = await apiClient.post<CheckSociosEvaluationsResponse>('/rut/check-socios-evaluations',
      { ruts },
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.data) {
      throw new Error('No se recibieron datos del servidor');
    }
    logger.log('checkSociosEvaluations - Response Data:', response.data);
    return response.data;
  } catch (error) {
    logger.error('Error in checkSociosEvaluations:', error);
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        throw new Error('No autorizado. Por favor, inicia sesión nuevamente');
      }
      if (error.response?.status === 400) {
        throw new Error('Datos de entrada inválidos');
      }
      if (error.response?.status === 500) {
        throw new Error('Error interno del servidor');
      }
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
    }
    throw new Error('Error al verificar el estado de evaluación de los socios');
  }
};

export const resetSociosEvaluations = async (ruts: string[], confirm: boolean): Promise<{ success: boolean; deletedCount: number }> => {
  try {
    logger.log('resetSociosEvaluations - Request Data:', { ruts, confirm });
    const response = await apiClient.post('/rut/reset-socios-evaluations', { ruts, confirm }, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
    });
    if (!response.data) {
      throw new Error('No se recibieron datos del servidor');
    }
    logger.log('resetSociosEvaluations - Response Data:', response.data);
    return response.data;
  } catch (error) {
    logger.error('Error in resetSociosEvaluations:', error);
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) throw new Error('No autorizado. Por favor, inicia sesión nuevamente');
      if (error.response?.status === 400) throw new Error('Datos de entrada inválidos');
      if (error.response?.status === 500) throw new Error('Error interno del servidor');
      if (error.response?.data?.message) throw new Error(error.response.data.message);
    }
    throw new Error('Error al resetear las evaluaciones de socios');
  }
};
