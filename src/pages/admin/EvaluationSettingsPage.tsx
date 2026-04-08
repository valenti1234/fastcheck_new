import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getEvaluationParameters, updateEvaluationParameters } from '../../services/evaluationParameterService';
import SheriffLogKeySelector from '../../components/admin/SheriffLogKeySelector';
import TestCriteriaCard from '../../components/admin/TestCriteriaCard';
import logger from '../../utils/logger';



interface Parameter {
  label: string;
  risk: 'bajo' | 'medio' | 'alto' | 'critico';
  detected: boolean;
  isCritical: boolean;
  sheriffLogKey: string;
  condicion: string;
}

interface Settings {
  [key: string]: Parameter;
}

interface EvaluationSettings {
  compliance: Settings;
  legal: Settings;
  capitalHumano: Settings;
  financieroTributario: Settings;
}

const initialSettings: EvaluationSettings = {
  compliance: {
    condenasLey21y20: {
      label: "Condenas Ley 21.20",
      risk: "bajo",
      detected: false,
      isCritical: true,
      sheriffLogKey: "",
      condicion: "",
    },
    listaDeVigilanciaInernacional: {
      label: "Lista de Vigilancia Internacional",
      risk: "bajo",
      detected: false,
      isCritical: true,
      sheriffLogKey: "",
      condicion: "",
    },
    sancionesMedioAmbientales: {
      label: "Sanciones Medio Ambientales",
      risk: "bajo",
      detected: false,
      isCritical: false,
      sheriffLogKey: "",
      condicion: "",
    },
    procesosSancionatoriosMedioambientales: {
      label: "Procesos Sancionatorios Medioambientales",
      risk: "bajo",
      detected: false,
      isCritical: false,
      sheriffLogKey: "",
      condicion: "",
    },
    listasVigilanciaPropia: {
      label: "Listas Vigilancia Propia",
      risk: "bajo",
      detected: false,
      isCritical: false,
      sheriffLogKey: "",
      condicion: "",
    },
    ListasPEP: {
      label: "Listas PEP",
      risk: "bajo",
      detected: false,
      isCritical: false,
      sheriffLogKey: "",
      condicion: "",
    },
  },
  legal: {
    quiebraJudicial: {
      label: "Quiebra Judicial",
      risk: "bajo",
      detected: false,
      isCritical: true,
      sheriffLogKey: "commercialBulletinCasesData",
      condicion: "",
    },
    boletinConcursal: {
      label: "Boletín Concursal",
      risk: "bajo",
      detected: false,
      isCritical: true,
      sheriffLogKey: "commercialBulletinCasesData",
      condicion: "",
    },
    causasCiviles: {
      label: "Causas Civiles",
      risk: "bajo",
      detected: false,
      isCritical: false,
      sheriffLogKey: "civilCasesData",
      condicion: "",
    },
    causasLaborales: {
      label: "Causas Laborales",
      risk: "bajo",
      detected: false,
      isCritical: false,
      sheriffLogKey: "laboralCasesData",
      condicion: "",
    },
  },
  capitalHumano: {
    condenasporprácticasantisindicales: {
      label: "Condenas por Prácticas Antisindicales",
      risk: "bajo",
      detected: false,
      isCritical: true,
      sheriffLogKey: "laboralCasesData",
      condicion: "",
    },
    deudayPrevisional: {
      label: "Deuda y Previsional",
      risk: "bajo",
      detected: true,
      isCritical: false,
      sheriffLogKey: "moraPrevisionalCasesData",
      condicion: "",
    },
    multasLaborales: {
      label: "Multas Laborales",
      risk: "alto",
      detected: true,
      isCritical: false,
      sheriffLogKey: "multaLaboralCasesData",
      condicion: "",
    },
    deudaPrevisionalPresunta: {
      label: "Deuda Previsional Presunta",
      risk: "bajo",
      detected: false,
      isCritical: false,
      sheriffLogKey: "moraPrevisionalCasesData",
      condicion: "",
    },
  },
  financieroTributario: {
    TerminodeGiro: {
      label: "Término de Giro",
      risk: "bajo",
      detected: false,
      isCritical: true,
      sheriffLogKey: "siiData",
      condicion: "",
    },
    protestosyMorosidades: {
      label: "Protestos y Morosidades",
      risk: "alto",
      detected: true,
      isCritical: false,
      sheriffLogKey: "commercialBulletinCasesData",
      condicion: "",
    },
    iniciodeActividades: {
      label: "Inicio de Actividades",
      risk: "bajo",
      detected: false,
      isCritical: false,
      sheriffLogKey: "siiData",
      condicion: "",
    },
  }
};

const EvaluationSettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<EvaluationSettings>(initialSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<keyof EvaluationSettings>('compliance');
  const [activeSheriffLogKey, setActiveSheriffLogKey] = useState('');

  useEffect(() => {
    const fetchParameters = async () => {
      try {
        setLoading(true);
        const params = await getEvaluationParameters();
        const complianceParam = params.find((p: any) => p.name === 'compliance');
        if (complianceParam) {
          setSettings(prev => ({ ...prev, compliance: { ...initialSettings.compliance, ...complianceParam.value } }));
        }
        const legalParam = params.find((p: any) => p.name === 'legal');
        if (legalParam) {
          setSettings(prev => ({ ...prev, legal: { ...initialSettings.legal, ...legalParam.value } }));
        }
        const capitalHumanoParam = params.find((p: any) => p.name === 'capitalHumano');
        if (capitalHumanoParam) {
          setSettings(prev => ({ ...prev, capitalHumano: { ...initialSettings.capitalHumano, ...capitalHumanoParam.value } }));
        }
        const financieroTributarioParam = params.find((p: any) => p.name === 'financieroTributario');
        if (financieroTributarioParam) {
          setSettings(prev => ({ ...prev, financieroTributario: { ...initialSettings.financieroTributario, ...financieroTributarioParam.value } }));
        }
        setError(null);
      } catch (err) {
        setError(t('evaluationSettings.form.loadError'));
        logger.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchParameters();
  }, []);

  const handleInputChange = (section: keyof EvaluationSettings, key: string, field: keyof Parameter, value: any) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: {
          ...prev[section][key],
          [field]: value,
        }
      }
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
     const parametersToUpdate = [
       { name: 'compliance', value: settings.compliance },
       { name: 'legal', value: settings.legal },
       { name: 'capitalHumano', value: settings.capitalHumano },
       { name: 'financieroTributario', value: settings.financieroTributario },
     ];
      await updateEvaluationParameters(parametersToUpdate);
      alert(t('evaluationSettings.form.updateSuccess'));
    } catch (err) {
      setError(t('evaluationSettings.form.updateError'));
      logger.error(err);
    }
  };

  if (loading) {
    return <div>{t('evaluationSettings.form.loading')}</div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  const renderSection = (sectionName: keyof EvaluationSettings) => (
    <div>
      {Object.entries(settings[sectionName]).map(([key, param]) => (
        <div key={key} className="mb-6 p-4 border rounded">
          <h3 className="text-xl font-semibold mb-2">{param.label}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor={`${key}-label`}>
                {t('evaluationSettings.form.label')}
              </label>
              <input
                id={`${key}-label`}
                type="text"
                value={param.label}
                onChange={(e) => handleInputChange(sectionName, key, 'label', e.target.value)}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor={`${key}-risk`}>
                {t('evaluationSettings.form.risk')}
              </label>
              <select
                id={`${key}-risk`}
                value={param.risk}
                onChange={(e) => handleInputChange(sectionName, key, 'risk', e.target.value as Parameter['risk'])}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              >
                <option value="bajo">{t('evaluationSettings.riskOptions.bajo')}</option>
                <option value="medio">{t('evaluationSettings.riskOptions.medio')}</option>
                <option value="alto">{t('evaluationSettings.riskOptions.alto')}</option>
                <option value="critico">{t('evaluationSettings.riskOptions.critico')}</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor={`${key}-sheriffLogKey`}>
                {t('evaluationSettings.form.sheriffLogKey')}
              </label>
              <SheriffLogKeySelector
                value={param.sheriffLogKey}
                onChange={(value: string) => handleInputChange(sectionName, key, 'sheriffLogKey', value)}
              />
            </div>
           <div className="flex items-center">
             <input
               id={`${key}-isCritical`}
               type="checkbox"
               checked={param.isCritical}
               onChange={(e) => handleInputChange(sectionName, key, 'isCritical', e.target.checked)}
               className="mr-2"
             />
             <label className="text-gray-700 text-sm font-bold" htmlFor={`${key}-isCritical`}>
               {t('evaluationSettings.form.isCritical')}
             </label>
           </div>
           <div>
             <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor={`${key}-condicion`}>
               {t('evaluationSettings.form.condicion')}
             </label>
             <input
               id={`${key}-condicion`}
               type="text"
               value={param.condicion}
               onChange={(e) => handleInputChange(sectionName, key, 'condicion', e.target.value)}
               className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
             />
           </div>
         </div>
       </div>
     ))}
   </div>
 );

 return (
   <div className="container mx-auto p-4">
     <h1 className="text-3xl font-bold mb-6">{t('evaluationSettings.title')}</h1>
     <div className="grid grid-cols-3 gap-4">
       <div className="col-span-2">
         <div className="flex border-b">
           <button
             className={`py-2 px-4 ${activeTab === 'compliance' ? 'border-b-2 border-blue-500' : ''}`}
             onClick={() => setActiveTab('compliance')}
           >
             {t('evaluationSettings.tabs.compliance')}
           </button>
           <button
             className={`py-2 px-4 ${activeTab === 'legal' ? 'border-b-2 border-blue-500' : ''}`}
             onClick={() => setActiveTab('legal')}
           >
             {t('evaluationSettings.tabs.legal')}
           </button>
           <button
             className={`py-2 px-4 ${activeTab === 'capitalHumano' ? 'border-b-2 border-blue-500' : ''}`}
             onClick={() => setActiveTab('capitalHumano')}
           >
             {t('evaluationSettings.tabs.capitalHumano')}
           </button>
           <button
             className={`py-2 px-4 ${activeTab === 'financieroTributario' ? 'border-b-2 border-blue-500' : ''}`}
             onClick={() => setActiveTab('financieroTributario')}
           >
             {t('evaluationSettings.tabs.financieroTributario')}
           </button>
         </div>
         <form onSubmit={handleSubmit} className="mt-4">
           {activeTab === 'compliance' && renderSection('compliance')}
           {activeTab === 'legal' && renderSection('legal')}
           {activeTab === 'capitalHumano' && renderSection('capitalHumano')}
           {activeTab === 'financieroTributario' && renderSection('financieroTributario')}
           <button
             type="submit"
             className="mt-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
           >
             {t('evaluationSettings.form.saveChanges')}
           </button>
         </form>
       </div>
       <div>
         <TestCriteriaCard />
       </div>
     </div>
   </div>
 );
};

export default EvaluationSettingsPage;