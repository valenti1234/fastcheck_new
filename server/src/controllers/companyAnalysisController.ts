import { Request, Response } from 'express';
import { CompanyAnalysisService } from '../services/companyAnalysisService';
import { AuthenticatedRequest } from '../types/auth';

export class CompanyAnalysisController {
  private companyAnalysisService: CompanyAnalysisService;

  constructor() {
    this.companyAnalysisService = new CompanyAnalysisService();
  }

  // Get company analysis by RUT
  public getAnalysisByRut = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { rut } = req.params;
      const tenantId = req.user?.tenant;

      if (!tenantId) {
        res.status(401).json({ error: 'Tenant ID not found' });
        return;
      }

      if (!rut) {
        res.status(400).json({ error: 'RUT is required' });
        return;
      }

      const analysis = await this.companyAnalysisService.getAnalysisByRut(rut, tenantId);
      
      if (!analysis) {
        res.status(404).json({ error: 'Company analysis not found for this RUT' });
        return;
      }

      res.json(analysis);
    } catch (error) {
      console.error('Error getting company analysis by RUT:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  // Get all company analyses for tenant
  public getAllAnalyses = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.user?.tenant;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!tenantId) {
        res.status(401).json({ error: 'Tenant ID not found' });
        return;
      }

      const analyses = await this.companyAnalysisService.getAllAnalyses(tenantId, page, limit);
      res.json(analyses);
    } catch (error) {
      console.error('Error getting all company analyses:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  // Manually trigger analysis for a specific RUT
  public triggerAnalysis = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { rut, sheriffLogId } = req.body;
      const tenantId = req.user?.tenant;
      const userId = req.user?.id;

      if (!tenantId) {
        res.status(401).json({ error: 'Tenant ID not found' });
        return;
      }

      if (!rut || !sheriffLogId) {
        res.status(400).json({ error: 'RUT and sheriffLogId are required' });
        return;
      }

      const analysis = await this.companyAnalysisService.analyzeCompanyData(
        sheriffLogId,
        rut,
        tenantId
      );

      res.json({ 
        message: 'Company analysis completed successfully',
        analysis 
      });
    } catch (error) {
      console.error('Error triggering company analysis:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  // Update manual analysis
  public updateManualAnalysis = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { analysisId } = req.params;
      const { manualAnalysis } = req.body;
      const tenantId = req.user?.tenant;

      if (!tenantId) {
        res.status(401).json({ error: 'Tenant ID not found' });
        return;
      }

      if (!analysisId || !manualAnalysis) {
        res.status(400).json({ error: 'Analysis ID and manual analysis data are required' });
        return;
      }

      const updatedAnalysis = await this.companyAnalysisService.updateManualAnalysis(
        analysisId,
        manualAnalysis,
        tenantId
      );

      if (!updatedAnalysis) {
        res.status(404).json({ error: 'Company analysis not found' });
        return;
      }

      res.json(updatedAnalysis);
    } catch (error) {
      console.error('Error updating manual analysis:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}