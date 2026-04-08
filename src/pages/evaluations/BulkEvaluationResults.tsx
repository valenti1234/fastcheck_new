import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../../services/api';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import logger from '../../utils/logger';

interface EvaluationResult {
  rut: string;
  name?: string;
  status: 'success' | 'failed';
  data?: any;
  error?: string;
}

interface Job {
  _id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalEvaluations: number;
  completedEvaluations: number;
  failedEvaluations: number;
  createdAt: string;
}

const BulkEvaluationResults: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [results, setResults] = useState<EvaluationResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchJobStatus = async () => {
    try {
      const response = await apiClient.get(`/evaluations/results/${jobId}`);
      setJob(response.data);

      // If job is completed or failed, fetch results
      if (response.data.status === 'completed' || response.data.status === 'failed') {
        fetchResults();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al obtener el estado de la evaluación');
      toast.error('Error al obtener el estado de la evaluación');
      setIsLoading(false);
    }
  };

  const fetchResults = async () => {
    try {
      const response = await apiClient.get(`/evaluations/results/${jobId}/results?page=${currentPage}`);
      setResults(response.data.results);
      setTotalPages(response.data.pages);
      setIsLoading(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al obtener los resultados');
      toast.error('Error al obtener los resultados');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!jobId) {
      navigate('/evaluations/bulk');
      return;
    }

    fetchJobStatus();

    // Poll job status every 5 seconds if not completed
    const interval = setInterval(() => {
      if (job?.status !== 'completed' && job?.status !== 'failed') {
        fetchJobStatus();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [jobId]);

  useEffect(() => {
    if (job?.status === 'completed' || job?.status === 'failed') {
      fetchResults();
    }
  }, [currentPage, job?.status]);

  if (error) {
    return (
      <div className="min-h-screen py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4">
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Resultados de Evaluación Masiva</h1>
          {job && (
            <div className="mt-4 bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Estado</p>
                  <p className="text-lg font-semibold">
                    {job.status === 'processing' && (
                      <span className="flex items-center text-blue-500">
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Procesando
                      </span>
                    )}
                    {job.status === 'completed' && (
                      <span className="flex items-center text-green-500">
                        <CheckCircle className="w-5 h-5 mr-2" />
                        Completado
                      </span>
                    )}
                    {job.status === 'failed' && (
                      <span className="flex items-center text-red-500">
                        <XCircle className="w-5 h-5 mr-2" />
                        Fallido
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total</p>
                  <p className="text-lg font-semibold">{job.totalEvaluations}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Completados</p>
                  <p className="text-lg font-semibold text-green-500">{job.completedEvaluations}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Fallidos</p>
                  <p className="text-lg font-semibold text-red-500">{job.failedEvaluations}</p>
                </div>
              </div>
              {job.status === 'processing' && (
                <div className="mt-4">
                  <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full"
                      style={{
                        width: `${((job.completedEvaluations + job.failedEvaluations) / job.totalEvaluations) * 100}%`
                      }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {(job?.status === 'completed' || job?.status === 'failed') && (
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">RUT</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nombre</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Detalles</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {results.map((result, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{result.rut}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{result.name || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {result.status === 'success' ? (
                        <span className="flex items-center text-green-500">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Éxito
                        </span>
                      ) : (
                        <span className="flex items-center text-red-500">
                          <XCircle className="w-4 h-4 mr-1" />
                          Error
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {result.status === 'failed' ? result.error : 'Evaluación completada'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="bg-white dark:bg-gray-800 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 sm:px-6">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                    disabled={currentPage === totalPages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-200">
                      Mostrando página <span className="font-medium">{currentPage}</span> de{' '}
                      <span className="font-medium">{totalPages}</span>
                    </p>
                  </div>
                  <div>
                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                      <button
                        onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                        disabled={currentPage === 1}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                      >
                        Anterior
                      </button>
                      <button
                        onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                        disabled={currentPage === totalPages}
                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                      >
                        Siguiente
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkEvaluationResults;