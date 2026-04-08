import React from 'react';

interface GeneralInfoCardProps {
  rawData: any;
}

const InfoField: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="mb-4">
    <p className="text-xs text-gray-500">{label}</p>
    <div className="text-sm font-medium text-gray-800">{value || 'Sin Información'}</div>
  </div>
);

const GeneralInfoCard: React.FC<GeneralInfoCardProps> = ({ rawData }) => {

  const allRules = rawData.riskAssessment.allRules;
  const riskSummary = rawData.riskAssessment.riskSummary;
  const mdResume = rawData.riskAssessment.summaryDocumentMD;
  const data = rawData.sheriffLogData;
  if (!data) {
    return null;
  }


  logger.log(25, 'data:',rawData, data,mdResume,riskSummary,allRules);

  const mallaSocietaria = data.mallaSocietariaData || {};
  const empresaEnUnDia = mallaSocietaria['EmpresaEnUnDia'] || {};
  const summary = data.summaryData?.data;
  const siiInfo = summary?.sii || {};

  
  var socios = [];
  var constitucionFecha = 'Sin Información';
//  logger.log(25, 'mallaSocietaria:', mallaSocietaria);
  if (mallaSocietaria.empresaEnUnDia.length > 0) {
    socios = mallaSocietaria.empresaEnUnDia[0].socios || [];
    constitucionFecha = mallaSocietaria.empresaEnUnDia[0].fecha || 'Sin Información';
    constitucionFecha = new Date(constitucionFecha).toLocaleDateString('es-CL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }
  logger.log(42, 'socios:', socios);



  const inicioActividades = siiInfo['Inicio Actividades'] || 'Sin Información';
  const tamanoEmpresa = siiInfo['Tamaño Empresa'] || 'Sin Información';
  const rangoVentas = siiInfo['Ventas Anuales (UF)'] || 'Sin Información';
  const trabajadores = summary?.siiBusinessSize?.dependentWorkers || 0;
  const actividades = siiInfo['Actividades Economicas'] || [];
  const businessSize = summary?.siiBusinessSize || {};

  const razonSocial= siiInfo['razonSocial'] || 'Sin Información';
  const rut= summary['rut'] || 'Sin Información';


  logger.log('mallaSocietaria data:', mallaSocietaria);


  logger.log('GeneralInfoCard data:', data);
  logger.log('Socios:', socios);
  logger.log('Actividades:', actividades);
  logger.log('SII Info:', siiInfo,siiInfo['Rut'],siiInfo['razonSocial']);

  logger.log('Empresa En Un Dia:', empresaEnUnDia);
  logger.log('Summary Data:', summary);
  logger.log('Constitución Fecha:', constitucionFecha);
  logger.log('Inicio Actividades:', inicioActividades);
  logger.log('Tamaño Empresa:', tamanoEmpresa);
  logger.log('Rango Ventas:', rangoVentas);
  logger.log('Trabajadores:', trabajadores);
  logger.log('Actividades:', actividades);
  logger.log('Business Size:', businessSize);

  return (
    <div className="bg-white shadow-xl rounded-2xl p-8">
      <div className="flex items-center mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Información General</h2>
  
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Column 1 */}
        <div>
          <InfoField
            label=""
            value={
              <div>
                <div className="flex justify-between font-semibold text-xs text-gray-500"><span>{rut}</span>
                </div>
                <div className="flex justify-between font-semibold text-xs text-gray-500">
                <span>{razonSocial}</span></div>
              </div>
            }
          />
        </div>

        {/* Column 2 */}
        <div>
          <InfoField label="Constitución Sociedad" value={constitucionFecha} />
          <InfoField label="Rango Ventas UF" value={rangoVentas} />
          <InfoField
            label="Actividades Económicas Vigentes"
            value={
              <div>
                <div className="flex justify-between font-semibold text-xs text-gray-500">
                  <span>Actividad</span>
                  <span>Codigo</span>
                  <span>Fecha</span>
                </div>
                {actividades.length > 0 ? actividades.map((act: any, index: number) => (
                  <div key={index} className="flex justify-between">
                    <span>{act.actividad}</span>
                    <span>{act.codigo}</span>
                    <span>{act.fecha || 'N/A'}</span>
                  </div>
                )) : 'Sin información'}
              </div>
            }
          />
        </div>

        {/* Column 3 */}
        <div>
          <InfoField label="Iniciación Actividades" value={inicioActividades} />
          <InfoField label="Trabajadores" value={trabajadores} />
        </div>
      </div>

    </div>
  );
};

export default GeneralInfoCard;