import { Request, Response } from 'express';
import { EquifaxService } from '../services/equifaxService';
import { AuthenticatedRequest } from '../types/auth';
import elkService from '../services/elkService';
import { EquifaxResponse as EquifaxResponseModel } from '../models/EquifaxResponse';

export class EquifaxController {
  private equifaxService: EquifaxService;

  constructor() {
    this.equifaxService = EquifaxService.getInstance();
  }

  /**
   * Query Equifax for company/person information by RUT
   */
  public queryRut = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const startTime = Date.now();
    
    try {
      const { rut } = req.params;
      const { personalData, productData } = req.body;
      const tenantId = req.user?.tenant;
      const userId = req.user?.id;

      if (!tenantId) {
        res.status(401).json({ 
          success: false, 
          error: 'Tenant ID not found' 
        });
        return;
      }

      if (!rut) {
        res.status(400).json({ 
          success: false, 
          error: 'RUT is required' 
        });
        return;
      }

      // Clean RUT format (sin puntos; conserva guion si viene)
      const cleanRut = rut.replace(/\./g, '').toUpperCase();

      console.log(`Equifax query request for RUT: ${cleanRut} by tenant: ${tenantId}`);

      // Log business event
      elkService.logBusinessEvent('equifax_query_started', {
        rut: cleanRut,
        tenantId,
        userId,
        timestamp: new Date().toISOString()
      });

      // Query Equifax service
      const result = await this.equifaxService.queryRut({
        rut: cleanRut,
        tenantId,
        personalData,
        productData
      });

      const responseTime = Date.now() - startTime;

      if (result.success) {
        // Log successful query
        elkService.logBusinessEvent('equifax_query_completed', {
          rut: cleanRut,
          tenantId,
          userId,
          responseTime,
          statusCode: result.statusCode,
          timestamp: new Date().toISOString()
        });

        // Optionally save response to file
        try {
        //  await this.equifaxService.saveResponseToFile(cleanRut, result.data);
        } catch (saveError) {
          console.warn('Failed to save Equifax response to file:', saveError);
          // Don't fail the request if file saving fails
        }

        res.status(200).json({
          success: true,
          data: result.data,
          rut: cleanRut,
          responseTime,
          timestamp: new Date().toISOString(),
          source: 'equifax'
        });
      } else {
        // Log failed query
        elkService.logBusinessEvent('equifax_query_failed', {
          rut: cleanRut,
          tenantId,
          userId,
          responseTime,
          statusCode: result.statusCode,
          error: result.error,
          timestamp: new Date().toISOString()
        });

        res.status(result.statusCode || 500).json({
          success: false,
          error: result.error || 'Unknown error occurred',
          rut: cleanRut,
          responseTime,
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      console.error('Error in Equifax controller:', error);

      // Log error event
      elkService.logBusinessEvent('equifax_query_error', {
        rut: req.params.rut,
        tenantId: req.user?.tenant,
        userId: req.user?.id,
        responseTime,
        error: errorMessage,
        timestamp: new Date().toISOString()
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: errorMessage,
        responseTime,
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * List Equifax response logs by RUT for current tenant
   */
  public getResponsesByRut = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const startTime = Date.now();
    try {
      const { rut } = req.params;
      const tenantId = req.user?.tenant;
      const userId = req.user?.id;

      // Allow superuser to bypass tenant requirement
      if (!tenantId && req.user?.role !== 'superuser') {
        res.status(401).json({ success: false, error: 'Tenant ID not found' });
        return;
      }

      if (!rut) {
        res.status(400).json({ success: false, error: 'RUT is required' });
        return;
      }

      // Normaliza RUT y calcula variantes con y sin guion
      const cleanRut = rut.replace(/\./g, '').toUpperCase();
      const baseRut = cleanRut.replace(/-/g, '');
      const rutWithDash = `${baseRut.slice(0, -1)}-${baseRut.slice(-1)}`;
      const rutWithoutDash = baseRut;

      // Pagination and filters
      const limitParam = req.query.limit as string | undefined;
      const pageParam = req.query.page as string | undefined;
      const startDateParam = req.query.startDate as string | undefined;
      const endDateParam = req.query.endDate as string | undefined;
      const limit = Math.max(1, Math.min(100, parseInt(limitParam || '20', 10)));
      const page = Math.max(1, parseInt(pageParam || '1', 10));
      const skip = (page - 1) * limit;

      // Build query: superuser sees across tenants
      const query: any = { $or: [{ rut: rutWithDash }, { rut: rutWithoutDash }] };
      if (req.user?.role !== 'superuser') {
        query.tenantId = tenantId;
      }
      if (startDateParam || endDateParam) {
        query.createdAt = {};
        if (startDateParam) query.createdAt.$gte = new Date(startDateParam);
        if (endDateParam) query.createdAt.$lte = new Date(endDateParam);
      }

      elkService.logBusinessEvent('equifax_logs_fetch_started', {
        rut: rutWithDash,
        tenantId: req.user?.role === 'superuser' ? 'ALL' : tenantId,
        userId,
        limit,
        timestamp: new Date().toISOString()
      });

      const total = await EquifaxResponseModel.countDocuments(query);

      const docs = await EquifaxResponseModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const responseTime = Date.now() - startTime;

      elkService.logBusinessEvent('equifax_logs_fetch_completed', {
        rut: rutWithDash,
        tenantId: req.user?.role === 'superuser' ? 'ALL' : tenantId,
        userId,
        count: docs.length,
        total,
        page,
        limit,
        responseTime,
        timestamp: new Date().toISOString()
      });

      res.status(200).json({
        success: true,
        rut: rutWithDash,
        tenantId: req.user?.role === 'superuser' ? 'ALL' : tenantId,
        count: docs.length,
        total,
        page,
        limit,
        data: docs,
        responseTime,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      console.error('Error fetching Equifax responses by RUT:', error);

      elkService.logBusinessEvent('equifax_logs_fetch_error', {
        rut: req.params.rut,
        tenantId: req.user?.role === 'superuser' ? 'ALL' : req.user?.tenant,
        userId: req.user?.id,
        responseTime,
        error: errorMessage,
        timestamp: new Date().toISOString()
      });

      res.status(500).json({
        success: false,
        error: 'Failed to fetch Equifax response logs',
        message: errorMessage,
        responseTime,
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * List ALL Equifax response logs for current tenant (no RUT filter)
   */
  public getAllResponses = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const startTime = Date.now();
    try {
      const tenantId = req.user?.tenant;
      const userId = req.user?.id;

      // Allow superuser to bypass tenant requirement
      if (!tenantId && req.user?.role !== 'superuser') {
        res.status(401).json({ success: false, error: 'Tenant ID not found' });
        return;
      }

      const limitParam = req.query.limit as string | undefined;
      const pageParam = req.query.page as string | undefined;
      const startDateParam = req.query.startDate as string | undefined;
      const endDateParam = req.query.endDate as string | undefined;
      const limit = Math.max(1, Math.min(100, parseInt(limitParam || '20', 10)));
      const page = Math.max(1, parseInt(pageParam || '1', 10));
      const skip = (page - 1) * limit;

      const query: any = {};
      if (req.user?.role !== 'superuser') {
        query.tenantId = tenantId;
      }
      if (startDateParam || endDateParam) {
        query.createdAt = {};
        if (startDateParam) query.createdAt.$gte = new Date(startDateParam);
        if (endDateParam) query.createdAt.$lte = new Date(endDateParam);
      }

      elkService.logBusinessEvent('equifax_logs_fetch_all_started', {
        tenantId: req.user?.role === 'superuser' ? 'ALL' : tenantId,
        userId,
        limit,
        timestamp: new Date().toISOString()
      });

      const total = await EquifaxResponseModel.countDocuments(query);

      const docs = await EquifaxResponseModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const responseTime = Date.now() - startTime;

      elkService.logBusinessEvent('equifax_logs_fetch_all_completed', {
        tenantId: req.user?.role === 'superuser' ? 'ALL' : tenantId,
        userId,
        count: docs.length,
        total,
        page,
        limit,
        responseTime,
        timestamp: new Date().toISOString()
      });

      res.status(200).json({
        success: true,
        tenantId: req.user?.role === 'superuser' ? 'ALL' : tenantId,
        count: docs.length,
        total,
        page,
        limit,
        data: docs,
        responseTime,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      console.error('Error fetching all Equifax responses:', error);

      elkService.logBusinessEvent('equifax_logs_fetch_all_error', {
        tenantId: req.user?.role === 'superuser' ? 'ALL' : req.user?.tenant,
        userId: req.user?.id,
        responseTime,
        error: errorMessage,
        timestamp: new Date().toISOString()
      });

      res.status(500).json({
        success: false,
        error: 'Failed to fetch Equifax response logs',
        message: errorMessage,
        responseTime,
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Get Equifax service health status
   */
  public getHealthStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.user?.tenant;

      if (!tenantId) {
        res.status(401).json({ 
          success: false, 
          error: 'Tenant ID not found' 
        });
        return;
      }

      const healthStatus = await this.equifaxService.getHealthStatus();

      res.status(200).json({
        success: true,
        ...healthStatus,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error getting Equifax health status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get health status',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Bulk query multiple RUTs (if needed in the future)
   */
  public bulkQueryRuts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { ruts, personalData, productData } = req.body;
      const tenantId = req.user?.tenant;
      const userId = req.user?.id;

      if (!tenantId) {
        res.status(401).json({ 
          success: false, 
          error: 'Tenant ID not found' 
        });
        return;
      }

      if (!Array.isArray(ruts) || ruts.length === 0) {
        res.status(400).json({ 
          success: false, 
          error: 'Invalid RUTs array' 
        });
        return;
      }

      const results = [] as any[];

      for (const rut of ruts) {
        try {
          const cleanRut = String(rut).replace(/\./g, '').toUpperCase();
          const result = await this.equifaxService.queryRut({
            rut: cleanRut,
            tenantId,
            personalData,
            productData
          });
          results.push({ rut: cleanRut, success: result.success, data: result.data, error: result.error });
        } catch (err) {
          results.push({ rut, success: false, error: err instanceof Error ? err.message : 'Unknown error' });
        }
      }

      res.status(200).json({
        success: true,
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error in bulk query:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process bulk query',
        timestamp: new Date().toISOString()
      });
    }
  };
}

export default EquifaxController;