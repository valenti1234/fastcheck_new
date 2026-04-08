import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminEvaluationsService, AdminTenantEvaluationsItem } from '../../services/adminEvaluationsService';
import { Database, CheckCircle, XCircle, Activity } from 'lucide-react';

const AdminEvaluationsPage: React.FC = () => {
  const { t } = useTranslation();
  const [items, setItems] = useState<AdminTenantEvaluationsItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await adminEvaluationsService.getEvaluationsByTenant();
        setItems(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.error', 'Error loading data'));
      } finally {
        setLoading(false);
      }
    };
    void loadData();
  }, [t]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('adminDashboard.evaluationStats.title', 'Estadísticas de Evaluaciones por Tenant')}
        </h1>
        <button
          className="px-4 py-2 rounded bg-primary-600 text-white hover:bg-primary-700"
          onClick={() => {
            setLoading(true);
            adminEvaluationsService.getEvaluationsByTenant()
              .then(setItems)
              .catch(err => setError(err instanceof Error ? err.message : t('common.error', 'Error loading data')))
              .finally(() => setLoading(false));
          }}
        >
          {t('common.refresh', 'Actualizar')}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg shadow">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tenant</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Jobs</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Evaluations (Jobs)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Completed (Jobs)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Failed (Jobs)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Results</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Completed (Results)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Failed (Results)</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-6 py-4 text-center text-gray-600 dark:text-gray-300">
                  {t('common.loading', 'Cargando...')}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-4 text-center text-gray-600 dark:text-gray-300">
                  {t('resultsTable.noResults', 'No se encontraron resultados')}
                </td>
              </tr>
            ) : (
              items.map(item => (
                <tr key={item.tenantId}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {item.tenantName || item.tenantId}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300 flex items-center gap-2">
                    <Database className="h-4 w-4" /> {item.jobs}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">{item.totalEvaluationsFromJobs}</td>
                  <td className="px-6 py-4 text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" /> {item.completedEvaluationsFromJobs}
                  </td>
                  <td className="px-6 py-4 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                    <XCircle className="h-4 w-4" /> {item.failedEvaluationsFromJobs}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">{item.totalResults}</td>
                  <td className="px-6 py-4 text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" /> {item.completedResults}
                  </td>
                  <td className="px-6 py-4 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                    <XCircle className="h-4 w-4" /> {item.failedResults}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminEvaluationsPage;