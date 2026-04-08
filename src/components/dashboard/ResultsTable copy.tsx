import React, { useState } from 'react';
import { IResult as IResultBackend } from '../../../server/src/models/Result';
import { Link } from 'react-router-dom';
import { MagnifyingGlassIcon, ArrowUpIcon, ArrowDownIcon, EyeIcon, CalendarIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline';
import { logger } from '../../utils/logger';
import { useTranslation } from 'react-i18next';

interface IResult extends IResultBackend {
  _id: string;
  createdAt: string;
}

interface ResultsTableProps {
  results: IResult[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (field: string) => void;
}

const ResultsTable: React.FC<ResultsTableProps> = ({
  results,
  currentPage,
  totalPages,
  onPageChange,
  sortField = 'createdAt',
  sortDirection = 'desc',
  onSort
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const { t, i18n } = useTranslation();
  const localeMap: Record<string, string> = { es: 'es-ES', en: 'en-US', pt: 'pt-PT', fr: 'fr-FR' };
  // Safely resolve language key; i18n.resolvedLanguage can be undefined
  const resolvedLangKey = (i18n.resolvedLanguage ?? i18n.language ?? 'es');
  const dateLocale = localeMap[resolvedLangKey] ?? 'es-ES';
  
  const filteredResults = results.filter(result => {
    if (result.isPep) return false;
    const hasRiskSummary = !!result.riskAssessment?.riskSummary?.semaphore;
    if (!hasRiskSummary) return false;
    const searchLower = searchTerm.toLowerCase();
    const rut = (result.rut || result.details?.rut || '').toLowerCase();
    const razonSocial = (result.details?.razonSocial || '').toLowerCase();
    return rut.includes(searchLower) || razonSocial.includes(searchLower);
  });
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
    logger.log(33,"riskLevel",riskLevel);
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
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder={t('consultas.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent sm:text-sm"
            />
          </div>
        </div>
      {filteredResults.length > 0 ? (
        <>
          <div className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      <button
                        onClick={() => onSort?.('rut')}
                        className="flex items-center space-x-1 hover:text-gray-900 dark:hover:text-white transition-colors"
                      >
                        <span>RUT</span>
                        {sortField === 'rut' && (
                          sortDirection === 'asc' ? 
                          <ArrowUpIcon className="h-4 w-4" /> : 
                          <ArrowDownIcon className="h-4 w-4" />
                        )}
                      </button>
                    </th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      <button
                        onClick={() => onSort?.('razonSocial')}
                        className="flex items-center space-x-1 hover:text-gray-900 dark:hover:text-white transition-colors"
                      >
                        <BuildingOfficeIcon className="h-4 w-4" />
                        <span>{t('consultas.razonSocial')}</span>
                        {sortField === 'razonSocial' && (
                          sortDirection === 'asc' ? 
                          <ArrowUpIcon className="h-4 w-4" /> : 
                          <ArrowDownIcon className="h-4 w-4" />
                        )}
                      </button>
                    </th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      <button
                        onClick={() => onSort?.('riskLevel')}
                        className="flex items-center space-x-1 hover:text-gray-900 dark:hover:text-white transition-colors"
                      >
                        <span>{t('consultas.nivelRiesgo')}</span>
                        {sortField === 'riskLevel' && (
                          sortDirection === 'asc' ? 
                          <ArrowUpIcon className="h-4 w-4" /> : 
                          <ArrowDownIcon className="h-4 w-4" />
                        )}
                      </button>
                    </th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      <button
                        onClick={() => onSort?.('createdAt')}
                        className="flex items-center space-x-1 hover:text-gray-900 dark:hover:text-white transition-colors"
                      >
                        <CalendarIcon className="h-4 w-4" />
                        <span>{t('consultas.fechaConsulta')}</span>
                        {sortField === 'createdAt' && (
                          sortDirection === 'asc' ? 
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
                    {filteredResults.map((result) => (
                      <tr key={result._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                          {result.rut || result.details?.rut}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                          <div className="flex items-center">
                            <BuildingOfficeIcon className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                            <span className="truncate">{result.details?.razonSocial}</span>
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
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-primary-700 bg-primary-100 hover:bg-primary-200 dark:text-primary-400 dark:bg-primary-900/50 dark:hover:bg-primary-900/70 transition-colors"
                          >
                            <EyeIcon className="h-4 w-4 mr-1" />
                            {t('consultas.viewDetail', { defaultValue: 'Ver Detalle' })}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
                    {t('common.page')} <span className="font-semibold text-gray-900 dark:text-white">{currentPage}</span> {t('common.of')}{' '}
                    <span className="font-semibold text-gray-900 dark:text-white">{totalPages}</span>
                    {searchTerm && (
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                        ({t('common.filteredBy')}: "{searchTerm}")
                      </span>
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
                          className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold transition-colors ${
                            page === currentPage
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
        </>
      ) : (
        <div className="text-center py-16">
          <div className="mx-auto max-w-md">
            <MagnifyingGlassIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
              {searchTerm ? t('resultsTable.noResults') : t('resultsTable.noQueries')}
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {searchTerm 
                ? t('resultsTable.noResultsMessage', { searchTerm })
                : t('resultsTable.noQueriesMessage')
              }
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
        </div>
      )}
      </div>
    </div>
  );
};

export default ResultsTable;
