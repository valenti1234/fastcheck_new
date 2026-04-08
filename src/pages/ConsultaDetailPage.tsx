import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import logger from '../utils/logger';



const ConsultaDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchResult = async () => {
      if (!id) return;
      try {
        setIsLoading(true);
        const response = await apiClient.get(`/rut/results/${id}`);
        const result = response.data;
        
        // Navigate to FastCheck page with the RUT parameter
        if (result && result.details && result.details.rut) {
          const rutParam = encodeURIComponent(result.details.rut);
          const idParam = encodeURIComponent(id);
          const fechaParam = result?.createdAt ? `&fecha=${encodeURIComponent(result.createdAt)}` : '';
          navigate(`/fast-check-ex?rut=${rutParam}&resultId=${idParam}${fechaParam}`, { replace: true });
        } else {
          setError('No se encontró el RUT en los datos del resultado');
          setIsLoading(false);
        }
      } catch (err) {
        setError('Error al cargar los datos del resultado');
        logger.error(err);
        setIsLoading(false);
      }
    };

    fetchResult();
  }, [id, navigate]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Cargando...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <h2 className="text-xl font-semibold text-red-500">{error}</h2>
      </div>
    );
  }

  return null; // This should never render as we redirect on successful data fetch
};

export default ConsultaDetailPage;
