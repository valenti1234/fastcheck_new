import React from 'react';
import Card from '../common/Card';

interface Result {
  _id: string;
  rut: string;
  details: {
    razonSocial: string;
  };
  newSummaryData: {
    generalSemaphore: string;
  };
  createdAt: string;
}

interface Last10ResultsTableProps {
  results: Result[];
  onRutClick: (rut: string) => void;
}

const getSemaphoreColor = (semaphore: string) => {
  switch (semaphore) {
    case 'red':
      return 'bg-red-500';
    case 'orange':
      return 'bg-orange-500';
    case 'yellow':
      return 'bg-yellow-500';
    case 'green':
      return 'bg-green-500';
    default:
      return 'bg-gray-500';
  }
};

const getSemaphoreDisplayName = (semaphore: string) => {
  switch (semaphore) {
    case 'red':
      return 'Critico';
    case 'orange':
      return 'Alto';
    case 'yellow':
      return 'Medio';
    case 'green':
      return 'Bajo';
    default:
      return semaphore;
  }
};

const Last10ResultsTable: React.FC<Last10ResultsTableProps> = ({ results, onRutClick }) => {
  return (
    <Card title="Últimas 10 Evaluaciones">
      <table className="w-full">
        <thead>
          <tr className="text-left">
            <th className="pb-2">RUT</th>
            <th className="pb-2">Razón Social</th>
            <th className="pb-2">Fecha Evaluación</th>
            <th className="pb-2">Resultado</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr key={result._id} className="border-t">
              <td className="py-2">
                <button onClick={() => onRutClick(result.rut)} className="text-blue-500 hover:underline">
                  {result.rut}
                </button>
              </td>
              <td className="py-2">{result.details.razonSocial}</td>
              <td className="py-2">{new Date(result.createdAt).toLocaleDateString()}</td>
              <td className="py-2">
                {result.newSummaryData ? (
                  <div className="flex items-center">
                    <div className={`w-4 h-4 rounded-full mr-2 ${getSemaphoreColor(result.newSummaryData.generalSemaphore)}`}></div>
                    {getSemaphoreDisplayName(result.newSummaryData.generalSemaphore)}
                  </div>
                ) : (
                  <span>No data</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
};

export default Last10ResultsTable;