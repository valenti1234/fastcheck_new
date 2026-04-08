import React, { useState, useMemo } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Loader2, 
  Eye, 
  Download, 
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trash2,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import logger from '../../utils/logger';

interface EvaluationResult {
  rut: string;
  name?: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  data?: any;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  processingTime?: number;
  progress?: number;
  jobId?: string;
}

interface EvaluationStatusTableProps {
  results: EvaluationResult[];
  isLoading?: boolean;
  onRefresh?: () => void;
  onDeleteEvaluation?: (jobId: string) => Promise<void>;
  onDeleteBulkEvaluations?: (jobIds: string[]) => Promise<void>;
  showDeleteActions?: boolean;
  onSelectionChange?: (ruts: string[]) => void;          // ✅ AGREGADO
  onRetryEvaluations?: (ruts: string[]) => Promise<void>; // ✅ AGREGADO
}

type SortField = 'rut' | 'name' | 'status' | 'startedAt' | 'completedAt' | 'processingTime';
type SortDirection = 'asc' | 'desc';
type StatusFilter = 'all' | 'pending' | 'processing' | 'success' | 'error';

const EvaluationStatusTable: React.FC<EvaluationStatusTableProps> = ({
  results,
  isLoading = false,
  onRefresh,
  onDeleteEvaluation,
  onDeleteBulkEvaluations,
  showDeleteActions = false,
  onSelectionChange,      // ✅ AGREGADO
  onRetryEvaluations,     // ✅ AGREGADO
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [sortField, setSortField] = useState<SortField>('startedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedRuts, setSelectedRuts] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false); // ✅ AGREGADO

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 text-gray-400" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 text-blue-500" />
      : <ArrowDown className="h-4 w-4 text-blue-500" />;
  };

  // ✅ CORREGIDO: notifica al padre en cada cambio de selección
  const handleSelectJob = (rut: string) => {
    const newSelected = new Set(selectedRuts);
    if (newSelected.has(rut)) {
      newSelected.delete(rut);
    } else {
      newSelected.add(rut);
    }
    setSelectedRuts(newSelected);
    onSelectionChange?.(Array.from(newSelected)); // ✅ notifica al padre
  };

  // ✅ CORREGIDO: notifica al padre en cada cambio de selección
  const handleSelectAll = () => {
    const selectableRuts = filteredAndSortedResults.map(result => result.rut);
    
    const selectedSelectableRuts = selectableRuts.filter(rut => selectedRuts.has(rut));
    
    let newSelected: Set<string>;
    if (selectedSelectableRuts.length === selectableRuts.length) {
      newSelected = new Set(selectedRuts);
      selectableRuts.forEach(rut => newSelected.delete(rut));
    } else {
      newSelected = new Set(selectedRuts);
      selectableRuts.forEach(rut => newSelected.add(rut));
    }

    setSelectedRuts(newSelected);
    onSelectionChange?.(Array.from(newSelected)); // ✅ notifica al padre
  };

  const handleDeleteSingle = async (jobId: string) => {
    if (!onDeleteEvaluation) return;
    
    setIsDeleting(true);
    try {
      await onDeleteEvaluation(jobId);
      setShowDeleteConfirm(null);
      if (onRefresh) onRefresh();
    } catch (error) {
      logger.error('Error durante la eliminación:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteBulk = async () => {
    if (!onDeleteBulkEvaluations || selectedRuts.size === 0) return;
    
    const selectedJobIds = filteredAndSortedResults
      .filter(result => result.jobId && selectedRuts.has(result.rut))
      .map(result => result.jobId!);
    
    setIsDeleting(true);
    try {
      await onDeleteBulkEvaluations(selectedJobIds);
      const newSelected = new Set<string>();
      setSelectedRuts(newSelected);
      onSelectionChange?.([]); // ✅ notifica al padre
      setShowBulkDeleteConfirm(false);
      if (onRefresh) onRefresh();
    } catch (error) {
      logger.error('Error durante la eliminación masiva:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  // ✅ NUEVO: handler para reevaluar los seleccionados
  const handleRetrySelected = async () => {
    if (!onRetryEvaluations || selectedRuts.size === 0) return;

    setIsRetrying(true);
    try {
      await onRetryEvaluations(Array.from(selectedRuts));
      const newSelected = new Set<string>();
      setSelectedRuts(newSelected);
      onSelectionChange?.([]); // ✅ limpia selección tras reintentar
    } catch (error) {
      logger.error('Error al reevaluar:', error);
    } finally {
      setIsRetrying(false);
    }
  };

  // ✅ NUEVO: handler para reevaluar una sola fila
  const handleRetrySingle = async (rut: string) => {
    if (!onRetryEvaluations) return;

    setIsRetrying(true);
    try {
      await onRetryEvaluations([rut]);
    } catch (error) {
      logger.error('Error al reevaluar RUT:', rut, error);
    } finally {
      setIsRetrying(false);
    }
  };

  const filteredAndSortedResults = useMemo(() => {
    let filtered = results;
    
    if (statusFilter !== 'all') {
      filtered = results.filter(result => result.status === statusFilter);
    }

    return [...filtered].sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];

      if (sortField === 'startedAt' || sortField === 'completedAt') {
        aValue = aValue ? new Date(aValue).getTime() : 0;
        bValue = bValue ? new Date(bValue).getTime() : 0;
      } else if (sortField === 'processingTime') {
        aValue = aValue || 0;
        bValue = bValue || 0;
      } else if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue?.toLowerCase() || '';
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [results, sortField, sortDirection, statusFilter]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'processing':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'pending':
      default:
        return <Clock className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'success':
        return t('evaluationStatus.statusTexts.success');
      case 'error':
        return t('evaluationStatus.statusTexts.error');
      case 'processing':
        return t('evaluationStatus.statusTexts.processing');
      case 'pending':
      default:
        return t('evaluationStatus.statusTexts.pending');
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'processing':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'pending':
      default:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    }
  };

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return '-';
    const localeMap: Record<string, string> = {
      es: 'es-CL',
      en: 'en-US',
      pt: 'pt-PT',
      fr: 'fr-FR',
    };
    const locale = localeMap[i18n.language] || 'es-CL';
    return new Date(timestamp).toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const exportToExcel = () => {
    const exportData = filteredAndSortedResults.map(result => ({
      [t('evaluationStatus.export.columns.rut')]: result.rut,
      [t('evaluationStatus.export.columns.name')]: result.name || '-',
      [t('evaluationStatus.export.columns.status')]: getStatusText(result.status),
      [t('evaluationStatus.export.columns.startedAt')]: formatTime(result.startedAt),
      [t('evaluationStatus.export.columns.completedAt')]: formatTime(result.completedAt),
      [t('evaluationStatus.export.columns.progress')]: result.progress || 0,
      [t('evaluationStatus.export.columns.error')]: result.error || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t('evaluationStatus.export.sheetName'));
    
    const fileName = `${t('evaluationStatus.export.fileNamePrefix')}${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const getStatusCounts = () => {
    return {
      total: results.length,
      pending: results.filter(r => r.status === 'pending').length,
      processing: results.filter(r => r.status === 'processing').length,
      success: results.filter(r => r.status === 'success').length,
      error: results.filter(r => r.status === 'error').length
    };
  };

  const statusCounts = getStatusCounts();

  if (results.length === 0) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">
              {t('evaluationStatus.header.title')}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('evaluationStatus.header.subtitle')}
            </p>
          </div>
          <div className="flex items-center space-x-3">

            {/* Botón reevaluar — aparece cuando hay seleccionados y existe el handler */}
            {onRetryEvaluations && selectedRuts.size > 0 && (
              <button
                onClick={handleRetrySelected}
                disabled={isRetrying || isDeleting}
                className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-50"
              >
                {isRetrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span>{isRetrying ? 'Reevaluando...' : `Reevaluar (${selectedRuts.size})`}</span>
              </button>
            )}

            {/* Botón eliminar seleccionados */}
            {showDeleteActions && selectedRuts.size > 0 && (
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                disabled={isDeleting || isRetrying}
                className="px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 flex items-center space-x-2 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                <span>{t('evaluationStatus.actions.deleteSelected', { count: selectedRuts.size })}</span>
              </button>
            )}

            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t('evaluationStatus.actions.refresh')
                )}
              </button>
            )}

            <button
              onClick={exportToExcel}
              className="px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 flex items-center space-x-2"
            >
              <Download className="h-4 w-4" />
              <span>{t('evaluationStatus.actions.export')}</span>
            </button>
          </div>
        </div>

        {/* Status Summary */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{statusCounts.total}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('evaluationStatus.summary.total')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{statusCounts.pending}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('evaluationStatus.summary.pending')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{statusCounts.processing}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('evaluationStatus.summary.processing')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{statusCounts.success}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('evaluationStatus.summary.success')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{statusCounts.error}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{t('evaluationStatus.summary.error')}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <span className="text-sm text-gray-700 dark:text-gray-300">{t('evaluationStatus.filter.label')}</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="all">{t('evaluationStatus.filter.all')}</option>
            <option value="pending">{t('evaluationStatus.filter.pending')}</option>
            <option value="processing">{t('evaluationStatus.filter.processing')}</option>
            <option value="success">{t('evaluationStatus.filter.success')}</option>
            <option value="error">{t('evaluationStatus.filter.error')}</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              {showDeleteActions && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={(() => {
                      const selectableRuts = filteredAndSortedResults.filter(r => r.jobId);
                      const selectedSelectableRuts = selectableRuts.filter(r => selectedRuts.has(r.rut));
                      return selectableRuts.length > 0 && selectedSelectableRuts.length === selectableRuts.length;
                    })()}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    title={t('evaluationStatus.table.selectAllTitle')}
                  />
                </th>
              )}
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                onClick={() => handleSort('rut')}
              >
                <div className="flex items-center space-x-1">
                  <span>{t('evaluationStatus.table.rut')}</span>
                  {getSortIcon('rut')}
                </div>
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center space-x-1">
                  <span>{t('evaluationStatus.table.name')}</span>
                  {getSortIcon('name')}
                </div>
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center space-x-1">
                  <span>{t('evaluationStatus.table.status')}</span>
                  {getSortIcon('status')}
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                {t('evaluationStatus.table.progress')}
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                onClick={() => handleSort('startedAt')}
              >
                <div className="flex items-center space-x-1">
                  <span>{t('evaluationStatus.table.started')}</span>
                  {getSortIcon('startedAt')}
                </div>
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                onClick={() => handleSort('completedAt')}
              >
                <div className="flex items-center space-x-1">
                  <span>{t('evaluationStatus.table.completed')}</span>
                  {getSortIcon('completedAt')}
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                {t('evaluationStatus.table.actions')}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {filteredAndSortedResults.map((result, index) => (
              <tr key={`${result.rut}-${index}`} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                {showDeleteActions && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedRuts.has(result.rut)}
                      onChange={() => handleSelectJob(result.rut)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                )}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-mono text-gray-900 dark:text-white">
                    {result.rut}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900 dark:text-white">
                    {result.name || '-'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(result.status)}
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(result.status)}`}>
                      {getStatusText(result.status)}
                    </span>
                  </div>
                  {result.error && (
                    <div className="text-xs text-red-600 dark:text-red-400 mt-1 max-w-xs truncate" title={result.error}>
                      {result.error}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${result.progress || 0}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {result.progress || 0}%
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {formatTime(result.startedAt)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {formatTime(result.completedAt)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex items-center space-x-2">

                    {/* Ver detalle — solo si éxito */}
                    {result.status === 'success' && result.rut && (
                      <button
                        onClick={() => navigate(`/fast-check-ex?rut=${result.rut}`)}
                        className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 flex items-center space-x-1"
                      >
                        <Eye className="h-4 w-4" />
                        <span>{t('evaluationStatus.row.viewDetail')}</span>
                      </button>
                    )}



                    {/* Cancelar — solo si pending o processing */}
                    {showDeleteActions && result.jobId && (result.status === 'pending' || result.status === 'processing') && (
                      <button
                        onClick={() => setShowDeleteConfirm(result.jobId!)}
                        disabled={isDeleting}
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 flex items-center space-x-1 disabled:opacity-50"
                        title={t('evaluationStatus.row.cancelTitle')}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>{t('evaluationStatus.row.cancel')}</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredAndSortedResults.length === 0 && (
        <div className="text-center py-8">
          <div className="text-gray-500 dark:text-gray-400">
            {t('evaluationStatus.empty.message')}
          </div>
        </div>
      )}

      {/* Modal: confirmar eliminación individual */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center space-x-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-red-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('evaluationStatus.modal.single.title')}
              </h3>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              {t('evaluationStatus.modal.single.message')}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                {t('evaluationStatus.modal.single.cancel')}
              </button>
              <button
                onClick={() => handleDeleteSingle(showDeleteConfirm)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center space-x-2"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t('evaluationStatus.modal.single.confirming')}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    <span>{t('evaluationStatus.modal.single.confirm')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmar eliminación masiva */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center space-x-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-red-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('evaluationStatus.modal.bulk.title')}
              </h3>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              {t('evaluationStatus.modal.bulk.message', { count: selectedRuts.size })}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                {t('evaluationStatus.modal.bulk.cancel')}
              </button>
              <button
                onClick={handleDeleteBulk}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center space-x-2"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t('evaluationStatus.modal.bulk.confirming')}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    <span>{t('evaluationStatus.modal.bulk.confirm', { count: selectedRuts.size })}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EvaluationStatusTable;