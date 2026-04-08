import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { Upload, FileText, AlertTriangle, HelpCircle, Download, CheckCircle, XCircle } from 'lucide-react';
import { apiClient, validateChileanRut, formatChileanRut } from '../../services/api';
import { SupplierData } from '../../types/evaluation';
import EvaluationStatusTable from '../../components/evaluations/EvaluationStatusTable';
import { deleteEvaluation, deleteBulkEvaluations } from '../../services/evaluationService';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { logger } from '../../utils/logger';
import { useTranslation } from 'react-i18next';



interface EvaluationResult {
  rut: string;
  name?: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  data?: any;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  processingTime?: number; // in milliseconds
  progress?: number; // 0-100
  jobId?: string;
}

const BulkEvaluation: React.FC = () => {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierData[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<EvaluationResult[]>([]);
  const [previousEvaluations, setPreviousEvaluations] = useState<any[]>([]);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { tenant, loading: tenantLoading } = useTenant();
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    setFile(selectedFile);
    setIsLoading(true);
    
    try {
      const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase();
      let data: SupplierData[] = [];
      
      if (fileExtension === 'csv' || fileExtension === 'xlsx' || fileExtension === 'xls') {
        // Process Excel or CSV file
        const arrayBuffer = await selectedFile.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // Extract headers and validate
        const headers = jsonData[0] as string[];
        const requiredHeaders = ['rut'];
        const hasRequiredHeaders = requiredHeaders.every(header => 
          headers.map(h => h.toLowerCase()).includes(header.toLowerCase())
        );
        
        if (!hasRequiredHeaders) {
          setErrors([t('bulkEvaluation.file.errors.missingRut')]);
          setSuppliers([]);
          setIsLoading(false);
          return;
        }
        
        // Map data to supplier objects
        const rutIndex = headers.findIndex(h => h.toLowerCase() === 'rut');
        const nameIndex = headers.findIndex(h => h.toLowerCase() === 'nombre' || h.toLowerCase() === 'name');
        const emailIndex = headers.findIndex(h => h.toLowerCase() === 'email' || h.toLowerCase() === 'correo');
        
        data = jsonData.slice(1).map((row: any, index: number) => {
          const supplier: SupplierData = {
            rut: row[rutIndex]?.toString() || '',
          };
          
          if (nameIndex >= 0 && row[nameIndex]) {
            supplier.name = row[nameIndex];
          }
          
          if (emailIndex >= 0 && row[emailIndex]) {
            supplier.email = row[emailIndex];
          }
          
          return supplier;
        }).filter(supplier => supplier.rut);
      } else {
        setErrors([t('bulkEvaluation.file.errors.unsupportedFormat')]);
        setSuppliers([]);
        setIsLoading(false);
        return;
      }
      
      // Validate RUTs
      const invalidRuts: string[] = [];
      const validSuppliers = data.filter((supplier, index) => {
        const isValid = validateChileanRut(supplier.rut);
        if (!isValid) {
          invalidRuts.push(
            t('bulkEvaluation.file.errors.invalidRutEntry', {
              row: index + 2,
              rut: supplier.rut,
            })
          );
        }
        return isValid;
      });
      
      // Remove duplicate RUTs (keep first occurrence)
      const seenRuts = new Set<string>();
      const duplicateRuts: string[] = [];
      const uniqueSuppliers = validSuppliers.filter((supplier) => {
        const normalizedRut = formatChileanRut(supplier.rut);
        if (seenRuts.has(normalizedRut)) {
          duplicateRuts.push(normalizedRut);
          return false; // Remove duplicate
        }
        seenRuts.add(normalizedRut);
        return true; // Keep first occurrence
      });
      
      setSuppliers(uniqueSuppliers);
      
      // Prepare error/warning messages
      const messages: string[] = [];
      if (invalidRuts.length > 0) {
        messages.push(...invalidRuts);
      }
      if (duplicateRuts.length > 0) {
        messages.push(t('bulkEvaluation.file.errors.duplicatesFound', { count: duplicateRuts.length }));
      }
      
      setErrors(messages);
      
      if (uniqueSuppliers.length === 0) {
        setErrors(prev => [...prev, t('bulkEvaluation.file.errors.noValidRuts')]);
      }
    } catch (error) {
      logger.error('Error processing file:', error);
      setErrors([t('bulkEvaluation.file.errors.processing')]);
      setSuppliers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Function to poll for evaluation progress
  const pollProgress = async (jobId: string) => {
    try {
      const response = await apiClient.get(`/evaluations/bulk/progress/${jobId}`);
      const progressData = response.data;
      
      // Merge latest progress into existing results without dropping pending rows
      setResults((prevResults) => {
        const normalizeRut = (rut: string) => formatChileanRut(rut).replace(/\./g, '');
        const resultMap = new Map<string, EvaluationResult>();

        // Seed with previous results
        for (const r of prevResults) {
          resultMap.set(normalizeRut(r.rut), r);
        }

        // Apply updates from server
        for (const r of progressData.results as any[]) {
          const key = normalizeRut(r.rut);
          const supplier = suppliers.find((s) => normalizeRut(s.rut) === key);
          const mappedStatus: EvaluationResult['status'] = r.status === 'success'
            ? 'success'
            : r.status === 'failed'
              ? 'error'
              : r.status === 'processing'
                ? 'processing'
                : 'pending';
          const progress = mappedStatus === 'success' || mappedStatus === 'error' ? 100 : (mappedStatus === 'processing' ? 50 : 0);

          const existing = resultMap.get(key);
          resultMap.set(key, {
            rut: key,
            name: existing?.name || supplier?.name || 'Unknown',
            status: mappedStatus,
            startedAt: existing?.startedAt || new Date().toISOString(),
            completedAt: mappedStatus !== 'pending' && mappedStatus !== 'processing' ? new Date().toISOString() : existing?.completedAt,
            progress,
            data: r.data,
            error: r.error,
            jobId: existing?.jobId,
          });
        }

        // Return merged list preserving original order where possible
        const merged: EvaluationResult[] = [];
        for (const r of prevResults) {
          const key = normalizeRut(r.rut);
          merged.push(resultMap.get(key) || r);
        }
        // Include any new keys that weren’t in prev (unlikely but safe)
        for (const [key, value] of resultMap.entries()) {
          if (!merged.find((m) => normalizeRut(m.rut) === key)) merged.push(value);
        }
        return merged;
      });
      
      // Stop polling if job is completed or failed
      if (progressData.status === 'completed' || progressData.status === 'failed') {
        setIsPolling(false);
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }
        toast.success(
          t(progressData.status === 'completed' ? 'bulkEvaluation.toast.completed' : 'bulkEvaluation.toast.failed')
        );
      }
    } catch (error: any) {
      logger.error('Error polling progress:', error);
      // Don't show error toast for polling failures to avoid spam
    }
  };

  // Function to start polling
  const startPolling = (jobId: string) => {
    // Clear any existing interval
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
    
    // Start polling every 3 seconds
    const interval = setInterval(() => {
      pollProgress(jobId);
    }, 3000);
    
    setPollingInterval(interval);
    
    // Initial poll
    pollProgress(jobId);
  };

  // Cleanup polling on component unmount
  React.useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  // Load previous evaluations when component mounts
  useEffect(() => {
    const loadPreviousEvaluations = async () => {
      logger.log('🔍 Loading previous evaluations...', { tenant, tenantLoading });
      if (tenantLoading) {
        logger.log('❌ Skipping load: tenant still loading');
        return;
      }
      
      if (!tenant) {
        logger.log('ℹ️ No tenant available (likely superuser) - skipping previous evaluations load');
        setHasAttemptedLoad(true);
        return;
      }
      
      setLoadingPrevious(true);
      try {
        logger.log('📡 Calling /evaluations/bulk/recent API...');
        const response = await apiClient.get('/evaluations/bulk/recent');
        const recentJobs = response.data;
        logger.log('✅ Recent jobs received:', recentJobs);
        
        // Convert jobs to evaluation results format for the table
        const evaluationResults: EvaluationResult[] = [];
        
        for (const job of recentJobs) {
          try {
            logger.log(`📊 Loading results for job ${job._id}...`);
            // Get results for each job - FIXED: Use correct endpoint with query parameter
            const resultsResponse = await apiClient.get(`/evaluations/results?jobId=${job._id}`);
            logger.log(`🔍 Raw API response for job ${job._id}:`, resultsResponse.data);
            const jobResults = resultsResponse.data.results || [];
            logger.log(`✅ Job ${job._id} results:`, jobResults.length, 'items');
            
            // Convert each result to our format
            if (jobResults && Array.isArray(jobResults) && jobResults.length > 0) {
              const formattedResults = jobResults.map((result: any) => ({
                rut: result.rut,
                name: result.name || result.data?.legalInfo?.name || 'Unknown',
                status: result.status === 'success' ? 'success' as const : 
                       result.status === 'failed' ? 'error' as const :
                       result.status === 'processing' ? 'processing' as const : 'pending' as const,
                data: result.data,
                error: result.error,
                startedAt: result.createdAt,
                completedAt: result.updatedAt,
                progress: result.status === 'success' ? 100 : (result.status === 'failed' ? 100 : 0),
                jobId: job._id
              }));
              
              evaluationResults.push(...formattedResults);
              logger.log(`📝 Added ${formattedResults.length} formatted results for job ${job._id}`);
            } else {
              logger.log(`⚠️ No results found for job ${job._id} - this might be expected for pending/processing jobs`);
            }
          } catch (error) {
            logger.error(`❌ Error loading results for job ${job._id}:`, error);
          }
        }
        
        logger.log('📋 Total evaluation results:', evaluationResults.length);
        
        // Evita di sovrascrivere le righe 'pending' appena avviate
        setResults((prev) => {
          if (prev && prev.length > 0) return prev;
          return evaluationResults;
        });
        setPreviousEvaluations(recentJobs);
      } catch (error) {
        logger.error('❌ Error loading previous evaluations:', error);
        // Don't show error toast on component mount to avoid annoying users
      } finally {
        setLoadingPrevious(false);
        setHasAttemptedLoad(true);
        logger.log('✅ Loading previous evaluations completed');
      }
    };

    loadPreviousEvaluations();
  }, [tenant, tenantLoading]);

  // Handle single evaluation deletion
  const handleDeleteEvaluation = async (jobId: string) => {
    try {
      await deleteEvaluation(jobId);
      toast.success(t('bulkEvaluation.delete.singleSuccess'));
      
      // Remove the deleted evaluation from results
      setResults(prevResults => prevResults.filter(result => result.jobId !== jobId));
      
      // Also remove from previous evaluations if present
      setPreviousEvaluations(prevEvals => prevEvals.filter(evaluation => evaluation._id !== jobId));
    } catch (error: any) {
      logger.error('Error deleting evaluation:', error);
      toast.error(error.message || t('bulkEvaluation.delete.singleError'));
    }
  };

  // Handle bulk evaluation deletion
  const handleDeleteBulkEvaluations = async (jobIds: string[]) => {
    try {
      const result = await deleteBulkEvaluations(jobIds);
      
      if (result.deletedCount > 0) {
        toast.success(t('bulkEvaluation.delete.bulkSuccess', { count: result.deletedCount }));
      }
      
      if (result.failedCount > 0) {
        toast.error(t('bulkEvaluation.delete.bulkFailed', { count: result.failedCount }));
      }
      
      // Remove deleted evaluations from results
      setResults(prevResults => prevResults.filter(result => !jobIds.includes(result.jobId || '')));
      
      // Also remove from previous evaluations
      setPreviousEvaluations(prevEvals => prevEvals.filter(evaluation => !jobIds.includes(evaluation._id)));
    } catch (error: any) {
      logger.error('Error deleting bulk evaluations:', error);
      toast.error(error.message || t('bulkEvaluation.delete.singleError'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (suppliers.length === 0) return;
    if (!tenant || !user) {
      setErrors([t('bulkEvaluation.auth.error')]);
      return;
    }
    if (tenant.usageStats.evaluationsRemaining < suppliers.length) {
      return;
    }

    setIsSubmitting(true);
    // Show the status table immediately with initial "pending" states
    const initialResults: EvaluationResult[] = suppliers.map((supplier) => ({
      rut: formatChileanRut(supplier.rut).replace(/\./g, ''),
      name: supplier.name,
      status: 'pending',
      startedAt: new Date().toISOString(),
      progress: 0,
    }));
    setResults(initialResults);

    try {
      const response = await apiClient.post('/evaluations/bulk', {
        tenantId: tenant._id,
        userId: user.id,
        suppliers: suppliers.map(supplier => ({
          rut: formatChileanRut(supplier.rut).replace(/\./g, ''),
          name: supplier.name
        }))
      });

      const jobId = response.data.jobId;
      setCurrentJobId(jobId);
      // attach jobId to current rows for possible actions
      setResults((prev) => prev.map((r) => ({ ...r, jobId })));
      
      // Start polling for progress
      setIsPolling(true);
      startPolling(jobId);
      
      toast.success(t('bulkEvaluation.toast.started'));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Error desconocido';
      setErrors([errorMessage]);
      toast.error(t('bulkEvaluation.submit.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadTemplate = () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['rut', 'nombre', 'email', 'telefono', 'direccion', 'categoria'],
      ['76.123.456-7', 'Empresa Ejemplo SpA', 'contacto@ejemplo.cl', '+56912345678', 'Av. Principal 123, Santiago', 'Servicios'],
    ]);
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Proveedores');
    
    XLSX.writeFile(workbook, t('bulkEvaluation.template.filename'));
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('bulkEvaluation.header.label')}</p>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('bulkEvaluation.header.title')}</h1>
          </div>
          <div className="mt-4 sm:mt-0">
            <button
              type="button"
              onClick={downloadTemplate}
              className="bg-primary-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 flex items-center"
            >
              <Download className="w-5 h-5 mr-2" />
              {t('bulkEvaluation.actions.downloadTemplate')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Upload and Instructions */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-1">{t('bulkEvaluation.upload.title')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('bulkEvaluation.upload.subtitle')}</p>

              {tenant && suppliers.length > 0 && tenant.usageStats.evaluationsRemaining < suppliers.length && (
                <div className="bg-red-100 dark:bg-red-900/20 border-l-4 border-red-500 text-red-700 dark:text-red-300 p-4 mb-6" role="alert">
                  <div className="flex">
                    <div className="py-1"><AlertTriangle className="h-5 w-5 text-red-500 mr-3" /></div>
                    <div>
                      <p className="font-bold">{t('bulkEvaluation.alerts.insufficientTitle')}</p>
                      <p>{t('bulkEvaluation.alerts.insufficientMessage', { needed: suppliers.length, available: tenant.usageStats.evaluationsRemaining })}</p>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 sr-only">
                    {t('bulkEvaluation.upload.fileLabelSr')}
                  </label>
                  <div
                    className="mt-1 flex justify-center px-6 pt-8 pb-8 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-md cursor-pointer hover:border-primary-500 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="space-y-1 text-center">
                      <Upload className="mx-auto h-12 w-12 text-gray-400" />
                      <div className="flex text-sm text-gray-600 dark:text-gray-300">
                        <span className="relative font-medium text-primary-600 hover:text-primary-500">
                          {t('bulkEvaluation.upload.clickToUpload')}
                        </span>
                        <input
                          id="file-upload"
                          name="file-upload"
                          type="file"
                          className="sr-only"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          accept=".csv,.xlsx,.xls"
                        />
                        <p className="pl-1">{t('bulkEvaluation.upload.dragDrop')}</p>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t('bulkEvaluation.upload.formatsHint')}</p>
                    </div>
                  </div>
                  {file && (
                    <div className="mt-4 flex justify-between items-center bg-gray-100 dark:bg-gray-700 p-3 rounded-md">
                      <div className="flex items-center">
                        <FileText className="h-5 w-5 mr-2 text-primary-600" />
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{file.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setFile(null);
                          setSuppliers([]);
                          setErrors([]);
                          if (fileInputRef.current) {
                            fileInputRef.current.value = '';
                          }
                        }}
                        className="text-sm font-medium text-red-600 hover:text-red-800"
                      >
                        {t('bulkEvaluation.upload.removeFile')}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center">
                  <input
                    id="terms"
                    name="terms"
                    type="checkbox"
                    required
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
                  />
                  <label htmlFor="terms" className="ml-2 block text-sm text-gray-900 dark:text-gray-100">
                    {t('bulkEvaluation.terms.acceptPrefix')}{' '}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:underline">
                      {t('bulkEvaluation.terms.terms')}
                    </a>{' '}
                    {t('bulkEvaluation.terms.and')}{' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:underline">
                      {t('bulkEvaluation.terms.privacy')}
                    </a>.
                  </label>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={
                      isSubmitting ||
                      suppliers.length === 0 ||
                      isLoading ||
                      tenantLoading ||
                      !tenant ||
                      tenant.usageStats.evaluationsRemaining < suppliers.length
                    }
                    className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {t('bulkEvaluation.submit.processing')}
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 mr-2" />
                        {t('bulkEvaluation.submit.startEvaluationSuppliers', { count: suppliers.length })}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Right Column: Preview and Errors */}
          <div className="lg:col-span-1 space-y-8">
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-xl font-semibold text-gray-800 dark:text-white">{t('bulkEvaluation.preview.title')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('bulkEvaluation.preview.subtitle')}</p>
              </div>
              <div className="p-6">
                {isLoading && (
                  <div className="text-center py-10">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600 dark:text-gray-300">{t('bulkEvaluation.preview.loading')}</p>
                  </div>
                )}

                {errors.length > 0 && (
                  <div className="bg-red-100 dark:bg-red-900/20 border-l-4 border-red-500 text-red-700 dark:text-red-300 p-4 mb-6" role="alert">
                    <p className="font-bold">{t('bulkEvaluation.preview.errorsTitle', { count: errors.length })}</p>
                    <ul className="mt-2 list-disc list-inside text-sm max-h-32 overflow-y-auto">
                      {errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {suppliers.length > 0 && (
                  <div>
                    <h4 className="text-md font-semibold text-gray-700 dark:text-gray-200 mb-3">
                      {t('bulkEvaluation.preview.validSuppliers', { count: suppliers.length })}
                    </h4>
                    <div className="max-h-60 overflow-y-auto border dark:border-gray-700 rounded-md">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                          <tr>
                            <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('bulkEvaluation.preview.table.rut')}</th>
                            <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('bulkEvaluation.preview.table.name')}</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {suppliers.map((supplier, index) => (
                            <tr key={index}>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-100">{supplier.rut}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{supplier.name || t('bulkEvaluation.preview.table.na')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {!isLoading && suppliers.length === 0 && errors.length === 0 && file && (
                   <div className="text-center py-10">
                    <FileText className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">{t('bulkEvaluation.preview.empty.title')}</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('bulkEvaluation.preview.empty.subtitle')}</p>
                  </div>
                )}
              </div>
            </div>
            
          </div>
        </div>
        
        {(results.length > 0 || loadingPrevious || hasAttemptedLoad) && (
          <div className="mt-8">
            <EvaluationStatusTable 
              results={results}
              isLoading={isPolling || loadingPrevious}
              onRefresh={() => {
                if (currentJobId) {
                  pollProgress(currentJobId);
                }
              }}
              onDeleteEvaluation={handleDeleteEvaluation}
              onDeleteBulkEvaluations={handleDeleteBulkEvaluations}
              showDeleteActions={true}
            />
          </div>
        )}
        
        {/* Instrucciones Card - Moved to bottom */}
        <div className="mt-8">
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-semibold text-gray-800 dark:text-white">{t('bulkEvaluation.instructions.title')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('bulkEvaluation.instructions.subtitle')}</p>
            </div>
            <div className="p-6 text-sm text-gray-700 dark:text-gray-300">
              <ul className="space-y-3">
                <li className="flex items-start">
                  <span className="font-bold text-primary-600 mr-2">1.</span>
                  <span>{t('bulkEvaluation.instructions.steps.1')}</span>
                </li>
                <li className="flex items-start">
                  <span className="font-bold text-primary-600 mr-2">2.</span>
                  <span>{t('bulkEvaluation.instructions.steps.2')}</span>
                </li>
                <li className="flex items-start">
                  <span className="font-bold text-primary-600 mr-2">3.</span>
                  <span>{t('bulkEvaluation.instructions.steps.3')}</span>
                </li>
                <li className="flex items-start">
                  <span className="font-bold text-primary-600 mr-2">4.</span>
                  <span>{t('bulkEvaluation.instructions.steps.4')}</span>
                </li>
                <li className="flex items-start">
                  <span className="font-bold text-primary-600 mr-2">5.</span>
                  <span>{t('bulkEvaluation.instructions.steps.5')}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default BulkEvaluation;