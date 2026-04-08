import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import logger from '../../utils/logger';
import { Settings, Save, RefreshCw, AlertTriangle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

interface EnvParameter {
  key: string;
  value: string;
  description: string;
  category: string;
  isSecret: boolean;
  required: boolean;
}

interface EnvConfig {
  [key: string]: EnvParameter;
}

const EnvConfigurationPage: React.FC = () => {
  const { t } = useTranslation();
  const [config, setConfig] = useState<EnvConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState<{[key: string]: boolean}>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Helper to convert ENV var key (UPPER_SNAKE) to camelCase id used in i18n keys
  const toParamId = (key: string) =>
    key
      .toLowerCase()
      .split('_')
      .map((part, idx) => (idx === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
      .join('');

  // Definizione dei parametri .env con categorie (keys) e metadatos
  const envParameters: EnvConfig = {
    // API Keys
    OPENAI_API_KEY: {
      key: 'OPENAI_API_KEY',
      value: '',
      description: '',
      category: 'apiKeys',
      isSecret: true,
      required: true
    },
    SHERIFF_API_TOKEN: {
      key: 'SHERIFF_API_TOKEN',
      value: '',
      description: '',
      category: 'apiKeys',
      isSecret: true,
      required: true
    },
    SENDGRID_API_KEY: {
      key: 'SENDGRID_API_KEY',
      value: '',
      description: '',
      category: 'apiKeys',
      isSecret: true,
      required: false
    },
    
    // Database
    MONGODB_URI: {
      key: 'MONGODB_URI',
      value: '',
      description: '',
      category: 'database',
      isSecret: true,
      required: true
    },
    
    // Server
    PORT: {
      key: 'PORT',
      value: '',
      description: '',
      category: 'server',
      isSecret: false,
      required: true
    },
    RATE_LIMIT_WINDOW_MS: {
      key: 'RATE_LIMIT_WINDOW_MS',
      value: '',
      description: '',
      category: 'server',
      isSecret: false,
      required: false
    },
    RATE_LIMIT_MAX_REQUESTS: {
      key: 'RATE_LIMIT_MAX_REQUESTS',
      value: '',
      description: '',
      category: 'server',
      isSecret: false,
      required: false
    },
    
    // API URLs
    API_URL: {
      key: 'API_URL',
      value: '',
      description: '',
      category: 'apiUrls',
      isSecret: false,
      required: true
    },
    SHERIFF_API_URL: {
      key: 'SHERIFF_API_URL',
      value: '',
      description: '',
      category: 'apiUrls',
      isSecret: false,
      required: true
    },
    SII_URL: {
      key: 'SII_URL',
      value: '',
      description: '',
      category: 'apiUrls',
      isSecret: false,
      required: false
    },
    
    // OpenAI Settings
    OPENAI_MODEL_SUMMARY: {
      key: 'OPENAI_MODEL_SUMMARY',
      value: '',
      description: '',
      category: 'openaiConfig',
      isSecret: false,
      required: false
    },
    OPENAI_MODEL_ANALYSIS: {
      key: 'OPENAI_MODEL_ANALYSIS',
      value: '',
      description: '',
      category: 'openaiConfig',
      isSecret: false,
      required: false
    },
    OPENAI_TEMPERATURE: {
      key: 'OPENAI_TEMPERATURE',
      value: '',
      description: '',
      category: 'openaiConfig',
      isSecret: false,
      required: false
    },
    OPENAI_MAX_TOKENS: {
      key: 'OPENAI_MAX_TOKENS',
      value: '',
      description: '',
      category: 'openaiConfig',
      isSecret: false,
      required: false
    },
    
    // Risk Calculation
    RISK_TOTAL_PARAMS: {
      key: 'RISK_TOTAL_PARAMS',
      value: '',
      description: '',
      category: 'riskCalculation',
      isSecret: false,
      required: false
    },
    RISK_CRITICAL_PERCENTAGE: {
      key: 'RISK_CRITICAL_PERCENTAGE',
      value: '',
      description: '',
      category: 'riskCalculation',
      isSecret: false,
      required: false
    },
    RISK_HIGH_PERCENTAGE: {
      key: 'RISK_HIGH_PERCENTAGE',
      value: '',
      description: '',
      category: 'riskCalculation',
      isSecret: false,
      required: false
    },
    RISK_MEDIUM_PERCENTAGE: {
      key: 'RISK_MEDIUM_PERCENTAGE',
      value: '',
      description: '',
      category: 'riskCalculation',
      isSecret: false,
      required: false
    },
    
    // SendGrid Configuration
    SENDGRID_FROM_EMAIL: {
      key: 'SENDGRID_FROM_EMAIL',
      value: '',
      description: '',
      category: 'sendgridConfig',
      isSecret: false,
      required: false
    },
    SENDGRID_FROM_NAME: {
      key: 'SENDGRID_FROM_NAME',
      value: '',
      description: '',
      category: 'sendgridConfig',
      isSecret: false,
      required: false
    },
    
    // RabbitMQ Configuration
    RABBITMQ_URL: {
      key: 'RABBITMQ_URL',
      value: '',
      description: '',
      category: 'rabbitmqConfig',
      isSecret: true,
      required: false
    },
    RABBITMQ_QUEUE: {
      key: 'RABBITMQ_QUEUE',
      value: '',
      description: '',
      category: 'rabbitmqConfig',
      isSecret: false,
      required: false
    },
    
    // Contact Information
    SUPPORT_EMAIL: {
      key: 'SUPPORT_EMAIL',
      value: '',
      description: '',
      category: 'contactInfo',
      isSecret: false,
      required: false
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const response = await fetch('/api/env-config', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        const updatedConfig = { ...envParameters };
        
        // Aggiorna i valori con quelli dal server
        Object.keys(data.data).forEach(key => {
          if (updatedConfig[key]) {
            updatedConfig[key].value = data.data[key] || '';
          }
        });
        
        setConfig(updatedConfig);
      } else {
        throw new Error(data.message || t('envConfiguration.errors.loadConfig'));
      }
    } catch (error) {
      logger.error('Error loading config:', error);
      toast.error(error instanceof Error ? error.message : t('envConfiguration.errors.loadConfig'));
    } finally {
      setLoading(false);
    }
  };

  const handleValueChange = (key: string, value: string) => {
    setConfig(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        value
      }
    }));
    setHasChanges(true);
  };

  const toggleSecretVisibility = (key: string) => {
    setShowSecrets(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const saveConfig = async () => {
    try {
      setSaving(true);
      
      // Prepara i dati da inviare
      const configData: {[key: string]: string} = {};
      Object.keys(config).forEach(key => {
        configData[key] = config[key].value;
      });
      
      const token = localStorage.getItem('token');
      
      const response = await fetch('/api/env-config', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(configData)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        toast.success(data.message || t('envConfiguration.toast.saveSuccess'));
        if (data.note) {
          toast.success(data.note, { duration: 5000 });
        }
        setHasChanges(false);
      } else {
        throw new Error(data.message || t('envConfiguration.errors.saveConfig'));
      }
    } catch (error) {
      logger.error('Error saving config:', error);
      toast.error(error instanceof Error ? error.message : t('envConfiguration.errors.saveConfig'));
    } finally {
      setSaving(false);
    }
  };

  const resetConfig = () => {
    loadConfig();
    setHasChanges(false);
    toast.success(t('envConfiguration.toast.resetSuccess'));
  };

  // Raggruppa i parametri per categoria
  const groupedConfig = Object.values(config).reduce((acc, param) => {
    if (!acc[param.category]) {
      acc[param.category] = [];
    }
    acc[param.category].push(param);
    return acc;
  }, {} as {[category: string]: EnvParameter[]});

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">{t('envConfiguration.loading')}</span>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Settings className="w-8 h-8 text-blue-500 mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('envConfiguration.header.title')}</h1>
              <p className="text-gray-600">{t('envConfiguration.header.subtitle')}</p>
            </div>
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={resetConfig}
              disabled={!hasChanges || saving}
              className="flex items-center px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {t('envConfiguration.buttons.reset')}
            </button>
            
            <button
              onClick={saveConfig}
              disabled={!hasChanges || saving}
              className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {saving ? t('envConfiguration.buttons.saving') : t('envConfiguration.buttons.save')}
            </button>
          </div>
        </div>
        
        {hasChanges && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center">
            <AlertTriangle className="w-5 h-5 text-yellow-500 mr-2" />
            <span className="text-yellow-700">{t('envConfiguration.changes.unsaved')}</span>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {Object.entries(groupedConfig).map(([category, parameters]) => (
          <div key={category} className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{t(`envConfiguration.categories.${category}`)}</h2>
            </div>
            
            <div className="p-6">
              <div className="grid gap-4">
                {parameters.map((param) => (
                  <div key={param.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-gray-700">
                        {param.key}
                        {param.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      
                      {param.isSecret && (
                        <button
                          type="button"
                          onClick={() => toggleSecretVisibility(param.key)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          {showSecrets[param.key] ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                    
                    {/** Derive description from i18n using param id */}
                    {(() => {
                      const id = toParamId(param.key);
                      const desc = t(`envConfiguration.params.${id}.description`);
                      return (
                        <>
                          <input
                            type={param.isSecret && !showSecrets[param.key] ? 'password' : 'text'}
                            value={param.value}
                            onChange={(e) => handleValueChange(param.key, e.target.value)}
                            placeholder={typeof desc === 'string' ? desc : ''}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <p className="text-xs text-gray-500">{desc as string}</p>
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start">
          <CheckCircle className="w-5 h-5 text-blue-500 mr-2 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-blue-900">{t('envConfiguration.noteTitle')}</h3>
            <p className="text-sm text-blue-700 mt-1">
              {t('envConfiguration.noteMessage')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnvConfigurationPage;