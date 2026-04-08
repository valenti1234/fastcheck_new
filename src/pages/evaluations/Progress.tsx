import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { getBulkEvaluations } from '../../services/api';
import toast from 'react-hot-toast';

interface BulkEvaluation {
  _id: string;
  status: 'completed' | 'processing' | 'failed';
  totalSuppliers: number;
  processedSuppliers: number;
}

const Progress = () => {
  const navigate = useNavigate();
  const [evaluations, setEvaluations] = useState<BulkEvaluation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvaluations = async () => {
      try {
        const data = await getBulkEvaluations();
        setEvaluations(data);
      } catch (error) {
        logger.error('Error fetching evaluations:', error);
        toast.error('Error al cargar las evaluaciones');
      } finally {
        setLoading(false);
      }
    };

    fetchEvaluations();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => navigate('/evaluations/bulk')}
            className="flex items-center text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Volver a Evaluación Masiva
          </button>
        </div>

        <div className="bg-gray-800 shadow-lg rounded-lg overflow-hidden">
          <div className="p-6">
            <h1 className="text-2xl font-bold text-white mb-2">
              Progreso de Evaluación Masiva
            </h1>
            <div className="text-green-500 font-medium mb-6">
              Completado
            </div>

            <div className="mb-6">
              <div className="flex justify-between mb-2">
                <span className="text-gray-300">
                  Progreso: 3 de 3 proveedores
                </span>
                <span className="text-blue-500 font-medium">
                  100%
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: '100%' }}
                ></div>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Resultados</h2>
              <div className="space-y-3">
                {evaluations.map((evaluation) => (
                  <div
                    key={evaluation._id}
                    className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg"
                  >
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="font-mono text-white">{evaluation._id}</span>
                    </div>
                    <button
                      onClick={() => navigate(`/evaluations/results/${evaluation._id}`)}
                      className="text-blue-500 hover:text-blue-400"
                    >
                      Ver detalle
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Progress;