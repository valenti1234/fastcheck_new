import React from 'react';
import Card from '../common/Card';

interface ClientInfoProps {
  clientInfo: {
    razonSocial: string;
    rut: string;
  };
}

const ClientInfo: React.FC<ClientInfoProps> = ({ clientInfo }) => {
  return (
    <Card title="Información del cliente">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="font-bold">Razón Social:</p>
          <p>{clientInfo.razonSocial}</p>
        </div>
        <div>
          <p className="font-bold">Rut / ID:</p>
          <p>{clientInfo.rut}</p>
        </div>
      </div>
    </Card>
  );
};

export default ClientInfo;