import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../../contexts/TenantContext';
import { Search, AlertTriangle, Download, FileText, XCircle, CheckCircle, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { validateChileanRut, formatChileanRut, apiClient } from '../../services/api';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import PageLayout from '../layouts/PageLayout';
import Card from '../common/Card';
import { useTranslation } from 'react-i18next';

// Define types for the resume response and PDF data
interface AssociatedPdf {
  title: string;
  filename: string;
  contentType?: string;
  originalUrl: string;
  sourcePath: string;
  downloaded: boolean;
  contentBase64?: string;
  error?: string;
}

interface RutResumeResponse {
  sheriffLogData: {
    associatedPdfs?: AssociatedPdf[];
    duxiterRiskList?: any[];
    [key: string]: any;
  };
}

const SingleEvaluation: React.FC = () => {
  const { t } = useTranslation();
  const [rut, setRut] = useState('');
  const [formattedRut, setFormattedRut] = useState('');
  const [name, setName] = useState('');
  const [isValidRut, setIsValidRut] = useState<boolean | null>(null);
  const [isLoadingLookup, setIsLoadingLookup] = useState(false);
  const [isLoadingResume, setIsLoadingResume] = useState(false);
  const [markdownResult, setMarkdownResult] = useState<string | null>(null);
  const [downloadablePdfs, setDownloadablePdfs] = useState<AssociatedPdf[]>([]);
  const [erroredPdfs, setErroredPdfs] = useState<AssociatedPdf[]>([]);
  const [processError, setProcessError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [rawData, setRawData] = useState<RutResumeResponse | null>(null);
  const [showRawData, setShowRawData] = useState(false);
  const [showInterpretation, setShowInterpretation] = useState(false);

  const { tenant } = useTenant();
  const navigate = useNavigate();

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
    toast.loading(t('singleEvaluation.toast.searchingProvider'), { id: 'lookup-toast' });

    try {
      // Immediately navigate to FastCheck page with the RUT as a parameter
      // Use replace: true to prevent going back to this page

      navigate(`/fast-check-ex?rut=${formattedRut.replace(/\./g, '')}`, { replace: true });
      
      // Make the API call after navigation
      apiClient.post('/api/evaluate', {
        rut: formattedRut.replace(/\./g, ''),
        name
      }).then(() => {
        toast.dismiss('lookup-toast');
        toast.success(t('singleEvaluation.toast.success'));
      }).catch(error => {
        toast.dismiss('lookup-toast');
        console.error('Error during evaluation process:', error);
      }).finally(() => {
        // Always reset loading states
        setIsLoadingLookup(false);
        setIsLoadingResume(false);
      });
    } catch (error: any) {
      toast.dismiss('lookup-toast');
      console.error('Error during evaluation process:', error);
      const errorMessage = error.response?.data?.message || error.message || t('singleEvaluation.toast.unknownError');
      toast.error(`${t('singleEvaluation.toast.errorPrefix')} ${errorMessage}`);
      setIsLoadingLookup(false);
      setIsLoadingResume(false);
    }
  };

  const createDataUrl = (base64: string, contentType: string): string => {
    return `data:${contentType};base64,${base64}`;
  };

  const formatJsonToMarkdown = (data: any): string => {
    // This is a placeholder for the actual implementation
    return `# ${t('singleEvaluation.interpretationTitle')}\n\n${JSON.stringify(data, null, 2)}`;
  };

  return (
    <PageLayout
      title={t('singleEvaluation.title')}
      subtitle={t('singleEvaluation.subtitle')}
    >
      <div className="max-w-3xl mx-auto">
        {/* Main evaluation form */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="px-8 py-6">
            {/* Tenant warning message */}
            {tenant && tenant.usageStats.evaluationsRemaining <= 5 && (
              <div className="mb-6 bg-amber-50 border border-amber-100 rounded-lg p-4">
                <div className="flex items-start">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-amber-800">
                      {t('singleEvaluation.warning.remaining', { count: tenant.usageStats.evaluationsRemaining })}
                    </h3>
                    <p className="mt-1 text-sm text-amber-700">
                      {t('singleEvaluation.warning.planAlmostExhausted')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* RUT Input */}
              <div>
                <label htmlFor="rut" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('singleEvaluation.rutLabel')} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="rut"
                    value={formattedRut}
                    onChange={handleRutChange}
                    placeholder={t('singleEvaluation.rutPlaceholder')}
                    className={`block w-full px-3 py-2 text-gray-900 placeholder:text-gray-400 sm:text-sm rounded-md transition-colors
                      ${isValidRut === false
                        ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                        : isValidRut === true
                        ? 'border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500'
                        : 'border-gray-300 focus:border-primary-500 focus:ring-primary-500'
                      } focus:outline-none focus:ring-1`}
                    required
                    disabled={isLoadingLookup || isLoadingResume}
                  />
                  {isValidRut !== null && (
                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                      {isValidRut ? (
                        <CheckCircle className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                    </div>
                  )}
                </div>
                {isValidRut === false && (
                  <p className="mt-1 text-sm text-red-600">
                    {t('singleEvaluation.invalidRut')}
                  </p>
                )}
              </div>

              {/* Company Name Input */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('singleEvaluation.nameLabel')} <span className="text-sm font-normal text-gray-500">{t('common.optional')}</span>
                </label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('singleEvaluation.namePlaceholder')}
                  className="block w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-md placeholder:text-gray-400 
                    focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500
                    disabled:bg-gray-50 disabled:text-gray-500 transition-colors sm:text-sm"
                  disabled={isLoadingLookup || isLoadingResume}
                />
                <p className="mt-1 text-sm text-gray-500">
                  {t('singleEvaluation.nameHelpText')}
                </p>
              </div>

              {/* Terms Acceptance */}
              <div className="pt-2">
                <label className="flex items-start">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 focus:ring-offset-0 mt-0.5"
                  />
                  <span className="ml-2 text-sm text-gray-600">
                    {t('singleEvaluation.acceptLabelPrefix')}{' '}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:text-primary-700">
                      {t('singleEvaluation.terms')}
                    </a>{' '}
                    {t('singleEvaluation.and')}{' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:text-primary-700">
                      {t('singleEvaluation.privacy')}
                    </a>
                  </span>
                </label>
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isLoadingLookup || isLoadingResume || !isValidRut || !termsAccepted}
                  className="w-full flex justify-center items-center px-4 py-2.5 text-sm font-medium text-white 
                    bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed
                    rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
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
          </div>

          {/* Important Information */}
          <div className="mt-4 px-8 py-4 bg-gray-50 border-t border-gray-100">
            <h3 className="text-sm font-medium text-gray-900 mb-2">
              {t('singleEvaluation.info.title')}
            </h3>
            <ul className="space-y-1.5 text-sm text-gray-600">
              <li className="flex items-center">
                <span className="w-1 h-1 bg-gray-400 rounded-full mr-2"></span>
                {t('singleEvaluation.info.creditUsage')}
              </li>
              <li className="flex items-center">
                <span className="w-1 h-1 bg-gray-400 rounded-full mr-2"></span>
                {t('singleEvaluation.info.realTimeResults')}
              </li>
              <li className="flex items-center">
                <span className="w-1 h-1 bg-gray-400 rounded-full mr-2"></span>
                {t('singleEvaluation.info.confidentiality')}
              </li>
              <li className="flex items-center">
                <span className="w-1 h-1 bg-gray-400 rounded-full mr-2"></span>
                {t('singleEvaluation.info.bulkPrefix')}{' '}
                <a href="/evaluations/bulk" className="text-primary-600 hover:text-primary-700">
                  {t('singleEvaluation.info.bulkLinkText')}
                </a>
                .
              </li>
            </ul>
          </div>
        </div>

        {/* Results Section removed - direct navigation to FastCheck */}

        {/* Technical Data Section removed - direct navigation to FastCheck */}
      </div>
    </PageLayout>
  );
};

export default SingleEvaluation;