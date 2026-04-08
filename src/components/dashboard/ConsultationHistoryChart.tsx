import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, AreaChart, Area } from 'recharts';
import { ChartBarIcon, ChartBarSquareIcon, PresentationChartLineIcon } from '@heroicons/react/24/outline';
import { IResult as IResultBackend } from '../../../server/src/models/Result';
import { useTranslation } from 'react-i18next';

interface IResult extends Omit<IResultBackend, 'rut'> {
  _id: string;
  createdAt: string;
  rut?: string;
}

interface ConsultationHistoryChartProps {
  results: IResult[];
  viewType?: 'monthly' | 'daily' | 'yearly';
}

interface ChartData {
  date: string;
  count: number;
  displayDate: string;
}

type ChartType = 'bar' | 'line' | 'area';

const ConsultationHistoryChart: React.FC<ConsultationHistoryChartProps> = ({ results, viewType = 'monthly' }) => {
  const { t, i18n } = useTranslation();
  const [chartType, setChartType] = useState<ChartType>('bar');
  
  const chartData = useMemo(() => {
    const dateGroups: { [key: string]: number } = {};
    
    if (viewType === 'monthly') {
      // Group by month
      results.forEach(result => {
        const date = new Date(result.createdAt);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM format
        dateGroups[monthKey] = (dateGroups[monthKey] || 0) + 1;
      });

      // Convert to array and sort by date
      const data: ChartData[] = Object.entries(dateGroups)
        .map(([monthKey, count]) => {
          const [year, month] = monthKey.split('-');
          const resolvedLangKey = (i18n.resolvedLanguage ?? i18n.language ?? 'es');
          const localeMap: Record<string, string> = { es: 'es-ES', en: 'en-US', pt: 'pt-PT', fr: 'fr-FR' };
          const dateLocale = localeMap[resolvedLangKey] ?? 'es-ES';
          
          return {
            date: monthKey,
            count,
            displayDate: new Date(parseInt(year), parseInt(month) - 1, 15).toLocaleDateString(dateLocale, {
              month: 'short',
              year: 'numeric'
            })
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-12); // Show last 12 months

      return data;
    } else if (viewType === 'daily') {
      // Group by day
      results.forEach(result => {
        const date = new Date(result.createdAt);
        const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD format
        dateGroups[dateKey] = (dateGroups[dateKey] || 0) + 1;
      });

      // Convert to array and sort by date
      const data: ChartData[] = Object.entries(dateGroups)
        .map(([date, count]) => {
          const resolvedLangKey = (i18n.resolvedLanguage ?? i18n.language ?? 'es');
          const localeMap: Record<string, string> = { es: 'es-ES', en: 'en-US', pt: 'pt-PT', fr: 'fr-FR' };
          const dateLocale = localeMap[resolvedLangKey] ?? 'es-ES';
          return {
            date,
            count,
            displayDate: new Date(date + 'T12:00:00').toLocaleDateString(dateLocale, {
              day: '2-digit',
              month: '2-digit'
            })
          };
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(-30); // Show last 30 days

      return data;
    } else {
      // Group by year
      results.forEach(result => {
        const date = new Date(result.createdAt);
        const yearKey = `${date.getFullYear()}`; // YYYY format
        dateGroups[yearKey] = (dateGroups[yearKey] || 0) + 1;
      });

      // Convert to array and sort by date
      const data: ChartData[] = Object.entries(dateGroups)
        .map(([year, count]) => ({
          date: year,
          count,
          displayDate: year
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-10); // Show last 10 years

      return data;
    }
  }, [results, viewType, i18n.resolvedLanguage, i18n.language]);

  const totalConsultations = results.length;
  const averagePerPeriod = chartData.length > 0 ? (totalConsultations / chartData.length).toFixed(1) : '0';
  const maxInPeriod = Math.max(...chartData.map(d => d.count), 0);

  return (
    <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-200 dark:border-gray-700">
      <div className="px-6 py-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex items-center space-x-3 mb-4 sm:mb-0">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
              <ChartBarIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{t('consultationChart.title')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('consultationChart.subtitle')}</p>
            </div>
          </div>
          
          {/* Chart Type Selector */}
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('consultationChart.chartType')}:</span>
            <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
              <button
                onClick={() => setChartType('bar')}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  chartType === 'bar'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
                title={t('consultationChart.barChart')}
              >
                <ChartBarIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => setChartType('line')}
                className={`px-3 py-2 text-sm font-medium transition-colors border-l border-gray-300 dark:border-gray-600 ${
                  chartType === 'line'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
                title={t('consultationChart.lineChart')}
              >
                <PresentationChartLineIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => setChartType('area')}
                className={`px-3 py-2 text-sm font-medium transition-colors border-l border-gray-300 dark:border-gray-600 ${
                  chartType === 'area'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
                title={t('consultationChart.areaChart')}
              >
                <ChartBarSquareIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalConsultations}</div>
            <div className="text-sm text-blue-600 dark:text-blue-400">{t('consultationChart.cards.totalConsultas')}</div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{averagePerPeriod}</div>
            <div className="text-sm text-green-600 dark:text-green-400">
              {viewType === 'monthly' 
                ? t('consultationChart.cards.averagePerMonth') 
                : viewType === 'daily' 
                  ? t('consultationChart.cards.averagePerDay') 
                  : t('consultationChart.cards.averagePerYear')}
            </div>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{maxInPeriod}</div>
            <div className="text-sm text-purple-600 dark:text-purple-400">
              {viewType === 'monthly' 
                ? t('consultationChart.cards.maxInMonth') 
                : viewType === 'daily' 
                  ? t('consultationChart.cards.maxInDay') 
                  : t('consultationChart.cards.maxInYear')}
            </div>
          </div>
        </div>

        {/* Chart */}
        {chartData.length > 0 ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis 
                    dataKey="displayDate" 
                    tick={{ fontSize: 12 }}
                    className="text-gray-600 dark:text-gray-400"
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    className="text-gray-600 dark:text-gray-400"
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'rgb(31 41 55)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white'
                    }}
                    labelFormatter={(label) => `${t('consultationChart.tooltip.date')}: ${label}`}
                    formatter={(value: number) => [value, t('consultationChart.tooltip.consultas')]}
                  />
                  <Bar 
                    dataKey="count" 
                    fill="#3B82F6" 
                    radius={[4, 4, 0, 0]}
                    className="hover:opacity-80 transition-opacity"
                  />
                </BarChart>
              ) : chartType === 'line' ? (
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis 
                    dataKey="displayDate" 
                    tick={{ fontSize: 12 }}
                    className="text-gray-600 dark:text-gray-400"
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    className="text-gray-600 dark:text-gray-400"
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'rgb(31 41 55)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white'
                    }}
                    labelFormatter={(label) => `${t('consultationChart.tooltip.date')}: ${label}`}
                    formatter={(value: number) => [value, t('consultationChart.tooltip.consultas')]}
                  />
                  <Line 
                    type="monotone"
                    dataKey="count" 
                    stroke="#3B82F6" 
                    strokeWidth={3}
                    dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, stroke: '#3B82F6', strokeWidth: 2, fill: '#ffffff' }}
                  />
                </LineChart>
              ) : (
                <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis 
                    dataKey="displayDate" 
                    tick={{ fontSize: 12 }}
                    className="text-gray-600 dark:text-gray-400"
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    className="text-gray-600 dark:text-gray-400"
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'rgb(31 41 55)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white'
                    }}
                    labelFormatter={(label) => `${t('consultationChart.tooltip.date')}: ${label}`}
                    formatter={(value: number) => [value, t('consultationChart.tooltip.consultas')]}
                  />
                  <Area 
                    type="monotone"
                    dataKey="count" 
                    stroke="#3B82F6" 
                    strokeWidth={2}
                    fill="url(#colorGradient)"
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
            <ChartBarIcon className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">{t('consultationChart.empty.title')}</p>
            <p className="text-sm">{t('consultationChart.empty.subtitle')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConsultationHistoryChart;
