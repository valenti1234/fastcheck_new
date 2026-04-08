import { Request, Response } from 'express';
import { SheriffDataLog } from '../models/SheriffDataLog';

export const getCompanyByRut = async (req: Request, res: Response) => {
  try {
    const { rut } = req.params;
    console.log("getCompanyByRut", rut);
    if (!rut) {
      return res.status(400).json({ 
        success: false, 
        message: 'RUT is required' 
      });
    }

    // Clean RUT format
    const cleanRut = rut.replace(/\./g, '').toUpperCase();

    // Find the most recent log for this RUT
    const existingLog = await SheriffDataLog.findOne({ rut: cleanRut }).sort({ fetchedAt: -1 });
    
    if (!existingLog) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró información para el RUT ingresado'
      });
    }

    console.log('Found log:', JSON.stringify(existingLog, null, 2));

    // Extract relevant data from the log
    const companyData = {
      RUT: cleanRut,
      "Razon Social": existingLog.summaryData?.data?.sii?.razonSocial || "N/A",
      "Inicio Actividades": existingLog.summaryData?.data?.sii?.inicioActividades || "N/A",
      "Situacion Actual": existingLog.summaryData?.data?.sii?.situacionActual || "N/A",
      "Empresa Menor": existingLog.summaryData?.data?.sii?.empresaMenor || "N/A",
      "Autorizado Moneda Extranjera": existingLog.summaryData?.data?.sii?.autorizadoMonedaExtranjera || "N/A",
      
      // Business Size Information
      "Tamaño Empresa": existingLog.summaryData?.data?.siiBusinessSize?.textSize || "N/A",
      "Ventas Anuales (UF)": existingLog.summaryData?.data?.siiBusinessSize?.annualSales || "N/A",
      "Trabajadores Dependientes": existingLog.summaryData?.data?.siiBusinessSize?.dependentWorkers?.toString() || "N/A",

      // Activities
      "Actividades Economicas": existingLog.summaryData?.data?.sii?.actividadEconomicaVigente?.map((act: any) => ({
        actividad: act.activities,
        codigo: act.code,
        categoria: act.category,
        afectoIVA: act.ivaAffection,
        fecha: act.date
      })) || [],

      // Properties and Vehicles
      "Cantidad de Propiedades": existingLog.summaryData?.data?.propertiesSummary?.propertiesQuantity || 0,
      "Avaluo Total Propiedades": existingLog.summaryData?.data?.propertiesSummary?.totalAppraisal || "0",
      "Cantidad de Vehiculos": existingLog.summaryData?.data?.vehiclesSummary?.vehiclesQuantity || 0,

      // Credit Scoring
      "Clasificacion de Riesgo": existingLog.summaryData?.data?.creditScoring?.classificationLabel || "N/A",
      "Porcentaje de Clasificacion": existingLog.summaryData?.data?.creditScoring?.classificationPercentage || 0,

      // Company Registration
      "Fecha de Constitucion": existingLog.officialDiaryData?.data?.[0]?.fecha || "N/A",
      "Socios": existingLog.officialDiaryData?.data?.[0]?.socios?.map((socio: any) => ({
        nombre: socio.nombre,
        rut: socio.rut,
        domicilio: socio.domicilio
      })) || [],

      // Banking Information
      "Deuda Bancaria": {
        "Deuda Directa Comercial": existingLog.summaryData?.data?.deudaBancariaSummary?.deudaDirectaComercial || 0,
        "Deuda Directa Vigente": existingLog.summaryData?.data?.deudaBancariaSummary?.deudaDirectaVigente || 0,
        "Linea de Credito": existingLog.summaryData?.data?.deudaBancariaSummary?.lineaCredito || 0,
        "Fecha": existingLog.summaryData?.data?.deudaBancariaSummary?.date || "N/A"
      },

      updatedAt: existingLog.fetchedAt?.toISOString() || new Date().toISOString(),
      source: 'sheriffDataLog',
      duxiterMD: existingLog.duxiterMD || ''
    };

    // Log the extracted data
    console.log('Extracted company data:', JSON.stringify(companyData, null, 2));

    return res.status(200).json({
      success: true,
      data: companyData,
      source: 'sheriffDataLog'
    });

  } catch (error) {
    console.error('Error in getCompanyByRut:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
}; 