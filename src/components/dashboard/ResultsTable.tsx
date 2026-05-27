import React, { useState, useMemo } from 'react';
import { IResult as IResultBackend } from '../../../server/src/models/Result';
import { Link } from 'react-router-dom';
import { MagnifyingGlassIcon, ArrowUpIcon, ArrowDownIcon, EyeIcon, CalendarIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline';
import { logger } from '../../utils/logger';
import { useTranslation } from 'react-i18next';

interface IResult extends Omit<IResultBackend, 'rut'> {
  _id: string;
  createdAt: string;
  rut?: string;
  noteTags?: string[];
}

interface ResultsTableProps {
  results: IResult[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (field: string) => void;
  totalServerResults?: number;
  hasActiveFilters?: boolean;
  totalResultsBeforeFilter?: number;
  selectedRuts?: string[];
  onSelectionChange?: (ruts: string[]) => void;
}

const ResultsTable: React.FC<ResultsTableProps> = ({
  results,
  currentPage,
  totalPages,
  onPageChange,
  sortField: externalSortField = 'createdAt',
  sortDirection: externalSortDirection = 'desc',
  onSort: externalOnSort,
  totalServerResults = 0,
  hasActiveFilters = false,
  totalResultsBeforeFilter = 0,
  selectedRuts = [],
  onSelectionChange,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [localSortField, setLocalSortField] = useState<string>('createdAt');
  const [localSortDirection, setLocalSortDirection] = useState<'asc' | 'desc'>('desc');

  const { t, i18n } = useTranslation();
  const localeMap: Record<string, string> = { es: 'es-ES', en: 'en-US', pt: 'pt-PT', fr: 'fr-FR' };
  const resolvedLangKey = (i18n.resolvedLanguage ?? i18n.language ?? 'es');
  const dateLocale = localeMap[resolvedLangKey] ?? 'es-ES';

  // Ordenar localmente los resultados de la página actual
  const sortedResults = useMemo(() => {
    const resultsCopy = [...(results || [])];

    return resultsCopy.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (localSortField) {
        case 'rut':
          aValue = (a.rut || a.details?.rut || '').toLowerCase();
          bValue = (b.rut || b.details?.rut || '').toLowerCase();
          break;
        case 'razonSocial':
          aValue = (a.details?.razonSocial || '').toLowerCase();
          bValue = (b.details?.razonSocial || '').toLowerCase();
          break;
        case 'tags':
          aValue = (a.noteTags || []).join(', ').toLowerCase();
          bValue = (b.noteTags || []).join(', ').toLowerCase();
          break;
        case 'riskLevel':
          const riskOrder = { red: 4, orange: 3, yellow: 2, green: 1 };
          aValue = riskOrder[a.riskAssessment?.riskSummary?.semaphore as keyof typeof riskOrder] || 0;
          bValue = riskOrder[b.riskAssessment?.riskSummary?.semaphore as keyof typeof riskOrder] || 0;
          break;
        case 'createdAt':
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return localSortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return localSortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [results, localSortField, localSortDirection]);

  // Aplicar filtro de búsqueda local a los resultados ordenados
  const resultsWithVisibility = sortedResults.map(result => {
    const searchLower = searchTerm.toLowerCase();
    const rut = (result.rut || result.details?.rut || '').toLowerCase();
    const razonSocial = (result.details?.razonSocial || '').toLowerCase();
    const matchesSearch = !searchTerm || rut.includes(searchLower) || razonSocial.includes(searchLower);

    return {
      ...result,
      isVisible: matchesSearch
    };
  });

  const visibleCount = resultsWithVisibility.filter(r => r.isVisible).length;
  const hiddenCount = resultsWithVisibility.length - visibleCount;
  const hasTableStructure = totalPages > 0;

  const visibleRuts = resultsWithVisibility
    .filter(r => r.isVisible)
    .map(r => r.rut || r.details?.rut || '')
    .filter(Boolean);

  const allVisibleSelected = visibleRuts.length > 0 && visibleRuts.every(rut => selectedRuts.includes(rut));

  const toggleAllVisible = () => {
    if (!onSelectionChange) return;
    if (allVisibleSelected) {
      onSelectionChange(selectedRuts.filter(rut => !visibleRuts.includes(rut)));
    } else {
      const merged = Array.from(new Set([...selectedRuts, ...visibleRuts]));
      onSelectionChange(merged);
    }
  };

  const toggleOneRut = (rut: string) => {
    if (!onSelectionChange) return;
    if (selectedRuts.includes(rut)) {
      onSelectionChange(selectedRuts.filter(r => r !== rut));
    } else {
      onSelectionChange([...selectedRuts, rut]);
    }
  };

  // Manejar ordenamiento local
  const handleLocalSort = (field: string) => {
    if (localSortField === field) {
      setLocalSortDirection(localSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setLocalSortField(field);
      setLocalSortDirection('asc');
    }
  };

  const getRiskLevelClass = (riskLevel: string) => {
    switch (riskLevel) {
      case 'red':
        return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 border border-red-200 dark:border-red-800';
      case 'yellow':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800';
      case 'green':
        return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 border border-green-200 dark:border-green-800';
      case 'orange':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300 border border-orange-200 dark:border-orange-800';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600';
    }
  };

  const getRiskLevelDisplayName = (riskLevel: string) => {
    logger.log(33, "riskLevel", riskLevel);
    switch (riskLevel) {
      case 'red':
        return t('risk.critical');
      case 'yellow':
        return t('risk.medium');
      case 'green':
        return t('risk.low');
      case 'orange':
        return t('risk.high');
      default:
        return riskLevel;
    }
  };

  const renderPagination = () => (
    <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 dark:bg-gray-700/50 px-6 py-4">
      <div className="flex flex-1 justify-between sm:hidden">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="relative inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {t('common.previous')}
        </button>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="relative ml-3 inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {t('common.next')}
        </button>
      </div>
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-700 dark:text-gray-400">
            Mostrando página <span className="font-semibold text-gray-900 dark:text-white">{currentPage}</span> de{' '}
            <span className="font-semibold text-gray-900 dark:text-white">{totalPages}</span>
            {hasActiveFilters && (
              <>
                {' '}| Total filtrado: <span className="font-semibold text-gray-900 dark:text-white">{totalResultsBeforeFilter || totalServerResults}</span>
              </>
            )}
            {' '}| En esta página: <span className="font-semibold text-green-600 dark:text-green-400">{visibleCount}</span> visibles
            {hiddenCount > 0 && (
              <>, <span className="font-semibold text-orange-600 dark:text-orange-400">{hiddenCount}</span> ocultos</>
            )}
          </p>
        </div>
        <div>
          <nav className="isolate inline-flex -space-x-px rounded-lg shadow-sm" aria-label="Pagination">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="relative inline-flex items-center rounded-l-lg px-3 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 dark:ring-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span className="sr-only">{t('common.previous')}</span>
              <ArrowUpIcon className="h-4 w-4 rotate-[-90deg]" />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let page;
              if (totalPages <= 5) {
                page = i + 1;
              } else if (currentPage <= 3) {
                page = i + 1;
              } else if (currentPage >= totalPages - 2) {
                page = totalPages - 4 + i;
              } else {
                page = currentPage - 2 + i;
              }
              return (
                <button
                  key={page}
                  onClick={() => onPageChange(page)}
                  aria-current={page === currentPage ? 'page' : undefined}
                  className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold transition-colors ${page === currentPage
                    ? 'z-10 bg-primary-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 dark:bg-primary-500'
                    : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-700'
                    }`}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="relative inline-flex items-center rounded-r-lg px-3 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 dark:ring-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span className="sr-only">{t('common.next')}</span>
              <ArrowUpIcon className="h-4 w-4 rotate-90" />
            </button>
          </nav>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-200 dark:border-gray-700">
      <div className="px-6 py-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex items-center space-x-3 mb-4 sm:mb-0">
            <div className="p-2 bg-primary-100 dark:bg-primary-900/50 rounded-lg">
              <CalendarIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{t('dashboard.recentQueriesTitle', { defaultValue: 'Consultas Recientes' })}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.recentQueriesSubtitle', { defaultValue: 'Historial de evaluaciones realizadas' })}</p>
            </div>
          </div>

        </div>
        {hasTableStructure ? (
          <>
            <div className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleAllVisible}
                          className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        <button
                          onClick={() => handleLocalSort('rut')}
                          className="flex items-center space-x-1 hover:text-gray-900 dark:hover:text-white transition-colors"
                        >
                          <span>RUT</span>
                          {localSortField === 'rut' && (
                            localSortDirection === 'asc' ?
                              <ArrowUpIcon className="h-4 w-4" /> :
                              <ArrowDownIcon className="h-4 w-4" />
                          )}
                        </button>
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        <button
                          onClick={() => handleLocalSort('razonSocial')}
                          className="flex items-center space-x-1 hover:text-gray-900 dark:hover:text-white transition-colors"
                        >
                          <BuildingOfficeIcon className="h-4 w-4" />
                          <span>{t('consultas.razonSocial')}</span>
                          {localSortField === 'razonSocial' && (
                            localSortDirection === 'asc' ?
                              <ArrowUpIcon className="h-4 w-4" /> :
                              <ArrowDownIcon className="h-4 w-4" />
                          )}
                        </button>
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        <button
                          onClick={() => handleLocalSort('tags')}
                          className="flex items-center space-x-1 hover:text-gray-900 dark:hover:text-white transition-colors"
                        >
                          <BuildingOfficeIcon className="h-4 w-4" />
                          <span>TAG</span>
                          {localSortField === 'tags' && (
                            localSortDirection === 'asc' ?
                              <ArrowUpIcon className="h-4 w-4" /> :
                              <ArrowDownIcon className="h-4 w-4" />
                          )}
                        </button>
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        <button
                          onClick={() => handleLocalSort('riskLevel')}
                          className="flex items-center space-x-1 hover:text-gray-900 dark:hover:text-white transition-colors"
                        >
                          <span>{t('consultas.nivelRiesgo')}</span>
                          {localSortField === 'riskLevel' && (
                            localSortDirection === 'asc' ?
                              <ArrowUpIcon className="h-4 w-4" /> :
                              <ArrowDownIcon className="h-4 w-4" />
                          )}
                        </button>
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        <button
                          onClick={() => handleLocalSort('createdAt')}
                          className="flex items-center space-x-1 hover:text-gray-900 dark:hover:text-white transition-colors"
                        >
                          <CalendarIcon className="h-4 w-4" />
                          <span>{t('consultas.fechaConsulta')}</span>
                          {localSortField === 'createdAt' && (
                            localSortDirection === 'asc' ?
                              <ArrowUpIcon className="h-4 w-4" /> :
                              <ArrowDownIcon className="h-4 w-4" />
                          )}
                        </button>
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        {t('consultas.acciones')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {resultsWithVisibility.length > 0 ? (
                      <>
                        {resultsWithVisibility.map((result) => {
                          const rutValue = result.rut || result.details?.rut || '';
                          return (
                            <tr
                              key={result._id}
                              className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${!result.isVisible ? 'hidden' : ''}`}
                            >
                              <td className="whitespace-nowrap px-6 py-4">
                                <input
                                  type="checkbox"
                                  checked={selectedRuts.includes(rutValue)}
                                  onChange={() => toggleOneRut(rutValue)}
                                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                                />
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                                {result.rut || result.details?.rut}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                                <div className="flex items-center">
                                  <BuildingOfficeIcon className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                                  <span className="truncate">{result.details?.razonSocial}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                                <div className="flex items-center gap-1 flex-wrap">
                                  {result?.noteTags?.map((noteTag: any, index: number) =>
                                    <span key={index} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                                      {noteTag}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm">
                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${getRiskLevelClass(result.riskAssessment?.riskSummary?.semaphore || 'unknown')}`}>
                                  {getRiskLevelDisplayName(result.riskAssessment?.riskSummary?.semaphore || t('common.notAvailable'))}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                <div className="flex items-center">
                                  <CalendarIcon className="h-4 w-4 text-gray-400 mr-2" />
                                  {new Date(result.createdAt).toLocaleDateString(dateLocale)}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium">
                                <Link
                                  to={`/consultas/${result._id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-primary-700 bg-primary-100 hover:bg-primary-200 dark:text-primary-400 dark:bg-primary-900/50 dark:hover:bg-primary-900/70 transition-colors"
                                >
                                  <EyeIcon className="h-4 w-4 mr-1" />
                                  {t('consultas.viewDetail', { defaultValue: 'Ver Detalle' })}
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                        {visibleCount === 0 && (
                          <tr>
                            <td colSpan={7} className="px-6 py-12 text-center">
                              <div className="mx-auto max-w-md">
                                <MagnifyingGlassIcon className="mx-auto h-12 w-12 text-gray-400" />
                                <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
                                  No hay resultados visibles en esta página
                                </h3>
                                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                                  Todos los elementos de esta página están ocultos por los filtros activos. Intenta navegar a otra página o ajusta tus filtros.
                                </p>
                                {searchTerm && (
                                  <button
                                    onClick={() => setSearchTerm('')}
                                    className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-primary-700 bg-primary-100 hover:bg-primary-200 dark:text-primary-400 dark:bg-primary-900/50 dark:hover:bg-primary-900/70 transition-colors"
                                  >
                                    {t('resultsTable.clearFilter')}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center">
                          <div className="mx-auto max-w-md">
                            <MagnifyingGlassIcon className="mx-auto h-12 w-12 text-gray-400" />
                            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
                              No hay resultados en esta página
                            </h3>
                            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                              Esta página no contiene resultados que coincidan con los filtros aplicados. Intenta navegar a otra página.
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {renderPagination()}
          </>
        ) : (
          <>
            <div className="text-center py-16">
              <div className="mx-auto max-w-md">
                <MagnifyingGlassIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
                  {t('resultsTable.noQueries')}
                </h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {t('resultsTable.noQueriesMessage')}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ResultsTable;