import { DuxCompanyInfo, IDuxCompanyInfo } from '../models/DuxCompanyInfo';
import { ISheriffDataLog } from '../models/SheriffDataLog';
import { OpenAIService } from './OpenAIService';
import { log } from 'console';

export class CompanyAnalysisService {
  private openAIService: OpenAIService;

  constructor() {
    this.openAIService = OpenAIService.getInstance();
  }

  /**
   * Analizza i dati societari dopo una chiamata Sheriff API
   */
  async analyzeCompanyData(
    sheriffLog: ISheriffDataLog,
    tenantId: string,
    userId?: string
  ): Promise<IDuxCompanyInfo> {
    console.log(`🔍 Iniziando analisi societaria per RUT: ${sheriffLog.rut}`);

    try {
      // Verifica se esiste già un'analisi per questo sheriffLog
      const existingAnalysis = await DuxCompanyInfo.findOne({
        sheriffLogId: sheriffLog._id,
        tenantId
      });

      if (existingAnalysis) {
        console.log(`📋 Analisi esistente trovata per RUT: ${sheriffLog.rut}`);
        return existingAnalysis;
      }

      // Esegui analisi manuale
      const manualAnalysis = this.analyzeManually(sheriffLog);
      
      // Esegui analisi AI se disponibile
      let aiAnalysis: string | undefined;
      try {
        if (userId) {
          aiAnalysis = await this.openAIService.analyzeSheriffData(
            sheriffLog,
            { level: 'standard' },
            { level: 'standard' },
            tenantId,
            userId
          );
        }
      } catch (aiError) {
        console.warn(`⚠️ Errore nell'analisi AI per RUT ${sheriffLog.rut}:`, aiError);
      }

      // Crea nuovo record di analisi
      const companyAnalysis = new DuxCompanyInfo({
        rut: sheriffLog.rut,
        tenantId,
        sheriffLogId: sheriffLog._id,
        analysisDate: new Date(),
        companyName: this.extractCompanyName(sheriffLog),
        totalPartners: manualAnalysis.totalPartners,
        totalAdministrators: manualAnalysis.totalAdministrators,
        analysisResults: manualAnalysis.analysisResults,
        aiAnalysis,
        manualAnalysis: {
          summary: manualAnalysis.summary,
          details: manualAnalysis.details
        }
      });

      await companyAnalysis.save();
      console.log(`✅ Analisi societaria salvata per RUT: ${sheriffLog.rut}`);
      
      return companyAnalysis;
    } catch (error) {
      console.error(`❌ Errore nell'analisi societaria per RUT ${sheriffLog.rut}:`, error);
      throw error;
    }
  }

  /**
   * Analisi manuale dei dati societari (logica dallo script esistente)
   */
  private analyzeManually(companyData: ISheriffDataLog) {
    console.log('🔍 Struttura dati ricevuti:', Object.keys(companyData));
    
    const mallaSocietariaData = companyData.mallaSocietariaData;
    
    const analysisResults = {
      companyGeneralInfo: { count: 0, partners: [] as any[] },
      empresaEnUnDia: { count: 0, partners: [] as any[] },
      diarioOficial: { count: 0, partners: [] as any[] }
    };
    
    let totalPartners = 0;
    let totalAdministrators = 0;
    
    // Analisi companyGeneralInfo
    if (companyData.summaryData && (companyData.summaryData as any).data) {
      const summaryData = (companyData.summaryData as any).data;
      if (summaryData.socios && Array.isArray(summaryData.socios)) {
        analysisResults.companyGeneralInfo.partners = summaryData.socios.map((socio: any) => ({
          rut: socio.rut || 'N/D',
          nombre: socio.nombre || 'N/D',
          participacion: socio.participacion || 'N/D',
          source: 'companyGeneralInfo'
        }));
        analysisResults.companyGeneralInfo.count = summaryData.socios.length;
        totalPartners += summaryData.socios.length;
        console.log(`📊 Trovati ${summaryData.socios.length} soci in companyGeneralInfo`);
      }
    }
    
    // Analisi empresaEnUnDia e diarioOficial
    if (mallaSocietariaData) {
      // empresaEnUnDia
      if (mallaSocietariaData.empresaEnUnDia && Array.isArray(mallaSocietariaData.empresaEnUnDia)) {
        analysisResults.empresaEnUnDia.partners = mallaSocietariaData.empresaEnUnDia.map((item: any) => ({
          rut: item.rut || 'N/D',
          nome: item.nome || item.name || item.nombre || 'N/D',
          domicilio: item.domicilio || 'N/D',
          source: 'empresaEnUnDia'
        }));
        analysisResults.empresaEnUnDia.count = mallaSocietariaData.empresaEnUnDia.length;
        totalPartners += mallaSocietariaData.empresaEnUnDia.length;
        console.log(`📊 Trovati ${mallaSocietariaData.empresaEnUnDia.length} elementi in empresaEnUnDia`);
      }
      
      // diarioOficial
      if (mallaSocietariaData.diarioOficial && Array.isArray(mallaSocietariaData.diarioOficial)) {
        analysisResults.diarioOficial.partners = mallaSocietariaData.diarioOficial.map((item: any) => ({
          rut: item.rut || 'N/D',
          nome: item.nome || item.name || item.nombre || 'N/D',
          domicilio: item.domicilio || 'N/D',
          source: 'diarioOficial'
        }));
        analysisResults.diarioOficial.count = mallaSocietariaData.diarioOficial.length;
        totalPartners += mallaSocietariaData.diarioOficial.length;
        console.log(`📊 Trovati ${mallaSocietariaData.diarioOficial.length} elementi in diarioOficial`);
      }
    }
    
    const summary = `Analisi completata: ${totalPartners} soci totali, ${totalAdministrators} amministratori. ` +
      `Fonti: companyGeneralInfo (${analysisResults.companyGeneralInfo.count}), ` +
      `empresaEnUnDia (${analysisResults.empresaEnUnDia.count}), ` +
      `diarioOficial (${analysisResults.diarioOficial.count}).`;
    
    console.log(`📋 ${summary}`);
    
    return {
      totalPartners,
      totalAdministrators,
      analysisResults,
      summary,
      details: {
        mallaSocietariaDataAvailable: !!mallaSocietariaData,
        summaryDataAvailable: !!(companyData.summaryData && (companyData.summaryData as any).data),
        analysisTimestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Estrae il nome dell'azienda dai dati Sheriff
   */
  private extractCompanyName(sheriffLog: ISheriffDataLog): string | undefined {
    try {
      if (sheriffLog.summaryData && (sheriffLog.summaryData as any).data) {
        const summaryData = (sheriffLog.summaryData as any).data;
        if (summaryData.sii && summaryData.sii.razonSocial) {
          return summaryData.sii.razonSocial;
        }
      }
      return undefined;
    } catch (error) {
      console.warn(`⚠️ Errore nell'estrazione del nome azienda:`, error);
      return undefined;
    }
  }

  /**
   * Ottiene l'analisi esistente per un RUT
   */
  async getAnalysisByRut(rut: string, tenantId: string): Promise<IDuxCompanyInfo | null> {
    return await DuxCompanyInfo.findOne({ rut, tenantId })
      .sort({ analysisDate: -1 })
      .populate('sheriffLogId');
  }

  /**
   * Ottiene tutte le analisi per un tenant
   */
  async getAnalysesByTenant(
    tenantId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ analyses: IDuxCompanyInfo[], total: number, pages: number }> {
    const skip = (page - 1) * limit;
    
    const [analyses, total] = await Promise.all([
      DuxCompanyInfo.find({ tenantId })
        .sort({ analysisDate: -1 })
        .skip(skip)
        .limit(limit)
        .populate('sheriffLogId'),
      DuxCompanyInfo.countDocuments({ tenantId })
    ]);
    
    return {
      analyses,
      total,
      pages: Math.ceil(total / limit)
    };
  }

  // Get all analyses for tenant with pagination
  async getAllAnalyses(tenantId: string, page: number = 1, limit: number = 10): Promise<{
    analyses: IDuxCompanyInfo[];
    total: number;
    pages: number;
    currentPage: number;
  }> {
    try {
      const skip = (page - 1) * limit;
      const analyses = await DuxCompanyInfo.find({ tenantId })
        .sort({ analysisDate: -1 })
        .skip(skip)
        .limit(limit);
      
      const total = await DuxCompanyInfo.countDocuments({ tenantId });
      
      return {
        analyses,
        total,
        pages: Math.ceil(total / limit),
        currentPage: page
      };
    } catch (error) {
      console.error('Error getting all analyses:', error);
      throw error;
    }
  }

  // Update manual analysis
  async updateManualAnalysis(
    analysisId: string,
    manualAnalysis: any,
    tenantId: string
  ): Promise<IDuxCompanyInfo | null> {
    try {
      return await DuxCompanyInfo.findOneAndUpdate(
        { _id: analysisId, tenantId },
        { 
          manualAnalysis,
          updatedAt: new Date()
        },
        { new: true }
      );
    } catch (error) {
      console.error('Error updating manual analysis:', error);
      throw error;
    }
  }
}

export default new CompanyAnalysisService();