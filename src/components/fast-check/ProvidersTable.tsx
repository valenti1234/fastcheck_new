import React from 'react';
import Card from '../common/Card';

interface Provider {
  rut: string;
  razonSocial: string;
  riesgoCritico: number;
  riesgoAlto: number;
  riesgoBajo: number;
  riesgoFinal: string;
}

interface ProvidersTableProps {
  providers: Provider[];
}

const getRiskColor = (risk: string) => {
  switch (risk) {
    case 'Crítico':
      return 'bg-red-500';
    case 'Alto':
      return 'bg-orange-500';
    case 'Medio':
      return 'bg-yellow-500';
    case 'Bajo':
      return 'bg-green-500';
    default:
      return 'bg-gray-500';
  }
};

const ProvidersTable: React.FC<ProvidersTableProps> = ({ providers }) => {
  return (
    <Card title="Detalle Proveedores">
      <table className="w-full">
        <thead>
          <tr className="text-left">
            <th className="pb-2">Rut</th>
            <th className="pb-2">Razón Social</th>
            <th className="pb-2"># Parámetros Riesgo Crítico</th>
            <th className="pb-2"># Parámetros Riesgo Alto</th>
            <th className="pb-2"># Parámetros Riesgo Bajo</th>
            <th className="pb-2">Riesgo Final</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((provider, index) => (
            <tr key={index} className="border-t">
              <td className="py-2">{provider.rut}</td>
              <td className="py-2">{provider.razonSocial}</td>
              <td className="py-2">{provider.riesgoCritico}</td>
              <td className="py-2">{provider.riesgoAlto}</td>
              <td className="py-2">{provider.riesgoBajo}</td>
              <td className="py-2">
                <div className="flex items-center">
                  <div className={`w-4 h-4 rounded-full mr-2 ${getRiskColor(provider.riesgoFinal)}`}></div>
                  {provider.riesgoFinal}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
};

export default ProvidersTable;