import React, { useState, useEffect } from 'react';
import { Plus, Play, Pause, Trash2, Edit, Clock, AlertCircle, CheckCircle, XCircle, Search, Eye } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { getSheriffDataLogs, getResults } from '../services/api';
import { SheriffDataLogResponse } from '../types/sheriff';
import MonitoringDetailModal from '../components/modals/MonitoringDetailModal';
import toast from 'react-hot-toast';
import { logger } from '../utils/logger';
import { useTranslation } from 'react-i18next';

interface MonitoringSchedule {
  _id: string;
  rut: string;
  companyName?: string;
  frequency: 'minute' | 'daily' | 'weekly' | 'monthly';
  isActive: boolean;
  lastExecuted?: string;
  nextExecution: string;
  executionCount: number;
  lastExecutionStatus?: 'success' | 'error' | 'pending';
  lastExecutionError?: string;
  createdAt: string;
  updatedAt: string;
  tenantId?: {
    _id: string;
    name: string;
  };
}

interface CreateScheduleData {
  rut: string;
  companyName?: string;
  frequency: 'minute' | 'daily' | 'weekly' | 'monthly';
}

const MonitoringPage: React.FC = () => {
  const { token, user } = useAuth();
  const { tenant } = useTenant();
  const { t, i18n } = useTranslation();
  const [schedules, setSchedules] = useState<MonitoringSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<MonitoringSchedule | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedScheduleForDetails, setSelectedScheduleForDetails] = useState<MonitoringSchedule | null>(null);

  const [createData, setCreateData] = useState<CreateScheduleData>({
    rut: '',
    companyName: '',
    frequency: 'weekly'
  });
  
  // State for existing RUTs selection
  const [existingRuts, setExistingRuts] = useState<SheriffDataLogResponse[]>([]);
  const [loadingRuts, setLoadingRuts] = useState(false);
  const [rutSearchTerm, setRutSearchTerm] = useState('');
  const [showRutDropdown, setShowRutDropdown] = useState(false);

  // State for filtering schedules
  const [showInactiveSchedules, setShowInactiveSchedules] = useState(false);

  const API_BASE = '/api/monitoring';
  const isSuperuser = user?.role === 'superuser';

  const openDetailModal = (schedule: MonitoringSchedule) => {
    setSelectedScheduleForDetails(schedule);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedScheduleForDetails(null);
  };

  // Fetch existing RUTs from sheriff logs
  const extractCompanyName = (log: SheriffDataLogResponse): string => {
    try {
      const summary = (log as any)?.summaryData?.data;
      if (summary?.sii?.razonSocial && typeof summary.sii.razonSocial === 'string') {
        return summary.sii.razonSocial;
      }
      if (summary?.compliance?.name && typeof summary.compliance.name === 'string') {
        return summary.compliance.name;
      }
      const sii = (log as any)?.siiData;
      if (sii?.['Razon Social'] && typeof sii['Razon Social'] === 'string') {
        return sii['Razon Social'];
      }
      if (sii?.razonSocial && typeof sii.razonSocial === 'string') {
        return sii.razonSocial;
      }
      return '';
    } catch {
      return '';
    }
  };

  const fetchExistingRuts = async () => {
    try {
      setLoadingRuts(true);

      // 1) Fetch all sheriff logs (paginate across all pages)
      const firstPage = await getSheriffDataLogs(1, 100);
      let allLogs: SheriffDataLogResponse[] = firstPage.logs || [];
      const totalPages = firstPage.pages || 1;
      for (let p = 2; p <= totalPages; p++) {
        const res = await getSheriffDataLogs(p, 100);
        allLogs = allLogs.concat(res.logs || []);
      }

      // 2) Fetch Consultas results and adapt to SheriffDataLogResponse-lite
      let consultaLogs: SheriffDataLogResponse[] = [];
      try {
        const consultas: any[] = await getResults();
        consultaLogs = (consultas || [])
          .map((r: any, idx: number) => {
            const rut = r?.details?.rut || '';
            const razonSocial = r?.details?.razonSocial || '';
            const createdAt = r?.createdAt || new Date().toISOString();
            const updatedAt = r?.updatedAt || createdAt;
            const id = r?._id || `${rut || 'rut'}-${createdAt}-${idx}`;

            const adapted: SheriffDataLogResponse = {
              _id: id,
              rut,
              isMonitoringRequest: false,
              fetchedAt: createdAt,
              summaryData: undefined,
              civilCasesData: undefined,
              laboralCasesData: undefined,
              cobranzaCasesData: undefined,
              moraPrevisionalCasesData: undefined,
              multaLaboralCasesData: undefined,
              mallaSocietariaData: undefined,
              officialDiaryData: undefined,
              commercialBulletinCasesData: undefined,
              siiData: { razonSocial },
              creditScoringData: undefined,
              allCallsSucceeded: true,
              apiCallErrors: [],
              createdAt,
              updatedAt,
              duxiterMD: r?.riskAssessment?.summaryDocumentMD || r?.duxiterMD || '',
              duxiterRiskData: undefined,
              associatedPdfs: []
            } as SheriffDataLogResponse;
            return adapted;
          })
          // Keep only items with a valid rut
          .filter((l: SheriffDataLogResponse) => !!(l.rut && l.rut.trim().length > 0));
      } catch (e) {
        logger.warn('fetchExistingRuts: falló la carga de Consultas, se continúa solo con logs', e);
      }

      // 3) Combine and dedupe by RUT (Consultas + Sheriff Logs)
      const combined = [...allLogs, ...consultaLogs];
      const uniqueByRut = Array.from(new Map(combined.map(l => [l.rut, l])).values());

      setExistingRuts(uniqueByRut);
    } catch (error) {
      logger.error('Error fetching existing RUTs:', error);
      toast.error('Error al cargar los RUTs existentes');
    } finally {
      setLoadingRuts(false);
    }
  };

  const fetchSchedules = async (page = 1) => {
    const activeFilter = showInactiveSchedules ? '' : '&activeOnly=true';
    const endpoint = isSuperuser ? `${API_BASE}/all?page=${page}&limit=10${activeFilter}` : `${API_BASE}?page=${page}&limit=10${activeFilter}`;
    
    try {
      setLoading(true);
      
      // Debug logging
      logger.log('[MonitoringPage] fetchSchedules - Starting request:', {
        page,
        isSuperuser,
        endpoint,
        userRole: user?.role,
        userId: user?.id,
        tenantId: tenant?.id,
        hasToken: !!token
      });
      
      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      logger.log('[MonitoringPage] fetchSchedules - Response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('[MonitoringPage] fetchSchedules - Response not OK:', {
          status: response.status,
          statusText: response.statusText,
          errorText
        });
        throw new Error(`Failed to fetch monitoring schedules: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      logger.log('[MonitoringPage] fetchSchedules - Data received:', {
        schedulesCount: data.schedules?.length || 0,
        total: data.total,
        pages: data.pages,
        currentPage: data.currentPage,
        schedules: data.schedules
      });
      
      setSchedules(data.schedules);
      setTotalPages(data.pages);
      setTotal(data.total);
      setCurrentPage(data.currentPage);
    } catch (error) {
      logger.error('[MonitoringPage] fetchSchedules - Error:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        endpoint,
        page,
        isSuperuser
      });
      toast.error(t('monitoring.errors.loadSchedules'));
    } finally {
      setLoading(false);
    }
  };

  const createSchedule = async () => {
    try {
      logger.log('[MonitoringPage] createSchedule - Starting request:', {
        createData,
        userRole: user?.role,
        userId: user?.id,
        tenantId: tenant?.id,
        hasToken: !!token,
        endpoint: API_BASE
      });
      
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(createData)
      });

      logger.log('[MonitoringPage] createSchedule - Response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error('[MonitoringPage] createSchedule - Response not OK:', {
          status: response.status,
          statusText: response.statusText,
          error
        });
        throw new Error(error.message || 'Failed to create monitoring schedule');
      }

      const newSchedule = await response.json();
      logger.log('[MonitoringPage] createSchedule - Schedule created:', {
        newSchedule,
        scheduleId: newSchedule._id,
        companyName: newSchedule.companyName
      });

      toast.success(t('monitoring.messages.createdSuccess'));
      setShowCreateModal(false);
      setCreateData({ rut: '', companyName: '', frequency: 'weekly' });
      setRutSearchTerm('');
      setShowRutDropdown(false);
      setExistingRuts([]);
      fetchSchedules(currentPage);
    } catch (error) {
      logger.error('[MonitoringPage] createSchedule - Error:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        createData,
        endpoint: API_BASE
      });
      toast.error(error instanceof Error ? error.message : t('monitoring.errors.createSchedule'));
    }
  };

  const updateSchedule = async (id: string, updates: Partial<MonitoringSchedule>) => {
    try {
      const response = await fetch(`${API_BASE}/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error('Failed to update monitoring schedule');
      }

      toast.success(t('monitoring.messages.updatedSuccess'));
      setEditingSchedule(null);
      fetchSchedules(currentPage);
    } catch (error) {
      logger.error('Error updating schedule:', error);
      toast.error(t('monitoring.errors.updateSchedule'));
    }
  };

  const deleteSchedule = async (id: string) => {
    if (!confirm(t('monitoring.confirm.delete'))) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete monitoring schedule');
      }

      toast.success(t('monitoring.messages.deletedSuccess'));
      fetchSchedules(currentPage);
    } catch (error) {
      logger.error('Error deleting schedule:', error);
      toast.error(t('monitoring.errors.deleteSchedule'));
    }
  };

  const triggerExecution = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/${id}/execute`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to trigger monitoring execution');
      }

      toast.success(t('monitoring.messages.executionStarted'));
      fetchSchedules(currentPage);
    } catch (error) {
      logger.error('Error triggering execution:', error);
      toast.error(error instanceof Error ? error.message : t('monitoring.errors.executeMonitoring'));
    }
  };

  // Handle RUT selection from dropdown
  const handleRutSelection = (selectedLog: SheriffDataLogResponse) => {
    setCreateData({
      ...createData,
      rut: selectedLog.rut,
      companyName: ''
    });
    setRutSearchTerm('');
    setShowRutDropdown(false);
  };

  // Filter existing RUTs based on search term
  const filteredRuts = existingRuts.filter(log => {
    const term = rutSearchTerm.toLowerCase();
    const name = extractCompanyName(log).toLowerCase();
    // include search by duxiterMD fallback for consultas
    const md = (log.duxiterMD || '').toLowerCase();
    return log.rut.toLowerCase().includes(term) || name.includes(term) || md.includes(term);
  });

  // Handle opening create modal
  const handleOpenCreateModal = () => {
    setShowCreateModal(true);
    fetchExistingRuts();
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getFrequencyText = (frequency: string) => {
    switch (frequency) {
      case 'minute': return t('monitoring.create.minute');
      case 'daily': return t('monitoring.create.daily');
      case 'weekly': return t('monitoring.create.weekly');
      case 'monthly': return t('monitoring.create.monthly');
      default: return frequency;
    }
  };

  const formatDate = (dateString: string) => {
    const lang = i18n.resolvedLanguage || i18n.language || 'es';
    const localeMap: Record<string, string> = {
      en: 'en-US',
      es: 'es-CL',
      pt: 'pt-BR',
      fr: 'fr-FR'
    };
    const locale = localeMap[lang] || 'es-CL';
    return new Date(dateString).toLocaleString(locale);
  };

  useEffect(() => {
    if (token && tenant) {
      fetchSchedules();
    }
  }, [token, tenant, showInactiveSchedules]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.rut-dropdown-container')) {
        setShowRutDropdown(false);
      }
    };

    if (showRutDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showRutDropdown]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('monitoring.title')}</h1>
          <p className="text-gray-600">{t('monitoring.subtitle')}</p>
          {isSuperuser && (
            <p className="text-sm text-blue-600 mt-1">
              {t('monitoring.superuserNote')}
            </p>
          )}
        </div>
        <button
          onClick={handleOpenCreateModal}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {t('monitoring.newButton')}
        </button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-blue-600">{total}</div>
          <div className="text-sm text-gray-600">{t('monitoring.stats.total')}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-green-600">
            {schedules.filter(s => s.isActive).length}
          </div>
          <div className="text-sm text-gray-600">{t('monitoring.stats.active')}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-yellow-600">
            {schedules.filter(s => s.lastExecutionStatus === 'pending').length}
          </div>
          <div className="text-sm text-gray-600">{t('monitoring.stats.running')}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold text-red-600">
            {schedules.filter(s => s.lastExecutionStatus === 'error').length}
          </div>
          <div className="text-sm text-gray-600">{t('monitoring.stats.errors')}</div>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="mb-4 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={showInactiveSchedules}
              onChange={(e) => setShowInactiveSchedules(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="ml-2 text-sm text-gray-700">
              {t('monitoring.filters.showInactive')}
            </span>
          </label>
        </div>
        <div className="text-sm text-gray-500">
          {showInactiveSchedules
            ? t('monitoring.summary.activeInactive', { count: schedules.length, total })
            : t('monitoring.summary.activeOnly', { count: schedules.length, total })
          }
        </div>
      </div>

      {/* Schedules Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('monitoring.headers.rutEmpresa')}
                </th>
                {isSuperuser && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('monitoring.headers.tenant')}
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('monitoring.headers.frecuencia')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('monitoring.headers.estado')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('monitoring.headers.ultimaEjecucion')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('monitoring.headers.proximaEjecucion')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('monitoring.headers.ejecuciones')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('monitoring.headers.acciones')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {schedules.length === 0 ? (
                <tr>
                  <td colSpan={isSuperuser ? 8 : 7} className="px-6 py-12 text-center">
                    <div className="text-gray-500">
                      <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        {t('monitoring.empty.title')}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {isSuperuser 
                          ? t('monitoring.empty.superuserDescription') 
                          : t('monitoring.empty.userDescription')}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                schedules.map((schedule) => (
                  <tr key={schedule._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{schedule.rut}</div>
                        {schedule.companyName && (
                          <div className="text-sm text-gray-500">{schedule.companyName}</div>
                        )}
                      </div>
                    </td>
                    {isSuperuser && (
                      <td className="px-6 py-4 whitespace-nowrap">
                         <div className="text-sm text-gray-900">
                           {schedule.tenantId?.name || 'N/A'}
                         </div>
                       </td>
                     )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {getFrequencyText(schedule.frequency)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(schedule.lastExecutionStatus)}
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          schedule.isActive 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {schedule.isActive ? t('monitoring.status.active') : t('monitoring.status.inactive')}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {schedule.lastExecuted ? formatDate(schedule.lastExecuted) : t('monitoring.lastExecuted.never')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(schedule.nextExecution)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {schedule.executionCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openDetailModal(schedule)}
                            className="text-indigo-600 hover:text-indigo-900"
                            title={t('monitoring.actions.viewDetails')}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => triggerExecution(schedule._id)}
                            className="text-blue-600 hover:text-blue-900"
                            title={t('monitoring.actions.executeNow')}
                          >
                            <Play className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingSchedule(schedule)}
                            className="text-yellow-600 hover:text-yellow-900"
                            title={t('monitoring.actions.edit')}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => updateSchedule(schedule._id, { isActive: !schedule.isActive })}
                            className={`${schedule.isActive ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'}`}
                            title={schedule.isActive ? t('monitoring.actions.pause') : t('monitoring.actions.activate')}
                          >
                            {schedule.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => deleteSchedule(schedule._id)}
                            className="text-red-600 hover:text-red-900"
                            title={t('monitoring.actions.delete')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => fetchSchedules(currentPage - 1)}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                {t('common.previous')}
              </button>
              <button
                onClick={() => fetchSchedules(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                {t('common.next')}
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  {t('alerting.pagination.info', { start: (currentPage - 1) * 10 + 1, end: Math.min(currentPage * 10, total), total })}
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => fetchSchedules(page)}
                      className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                        page === currentPage
                          ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                          : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">{t('monitoring.create.title')}</h3>
              <div className="space-y-4">
                <div className="relative rut-dropdown-container">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('monitoring.create.rutSelectHint')}</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={rutSearchTerm || createData.rut}
                      onChange={(e) => {
                        setRutSearchTerm(e.target.value);
                        setShowRutDropdown(true);
                        if (!e.target.value) {
                          setCreateData({ ...createData, rut: '', companyName: '' });
                        }
                      }}
                      onFocus={() => setShowRutDropdown(true)}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={t('monitoring.create.searchPlaceholder')}
                    />
                    <Search className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
                  </div>
                  
                  {/* Dropdown with existing RUTs */}
                  {showRutDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {loadingRuts ? (
                        <div className="p-3 text-center text-gray-500">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mx-auto"></div>
                          <span className="ml-2">{t('common.loading')}</span>
                        </div>
                      ) : filteredRuts.length > 0 ? (
                        <>
                          <div className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200 px-3 py-2 text-xs text-gray-600 flex items-center justify-between">
                            <span>{t('monitoring.create.loadedTotal', { count: existingRuts.length })}</span>
                            <span>{t('monitoring.create.filteredCount', { count: filteredRuts.length })}</span>
                          </div>
                          {filteredRuts.map((log) => (
                            <div
                              key={log._id}
                              onClick={() => handleRutSelection(log)}
                              className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                            >
                              <div className="font-medium text-gray-900">{log.rut}</div>
                              {extractCompanyName(log) && (
                                <div className="text-sm text-gray-600">{extractCompanyName(log)}</div>
                              )}
                              <div className="text-xs text-gray-400">
                                {t('monitoring.create.lastQuery', { date: new Date(log.fetchedAt).toLocaleDateString((() => { const lang = i18n.resolvedLanguage || i18n.language || 'es'; const map: Record<string, string> = { en: 'en-US', es: 'es-CL', pt: 'pt-BR', fr: 'fr-FR' }; return map[lang] || 'es-CL'; })()) })}
                              </div>
                            </div>
                          ))}
                        </>
                      ) : (
                        <div className="p-3 text-center text-gray-500">
                          {t('monitoring.create.noResults')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('monitoring.create.companyLabel')}</label>
                  <input
                    type="text"
                    value={createData.companyName}
                    onChange={(e) => setCreateData({ ...createData, companyName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={t('monitoring.create.companyPlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('monitoring.create.frequencyLabel')}</label>
                  <select
                    value={createData.frequency}
                    onChange={(e) => setCreateData({ ...createData, frequency: e.target.value as 'minute' | 'daily' | 'weekly' | 'monthly' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="minute">{t('monitoring.create.minute')}</option>
                    <option value="daily">{t('monitoring.create.daily')}</option>
                    <option value="weekly">{t('monitoring.create.weekly')}</option>
                    <option value="monthly">{t('monitoring.create.monthly')}</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateData({ rut: '', companyName: '', frequency: 'weekly' });
                    setRutSearchTerm('');
                    setShowRutDropdown(false);
                    setExistingRuts([]);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={createSchedule}
                  disabled={!createData.rut}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                >
                  {t('common.create')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingSchedule && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">{t('monitoring.edit.title')}</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">RUT</label>
                  <input
                    type="text"
                    value={editingSchedule.rut}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('monitoring.edit.companyLabel')}</label>
                  <input
                    type="text"
                    value={editingSchedule.companyName || ''}
                    onChange={(e) => setEditingSchedule({ ...editingSchedule, companyName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={t('monitoring.edit.companyPlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('monitoring.create.frequencyLabel')}</label>
                  <select
                    value={editingSchedule.frequency}
                    onChange={(e) => setEditingSchedule({ ...editingSchedule, frequency: e.target.value as 'minute' | 'daily' | 'weekly' | 'monthly' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="minute">{t('monitoring.create.minute')}</option>
                    <option value="daily">{t('monitoring.create.daily')}</option>
                    <option value="weekly">{t('monitoring.create.weekly')}</option>
                    <option value="monthly">{t('monitoring.create.monthly')}</option>
                  </select>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={editingSchedule.isActive}
                    onChange={(e) => setEditingSchedule({ ...editingSchedule, isActive: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
                    {t('monitoring.status.active')}
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setEditingSchedule(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => updateSchedule(editingSchedule._id, {
                    frequency: editingSchedule.frequency,
                    isActive: editingSchedule.isActive,
                    companyName: editingSchedule.companyName
                  })}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                >
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Monitoring Detail Modal */}
      {showDetailModal && selectedScheduleForDetails && (
        <MonitoringDetailModal
          isOpen={showDetailModal}
          onClose={closeDetailModal}
          schedule={selectedScheduleForDetails}
        />
      )}
    </div>
  );
};

export default MonitoringPage;