import React, { useState, useMemo } from 'react';
import Card from '../common/Card';
import { ChevronUp, ChevronDown } from 'lucide-react';

import { InherentRiskData } from '../../types/evaluation';

interface InherentRiskProps {
  data: InherentRiskData[];
}

type SortConfig = {
  key: keyof InherentRiskData;
  direction: 'ascending' | 'descending';
} | null;

const InherentRisk: React.FC<InherentRiskProps> = ({ data }) => {
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);


  const sortedData = useMemo(() => {
    let sortableData = [...data];
    if (sortConfig !== null) {
      sortableData.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        if (sortConfig.key === 'creditScoring') {
          aValue = a.creditScoring?.classificationPercentage ?? -1;
          bValue = b.creditScoring?.classificationPercentage ?? -1;
        } else {
          aValue = a[sortConfig.key];
          bValue = b[sortConfig.key];
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableData;
  }, [data, sortConfig]);

  const requestSort = (key: keyof InherentRiskData) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: keyof InherentRiskData) => {
    if (!sortConfig || sortConfig.key !== key) {
      return null;
    }
    if (sortConfig.direction === 'ascending') {
      return <ChevronUp className="h-4 w-4" />;
    }
    return <ChevronDown className="h-4 w-4" />;
  };

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel.toLowerCase()) {
      case 'risk free':
        return 'bg-green-500';
      case 'low':
        return 'bg-orange-400';
      case 'medium':
        return 'bg-orange-400';
      case 'high':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <Card
      className="flex flex-col h-full"
      title="Riesgo Inherente"
      subtitle="Escenarios de riesgo en el tiempo agrupados por nivel de riesgo"
      showDownload
    >
      {data.length > 0 ? (
        <>
          <div className="mt-6 flex-grow overflow-y-auto">
            <div className="divide-y divide-gray-200">
              <div className="py-3.5 px-3 flex justify-between text-sm font-semibold text-gray-900 sticky top-0 bg-white">
                <button onClick={() => requestSort('razonSocial')} className="flex items-center gap-x-2">
                  <span>Razon Social</span>
                  {getSortIcon('razonSocial')}
                </button>
                <div className="flex gap-x-12 justify-end">
                  <button onClick={() => requestSort('creditScoring')} className="w-24 text-left flex items-center gap-x-2">
                    <span>Credit Scoring</span>
                    {getSortIcon('creditScoring')}
                  </button>
                  <button onClick={() => requestSort('riskLevel')} className="w-20 text-left flex items-center gap-x-2">
                    <span>Risk Level</span>
                    {getSortIcon('riskLevel')}
                  </button>
                </div>
              </div>
              {sortedData.map((item, index) => (
                <div key={`${item.rut}-${index}`} className="flex items-center justify-between py-4 px-3">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.razonSocial}</p>
                  <div className="flex items-center gap-x-12">
                    <p className="text-sm text-gray-500 w-24 text-left">
                      {typeof item.creditScoring?.classificationPercentage === 'number'
                        ? item.creditScoring.classificationPercentage.toFixed(2)
                        : 'N/A'}
                    </p>
                    <div className="w-20 text-left">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRiskColor(
                          item.riskLevel
                        )} text-white`}
                      >
                        {item.riskLevel}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-10">
          <p className="text-sm text-gray-500">No data available</p>
        </div>
      )}
    </Card>
  );
};

export default InherentRisk; 