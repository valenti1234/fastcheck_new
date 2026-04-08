import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient, validateChileanRut } from '../../services/api';
import { getEvaluationParameters } from '../../services/evaluationParameterService';
import { logger } from '../../utils/logger';

interface TestCriteriaCardProps {}

interface ComparisonResult {
  parameter: string;
  rutValue: any;
  parameterValue: any;
  condition: string;
}

const TestCriteriaCard: React.FC<TestCriteriaCardProps> = () => {
  const { t } = useTranslation();
  const [rut, setRut] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ComparisonResult[]>([]);

  const handleTest = async () => {
    if (!rut) {
      setError(t('evaluationSettings.testCard.enterRut'));
      return;
    }

    if (!validateChileanRut(rut)) {
      setError(t('evaluationSettings.testCard.invalidRut'));
      return;
    }

    const cleanRut = rut.replace(/\./g, '');

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const [rutResponse, paramsResponse] = await Promise.all([
        apiClient.get(`/rut/results/rut/${cleanRut}`),
        getEvaluationParameters(),
      ]);

      const rutData = rutResponse.data.sheriffLogData;
      const evaluationParameters = paramsResponse;

      const comparisonResults: ComparisonResult[] = [];

      for (const sectionName in evaluationParameters) {
        if (Object.prototype.hasOwnProperty.call(evaluationParameters, sectionName)) {
          const section = evaluationParameters[sectionName];
          for (const paramKey in section) {
            if (Object.prototype.hasOwnProperty.call(section, paramKey)) {
              const parameter = section[paramKey];
              const { sheriffLogKey, value: parameterValue, condicion } = parameter;

              if (sheriffLogKey) {
                let currentRutValue = rutData;
                const keys = sheriffLogKey.split('.');
                for (const key of keys) {
                  if (currentRutValue && typeof currentRutValue === 'object' && key in currentRutValue) {
                    currentRutValue = currentRutValue[key];
                  } else {
                    currentRutValue = t('evaluationSettings.testCard.notFound');
                    break;
                  }
                }
                
                comparisonResults.push({
                  parameter: parameter.label,
                  rutValue: currentRutValue,
                  parameterValue,
                  condition: condicion || t('evaluationSettings.testCard.notAvailable'),
                });
              }
            }
          }
        }
      }

      setResults(comparisonResults);

    } catch (err) {
      setError(t('evaluationSettings.testCard.fetchError'));
      logger.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded shadow-sm">
      <h2 className="text-xl font-semibold mb-2">{t('evaluationSettings.testCard.title')}</h2>
      <div className="mb-4">
        <label htmlFor="rut-test" className="block text-sm font-medium text-gray-700">
          {t('evaluationSettings.testCard.rut')}
        </label>
        <input
          type="text"
          id="rut-test"
          value={rut}
          onChange={(e) => setRut(e.target.value)}
          className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black"
        />
      </div>
      <button
        onClick={handleTest}
        disabled={loading}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      >
        {loading ? t('evaluationSettings.testCard.testing') : t('evaluationSettings.testCard.testAll')}
      </button>
      {error && <div className="mt-4 text-red-500">{error}</div>}
      {results.length > 0 && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold">{t('evaluationSettings.testCard.resultsTitle')}:</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('evaluationSettings.testCard.table.parameter')}</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('evaluationSettings.testCard.table.rutValue')}</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('evaluationSettings.testCard.table.parameterValue')}</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('evaluationSettings.testCard.table.condition')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {results.map((res, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{res.parameter}</td>
                    <td className="px-6 py-4 whitespace-pre-wrap text-sm text-gray-500">{JSON.stringify(res.rutValue, null, 2)}</td>
                    <td className="px-6 py-4 whitespace-pre-wrap text-sm text-gray-500">{JSON.stringify(res.parameterValue, null, 2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{res.condition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default TestCriteriaCard;