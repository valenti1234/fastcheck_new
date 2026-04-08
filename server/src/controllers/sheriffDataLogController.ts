import { Request, Response } from 'express';
import { SheriffDataLog } from '../models/SheriffDataLog';
import { SheriffApiCallLog } from '../models/SheriffApiCallLog';

export const getSheriffDataLogsByTenant = async (req: Request, res: Response) => {
  try {
    // Get tenant ID from authenticated user
    const tenantId = req.user?.tenant;
    
    if (!tenantId) {
      return res.status(401).json({ message: 'Tenant information missing' });
    }

    // Filter logs by tenant ID
    const logs = await SheriffDataLog.find({ tenantId })
      .sort({ fetchedAt: -1 })
      .lean()
      .exec();

    res.json({
      logs: logs.map(log => ({
        _id: log._id,
        rut: log.rut,
        razonSocial: 'N/A', // This data is now in a separate collection
        riskLevel: 'N/A', // This data is now in a separate collection
        allCallsSucceeded: log.allCallsSucceeded,
        createdAt: log.createdAt,
        updatedAt: log.updatedAt,
      })),
      pages: 1, // No pagination
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching Sheriff data logs', error });
  }
};

const getFullLog = async (log: any) => {
    if (!log) return null;
    const apiCallLogs = await SheriffApiCallLog.find({ logId: log._id }).lean();
    const fullLog = { ...log, apiCalls: {} as Record<string, any> };
    apiCallLogs.forEach(callLog => {
      fullLog.apiCalls[callLog.callName] = callLog.data;
    });
    return fullLog;
}

export const getSheriffDataLogById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenant;
    
    if (!tenantId) {
      return res.status(401).json({ message: 'Tenant information missing' });
    }

    // Find log by ID and tenant ID to ensure tenant isolation
    const log = await SheriffDataLog.findOne({ _id: id, tenantId }).lean();

    if (!log) {
      return res.status(404).json({ message: 'Log not found' });
    }
    
    const fullLog = await getFullLog(log);
    res.json(fullLog);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching Sheriff data log details', error });
  }
};

export const getSheriffDataLogByRut = async (req: Request, res: Response) => {
  try {
    const { rut } = req.params;
    const tenantId = req.user?.tenant;
    
    if (!tenantId) {
      return res.status(401).json({ message: 'Tenant information missing' });
    }

    // Find log by RUT and tenant ID to ensure tenant isolation
    const log = await SheriffDataLog.findOne({
      $or: [{ rut: rut }, { rut: rut.replace('-', '') }],
      tenantId
    }).sort({ fetchedAt: -1 }).lean();

    if (!log) {
      return res.status(404).json({ message: 'Log not found for the given RUT' });
    }

    const fullLog = await getFullLog(log);
    res.json(fullLog);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching Sheriff data log by RUT', error });
  }
};