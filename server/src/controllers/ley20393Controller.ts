import { Request, Response } from 'express';
import { Ley20393, ILey20393 } from '../models/Ley20393';

// Get all Ley20393 records
export const getAllLey20393 = async (req: Request, res: Response) => {
  try {
    const records = await Ley20393.find().sort({ createdAt: -1 });
    
    return res.status(200).json({
      success: true,
      count: records.length,
      data: records
    });
  } catch (error) {
    console.error('Error in getAllLey20393:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
};

// Get a single Ley20393 record by ID
export const getLey20393ById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const record = await Ley20393.findById(id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró el registro'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: record
    });
  } catch (error) {
    console.error('Error in getLey20393ById:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
};

// Get Ley20393 records by RUT
export const getLey20393ByRut = async (req: Request, res: Response) => {
  try {
    const { rut } = req.params;
    
    // Clean RUT format
    const cleanRut = rut.replace(/\./g, '').toUpperCase();
    
    const records = await Ley20393.find({ rut: cleanRut });
    
    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontraron registros para el RUT ingresado'
      });
    }
    
    return res.status(200).json({
      success: true,
      count: records.length,
      data: records
    });
  } catch (error) {
    console.error('Error in getLey20393ByRut:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
};

// Create a new Ley20393 record
export const createLey20393 = async (req: Request, res: Response) => {
  try {
    const {
      rut,
      razonSocial,
      rolCausa,
      fechaDesde,
      fechaHasta,
      duracion,
      motivo
    } = req.body;
    
    // Validate required fields
    if (!rut || !razonSocial || !rolCausa || !fechaDesde || !fechaHasta || !duracion || !motivo) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos son obligatorios'
      });
    }
    
    // Clean RUT format
    const cleanRut = rut.replace(/\./g, '').toUpperCase();
    
    // Create new record
    const newRecord = new Ley20393({
      rut: cleanRut,
      razonSocial,
      rolCausa,
      fechaDesde,
      fechaHasta,
      duracion,
      motivo
    });
    
    const savedRecord = await newRecord.save();
    
    return res.status(201).json({
      success: true,
      data: savedRecord
    });
  } catch (error) {
    console.error('Error in createLey20393:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
};

// Update a Ley20393 record
export const updateLey20393 = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      rut,
      razonSocial,
      rolCausa,
      fechaDesde,
      fechaHasta,
      duracion,
      motivo
    } = req.body;
    
    // Validate required fields
    if (!rut || !razonSocial || !rolCausa || !fechaDesde || !fechaHasta || !duracion || !motivo) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos son obligatorios'
      });
    }
    
    // Clean RUT format
    const cleanRut = rut.replace(/\./g, '').toUpperCase();
    
    // Find and update record
    const updatedRecord = await Ley20393.findByIdAndUpdate(
      id,
      {
        rut: cleanRut,
        razonSocial,
        rolCausa,
        fechaDesde,
        fechaHasta,
        duracion,
        motivo
      },
      { new: true, runValidators: true }
    );
    
    if (!updatedRecord) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró el registro'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: updatedRecord
    });
  } catch (error) {
    console.error('Error in updateLey20393:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
};

// Delete a Ley20393 record
export const deleteLey20393 = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const deletedRecord = await Ley20393.findByIdAndDelete(id);
    
    if (!deletedRecord) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró el registro'
      });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Registro eliminado correctamente'
    });
  } catch (error) {
    console.error('Error in deleteLey20393:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
};