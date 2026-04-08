import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Activity, Clock, CheckCircle, XCircle, AlertTriangle, Users, BarChart3, TrendingUp } from 'lucide-react';
import PageLoader from '../../components/common/PageLoader';
import { logger } from '../../utils/logger';
import { useTranslation } from 'react-i18next';



interface TenantMonitoringStats {
  tenantId: string;
  tenantName: string;
  totalSchedules: number;
  activeSchedules: number;
  inactiveSchedules: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  lastExecution?: string;
  nextExecution?: string;
  averageExecutionsPerSchedule: number;
  schedulesByFrequency: {
    minute: number;
    daily: number;
    weekly: number;
    monthly: number;
  };
}

interface GlobalStats {
  totalTenants: number;
  totalSchedules: number;
  totalActiveSchedules: number;
  totalExecutions: number;
  averageSchedulesPerTenant: number;
}

interface MonitoringStatistics {
  tenantStats: TenantMonitoringStats[];
  globalStats: GlobalStats;
}

const TenantMonitoringStatusPage: React.FC = () => {
  const { token, user } = useAuth();
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'es-ES';
  const [statistics, setStatistics] = useState<MonitoringStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatistics = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (!token) {
        throw new Error(t('superAdminMonitoring.errors.authMissing'));
      }
      
      if (!user || user.role !== 'superuser') {
        throw new Error(t('superAdminMonitoring.errors.accessDenied'));
      }
      
      logger.log('Fetching monitoring statistics with token:', token?.substring(0, 10) + '...');
      
      const response = await fetch('/api/monitoring/statistics', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      logger.log('Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Error response:', errorText);
        throw new Error(t('superAdminMonitoring.errors.fetchFailed', { status: response.status, statusText: response.statusText }));
      }

      const data = await response.json();
      logger.log('Received data:', data);
      setStatistics(data);
    } catch (err) {
      logger.error('Error fetching monitoring statistics:', err);
      setError(err instanceof Error ? err.message : t('superAdminMonitoring.errors.loadStats'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatistics();
  }, [token]);

  const getStatusColor = (activeSchedules: number, totalSchedules: number) => {
    if (totalSchedules === 0) return 'text-gray-500';
    const percentage = (activeSchedules / totalSchedules) * 100;
    if (percentage >= 80) return 'text-green-500';
    if (percentage >= 50) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getStatusIcon = (activeSchedules: number, totalSchedules: number) => {
    if (totalSchedules === 0) return <AlertTriangle className="h-5 w-5 text-gray-500" />;
    const percentage = (activeSchedules / totalSchedules) * 100;
    if (percentage >= 80) return <CheckCircle className="h-5 w-5 text-green-500" />;
    if (percentage >= 50) return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    return <XCircle className="h-5 w-5 text-red-500" />;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return t('superAdminMonitoring.date.never');
    return new Date(dateString).toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFrequencyBadge = (frequency: string, count: number) => {
    if (count === 0) return null;
    
    const colors = {
      minute: 'bg-red-100 text-red-800',
      daily: 'bg-blue-100 text-blue-800',
      weekly: 'bg-green-100 text-green-800',
      monthly: 'bg-purple-100 text-purple-800'
    };

    const labels = {
      minute: t('superAdminMonitoring.frequency.min'),
      daily: t('superAdminMonitoring.frequency.daily'),
      weekly: t('superAdminMonitoring.frequency.weekly'),
      monthly: t('superAdminMonitoring.frequency.monthly')
    };

    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${colors[frequency as keyof typeof colors]}`}>
        {labels[frequency as keyof typeof labels]}: {count}
      </span>
    );
  };

  if (loading) {
    return <PageLoader />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center">
              <XCircle className="h-5 w-5 text-red-500 mr-2" />
              <span className="text-red-700 dark:text-red-400">{error}</span>
            </div>
            <button
              onClick={fetchStatistics}
              className="mt-3 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              {t('superAdminMonitoring.buttons.retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!statistics) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center text-gray-500 dark:text-gray-400">
            {t('superAdminMonitoring.messages.noData')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {t('superAdminMonitoring.title')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {t('superAdminMonitoring.subtitle')}
          </p>
        </div>

        {/* Global Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('superAdminMonitoring.stats.totalTenants')}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {statistics.globalStats.totalTenants}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <div className="flex items-center">
              <Activity className="h-8 w-8 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('superAdminMonitoring.stats.totalSchedules')}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {statistics.globalStats.totalSchedules}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('superAdminMonitoring.stats.activeSchedules')}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {statistics.globalStats.totalActiveSchedules}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <div className="flex items-center">
              <BarChart3 className="h-8 w-8 text-purple-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('superAdminMonitoring.stats.totalExecutions')}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {statistics.globalStats.totalExecutions}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <div className="flex items-center">
              <TrendingUp className="h-8 w-8 text-orange-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('superAdminMonitoring.stats.averagePerTenant')}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {statistics.globalStats.averageSchedulesPerTenant}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tenant Statistics Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('superAdminMonitoring.sections.tenantDetail')}
            </h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('superAdminMonitoring.table.columns.tenant')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('superAdminMonitoring.table.columns.status')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('superAdminMonitoring.table.columns.schedules')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('superAdminMonitoring.table.columns.executions')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('superAdminMonitoring.table.columns.frequencies')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('superAdminMonitoring.table.columns.lastExecution')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('superAdminMonitoring.table.columns.nextExecution')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {statistics.tenantStats.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <div className="text-gray-500 dark:text-gray-400">
                        <Activity className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                          {t('superAdminMonitoring.messages.noMonitoringConfigured')}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {t('superAdminMonitoring.messages.noMonitoringFound')}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  statistics.tenantStats.map((tenant) => (
                    <tr key={tenant.tenantId} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {tenant.tenantName}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {t('superAdminMonitoring.labels.id')}: {tenant.tenantId.substring(0, 8)}...
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {getStatusIcon(tenant.activeSchedules, tenant.totalSchedules)}
                          <span className={`ml-2 text-sm font-medium ${getStatusColor(tenant.activeSchedules, tenant.totalSchedules)}`}>
                            {tenant.totalSchedules === 0 ? t('superAdminMonitoring.status.noSchedules') : 
                             tenant.activeSchedules === tenant.totalSchedules ? t('superAdminMonitoring.status.allActive') :
                             tenant.activeSchedules === 0 ? t('superAdminMonitoring.status.allInactive') :
                             t('superAdminMonitoring.status.activeCount', { active: tenant.activeSchedules, total: tenant.totalSchedules })}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          <div>{t('superAdminMonitoring.labels.totals')}: <span className="font-medium">{tenant.totalSchedules}</span></div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {t('superAdminMonitoring.labels.active')}: {tenant.activeSchedules} | {t('superAdminMonitoring.labels.inactive')}: {tenant.inactiveSchedules}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          <div>{t('superAdminMonitoring.labels.totals')}: <span className="font-medium">{tenant.totalExecutions}</span></div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            ✓ {tenant.successfulExecutions} | ✗ {tenant.failedExecutions}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {t('superAdminMonitoring.labels.average')}: {tenant.averageExecutionsPerSchedule}{t('superAdminMonitoring.labels.perSchedule')}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          {getFrequencyBadge('minute', tenant.schedulesByFrequency.minute)}
                          {getFrequencyBadge('daily', tenant.schedulesByFrequency.daily)}
                          {getFrequencyBadge('weekly', tenant.schedulesByFrequency.weekly)}
                          {getFrequencyBadge('monthly', tenant.schedulesByFrequency.monthly)}
                          {tenant.totalSchedules === 0 && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {formatDate(tenant.lastExecution)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {formatDate(tenant.nextExecution)}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Refresh Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={fetchStatistics}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center"
          >
            <Activity className="h-4 w-4 mr-2" />
            {loading ? t('superAdminMonitoring.buttons.refreshing') : t('superAdminMonitoring.buttons.refresh')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TenantMonitoringStatusPage;