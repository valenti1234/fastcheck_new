import { apiClient as api } from './api';

export const getEvaluationParameters = async () => {
  const response = await api.get('/evaluation-parameters');
  return response.data;
};

export const updateEvaluationParameters = async (parameters: any) => {
  const response = await api.post('/evaluation-parameters', parameters);
  return response.data;
};