import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import Card from '../common/Card';
import FilterTabs from '../common/FilterTabs';
import { logger } from '../../utils/logger';
import { useTranslation } from 'react-i18next';

interface AuditItem {
  id: string;
  name: string;
  status: 'upcoming' | 'in_audit' | 'awaiting_report' | 'completed';
  timeRemaining: string;
  icon?: string;
}

interface AuditOverviewProps {
  audits: AuditItem[];
}

const AuditOverview: React.FC<AuditOverviewProps> = ({ audits }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('all');

  const tabs = [
    { id: 'all', label: t('auditOverview.tabs.all') },
    { id: 'upcoming', label: t('auditOverview.tabs.upcoming') },
    { id: 'in_audit', label: t('auditOverview.tabs.in_audit') },
    { id: 'awaiting_report', label: t('auditOverview.tabs.awaiting_report') },
    { id: 'completed', label: t('auditOverview.tabs.completed') }
  ];

  return (
    <Card
      title={t('auditOverview.title')}
      subtitle={t('auditOverview.subtitle')}
    >
      <FilterTabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        className="mb-6"
      />

      <div className="space-y-2">
        {audits.map((audit) => (
          <div 
            key={audit.id}
            className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg cursor-pointer"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center">
                {audit.icon ? (
                  <img src={audit.icon} alt="" className="w-6 h-6" />
                ) : (
                  <div className="w-6 h-6 bg-white rounded"></div>
                )}
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-900">{audit.name}</h3>
                <p className="text-sm text-gray-500">{t('auditOverview.tabs.upcoming')} - {audit.timeRemaining}</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </div>
        ))}
      </div>
    </Card>
  );
};

export default AuditOverview;