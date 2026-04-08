import { Request, Response } from 'express';
import { PromptConfiguration, IPromptConfiguration } from '../models/PromptConfiguration';
import { AuthenticatedRequest } from '../types/auth';

// Ottieni tutti i prompt configurati
export const getPromptConfigurations = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { category, isActive } = req.query;
    
    const filter: any = {};
    if (category) filter.category = category;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    
    const prompts = await PromptConfiguration.find(filter)
      .sort({ category: 1, createdAt: -1 });
    
    res.json({
      success: true,
      data: prompts
    });
  } catch (error) {
    console.error('Error fetching prompt configurations:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las configuraciones de prompt'
    });
  }
};

// Ottieni un prompt specifico per ID
export const getPromptConfigurationById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const prompt = await PromptConfiguration.findById(id);
    
    if (!prompt) {
      return res.status(404).json({
        success: false,
        message: 'Configuración de prompt no encontrada'
      });
    }
    
    res.json({
      success: true,
      data: prompt
    });
  } catch (error) {
    console.error('Error fetching prompt configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la configuración de prompt'
    });
  }
};

// Ottieni il prompt attivo per una categoria
export const getActivePromptByCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { category } = req.params;
    
    const prompt = await PromptConfiguration.findOne({
      category,
      isActive: true
    });
    
    if (!prompt) {
      return res.status(404).json({
        success: false,
        message: `No hay prompt activo para la categoría ${category}`
      });
    }
    
    res.json({
      success: true,
      data: prompt
    });
  } catch (error) {
    console.error('Error fetching active prompt:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el prompt activo'
    });
  }
};

// Crea un nuovo prompt
export const createPromptConfiguration = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description, promptTemplate, category, isActive } = req.body;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }
    
    // Se il nuovo prompt deve essere attivo, disattiva gli altri della stessa categoria
    if (isActive) {
      await PromptConfiguration.updateMany(
        { category, isActive: true },
        { isActive: false, updatedBy: userId }
      );
    }
    
    const newPrompt = new PromptConfiguration({
      name,
      description,
      promptTemplate,
      category,
      isActive: isActive || false,
      createdBy: userId,
      updatedBy: userId
    });
    
    await newPrompt.save();
    
    res.status(201).json({
      success: true,
      message: 'Configuración de prompt creada exitosamente',
      data: newPrompt
    });
  } catch (error) {
    console.error('Error creating prompt configuration:', error);
    
    if ((error as any).code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un prompt activo para esta categoría'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error al crear la configuración de prompt'
    });
  }
};

// Aggiorna un prompt esistente
export const updatePromptConfiguration = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, promptTemplate, category, isActive } = req.body;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }
    
    const existingPrompt = await PromptConfiguration.findById(id);
    
    if (!existingPrompt) {
      return res.status(404).json({
        success: false,
        message: 'Configuración de prompt no encontrada'
      });
    }
    
    // Se il prompt viene attivato, disattiva gli altri della stessa categoria
    if (isActive && !existingPrompt.isActive) {
      await PromptConfiguration.updateMany(
        { category: category || existingPrompt.category, isActive: true, _id: { $ne: id } },
        { isActive: false, updatedBy: userId }
      );
    }
    
    const updatedPrompt = await PromptConfiguration.findByIdAndUpdate(
      id,
      {
        name,
        description,
        promptTemplate,
        category,
        isActive,
        updatedBy: userId
      },
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      message: 'Configuración de prompt actualizada exitosamente',
      data: updatedPrompt
    });
  } catch (error) {
    console.error('Error updating prompt configuration:', error);
    
    if ((error as any).code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un prompt activo para esta categoría'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error al actualizar la configuración de prompt'
    });
  }
};

// Elimina un prompt
export const deletePromptConfiguration = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const prompt = await PromptConfiguration.findById(id);
    
    if (!prompt) {
      return res.status(404).json({
        success: false,
        message: 'Configuración de prompt no encontrada'
      });
    }
    
    // Non permettere l'eliminazione se è l'unico prompt attivo per la categoria
    if (prompt.isActive) {
      const activePromptsCount = await PromptConfiguration.countDocuments({
        category: prompt.category,
        isActive: true
      });
      
      if (activePromptsCount === 1) {
        return res.status(400).json({
          success: false,
          message: 'No se puede eliminar el único prompt activo para esta categoría'
        });
      }
    }
    
    await PromptConfiguration.findByIdAndDelete(id);
    
    res.json({
      success: true,
      message: 'Configuración de prompt eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error deleting prompt configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar la configuración de prompt'
    });
  }
};

// Attiva/disattiva un prompt
export const togglePromptConfiguration = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }
    
    const prompt = await PromptConfiguration.findById(id);
    
    if (!prompt) {
      return res.status(404).json({
        success: false,
        message: 'Configuración de prompt no encontrada'
      });
    }
    
    const newActiveState = !prompt.isActive;
    
    // Se stiamo attivando il prompt, disattiva gli altri della stessa categoria
    if (newActiveState) {
      await PromptConfiguration.updateMany(
        { category: prompt.category, isActive: true, _id: { $ne: id } },
        { isActive: false, updatedBy: userId }
      );
    }
    
    const updatedPrompt = await PromptConfiguration.findByIdAndUpdate(
      id,
      { isActive: newActiveState, updatedBy: userId },
      { new: true }
    );
    
    res.json({
      success: true,
      message: `Prompt ${newActiveState ? 'activado' : 'desactivado'} exitosamente`,
      data: updatedPrompt
    });
  } catch (error) {
    console.error('Error toggling prompt configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cambiar el estado del prompt'
    });
  }
};