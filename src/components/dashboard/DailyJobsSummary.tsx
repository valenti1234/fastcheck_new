import React from 'react';
import Card from '../common/Card';
import { useTranslation } from 'react-i18next';

interface DailyJobsSummaryProps {
  daily: number;
}

const DailyJobsSummary: React.FC<DailyJobsSummaryProps> = ({ daily }) => {
  const { t } = useTranslation();

  return (
    <Card
      title={t('dailyJobs.title')}
      subtitle={t('dailyJobs.subtitle')}
    >
      <div className="space-y-6">
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-base font-medium text-gray-700 dark:text-gray-300">{t('dailyJobs.daily')}</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="h-4 flex-grow bg-gray-200 dark:bg-gray-700 rounded-full">
              <div className="h-4 bg-green-500 dark:bg-green-400 rounded-full" style={{ width: '100%' }}></div>
            </div>
            <span className="text-base font-semibold text-gray-800 dark:text-white">{t('dailyJobs.elements', { count: daily })}</span>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default DailyJobsSummary;