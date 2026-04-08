import { Request, Response } from 'express';
import { Ley21121, ILey21121 } from '../models/Ley21121';

// Get all Ley21121 records
export const getAllLey21121 = async (req: Request, res: Response) => {
  try {
    const records = await Ley21121.find().sort({ createdAt: -1 });
    
    return res.status(200).json({
      success: true,
      count: records.length,
      data: records
    });
  } catch (error) {
    console.error('Error in getAllLey21121:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
};

// Get a single Ley21121 record by ID
export const getLey21121ById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const record = await Ley21121.findById(id);
    
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
    console.error('Error in getLey21121ById:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
};

// Get Ley21121 records by RUT
export const getLey21121ByRut = async (req: Request, res: Response) => {
  try {
    const { rut } = req.params;
    
    // Clean RUT format
    const cleanRut = rut.replace(/\./g, '').toUpperCase();
    
    const records = await Ley21121.find({ rut: cleanRut });
    
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
    console.error('Error in getLey21121ByRut:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
};

// Create a new Ley21121 record
export const createLey21121 = async (req: Request, res: Response) => {
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
    const newRecord = new Ley21121({
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
    console.error('Error in createLey21121:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
};

// Update a Ley21121 record
export const updateLey21121 = async (req: Request, res: Response) => {
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
    const updatedRecord = await Ley21121.findByIdAndUpdate(
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
    console.error('Error in updateLey21121:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
};

// Delete a Ley21121 record
export const deleteLey21121 = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const deletedRecord = await Ley21121.findByIdAndDelete(id);
    
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
    console.error('Error in deleteLey21121:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
};