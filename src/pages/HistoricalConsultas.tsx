import React, { useEffect, useState } from 'react';
import { 
  historicalConsultasApi, 
  HistoricalConsulta, 
  HistoricalConsultaFilters, 
  HistoricalConsultasStats 
} from '../services/api';
import logger from '../utils/logger';
import jsPDF from 'jspdf';
import { useTranslation } from 'react-i18next';

const normalizeRutFilter = (rut: string): string => {
  if (!rut) return rut;
  const cleaned = String(rut).replace(/\./g, '').replace(/\s+/g, '');
  const hasDash = cleaned.includes('-');
  if (hasDash) {
    const [num, dv] = cleaned.split('-');
    const numericRaw = num.replace(/[^0-9]/g, '');
    const check = (dv || '').replace(/[^0-9kK]/g, '').toUpperCase();
    if (!numericRaw) return cleaned.toUpperCase();
    const numeric = numericRaw.replace(/^0+/, '') || '0';
    return `${numeric}-${check}`;
  }
  const base = cleaned.replace(/[^0-9kK]/g, '').toUpperCase();
  if (base.length < 2) return base;
  const numericRaw = base.slice(0, -1).replace(/[^0-9]/g, '');
  const check = base.slice(-1);
  const numeric = numericRaw.replace(/^0+/, '') || '0';
  return `${numeric}-${check}`;
};

const HistoricalConsultas: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [consultas, setConsultas] = useState<HistoricalConsulta[]>([]);
  const [stats, setStats] = useState<HistoricalConsultasStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  
  // Filters
  const [filters, setFilters] = useState<HistoricalConsultaFilters>({
    page: 1,
    limit: 20,
  });
  
  // Filter form state
  const [consultaType, setConsultaType] = useState<'individual' | 'massive' | ''>('');
  const [rutFilter, setRutFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchConsultas = async (newFilters: HistoricalConsultaFilters = filters) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await historicalConsultasApi.getHistoricalConsultas(newFilters);
      const filtered = Array.isArray(response.data)
        ? response.data.filter((c: any) => {
            const md = c?.metadata || {};
            const rd = c?.requestData || md?.requestData || {};
            const pepFlag = md?.isPep === true || rd?.isPep === true;
            const tag = md?.tag || md?.evaluationType;
            const tagIsPep = typeof tag === 'string' && tag.toLowerCase() === 'pep';
            return !(pepFlag || tagIsPep);
          })
        : [];
      setConsultas(filtered);
      setCurrentPage(response.pagination.page);
      setTotalPages(response.pagination.totalPages);
      setTotal(filtered.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar las consultas históricas');
      logger.error('Error fetching historical consultas:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      setIsLoadingStats(true);
      const statsData = await historicalConsultasApi.getHistoricalConsultasStats(
        startDate || undefined,
        endDate || undefined
      );
      setStats(statsData);
    } catch (err) {
      logger.error('Error fetching historical consultas stats:', err);
    } finally {
      setIsLoadingStats(false);
    }
  };

  useEffect(() => {
    fetchConsultas();
    fetchStats();
  }, []);

  const applyQuickTypeFilter = (type: 'individual' | 'massive' | '') => {
    setConsultaType(type);
    const normalizedRut = normalizeRutFilter(rutFilter);

    const newFilters: HistoricalConsultaFilters = {
      page: 1,
      limit: 20,
      ...(type && { consultaType: type as 'individual' | 'massive' }),
      ...(normalizedRut && { rut: normalizedRut }),
      ...(statusFilter && { responseStatus: parseInt(statusFilter) }),
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
    };

    setFilters(newFilters);
    setCurrentPage(1);
    fetchConsultas(newFilters);
    fetchStats();
  };

  const handleApplyFilters = () => {
    const normalizedRut = normalizeRutFilter(rutFilter);
    const newFilters: HistoricalConsultaFilters = {
      page: 1,
      limit: 20,
      ...(consultaType && { consultaType: consultaType as 'individual' | 'massive' }),
      ...(normalizedRut && { rut: normalizedRut }),
      ...(statusFilter && { responseStatus: parseInt(statusFilter) }),
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
    };
    
    setFilters(newFilters);
    setCurrentPage(1);
    fetchConsultas(newFilters);
    fetchStats();
  };

  const handleClearFilters = () => {
    setConsultaType('');
    setRutFilter('');
    setStatusFilter('');
    setStartDate('');
    setEndDate('');
    
    const newFilters: HistoricalConsultaFilters = {
      page: 1,
      limit: 20,
    };
    
    setFilters(newFilters);
    setCurrentPage(1);
    fetchConsultas(newFilters);
    fetchStats();
  };

  const handlePageChange = (page: number) => {
    const newFilters = { ...filters, page };
    setFilters(newFilters);
    fetchConsultas(newFilters);
  };

  const formatDate = (dateString: string) => {
    const locale = i18n.language === 'es' ? 'es-CL' : undefined;
    return new Date(dateString).toLocaleString(locale);
  };

  const formatProcessingTime = (time: unknown) => {
    const num = typeof time === 'number' ? time : typeof time === 'string' ? Number(time) : NaN;
    if (!Number.isFinite(num)) return 'N/A';
    return `${num.toFixed(0)}ms`;
  };

  const getStatusBadge = (status: number) => {
    if (status >= 200 && status < 300) {
      return <span className="px-2 py-1 text-xs font-semibold text-green-800 bg-green-100 rounded-full">{t('consultationHistory.status.success')}</span>;
    } else if (status >= 400 && status < 500) {
      return <span className="px-2 py-1 text-xs font-semibold text-yellow-800 bg-yellow-100 rounded-full">{t('consultationHistory.status.clientError')}</span>;
    } else if (status >= 500) {
      return <span className="px-2 py-1 text-xs font-semibold text-red-800 bg-red-100 rounded-full">{t('consultationHistory.status.serverError')}</span>;
    }
    return <span className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 rounded-full">{status}</span>;
  };

  const getConsultaTypeBadge = (type: string) => {
    if (type === 'individual') {
      return <span className="px-2 py-1 text-xs font-semibold text-blue-800 bg-blue-100 rounded-full">{t('consultationHistory.type.individual')}</span>;
    } else if (type === 'massive') {
      return <span className="px-2 py-1 text-xs font-semibold text-purple-800 bg-purple-100 rounded-full">{t('consultationHistory.type.massive')}</span>;
    }
    return <span className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 rounded-full">{type}</span>;
  };

  const fetchAllConsultas = async (): Promise<HistoricalConsulta[]> => {
    const allData: HistoricalConsulta[] = [];
    let page = 1;
    let totalPagesAll = 1;

    do {
      const response = await historicalConsultasApi.getHistoricalConsultas({
        ...filters,
        page,
        limit: 100,
      });

      const filtered = Array.isArray(response.data)
        ? response.data.filter((c: any) => {
            const md = c?.metadata || {};
            const rd = c?.requestData || md?.requestData || {};
            const pepFlag = md?.isPep === true || rd?.isPep === true;
            const tag = md?.tag || md?.evaluationType;
            const tagIsPep = typeof tag === 'string' && tag.toLowerCase() === 'pep';
            return !(pepFlag || tagIsPep);
          })
        : [];

      allData.push(...filtered);
      totalPagesAll = response.pagination.totalPages;
      page++;
    } while (page <= totalPagesAll);

    return allData;
  };

  const buildPDF = (data: HistoricalConsulta[], totalCount: number): jsPDF => {
    const doc = new jsPDF('landscape');

    doc.setFontSize(20);
    doc.text(t('consultationHistory.title'), 10, 20);

    doc.setFontSize(12);
    doc.text(`${t('consultationHistory.pdf.generatedAt')}: ${new Date().toLocaleString(i18n.language === 'es' ? 'es-CL' : undefined)}`, 10, 35);
    doc.text(`${t('consultationHistory.pdf.total')}: ${totalCount}`, 10, 45);

    let filterInfo = '';
    if (consultaType) filterInfo += `${t('consultationHistory.filters.type')}: ${consultaType} `;
    if (rutFilter)    filterInfo += `${t('consultationHistory.filters.rut')}: ${rutFilter} `;
    if (statusFilter) filterInfo += `${t('consultationHistory.filters.status')}: ${statusFilter} `;
    if (startDate || endDate)
      filterInfo += `${t('consultationHistory.filters.period')}: ${startDate || t('consultationHistory.filters.start')} - ${endDate || t('consultationHistory.filters.end')} `;

    if (filterInfo) {
      doc.setFontSize(10);
      doc.text(`${t('consultationHistory.pdf.appliedFilters')}: ${filterInfo}`, 10, 55);
    }

    const COL = {
      fecha:    10,
      usuario:  48,
      email:    90,
      tipo:     148,
      tag:      170,
      ruts:     198,
      estado:   228,
      tiempo:   252,
      creditos: 278,
    };

    const drawHeaders = (y: number) => {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(t('consultationHistory.table.date'),    COL.fecha,    y);
      doc.text(t('consultationHistory.table.user'),    COL.usuario,  y);
      doc.text('Email',                                COL.email,    y);
      doc.text(t('consultationHistory.table.type'),    COL.tipo,     y);
      doc.text(t('consultationHistory.table.tag'),     COL.tag,      y);
      doc.text(t('consultationHistory.table.ruts'),    COL.ruts,     y);
      doc.text(t('consultationHistory.table.status'),  COL.estado,   y);
      doc.text(t('consultationHistory.table.time'),    COL.tiempo,   y);
      doc.text(t('consultationHistory.table.credits'), COL.creditos, y);
      doc.line(10, y + 3, 287, y + 3);
    };

    let yPosition = filterInfo ? 75 : 65;
    drawHeaders(yPosition);
    yPosition += 12;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);

    data.forEach((consulta) => {
      if (yPosition > 190) {
        doc.addPage();
        yPosition = 20;
        drawHeaders(yPosition);
        yPosition += 12;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
      }

      const fecha    = formatDate(consulta.createdAt).split(',')[0];
      const usuario  = (consulta.userId?.name  || 'N/A').substring(0, 18);
      const email    = (consulta.userId?.email || 'N/A').substring(0, 28);
      const tipo     = consulta.consultaType === 'individual'
                         ? t('consultationHistory.type.individual')
                         : t('consultationHistory.type.massive');
      const ruts     = consulta.consultaType === 'individual'
                         ? (consulta.rut || 'N/A')
                         : (() => {
                             const arr = Array.isArray((consulta as any).ruts) ? (consulta as any).ruts as string[] : [];
                             const shown = arr.slice(0, 3).join(', ');
                             const extra = arr.length > 3 ? ` (+${arr.length - 3})` : '';
                             return shown ? `${shown}${extra}` : `0 ${t('consultationHistory.table.rutsShort')}`;
                           })();
      const estado   = consulta.responseStatus >= 200 && consulta.responseStatus < 300 ? 'Éxito' : 'Error';
      const tiempoMsRaw = (consulta as { processingTime?: unknown }).processingTime;
      const tiempoMs = typeof tiempoMsRaw === 'number' ? tiempoMsRaw : typeof tiempoMsRaw === 'string' ? Number(tiempoMsRaw) : NaN;
      const tiempo = tiempoMs > 31_500_000 ? 'N/A' : formatProcessingTime(tiempoMs);
      const creditosRaw = (consulta as { creditsUsed?: unknown }).creditsUsed;
      const creditos = typeof creditosRaw === 'number' || typeof creditosRaw === 'string' ? String(creditosRaw) : '0';
      const tag      = consulta.metadata
                         ? String(consulta.metadata.tag || consulta.metadata.evaluationType || '-')
                         : '-';

      doc.text(fecha,                 COL.fecha,    yPosition);
      doc.text(usuario,               COL.usuario,  yPosition);
      doc.text(email,                 COL.email,    yPosition);
      doc.text(tipo,                  COL.tipo,     yPosition);
      doc.text(tag.substring(0, 15),  COL.tag,      yPosition);
      doc.text(ruts.substring(0, 12), COL.ruts,     yPosition);
      doc.text(estado,                COL.estado,   yPosition);
      doc.text(tiempo,                COL.tiempo,   yPosition);
      doc.text(creditos,              COL.creditos, yPosition);

      yPosition += 7;
    });

    if (stats) {
      yPosition += 10;
      doc.line(10, yPosition, 287, yPosition);
      yPosition += 10;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Estadísticas del Período:', 10, yPosition);

      yPosition += 10;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Total de consultas: ${stats.totalConsultas.toLocaleString()}`,                          10,  yPosition);
      doc.text(`Créditos utilizados: ${stats.totalCreditsUsed.toLocaleString()}`,                      110, yPosition);
      yPosition += 8;
      doc.text(`Tiempo promedio: ${formatProcessingTime(stats.averageProcessingTime)}`,                 10,  yPosition);
      doc.text(`Consultas individuales: ${(stats.consultasByType.individual || 0).toLocaleString()}`,  110, yPosition);
    }

    return doc;
  };

  const exportToPDF = () => {
    const doc = buildPDF(consultas, total);
    doc.save(`historial-consultas-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportAllToPDF = async () => {
    try {
      setIsExportingAll(true);
      const allConsultas = await fetchAllConsultas();
      const doc = buildPDF(allConsultas, allConsultas.length);
      doc.save(`historial-completo-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      logger.error('Error exportando historial completo:', err);
    } finally {
      setIsExportingAll(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('consultationHistory.title')}</h1>
        <p className="text-gray-600">{t('consultationHistory.subtitle')}</p>
      </div>

      {/* Statistics Cards */}
      {stats && !isLoadingStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-sm font-medium text-gray-500 mb-2">{t('consultationHistory.cards.totalConsultas')}</h3>
            <p className="text-3xl font-bold text-gray-900">{stats.totalConsultas.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-sm font-medium text-gray-500 mb-2">{t('consultationHistory.cards.creditsUsed')}</h3>
            <p className="text-3xl font-bold text-gray-900">{stats.totalCreditsUsed.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-sm font-medium text-gray-500 mb-2">{t('consultationHistory.cards.averageTime')}</h3>
            <p className="text-3xl font-bold text-gray-900">{formatProcessingTime(stats.averageProcessingTime)}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-sm font-medium text-gray-500 mb-2">{t('consultationHistory.cards.individualConsultas')}</h3>
            <p className="text-3xl font-bold text-gray-900">{(stats.consultasByType.individual || 0).toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('consultationHistory.filters.title')}</h2>
          <div className="inline-flex rounded-md border border-gray-300 overflow-hidden w-fit">
            <button
              type="button"
              onClick={() => applyQuickTypeFilter('')}
              className={`px-3 py-2 text-sm ${
                consultaType === '' ? 'bg-blue-600 text-white' : 'bg-white text-gray-800 hover:bg-gray-50'
              }`}
            >
              {t('consultationHistory.filters.all')}
            </button>
            <button
              type="button"
              onClick={() => applyQuickTypeFilter('massive')}
              className={`px-3 py-2 text-sm border-l border-gray-300 ${
                consultaType === 'massive' ? 'bg-blue-600 text-white' : 'bg-white text-gray-800 hover:bg-gray-50'
              }`}
            >
              {t('consultationHistory.type.massive')}
            </button>
            <button
              type="button"
              onClick={() => applyQuickTypeFilter('individual')}
              className={`px-3 py-2 text-sm border-l border-gray-300 ${
                consultaType === 'individual' ? 'bg-blue-600 text-white' : 'bg-white text-gray-800 hover:bg-gray-50'
              }`}
            >
              {t('consultationHistory.type.individual')}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('consultationHistory.filters.type')}</label>
            <select
              value={consultaType}
              onChange={(e) => setConsultaType(e.target.value as 'individual' | 'massive' | '')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('consultationHistory.filters.all')}</option>
              <option value="individual">{t('consultationHistory.type.individual')}</option>
              <option value="massive">{t('consultationHistory.type.massive')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('consultationHistory.filters.rut')}</label>
            <input
              type="text"
              value={rutFilter}
              onChange={(e) => setRutFilter(e.target.value)}
              placeholder={t('consultationHistory.filters.rutPlaceholder')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('consultationHistory.filters.status')}</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('consultationHistory.filters.all')}</option>
              <option value="200">200 - {t('consultationHistory.status.success')}</option>
              <option value="400">400 - {t('consultationHistory.status.clientError')}</option>
              <option value="401">401 - {t('consultationHistory.status.unauthorized')}</option>
              <option value="500">500 - {t('consultationHistory.status.serverError')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('consultationHistory.filters.startDate')}</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('consultationHistory.filters.endDate')}</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex gap-4 mt-4">
          <button
            onClick={handleApplyFilters}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {t('consultationHistory.filters.apply')}
          </button>
          <button
            onClick={handleClearFilters}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            {t('consultationHistory.filters.clear')}
          </button>
          <button
            onClick={exportToPDF}
            disabled={consultas.length === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t('consultationHistory.exportPdf')}
          </button>
          <button
            onClick={exportAllToPDF}
            disabled={isExportingAll}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isExportingAll ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Exportando...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Exportar todo PDF
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {t('consultationHistory.resultsTitle', { total: total.toLocaleString() })}
          </h2>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">{t('consultationHistory.loading')}</span>
          </div>
        ) : error ? (
          <div className="p-6 text-center">
            <div className="text-red-600 mb-2">{t('consultationHistory.errorTitle')}</div>
            <div className="text-gray-600">{error}</div>
          </div>
        ) : consultas.length === 0 ? (
          <div className="p-6 text-center text-gray-600">
            {t('consultationHistory.noResults')}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('consultationHistory.table.date')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('consultationHistory.table.user')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('consultationHistory.table.type')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('consultationHistory.table.tag')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('consultationHistory.table.ruts')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('consultationHistory.table.status')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('consultationHistory.table.time')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('consultationHistory.table.credits')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {consultas.map((consulta) => {
                    const isMassive = consulta.consultaType === 'massive';
                    const rutsArr = Array.isArray((consulta as any).ruts) ? (consulta as any).ruts as string[] : [];
                    const isOpen = expandedIds.has(consulta._id);
                    return (
                      <React.Fragment key={consulta._id}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(consulta.createdAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {consulta.userId ? (
                              <div>
                                <div className="font-medium">{consulta.userId.name}</div>
                                <div className="text-gray-500 text-xs">{consulta.userId.email}</div>
                              </div>
                            ) : (
                              <span className="text-gray-400 italic">Usuario no disponible</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getConsultaTypeBadge(consulta.consultaType)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {consulta.metadata && (consulta.metadata.tag || consulta.metadata.evaluationType) ? (consulta.metadata.tag || consulta.metadata.evaluationType) : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {isMassive ? (
                              <button
                                onClick={() => toggleExpand(consulta._id)}
                                className="text-primary-600 hover:underline inline-flex items-center"
                              >
                                <span className="mr-1">{isOpen ? '▾' : '▸'}</span>
                                <span>{rutsArr.length} {t('consultationHistory.table.rutsShort')}</span>
                              </button>
                            ) : (
                              consulta.rut || ''
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getStatusBadge(consulta.responseStatus)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatProcessingTime(consulta.processingTime)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {consulta.creditsUsed}
                          </td>
                        </tr>
                        {isMassive && isOpen && (
                          <tr className="bg-gray-50">
                            <td className="px-6 py-4" colSpan={8}>
                              <div className="max-h-48 overflow-auto border border-gray-200 rounded">
                                <table className="min-w-full text-sm">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-gray-700">RUT</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {rutsArr.map((rut, idx) => (
                                      <tr key={idx}>
                                        <td className="px-4 py-2 text-gray-900">{rut}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  {t('consultationHistory.pagination.info', { currentPage, totalPages, total: total.toLocaleString() })}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const page = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                    return (
                      <button
                        key={page}
                        onClick={() => handlePageChange(page)}
                        className={`px-3 py-1 text-sm border rounded-md ${
                          page === currentPage
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default HistoricalConsultas;
