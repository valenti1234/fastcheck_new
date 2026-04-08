import React, { useMemo } from 'react';
interface RiskData {
  riskLevel: string;
}

interface RiskProgressBarsProps {
  data: RiskData[];
}

const RiskProgressBars: React.FC<RiskProgressBarsProps> = ({ data }) => {
  const riskFreeCount = useMemo(
    () => data.filter((item) => (item.riskLevel || '').toLowerCase() === 'sin riesgo' || (item.riskLevel || '').toLowerCase() === 'risk free').length,
    [data]
  );
  const lowRiskCount = useMemo(
    () => data.filter((item) => (item.riskLevel || '').toLowerCase() === 'bajo' || (item.riskLevel || '').toLowerCase() === 'low').length,
    [data]
  );
  const highRiskCount = useMemo(
    () => data.filter((item) => (item.riskLevel || '').toLowerCase() === 'alto' || (item.riskLevel || '').toLowerCase() === 'high').length,
    [data]
  );
  const totalCount = data.length;
  const riskFreePercentage = totalCount > 0 ? (riskFreeCount / totalCount) * 100 : 0;
  const lowRiskPercentage = totalCount > 0 ? (lowRiskCount / totalCount) * 100 : 0;
  const highRiskPercentage = totalCount > 0 ? (highRiskCount / totalCount) * 100 : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center justify-between">
                <p className="text-base font-medium text-gray-400">Sin Riesgo</p>
            </div>
            <div className="mt-2 flex items-baseline gap-x-2">
                <p className="text-4xl font-bold tracking-tight text-white">{riskFreePercentage.toFixed(0)}%</p>
                <p className="text-base text-gray-400">{riskFreeCount} de {totalCount} elementos</p>
            </div>
            <div className="mt-4 h-4 rounded-full bg-gray-200">
                <div className="h-4 rounded-full bg-green-500" style={{ width: `${riskFreePercentage}%` }}></div>
            </div>
        </div>
        <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center justify-between">
                <p className="text-base font-medium text-gray-400">Riesgo Bajo</p>
            </div>
            <div className="mt-2 flex items-baseline gap-x-2">
                <p className="text-4xl font-bold tracking-tight text-white">{lowRiskPercentage.toFixed(0)}%</p>
                <p className="text-base text-gray-400">{lowRiskCount} de {totalCount} elementos</p>
            </div>
            <div className="mt-4 h-4 rounded-full bg-gray-200">
                <div className="h-4 rounded-full bg-orange-400" style={{ width: `${lowRiskPercentage}%` }}></div>
            </div>
        </div>
        <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center justify-between">
                <p className="text-base font-medium text-gray-400">Riesgo Alto</p>
            </div>
            <div className="mt-2 flex items-baseline gap-x-2">
                <p className="text-4xl font-bold tracking-tight text-white">{highRiskPercentage.toFixed(0)}%</p>
                <p className="text-base text-gray-400">{highRiskCount} de {totalCount} elementos</p>
            </div>
            <div className="mt-4 h-4 rounded-full bg-gray-200">
                <div className="h-4 rounded-full bg-red-500" style={{ width: `${highRiskPercentage}%` }}></div>
            </div>
        </div>
    </div>
  );
};

export default RiskProgressBars;