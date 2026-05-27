import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { DocumentArrowDownIcon, EyeIcon } from '@heroicons/react/24/outline';

interface ParametroCritico {
  label: string;
  count: number;
}

interface DimensionCritica {
  name: string;
  count: number;
}

interface RutInfo {
  rut: string;
  razonSocial: string;
  fecha: string;
  _id: string;
}

interface DeepAnalysisData {
  dimensionesCriticas: DimensionCritica[];
  parametrosCriticos: ParametroCritico[];
  rutsByParam: Record<string, RutInfo[]>;
}

interface Props {
  data: DeepAnalysisData | null;
  loadingAnalysis: boolean;
  loadingExcel: boolean;
  onAnalyze: () => void;
  onExportExcel: () => void;
}

const DeepAnalysisPanel: React.FC<Props> = ({ data, loadingAnalysis, loadingExcel, onAnalyze, onExportExcel }) => {
  const [selectedParams, setSelectedParams] = useState<string[]>([]);
  const maxCount = data ? Math.max(...data.parametrosCriticos.map(p => p.count), 1) : 1;

  useEffect(() => {
    if (data && selectedParams.length > 0) {
      const validParams = selectedParams.filter(p => data.rutsByParam[p]);
      if (validParams.length !== selectedParams.length) {
        setSelectedParams(validParams);
      }
    }
  }, [data, selectedParams]);

  const toggleParam = (label: string) => {
    setSelectedParams(prev =>
      prev.includes(label) ? prev.filter(p => p !== label) : [...prev, label]
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Análisis Profundo</h3>
        <div className="flex gap-3">
          <button
            onClick={onAnalyze}
            disabled={loadingAnalysis}
            data-pdf-hide="true"
            className="bg-primary-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            {loadingAnalysis ? "Analizando..." : "Mostrar analisis profundo"}
          </button>
          <button
            onClick={onExportExcel}
            disabled={loadingExcel || loadingAnalysis}
            data-pdf-hide="true"
            className="flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 transition-all disabled:opacity-50"
          >
            <DocumentArrowDownIcon className="h-5 w-5" />
            {loadingExcel ? "Generando Excel..." : "Exportar Excel info de los RUT"}
          </button>
        </div>
      </div>

      {data && data.parametrosCriticos.length > 0 && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Dimensiones Críticas - solo parámetros severo/Crítico con nombre y conteo */}
            <div className="lg:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Parametros severos
                </h4>
                <span className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
                  Crítico
                </span>
              </div>
              <ul className="space-y-2">
                {data.dimensionesCriticas.map((dim, i) => (
                  <li key={i} className="flex items-start gap-2 py-1">
                    <span className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0 bg-red-500" />
                    <span className="text-sm text-gray-800 dark:text-gray-200 flex-1 leading-tight">
                      {dim.name}
                    </span>
                    <span className={`text-sm font-bold flex-shrink-0 ${dim.count > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
                      {dim.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Parámetros Críticos - gráfico de barras */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Recurrencia por parámetro</h4>
                <span className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                  <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
                  Crítico / Alto
                </span>
              </div>
              <div className="space-y-3">
                {data.parametrosCriticos.map((param, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedParams.includes(param.label)}
                      onChange={() => toggleParam(param.label)}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 flex-shrink-0"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 w-56 text-right flex-shrink-0 truncate" title={param.label}>
                      {param.label}
                    </span>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-6 overflow-hidden">
                        <div
                          className="bg-blue-500 h-full rounded-full flex items-center transition-all duration-500 min-w-[32px]"
                          style={{ width: `${Math.max((param.count / maxCount) * 100, 8)}%` }}
                        >
                          <span className="text-xs font-bold text-white ml-auto pr-3">{param.count}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {selectedParams.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div data-pdf-table-header="true" className="flex items-center justify-between mb-3">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                  RUTs por Parámetro Seleccionado ({selectedParams.length})
                </h4>
                <button
                  onClick={() => setSelectedParams([])}
                  data-pdf-hide="true"
                  className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  Limpiar selección
                </button>
              </div>
              <div data-pdf-section="rut-card" className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <div data-pdf-expand="true" className="overflow-auto max-h-96">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">Parámetro</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">RUT</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">Razón Social</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">Fecha</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedParams.flatMap(paramLabel =>
                        (data.rutsByParam[paramLabel] || []).map((r, idx) => (
                          <tr key={`${paramLabel}-${idx}`} className="border-t border-gray-200 dark:border-gray-700">
                            <td className="px-3 py-2 text-gray-900 dark:text-gray-100 font-medium">{paramLabel}</td>
                            <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{r.rut}</td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{r.razonSocial}</td>
                            <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                              {r.fecha ? new Date(r.fecha).toLocaleDateString('es-CL') : '-'}
                            </td>
                            <td className="px-3 py-2">
                              {r._id && (
                                <Link
                                  to={`/consultas/${r._id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-primary-700 bg-primary-100 hover:bg-primary-200 dark:text-primary-400 dark:bg-primary-900/50 dark:hover:bg-primary-900/70 transition-colors"
                                >
                                  <EyeIcon className="h-4 w-4 mr-1" />
                                  Ver Detalle
                                </Link>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {data && data.parametrosCriticos.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">No se encontraron parámetros críticos o altos.</p>
      )}
    </div>
  );
};

export default DeepAnalysisPanel;