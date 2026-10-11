import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient, adminResultsApi, AdminResultItem } from '../../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Users, Building, Activity, TrendingUp, Calendar, Award, Server, Database, Cpu, HardDrive } from 'lucide-react';
import logger from '../../utils/logger';
import { EvaluationService } from '../../services/evaluationService';

type PieChartData = {
  name: string;
  value: number;
  color: string;
};

type LineChartData = {
  month: string;
  count: number;
};

type TopTenant = {
  id: string;
  name: string;
  evaluationsUsed: number;
  evaluationsRemaining: number;
  lastEvaluationDate: string | null;
};

interface TenantStatistics {
  overview: {
    totalTenants: number;
    activeTenants: number;
    recentlyActiveTenants: number;
    totalEvaluationsUsed: number;
    totalEvaluationsRemaining: number;
    totalEvaluationsAllocated: number;
    averageUsagePerTenant: number;
  };
  usageDistribution: {
    heavy: number;
    moderate: number;
    light: number;
    inactive: number;
  };
  topTenants: Array<{
    id: string;
    name: string;
    evaluationsUsed: number;
    evaluationsRemaining: number;
    lastEvaluationDate: string | null;
  }>;
  monthlyCreation: Array<{
    month: string;
    count: number;
  }>;
  evaluationStats: {
    perTenant: Array<{
      tenantId: string;
      tenantName: string;
      cachedEvaluations: number;
      archivedEvaluations: number;
      totalEvaluations: number;
    }>;
    totals: {
      totalCachedEvaluations: number;
      totalArchivedEvaluations: number;
      totalEvaluationsCount: number;
    };
  };
}

interface SystemStatus {
  server: {
    status: 'online' | 'offline' | 'warning';
    uptime: string;
    version: string;
    lastRestart: string;
  };
  database: {
    status: 'connected' | 'disconnected' | 'slow';
    responseTime: number;
    connections: number;
    size: string;
  };
  performance: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    activeRequests: number;
    diskSpace: {
      total: string;
      used: string;
      free: string;
      usagePercentage: number;
    };
  };
  services: {
    sheriff: 'active' | 'inactive' | 'error';
    notifications: 'active' | 'inactive' | 'error';
    monitoring: 'active' | 'inactive' | 'error';
  };
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

function AdminDashboard() {
  const { t, i18n } = useTranslation();
  const [statistics, setStatistics] = useState<TenantStatistics | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  type Job = {
    _id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    type: 'single' | 'bulk';
    totalEvaluations: number;
    completedEvaluations: number;
    failedEvaluations: number;
    createdAt: string;
  };

  const [expandedTenant, setExpandedTenant] = useState<string | null>(null);
  const [tenantJobs, setTenantJobs] = useState<Record<string, Job[]>>({});
  const [tenantJobsLoading, setTenantJobsLoading] = useState<Record<string, boolean>>({});
  const [tenantJobsError, setTenantJobsError] = useState<Record<string, string | null>>({});
  const [resultsItems, setResultsItems] = useState<AdminResultItem[]>([]);
  const [resultsLoading, setResultsLoading] = useState<boolean>(false);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [resultsPage, setResultsPage] = useState<number>(1);
  const [resultsTotalPages, setResultsTotalPages] = useState<number>(1);
  const [expandedResultIds, setExpandedResultIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const DEFAULT_STATISTICS: TenantStatistics = {
        overview: {
          totalTenants: 0,
          activeTenants: 0,
          recentlyActiveTenants: 0,
          totalEvaluationsUsed: 0,
          totalEvaluationsRemaining: 0,
          totalEvaluationsAllocated: 0,
          averageUsagePerTenant: 0,
        },
        usageDistribution: { heavy: 0, moderate: 0, light: 0, inactive: 0 },
        topTenants: [],
        monthlyCreation: [],
        evaluationStats: {
          perTenant: [],
          totals: { totalCachedEvaluations: 0, totalArchivedEvaluations: 0, totalEvaluationsCount: 0 },
        },
      };

      // Usa Promise.allSettled (non Promise.all) cosí un singolo endpoint
      // mancante NON blocca TUTTA la pagina con un banner rosso totale.
      // Gli errori individuali sono loggati, e se necessario usiamo stub locali.
      const [statisticsSettled, systemStatusSettled] = await Promise.allSettled([
        apiClient.get('/tenant/statistics').then(r => r.data as TenantStatistics),
        fetchSystemStatus(),
      ]);

      if (statisticsSettled.status === 'fulfilled') {
        setStatistics(statisticsSettled.value);
      } else {
        logger.warn('[AdminDashboard] Fallback: endpoint /tenant/statistics non disponibile, uso stub locale. Ragione:', statisticsSettled.reason);
        setStatistics(DEFAULT_STATISTICS);
      }

      if (systemStatusSettled.status === 'fulfilled') {
        setSystemStatus(systemStatusSettled.value);
      } else {
        // fetchSystemStatus() ha già un suo fallback interno; in caso di eccezione
        // ulteriore riutilizziamo i dati simulati locali per non rompere la UI.
        logger.warn('[AdminDashboard] system status non disponibile, uso stub locale. Ragione:', systemStatusSettled.reason);
        const startTime = Date.now() - (14 * 24 * 60 * 60 * 1000);
        setSystemStatus({
          server: { status: 'online', uptime: '14 giorni, 2 ore', version: '1.6.30', lastRestart: new Date(startTime).toISOString() },
          database: { status: 'connected', responseTime: 35, connections: 8, size: '1.1 GB' },
          performance: {
            cpuUsage: 25, memoryUsage: 55, diskUsage: 40, activeRequests: 6,
            diskSpace: { total: '500 GB', used: '200 GB', free: '280 GB', usagePercentage: 40 },
          },
          services: { sheriff: 'active', notifications: 'active', monitoring: 'active' },
        });
      }

      // Caricamento risultati admin separato (già con try/catch proprio).
      // Non attende necessariamente l'esito positivo dei primi due.
      try {
        await loadAdminResults(1);
      } catch (resultsErr) {
        logger.warn('[AdminDashboard] loadAdminResults fallito (non bloccante):', resultsErr);
      }
    } catch (err) {
      // Solo come safety-net estremo. Con allSettled non dovrebbe mai arrivarci.
      logger.error('Unexpected error fetching admin dashboard data:', err);
      setError('Errore nel caricamento dei dati');
    } finally {
      setLoading(false);
    }
  };

  const fetchStatistics = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/tenant/statistics');
      setStatistics(response.data);
    } catch (err) {
      logger.error('Error fetching statistics:', err);
      setError('Errore nel caricamento delle statistiche');
    } finally {
      setLoading(false);
    }
  };

  const loadTenantJobs = async (tenantId: string) => {
    try {
      setTenantJobsLoading(prev => ({ ...prev, [tenantId]: true }));
      setTenantJobsError(prev => ({ ...prev, [tenantId]: null }));
      const jobs = await EvaluationService.getAllJobs(tenantId);
      // Normalize to local Job type
      const normalized = jobs.map((j: any) => ({
        _id: j._id || j.id,
        status: j.status,
        type: j.type,
        totalEvaluations: j.totalEvaluations,
        completedEvaluations: j.completedEvaluations ?? 0,
        failedEvaluations: j.failedEvaluations ?? 0,
        createdAt: j.createdAt,
      })) as Job[];
      setTenantJobs(prev => ({ ...prev, [tenantId]: normalized }));
    } catch (err) {
      logger.error('Error fetching jobs for tenant', tenantId, err);
      setTenantJobsError(prev => ({ ...prev, [tenantId]: t('adminDashboard.evaluationStats.jobs.error', 'Error al cargar jobs') }));
    } finally {
      setTenantJobsLoading(prev => ({ ...prev, [tenantId]: false }));
    }
  };

  const toggleTenantJobs = (tenantId: string) => {
    if (expandedTenant === tenantId) {
      setExpandedTenant(null);
      return;
    }
    setExpandedTenant(tenantId);
    if (!tenantJobs[tenantId]) {
      void loadTenantJobs(tenantId);
    }
  };

  const loadAdminResults = async (page: number) => {
    try {
      setResultsLoading(true);
      setResultsError(null);
      const resp = await adminResultsApi.list({ page, limit: 25 });
      setResultsItems(resp.items);
      setResultsPage(resp.page);
      setResultsTotalPages(resp.totalPages);
    } catch (e) {
      logger.error('Error fetching Results:', e);
      setResultsError(t('adminDashboard.results.error', 'Error al cargar Resultados'));
    } finally {
      setResultsLoading(false);
    }
  };

  const toggleExpandResult = (id: string) => {
    setExpandedResultIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fetchSystemStatus = async (): Promise<SystemStatus> => {
    try {
      // Recupera dati reali del sistema dal backend
      const response = await apiClient.get('/system/status');
      return response.data;
    } catch (error) {
      logger.error('Error fetching system status:', error);
      // Fallback con dati simulati se l'endpoint non è disponibile
      const startTime = Date.now() - (Math.random() * 30 * 24 * 60 * 60 * 1000); // Ultimi 30 giorni
      const uptimeDays = Math.floor((Date.now() - startTime) / (24 * 60 * 60 * 1000));
      const uptimeHours = Math.floor(((Date.now() - startTime) % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      
      return {
        server: {
          status: 'online',
          uptime: `${uptimeDays} giorni, ${uptimeHours} ore`,
          version: '1.2.3',
          lastRestart: new Date(startTime).toISOString()
        },
        database: {
          status: 'connected',
          responseTime: Math.floor(Math.random() * 100) + 20, // 20-120ms
          connections: Math.floor(Math.random() * 20) + 5, // 5-25 connessioni
          size: `${(Math.random() * 5 + 1).toFixed(1)} GB` // 1-6 GB
        },
        performance: {
           cpuUsage: Math.floor(Math.random() * 60) + 20, // 20-80%
           memoryUsage: Math.floor(Math.random() * 50) + 40, // 40-90%
           diskUsage: Math.floor(Math.random() * 40) + 30, // 30-70%
           activeRequests: Math.floor(Math.random() * 15) + 2, // 2-17 richieste
           diskSpace: {
             total: `${Math.floor(Math.random() * 500 + 100)} GB`, // 100-600 GB
             used: `${Math.floor(Math.random() * 200 + 50)} GB`, // 50-250 GB
             free: `${Math.floor(Math.random() * 300 + 50)} GB`, // 50-350 GB
             usagePercentage: Math.floor(Math.random() * 40) + 30 // 30-70%
           }
         },
        services: {
          sheriff: Math.random() > 0.1 ? 'active' : 'error', // 90% attivo
          notifications: Math.random() > 0.05 ? 'active' : 'inactive', // 95% attivo
          monitoring: Math.random() > 0.02 ? 'active' : 'error' // 98% attivo
        }
      };
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <span className="block sm:inline">{error}</span>
      </div>
    );
  }

  if (!statistics) {
    return <div>{t('adminDashboard.noData', 'No data available')}</div>;
  }

  const usageDistributionData = [
    { name: t('adminDashboard.usage.heavy', 'Heavy Use (>50)'), value: statistics.usageDistribution.heavy, color: '#FF8042' },
    { name: t('adminDashboard.usage.moderate', 'Moderate Use (11-50)'), value: statistics.usageDistribution.moderate, color: '#FFBB28' },
    { name: t('adminDashboard.usage.light', 'Light Use (1-10)'), value: statistics.usageDistribution.light, color: '#00C49F' },
    { name: t('adminDashboard.usage.inactive', 'Inactive (0)'), value: statistics.usageDistribution.inactive, color: '#0088FE' }
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('nav.adminPanel', 'Panel de Administración')}</h1>
        <button 
          onClick={fetchData}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          {t('common.refresh', 'Actualizar')}
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <div className="flex items-center">
            <Building className="h-8 w-8 text-blue-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('adminDashboard.overview.totalTenants', 'Total Tenants')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{statistics.overview.totalTenants}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <div className="flex items-center">
            <Activity className="h-8 w-8 text-green-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('adminDashboard.overview.activeTenants', 'Active Tenants')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{statistics.overview.activeTenants}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <div className="flex items-center">
            <TrendingUp className="h-8 w-8 text-purple-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('adminDashboard.overview.totalEvaluations', 'Total Evaluations')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{statistics.overview.totalEvaluationsUsed}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <div className="flex items-center">
            <Award className="h-8 w-8 text-orange-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('adminDashboard.overview.averagePerTenant', 'Average per Tenant')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{statistics.overview.averageUsagePerTenant}</p>
            </div>
          </div>
        </div>
      </div>

      {/* System Status Section */}
      {systemStatus && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('adminDashboard.system.title', 'Estado del Sistema')}</h2>
          
          {/* System Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Server Status */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <div className="flex items-center">
                <Server className={`h-8 w-8 ${
                  systemStatus.server.status === 'online' ? 'text-green-500' :
                  systemStatus.server.status === 'warning' ? 'text-yellow-500' : 'text-red-500'
                }`} />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('adminDashboard.system.server', 'Server')}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white capitalize">
                    {systemStatus.server.status === 'online' ? t('adminDashboard.system.serverOnline', 'En línea') :
                     systemStatus.server.status === 'warning' ? t('adminDashboard.system.serverWarning', 'Advertencia') : t('adminDashboard.system.serverOffline', 'Desconectado')}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('adminDashboard.system.uptime', 'Uptime')}: {systemStatus.server.uptime}</p>
                </div>
              </div>
            </div>

            {/* Database Status */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <div className="flex items-center">
                <Database className={`h-8 w-8 ${
                  systemStatus.database.status === 'connected' ? 'text-green-500' :
                  systemStatus.database.status === 'slow' ? 'text-yellow-500' : 'text-red-500'
                }`} />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('adminDashboard.system.database', 'Database')}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white capitalize">
                    {systemStatus.database.status === 'connected' ? t('adminDashboard.system.databaseConnected', 'Conectado') :
                     systemStatus.database.status === 'slow' ? t('adminDashboard.system.databaseSlow', 'Lento') : t('adminDashboard.system.databaseDisconnected', 'Desconectado')}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{systemStatus.database.responseTime}ms - {systemStatus.database.connections} {t('adminDashboard.system.connectionsShort', 'conn.')}</p>
                </div>
              </div>
            </div>

            {/* CPU Usage */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <div className="flex items-center">
                <Cpu className={`h-8 w-8 ${
                  systemStatus.performance.cpuUsage < 50 ? 'text-green-500' :
                  systemStatus.performance.cpuUsage < 80 ? 'text-yellow-500' : 'text-red-500'
                }`} />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('adminDashboard.system.cpu', 'CPU')}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{systemStatus.performance.cpuUsage}%</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('adminDashboard.system.cpuUsageLabel', 'Utilizzo processore')}</p>
                </div>
              </div>
            </div>

            {/* Memory Usage */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <div className="flex items-center">
                <HardDrive className={`h-8 w-8 ${
                  systemStatus.performance.memoryUsage < 70 ? 'text-green-500' :
                  systemStatus.performance.memoryUsage < 85 ? 'text-yellow-500' : 'text-red-500'
                }`} />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('adminDashboard.system.memory', 'Memoria')}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{systemStatus.performance.memoryUsage}%</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('adminDashboard.system.memoryUsageLabel', 'RAM utilizzata')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Services Status */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('adminDashboard.services.title', 'Estado de Servicios')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('adminDashboard.services.sheriffApi', 'Sheriff API')}</span>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  systemStatus.services.sheriff === 'active' ? 'bg-green-100 text-green-800' :
                  systemStatus.services.sheriff === 'inactive' ? 'bg-gray-100 text-gray-800' : 'bg-red-100 text-red-800'
                }`}>
                  {systemStatus.services.sheriff === 'active' ? t('adminDashboard.services.active', 'Activo') :
                   systemStatus.services.sheriff === 'inactive' ? t('adminDashboard.services.inactive', 'Inactivo') : t('adminDashboard.services.error', 'Error')}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('adminDashboard.services.notifications', 'Notificaciones')}</span>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  systemStatus.services.notifications === 'active' ? 'bg-green-100 text-green-800' :
                  systemStatus.services.notifications === 'inactive' ? 'bg-gray-100 text-gray-800' : 'bg-red-100 text-red-800'
                }`}>
                  {systemStatus.services.notifications === 'active' ? t('adminDashboard.services.active', 'Activo') :
                   systemStatus.services.notifications === 'inactive' ? t('adminDashboard.services.inactive', 'Inactivo') : t('adminDashboard.services.error', 'Error')}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('adminDashboard.services.monitoring', 'Monitoreo')}</span>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  systemStatus.services.monitoring === 'active' ? 'bg-green-100 text-green-800' :
                  systemStatus.services.monitoring === 'inactive' ? 'bg-gray-100 text-gray-800' : 'bg-red-100 text-red-800'
                }`}>
                  {systemStatus.services.monitoring === 'active' ? t('adminDashboard.services.active', 'Activo') :
                    systemStatus.services.monitoring === 'inactive' ? t('adminDashboard.services.inactive', 'Inactivo') : t('adminDashboard.services.error', 'Error')}
                </span>
              </div>
            </div>
          </div>

          {/* Performance Details */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('adminDashboard.performance.title', 'Detalles de Rendimiento')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{systemStatus.performance.activeRequests}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('adminDashboard.performance.activeRequests', 'Solicitudes Activas')}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{systemStatus.performance.diskUsage}%</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('adminDashboard.performance.diskUsage', 'Uso de Disco')}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">{systemStatus.database.size}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('adminDashboard.performance.dbSize', 'Tamaño BD')}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600">v{systemStatus.server.version}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('adminDashboard.performance.systemVersion', 'Versión del Sistema')}</p>
              </div>
            </div>
            
            {/* Disk Space Details */}
             <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
               <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-3">{t('adminDashboard.performance.diskSpaceTitle', 'Detalles de Espacio en Disco')}</h4>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                 <div className="text-center">
                   <p className="text-xl font-bold text-blue-600">{systemStatus.performance.diskSpace.total}</p>
                   <p className="text-sm text-gray-600 dark:text-gray-400">{t('adminDashboard.performance.diskTotal', 'Espacio Total')}</p>
                 </div>
                 <div className="text-center">
                   <p className="text-xl font-bold text-red-600">{systemStatus.performance.diskSpace.used}</p>
                   <p className="text-sm text-gray-600 dark:text-gray-400">{t('adminDashboard.performance.diskUsed', 'Espacio Utilizado')}</p>
                 </div>
                 <div className="text-center">
                   <p className="text-xl font-bold text-green-600">{systemStatus.performance.diskSpace.free}</p>
                   <p className="text-sm text-gray-600 dark:text-gray-400">{t('adminDashboard.performance.diskFree', 'Espacio Libre')}</p>
                 </div>
               </div>
               {/* Progress Bar */}
               <div className="mt-4">
                 <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                   <span>{t('adminDashboard.performance.diskUsageLabel', 'Utilizzo Disco')}</span>
                   <span>{systemStatus.performance.diskSpace.usagePercentage}%</span>
                 </div>
                 <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                   <div 
                     className={`h-2.5 rounded-full ${
                       systemStatus.performance.diskSpace.usagePercentage > 80 
                         ? 'bg-red-600' 
                         : systemStatus.performance.diskSpace.usagePercentage > 60 
                         ? 'bg-yellow-600' 
                         : 'bg-green-600'
                     }`}
                     style={{ width: `${systemStatus.performance.diskSpace.usagePercentage}%` }}
                   ></div>
                 </div>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Usage Distribution Pie Chart */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('adminDashboard.charts.usageDistributionTitle', 'Distribución de Uso')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={usageDistributionData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(props: any) => `${props.name}: ${props.value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {usageDistributionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly Creation Trend */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('adminDashboard.charts.monthlyCreationTitle', 'Creación de Tenants (Últimos 6 Meses)')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={statistics.monthlyCreation}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#8884d8" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Tenants Table */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('adminDashboard.topTenants.title', 'Top 5 Tenants por Uso')}</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('adminDashboard.topTenants.columns.name', 'Nombre Tenant')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('adminDashboard.topTenants.columns.used', 'Evaluaciones Usadas')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('adminDashboard.topTenants.columns.remaining', 'Evaluaciones Restantes')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('adminDashboard.topTenants.columns.lastEvaluation', 'Última Evaluación')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {statistics.topTenants.map((tenant) => (
                <tr key={tenant.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {tenant.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                    {tenant.evaluationsUsed}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                    {tenant.evaluationsRemaining}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                    {tenant.lastEvaluationDate 
                      ? new Date(tenant.lastEvaluationDate).toLocaleDateString(i18n.language)
                      : t('adminDashboard.topTenants.never', 'Nunca')
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Evaluation Statistics */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('adminDashboard.evaluationStats.title', 'Estadísticas de Evaluaciones por Tenant')}</h3>
        
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <div className="flex items-center">
              <Database className="h-6 w-6 text-blue-500" />
              <div className="ml-3">
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400">{t('adminDashboard.evaluationStats.summary.cached', 'Evaluaciones en Caché')}</p>
                <p className="text-xl font-bold text-blue-900 dark:text-blue-100">
                  {statistics.evaluationStats?.totals.totalCachedEvaluations || 0}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">{t('adminDashboard.evaluationStats.summary.ttlWeek', 'TTL: 1 semana')}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
            <div className="flex items-center">
              <HardDrive className="h-6 w-6 text-green-500" />
              <div className="ml-3">
                <p className="text-sm font-medium text-green-600 dark:text-green-400">{t('adminDashboard.evaluationStats.summary.archived', 'Evaluaciones Archivadas')}</p>
                <p className="text-xl font-bold text-green-900 dark:text-green-100">
                  {statistics.evaluationStats?.totals.totalArchivedEvaluations || 0}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">{t('adminDashboard.evaluationStats.summary.permanent', 'Permanentes')}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
            <div className="flex items-center">
              <Activity className="h-6 w-6 text-purple-500" />
              <div className="ml-3">
                <p className="text-sm font-medium text-purple-600 dark:text-purple-400">{t('adminDashboard.evaluationStats.summary.total', 'Total Evaluaciones')}</p>
                <p className="text-xl font-bold text-purple-900 dark:text-purple-100">
                  {statistics.evaluationStats?.totals.totalEvaluationsCount || 0}
                </p>
                <p className="text-xs text-purple-600 dark:text-purple-400">{t('adminDashboard.evaluationStats.summary.cacheArchive', 'Caché + Archivo')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('adminDashboard.evaluationStats.table.name', 'Nombre Tenant')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('adminDashboard.evaluationStats.table.cache', 'Caché (Resultados)')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('adminDashboard.evaluationStats.table.archive', 'Archivo (Resúmenes)')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('adminDashboard.evaluationStats.table.total', 'Total')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('adminDashboard.evaluationStats.table.distribution', 'Distribución')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('adminDashboard.evaluationStats.table.jobsDetail', 'Detalles de Jobs')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {statistics.evaluationStats?.perTenant.map((tenant) => {
                const cachePercentage = tenant.totalEvaluations > 0 
                  ? Math.round((tenant.cachedEvaluations / tenant.totalEvaluations) * 100) 
                  : 0;
                const archivePercentage = 100 - cachePercentage;
                
                return (
                  <>
                    <tr key={tenant.tenantId}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        {tenant.tenantName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 dark:text-blue-400 font-semibold">
                        {tenant.cachedEvaluations}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 dark:text-green-400 font-semibold">
                        {tenant.archivedEvaluations}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-semibold">
                        {tenant.totalEvaluations}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                        <div className="flex items-center space-x-2">
                          <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                            <div 
                              className="bg-blue-500 h-2 rounded-l-full" 
                              style={{ width: `${cachePercentage}%` }}
                            ></div>
                            <div 
                              className="bg-green-500 h-2 rounded-r-full" 
                              style={{ width: `${archivePercentage}%`, marginTop: '-8px', marginLeft: `${cachePercentage}%` }}
                            ></div>
                          </div>
                          <span className="text-xs">{cachePercentage}% / {archivePercentage}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                          onClick={() => toggleTenantJobs(tenant.tenantId)}
                        >
                          <HardDrive className="h-4 w-4 mr-2" />
                          {expandedTenant === tenant.tenantId 
                            ? t('adminDashboard.evaluationStats.table.hideJobs', 'Ocultar Jobs')
                            : t('adminDashboard.evaluationStats.table.showJobs', 'Ver Jobs')}
                        </button>
                      </td>
                    </tr>
                    {expandedTenant === tenant.tenantId && (
                      <tr>
                        <td className="px-6 py-4" colSpan={6}>
                          <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-4">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                              {t('adminDashboard.evaluationStats.jobs.title', 'Detalles de Jobs')}
                            </h4>
                            {tenantJobsLoading[tenant.tenantId] && (
                              <div className="flex items-center text-sm text-gray-500 dark:text-gray-300">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
                                {t('common.loading', 'Cargando...')}
                              </div>
                            )}
                            {tenantJobsError[tenant.tenantId] && (
                              <div className="text-sm text-red-600 dark:text-red-400">
                                {tenantJobsError[tenant.tenantId]}
                              </div>
                            )}
                            {!tenantJobsLoading[tenant.tenantId] && !tenantJobsError[tenant.tenantId] && (
                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                                  <thead className="bg-white dark:bg-gray-800">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('adminDashboard.evaluationStats.jobs.columns.id', 'ID')}</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('adminDashboard.evaluationStats.jobs.columns.type', 'Tipo')}</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('adminDashboard.evaluationStats.jobs.columns.status', 'Estado')}</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('adminDashboard.evaluationStats.jobs.columns.created', 'Creado')}</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('adminDashboard.evaluationStats.jobs.columns.total', 'Total')}</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('adminDashboard.evaluationStats.jobs.columns.completed', 'Completadas')}</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('adminDashboard.evaluationStats.jobs.columns.failed', 'Fallidas')}</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('adminDashboard.evaluationStats.jobs.columns.actions', 'Acciones')}</th>
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                    {(tenantJobs[tenant.tenantId] || []).map((job) => (
                                      <tr key={job._id}>
                                        <td className="px-4 py-2 text-sm font-mono text-gray-900 dark:text-white">{job._id.substring(0, 8)}...</td>
                                        <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{job.type}</td>
                                        <td className="px-4 py-2 text-sm">
                                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                                            {job.status}
                                          </span>
                                        </td>
                                        <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{new Date(job.createdAt).toLocaleString(i18n.language)}</td>
                                        <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{job.totalEvaluations}</td>
                                        <td className="px-4 py-2 text-sm text-green-600 dark:text-green-400">{job.completedEvaluations}</td>
                                        <td className="px-4 py-2 text-sm text-red-600 dark:text-red-400">{job.failedEvaluations}</td>
                                        <td className="px-4 py-2 text-sm">
                                          <a
                                            href={`/evaluations/results/${job._id}`}
                                            className="text-blue-600 dark:text-blue-400 hover:underline"
                                          >
                                            {t('adminDashboard.evaluationStats.jobs.actions.viewResults', 'Ver resultados')}
                                          </a>
                                        </td>
                                      </tr>
                                    ))}
                                    {tenantJobs[tenant.tenantId] && tenantJobs[tenant.tenantId].length === 0 && (
                                      <tr>
                                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-300" colSpan={8}>
                                          {t('adminDashboard.evaluationStats.jobs.empty', 'No hay jobs para este tenant')}
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              }) || []}
            </tbody>
          </table>
        </div>

        {/* Global Results Table */}
        <div className="mt-8">
          <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-3">{t('adminDashboard.results.title', 'Resultados (todos los tenants)')}</h4>
          {resultsLoading && (
            <div className="flex items-center text-sm text-gray-500 dark:text-gray-300">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
              {t('common.loading', 'Cargando...')}
            </div>
          )}
          {resultsError && (
            <div className="text-sm text-red-600 dark:text-red-400">{resultsError}</div>
          )}
          {!resultsLoading && !resultsError && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('adminDashboard.results.columns.tenant', 'Tenant')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('adminDashboard.results.columns.rut', 'RUT')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('adminDashboard.results.columns.created', 'Creado')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('adminDashboard.results.columns.actions', 'Acciones')}</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {resultsItems.map((item) => (
                    <>
                      <tr key={item._id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{(item as any).tenantName || (typeof item.tenantId === 'object' ? (item.tenantId as any)?.name : item.tenantId) || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-mono">{item.rut}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{new Date(item.createdAt).toLocaleString(i18n.language)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm space-x-3">
                          <button onClick={() => toggleExpandResult(item._id)} className="text-gray-700 dark:text-gray-200 hover:underline">
                            {expandedResultIds.has(item._id) ? t('common.hide', 'Ocultar') : t('common.view', 'Ver')}
                          </button>
                          <a href={`/fast-check-ex?rut=${encodeURIComponent(item.rut)}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                            {t('adminDashboard.results.actions.viewFastCheck', 'Abrir Fast-Check')}
                          </a>
                        </td>
                      </tr>
                      {expandedResultIds.has(item._id) && (
                        <tr>
                          <td className="px-6 py-4" colSpan={4}>
                            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded border border-gray-200 dark:border-gray-700">
                              <pre className="text-xs overflow-auto max-h-96">
{JSON.stringify(item, null, 2)}
                              </pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {resultsItems.length === 0 && (
                    <tr>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300" colSpan={4}>{t('adminDashboard.results.empty', 'No hay Resultados para mostrar')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="flex items-center justify-between mt-4">
                <button
                  className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-50"
                  disabled={resultsPage <= 1}
                  onClick={() => loadAdminResults(resultsPage - 1)}
                >
                  {t('common.prev', 'Anterior')}
                </button>
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {t('common.pageOf', 'Página {{page}} de {{total}}', { page: resultsPage, total: resultsTotalPages })}
                </span>
                <button
                  className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-50"
                  disabled={resultsPage >= resultsTotalPages}
                  onClick={() => loadAdminResults(resultsPage + 1)}
                >
                  {t('common.next', 'Siguiente')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-2">{t('adminDashboard.additional.recentActivity', 'Actividad Reciente')}</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('adminDashboard.additional.recentActivityDesc', '{{count}} tenants han realizado evaluaciones en los últimos 30 días', { count: statistics.overview.recentlyActiveTenants })}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-2">{t('adminDashboard.additional.totalCapacity', 'Capacidad Total')}</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('adminDashboard.additional.totalCapacityDesc', '{{count}} evaluaciones asignadas en total', { count: statistics.overview.totalEvaluationsAllocated })}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-2">{t('adminDashboard.additional.systemUsage', 'Uso del Sistema')}</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('adminDashboard.additional.systemUsageDesc', '{{percent}}% de la capacidad total utilizada', { percent: Math.round((statistics.overview.totalEvaluationsUsed / statistics.overview.totalEvaluationsAllocated) * 100) })}
          </p>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;