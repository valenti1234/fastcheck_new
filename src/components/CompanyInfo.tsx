import React from 'react';
import ReactMarkdown from 'react-markdown';
import { SheriffDataLogResponse } from '../types/sheriff';
import { AlertTriangle, Building, Landmark, TrendingUp, Briefcase, Scale, Users, FileText, Car, Banknote } from 'lucide-react';

interface CompanyInfoProps {
  company: SheriffDataLogResponse | null;
  loading: boolean;
  error: string | null | undefined;
  duxiterMD?: string | null;
}

const hasData = (value: any): boolean => {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value !== undefined && value !== null && value !== 'N/A' && value !== '' && value !== 0;
};

const formatCurrency = (value: number): string => {
  if (isNaN(value)) return 'N/A';
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(value);
};

const InfoCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="mb-6">
    <h3 className="text-lg font-semibold text-gray-800 flex items-center mb-3">
      {icon}
      <span className="ml-2">{title}</span>
    </h3>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
  </div>
);

const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <p className="text-sm font-medium text-gray-500">{label}</p>
    <p className="text-md text-gray-900">{value}</p>
  </div>
);

const CompanyInfo: React.FC<CompanyInfoProps> = ({ company, loading, error, duxiterMD }) => {
  if (loading) {
    return null; // Loading state is handled in the parent component
  }

  if (error) {
    return (
      <div className="bg-white shadow-md rounded-lg p-6 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-red-400" />
        <h3 className="mt-2 text-lg font-medium text-red-800">Error al Cargar</h3>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="bg-white shadow-md rounded-lg p-6 text-center">
        <FileText className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-lg font-medium text-gray-900">Sin Resultados</h3>
        <p className="mt-1 text-sm text-gray-500">Ingrese un RUT para ver la información de la empresa.</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-md rounded-lg overflow-hidden">
      <div className="p-6">
        <InfoCard title="Información Principal" icon={<Building className="text-primary-600" />}>
          <InfoRow label="RUT" value={company.rut} />
          <InfoRow label="Razón Social" value={(company.siiData as any)?.['Razon Social']} />
          {hasData((company.siiData as any)?.['Inicio Actividades']) && <InfoRow label="Inicio de Actividades" value={(company.siiData as any)?.['Inicio Actividades']} />}
        </InfoCard>

        {duxiterMD && (
          <InfoCard title="Reporte Duxiter" icon={<FileText className="text-primary-600" />}>
            <div className="prose col-span-1 md:col-span-2 lg:col-span-3">
              <ReactMarkdown>{duxiterMD}</ReactMarkdown>
            </div>
          </InfoCard>
        )}

        <InfoCard title="Estado de la Empresa" icon={<Landmark className="text-primary-600" />}>
          {hasData((company.siiData as any)?.['Situacion Actual']) && <InfoRow label="Situación Actual" value={(company.siiData as any)?.['Situacion Actual']} />}
          {hasData((company.siiData as any)?.['Tamaño Empresa']) && <InfoRow label="Tamaño" value={(company.siiData as any)?.['Tamaño Empresa']} />}
          {hasData((company.siiData as any)?.['Ventas Anuales (UF)']) && <InfoRow label="Ventas Anuales (UF)" value={(company.siiData as any)?.['Ventas Anuales (UF)']} />}
        </InfoCard>

        {hasData((company.siiData as any)?.['Actividades Economicas']) && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center mb-3">
              <Briefcase className="text-primary-600" />
              <span className="ml-2">Actividades Económicas</span>
            </h3>
            <ul className="space-y-2 pl-5 list-disc">
              {(company.siiData as any)['Actividades Economicas'].map((activity: any, index: number) => (
                <li key={index} className="text-sm text-gray-700">
                  <span className="font-semibold">{activity.actividad}</span> (Código: {activity.codigo}) - {activity.categoria}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(hasData((company.siiData as any)?.['Cantidad de Propiedades']) || hasData((company.siiData as any)?.['Cantidad de Vehiculos'])) && (
          <InfoCard title="Propiedades y Activos" icon={<Scale className="text-primary-600" />}>
            {hasData((company.siiData as any)?.['Cantidad de Propiedades']) && (
              <InfoRow
                label="Propiedades"
                value={`${(company.siiData as any)?.['Cantidad de Propiedades']} (Avalúo Total: ${formatCurrency(parseInt((company.siiData as any)?.['Avaluo Total Propiedades']))})`}
              />
            )}
            {hasData((company.siiData as any)?.['Cantidad de Vehiculos']) && <InfoRow label="Vehículos" value={`${(company.siiData as any)?.['Cantidad de Vehiculos']}`} />}
          </InfoCard>
        )}

        {(hasData((company.siiData as any)?.['Clasificacion de Riesgo']) || hasData((company.siiData as any)?.['Deuda Bancaria'])) && (
          <InfoCard title="Información Crediticia" icon={<Banknote className="text-primary-600" />}>
            {hasData((company.siiData as any)?.['Clasificacion de Riesgo']) && <InfoRow label="Clasificación de Riesgo" value={(company.siiData as any)?.['Clasificacion de Riesgo']} />}
            {hasData((company.siiData as any)?.['Deuda Bancaria']) && (
              <div>
                <p className="text-sm font-medium text-gray-500">Deuda Bancaria (al {(company.siiData as any)?.['Deuda Bancaria'].Fecha})</p>
                <p className="text-sm text-gray-800">Comercial: {formatCurrency((company.siiData as any)?.['Deuda Bancaria']['Deuda Directa Comercial'])}</p>
                <p className="text-sm text-gray-800">Vigente: {formatCurrency((company.siiData as any)?.['Deuda Bancaria']['Deuda Directa Vigente'])}</p>
                <p className="text-sm text-gray-800">Línea de Crédito: {formatCurrency((company.siiData as any)?.['Deuda Bancaria']['Linea de Credito'])}</p>
              </div>
            )}
          </InfoCard>
        )}

        {hasData((company.siiData as any)?.['Socios']) && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center mb-3">
              <Users className="text-primary-600" />
              <span className="ml-2">Socios</span>
            </h3>
            <div className="space-y-3">
              {(company.siiData as any)?.['Socios'].map((socio: any, index: number) => (
                <div key={index} className="p-3 bg-gray-50 rounded-md">
                  <p className="font-semibold text-gray-800">{socio.nombre}</p>
                  <p className="text-sm text-gray-600">RUT: {socio.rut}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Fuente: {(company.siiData as any)?.source}
          {hasData(company.updatedAt) && (
            <span className="ml-2">• Última actualización: {new Date(company.updatedAt).toLocaleDateString('es-CL')}</span>
          )}
        </p>
      </div>
    </div>
  );
};

export default CompanyInfo; 