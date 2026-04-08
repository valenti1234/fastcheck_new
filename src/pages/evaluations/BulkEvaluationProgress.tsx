import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../../services/api';
import { CheckCircle, XCircle, AlertTriangle, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import logger from '../../utils/logger';

interface EvaluationProgress {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalSuppliers: number;
  processedSuppliers: number;
  results: Array<{
    rut: string;
    status: 'success' | 'error';
    data?: any;
    error?: string;
  }>;
  error?: string;
}

const BulkEvaluationProgress: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<EvaluationProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProgress = async () => {
      try {
        const response = await apiClient.get(`/evaluations/bulk/progress/${jobId}`);
        setProgress(response.data);
        
        // Continue polling if not completed or failed
        if (response.data.status !== 'completed' && response.data.status !== 'failed') {
          setTimeout(fetchProgress, 2000); // Poll every 2 seconds
        }
      } catch (error: any) {
        toast.error('Error al obtener el progreso de la evaluación');
        logger.error('Error fetching progress:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProgress();
  }, [jobId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-500';
      case 'failed': return 'text-red-500';
      case 'processing': return 'text-blue-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Pendiente';
      case 'processing': return 'Procesando';
      case 'completed': return 'Completado';
      case 'failed': return 'Error';
      default: return 'Desconocido';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => navigate('/evaluations/bulk')}
            className="flex items-center text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Volver a Evaluación Masiva
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Progreso de Evaluación Masiva
            </h1>
            <div className="flex items-center space-x-2">
              <span className={`font-medium ${getStatusColor(progress?.status || 'pending')}`}>
                {getStatusText(progress?.status || 'pending')}
              </span>
              {progress?.error && (
                <span className="text-red-500 text-sm">{progress.error}</span>
              )}
            </div>
          </div>

          {progress && (
            <div className="p-6">
              <div className="mb-6">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Progreso: {progress.processedSuppliers} de {progress.totalSuppliers} proveedores
                  </span>
                  <span className="text-sm font-medium text-primary-600">
                    {Math.round((progress.processedSuppliers / progress.totalSuppliers) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                  <div
                    className="bg-primary-600 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${(progress.processedSuppliers / progress.totalSuppliers) * 100}%` }}
                  ></div>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Resultados</h2>
                <div className="space-y-3">
                  {progress.results.map((result, index) => (
                    <div
                      key={index}
                      className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex items-start justify-between"
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          {result.status === 'success' ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500" />
                          )}
                          <span className="font-mono text-sm text-gray-900 dark:text-white">
                            {result.rut}
                          </span>
                        </div>
                        {result.error && (
                          <p className="mt-1 text-sm text-red-500">{result.error}</p>
                        )}
                      </div>
                      {result.status === 'success' && result.rut && (
                        <button
                          onClick={() => navigate(`/fast-check-ex?rut=${result.rut}`)}
                          className="text-sm text-primary-600 hover:text-primary-700 dark:hover:text-primary-400"
                        >
                          Ver detalle
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BulkEvaluationProgress;