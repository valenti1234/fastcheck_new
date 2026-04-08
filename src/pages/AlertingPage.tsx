import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getResults, deleteResult } from '../services/api';
import { IResult as IResultBackend } from '../../server/src/models/Result';
import { monitoringService, CreateMonitoringScheduleRequest } from '../services/monitoringService';
import logger from '../utils/logger';
import { useTranslation } from 'react-i18next';

interface IResult extends IResultBackend {
  _id: string;
  createdAt: string;
}

const AlertingPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [results, setResults] = useState<IResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  
  // Monitoring states
  const [monitoringStatus, setMonitoringStatus] = useState<Record<string, boolean>>({});
  const [monitoringLoading, setMonitoringLoading] = useState<Record<string, boolean>>({});
  const [monitoringError, setMonitoringError] = useState<string | null>(null);
  
  // Filter states
  const [selectedRiskLevels, setSelectedRiskLevels] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Helper functions - moved to top to avoid initialization issues
  const getDateLocale = () => {
    const lang = i18n.language || 'en';
    if (lang.startsWith('es')) return 'es-CL';
    if (lang.startsWith('pt')) return 'pt-PT';
    if (lang.startsWith('fr')) return 'fr-FR';
    return 'en-US';
  };

  const getRiskLevelClass = (riskLevel: string) => {
    switch (riskLevel?.toLowerCase()) {
      case 'red':
      case 'critical':
      case 'critico':
        return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
      case 'yellow':
      case 'medium':
      case 'medio':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
      case 'green':
      case 'low':
      case 'bajo':
        return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
      case 'orange':
      case 'high':
      case 'alto':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300';
      default:
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300';
    }
  };

  const getRiskLevelDisplayName = (riskLevel: string) => {
    switch (riskLevel?.toLowerCase()) {
      case 'red':
      case 'critical':
      case 'critico':
        return t('alerting.riskLevels.red');
      case 'yellow':
      case 'medium':
      case 'medio':
        return t('alerting.riskLevels.yellow');
      case 'green':
      case 'low':
      case 'bajo':
        return t('alerting.riskLevels.green');
      case 'orange':
      case 'high':
      case 'alto':
        return t('alerting.riskLevels.orange');
      default:
        return riskLevel || t('common.notAvailable');
    }
  };

  const getAlertPriority = (riskLevel: string) => {
    switch (riskLevel?.toLowerCase()) {
      case 'red':
      case 'critical':
      case 'critico':
        return 'urgent';
      case 'orange':
      case 'high':
      case 'alto':
        return 'high';
      case 'yellow':
      case 'medium':
      case 'medio':
        return 'medium';
      default:
        return 'medium';
    }
  };

  // Function to check monitoring status for all RUTs
  const checkMonitoringStatus = async (ruts: string[]) => {
    const statusMap: Record<string, boolean> = {};
    
    for (const rut of ruts) {
      try {
        const schedule = await monitoringService.getMonitoringScheduleByRut(rut);
        statusMap[rut] = schedule !== null && schedule.isActive;
      } catch (error) {
        logger.error(`Error checking monitoring status for RUT ${rut}:`, error);
        statusMap[rut] = false;
      }
    }
    
    setMonitoringStatus(statusMap);
  };

  // Function to handle adding RUT to monitoring
  const handleAddToMonitoring = async (rut: string, companyName?: string) => {
    setMonitoringLoading(prev => ({ ...prev, [rut]: true }));
    setMonitoringError(null);
    
    try {
      // First check if a monitoring schedule already exists for this RUT
      const existingSchedule = await monitoringService.getMonitoringScheduleByRut(rut);
      
      if (existingSchedule) {
        // Validate that the schedule has a valid ID
        if (!existingSchedule._id || existingSchedule._id === 'undefined' || existingSchedule._id.trim() === '') {
          throw new Error('Invalid schedule ID found in existing schedule');
        }

        // If schedule exists but is inactive, reactivate it
        if (!existingSchedule.isActive) {
          await monitoringService.resumeMonitoringSchedule(existingSchedule._id);
          setMonitoringStatus(prev => ({ ...prev, [rut]: true }));
        } else {
          // Schedule already exists and is active
          setMonitoringStatus(prev => ({ ...prev, [rut]: true }));
        }
      } else {
        // Create new monitoring schedule
        const monitoringData: CreateMonitoringScheduleRequest = {
          rut,
          frequency: 'daily', // Default frequency
          companyName
        };
        
        await monitoringService.createMonitoringSchedule(monitoringData);
        setMonitoringStatus(prev => ({ ...prev, [rut]: true }));
      }
    } catch (error) {
      logger.error('Error adding RUT to monitoring:', error);
      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes('409') || error.message.includes('conflict')) {
          setMonitoringError(t('alerting.monitoring.alreadyMonitored'));
        } else if (error.message.includes('404')) {
          setMonitoringError(t('alerting.monitoring.notFound'));
        } else {
          setMonitoringError(error.message);
        }
      } else {
        setMonitoringError(t('alerting.monitoring.addError'));
      }
    } finally {
      setMonitoringLoading(prev => ({ ...prev, [rut]: false }));
    }
  };

  // Function to handle removing RUT from monitoring
  const handleRemoveFromMonitoring = async (rut: string) => {
    setMonitoringLoading(prev => ({ ...prev, [rut]: true }));
    setMonitoringError(null);
    
    try {
      const schedule = await monitoringService.getMonitoringScheduleByRut(rut);
      if (schedule) {
        // Validate that the schedule has a valid ID
        if (!schedule._id || schedule._id === 'undefined' || schedule._id.trim() === '') {
          throw new Error('Invalid schedule ID found in monitoring schedule');
        }

        // Pause monitoring instead of deleting to preserve history
        await monitoringService.pauseMonitoringSchedule(schedule._id);
        setMonitoringStatus(prev => ({ ...prev, [rut]: false }));
      } else {
        // No schedule found, update status anyway
        setMonitoringStatus(prev => ({ ...prev, [rut]: false }));
      }
    } catch (error) {
      logger.error('Error removing RUT from monitoring:', error);
      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes('404')) {
          setMonitoringError(t('alerting.monitoring.scheduleNotFound'));
        } else {
          setMonitoringError(error.message);
        }
      } else {
        setMonitoringError(t('alerting.monitoring.removeError'));
      }
    } finally {
      setMonitoringLoading(prev => ({ ...prev, [rut]: false }));
    }
  };

  useEffect(() => {
    const fetchResults = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await getResults();
        if (Array.isArray(data)) {
          // Filter for all risk results that should trigger alerts
          const alertingResults = (data as IResult[]).filter(result => {
            // Check multiple possible risk level fields
            const semaphore = result.riskAssessment?.riskSummary?.semaphore;
            const duxiterRiskLevel = result.duxiterRiskLevel;
            
            // Include results with any risk indicators (including low/bajo)
            return (
              semaphore === 'red' || 
              semaphore === 'orange' ||
              semaphore === 'yellow' ||
              semaphore === 'green' ||
              duxiterRiskLevel === 'red' ||
              duxiterRiskLevel === 'orange' ||
              duxiterRiskLevel === 'yellow' ||
              duxiterRiskLevel === 'green' ||
              duxiterRiskLevel === 'high' ||
              duxiterRiskLevel === 'medium' ||
              duxiterRiskLevel === 'low' ||
              duxiterRiskLevel === 'bajo' ||
              duxiterRiskLevel === 'critical' ||
              duxiterRiskLevel === 'critico' ||
              duxiterRiskLevel === 'alto' ||
              duxiterRiskLevel === 'medio' ||
              // If no clear risk level is found, include it for now to debug
              (!semaphore && !duxiterRiskLevel)
            );
          });
          setResults(alertingResults);
          
          // Check monitoring status for all RUTs
          const ruts = alertingResults.map(result => result.details?.rut).filter(Boolean) as string[];
          if (ruts.length > 0) {
            await checkMonitoringStatus(ruts);
          }
        } else {
          throw new Error(t('alerting.errors.invalidData'));
      }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('alerting.errors.loadingData'));
        logger.error('Error fetching results:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchResults();
  }, []);

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
      // Remove the deleted result from the state
      setResults(prevResults => prevResults.filter(result => result._id !== deleteId));
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
      // If already sorting by this field, toggle direction
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // If sorting by a new field, set it and default to ascending
      setSortField(field);
      setSortDirection('asc');
    }
    // Reset to first page when sorting changes
    setCurrentPage(1);
  };

  const filteredResults = results.filter(result => {
    // Search term filter
    const searchTermLower = searchTerm.toLowerCase();
    const rut = result.details?.rut?.toLowerCase() || '';
    const razonSocial = result.details?.razonSocial?.toLowerCase() || '';
    const matchesSearch = !searchTerm || rut.includes(searchTermLower) || razonSocial.includes(searchTermLower);
    
    // Risk level filter
    const riskLevel = result.riskAssessment?.riskSummary?.semaphore || result.duxiterRiskLevel || 'unknown';
    const matchesRiskLevel = selectedRiskLevels.length === 0 || selectedRiskLevels.includes(riskLevel);
    
    // Priority filter
    const priority = getAlertPriority(riskLevel);
    const matchesPriority = selectedPriorities.length === 0 || selectedPriorities.includes(priority);
    
    // Date range filter
    const resultDate = new Date(result.createdAt);
    const fromDate = dateFrom ? new Date(dateFrom) : null;
    const toDate = dateTo ? new Date(dateTo + 'T23:59:59') : null; // Include full day
    const matchesDateRange = (!fromDate || resultDate >= fromDate) && (!toDate || resultDate <= toDate);
    
    return matchesSearch && matchesRiskLevel && matchesPriority && matchesDateRange;
  });

  const sortedResults = [...filteredResults].sort((a, b) => {
    let valueA: any;
    let valueB: any;

    // Extract values based on sort field
    switch (sortField) {
      case 'rut':
        valueA = a.details?.rut || '';
        valueB = b.details?.rut || '';
        break;
      case 'razonSocial':
        valueA = a.details?.razonSocial || '';
        valueB = b.details?.razonSocial || '';
        break;
      case 'createdAt':
        valueA = new Date(a.createdAt).getTime();
        valueB = new Date(b.createdAt).getTime();
        break;
      case 'riskLevel':
        valueA = a.riskAssessment?.riskSummary?.semaphore || a.duxiterRiskLevel || '';
        valueB = b.riskAssessment?.riskSummary?.semaphore || b.duxiterRiskLevel || '';
        break;
      default:
        valueA = a[sortField as keyof IResult] || '';
        valueB = b[sortField as keyof IResult] || '';
    }

    // Compare values based on sort direction
    if (valueA < valueB) return sortDirection === 'asc' ? -1 : 1;
    if (valueA > valueB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const paginatedResults = sortedResults.slice(indexOfFirstItem, indexOfLastItem);

  // Filter helper functions
  const handleRiskLevelFilter = (riskLevel: string) => {
    setSelectedRiskLevels(prev => 
      prev.includes(riskLevel) 
        ? prev.filter(level => level !== riskLevel)
        : [...prev, riskLevel]
    );
    setCurrentPage(1);
  };

  const handlePriorityFilter = (priority: string) => {
    setSelectedPriorities(prev => 
      prev.includes(priority) 
        ? prev.filter(p => p !== priority)
        : [...prev, priority]
    );
    setCurrentPage(1);
  };

  const clearAllFilters = () => {
    setSelectedRiskLevels([]);
    setSelectedPriorities([]);
    setDateFrom('');
    setDateTo('');
    setSearchTerm('');
    setCurrentPage(1);
  };

  const hasActiveFilters = selectedRiskLevels.length > 0 || selectedPriorities.length > 0 || dateFrom || dateTo || searchTerm;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-white">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary-500 mb-4"></div>
        <h2 className="text-xl font-semibold">{t('alerting.loading')}</h2>
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
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        {/* Header Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('alerting.title')}</h1>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-600 dark:text-gray-400">
                  {t('alerting.stats.totalActive')}: <span className="font-semibold text-red-600">{results.length}</span>
                </span>
                <span className="text-gray-600 dark:text-gray-400">
                  {t('alerting.stats.showing')}: <span className="font-semibold text-primary-600">{filteredResults.length}</span>
                </span>
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  showFilters 
                    ? 'bg-primary-600 text-white hover:bg-primary-700' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {showFilters ? t('alerting.filters.toggleHide') : t('alerting.filters.toggleShow')}
                {hasActiveFilters && (
                  <span className="ml-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
                    {[selectedRiskLevels.length, selectedPriorities.length, dateFrom ? 1 : 0, dateTo ? 1 : 0, searchTerm ? 1 : 0].filter(Boolean).length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Monitoring Error Notification */}
        {monitoringError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex justify-between items-center">
            <span>{monitoringError}</span>
            <button
              onClick={() => setMonitoringError(null)}
              className="text-red-700 hover:text-red-900 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Filter Controls */}
        {showFilters && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 mb-6 border border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {/* Risk Level Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  {t('alerting.filters.riskLevel')}
                </label>
                <div className="space-y-2">
                  {[
                    { value: 'red', label: t('alerting.riskLevels.red'), color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
                    { value: 'orange', label: t('alerting.riskLevels.orange'), color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300' },
                    { value: 'yellow', label: t('alerting.riskLevels.yellow'), color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' },
                    { value: 'green', label: t('alerting.riskLevels.green'), color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' }
                  ].map(risk => (
                    <label key={risk.value} className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedRiskLevels.includes(risk.value)}
                        onChange={() => handleRiskLevelFilter(risk.value)}
                        className="mr-2 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${risk.color}`}>
                        {risk.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Priority Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  {t('alerting.filters.priority')}
                </label>
                <div className="space-y-2">
                  {[
                    { value: 'urgent', label: t('alerting.priorities.urgent'), color: 'bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
                    { value: 'high', label: t('alerting.priorities.high'), color: 'bg-orange-200 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300' },
                    { value: 'medium', label: t('alerting.priorities.medium'), color: 'bg-yellow-200 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' }
                  ].map(priority => (
                    <label key={priority.value} className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedPriorities.includes(priority.value)}
                        onChange={() => handlePriorityFilter(priority.value)}
                        className="mr-2 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className={`px-2 py-1 text-xs font-bold rounded ${priority.color}`}>
                        {priority.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Date Range Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  {t('alerting.filters.dateRange')}
                </label>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('alerting.filters.from')}</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => {
                        setDateFrom(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('alerting.filters.to')}</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => {
                        setDateTo(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Filter Actions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  {t('alerting.filters.actions')}
                </label>
                <div className="space-y-2">
                  <button
                    onClick={clearAllFilters}
                    disabled={!hasActiveFilters}
                    className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors"
                  >
                    {t('alerting.filters.clearFilters')}
                  </button>
                  {hasActiveFilters && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
                      {t('alerting.filters.activeCount', { filtered: filteredResults.length, total: results.length })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="mb-4">
          <div className="relative">
            <input
              type="text"
              placeholder={t('alerting.searchPlaceholder')}
              className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setCurrentPage(1);
                }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ✕
              </button>
            )}
          </div>
          
          {/* Active Filters Summary */}
          {hasActiveFilters && (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedRiskLevels.map(level => (
                <span key={level} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                  {t('alerting.filters.activeSummary.risk')}: {getRiskLevelDisplayName(level)}
                  <button
                    onClick={() => handleRiskLevelFilter(level)}
                    className="ml-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    ✕
                  </button>
                </span>
              ))}
              {selectedPriorities.map(priority => (
                <span key={priority} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">
                  {t('alerting.filters.activeSummary.priority')}: {t(`alerting.priorities.${priority}`)}
                  <button
                    onClick={() => handlePriorityFilter(priority)}
                    className="ml-2 text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
                  >
                    ✕
                  </button>
                </span>
              ))}
              {(dateFrom || dateTo) && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                  {t('alerting.filters.activeSummary.date')}: {dateFrom || t('alerting.filters.activeSummary.start')} - {dateTo || t('alerting.filters.activeSummary.end')}
                  <button
                    onClick={() => {
                      setDateFrom('');
                      setDateTo('');
                      setCurrentPage(1);
                    }}
                    className="ml-2 text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                  >
                    ✕
                  </button>
                </span>
              )}
              {searchTerm && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                  {t('alerting.filters.activeSummary.search')}: {searchTerm}
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setCurrentPage(1);
                    }}
                    className="ml-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                  >
                    ✕
                  </button>
                </span>
              )}
              <button
                onClick={clearAllFilters}
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/70"
              >
                {t('alerting.filters.activeSummary.clearAll')}
              </button>
            </div>
          )}
        </div>
        
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Search Bar */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="relative max-w-md">
              <input
                type="text"
                placeholder={t('alerting.searchPlaceholder')}
                className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              )}
            </div>
            
            {/* Active Filters Summary */}
            {hasActiveFilters && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedRiskLevels.map(level => (
                  <span key={level} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                    {t('alerting.filters.activeSummary.risk')}: {getRiskLevelDisplayName(level)}
                    <button
                      onClick={() => handleRiskLevelFilter(level)}
                      className="ml-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {selectedPriorities.map(priority => (
                  <span key={priority} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                    {t('alerting.filters.activeSummary.priority')}: {t(`alerting.priorities.${priority}`)}
                    <button
                      onClick={() => handlePriorityFilter(priority)}
                      className="ml-2 text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {(dateFrom || dateTo) && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">
                    {t('alerting.filters.activeSummary.date')}: {dateFrom || t('alerting.filters.activeSummary.start')} - {dateTo || t('alerting.filters.activeSummary.end')}
                    <button
                      onClick={() => {
                        setDateFrom('');
                        setDateTo('');
                        setCurrentPage(1);
                      }}
                      className="ml-2 text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
                    >
                      ✕
                    </button>
                  </span>
                )}
                {searchTerm && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                    {t('alerting.filters.activeSummary.search')}: {searchTerm}
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setCurrentPage(1);
                      }}
                      className="ml-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                    >
                      ✕
                    </button>
                  </span>
                )}
                <button
                  onClick={clearAllFilters}
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/70"
                >
                  {t('alerting.filters.activeSummary.clearAll')}
                </button>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    onClick={() => handleSort('rut')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>{t('alerting.table.rut')}</span>
                      {sortField === 'rut' && (
                        <span className="text-primary-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    onClick={() => handleSort('razonSocial')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>{t('alerting.table.razonSocial')}</span>
                      {sortField === 'razonSocial' && (
                        <span className="text-primary-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    onClick={() => handleSort('createdAt')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>{t('alerting.table.detectionDate')}</span>
                      {sortField === 'createdAt' && (
                        <span className="text-primary-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    onClick={() => handleSort('riskLevel')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>{t('alerting.table.riskLevel')}</span>
                      {sortField === 'riskLevel' && (
                        <span className="text-primary-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    {t('alerting.table.priority')}
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    {t('alerting.table.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {paginatedResults.map((result, index) => (
                  <tr key={result._id} className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/50 dark:bg-gray-750'}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link to={`/alerting/${result._id}`} className="text-sm text-primary-600 hover:text-primary-800 hover:underline font-medium transition-colors">
                        {result.details?.rut}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 max-w-xs truncate" title={result.details?.razonSocial}>
                        {result.details?.razonSocial}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {new Date(result.createdAt).toLocaleDateString(getDateLocale(), {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getRiskLevelClass(result.riskAssessment?.riskSummary?.semaphore || result.duxiterRiskLevel)}`}>
                        {getRiskLevelDisplayName(result.riskAssessment?.riskSummary?.semaphore || result.duxiterRiskLevel)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                        getAlertPriority(result.riskAssessment?.riskSummary?.semaphore || result.duxiterRiskLevel) === 'urgent' 
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' 
                          : getAlertPriority(result.riskAssessment?.riskSummary?.semaphore || result.duxiterRiskLevel) === 'high'
                          ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                      }`}>
                        {t(`alerting.priorities.${getAlertPriority(result.riskAssessment?.riskSummary?.semaphore || result.duxiterRiskLevel)}`)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-3">
                        <Link 
                          to={`/alerting/${result._id}`} 
                          className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 text-sm font-medium transition-colors"
                        >
                          {t('alerting.actions.viewDetail')}
                        </Link>
                        {result.details?.rut && (
                          <button
                            onClick={() => {
                              const rut = result.details?.rut;
                              const companyName = result.details?.razonSocial;
                              if (rut) {
                                if (monitoringStatus[rut]) {
                                  handleRemoveFromMonitoring(rut);
                                } else {
                                  handleAddToMonitoring(rut, companyName);
                                }
                              }
                            }}
                            disabled={monitoringLoading[result.details?.rut || '']}
                            className={`text-sm font-medium transition-colors ${
                              monitoringStatus[result.details?.rut || '']
                                ? 'text-orange-600 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300'
                                : 'text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {monitoringLoading[result.details?.rut || ''] ? (
                              <span className="flex items-center">
                                <svg className="animate-spin -ml-1 mr-1 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                {monitoringStatus[result.details?.rut || ''] ? t('alerting.actions.removing') : t('alerting.actions.adding')}
                              </span>
                            ) : (
                              monitoringStatus[result.details?.rut || ''] ? t('alerting.actions.removeMonitoring') : t('alerting.actions.addToMonitoring')
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteClick(result._id)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium transition-colors"
                        >
                          {t('alerting.actions.discard')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Empty State */}
          {paginatedResults.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <div className="text-gray-500 dark:text-gray-400">
                <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-lg font-medium">
                  {searchTerm ? t('alerting.empty.noResultsSearch') : t('alerting.empty.noResults')}
                </p>
                {searchTerm && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setCurrentPage(1);
                    }}
                    className="mt-2 text-primary-600 hover:text-primary-800 text-sm font-medium"
                  >
                    {t('alerting.empty.clearSearch')}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Pagination */}
          {paginatedResults.length > 0 && (
            <div className="bg-white dark:bg-gray-800 px-4 py-3 border-t border-gray-200 dark:border-gray-700 sm:px-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  {t('alerting.pagination.info', { start: indexOfFirstItem + 1, end: Math.min(indexOfLastItem, sortedResults.length), total: sortedResults.length })}
                </div>
                <div className="flex items-center space-x-2">
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    <button
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-3 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {t('common.previous')}
                    </button>
                    
                    {/* Page Numbers */}
                    {Array.from({ length: Math.min(5, Math.ceil(sortedResults.length / itemsPerPage)) }, (_, i) => {
                      const pageNumber = i + 1;
                      const isCurrentPage = pageNumber === currentPage;
                      return (
                        <button
                          key={pageNumber}
                          onClick={() => setCurrentPage(pageNumber)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium transition-colors ${
                            isCurrentPage
                              ? 'z-10 bg-primary-50 border-primary-500 text-primary-600 dark:bg-primary-900/50 dark:border-primary-400 dark:text-primary-300'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                          }`}
                        >
                          {pageNumber}
                        </button>
                      );
                    })}
                    
                    <button
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={indexOfLastItem >= sortedResults.length}
                      className="relative inline-flex items-center px-3 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {t('common.next')}
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('alerting.modal.confirmDiscardTitle')}</h3>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              {t('alerting.modal.confirmDiscardMessage')}
            </p>
            
            {deleteError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {deleteError}
              </div>
            )}
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleCancelDelete}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md text-gray-800 dark:text-gray-200"
                disabled={isDeleting}
              >
                {t('alerting.modal.cancel')}
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md"
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t('alerting.modal.discarding')}
                  </span>
                ) : (
                  t('alerting.modal.discard')
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AlertingPage;