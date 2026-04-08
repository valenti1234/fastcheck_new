import React from 'react';
import { Building, Shield, BarChart2, FileText, AlertTriangle, Briefcase, FileWarning, Users, BookOpen, ShoppingCart, Landmark, FileJson, Paperclip, Bot } from 'lucide-react';
import HumanReadableJson from './HumanReadableJson';
import { SheriffDataLogResponse } from '../../types/sheriff';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface DuxiterSummaryCardProps {
  rut: string;
  data: any;
}

const DataField: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <p className="text-xs text-gray-500">{label}</p>
    <div className="text-sm font-medium text-gray-800">{value || 'No disponible'}</div>
  </div>
);

const Section: React.FC<{ icon: React.ElementType; title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ icon: Icon, title, children, defaultOpen = false }) => (
  <details className="py-4" open={defaultOpen}>
    <summary className="flex items-center mb-3 cursor-pointer">
      <Icon className="w-5 h-5 text-primary-600 mr-3" />
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
    </summary>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pl-8">
      {children}
    </div>
  </details>
);

const TrafficLight: React.FC<{ level: string }> = ({ level }) => {
  const levelColor = {
    'green': 'bg-green-500',
    'yellow': 'bg-yellow-500',
    'red': 'bg-red-500',
    'Risk free': 'bg-green-500',
    'Low': 'bg-yellow-500',
    'Medium': 'bg-orange-500',
    'High': 'bg-red-500',
  }[level] || 'bg-gray-400';

  return (
    <div className="flex items-center">
      <div className={`w-3 h-3 rounded-full mr-2 ${levelColor}`}></div>
      <span className="text-sm text-gray-600 capitalize">{level}</span>
    </div>
  );
};

const DuxiterSummaryCard: React.FC<DuxiterSummaryCardProps> = ({ rut, data }) => {
  logger.log('DuxiterSummaryCard data:', data);
  const sheriffLogData = data.sheriffLogData || {};
  const summary = sheriffLogData.summaryData?.data;
  const riskAssessment = sheriffLogData.riskAssessment;
  const duxiterRiskData = data.duxiterRiskData ||{}
  const duxiterRiskLevel = data.duxiterRiskLevel || {};
  const duxiterMD= data.duxiterMD || null;

  logger.log('duxiterRiskData:', duxiterRiskData);
  logger.log('duxiterRiskLevel:', duxiterRiskLevel);

  const renderJsonData = (data: any, title: string, icon: React.ElementType) => (
    <>
      <hr className="my-6 border-gray-100" />
      <Section icon={icon} title={title}>
        <div className="col-span-1 sm:col-span-3">
          <HumanReadableJson data={data} />
        </div>
      </Section>
    </>
  );

  return (
    <div className="bg-white shadow-xl rounded-2xl p-8">
      <Section icon={Building} title="Información Principal" defaultOpen>
        <DataField label="RUT" value={rut} />
        <DataField label="Razón Social" value={summary?.sii?.razonSocial} />
        <DataField label="Fecha Evaluación" value={sheriffLogData.fetchedAt ? new Date(sheriffLogData.fetchedAt).toLocaleDateString('es-CL') : 'No disponible'} />
      </Section>

      <hr className="my-6 border-gray-100" />

      <Section icon={Shield} title="Nivel de Riesgo" defaultOpen>
        <DataField label="Nivel de riesgo general" value={<TrafficLight level={duxiterRiskLevel || 'No disponible'} />} />
      </Section>

      <details className="py-4" open>
        <summary className="flex items-center mb-3 cursor-pointer">
          <BarChart2 className="w-5 h-5 text-primary-600 mr-3" />
          <h3 className="text-lg font-semibold text-gray-900">Detalle del Riesgo</h3>
        </summary>
        <div className="space-y-4 pl-8">
          {duxiterRiskData ? (
            Object.entries(duxiterRiskData).map(([category, details]: [string, any]) => (
              <div key={category}>
                <div className="flex justify-between items-center">
                  <h4 className="font-semibold text-gray-700 mb-2 capitalize">{category.replace(/([A-Z])/g, ' $1')}</h4>
                  <TrafficLight level={details.semaphore} />
                </div>
                {details.list.length > 0 ? (
                  details.list.map((risk: string, index: number) => (
                    <p key={index} className="text-sm text-gray-600 pl-4">- {risk}</p>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 pl-4">No risks identified in this category.</p>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500 pl-4">No Duxiter risk data available.</p>
          )}
        </div>
      </details>
      {sheriffLogData.mallaSocietariaData && renderJsonData(sheriffLogData.mallaSocietariaData, "Malla Societaria", Users)}


      {sheriffLogData.associatedPdfs && sheriffLogData.associatedPdfs.length > 0 && (
        <>
          <hr className="my-6 border-gray-100" />
          <Section icon={Paperclip} title="Associated PDFs">
            <div className="col-span-1 sm:col-span-3">
              <ul className="list-disc pl-5">
                {sheriffLogData.associatedPdfs.map((pdf: { originalUrl: string; documentTitle: string; sourcePath: string }, index: number) => (
                  <li key={index} className="mb-2">
                    <a href={pdf.originalUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      {pdf.documentTitle || pdf.sourcePath}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </Section>
        </>
      )}

      {sheriffLogData.aiSummaryMarkdown && (
        <>
          <hr className="my-6 border-gray-100" />
          <Section icon={Bot} title="Resumen">
            <div className="col-span-1 sm:col-span-3">
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {duxiterMD}
                </ReactMarkdown>
              </div>
            </div>
          </Section>
        </>
      )}
    </div>
  );
};

export default DuxiterSummaryCard;