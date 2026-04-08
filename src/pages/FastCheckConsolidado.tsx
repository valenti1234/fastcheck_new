import React, { useEffect, useState } from 'react';
import PageLayout from '../components/layouts/PageLayout';
import ClientInfo from '../components/fast-check/ClientInfo';
import EvaluationSummary from '../components/fast-check/EvaluationSummary';
import RiskDetailTable from '../components/fast-check/RiskDetailTable';
import Last10ResultsTable from '../components/fast-check/Last10ResultsTable';
import { apiClient } from '../services/api';
import { FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import logger from '../utils/logger';
import { useTranslation } from 'react-i18next';

const FastCheckConsolidado: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [last10Results, setLast10Results] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rut, setRut] = useState('');
  const [providerDistribution, setProviderDistribution] = useState({
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  });

  const fetchData = async (searchRut?: string) => {
    setLoading(true);
    try {
      let response;
      if (searchRut) {
        response = await apiClient.get(`/rut/results/rut/${searchRut}`);
      } else {
        const latestResultResponse = await apiClient.get('/rut/results/latest');
        response = await apiClient.get(`/rut/results/rut/${latestResultResponse.data.rut}`);
      }
      setData(response.data);

      const providers = response.data.sheriffLogData?.mallaSocietariaData?.proveedores || [];
      const distribution = {
        critical: providers.filter((p: any) => p.riesgoFinal === 'Crítico').length,
        high: providers.filter((p: any) => p.riesgoFinal === 'Alto').length,
        medium: providers.filter((p: any) => p.riesgoFinal === 'Medio').length,
        low: providers.filter((p: any) => p.riesgoFinal === 'Bajo').length,
      };
      setProviderDistribution(distribution);

      const last10ResultsResponse = await apiClient.get('/rut/results?limit=10');
      setLast10Results(last10ResultsResponse.data);
    } catch (error) {
      logger.error('Error fetching data:', error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSearch = () => {
    fetchData(rut);
  };

  const handleRutClick = (searchRut: string) => {
    setRut(searchRut);
    fetchData(searchRut);
  };

  // Export JSON function
  const handleExportJSON = () => {
    if (!data) {
      toast.error(t('fastCheck.export.noData'));
      return;
    }

    try {
      // Create a comprehensive data object with all available information
      const exportData = {
        metadata: {
          exportDate: new Date().toISOString(),
          rut: data.details?.rut || rut,
          razonSocial: data.details?.razonSocial,
          evaluationDate: data.createdAt || data.updatedAt,
          pageType: 'FastCheckConsolidado'
        },
        completeData: data, // Full data from results collection
        providerDistribution: providerDistribution,
        last10Results: last10Results
      };

      // Convert to JSON string with proper formatting
      const jsonString = JSON.stringify(exportData, null, 2);
      
      // Create blob and download
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = `duxiter-consolidado-${data.details?.rut || rut}-${new Date().toISOString().split('T')[0]}.json`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      URL.revokeObjectURL(url);
      
      toast.success(t('fastCheck.export.success'));
    } catch (error) {
      logger.error('Error exporting JSON:', error);
      toast.error(t('fastCheck.export.error'));
    }
  };

  if (loading) {
    return <PageLayout title={t('fastCheckConsolidado.title')} showBackButton={true}><div>{t('common.loading')}</div></PageLayout>;
  }

  if (!data) {
    return <PageLayout title={t('fastCheckConsolidado.title')} showBackButton={true}><div>{t('common.noResults')}</div></PageLayout>;
  }

  return (
    <PageLayout title={t('fastCheckConsolidado.title')} showBackButton={true}>
      <div className="mb-4 flex justify-between items-center">
        <div>
          <input
            type="text"
            value={rut}
            onChange={(e) => setRut(e.target.value)}
            placeholder={t('fastCheck.rutPlaceholder')}
            className="p-2 border rounded text-black"
          />
          <button onClick={handleSearch} className="ml-2 p-2 bg-blue-500 text-white rounded">
            {t('common.search')}
          </button>
        </div>
        {data && (
          <button
            onClick={handleExportJSON}
            className="p-2 bg-purple-600 text-white rounded flex items-center gap-2 hover:bg-purple-700 transition-colors"
          >
            <FileText size={18} />
            {t('fastCheck.actions.exportJson')}
          </button>
        )}
      </div>
      <div className="space-y-6">
        {data && (
          <>
            <ClientInfo clientInfo={data.details} />
            {data.newSummaryData && (
              <>
                <EvaluationSummary summary={data.newSummaryData} providerDistribution={providerDistribution} />
                <RiskDetailTable summary={data.newSummaryData} />
              </>
            )}
            <Last10ResultsTable results={last10Results} onRutClick={handleRutClick} />
          </>
        )}
      </div>
    </PageLayout>
  );
};

export default FastCheckConsolidado;