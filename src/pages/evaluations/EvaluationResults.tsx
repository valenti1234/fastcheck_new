import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { SheriffDataLogResponse } from '../../types/sheriff';
import ReactMarkdown from 'react-markdown';
import logger from '../../utils/logger';

interface EvaluationData {
  evaluationId: string;
  rut: string;
  companyName: string;
  companyData: SheriffDataLogResponse;
  duxiterMD: string;
}

const EvaluationResults: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [evaluationData, setEvaluationData] = useState<EvaluationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadEvaluationData = async () => {
      try {
        setIsLoading(true);
        
        if (!id) {
          toast.error('ID de evaluación no proporcionado');
          navigate('/evaluations/single');
          return;
        }

        // Get the stored evaluation data
        const storedData = sessionStorage.getItem('evaluationData');
        if (!storedData) {
  //        toast.error('No se encontraron datos de evaluación');
          navigate('/dashboard');
          return;
        }

        const data: EvaluationData = JSON.parse(storedData);
        if (data.evaluationId !== id) {
    //      toast.error('Los datos de evaluación no coinciden');
          navigate('/dashboard');
          return;
        }

        setEvaluationData(data);
      } catch (error) {
        logger.error('Error loading evaluation data:', error);
        toast.error('Error al cargar los datos de evaluación');
        navigate('/evaluations/single');
      } finally {
        setIsLoading(false);
      }
    };

    loadEvaluationData();
  }, [id, navigate]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-700">Cargando resultados...</h2>
        <p className="text-gray-500 mt-2">Por favor espere mientras procesamos su solicitud.</p>
      </div>
    );
  }

  if (!evaluationData) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white shadow-lg rounded-lg overflow-hidden">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            Resultados de Evaluación
          </h1>
          
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
            <h2 className="font-medium text-blue-900 mb-2">Información de la Empresa</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">RUT</p>
                <p className="font-medium">{evaluationData.companyData.rut}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Razón Social</p>
                <p className="font-medium">{(evaluationData.companyData.siiData as any)?.['Razon Social']}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Comuna</p>
                <p className="font-medium">{(evaluationData.companyData.siiData as any)?.['Comuna Tributaria']}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Región</p>
                <p className="font-medium">{(evaluationData.companyData.siiData as any)?.['Region Tributaria']}</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-green-50 border border-green-100 rounded-lg p-4">
              <h3 className="font-medium text-green-900 mb-2">Estado de la Evaluación</h3>
              <p className="text-green-800">Evaluación en proceso...</p>
            </div>
            {evaluationData.duxiterMD && (
              <div className="prose mt-6">
                <ReactMarkdown>{evaluationData.duxiterMD}</ReactMarkdown>
              </div>
            )}
          </div>

          <div className="mt-8 flex justify-end space-x-4">
            <button
              onClick={() => navigate('/evaluations/single')}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Nueva Evaluación
            </button>
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Imprimir Resultados
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvaluationResults;