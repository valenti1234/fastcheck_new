import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { toast } from 'react-hot-toast';

// Componentes Dashboard
import DailyJobsSummary from '../../components/dashboard/DailyJobsSummary';
import TenantUsageSummary from '../../components/dashboard/TenantUsageSummary';
import RiskDonutChart from '../../components/dashboard/RiskDonutChart';
import ResultsTable from '../../components/dashboard/ResultsTable';
import ConsultationHistoryChart from '../../components/dashboard/ConsultationHistoryChart';
import BulkEvaluationProgressMeter from '../../components/dashboard/BulkEvaluationProgressMeter';

// Utils e Iconos
import {
  MagnifyingGlassIcon,
  DocumentArrowDownIcon,
  AdjustmentsHorizontalIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { getResults } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import logger from '../../utils/logger';

// Tipos
import { IResult as IResultBackend } from '../../../server/src/models/Result';

const duxiterLogo = '/assets/img/logo.png';

interface IResult extends Omit<IResultBackend, 'rut'> {
  _id: string;
  createdAt: string;
  razonSocial?: string;
  rut?: string;
  identifier?: string;
  noteTags?: string[];
}

// Función helper para eliminar RUTs duplicados
const removeDuplicateRuts = (data: IResult[]): IResult[] => {
  const uniqueResults = data.reduce((acc, result) => {
    const rut = result.rut || result.identifier || '';
    if (!rut) return acc;
    const existing = acc.get(rut);
    if (!existing || new Date(result.createdAt) > new Date(existing.createdAt)) {
      acc.set(rut, result);
    }
    return acc;
  }, new Map<string, IResult>());
  return Array.from(uniqueResults.values());
};

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();

  const [results, setResults] = useState<IResult[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [totalPages, setTotalPages] = useState(1);

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [riskLevelFilters, setRiskLevelFilters] = useState<string[]>([]);
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [searchFilter, setSearchFilter] = useState<string>('');

  const [appliedStartDate, setAppliedStartDate] = useState<string>('');
  const [appliedEndDate, setAppliedEndDate] = useState<string>('');
  const [appliedRiskLevels, setAppliedRiskLevels] = useState<string[]>([]);
  const [appliedTags, setAppliedTags] = useState<string[]>([]);
  const [appliedSearch, setAppliedSearch] = useState<string>('');

  const [exportingPdf, setExportingPdf] = useState(false);
  const [loadingAllData, setLoadingAllData] = useState(false);
  const [showRiskDropdown, setShowRiskDropdown] = useState(false);
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  // Nuevo estado para manejar el modo de filtros
  const [allDataForFilters, setAllDataForFilters] = useState<IResult[]>([]);
  const [isFilterMode, setIsFilterMode] = useState(false);

  // Estado para el tipo de vista del gráfico de historial
  const [chartViewType, setChartViewType] = useState<'monthly' | 'daily' | 'yearly'>('monthly');

  // Siempre mantener todos los datos para los gráficos
  const [allDataForCharts, setAllDataForCharts] = useState<IResult[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (user && tenant && !isFilterMode) {
        console.log('Fetching all data to remove duplicates');
        try {
          // Cargar todos los datos para eliminar duplicados
          let allData: IResult[] = [];
          let page = 1;
          let totalP = 1;
          do {
            const res = await getResults({
              page,
              limit: 50,
              sortField,
              sortDirection,
              ...(appliedSearch && { search: appliedSearch })
            });
            if (res?.data) allData = [...allData, ...res.data];
            totalP = res?.pagination?.totalPages || 1;
            page++;
          } while (page <= totalP);

          // Eliminar RUTs duplicados, dejando solo el más reciente
          const uniqueData = removeDuplicateRuts(allData);
          
          // Ordenar por fecha descendente
          uniqueData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          
          // Paginar manualmente
          const startIndex = (currentPage - 1) * itemsPerPage;
          const paginatedData = uniqueData.slice(startIndex, startIndex + itemsPerPage);
          
          setResults(paginatedData);
          setTotalPages(Math.ceil(uniqueData.length / itemsPerPage));
          setAllDataForCharts(uniqueData);
          
          console.log('Unique records:', uniqueData.length, 'Showing page:', currentPage);
        } catch (error) {
          logger.error('Error fetching data:', error);
        }
      }
    };
    fetchData();
  }, [user, tenant, currentPage, itemsPerPage, sortField, sortDirection, appliedSearch, isFilterMode]);

  // Cerrar dropdowns al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.relative')) {
        setShowRiskDropdown(false);
        setShowTagDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const applyFiltersToData = (data: IResult[]) => {
    return data.filter(result => {
      const resultDate = new Date(result.createdAt);
      const start = appliedStartDate ? new Date(appliedStartDate) : null;
      const end = appliedEndDate ? new Date(appliedEndDate) : null;
      if (start && resultDate < start) return false;
      if (end && resultDate > end) return false;

      // Filtro de riesgo - si hay niveles seleccionados, debe estar en la lista
      if (appliedRiskLevels.length > 0 && !appliedRiskLevels.includes(result.riskAssessment?.riskSummary?.semaphore || '')) return false;

      // Filtro de tags - si hay tags seleccionados, debe tener al menos uno
      if (appliedTags.length > 0 && (!result.noteTags || !result.noteTags.some(tag => appliedTags.includes(tag)))) return false;

      return true;
    });
  };

  // Verificar si hay filtros activos (mover antes de su uso)
  const hasActiveFilters = !!(appliedStartDate || appliedEndDate || appliedRiskLevels.length > 0 || appliedTags.length > 0 || appliedSearch);
  const hasNonSearchFilters = !!(appliedStartDate || appliedEndDate || appliedRiskLevels.length > 0 || appliedTags.length > 0);

  // Determinar qué datos mostrar
  const baseData = isFilterMode ? allDataForFilters : results;

  // Para gráficos: siempre usar todos los datos cargados
  const dataForCharts = allDataForCharts.length > 0 ? allDataForCharts : results;

  // Solo aplicar filtros si hay filtros activos (fecha, riesgo, tags)
  // En modo normal, los datos ya vienen filtrados por búsqueda desde la API
  const filteredResults = hasNonSearchFilters ? applyFiltersToData(baseData) : baseData;
  const filteredChartsData = applyFiltersToData(dataForCharts); // Siempre aplicar filtros a los gráficos

  // Paginación manual para datos filtrados (solo en modo filtro)
  const totalFilteredPages = Math.ceil(filteredResults.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedResults = isFilterMode ? filteredResults.slice(startIndex, endIndex) : filteredResults;

  console.log('Dashboard state:', {
    isFilterMode,
    hasNonSearchFilters,
    currentPage,
    baseDataLength: baseData.length,
    allDataForChartsLength: allDataForCharts.length,
    filteredResultsLength: filteredResults.length,
    filteredChartsDataLength: filteredChartsData.length,
    paginatedResultsLength: paginatedResults.length,
    totalPages: isFilterMode ? totalFilteredPages : totalPages
  });

  const uniqueTags = Array.from(new Set(baseData.flatMap(result => result.noteTags || []))).sort();
  const dailyEvaluations = filteredChartsData.filter(r => r.createdAt.startsWith(new Date().toISOString().split('T')[0])).length;

  const toggleRiskLevel = (level: string) => {
    setRiskLevelFilters(prev =>
      prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]
    );
  };

  const toggleTag = (tag: string) => {
    setTagFilters(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleApplyFilters = async () => {
    const trimmedSearch = searchFilter.trim();

    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setAppliedRiskLevels([...riskLevelFilters]);
    setAppliedTags([...tagFilters]);
    setAppliedSearch(trimmedSearch);
    setCurrentPage(1);

    // Si hay filtros de fecha, riesgo o tags, cargar todos los datos
    const needsAllData = startDate || endDate || riskLevelFilters.length > 0 || tagFilters.length > 0;

    if (needsAllData) {
      setLoadingAllData(true);
      setIsFilterMode(true);
      try {
        let allData: IResult[] = [];
        let page = 1;
        let totalP = 1;
        do {
          const res = await getResults({
            page,
            limit: 50,
            sortField,
            sortDirection,
            ...(trimmedSearch && { search: trimmedSearch })
          });
          if (res?.data) allData = [...allData, ...res.data];
          totalP = res?.pagination?.totalPages || 1;
          page++;
        } while (page <= totalP);

        // Eliminar RUTs duplicados, dejando solo el más reciente
        const uniqueData = removeDuplicateRuts(allData);

        setAllDataForFilters(uniqueData);
        toast.success(`Filtros aplicados - ${uniqueData.length} registros cargados`);
      } catch (error) {
        logger.error('Error loading all data:', error);
        toast.error('Error al cargar datos');
      } finally {
        setLoadingAllData(false);
      }
    } else {
      // Solo búsqueda o sin filtros - usar paginación normal del backend
      setIsFilterMode(false);
      setAllDataForFilters([]);
      if (trimmedSearch) {
        toast.success('Búsqueda aplicada');
      }
    }
  };

  const clearAllFilters = () => {
    setStartDate('');
    setEndDate('');
    setRiskLevelFilters([]);
    setTagFilters([]);
    setSearchFilter('');
    setAppliedStartDate('');
    setAppliedEndDate('');
    setAppliedRiskLevels([]);
    setAppliedTags([]);
    setAppliedSearch('');
    setCurrentPage(1);
    setIsFilterMode(false);
    setAllDataForFilters([]);
  };

  const removeFilter = (filterType: string, value?: string) => {
    switch (filterType) {
      case 'startDate':
        setStartDate('');
        setAppliedStartDate('');
        break;
      case 'endDate':
        setEndDate('');
        setAppliedEndDate('');
        break;
      case 'riskLevel':
        if (value) {
          const newRiskLevels = appliedRiskLevels.filter(r => r !== value);
          setRiskLevelFilters(newRiskLevels);
          setAppliedRiskLevels(newRiskLevels);
        }
        break;
      case 'tag':
        if (value) {
          const newTags = appliedTags.filter(t => t !== value);
          setTagFilters(newTags);
          setAppliedTags(newTags);
        }
        break;
      case 'search':
        setSearchFilter('');
        setAppliedSearch('');
        break;
    }
    setCurrentPage(1);

    // Verificar si aún hay filtros que requieren todos los datos
    setTimeout(() => {
      const stillNeedsAllData = (filterType === 'startDate' ? false : !!appliedStartDate) ||
        (filterType === 'endDate' ? false : !!appliedEndDate) ||
        (filterType === 'riskLevel' && value ? appliedRiskLevels.filter(r => r !== value).length > 0 : appliedRiskLevels.length > 0) ||
        (filterType === 'tag' && value ? appliedTags.filter(t => t !== value).length > 0 : appliedTags.length > 0);

      if (!stillNeedsAllData) {
        setIsFilterMode(false);
        setAllDataForFilters([]);
      }
    }, 0);
  };

  const getRiskLevelLabel = (level: string) => {
    switch (level) {
      case 'green': return 'Bajo';
      case 'yellow': return 'Medio';
      case 'orange': return 'Alto';
      case 'red': return 'Crítico';
      default: return level;
    }
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'green': return 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700';
      case 'yellow': return 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700';
      case 'orange': return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700';
      case 'red': return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700';
      default: return 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600';
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleRiskChartClick = async (riskLevel: 'green' | 'yellow' | 'orange' | 'red') => {
    // Actualizar los filtros de nivel de riesgo
    setRiskLevelFilters([riskLevel]);
    setAppliedRiskLevels([riskLevel]);
    setCurrentPage(1);

    // Cargar todos los datos para aplicar el filtro
    setLoadingAllData(true);
    setIsFilterMode(true);
    try {
      let allData: IResult[] = [];
      let page = 1;
      let totalP = 1;
      do {
        const res = await getResults({
          page,
          limit: 50,
          sortField,
          sortDirection,
          ...(appliedSearch && { search: appliedSearch })
        });
        if (res?.data) allData = [...allData, ...res.data];
        totalP = res?.pagination?.totalPages || 1;
        page++;
      } while (page <= totalP);

      // Eliminar RUTs duplicados, dejando solo el más reciente
      const uniqueData = removeDuplicateRuts(allData);

      setAllDataForFilters(uniqueData);
      toast.success(`Filtro de riesgo "${getRiskLevelLabel(riskLevel)}" aplicado`);
    } catch (error) {
      logger.error('Error loading all data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoadingAllData(false);
    }
  };

  const handleExportPDF = async () => {
    setExportingPdf(true);
    try {
      let allResults: IResult[] = [];
      let page = 1;
      let totalP = 1;
      do {
        const res = await getResults({ page, limit: 50, sortField, sortDirection, ...(appliedSearch && { search: appliedSearch }) });
        if (res?.data) allResults = [...allResults, ...res.data];
        totalP = res?.pagination?.totalPages || 1;
        page++;
      } while (page <= totalP);

      // Eliminar RUTs duplicados, dejando solo el más reciente
      const uniqueAllResults = removeDuplicateRuts(allResults);

      const finalData = applyFiltersToData(uniqueAllResults);
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
      const pageWidth = 297;
      const pageHeight = 210;
      const margin = 15;
      let currentY = margin;

      // Logo
      try {
        const logoImg = new Image();
        logoImg.crossOrigin = 'anonymous';
        await new Promise((res, rej) => {
          logoImg.onload = res; logoImg.onerror = rej;
          logoImg.src = duxiterLogo;
        });
        pdf.addImage(logoImg, 'PNG', (pageWidth - 34) / 2, currentY, 34, 16);
        currentY += 22;
      } catch (e) { currentY += 10; }

      pdf.setFontSize(16);
      pdf.text("Dashboard consultas", margin, currentY);
      currentY += 10;

      // Mostrar filtros aplicados
      if (hasActiveFilters) {
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        pdf.text("Filtros Aplicados:", margin, currentY);
        currentY += 7;
        pdf.setFontSize(9);
        pdf.setFont("helvetica", "normal");

        if (appliedStartDate) {
          pdf.text(`• Fecha Inicio: ${new Date(appliedStartDate).toLocaleDateString()}`, margin + 5, currentY);
          currentY += 5;
        }
        if (appliedEndDate) {
          pdf.text(`• Fecha Fin: ${new Date(appliedEndDate).toLocaleDateString()}`, margin + 5, currentY);
          currentY += 5;
        }
        if (appliedRiskLevels.length > 0) {
          const riskLabels = appliedRiskLevels.map(r => getRiskLevelLabel(r)).join(', ');
          pdf.text(`• Nivel de Riesgo: ${riskLabels}`, margin + 5, currentY);
          currentY += 5;
        }
        if (appliedTags.length > 0) {
          const tagsText = appliedTags.join(', ');
          pdf.text(`• Tags: ${tagsText}`, margin + 5, currentY);
          currentY += 5;
        }
        if (appliedSearch) {
          pdf.text(`• Búsqueda: "${appliedSearch}"`, margin + 5, currentY);
          currentY += 5;
        }

        currentY += 5; // Espacio extra después de filtros
      }

      // Captura de Gráficos
      const historyEl = document.getElementById('pdf-chart-history');
      if (historyEl) {
        const canvas = await html2canvas(historyEl, { scale: 2, backgroundColor: '#ffffff' });
        const chartWidth = (pageWidth - 2 * margin) * 0.8; // Reducido 20%
        const imgH = (canvas.height * chartWidth) / canvas.width;
        const xOffset = ((pageWidth - 2 * margin) - chartWidth) / 2 + margin; // Centrar
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', xOffset, currentY, chartWidth, imgH);
        currentY += imgH + 10;
      }

      const smallCharts = ['pdf-chart-risk', 'pdf-chart-daily', 'pdf-meter', 'pdf-tenant'];
      const chartW = ((pageWidth - 3 * margin) / 2) * 0.8; // Reducido 20%
      let rowMaxH = 0;

      for (let i = 0; i < smallCharts.length; i++) {
        const el = document.getElementById(smallCharts[i]);
        if (el) {
          const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff' });
          const imgH = (canvas.height * chartW) / canvas.width;
          if (currentY + imgH > pageHeight - margin) { pdf.addPage(); currentY = margin + 10; }
          const baseXPos = (i % 2 === 0) ? margin : margin + ((pageWidth - 3 * margin) / 2) + margin;
          const xOffset = baseXPos + (((pageWidth - 3 * margin) / 2) - chartW) / 2; // Centrar cada gráfico
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', xOffset, currentY, chartW, imgH);
          rowMaxH = Math.max(rowMaxH, imgH);
          if (i % 2 !== 0 || i === smallCharts.length - 1) { currentY += rowMaxH + 10; rowMaxH = 0; }
        }
      }

      // Tabla Detalle
      pdf.addPage();
      currentY = margin;
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text("Detalle de Evaluaciones", margin, currentY);
      currentY += 10;

      const cols = {
        rut: margin,
        name: margin + 35,
        tag: margin + 140,
        risk: margin + 200,
        date: margin + 245
      };

      // Header de la tabla con fondo gris
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "bold");
      pdf.setFillColor(249, 250, 251); // bg-gray-50
      pdf.setDrawColor(229, 231, 235); // border-gray-200
      pdf.rect(margin, currentY - 5, pageWidth - 2 * margin, 8, 'FD');

      pdf.setTextColor(55, 65, 81); // text-gray-700
      pdf.text("RUT", cols.rut, currentY);
      pdf.text("RAZÓN SOCIAL", cols.name, currentY);
      pdf.text("TAG", cols.tag, currentY);
      pdf.text("NIVEL DE RIESGO", cols.risk, currentY);
      pdf.text("FECHA CONSULTA", cols.date, currentY);

      currentY += 8;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(17, 24, 39); // text-gray-900

      let rowIndex = 0;
      finalData.forEach(item => {
        if (currentY > pageHeight - margin - 10) {
          pdf.addPage();
          currentY = margin + 10;

          // Repetir header en nueva página
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(9);
          pdf.setFillColor(249, 250, 251);
          pdf.setDrawColor(229, 231, 235);
          pdf.rect(margin, currentY - 5, pageWidth - 2 * margin, 8, 'FD');
          pdf.setTextColor(55, 65, 81);
          pdf.text("RUT", cols.rut, currentY);
          pdf.text("RAZÓN SOCIAL", cols.name, currentY);
          pdf.text("TAG", cols.tag, currentY);
          pdf.text("NIVEL DE RIESGO", cols.risk, currentY);
          pdf.text("FECHA CONSULTA", cols.date, currentY);
          currentY += 8;

          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8);
          pdf.setTextColor(17, 24, 39);
          rowIndex = 0;
        }

        // Fondo alternado para filas (hover effect simulado)
        if (rowIndex % 2 === 0) {
          pdf.setFillColor(255, 255, 255); // bg-white
        } else {
          pdf.setFillColor(249, 250, 251); // bg-gray-50
        }
        pdf.rect(margin, currentY - 4, pageWidth - 2 * margin, 6, 'F');

        const rut = item.rut || item.identifier || '-';
        const razonSocial = item.details?.razonSocial || item.razonSocial || '-';

        // RUT - texto negro normal
        pdf.setTextColor(17, 24, 39); // text-gray-900
        pdf.setFont("helvetica", "bold");
        pdf.text(rut, cols.rut, currentY);

        // Razón Social - texto negro normal
        pdf.setFont("helvetica", "normal");
        pdf.text(razonSocial.substring(0, 60), cols.name, currentY);

        // Tags - texto azul
        pdf.setTextColor(30, 64, 175); // text-blue-800
        pdf.text((item.noteTags?.join(', ') || '-').substring(0, 30), cols.tag, currentY);

        // Nivel de Riesgo con colores específicos
        const sem = item.riskAssessment?.riskSummary?.semaphore || 'N/A';
        const riskLabel = sem === 'red' ? 'CRÍTICO' : sem === 'orange' ? 'ALTO' : sem === 'yellow' ? 'MEDIO' : sem === 'green' ? 'BAJO' : 'N/A';

        pdf.setFont("helvetica", "bold");
        if (sem === 'red') {
          pdf.setTextColor(153, 27, 27); // text-red-800
        } else if (sem === 'orange') {
          pdf.setTextColor(154, 52, 18); // text-orange-800
        } else if (sem === 'yellow') {
          pdf.setTextColor(133, 77, 14); // text-yellow-800
        } else if (sem === 'green') {
          pdf.setTextColor(22, 101, 52); // text-green-800
        } else {
          pdf.setTextColor(31, 41, 55); // text-gray-800
        }
        pdf.text(riskLabel, cols.risk, currentY);

        // Fecha - texto gris
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(107, 114, 128); // text-gray-500
        pdf.text(new Date(item.createdAt).toLocaleDateString(), cols.date, currentY);

        currentY += 6;

        // Línea divisoria entre filas
        pdf.setDrawColor(229, 231, 235); // border-gray-200
        pdf.setLineWidth(0.1);
        pdf.line(margin, currentY - 4, pageWidth - margin, currentY - 4);

        rowIndex++;
      });

      pdf.save(`Reporte_Duxiter_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF generado");
    } catch (error) {
      console.error(error);
      toast.error("Error al generar PDF");
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="max-w-full mx-auto px-6 py-10">
      <div className="space-y-8">
        {/* Panel de Filtros */}
        <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center space-x-3 mb-6">
            <AdjustmentsHorizontalIcon className="h-6 w-6 text-primary-500" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Filtros de Búsqueda</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha Inicio</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha Fin</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nivel de Riesgo</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowRiskDropdown(!showRiskDropdown)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none text-left flex items-center justify-between focus:ring-2 focus:ring-primary-500"
                >
                  <span className="truncate">
                    {riskLevelFilters.length === 0
                      ? 'Seleccionar...'
                      : `${riskLevelFilters.length} seleccionado${riskLevelFilters.length > 1 ? 's' : ''}`
                    }
                  </span>
                  <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
                {showRiskDropdown && (
                  <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                    {[
                      { value: 'red', label: 'Crítico' },
                      { value: 'orange', label: 'Alto' },
                      { value: 'yellow', label: 'Medio' },
                      { value: 'green', label: 'Bajo' }
                    ].map(risk => (
                      <label key={risk.value} className="flex items-center space-x-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={riskLevelFilters.includes(risk.value)}
                          onChange={() => toggleRiskLevel(risk.value)}
                          className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{risk.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tags</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowTagDropdown(!showTagDropdown)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none text-left flex items-center justify-between focus:ring-2 focus:ring-primary-500"
                >
                  <span className="truncate">
                    {tagFilters.length === 0
                      ? 'Seleccionar...'
                      : `${tagFilters.length} seleccionado${tagFilters.length > 1 ? 's' : ''}`
                    }
                  </span>
                  <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
                {showTagDropdown && (
                  <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                    {uniqueTags.length > 0 ? (
                      uniqueTags.map(tag => (
                        <label key={tag} className="flex items-center space-x-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={tagFilters.includes(tag)}
                            onChange={() => toggleTag(tag)}
                            className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{tag}</span>
                        </label>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No hay tags disponibles</div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Búsqueda rápida</label>
              <div className="relative">
                <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-2.5 text-gray-400" />
                <input type="text" placeholder="RUT o Nombre..." value={searchFilter} onChange={e => setSearchFilter(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none" />
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-6 border-t border-gray-100 dark:border-gray-700 pt-6">
            <button
              onClick={handleApplyFilters}
              disabled={loadingAllData}
              className="bg-primary-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {loadingAllData ? "Aplicando..." : "Aplicar"}
            </button>
            <button onClick={clearAllFilters} className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">Limpiar</button>
            <button onClick={handleExportPDF} disabled={exportingPdf} className="flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 transition-all disabled:opacity-50">
              <DocumentArrowDownIcon className="h-5 w-5" />
              {exportingPdf ? "Generando..." : "Exportar PDF"}
            </button>
          </div>
        </div>

        {/* Filtros Activos */}
        {hasActiveFilters && (
          <div className="  p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-3">Filtros Activos:</h4>
                <div className="flex flex-wrap gap-2">
                  {appliedStartDate && (
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Desde:</span>
                      {new Date(appliedStartDate).toLocaleDateString()}
                      <button onClick={() => removeFilter('startDate')} className="ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </span>
                  )}
                  {appliedEndDate && (
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Hasta:</span>
                      {new Date(appliedEndDate).toLocaleDateString()}
                      <button onClick={() => removeFilter('endDate')} className="ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </span>
                  )}
                  {appliedRiskLevels.map(level => (
                    <span key={level} className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg  ${getRiskLevelColor(level)}`}>
                      <span className="text-xs opacity-75">Riesgo:</span>
                      {getRiskLevelLabel(level)}
                      <button onClick={() => removeFilter('riskLevel', level)} className="ml-1 opacity-75 hover:opacity-100">
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </span>
                  ))}
                  {appliedTags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Tag:</span>
                      {tag}
                      <button onClick={() => removeFilter('tag', tag)} className="ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </span>
                  ))}
                  {appliedSearch && (
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Búsqueda:</span>
                      "{appliedSearch}"
                      <button onClick={() => removeFilter('search')} className="ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={clearAllFilters}
                className="ml-4 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 whitespace-nowrap"
              >
                Limpiar todos
              </button>
            </div>
          </div>
        )}

        {/* Layout Dashboard */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Información de registros filtrados */}
            {isFilterMode && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-semibold text-blue-900 dark:text-blue-300">
                        Filtros Aplicados
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-400">
                        Mostrando <span className="font-bold">{filteredResults.length}</span> de <span className="font-bold">{allDataForFilters.length}</span> registros totales
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {filteredResults.length}
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      resultados
                    </p>
                  </div>
                </div>
              </div>
            )}

            <ResultsTable
              results={paginatedResults as IResult[]}
              currentPage={currentPage}
              totalPages={isFilterMode ? totalFilteredPages : totalPages}
              onPageChange={setCurrentPage}
              onSort={handleSort}
              sortField={sortField}
              sortDirection={sortDirection}
            />
            <div id="pdf-chart-history" className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Historial de Consultas</h3>
                <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                  <label className="flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-gray-200 dark:hover:bg-gray-600">
                    <input
                      type="radio"
                      name="chartViewType"
                      value="monthly"
                      checked={chartViewType === 'monthly'}
                      onChange={() => setChartViewType('monthly')}
                      className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                    />
                    <span className={`text-sm font-medium ${chartViewType === 'monthly' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'}`}>
                      Mensual
                    </span>
                  </label>
                  <label className="flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-gray-200 dark:hover:bg-gray-600">
                    <input
                      type="radio"
                      name="chartViewType"
                      value="daily"
                      checked={chartViewType === 'daily'}
                      onChange={() => setChartViewType('daily')}
                      className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                    />
                    <span className={`text-sm font-medium ${chartViewType === 'daily' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'}`}>
                      Diaria
                    </span>
                  </label>
                  <label className="flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-gray-200 dark:hover:bg-gray-600">
                    <input
                      type="radio"
                      name="chartViewType"
                      value="yearly"
                      checked={chartViewType === 'yearly'}
                      onChange={() => setChartViewType('yearly')}
                      className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                    />
                    <span className={`text-sm font-medium ${chartViewType === 'yearly' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'}`}>
                      Anual
                    </span>
                  </label>
                </div>
              </div>

              <ConsultationHistoryChart results={filteredChartsData} viewType={chartViewType} />
            </div>
          </div>

          <div className="space-y-8">
            <div id="pdf-chart-risk"><RiskDonutChart results={filteredChartsData} onRiskClick={handleRiskChartClick} /></div>
            <div id="pdf-chart-daily"><DailyJobsSummary daily={dailyEvaluations} /></div>
            <div id="pdf-meter"><BulkEvaluationProgressMeter /></div>
            <div id="pdf-tenant"><TenantUsageSummary /></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
