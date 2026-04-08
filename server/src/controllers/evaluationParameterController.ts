import { Request, Response } from 'express';
import EvaluationParameter from '../models/EvaluationParameter';
import elkService from '../services/elkService';

export const getParameters = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const tenantId = req.user?.tenant;
  
  // Log parameter retrieval request
  elkService.logBusinessEvent('evaluation_parameters_requested', {
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  }, userId, tenantId);
  
  try {
    const parameters = await EvaluationParameter.find();
    
    // Log successful parameter retrieval
    elkService.logBusinessEvent('evaluation_parameters_retrieved', {
      parametersCount: parameters.length,
      parameterNames: parameters.map(p => p.name),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    }, userId, tenantId);
    
    res.status(200).json(parameters);
  } catch (error) {
    // Log system error
    elkService.logSystemError(error as Error, 'evaluation_parameters_get', {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      userId,
      tenantId
    });
    
    res.status(500).json({ message: 'Error fetching parameters', error });
  }
};

export const updateParameters = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const tenantId = req.user?.tenant;
  const updates = req.body; // Expects an array of { name: string, value: any }
  
  // Log parameter update request
  elkService.logBusinessEvent('evaluation_parameters_update_requested', {
    updatesCount: updates.length,
    parameterNames: updates.map((u: any) => u.name),
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  }, userId, tenantId);
  
  try {
    for (const update of updates) {
      await EvaluationParameter.findOneAndUpdate(
        { name: update.name },
        { value: update.value },
        { upsert: true, new: true }
      );
    }
    
    // Log successful parameter update
    elkService.logBusinessEvent('evaluation_parameters_updated', {
      updatesCount: updates.length,
      parameterNames: updates.map((u: any) => u.name),
      parameterValues: updates.map((u: any) => ({ name: u.name, value: u.value })),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    }, userId, tenantId);
    
    res.status(200).json({ message: 'Parameters updated successfully' });
  } catch (error) {
    // Log system error
    elkService.logSystemError(error as Error, 'evaluation_parameters_update', {
      updatesCount: updates.length,
      parameterNames: updates.map((u: any) => u.name),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      userId,
      tenantId
    });
    
    res.status(500).json({ message: 'Error updating parameters', error });
  }
};