import React, { useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import Card from '../common/Card';
import { useTranslation } from 'react-i18next';

ChartJS.register(ArcElement, Tooltip, Legend);

interface RiskDonutChartProps {
  results: any[];
}

const RiskDonutChart: React.FC<RiskDonutChartProps> = ({ results }) => {
  const { t } = useTranslation();
  const riskDistribution = useMemo(() => {
    const distribution = {
      green: 0,
      yellow: 0,
      orange: 0,
      red: 0
    };

    results.forEach(result => {
      if (result.riskAssessment?.riskSummary?.semaphore) {
        const semaphore = result.riskAssessment.riskSummary.semaphore as keyof typeof distribution;
        if (semaphore in distribution) {
          distribution[semaphore] += 1;
        }
      }
    });

    return distribution;
  }, [results]);

  const data = {
    labels: [
      t('risk.low'),
      t('risk.medium'),
      t('risk.high'),
      t('risk.critical')
    ],
    datasets: [
      {
        data: [
          riskDistribution.green,
          riskDistribution.yellow,
          riskDistribution.orange,
          riskDistribution.red
        ],
        backgroundColor: ['#22C55E', '#FBBF24', '#F97316', '#EF4444'],
        borderColor: ['#22C55E', '#FBBF24', '#F97316', '#EF4444'],
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          padding: 20,
          usePointStyle: true,
          pointStyle: 'circle'
        }
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const label = context.label || '';
            const value = context.raw || 0;
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
            const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
            return `${label}: ${value} (${percentage}%)`;
          }
        }
      }
    },
  };

  const totalEvaluations = Object.values(riskDistribution).reduce((a, b) => a + b, 0);

  return (
    <Card
      title={t('riskDonut.title', { defaultValue: 'Resumen de Riesgos' })}
      subtitle={t('riskDonut.subtitle', { defaultValue: 'Distribución por nivel de riesgo' })}
    >
      <div className="h-80 relative">
        <Doughnut data={data} options={options} />
        <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: 'none' }}>
          <div className="text-center">
            <p className="text-4xl font-bold">{totalEvaluations}</p>
            <p className="text-sm text-gray-500">{t('riskDonut.evaluations', { defaultValue: 'Evaluaciones' })}</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mt-6">
        <div>
          <p className="font-bold text-green-500">{riskDistribution.green} {t('risk.low')}</p>
          <p className="text-xs text-gray-500">{t('riskDonut.desc.low', { defaultValue: 'Sin riesgos significativos' })}</p>
        </div>
        <div>
          <p className="font-bold text-yellow-500">{riskDistribution.yellow} {t('risk.medium')}</p>
          <p className="text-xs text-gray-500">{t('riskDonut.desc.medium', { defaultValue: 'Algunos riesgos significativos' })}</p>
        </div>
        <div>
          <p className="font-bold text-orange-500">{riskDistribution.orange} {t('risk.high')}</p>
          <p className="text-xs text-gray-500">{t('riskDonut.desc.high', { defaultValue: 'Múltiples riesgos significativos' })}</p>
        </div>
        <div>
          <p className="font-bold text-red-500">{riskDistribution.red} {t('risk.critical')}</p>
          <p className="text-xs text-gray-500">{t('riskDonut.desc.critical', { defaultValue: 'Riesgos severos detectados' })}</p>
        </div>
      </div>
    </Card>
  );
};

export default RiskDonutChart;