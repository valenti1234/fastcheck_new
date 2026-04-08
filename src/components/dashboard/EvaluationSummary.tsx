import React from 'react';
import Card from '../common/Card';

interface EvaluationSummaryProps {
  totalEvaluations: number;
}

const EvaluationSummary: React.FC<EvaluationSummaryProps> = ({ totalEvaluations }) => {
  return (
    <Card title="Resumen de Trabajos de Evaluación">
      <div className="flex flex-col items-center justify-center h-full p-6">
        <div className="text-6xl font-extrabold text-gray-900">{totalEvaluations}</div>
        <div className="mt-2 text-xl font-medium text-gray-600">Evaluaciones Totales</div>
      </div>
    </Card>
  );
};

export default EvaluationSummary;