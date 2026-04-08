import React from 'react';
import { DuxiterRiskData } from '../../types/sheriff';
import { Shield, AlertTriangle } from 'lucide-react';

interface DuxiterRiskCardProps {
  riskData: DuxiterRiskData;
}

const TrafficLight: React.FC<{ level: string }> = ({ level }) => {
  const levelColor = {
    'green': 'bg-green-500',
    'yellow': 'bg-yellow-500',
    'red': 'bg-red-500',
    'free': 'bg-green-500',
  }[level] || 'bg-gray-400';

  return (
    <div className="flex items-center">
      <div className={`w-3 h-3 rounded-full mr-2 ${levelColor}`}></div>
      <span className="text-sm font-medium text-gray-800 capitalize">{level}</span>
    </div>
  );
};

const DuxiterRiskCard: React.FC<DuxiterRiskCardProps> = ({ riskData }) => {
  if (!riskData) {
    return null;
  }

  const overallRisk = Object.values(riskData).reduce((acc, curr) => {
    if (curr.semaphore === "red") return "red";
    if (curr.semaphore === "yellow" && acc !== "red") return "yellow";
    return acc;
  }, "green");

  return (
    <div className="bg-white shadow-md rounded-lg p-6 border border-gray-200 mt-8">
      <div className="flex items-center mb-4">
        <Shield className="w-6 h-6 text-primary-600 mr-3" />
        <h2 className="text-xl font-bold text-gray-800">Resumen de Riesgo Duxiter</h2>
      </div>

      <div className="mb-6">
        <p className="text-sm text-gray-500">Nivel de Riesgo General</p>
        <TrafficLight level={overallRisk} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.entries(riskData).map(([category, details]) => (
          <div key={category} className="p-4 border border-gray-200 rounded-md">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-semibold text-gray-700 capitalize">{category.replace(/([A-Z])/g, ' $1')}</h4>
              <TrafficLight level={details.semaphore} />
            </div>
            {details.list.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1">
                {details.list.map((risk: string, index: number) => (
                  <li key={index} className="text-sm text-gray-600 flex items-start">
                    <AlertTriangle className="w-4 h-4 text-yellow-600 mr-2 mt-0.5 flex-shrink-0" />
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 pl-1">No se identificaron riesgos en esta categoría.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DuxiterRiskCard;