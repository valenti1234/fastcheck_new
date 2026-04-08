import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getResults, deleteResult } from '../services/api';
import { IResult as IResultBackend } from '../../server/src/models/Result';
import logger from '../utils/logger';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';

interface IResult extends IResultBackend {
  _id: string;
  createdAt: string;
  isPep?: boolean;
  notesCount?: number;
  noteSummary?: string;
  noteTags?: string[];
}

const Consultas: React.FC = () => {
  const [allResults, setAllResults] = useState<IResult[]>([]);
  const [displayedResults, setDisplayedResults] = useState<IResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [totalResults, setTotalResults] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Función para limpiar el RUT (eliminar guión y dígito verificador)
  const cleanRutForApi = (searchValue: string): string => {
    const trimmed = searchValue.trim();
    // Detectar si tiene formato de RUT (contiene guión)
    if (trimmed.includes('-')) {
      // Eliminar el guión y todo lo que viene después (dígito verificador)
      return trimmed.split('-')[0];
    }
    return trimmed;
  };

  // ESTADOS PARA EXPORTACIÓN
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedRiskLevels, setSelectedRiskLevels] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const [appliedStartDate, setAppliedStartDate] = useState<string>('');
  const [appliedEndDate, setAppliedEndDate] = useState<string>('');
  const [appliedRiskLevels, setAppliedRiskLevels] = useState<string[]>([]);
  const [appliedTags, setAppliedTags] = useState<string[]>([]);
  const [appliedSearchTerm, setAppliedSearchTerm] = useState<string>('');

  const [showRiskDropdown, setShowRiskDropdown] = useState(false);
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  // NUEVOS ESTADOS PARA "APLICAR A TODAS LAS PÁGINAS"
  const [isLoadingAllPages, setIsLoadingAllPages] = useState(false);
  const [allPagesProgress, setAllPagesProgress] = useState(0);
  const [allPagesLoaded, setAllPagesLoaded] = useState(false);
  const [fullDataset, setFullDataset] = useState<IResult[]>([]);

  const { t } = useTranslation();

  const hasLocalFilters = useMemo(() => {
    return appliedStartDate || appliedEndDate || appliedRiskLevels.length > 0 || appliedTags.length > 0 || appliedSearchTerm;
  }, [appliedStartDate, appliedEndDate, appliedRiskLevels, appliedTags, appliedSearchTerm]);

  const applySorting = useMemo(() => {
    return (results: IResult[]) => {
      return [...results].sort((a, b) => {
        if (sortField === 'riskLevel') {
          const riskOrder: any = {
            'red': 1, 'orange': 2, 'yellow': 3, 'green': 4, 'unknown': 5,
            '': 5, 'undefined': 5, 'null': 5
          };
          const riskLevelA = a.riskAssessment?.riskSummary?.semaphore || 'unknown';
          const riskLevelB = b.riskAssessment?.riskSummary?.semaphore || 'unknown';
          const orderA = riskOrder[riskLevelA] || 5;
          const orderB = riskOrder[riskLevelB] || 5;
          return sortDirection === 'asc' ? orderA - orderB : orderB - orderA;
        }

        if (sortField === 'tag') {
          const tagA = a.noteTags && a.noteTags.length > 0 ? a.noteTags[0] : '';
          const tagB = b.noteTags && b.noteTags.length > 0 ? b.noteTags[0] : '';
          return sortDirection === 'asc' ? tagA.localeCompare(tagB) : tagB.localeCompare(tagA);
        }

        let valueA, valueB;
        switch (sortField) {
          case 'rut':
            valueA = a.rut || a.details?.rut || '';
            valueB = b.rut || b.details?.rut || '';
            break;
          case 'razonSocial':
            valueA = a.details?.razonSocial || '';
            valueB = b.details?.razonSocial || '';
            break;
          case 'createdAt':
            valueA = new Date(a.createdAt).getTime();
            valueB = new Date(b.createdAt).getTime();
            break;
          default:
            return 0;
        }

        if (typeof valueA === 'string' && typeof valueB === 'string') {
          return sortDirection === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
        } else {
          return sortDirection === 'asc' ? (valueA as number) - (valueB as number) : (valueB as number) - (valueA as number);
        }
      });
    };
  }, [sortField, sortDirection]);

  const checkRowVisibility = (result: IResult) => {
    // Filtro de búsqueda local (RUT/Razón Social)
    if (appliedSearchTerm.trim()) {
      const search = appliedSearchTerm.toLowerCase();
      const rut = (result.rut || result.details?.rut || '').toLowerCase();
      const razonSocial = (result.details?.razonSocial || '').toLowerCase();

      if (!rut.includes(search) && !razonSocial.includes(search)) {
        return false;
      }
    }

    if (appliedStartDate) {
      const start = new Date(appliedStartDate);
      const resultDate = new Date(result.createdAt);
      if (resultDate < start) return false;
    }
    if (appliedEndDate) {
      const end = new Date(appliedEndDate);
      const resultDate = new Date(result.createdAt);
      if (resultDate > end) return false;
    }
    if (appliedRiskLevels.length > 0) {
      const level = result.riskAssessment?.riskSummary?.semaphore || 'unknown';
      if (!appliedRiskLevels.includes(level)) return false;
    }
    if (appliedTags.length > 0) {
      if (!result.noteTags || !result.noteTags.some(tag => appliedTags.includes(tag))) return false;
    }
    return true;
  };

  useEffect(() => {
    const fetchResults = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await getResults({
          page: currentPage,
          limit: itemsPerPage,
          search: cleanRutForApi(debouncedSearch),
          sortField: undefined,
          sortDirection: undefined
        });
        const { data, pagination } = response || {};
        if (Array.isArray(data)) {
          setAllResults(data as IResult[]);
          setDisplayedResults(data as IResult[]);
        } else {
          setAllResults([]);
          setDisplayedResults([]);
        }
        setTotalResults(pagination?.total || 0);
        setTotalPages(pagination?.totalPages || 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar los datos');
        logger.error('Error fetching results:', err);
      } finally {
        setIsLoading(false);
      }
    };

    // Solo cargar si no estamos en modo "todas las páginas"
    if (!allPagesLoaded) {
      fetchResults();
    }
  }, [currentPage, itemsPerPage, debouncedSearch, allPagesLoaded]);

  useEffect(() => {
    if (allResults.length > 0) {
      const sortedResults = applySorting(allResults);
      setDisplayedResults(sortedResults);
    } else {
      setDisplayedResults([]);
    }
  }, [allResults, applySorting]);

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

  // NUEVA FUNCIÓN: Cargar todas las páginas
  const loadAllPages = async (searchQuery: string) => {
    try {
      setIsLoadingAllPages(true);
      setAllPagesProgress(0);
      let allData: IResult[] = [];
      let currentLoadPage = 1;

      // Obtener el total de páginas primero
      const firstResponse = await getResults({
        page: 1,
        limit: itemsPerPage,
        search: cleanRutForApi(searchQuery),
        sortField: undefined,
        sortDirection: undefined
      });

      const totalPagesToLoad = firstResponse?.pagination?.totalPages || 1;

      if (firstResponse?.data && Array.isArray(firstResponse.data)) {
        allData = [...(firstResponse.data as IResult[])];
      }

      setAllPagesProgress(Math.round((1 / totalPagesToLoad) * 100));

      // Cargar el resto de páginas
      for (let page = 2; page <= totalPagesToLoad; page++) {
        const response = await getResults({
          page: page,
          limit: itemsPerPage,
          search: cleanRutForApi(searchQuery),
          sortField: undefined,
          sortDirection: undefined
        });

        if (response?.data && Array.isArray(response.data)) {
          allData = [...allData, ...(response.data as IResult[])];
        }

        setAllPagesProgress(Math.round((page / totalPagesToLoad) * 100));
      }

      setFullDataset(allData);
      setAllPagesLoaded(true);
      setAllResults(allData);

      logger.info(`Loaded all pages: ${allData.length} total results`);

    } catch (err) {
      logger.error('Error loading all pages:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar todas las páginas');
    } finally {
      setIsLoadingAllPages(false);
      setAllPagesProgress(0);
    }
  };

  const exportToExcel = async () => {
    try {
      setIsExporting(true);
      setExportProgress(0);
      let allExportResults: IResult[] = [];
      let currentExportPage = 1;
      while (currentExportPage <= totalPages) {
        const response = await getResults({
          page: currentExportPage,
          limit: itemsPerPage,
          search: cleanRutForApi(debouncedSearch),
          sortField: undefined,
          sortDirection: undefined
        });
        if (response?.data && Array.isArray(response.data)) {
          allExportResults = [...allExportResults, ...(response.data as IResult[])];
        }
        // CALCULO DE %
        setExportProgress(Math.round((currentExportPage / totalPages) * 100));
        currentExportPage++;
      }
      const filteredResults = allExportResults.filter(r => checkRowVisibility(r));
      const sortedForExport = applySorting(filteredResults);
      const exportData = sortedForExport.map(r => ({
        "RUT": r.rut || r.details?.rut || '',
        "Razón Social": r.details?.razonSocial || '',
        "Fecha Consulta": new Date(r.createdAt).toLocaleDateString(),
        "Nivel de Riesgo": getRiskLevelDisplayName(r.riskAssessment?.riskSummary?.semaphore || ''),
        "Tag": r.noteTags && r.noteTags.length > 0 ? r.noteTags.join(', ') : '-'
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Consultas");
      XLSX.writeFile(wb, `Consultas_Duxiter_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      logger.error('Error exporting to Excel:', err);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const uniqueRiskLevels = useMemo(() => {
    const levels = new Set<string>();
    const dataSource = allPagesLoaded ? fullDataset : allResults;
    dataSource.forEach(result => {
      const level = result.riskAssessment?.riskSummary?.semaphore || 'unknown';
      levels.add(level);
    });
    return Array.from(levels);
  }, [allResults, fullDataset, allPagesLoaded]);

  const uniqueTags = useMemo(() => {
    const tags = new Set<string>();
    const dataSource = allPagesLoaded ? fullDataset : allResults;
    dataSource.forEach(result => {
      if (result.noteTags && result.noteTags.length > 0) {
        result.noteTags.forEach(tag => tags.add(tag));
      }
    });
    return Array.from(tags);
  }, [allResults, fullDataset, allPagesLoaded]);

  const toggleRiskLevel = (level: string) => {
    setSelectedRiskLevels(prev =>
      prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]
    );
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleDeleteClick = (id: string) => {
    setDeleteId(id);
    setShowDeleteModal(true);
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteResult(deleteId);
      setAllResults(prev => prev.filter(result => result._id !== deleteId));
      if (allPagesLoaded) {
        setFullDataset(prev => prev.filter(result => result._id !== deleteId));
      }
      setShowDeleteModal(false);
    } catch (err) {
      logger.error('Error deleting result:', err);
      setDeleteError(err instanceof Error ? err.message : 'Error deleting result');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteModal(false);
    setDeleteId(null);
    setDeleteError(null);
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleApplyFilters = () => {
    // Solo aplica filtros locales en la página actual
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setAppliedRiskLevels([...selectedRiskLevels]);
    setAppliedTags([...selectedTags]);
    setAppliedSearchTerm(searchTerm.trim());
    // NO modificamos debouncedSearch aquí para no triggear el useEffect que llama al servidor
  };

  // NUEVA FUNCIÓN: Aplicar filtros después de cargar todas las páginas
  const handleApplyFiltersAllPages = async () => {
    const searchQuery = cleanRutForApi(searchTerm);

    // Primero cargar todas las páginas con el filtro de búsqueda
    await loadAllPages(searchQuery);

    // Luego aplicar los filtros locales
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setAppliedRiskLevels([...selectedRiskLevels]);
    setAppliedTags([...selectedTags]);
    setAppliedSearchTerm(searchQuery);
    setDebouncedSearch(searchQuery);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedRiskLevels([]);
    setSelectedTags([]);
    setSearchTerm('');
    setAppliedStartDate('');
    setAppliedEndDate('');
    setAppliedRiskLevels([]);
    setAppliedTags([]);
    setAppliedSearchTerm('');
    setDebouncedSearch('');
    setAllPagesLoaded(false);
    setFullDataset([]);
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  };

  const clearSingleFilter = (filterType: string, value?: string) => {
    switch (filterType) {
      case 'startDate':
        setStartDate('');
        setAppliedStartDate('');
        break;
      case 'endDate':
        setEndDate('');
        setAppliedEndDate('');
        break;
      case 'risk':
        if (value) {
          const newRiskLevels = appliedRiskLevels.filter(r => r !== value);
          setSelectedRiskLevels(newRiskLevels);
          setAppliedRiskLevels(newRiskLevels);
        }
        break;
      case 'tag':
        if (value) {
          const newTags = appliedTags.filter(t => t !== value);
          setSelectedTags(newTags);
          setAppliedTags(newTags);
        }
        break;
      case 'search':
        setSearchTerm('');
        setAppliedSearchTerm('');
        setDebouncedSearch('');
        break;
    }
  };

  const handlePreviousPage = () => { if (currentPage > 1) setCurrentPage(currentPage - 1); };
  const handleNextPage = () => { if (currentPage < totalPages) setCurrentPage(currentPage + 1); };

  const visibleItemsCount = useMemo(() => {
    return displayedResults.filter(checkRowVisibility).length;
  }, [displayedResults, appliedSearchTerm, appliedStartDate, appliedEndDate, appliedRiskLevels, appliedTags]);

  const hiddenItemsCount = displayedResults.length - visibleItemsCount;
  const isSortedBy = (key: string) => sortField === key;

  const getRiskLevelClass = (riskLevel: string) => {
    switch (riskLevel) {
      case 'red': return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
      case 'yellow': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
      case 'green': return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const getRiskLevelDisplayName = (riskLevel: string) => {
    switch (riskLevel) {
      case 'red': return t('risk.critical', { defaultValue: 'Crítico' });
      case 'yellow': return t('risk.medium', { defaultValue: 'Medio' });
      case 'green': return t('risk.low', { defaultValue: 'Bajo' });
      case 'orange': return t('risk.high', { defaultValue: 'Alto' });
      default: return riskLevel || t('common.notAvailable', { defaultValue: 'No disponible' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-white">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary-500 mb-4"></div>
        <h2 className="text-xl font-semibold">{t('consultas.loading')}</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <h2 className="text-xl font-semibold text-red-500">{error}</h2>
      </div>
    );
  }

 return (
    <>
      <div className="max-w-7xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">{t('consultas.title')}</h1>

        <div className="mb-6 bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha Inicio</label>
              <input type="date" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha Final</label>
              <input type="date" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nivel de Riesgo</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowRiskDropdown(!showRiskDropdown)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {selectedRiskLevels.length === 0
                      ? 'Seleccionar...'
                      : `${selectedRiskLevels.length} seleccionado${selectedRiskLevels.length > 1 ? 's' : ''}`
                    }
                  </span>
                  <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
                {showRiskDropdown && (
                  <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                    {uniqueRiskLevels.map((level) => (
                      <label key={level} className="flex items-center space-x-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedRiskLevels.includes(level)}
                          onChange={() => toggleRiskLevel(level)}
                          className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{getRiskLevelDisplayName(level)}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tag Cliente</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowTagDropdown(!showTagDropdown)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {selectedTags.length === 0
                      ? 'Seleccionar...'
                      : `${selectedTags.length} seleccionado${selectedTags.length > 1 ? 's' : ''}`
                    }
                  </span>
                  <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
                {showTagDropdown && (
                  <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                    {uniqueTags.length > 0 ? (
                      uniqueTags.map((tag) => (
                        <label key={tag} className="flex items-center space-x-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedTags.includes(tag)}
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
          </div>

          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-grow">
              <input type="text" placeholder={t('consultas.searchPlaceholder')} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={handleApplyFilters} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-md text-white transition-colors">Aplicar Filtros</button>
              <button
                onClick={handleApplyFiltersAllPages}
                disabled={isLoadingAllPages}
                className={`px-4 py-2 rounded-md text-white transition-colors ${isLoadingAllPages ? 'bg-purple-800 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}
              >
                {isLoadingAllPages ? `Cargando ${allPagesProgress}%` : 'Aplicar Todas las Páginas'}
              </button>
              <button onClick={handleResetFilters} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md text-gray-800 dark:text-gray-200 transition-colors">Limpiar Filtros</button>
              <button
                onClick={exportToExcel}
                disabled={isExporting}
                className={`px-4 py-2 rounded-md text-white transition-colors ${isExporting ? 'bg-green-800 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {isExporting ? `Exportando ${exportProgress}%` : 'Exportar Excel'}
              </button>
            </div>
          </div>

          {/* Indicador cuando se han cargado todas las páginas */}
          {allPagesLoaded && (
            <div className="mt-4 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium text-purple-800 dark:text-purple-300">
                  Modo: Todas las páginas cargadas ({fullDataset.length} resultados totales)
                </span>
              </div>
            </div>
          )}

          {/* INDICADOR DE FILTROS ACTIVOS */}
          {(hasLocalFilters || debouncedSearch) && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400 mr-2">Filtros activos:</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {appliedSearchTerm && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                    Búsqueda: "{appliedSearchTerm}"
                    <button onClick={() => clearSingleFilter('search')} className="ml-2 hover:text-gray-500">×</button>
                  </span>
                )}
                {appliedStartDate && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300">
                    Desde: {appliedStartDate}
                    <button onClick={() => clearSingleFilter('startDate')} className="ml-2 hover:text-primary-500">×</button>
                  </span>
                )}
                {appliedEndDate && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300">
                    Hasta: {appliedEndDate}
                    <button onClick={() => clearSingleFilter('endDate')} className="ml-2 hover:text-primary-500">×</button>
                  </span>
                )}
                {appliedRiskLevels.map(level => (
                  <span key={level} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300">
                    Riesgo: {getRiskLevelDisplayName(level)}
                    <button onClick={() => clearSingleFilter('risk', level)} className="ml-2 hover:text-primary-500">×</button>
                  </span>
                ))}
                {appliedTags.map(tag => (
                  <span key={tag} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300">
                    Tag: {tag}
                    <button onClick={() => clearSingleFilter('tag', tag)} className="ml-2 hover:text-primary-500">×</button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* FIX: overflow-x-auto dentro del contenedor para evitar que la última columna se corte */}
        <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  {/* FIX: onClick corregido a handleSort('rut') */}
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" onClick={() => handleSort('rut')}>
                    {t('consultas.rut', { defaultValue: 'Rut' })} {isSortedBy('rut') && <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                  {/* FIX: min-w para que la columna no colapse */}
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 min-w-[180px]" onClick={() => handleSort('razonSocial')}>
                    {t('consultas.razonSocial', { defaultValue: 'Razón Social' })} {isSortedBy('razonSocial') && <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" onClick={() => handleSort('createdAt')}>
                    {t('consultas.fechaCreacion', { defaultValue: 'Fecha Consulta' })} {isSortedBy('createdAt') && <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" onClick={() => handleSort('riskLevel')}>
                    {t('consultas.nivelRiesgo', { defaultValue: 'Nivel de Riesgo' })} {isSortedBy('riskLevel') && <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" onClick={() => handleSort('tag')}>
                    {t('consultas.tag', { defaultValue: 'Tag' })} {isSortedBy('tag') && <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('consultas.acciones', { defaultValue: 'Acciones' })}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {displayedResults.map((result) => {
                  if (!checkRowVisibility(result)) return null;
                  return (
                    <tr key={result._id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link to={`/consultas/${result._id}`} className="text-sm text-primary-600 hover:underline">{result.rut || result.details?.rut}</Link>
                      </td>
                      {/* FIX: sin whitespace-nowrap + break-words + max-w para salto de línea */}
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 dark:text-gray-100 break-words max-w-xs">
                          {result.details?.razonSocial}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-gray-100">{new Date(result.createdAt).toLocaleDateString()}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full ${getRiskLevelClass(result.riskAssessment?.riskSummary?.semaphore || 'unknown')}`}>
                          {getRiskLevelDisplayName(result.riskAssessment?.riskSummary?.semaphore || '')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          {result.noteTags && result.noteTags.length > 0 ? (
                            result.noteTags.map((tag, idx) => (
                              <span key={`${result._id}-tag-${idx}`} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">{tag}</span>
                            ))
                          ) : (<span className="text-sm text-gray-900 dark:text-gray-100">-</span>)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex space-x-4">
                          <Link to={`/consultas/${result._id}`} className="flex items-center gap-1 text-primary-500 hover:text-primary-300 dark:text-primary-400 dark:hover:text-primary-300">
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </Link>
                          <button onClick={() => handleDeleteClick(result._id)} className="text-red-500 hover:text-red-300">
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visibleItemsCount === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {displayedResults.length > 0 ? 'Hay resultados en esta página pero están ocultos por los filtros.' : 'No se encontraron resultados'}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col md:flex-row items-center justify-between">
          <div className="text-sm text-gray-700 dark:text-gray-300 mb-2 md:mb-0">
            {allPagesLoaded ? (
              <>
                Mostrando todos los resultados | Total: {fullDataset.length}
                {hasLocalFilters && (
                  <span className="ml-2 font-semibold text-primary-600 dark:text-primary-400">
                    ({visibleItemsCount} visibles después de filtros)
                  </span>
                )}
              </>
            ) : (
              <>
                Mostrando página {currentPage} de {totalPages} | Total en servidor: {totalResults}
                {hasLocalFilters && (
                  <span className="ml-2 font-semibold text-primary-600 dark:text-primary-400">
                    (En esta página: {visibleItemsCount} visibles, {hiddenItemsCount} ocultos)
                  </span>
                )}
              </>
            )}
          </div>
          {!allPagesLoaded && (
            <div className="flex gap-2">
              <button onClick={handlePreviousPage} disabled={currentPage === 1} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">{t('common.previous')}</button>
              <button onClick={handleNextPage} disabled={currentPage === totalPages} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">{t('common.next')}</button>
            </div>
          )}
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{t('consultas.deleteConfirmTitle', { defaultValue: 'Confirmar eliminación' })}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('consultas.deleteConfirmMessage', { defaultValue: '¿Estás seguro de que deseas eliminar este resultado? Esta acción no se puede deshacer.' })}</p>
            {deleteError && <p className="text-sm text-red-600 mb-4">{deleteError}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={handleCancelDelete} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md text-gray-800 dark:text-gray-200 transition-colors" disabled={isDeleting}>{t('common.cancel')}</button>
              <button onClick={handleConfirmDelete} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md text-white transition-colors flex items-center" disabled={isDeleting}>
                {isDeleting && (
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Consultas;
