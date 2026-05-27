import React, { useEffect, useState } from 'react';
import { getBulkEvaluations } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { logger } from '../../utils/logger';

interface BulkEvaluation {
  _id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalEvaluations: number;
  completedEvaluations: number;
  failedEvaluations: number;
  createdAt: Date;
}

const BulkEvaluationProgressMeter: React.FC = () => {
  const { t } = useTranslation();
  const [evaluations, setEvaluations] = useState<BulkEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchEvaluations = async () => {
      try {
        const data = await getBulkEvaluations();
        setEvaluations(data);
        setLoading(false);

        // Check if all evaluations are completed
        const processingEval = data.find(evaluation => evaluation.status === 'processing');
        if (!processingEval) {
          navigate('/dashboard');
        }
      } catch (error) {
        logger.error('Error fetching bulk evaluations:', error);
        setLoading(false);
      }
    };

    fetchEvaluations();
    const interval = setInterval(fetchEvaluations, 60000); // Poll every 1 minute

    return () => clearInterval(interval);
  }, [navigate]);

  const getLatestProcessing = () => {
    return evaluations.find(evaluation => evaluation.status === 'processing');
  };

  const processingEvaluation = getLatestProcessing();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        <div className="space-y-3 mt-4">
          <div className="h-8 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!processingEvaluation) {
    return (
      <div className=" rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('bulkProgress.title')}</h3>
        <div className="space-y-4">
          <div className="relative pt-1">
            <div className="flex mb-2 items-center justify-between">
              <div>
                <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-100 bg-blue-500 ">
                  {t('bulkProgress.progress')}
                </span>
              </div>
              <div className="text-right">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  0%
                </span>
              </div>
            </div>
            <div className="mt-4 h-4 rounded-full bg-gray-700">
              <div
                style={{ width: '0%' }}
                className="h-4 rounded-full bg-blue-500"
              ></div>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {t('bulkProgress.completed', { completed: 0, total: 0 })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const progress = Math.round(
    (processingEvaluation.completedEvaluations / processingEvaluation.totalEvaluations) * 100
  );

  return (
    <div className="bg-gray-800 rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-100 mb-4">{t('bulkProgress.title')}</h3>
      <div className="space-y-4">
        <div className="relative pt-1">
          <div className="flex mb-2 items-center justify-between">
            <div>
              <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-200 bg-blue-900">
                {t('bulkProgress.progress')}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold inline-block text-blue-200">
                {progress}%
              </span>
            </div>
          </div>
          <div className="mt-4 h-4 rounded-full bg-gray-700">
            <div
              style={{ width: `${progress}%` }}
              className="h-4 rounded-full bg-blue-500"
            ></div>
          </div>
          <div className="text-sm text-gray-300">
            {t('bulkProgress.completed', { completed: processingEvaluation.completedEvaluations, total: processingEvaluation.totalEvaluations })}
          </div>
          {processingEvaluation.failedEvaluations > 0 && (
            <div className="text-sm text-red-400 mt-1">
              {t('bulkProgress.failed', { count: processingEvaluation.failedEvaluations })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BulkEvaluationProgressMeter;