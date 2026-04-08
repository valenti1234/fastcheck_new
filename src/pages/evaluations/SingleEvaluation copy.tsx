import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../../contexts/TenantContext';
import { Search, AlertTriangle, Download, FileText, XCircle, CheckCircle, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { validateChileanRut, formatChileanRut, apiClient } from '../../services/api'; // Assuming apiClient is your configured axios instance
// It's better to have specific service functions, but using apiClient directly for now
// import { EvaluationService } from '../../services/evaluationService'; // Original, might not be needed for new flow
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import HumanReadableJson from '../../components/common/HumanReadableJson';
import DuxiterSummaryCard from '../../components/common/DuxiterSummaryCard';
import GeneralInfoCard from '../../components/common/GeneralInfoCard';
import MarkdownResumeCard from '../../components/common/MarkdownResumeCard';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { SheriffDataLogResponse } from '../../types/sheriff';
import { logger } from '../../utils/logger';
import { useTranslation } from 'react-i18next';



// Define types for the resume response and PDF data
interface AssociatedPdf {
  title: string;
  filename: string;
  contentType?: string;
  originalUrl: string;
  sourcePath: string;
  downloaded: boolean;
  contentBase64?: string; // Will be in sheriffLogData.associatedPdfs
  error?: string;
}

interface SheriffLogAssociatedPdf { // Matches backend model structure for base64
    sourcePath: string;
    originalUrl: string;
    documentTitle?: string;
    contentBase64?: string;
    contentType?: string;
    downloadedAt?: Date;
    error?: string;
}


interface RutResumeResponse {
  rut: string;
  markdownResume: string;
  duxiterMD: string;
  sheriffLogData: SheriffDataLogResponse;
  availablePdfs: AssociatedPdf[];
  failedPdfDownloads: AssociatedPdf[];
  riskAssessment?: {
    summaryDocumentMD?: string;
    allRules?: any[];
    riskSummary?: any;
  };
}
const showJsonData = false; // This can be a prop or state if you want to toggle it
const formatJsonToMarkdown = (data: Record<string, any>): string => {
  let markdown = '## Interpretación de Datos\n\n';

  // SII Data
  if (data.summaryData?.data?.sii) {
    const sii = data.summaryData.data.sii;
    markdown += '### Información SII\n';
    markdown += `- **Razón Social**: ${sii.razonSocial || 'No disponible'}\n`;
    markdown += `- **Inicio Actividades**: ${sii.inicioActividades || 'No disponible'}\n`;
    markdown += `- **Situación Actual**: ${sii.situacionActual || 'No disponible'}\n`;
    
    if (sii.actividadEconomicaVigente?.length > 0) {
      markdown += '\n#### Actividades Económicas\n';
      sii.actividadEconomicaVigente.forEach((act: any) => {
        markdown += `- ${act.activities} (Código: ${act.code})\n`;
      });
    }
  }

  // Business Size Information
  if (data.summaryData?.data?.siiBusinessSize) {
    const size = data.summaryData.data.siiBusinessSize;
    markdown += '\n### Tamaño de la Empresa\n';
    markdown += `- **Clasificación**: ${size.textSize || 'No disponible'}\n`;
    markdown += `- **Ventas Anuales (UF)**: ${size.annualSales || 'No disponible'}\n`;
    markdown += `- **Trabajadores**: ${size.dependentWorkers || 'No disponible'}\n`;
  }

  // Properties and Vehicles
  if (data.summaryData?.data?.propertiesSummary || data.summaryData?.data?.vehiclesSummary) {
    markdown += '\n### Activos\n';
    if (data.summaryData?.data?.propertiesSummary) {
      const props = data.summaryData.data.propertiesSummary;
      markdown += `- **Propiedades**: ${props.propertiesQuantity || 0} (Avalúo Total: ${props.totalAppraisal || '0'})\n`;
    }
    if (data.summaryData?.data?.vehiclesSummary) {
      markdown += `- **Vehículos**: ${data.summaryData.data.vehiclesSummary.vehiclesQuantity || 0}\n`;
    }
  }

  // Credit Scoring
  if (data.creditScoringData?.data) {
    const scoring = data.creditScoringData.data;
    markdown += '\n### Evaluación Crediticia\n';
    markdown += `- **Clasificación**: ${scoring.classificationLabel || 'No disponible'}\n`;
    markdown += `- **Porcentaje**: ${scoring.classificationPercentage ? scoring.classificationPercentage + '%' : 'No disponible'}\n`;
    
    if (scoring.financesPercentage !== undefined) {
      markdown += `- **Finanzas**: ${scoring.financesPercentage}%\n`;
    }
    if (scoring.judicialPercentage !== undefined) {
      markdown += `- **Judicial**: ${scoring.judicialPercentage}%\n`;
    }
  }

  // Legal Cases Summary
  const hasLegalCases = data.civilCasesData?.data?.length > 0 || 
                       data.laboralCasesData?.data?.length > 0 || 
                       data.cobranzaCasesData?.data?.length > 0;
  
  if (hasLegalCases) {
    markdown += '\n### Casos Legales\n';
    markdown += `- **Casos Civiles**: ${data.civilCasesData?.data?.length || 0}\n`;
    markdown += `- **Casos Laborales**: ${data.laboralCasesData?.data?.length || 0}\n`;
    markdown += `- **Casos de Cobranza**: ${data.cobranzaCasesData?.data?.length || 0}\n`;
  }

  return markdown;
};

const SingleEvaluation: React.FC = () => {
  const { t } = useTranslation();
  const [rut, setRut] = useState('');
  const [formattedRut, setFormattedRut] = useState('');
  const [name, setName] = useState(''); // Kept for potential future use or if form still needs it
  const [isValidRut, setIsValidRut] = useState<boolean | null>(null);
  // const [isSubmitting, setIsSubmitting] = useState(false); // Replaced by more granular loading states
  
  const [isLoadingLookup, setIsLoadingLookup] = useState(false);
  const [isLoadingResume, setIsLoadingResume] = useState(false);
  const [markdownResult, setMarkdownResult] = useState<string | null>(null);
  const [downloadablePdfs, setDownloadablePdfs] = useState<AssociatedPdf[]>([]);
  const [erroredPdfs, setErroredPdfs] = useState<AssociatedPdf[]>([]);
  const [processError, setProcessError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [rawData, setRawData] = useState<RutResumeResponse | null>(null);
  const [showRawData, setShowRawData] = useState(false);
  const [showHumanReadableData, setShowHumanReadableData] = useState(false);
  const [showInterpretation, setShowInterpretation] = useState(false);
  const [showDuxiterSummary, setShowDuxiterSummary] = useState(false);
  const markdownRef = useRef<HTMLDivElement>(null);


  const { tenant } = useTenant();
  const navigate = useNavigate(); // Kept if navigation is needed post-operation

 useEffect(() => {
    // Clear results when RUT changes after a submission
    if (markdownResult || processError) {
      setMarkdownResult(null);
      setDownloadablePdfs([]);
      setErroredPdfs([]);
      setProcessError(null);
      setRawData(null);
    }
  }, [rut]);

  const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setRut(value);
    
    // Format RUT as user types
    if (value) {
      const formatted = formatChileanRut(value);
      setFormattedRut(formatted);
      
      // Validate RUT
      const isValid = validateChileanRut(value);
      setIsValidRut(isValid);
    } else {
      setFormattedRut('');
      setIsValidRut(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isValidRut) {
      toast.error(t('singleEvaluation.toast.invalidRut'));
      return;
    }
    if (!termsAccepted) {
      toast.error(t('singleEvaluation.toast.acceptTerms'));
      return;
    }
    if (!tenant) {
      toast.error(t('singleEvaluation.toast.tenantError'));
      return;
    }

    setIsLoadingLookup(true);
    
    // Sanitize RUT for API: remove dots, keep hyphen
    const rutForApi = formattedRut.replace(/\./g, '');
    
    try {
      // First check if we already have an evaluation in the database
      try {
        const checkResponse = await apiClient.get(`/rut/results/rut/${rutForApi}`);
        
        if (checkResponse.data) {
          // Evaluation already exists, redirect to FastCheck
          logger.log('Evaluation already exists, redirecting to FastCheck');
          navigate(`/fast-check-ex?rut=${rutForApi}`, { replace: true });
          setIsLoadingLookup(false);
          return;
        }
      } catch (error: any) {
        // If 404, it means no evaluation exists, which is expected
        // For other errors, log but continue with creating a new evaluation
        if (error.response?.status !== 404) {
          logger.error('Error checking for existing evaluation:', error);
        }
      }
      
      // Start a new evaluation and wait for it to complete
      setIsLoadingResume(true);
      toast.loading(t('singleEvaluation.searching'), { id: 'evaluation-toast' });
      
      const response = await apiClient.post<RutResumeResponse>('/rut/lookup', {
        rut: rutForApi,
        isMonitoring: false
      });
      logger.log(229,'Evaluation response:', response);
      // Evaluation completed successfully
      toast.success(t('singleEvaluation.toast.success'), { id: 'evaluation-toast' });
      
      // Now navigate to FastCheck page with the RUT as a parameter
      navigate(`/fast-check-ex?rut=${rutForApi}`, { replace: true });
    } catch (error) {
      logger.error('Error during evaluation process:', error);
      toast.error(t('singleEvaluation.toast.unknownError'), { id: 'evaluation-toast' });
    } finally {
      // Always reset loading states
      setIsLoadingLookup(false);
      setIsLoadingResume(false);
    }
  };
  
  const createDataUrl = (base64: string, contentType: string): string => {
    return `data:${contentType};base64,${base64}`;
  };

  const handlePdfDownload = async () => {
    if (!markdownRef.current || !rawData?.riskAssessment?.summaryDocumentMD) return;
    
    try {
      // Show loading state
      const loadingToast = document.createElement('div');
      loadingToast.className = 'fixed top-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg z-50';
      loadingToast.textContent = 'Generando PDF...';
      document.body.appendChild(loadingToast);
      
      // Wait for next render cycle
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const canvas = await html2canvas(markdownRef.current, {
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      
      // Add new pages if content exceeds one page
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      pdf.save(`reporte_${formattedRut}.pdf`);
      
      // Remove loading toast
      document.body.removeChild(loadingToast);
    } catch (error) {
      logger.error('Error generating PDF:', error);
      alert('Error al generar el PDF. Por favor, intente nuevamente.');
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('singleEvaluation.reportLabel')}</p>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('singleEvaluation.title')}</h1>
          </div>
          <div className="mt-4 sm:mt-0 flex items-center space-x-2">
            <button
              onClick={() => {
                if (markdownResult) {
                  const blob = new Blob([markdownResult], { type: 'text/markdown' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `reporte_${formattedRut}.md`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  // Notification is no longer needed
                } else {
                  setProcessError(t('singleEvaluation.noReportToDownload'));
                }
              }}
              disabled={!markdownResult}
              className="bg-primary-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
            >
              <Download className="w-5 h-5 mr-2" />
              {t('singleEvaluation.downloadMd')}
            </button>
            <button
              onClick={handlePdfDownload}
              disabled={!rawData?.riskAssessment?.summaryDocumentMD}
              className="bg-green-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
            >
              <Download className="w-5 h-5 mr-2" />
              {t('singleEvaluation.downloadPdf')}
            </button>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-1">{t('singleEvaluation.searchSupplierTitle')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('singleEvaluation.searchSupplierSubtitle')}</p>
          
          {tenant && tenant.usageStats.evaluationsRemaining <= 5 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-500 text-yellow-700 dark:text-yellow-300 p-4 mb-6" role="alert">
              <div className="flex">
                <div className="py-1"><AlertTriangle className="h-5 w-5 text-yellow-400 dark:text-yellow-500 mr-3" /></div>
                <div>
                  <p className="font-bold">{t('singleEvaluation.warning.remaining', { count: tenant.usageStats.evaluationsRemaining })}</p>
                  <p className="text-sm">{t('singleEvaluation.warning.planAlmostExhausted')}</p>
                </div>
              </div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="rut" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('singleEvaluation.rutLabel')} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="rut"
                    value={formattedRut}
                    onChange={handleRutChange}
                    placeholder={t('singleEvaluation.rutPlaceholder')}
                    className={`w-full pl-3 pr-10 py-2 border rounded-md shadow-sm text-sm bg-white dark:bg-gray-700 ${
                      isValidRut === false
                        ? 'border-red-500 text-red-900 dark:text-red-200 focus:ring-red-500 focus:border-red-500'
                        : isValidRut === true
                        ? 'border-green-500 text-green-900 dark:text-green-200 focus:ring-green-500 focus:border-green-500'
                        : 'border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-primary-500 focus:border-primary-500'
                    }`}
                    required
                    disabled={isLoadingLookup || isLoadingResume}
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    {isValidRut === true && <CheckCircle className="h-5 w-5 text-green-500" />}
                    {isValidRut === false && <XCircle className="h-5 w-5 text-red-500" />}
                  </div>
                </div>
              </div>
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('singleEvaluation.nameLabel')} <span className="text-sm font-normal text-gray-500">{t('common.optional')}</span>
                </label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('singleEvaluation.namePlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  disabled={isLoadingLookup || isLoadingResume}
                />
              </div>
            </div>
            <div className="md:col-span-1">
              <button
                type="submit"
                disabled={isLoadingLookup || isLoadingResume || !isValidRut || !termsAccepted}
                className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                {(isLoadingLookup || isLoadingResume) ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {isLoadingLookup ? t('singleEvaluation.searching') : t('singleEvaluation.generatingSummary')}
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5 mr-2" />
                    {t('singleEvaluation.submit')}
                  </>
                )}
              </button>
            </div>
          </form>
          <div className="mt-4 flex items-center">
            <input
              id="terms"
              name="terms"
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-700"
            />
            <label htmlFor="terms" className="ml-2 block text-sm text-gray-600 dark:text-gray-400">
              {t('singleEvaluation.acceptLabelPrefix')}{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:underline dark:text-primary-400 dark:hover:text-primary-300">
                {t('singleEvaluation.terms')}
              </a>{' '}
              {t('singleEvaluation.and')}{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:underline dark:text-primary-400 dark:hover:text-primary-300">
                {t('singleEvaluation.privacy')}
              </a>.
            </label>
          </div>
        </div>

        {/* Results Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Report */}
          <div className="lg:col-span-2 space-y-8">
            {(markdownResult || processError || isLoadingLookup || isLoadingResume) && (
              <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">{t('singleEvaluation.reportTitle')}</h2>
                  
                </div>
                <div className="p-6">
                  {processError && (
                    <div className="bg-red-100 dark:bg-red-900/20 border-l-4 border-red-500 text-red-700 dark:text-red-300 p-4 mb-6" role="alert">
                      <p className="font-bold">{t('singleEvaluation.toast.errorPrefix')}</p>
                      <p>{processError}</p>
                    </div>
                  )}

                  {(isLoadingLookup || isLoadingResume) && !processError && (
                    <div className="text-center py-10">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
                      <p className="mt-4 text-gray-600 dark:text-gray-400">{isLoadingLookup ? t('singleEvaluation.searching') : t('singleEvaluation.generatingSummary')}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {rawData?.duxiterMD && (
              <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg">
                <button
                  onClick={() => setShowDuxiterSummary(!showDuxiterSummary)}
                  className="w-full p-6 flex items-center justify-between text-left"
                >
                  <div>
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">{t('singleEvaluation.duxiterSummary.title')}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('singleEvaluation.duxiterSummary.subtitle')}</p>
                  </div>
                  {showDuxiterSummary ? <ChevronUp className="h-5 w-5 text-gray-500 dark:text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400" />}
                </button>
                {showDuxiterSummary && rawData && (
                  <div className="px-6 pb-6">
                    <DuxiterSummaryCard rut={formattedRut} data={rawData} />
                  </div>
                )}
              </div>
            )}

 

            {rawData?.riskAssessment?.summaryDocumentMD && (
              <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
                <div ref={markdownRef}>
                  <MarkdownResumeCard mdResume={rawData.riskAssessment.summaryDocumentMD} />
                </div>
              </div>
            )}


          </div>

          {/* Right Column: Documents & Data */}
          <div className="lg:col-span-1 space-y-8">
            {(downloadablePdfs.length > 0 || erroredPdfs.length > 0) && (
              <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">{t('singleEvaluation.documents.title')}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('singleEvaluation.documents.subtitle')}</p>
                </div>
                <div className="p-6">
                  {downloadablePdfs.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-3">{t('singleEvaluation.documents.available')}</h4>
                      <ul className="space-y-2">
                        {downloadablePdfs.map((pdf, index) => (
                          <li key={index}>
                            <a
                              href={pdf.contentBase64 ? createDataUrl(pdf.contentBase64, pdf.contentType || 'application/pdf') : '#'}
                              download={pdf.filename}
                              className="text-primary-600 hover:text-primary-800 hover:underline dark:text-primary-400 dark:hover:text-primary-300 flex items-center text-sm"
                              onClick={(e) => { if (!pdf.contentBase64) e.preventDefault(); }}
                            >
                              <FileText className="w-4 h-4 mr-2 flex-shrink-0" />
                              <span className="truncate">{pdf.title}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {erroredPdfs.length > 0 && (
                    <div>
                      <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-3">{t('singleEvaluation.documents.unavailable')}</h4>
                      <ul className="space-y-2">
                        {erroredPdfs.map((pdf, index) => (
                          <li key={index} className="text-sm text-red-600 dark:text-red-400 flex items-start">
                            <XCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="font-semibold">{pdf.title}</span>
                              <p className="text-xs text-red-500">{t('singleEvaluation.documents.errorPrefix')} {pdf.error}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {rawData && showJsonData && (
              <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg">
                <button
                  onClick={() => setShowRawData(!showRawData)}
                  className="w-full p-6 flex items-center justify-between text-left"
                >
                  <div>
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">{t('singleEvaluation.techData.title')}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('singleEvaluation.techData.subtitle')}</p>
                  </div>
                  {showRawData ? <ChevronUp className="h-5 w-5 text-gray-500 dark:text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400" />}
                </button>
                {showRawData && (
                  <div className="px-6 pb-6">
                    <div className="p-4 bg-gray-900 rounded-md">
                      <pre className="overflow-x-auto text-sm text-white whitespace-pre-wrap">
                        {JSON.stringify({
                          ...rawData.sheriffLogData,
                          associatedPdfs: `[${rawData.sheriffLogData.associatedPdfs?.length || 0} PDFs]`
                        }, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
};

export default SingleEvaluation;