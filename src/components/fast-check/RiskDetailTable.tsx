import React from 'react';
import Card from '../common/Card';

interface Rule {
  label: string;
  risk: string;
  detected: boolean;
  score: number;
}

interface RiskCategory {
  [key: string]: Rule;
}

interface RiskDetailTableProps {
  summary: {
    compliance: RiskCategory;
    legal: RiskCategory;
    capitalHumano: RiskCategory;
    financieroTributario: RiskCategory;
  };
}

const getRiskColor = (risk: string) => {
  switch (risk) {
    case 'critico':
      return 'text-red-500';
    case 'alto':
      return 'text-orange-500';
    case 'medio':
      return 'text-yellow-500';
    case 'bajo':
      return 'text-green-500';
    default:
      return 'text-gray-500';
  }
};

const RiskDetailTable: React.FC<RiskDetailTableProps> = ({ summary }) => {
  const categories = [
    { name: 'Compliance', data: summary.compliance },
    { name: 'Legal', data: summary.legal },
    { name: 'Capital Humano', data: summary.capitalHumano },
    { name: 'Financiero Tributario', data: summary.financieroTributario },
  ];

  return (
    <Card title="Detalle de Riesgos">
      <table className="w-full">
        <thead>
          <tr className="text-left">
            <th className="pb-2">Categoría</th>
            <th className="pb-2">Parámetro</th>
            <th className="pb-2">Riesgo</th>
            <th className="pb-2">Detectado</th>
            <th className="pb-2">Score</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <React.Fragment key={category.name}>
              {Object.entries(category.data).map(([key, rule]) => (
                <tr key={key} className="border-t">
                  <td className="py-2">{category.name}</td>
                  <td className="py-2">{rule.label}</td>
                  <td className={`py-2 font-bold ${getRiskColor(rule.risk)}`}>{rule.risk}</td>
                  <td className="py-2">{rule.detected ? 'Sí' : 'No'}</td>
                  <td className="py-2">{rule.score}</td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </Card>
  );
};

export default RiskDetailTable;