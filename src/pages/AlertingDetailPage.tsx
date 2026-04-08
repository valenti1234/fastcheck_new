import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../services/api';
import { IResult as IResultBackend } from '../../server/src/models/Result';
import { monitoringService, CreateMonitoringScheduleRequest } from '../services/monitoringService';
import toast from 'react-hot-toast';
import logger from '../utils/logger';
import { useTranslation } from 'react-i18next';



interface IResult extends IResultBackend {
  _id: string;
  createdAt: string;
}

const AlertingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<IResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monitoringStatus, setMonitoringStatus] = useState<boolean>(false);
  const [monitoringLoading, setMonitoringLoading] = useState<boolean>(false);
  const [monitoringError, setMonitoringError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const getDateLocale = () => {
    const lang = i18n.language || 'en';
    if (lang.startsWith('es')) return 'es-CL';
    if (lang.startsWith('pt')) return 'pt-PT';
    if (lang.startsWith('fr')) return 'fr-FR';
    return 'en-US';
  };

  useEffect(() => {
    const fetchResult = async () => {
      if (!id) return;
      try {
        setIsLoading(true);
        const response = await apiClient.get(`/rut/results/${id}`);
        setResult(response.data);
      } catch (err) {
        setError(t('alerting.detail.errorLoadingData'));
        logger.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchResult();
  }, [id]);

  useEffect(() => {
    if (result) {
      checkMonitoringStatus();
    }
  }, [result]);

  const getRiskLevelDisplayName = (riskLevel: string) => {
    switch (riskLevel?.toLowerCase()) {
      case 'red':
      case 'critical':
      case 'critico':
        return t('alerting.riskLevels.red');
      case 'yellow':
      case 'medium':
      case 'medio':
        return t('alerting.riskLevels.yellow');
      case 'green':
      case 'low':
      case 'bajo':
        return t('alerting.riskLevels.green');
      case 'orange':
      case 'high':
      case 'alto':
        return t('alerting.riskLevels.orange');
      default:
        return riskLevel || t('common.unknown', 'Unknown');
    }
  };

  const getRiskLevelClass = (riskLevel: string) => {
    switch (riskLevel?.toLowerCase()) {
      case 'red':
      case 'critical':
      case 'critico':
        return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
      case 'orange':
      case 'high':
      case 'alto':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300';
      case 'yellow':
      case 'medium':
      case 'medio':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
      case 'green':
      case 'low':
      case 'bajo':
        return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300';
    }
  };

  const getAlertPriority = (riskLevel: string) => {
    switch (riskLevel?.toLowerCase()) {
      case 'red':
      case 'critical':
      case 'critico':
        return 'urgent';
      case 'orange':
      case 'high':
      case 'alto':
        return 'high';
      default:
        return 'medium';
    }
  };

  const handleAddToMonitoring = async () => {
    if (!result?.rut) {
      toast.error(t('alerting.monitoring.rutUnavailable'));
      return;
    }

    setMonitoringLoading(true);
    setMonitoringError(null);

    try {
      const monitoringRequest: CreateMonitoringScheduleRequest = {
        rut: result.rut,
        frequency: 'weekly',
        companyName: result.details?.companyGeneralInfo?.name || result.details?.name || undefined
      };

      await monitoringService.createMonitoringSchedule(monitoringRequest);
      setMonitoringStatus(true);
      toast.success(t('alerting.monitoring.addSuccess'));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || t('alerting.monitoring.addError');
      setMonitoringError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setMonitoringLoading(false);
    }
  };

  const checkMonitoringStatus = async () => {
    if (!result?.rut) return;

    try {
      const schedule = await monitoringService.getMonitoringScheduleByRut(result.rut);
      setMonitoringStatus(schedule !== null && schedule.isActive);
    } catch (error) {
      logger.error('Error checking monitoring status:', error);
    }
  };

  const getRiskIcon = (riskLevel: string): React.ReactNode => {
    switch (riskLevel?.toLowerCase()) {
      case 'red':
      case 'critical':
      case 'critico':
        return '🚨';
      case 'orange':
      case 'high':
      case 'alto':
        return '⚠️';
      case 'yellow':
      case 'medium':
      case 'medio':
        return '⚡';
      case 'green':
      case 'low':
      case 'bajo':
        return '✅';
      default:
        return '❓';
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-red-500 mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('alerting.detail.loading')}</h2>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <h2 className="text-xl font-semibold text-red-500">{error || t('alerting.detail.alertNotFound')}</h2>
        <button 
          onClick={() => navigate('/alerting')}
          className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
        >
          {t('alerting.detail.backToAlerts')}
        </button>
      </div>
    );
  }

  const riskLevel = result.riskAssessment?.riskSummary?.semaphore || result.duxiterRiskLevel || 'unknown';
  const priority = getAlertPriority(riskLevel);

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/alerting')}
              className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ← {t('alerting.detail.backToAlerts')}
            </button>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
              {t('alerting.detail.title')}
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            <Link
              to={`/fast-check-ex?rut=${result.details?.rut}&source=alerting`}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              {t('alerting.detail.investigateFastCheck')}
            </Link>
          </div>
        </div>
      </div>

      {/* Alert Summary Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="flex items-center space-x-3">
            <div className="text-2xl">{getRiskIcon(riskLevel)}</div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('alerting.headers.nivelRiesgo')}</p>
              <span className={`px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full ${getRiskLevelClass(riskLevel)}`}>
                {getRiskLevelDisplayName(riskLevel)}
              </span>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="text-2xl">📋</div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('alerting.table.rut')}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {result.details?.rut || result.rut}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="text-2xl">🏢</div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('alerting.table.razonSocial')}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {result.details?.razonSocial || t('common.notAvailable', 'Not available')}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="text-2xl">📅</div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('alerting.table.detectionDate')}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {new Date(result.createdAt).toLocaleDateString(getDateLocale())}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Priority and Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
          {t('alerting.detail.priorityActionsTitle')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('alerting.detail.priorityLabel')}</p>
            <span className={`px-3 py-1 text-sm font-bold rounded ${
              priority === 'urgent' 
                ? 'bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300' 
                : priority === 'high'
                ? 'bg-orange-200 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300'
                : 'bg-yellow-200 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
            }`}>
              {t(`alerting.priorities.${priority}`)}
            </span>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('alerting.detail.actionsLabel')}</p>
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/fast-check-ex?rut=${result.details?.rut}&source=alerting`}
                className="px-3 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 rounded text-sm hover:bg-blue-200 dark:hover:bg-blue-900/70"
              >
                {t('alerting.detail.investigate')}
              </Link>
              <button
                onClick={handleAddToMonitoring}
                disabled={monitoringLoading || monitoringStatus}
                className={`px-3 py-1 rounded text-sm ${
                  monitoringStatus
                    ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 cursor-not-allowed'
                  : monitoringLoading
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300 cursor-wait'
                    : 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/70'
                }`}
              >
                {monitoringLoading 
                  ? t('alerting.actions.adding') 
                  : monitoringStatus 
                  ? t('alerting.detail.alreadyMonitored') 
                  : t('alerting.actions.addToMonitoring')
                }
              </button>
            </div>
          </div>
        </div>
      </div>

     

      {/* AI Analysis */}
      {result.aiAnalysis && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
            {t('alerting.detail.aiAnalysisTitle')}
          </h2>
          <div className="prose dark:prose-invert max-w-none">
            <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {result.aiAnalysis}
            </p>
            {result.aiAnalysisDate && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
                {t('alerting.detail.aiAnalysisGeneratedOn')} {new Date(result.aiAnalysisDate).toLocaleString(getDateLocale())}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Markdown Resume */}
      {result.markdownResume && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
            {t('alerting.detail.detailedSummaryTitle')}
          </h2>
          <div className="prose dark:prose-invert max-w-none">
            <div className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {result.markdownResume}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertingDetailPage;