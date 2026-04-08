import React from 'react';
import { BookOpenIcon, UserGroupIcon, MagnifyingGlassIcon, DocumentTextIcon, ChartBarIcon, CogIcon, CircleStackIcon, ShieldCheckIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
const HowToUse = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const isSuperAdmin = user?.role === 'superuser';

  const generalFeatures = [
    {
      name: t('helpPage.general.evaluationIndividual.name'),
      description: t('helpPage.general.evaluationIndividual.description'),
      icon: DocumentTextIcon,
      steps: [
        t('helpPage.general.evaluationIndividual.steps.1'),
        t('helpPage.general.evaluationIndividual.steps.2'),
        t('helpPage.general.evaluationIndividual.steps.3'),
        t('helpPage.general.evaluationIndividual.steps.4'),
      ],
    },
    {
      name: t('helpPage.general.evaluationMassive.name'),
      description: t('helpPage.general.evaluationMassive.description'),
      icon: ChartBarIcon,
      steps: [
        t('helpPage.general.evaluationMassive.steps.1'),
        t('helpPage.general.evaluationMassive.steps.2'),
        t('helpPage.general.evaluationMassive.steps.3'),
        t('helpPage.general.evaluationMassive.steps.4'),
      ],
    },
    {
      name: t('helpPage.general.companyLookup.name'),
      description: t('helpPage.general.companyLookup.description'),
      icon: MagnifyingGlassIcon,
      steps: [
        t('helpPage.general.companyLookup.steps.1'),
        t('helpPage.general.companyLookup.steps.2'),
        t('helpPage.general.companyLookup.steps.3'),
        t('helpPage.general.companyLookup.steps.4'),
      ],
    },
  ];

  const superAdminFeatures = [
    {
      name: t('helpPage.superAdmin.tenantManagement.name'),
      description: t('helpPage.superAdmin.tenantManagement.description'),
      icon: UserGroupIcon,
      steps: [
        t('helpPage.superAdmin.tenantManagement.steps.1'),
        t('helpPage.superAdmin.tenantManagement.steps.2'),
        t('helpPage.superAdmin.tenantManagement.steps.3'),
        t('helpPage.superAdmin.tenantManagement.steps.4'),
        t('helpPage.superAdmin.tenantManagement.steps.5'),
      ],
    },
    {
      name: t('helpPage.superAdmin.userManagement.name'),
      description: t('helpPage.superAdmin.userManagement.description'),
      icon: ShieldCheckIcon,
      steps: [
        t('helpPage.superAdmin.userManagement.steps.1'),
        t('helpPage.superAdmin.userManagement.steps.2'),
        t('helpPage.superAdmin.userManagement.steps.3'),
        t('helpPage.superAdmin.userManagement.steps.4'),
        t('helpPage.superAdmin.userManagement.steps.5'),
      ],
    },
    {
      name: t('helpPage.superAdmin.systemConfig.name'),
      description: t('helpPage.superAdmin.systemConfig.description'),
      icon: CogIcon,
      steps: [
        t('helpPage.superAdmin.systemConfig.steps.1'),
        t('helpPage.superAdmin.systemConfig.steps.2'),
        t('helpPage.superAdmin.systemConfig.steps.3'),
        t('helpPage.superAdmin.systemConfig.steps.4'),
        t('helpPage.superAdmin.systemConfig.steps.5'),
      ],
    },
    {
      name: t('helpPage.superAdmin.databaseManagement.name'),
      description: t('helpPage.superAdmin.databaseManagement.description'),
      icon: CircleStackIcon,
      steps: [
        t('helpPage.superAdmin.databaseManagement.steps.1'),
        t('helpPage.superAdmin.databaseManagement.steps.2'),
        t('helpPage.superAdmin.databaseManagement.steps.3'),
        t('helpPage.superAdmin.databaseManagement.steps.4'),
        t('helpPage.superAdmin.databaseManagement.steps.5'),
      ],
    },
    {
      name: t('helpPage.superAdmin.specialCasesManagement.name'),
      description: t('helpPage.superAdmin.specialCasesManagement.description'),
      icon: ClipboardDocumentListIcon,
      steps: [
        t('helpPage.superAdmin.specialCasesManagement.steps.1'),
        t('helpPage.superAdmin.specialCasesManagement.steps.2'),
        t('helpPage.superAdmin.specialCasesManagement.steps.3'),
        t('helpPage.superAdmin.specialCasesManagement.steps.4'),
        t('helpPage.superAdmin.specialCasesManagement.steps.5'),
      ],
    },
    {
      name: t('helpPage.superAdmin.monitoringBilling.name'),
      description: t('helpPage.superAdmin.monitoringBilling.description'),
      icon: ChartBarIcon,
      steps: [
        t('helpPage.superAdmin.monitoringBilling.steps.1'),
        t('helpPage.superAdmin.monitoringBilling.steps.2'),
        t('helpPage.superAdmin.monitoringBilling.steps.3'),
        t('helpPage.superAdmin.monitoringBilling.steps.4'),
        t('helpPage.superAdmin.monitoringBilling.steps.5'),
      ],
    },
  ];
  const featuresToShow = isSuperAdmin ? [...generalFeatures, ...superAdminFeatures] : generalFeatures;

  return (
    <div className="bg-white py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <BookOpenIcon className="mx-auto h-12 w-12 text-primary-600" />
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t('helpPage.title')}
          </h2>
          <p className="mt-4 text-lg leading-8 text-gray-600">
            {isSuperAdmin 
              ? t('helpPage.subtitle.superAdmin')
              : t('helpPage.subtitle.regular')
            }
          </p>
          {isSuperAdmin && (
            <div className="mt-4 inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
              {t('helpPage.superAdminBadge')}
            </div>
          )}
        </div>

        {/* Funcionalidades Generales */}
        <div className="mt-16">
          <h3 className="text-2xl font-bold tracking-tight text-gray-900 mb-8">
            {t('helpPage.generalFeaturesTitle')}
          </h3>
          <div className="space-y-20">
            {generalFeatures.map((feature, featureIdx) => (
              <div
                key={feature.name}
                className="relative isolate flex flex-col gap-10 lg:flex-row"
              >
                <div className="relative aspect-[16/9] sm:aspect-[2/1] lg:aspect-square lg:w-64 lg:shrink-0">
                  <div className="absolute inset-0 rounded-2xl bg-gray-50 object-cover">
                    <feature.icon 
                      className="absolute top-1/2 left-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 text-primary-600" 
                      aria-hidden="true" 
                    />
                  </div>
                </div>
                <div>
                  <div className="group relative max-w-xl">
                    <h3 className="mt-3 text-lg font-semibold leading-6 text-gray-900">
                      {feature.name}
                    </h3>
                    <p className="mt-5 text-sm leading-6 text-gray-600">
                      {feature.description}
                    </p>
                  </div>
                  <div className="mt-6">
                    <h4 className="text-sm font-semibold text-gray-900">{t('helpPage.stepsTitle')}</h4>
                    <ul className="mt-4 space-y-3">
                      {feature.steps.map((step: string, index: number) => (
                        <li key={index} className="flex gap-x-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 text-sm font-medium">
                            {index + 1}
                          </span>
                          <span className="text-sm leading-6 text-gray-600">{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Funcionalidades de SuperAdmin */}
        {isSuperAdmin && (
          <div className="mt-24">
            <div className="border-t border-gray-200 pt-16">
              <h3 className="text-2xl font-bold tracking-tight text-gray-900 mb-8">
                {t('helpPage.superAdminFeaturesTitle')}
              </h3>
              <div className="space-y-20">
                {superAdminFeatures.map((feature, featureIdx) => (
                  <div
                    key={feature.name}
                    className="relative isolate flex flex-col gap-10 lg:flex-row"
                  >
                    <div className="relative aspect-[16/9] sm:aspect-[2/1] lg:aspect-square lg:w-64 lg:shrink-0">
                      <div className="absolute inset-0 rounded-2xl bg-blue-50 object-cover border-2 border-blue-200">
                        <feature.icon 
                          className="absolute top-1/2 left-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 text-blue-600" 
                          aria-hidden="true" 
                        />
                      </div>
                    </div>
                    <div>
                      <div className="group relative max-w-xl">
                        <div className="flex items-center gap-2">
                          <h3 className="mt-3 text-lg font-semibold leading-6 text-gray-900">
                            {feature.name}
                          </h3>
                          <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                            {t('helpPage.adminBadgeLabel')}
                          </span>
                        </div>
                        <p className="mt-5 text-sm leading-6 text-gray-600">
                          {feature.description}
                        </p>
                      </div>
                      <div className="mt-6">
                        <h4 className="text-sm font-semibold text-gray-900">{t('helpPage.stepsTitle')}</h4>
                        <ul className="mt-4 space-y-3">
                          {feature.steps.map((step: string, index: number) => (
                            <li key={index} className="flex gap-x-3">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm font-medium">
                                {index + 1}
                              </span>
                              <span className="text-sm leading-6 text-gray-600">{step}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HowToUse;