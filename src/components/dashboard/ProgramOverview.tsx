import React from 'react';
import Card from '../common/Card';
import StatsCard from '../common/StatsCard';
import RiskProgressBars from './RiskProgressBars';
interface RiskData {
  riskLevel: string;
}

interface ProgramOverviewProps {
  inherentRiskData: RiskData[];
}

const ProgramOverview: React.FC<ProgramOverviewProps> = ({ inherentRiskData }) => {
  const riskData = inherentRiskData.map(item => {
    switch ((item.riskLevel || '').toLowerCase()) {
      case 'red':
        return { ...item, riskLevel: 'Alto' };
      case 'yellow':
        return { ...item, riskLevel: 'Bajo' };
      case 'green':
        return { ...item, riskLevel: 'Sin Riesgo' };
      default:
        return { ...item, riskLevel: 'Desconocido' };
    }
  });

  return (
    <Card
      title="Evaluaciones Totales"
   
    >
      <div className="mt-6">
        <RiskProgressBars data={riskData} />
      </div>
    </Card>
  );
};

export default ProgramOverview; 