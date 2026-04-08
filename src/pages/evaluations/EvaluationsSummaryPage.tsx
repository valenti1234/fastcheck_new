import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageLoader from '../../components/common/PageLoader';
import toast from 'react-hot-toast';
import { getSheriffDataLogs, formatChileanRut } from '../../services/api';
import { SheriffDataLogResponse } from '../../types/sheriff';
import { Eye, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const EvaluationsSummaryPage = () => {
  const [sheriffLogs, setSheriffLogs] = useState<SheriffDataLogResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const { t, i18n } = useTranslation();

  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    const fetchSheriffLogs = async () => {
      setLoading(true);
      try {
        const data = await getSheriffDataLogs(page, ITEMS_PER_PAGE);
        setSheriffLogs(data.logs);
        setTotalPages(data.pages);
        setTotalLogs(data.total);
      } catch (error) {
        logger.error('Error fetching logs:', error);
        toast.error((error instanceof Error ? error.message : 'Failed to load logs.'));
        setSheriffLogs([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSheriffLogs();
  }, [page]);

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div className="bg-gray-50/50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="sm:flex sm:items-center sm:justify-between">
          <div className="sm:flex-auto">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">{t('nav.historicalConsultas')}</h1>
            <p className="mt-2 text-sm text-gray-600">
              {t('consultas.title')} — {t('common.page')} {page} {t('common.of')} {totalPages}. {t('common.filteredBy')}: {totalLogs}
            </p>
          </div>
          <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
            <Link
              to="/evaluations/single"
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 sm:w-auto"
            >
              <Search className="-ml-1 mr-2 h-5 w-5" />
              {t('nav.singleEvaluation')}
            </Link>
          </div>
        </div>

        <div className="mt-8 flow-root">
          <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
            <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
              <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">RUT</th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">{t('consultas.razonSocial', { defaultValue: 'Razón Social' })}</th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">{t('consultas.fechaConsulta', { defaultValue: 'Fecha de Consulta' })}</th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">{t('consultas.resultado', { defaultValue: 'Resultado' })}</th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">{t('consultas.resumenIA', { defaultValue: 'Resumen IA' })}</th>
                      <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                        <span className="sr-only">{t('common.view')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {sheriffLogs.length > 0 ? (
                      sheriffLogs.map((log) => (
                        <tr key={log._id} className="hover:bg-gray-50 transition-colors duration-200">
                          <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">{formatChileanRut(log.rut)}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 truncate max-w-xs" title={(log.siiData as any)?.razonSocial || ''}>
                            {(log.siiData as any)?.razonSocial || t('common.notAvailable')}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{new Date(log.createdAt).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' })}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              log.allCallsSucceeded
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {log.allCallsSucceeded ? t('consultas.exito', { defaultValue: 'Éxito' }) : t('consultas.fallo', { defaultValue: 'Fallo' })}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 truncate max-w-xs" title={log.duxiterMD}>
                            {log.duxiterMD ? `${log.duxiterMD.substring(0, 50)}...` : t('common.notAvailable')}
                          </td>
                          <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                            <Link
                              to={`/admin/sheriff-log/${log._id}`}
                              className="inline-flex items-center rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                            >
                              <Eye className="-ml-0.5 mr-1.5 h-5 w-5 text-gray-400" aria-hidden="true" />
                              {t('common.view')}
                            </Link>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="text-center py-16">
                          <div className="text-center">
                            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                              <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2z" />
                            </svg>
                            <h3 className="mt-2 text-sm font-semibold text-gray-900">{t('consultas.noResultsTitle')}</h3>
                            <p className="mt-1 text-sm text-gray-500">{t('consultas.noResultsDescription')}</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Página <span className="font-medium">{page}</span> de <span className="font-medium">{totalPages}</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                disabled={page === 1}
                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-5 w-5" />
                <span className="ml-1">{t('common.previous')}</span>
              </button>
              <button
                onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
                disabled={page === totalPages}
                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="mr-1">{t('common.next')}</span>
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EvaluationsSummaryPage;