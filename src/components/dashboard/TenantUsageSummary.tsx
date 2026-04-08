import React from 'react';
import Card from '../common/Card';
import { useTranslation } from 'react-i18next';
import { useTenant } from '../../contexts/TenantContext';

const TenantUsageSummary: React.FC = () => {
  const { tenant } = useTenant();
  const { t } = useTranslation();

  if (!tenant) {
    return null;
  }

  const availableCredits = tenant.creditBalance?.availableCredits || 0;
  const totalCreditsUsed = tenant.creditBalance?.totalCreditsUsed || 0;
  const totalCredits = availableCredits + totalCreditsUsed;
  const usagePercentage = totalCredits > 0 ? (totalCreditsUsed / totalCredits) * 100 : 0;

  return (
    <Card
      title={t('tenantUsage.title', { defaultValue: 'Créditos de Usuario' })}
      subtitle={t('tenantUsage.subtitle', { name: tenant.name, defaultValue: `Uso para ${tenant.name}` })}
    >
      <div className="space-y-6">
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-base font-medium text-gray-700 dark:text-gray-300">{t('tenantUsage.used', { defaultValue: 'Usado' })}</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="h-4 flex-grow bg-gray-200 dark:bg-gray-700 rounded-full">
              <div className="h-4 bg-primary-500 dark:bg-primary-400 rounded-full" style={{ width: `${usagePercentage}%` }}></div>
            </div>
            <span className="text-base font-semibold text-gray-800 dark:text-white">{totalCreditsUsed} {t('tenantUsage.credits', { defaultValue: 'créditos' })}</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-base font-medium text-gray-700 dark:text-gray-300">{t('tenantUsage.available', { defaultValue: 'Disponibles' })}</span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-base font-semibold text-gray-800 dark:text-white">{availableCredits} {t('tenantUsage.credits', { defaultValue: 'créditos' })}</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-base font-medium text-gray-700 dark:text-gray-300">{t('tenantUsage.total', { defaultValue: 'Total' })}</span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-base font-semibold text-gray-800 dark:text-white">{totalCredits} {t('tenantUsage.credits', { defaultValue: 'créditos' })}</span>
          </div>
        </div>

        <div className="pt-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('tenantUsage.progress', { defaultValue: 'Progreso de uso' })}</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="h-4 flex-grow bg-gray-200 dark:bg-gray-700 rounded-full">
              <div className="h-4 bg-green-500 dark:bg-green-400 rounded-full" style={{ width: `${100 - usagePercentage}%` }}></div>
            </div>
            <span className="text-base font-semibold text-gray-800 dark:text-white">{availableCredits} {t('tenantUsage.credits', { defaultValue: 'créditos' })}</span>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default TenantUsageSummary;