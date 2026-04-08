import React from 'react';
import Card from '../common/Card';

interface RiskSummaryTotals {
  totalSevero: number;
  totalSignificativo: number;
  totalDetected: number;
  totalParameters: number;
}

interface TotalJobsSummaryProps {
  total: number;
  riskSummaryTotals: RiskSummaryTotals;
}

const TotalJobsSummary: React.FC<TotalJobsSummaryProps> = ({ total, riskSummaryTotals }) => {
  return (
    <Card
      title="Trabajos Totales"
      subtitle="Evaluaciones totales"
    >
      <div className="space-y-6">
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-base font-medium text-gray-700 dark:text-gray-300">Evaluaciones Totales</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="h-4 flex-grow bg-gray-200 dark:bg-gray-700 rounded-full">
              <div className="h-4 bg-primary-500 dark:bg-primary-400 rounded-full" style={{ width: '100%' }}></div>
            </div>
            <span className="text-base font-semibold text-gray-800 dark:text-white">{total} elementos</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-base font-medium text-gray-700 dark:text-gray-300">Resumen Total de Riesgos</span>
          </div>
          <div className="space-y-4">
            {/* Red - Severe Risks */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <p className="text-sm text-gray-500">Riesgos Severos</p>
                <p className="text-sm font-semibold text-red-600">{riskSummaryTotals.totalSevero}</p>
              </div>
              <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full">
                <div
                  className="h-3 bg-red-600 rounded-full"
                  style={{
                    width: `${riskSummaryTotals.totalParameters > 0
                      ? (riskSummaryTotals.totalSevero / riskSummaryTotals.totalParameters) * 100
                      : 0}%`
                  }}
                ></div>
              </div>
            </div>
            
            {/* Orange - Significant Risks */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <p className="text-sm text-gray-500">Riesgos Significativos</p>
                <p className="text-sm font-semibold text-orange-500">{riskSummaryTotals.totalSignificativo}</p>
              </div>
              <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full">
                <div
                  className="h-3 bg-orange-500 rounded-full"
                  style={{
                    width: `${riskSummaryTotals.totalParameters > 0
                      ? (riskSummaryTotals.totalSignificativo / riskSummaryTotals.totalParameters) * 100
                      : 0}%`
                  }}
                ></div>
              </div>
            </div>
            
            {/* Yellow - Detected Risks */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <p className="text-sm text-gray-500">Riesgos Detectados</p>
                <p className="text-sm font-semibold text-yellow-500">{riskSummaryTotals.totalDetected}</p>
              </div>
              <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full">
                <div
                  className="h-3 bg-yellow-500 rounded-full"
                  style={{
                    width: `${riskSummaryTotals.totalParameters > 0
                      ? (riskSummaryTotals.totalDetected / riskSummaryTotals.totalParameters) * 100
                      : 0}%`
                  }}
                ></div>
              </div>
            </div>
            
            {/* Green - Low Risks */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <p className="text-sm text-gray-500">Riesgos Bajos</p>
                <p className="text-sm font-semibold text-green-500">
                  {riskSummaryTotals.totalParameters - (
                    riskSummaryTotals.totalSevero +
                    riskSummaryTotals.totalSignificativo +
                    riskSummaryTotals.totalDetected
                  )}
                </p>
              </div>
              <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full">
                <div
                  className="h-3 bg-green-500 rounded-full"
                  style={{
                    width: `${riskSummaryTotals.totalParameters > 0
                      ? ((riskSummaryTotals.totalParameters - (
                        riskSummaryTotals.totalSevero +
                        riskSummaryTotals.totalSignificativo +
                        riskSummaryTotals.totalDetected
                      )) / riskSummaryTotals.totalParameters) * 100
                      : 0}%`
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default TotalJobsSummary;