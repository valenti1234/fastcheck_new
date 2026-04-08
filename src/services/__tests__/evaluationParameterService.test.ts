import axios from 'axios';
import { getEvaluationParameters, updateEvaluationParameters } from '../evaluationParameterService';
import { apiClient } from '../api';

// Mock the api module
jest.mock('../api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn()
  }
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('EvaluationParameterService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getEvaluationParameters', () => {
    it('should fetch evaluation parameters successfully', async () => {
      const mockParameters = [
        {
          id: '1',
          name: 'creditScoreThreshold',
          value: 650,
          description: 'Minimum credit score threshold'
        },
        {
          id: '2',
          name: 'riskLevelWeights',
          value: {
            financial: 0.4,
            legal: 0.3,
            compliance: 0.3
          },
          description: 'Risk level calculation weights'
        }
      ];

      mockedApiClient.get.mockResolvedValue({ data: mockParameters });

      const result = await getEvaluationParameters();

      expect(mockedApiClient.get).toHaveBeenCalledWith('/evaluation-parameters');
      expect(result).toEqual(mockParameters);
    });

    it('should handle API errors when fetching parameters', async () => {
      const errorMessage = 'Failed to fetch parameters';
      mockedApiClient.get.mockRejectedValue(new Error(errorMessage));

      await expect(getEvaluationParameters()).rejects.toThrow(errorMessage);
      expect(mockedApiClient.get).toHaveBeenCalledWith('/evaluation-parameters');
    });

    it('should handle network errors when fetching parameters', async () => {
      const networkError = new Error('Network Error');
      networkError.name = 'NetworkError';
      mockedApiClient.get.mockRejectedValue(networkError);

      await expect(getEvaluationParameters()).rejects.toThrow('Network Error');
    });

    it('should handle empty response when fetching parameters', async () => {
      mockedApiClient.get.mockResolvedValue({ data: [] });

      const result = await getEvaluationParameters();

      expect(result).toEqual([]);
      expect(mockedApiClient.get).toHaveBeenCalledWith('/evaluation-parameters');
    });
  });

  describe('updateEvaluationParameters', () => {
    it('should update evaluation parameters successfully', async () => {
      const parametersToUpdate = [
        {
          name: 'creditScoreThreshold',
          value: 700
        },
        {
          name: 'maxRiskLevel',
          value: 'high'
        }
      ];

      const mockResponse = {
        message: 'Parameters updated successfully',
        updatedCount: 2
      };

      mockedApiClient.post.mockResolvedValue({ data: mockResponse });

      const result = await updateEvaluationParameters(parametersToUpdate);

      expect(mockedApiClient.post).toHaveBeenCalledWith('/evaluation-parameters', parametersToUpdate);
      expect(result).toEqual(mockResponse);
    });

    it('should handle API errors when updating parameters', async () => {
      const parametersToUpdate = [{ name: 'test', value: 'value' }];
      const errorMessage = 'Failed to update parameters';
      mockedApiClient.post.mockRejectedValue(new Error(errorMessage));

      await expect(updateEvaluationParameters(parametersToUpdate)).rejects.toThrow(errorMessage);
      expect(mockedApiClient.post).toHaveBeenCalledWith('/evaluation-parameters', parametersToUpdate);
    });

    it('should handle validation errors when updating parameters', async () => {
      const invalidParameters = [{ name: '', value: null }];
      const validationError = new Error('Invalid parameter data');
      mockedApiClient.post.mockRejectedValue(validationError);

      await expect(updateEvaluationParameters(invalidParameters)).rejects.toThrow('Invalid parameter data');
    });

    it('should handle server errors when updating parameters', async () => {
      const parametersToUpdate = [{ name: 'test', value: 'value' }];
      const serverError = new Error('Internal Server Error');
      mockedApiClient.post.mockRejectedValue(serverError);

      await expect(updateEvaluationParameters(parametersToUpdate)).rejects.toThrow('Internal Server Error');
    });

    it('should update single parameter successfully', async () => {
      const singleParameter = {
        name: 'evaluationTimeout',
        value: 30000
      };

      const mockResponse = {
        message: 'Parameter updated successfully',
        parameter: singleParameter
      };

      mockedApiClient.post.mockResolvedValue({ data: mockResponse });

      const result = await updateEvaluationParameters(singleParameter);

      expect(mockedApiClient.post).toHaveBeenCalledWith('/evaluation-parameters', singleParameter);
      expect(result).toEqual(mockResponse);
    });

    it('should handle empty parameters array', async () => {
      const emptyParameters: any[] = [];
      const mockResponse = {
        message: 'No parameters to update',
        updatedCount: 0
      };

      mockedApiClient.post.mockResolvedValue({ data: mockResponse });

      const result = await updateEvaluationParameters(emptyParameters);

      expect(mockedApiClient.post).toHaveBeenCalledWith('/evaluation-parameters', emptyParameters);
      expect(result).toEqual(mockResponse);
    });

    it('should handle complex parameter values', async () => {
      const complexParameters = [
        {
          name: 'riskMatrix',
          value: {
            financial: {
              low: { min: 0, max: 30 },
              medium: { min: 31, max: 70 },
              high: { min: 71, max: 100 }
            },
            legal: {
              weights: [0.2, 0.3, 0.5],
              thresholds: { critical: 5, warning: 2 }
            }
          }
        }
      ];

      const mockResponse = {
        message: 'Complex parameters updated successfully',
        updatedCount: 1
      };

      mockedApiClient.post.mockResolvedValue({ data: mockResponse });

      const result = await updateEvaluationParameters(complexParameters);

      expect(mockedApiClient.post).toHaveBeenCalledWith('/evaluation-parameters', complexParameters);
      expect(result).toEqual(mockResponse);
    });
  });
});