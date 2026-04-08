import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import Card from '../common/Card';

ChartJS.register(ArcElement, Tooltip, Legend);

interface EvaluationSummaryProps {
  summary: {
    totalCriticalCount: number;
    totalHighCount: number;
    totalMediumCount: number;
    totalLowCount: number;
    compliance: any;
    legal: any;
    capitalHumano: any;
    financieroTributario: any;
  };
  providerDistribution: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

const EvaluationSummary: React.FC<EvaluationSummaryProps> = ({ summary, providerDistribution }) => {
  const totalParameters = (summary.compliance ? Object.keys(summary.compliance).length : 0) +
    (summary.legal ? Object.keys(summary.legal).length : 0) +
    (summary.capitalHumano ? Object.keys(summary.capitalHumano).length : 0) +
    (summary.financieroTributario ? Object.keys(summary.financieroTributario).length : 0);

  const totalDetectedRisks = summary.totalCriticalCount + summary.totalHighCount + summary.totalMediumCount + summary.totalLowCount;
  const freeParameters = totalParameters - totalDetectedRisks;

  const data = {
    labels: ['Crítico', 'Alto', 'Medio', 'Bajo', 'Sin Riesgo'],
    datasets: [
      {
        data: [summary.totalCriticalCount, summary.totalHighCount, summary.totalMediumCount, summary.totalLowCount, freeParameters],
        backgroundColor: ['#EF4444', '#F97316', '#FBBF24', '#22C55E', '#E5E7EB'],
        borderColor: ['#EF4444', '#F97316', '#FBBF24', '#22C55E', '#E5E7EB'],
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
        display: false,
      },
    },
  };

  return (
    <Card title="Resumen de la Evaluación">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <div>
            <p className="font-bold">Parámetros Evaluados:</p>
            <p className="text-4xl font-bold">{totalParameters}</p>
          </div>
          <div className="mt-4">
            <p className="font-bold">Fecha Evaluación:</p>
            <p>{new Date().toLocaleDateString()}</p>
          </div>
        </div>
        <div className="md:col-span-1">
          <div className="relative h-64">
            <Doughnut data={data} options={options} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-4xl font-bold">{totalParameters}</p>
                <p>Parámetros</p>
              </div>
            </div>
          </div>
        </div>
        <div className="md:col-span-1 grid grid-cols-2 gap-4">
            <div>
                <p className="font-bold text-red-500">{summary.totalCriticalCount} CRÍTICO</p>
                <p className="text-sm text-gray-500">al menos 1 parámetro con riesgo crítico, o desde 70% riesgo alto</p>
            </div>
            <div>
                <p className="font-bold text-orange-500">{summary.totalHighCount} ALTO</p>
                <p className="text-sm text-gray-500">desde 50% de los parámetros con riesgo alto</p>
            </div>
            <div>
                <p className="font-bold text-yellow-500">{summary.totalMediumCount} MEDIO</p>
                <p className="text-sm text-gray-500">desde 30% de los parámetros con riesgo alto</p>
            </div>
            <div>
                <p className="font-bold text-green-500">{summary.totalLowCount} BAJO</p>
                <p className="text-sm text-gray-500">menos del 30% de los parámetros con riesgo alto</p>
            </div>
        </div>
      </div>
    </Card>
  );
};

export default EvaluationSummary;