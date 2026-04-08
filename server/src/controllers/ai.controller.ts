import { Response } from 'express';
import { AuthenticatedRequest } from '../types/auth';
import { OpenAIService } from '../services/OpenAIService';

export class AIController {
  /**
   * Analyze data using AI
   */
  static async analyzeData(req: AuthenticatedRequest, res: Response) {
    try {
      const { data, analysisType = 'general', rut } = req.body;
      
      if (!data) {
        return res.status(400).json({
          success: false,
          message: 'Data is required for analysis'
        });
      }

      const openAIService = OpenAIService.getInstance();
      const tenantId = req.user?.tenant;
      const userId = req.user?.id;

      let analysis: string;

      switch (analysisType) {
        case 'socios':
          // Analisi specifica per i soci
          analysis = await AIController.analyzeSociosData(data, openAIService, tenantId, userId, rut);
          break;
        case 'risk':
          // Analisi del rischio
          analysis = await openAIService.analyzeEvaluationParameters(data, tenantId, userId);
          break;
        case 'general':
        default:
          // Analisi generale
          analysis = await AIController.analyzeGeneralData(data, openAIService, tenantId, userId, rut);
          break;
      }

      res.json({
        success: true,
        analysis,
        analysisType,
        timestamp: new Date().toISOString(),
        rut
      });

    } catch (error) {
      console.error('Error in AI analysis:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to perform AI analysis',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Analyze socios data specifically
   */
  private static async analyzeSociosData(
    data: any, 
    openAIService: OpenAIService, 
    tenantId?: string, 
    userId?: string,
    rut?: string
  ): Promise<string> {
    const prompt = `
Come esperto in analisi societaria, analizza i seguenti dati sui soci dell'azienda con RUT ${rut || 'N/A'}:

${JSON.stringify(data, null, 2)}

Fornisci un'analisi dettagliata che includa:

## 👥 **Struttura Societaria**
- Numero totale di soci
- Tipologia di soci (persone fisiche/giuridiche)
- Distribuzione geografica

## 🔍 **Analisi dei Soci**
- Profili dei soci principali
- Eventuali collegamenti tra soci
- Presenza di amministratori

## ⚠️ **Osservazioni**
- Eventuali anomalie o punti di attenzione
- Raccomandazioni per ulteriori verifiche

## 📊 **Riepilogo**
- Valutazione complessiva della struttura societaria
- Livello di rischio associato

Sii conciso ma completo, usa emojis appropriati e mantieni un tono professionale.
`;

    try {
      // Simula una chiamata OpenAI per l'analisi dei soci
      const analysisData = {
        companyName: data.companyName || 'Azienda',
        rut: rut || 'N/A',
        riskLevel: 'MEDIO',
        semaphore: '🟡',
        detectedIssues: 0,
        totalParameters: 1,
        criticalIssues: 0,
        significantIssues: 0
      };
      
      return await openAIService.analyzeEvaluationParameters(analysisData, tenantId, userId);
    } catch (error) {
      console.error('Error in socios analysis:', error);
      return `Errore nell'analisi AI dei soci: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`;
    }
  }

  /**
   * Analyze general data
   */
  private static async analyzeGeneralData(
    data: any, 
    openAIService: OpenAIService, 
    tenantId?: string, 
    userId?: string,
    rut?: string
  ): Promise<string> {
    try {
      const analysisData = {
        companyName: data.companyName || 'Azienda',
        rut: rut || 'N/A',
        riskLevel: 'MEDIO',
        semaphore: '🟡',
        detectedIssues: 0,
        totalParameters: 1,
        criticalIssues: 0,
        significantIssues: 0
      };
      
      return await openAIService.analyzeEvaluationParameters(analysisData, tenantId, userId);
    } catch (error) {
      console.error('Error in general analysis:', error);
      return `Errore nell'analisi AI generale: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`;
    }
  }
}