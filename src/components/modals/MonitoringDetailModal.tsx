import React, { useState, useEffect } from 'react';
import { Dialog } from '@headlessui/react';
import { XMarkIcon, ClockIcon, CheckCircleIcon, XCircleIcon, PlayIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import { MonitoringExecution, MonitoringExecutionsResponse } from '../../services/monitoringService';
import monitoringService from '../../services/monitoringService';
import toast from 'react-hot-toast';

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

interface MonitoringDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: MonitoringSchedule;
}

const MonitoringDetailModal: React.FC<MonitoringDetailModalProps> = ({
  isOpen,
  onClose,
  schedule
}) => {
  const [executions, setExecutions] = useState<MonitoringExecution[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState<MonitoringExecution | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (isOpen && schedule?._id) {
      fetchExecutions();
    }
  }, [isOpen, schedule?._id, currentPage]);

  const fetchExecutions = async () => {
    try {
      setLoading(true);
      const response: MonitoringExecutionsResponse = await monitoringService.getMonitoringExecutions(
        schedule._id,
        currentPage,
        20
      );
      setExecutions(response.executions);
      setTotalPages(response.pages);
      setTotal(response.total);
    } catch (error) {
      logger.error('Error fetching executions:', error);
      toast.error('Error al cargar el historial de ejecuciones');
    } finally {
      setLoading(false);
    }
  };

  const fetchExecutionDetails = async (executionId: string) => {
    try {
      const execution = await monitoringService.getMonitoringExecution(executionId);
      setSelectedExecution(execution);
    } catch (error) {
      logger.error('Error fetching execution details:', error);
      toast.error('Error al cargar los detalles de la ejecución');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircleIcon className="w-5 h-5 text-red-500" />;
      case 'running':
        return <PlayIcon className="w-5 h-5 text-blue-500" />;
      case 'pending':
        return <ClockIcon className="w-5 h-5 text-yellow-500" />;
      default:
        return <ClockIcon className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'success':
        return 'Exitoso';
      case 'error':
        return 'Error';
      case 'running':
        return 'Ejecutando';
      case 'pending':
        return 'Pendiente';
      default:
        return 'Desconocido';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-CL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDuration = (duration?: number) => {
    if (!duration) return 'N/A';
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(2)}s`;
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-w-6xl w-full bg-white rounded-lg shadow-xl max-h-[90vh] overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <Dialog.Title className="text-lg font-medium text-gray-900">
                Detalles de Monitoreo
              </Dialog.Title>
              <p className="text-sm text-gray-500">
                RUT: {schedule.rut} {schedule.companyName && `- ${schedule.companyName}`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to={`/fast-check-ex?rut=${schedule.rut}`}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Ver en Fast Check
              </Link>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Schedule Details Section */}
          <div className="p-6 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-medium text-gray-900 mb-4">Información del Programa</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Estado</label>
                <div className="mt-1 flex items-center">
                  {schedule.isActive ? (
                    <>
                      <CheckCircleIcon className="w-4 h-4 text-green-500 mr-1" />
                      <span className="text-sm text-green-600">Activo</span>
                    </>
                  ) : (
                    <>
                      <XCircleIcon className="w-4 h-4 text-red-500 mr-1" />
                      <span className="text-sm text-red-600">Inactivo</span>
                    </>
                  )}
                </div>
              </div>
              
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Frecuencia</label>
                <p className="mt-1 text-sm text-gray-900 capitalize">
                  {schedule.frequency === 'minute' ? 'Cada minuto' :
                   schedule.frequency === 'daily' ? 'Diario' :
                   schedule.frequency === 'weekly' ? 'Semanal' :
                   schedule.frequency === 'monthly' ? 'Mensual' : schedule.frequency}
                </p>
              </div>
              
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Ejecuciones</label>
                <p className="mt-1 text-sm text-gray-900">{schedule.executionCount}</p>
              </div>
              
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Última Ejecución</label>
                <div className="mt-1">
                  {schedule.lastExecutionStatus && (
                    <div className="flex items-center mb-1">
                      {schedule.lastExecutionStatus === 'success' && <CheckCircleIcon className="w-4 h-4 text-green-500 mr-1" />}
                      {schedule.lastExecutionStatus === 'error' && <XCircleIcon className="w-4 h-4 text-red-500 mr-1" />}
                      {schedule.lastExecutionStatus === 'pending' && <ClockIcon className="w-4 h-4 text-yellow-500 mr-1" />}
                      <span className={`text-xs ${
                        schedule.lastExecutionStatus === 'success' ? 'text-green-600' :
                        schedule.lastExecutionStatus === 'error' ? 'text-red-600' :
                        'text-yellow-600'
                      }`}>
                        {schedule.lastExecutionStatus === 'success' ? 'Exitosa' :
                         schedule.lastExecutionStatus === 'error' ? 'Error' : 'Pendiente'}
                      </span>
                    </div>
                  )}
                  <p className="text-sm text-gray-900">
                    {schedule.lastExecuted ? formatDate(schedule.lastExecuted) : 'Nunca'}
                  </p>
                </div>
              </div>
              
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Próxima Ejecución</label>
                <p className="mt-1 text-sm text-gray-900">{formatDate(schedule.nextExecution)}</p>
              </div>
              
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Creado</label>
                <p className="mt-1 text-sm text-gray-900">{formatDate(schedule.createdAt)}</p>
              </div>
              
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Actualizado</label>
                <p className="mt-1 text-sm text-gray-900">{formatDate(schedule.updatedAt)}</p>
              </div>
              
              {schedule.tenantId && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tenant</label>
                  <p className="mt-1 text-sm text-gray-900">{schedule.tenantId.name}</p>
                </div>
              )}
            </div>
            
            {schedule.lastExecutionError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <label className="text-xs font-medium text-red-800 uppercase tracking-wide">Último Error</label>
                <p className="mt-1 text-sm text-red-700">{schedule.lastExecutionError}</p>
              </div>
            )}
          </div>

          <div className="flex h-[calc(90vh-120px)]">
            {/* Executions List */}
            <div className="w-1/2 border-r border-gray-200 overflow-y-auto">
              <div className="p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-4">
                  Ejecuciones ({total})
                </h3>
                
                {loading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : executions.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No hay ejecuciones registradas
                  </div>
                ) : (
                  <div className="space-y-2">
                    {executions.map((execution) => (
                      <div
                        key={execution._id}
                        onClick={() => fetchExecutionDetails(execution._id)}
                        className={`p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${
                          selectedExecution?._id === execution._id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(execution.status)}
                            <span className="text-sm font-medium">
                              {getStatusText(execution.status)}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">
                            {formatDuration(execution.duration)}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600">
                          {formatDate(execution.executedAt)}
                        </div>
                        {execution.riskChanged && (
                          <div className="mt-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                              Cambio de Riesgo
                            </span>
                          </div>
                        )}
                        {execution.error && (
                          <div className="mt-1 text-xs text-red-600 truncate">
                            {execution.error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-4 flex justify-center">
                    <nav className="flex space-x-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-1 text-sm border rounded ${
                            page === currentPage
                              ? 'bg-blue-50 border-blue-500 text-blue-600'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                    </nav>
                  </div>
                )}
              </div>
            </div>

            {/* Execution Details */}
            <div className="w-1/2 overflow-y-auto">
              <div className="p-4">
                {selectedExecution ? (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 mb-3">
                        Detalles de Ejecución
                      </h3>
                      
                      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-xs text-gray-500">Estado:</span>
                            <div className="flex items-center gap-2 mt-1">
                              {getStatusIcon(selectedExecution.status)}
                              <span className="text-sm font-medium">
                                {getStatusText(selectedExecution.status)}
                              </span>
                            </div>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500">Duración:</span>
                            <div className="text-sm font-medium mt-1">
                              {formatDuration(selectedExecution.duration)}
                            </div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-xs text-gray-500">Iniciado:</span>
                            <div className="text-sm mt-1">
                              {formatDate(selectedExecution.startedAt)}
                            </div>
                          </div>
                          {selectedExecution.completedAt && (
                            <div>
                              <span className="text-xs text-gray-500">Completado:</span>
                              <div className="text-sm mt-1">
                                {formatDate(selectedExecution.completedAt)}
                              </div>
                            </div>
                          )}
                        </div>

                        {selectedExecution.riskChanged && (
                          <div>
                            <span className="text-xs text-gray-500">Cambio de Riesgo:</span>
                            <div className="mt-1">
                              <span className="inline-flex items-center px-2 py-1 rounded text-sm font-medium bg-orange-100 text-orange-800">
                                Sí - Se detectó un cambio en el nivel de riesgo
                              </span>
                            </div>
                          </div>
                        )}

                        {selectedExecution.sheriffLogId && (
                          <div>
                            <span className="text-xs text-gray-500">ID de Log Sheriff:</span>
                            <div className="text-sm font-mono mt-1">
                              {selectedExecution.sheriffLogId}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Error Details */}
                    {selectedExecution.error && (
                      <div>
                        <h4 className="text-sm font-medium text-red-900 mb-2">Error</h4>
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <div className="text-sm text-red-800">
                            {selectedExecution.error}
                          </div>
                          {selectedExecution.errorDetails?.message && (
                            <div className="text-xs text-red-600 mt-2">
                              {selectedExecution.errorDetails.message}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Processing Steps */}
                    {selectedExecution.executionDetails?.processingSteps && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-2">
                          Pasos de Procesamiento
                        </h4>
                        <div className="space-y-2">
                          {selectedExecution.executionDetails.processingSteps.map((step, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-3 p-2 bg-gray-50 rounded"
                            >
                              {getStatusIcon(step.status)}
                              <div className="flex-1">
                                <div className="text-sm font-medium">{step.step}</div>
                                <div className="text-xs text-gray-500">
                                  {formatDate(step.timestamp)} - {formatDuration(step.duration)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* API Calls */}
                    {selectedExecution.executionDetails?.apiCalls && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-2">
                          Llamadas API
                        </h4>
                        <div className="space-y-2">
                          {selectedExecution.executionDetails.apiCalls.map((call, index) => (
                            <div
                              key={index}
                              className="p-2 bg-gray-50 rounded text-sm"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium">
                                  {call.method} {call.endpoint}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-xs ${
                                  call.status >= 200 && call.status < 300
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                                }`}>
                                  {call.status}
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {formatDate(call.timestamp)} - {formatDuration(call.duration)}
                              </div>
                              {call.error && (
                                <div className="text-xs text-red-600 mt-1">
                                  {call.error}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Risk Assessment */}
                    {selectedExecution.riskAssessment && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-2">
                          Evaluación de Riesgo
                        </h4>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                            {JSON.stringify(selectedExecution.riskAssessment, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Metadata */}
                    {selectedExecution.metadata && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-2">
                          Metadatos
                        </h4>
                        <div className="bg-gray-50 rounded-lg p-3 text-sm">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-xs text-gray-500">Disparado por:</span>
                              <div className="font-medium">
                                {selectedExecution.metadata.triggeredBy === 'schedule' ? 'Programación' :
                                 selectedExecution.metadata.triggeredBy === 'manual' ? 'Manual' : 'API'}
                              </div>
                            </div>
                            {selectedExecution.metadata.triggeredByUserId && (
                              <div>
                                <span className="text-xs text-gray-500">Usuario:</span>
                                <div className="font-medium">
                                  {selectedExecution.metadata.triggeredByUserId}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    Selecciona una ejecución para ver los detalles
                  </div>
                )}
              </div>
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
};

export default MonitoringDetailModal;