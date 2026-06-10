import { Request, Response } from 'express';
import { Lpmedio, ILpmedio } from '../models/Lpmedio';
import { AuthenticatedRequest } from '../types/auth';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import csv from 'csv-parser';
import XLSX from 'xlsx';

// Sanitize RUT: remove dots, keep dash
const sanitizeRut = (rut: string): string => {
  return rut.replace(/\./g, '');
};

// Validation schema for Lpmedio
const lpmedioSchema = z.object({
  rut: z.string().min(1, 'RUT es requerido'),
  nombre: z.string().min(1, 'Nombre es requerido'),
  tipoPersona: z.enum(['Empresa', 'Persona'], {
    errorMap: () => ({ message: 'Tipo Persona debe ser Empresa o Persona' }),
  }),
  tipoLista: z.string().min(1, 'Tipo Lista es requerido'),
  nombreSubLista: z.string().min(1, 'Nombre Sub-Lista es requerido'),
  fechaIncorporacion: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Fecha Incorporación debe ser una fecha válida',
  }),
});

export class LpmedioController {
  // Multer setup for CSV/XLS/XLSX
  static lpmedioUploadStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(process.cwd(), 'uploads', 'lpmedio');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `lpmedio-${uniqueSuffix}${path.extname(file.originalname)}`);
    },
  });

  static lpmedioFileFilter: multer.Options['fileFilter'] = (req, file, cb) => {
    const allowed = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    return cb(new Error('Formato no válido. Solo CSV, XLS o XLSX'));
  };

  static uploadExcel = multer({
    storage: LpmedioController.lpmedioUploadStorage,
    fileFilter: LpmedioController.lpmedioFileFilter,
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  static async uploadFile(req: AuthenticatedRequest & { file?: Express.Multer.File }, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Ningún archivo subido' });
      }

      const tenantId = req.tenantId;
      if (!tenantId) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(401).json({ error: 'Tenant ID requerido' });
      }

      const filePath = req.file.path;
      const ext = path.extname(req.file.originalname).toLowerCase();

      let rawRows: any[] = [];
      if (ext === '.csv') {
        rawRows = await new Promise<any[]>((resolve, reject) => {
          const rows: any[] = [];
          fs.createReadStream(filePath)
            .pipe(csv({ separator: ';' }))
            .on('data', (data) => rows.push(data))
            .on('end', () => resolve(rows))
            .on('error', reject);
        });
      } else if (ext === '.xls' || ext === '.xlsx') {
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheet];
        rawRows = XLSX.utils.sheet_to_json(worksheet);
      } else {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return res.status(400).json({ error: 'Formato no soportado' });
      }

      if (!rawRows.length) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return res.status(400).json({ error: 'Archivo vacío o sin datos válidos' });
      }

      const toDate = (v: any): Date | undefined => {
        if (!v) return undefined;
        if (v instanceof Date && !isNaN(v.getTime())) return v;
        const str = String(v).trim();
        const direct = new Date(str);
        if (!isNaN(direct.getTime())) return direct;
        const m1 = str.match(/^([0-3]?\d)[-/]([0-1]?\d)[-/](\d{2}|\d{4})$/);
        if (m1) {
          const day = parseInt(m1[1], 10);
          const month = parseInt(m1[2], 10) - 1;
          let year = parseInt(m1[3], 10);
          if (year < 100) year += 2000;
          const d2 = new Date(Date.UTC(year, month, day));
          if (!isNaN(d2.getTime())) return d2;
        }
        const m2 = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (m2) {
          const year = parseInt(m2[1], 10);
          const month = parseInt(m2[2], 10) - 1;
          const day = parseInt(m2[3], 10);
          const d3 = new Date(Date.UTC(year, month, day));
          if (!isNaN(d3.getTime())) return d3;
        }
        if (typeof v === 'number') {
          const base = new Date(Date.UTC(1899, 11, 30));
          const d4 = new Date(base.getTime() + v * 86400000);
          if (!isNaN(d4.getTime())) return d4;
        }
        return undefined;
      };

      const mapRow = (row: any): Partial<ILpmedio> | null => {
        const keys = Object.keys(row).reduce((acc: Record<string, string>, k) => {
          acc[k.trim().toLowerCase()] = k;
          return acc;
        }, {});

        const get = (name: string) => row[keys[name]] ?? row[name];

        const rutVal = get('rut');
        const nombreVal = get('nombre') ?? get('razon social') ?? get('razón social');
        const tipoPersonaVal = get('tipopersona') ?? get('tipo persona');
        const tipoListaVal = get('tipolista') ?? get('tipo lista') ?? 'Mediano Impacto';
        const subListaVal = get('nombresublista') ?? get('nombre sub-lista') ?? get('sublista') ?? 'General';
        const fechaVal = get('fechaincorporacion') ?? get('fecha incorporacion') ?? get('fecha incorporación') ?? get('fecha');

        if (!rutVal || !nombreVal || !tipoPersonaVal || !subListaVal || !fechaVal) {
          return null;
        }

        const sanitizedRut = sanitizeRut(String(rutVal));
        const fecha = toDate(fechaVal);
        if (!fecha) {
          return null;
        }

        return {
          rut: sanitizedRut,
          nombre: String(nombreVal),
          tipoPersona: String(tipoPersonaVal) as any,
          tipoLista: String(tipoListaVal || 'Mediano Impacto'),
          nombreSubLista: String(subListaVal),
          fechaIncorporacion: fecha,
          tenant: tenantId,
        };
      };

      let processed = 0;
      let saved = 0;
      let duplicates = 0;
      const errors: any[] = [];

      for (const row of rawRows) {
        processed++;
        try {
          const data = mapRow(row);
          if (!data) {
            errors.push({ row, error: 'Fila incompleta' });
            continue;
          }

          // Avoid duplicates per tenant + rut + nombreSubLista
          const exists = await Lpmedio.findOne({ tenant: tenantId, rut: data.rut, nombreSubLista: data.nombreSubLista });
          if (exists) {
            duplicates++;
            continue;
          }

          const doc = new Lpmedio(data as ILpmedio);
          await doc.save();
          saved++;
        } catch (e: any) {
          errors.push({ row, error: e?.message || 'Error desconocido' });
        }
      }

      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      return res.status(200).json({
        message: 'Archivo procesado',
        totalProcessed: processed,
        saved,
        duplicates,
        errors: errors.length,
        errorDetails: errors.slice(0, 50),
      });
    } catch (error: any) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(500).json({ error: 'Error al subir archivo', details: error?.message });
    }
  }
  // Get all Lpmedio entries
  static async getAllLpmedio(req: AuthenticatedRequest, res: Response) {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: 'Tenant ID requerido' });
      }

      // Build query with tenant filtering and optional search filters
      const query: any = { tenant: tenantId };
      
      // Add search filters if provided
      if (req.query.search) {
        const searchTerm = req.query.search as string;
        query.$or = [
          { rut: { $regex: searchTerm, $options: 'i' } },
          { nombre: { $regex: searchTerm, $options: 'i' } }
        ];
      }
      
      if (req.query.tipoPersona) {
        query.tipoPersona = req.query.tipoPersona;
      }
      
      if (req.query.nombreSubLista) {
        query.nombreSubLista = req.query.nombreSubLista;
      }

      const lpmedioEntries = await Lpmedio.find(query).sort({ createdAt: -1 });
      return res.status(200).json(lpmedioEntries);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [LpmedioController.getAllLpmedio] - Error:`, error);
      return res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  }

  // Get Lpmedio by ID
  static async getLpmedioById(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      
      if (!tenantId) {
        return res.status(401).json({ error: 'Tenant ID requerido' });
      }

      const lpmedioEntry = await Lpmedio.findOne({ _id: id, tenant: tenantId });

      if (!lpmedioEntry) {
        return res.status(404).json({ error: 'Entrada no encontrada' });
      }

      return res.status(200).json(lpmedioEntry);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [LpmedioController.getLpmedioById] - Error:`, error);
      return res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  }

  // Create new Lpmedio entry
  static async createLpmedio(req: AuthenticatedRequest, res: Response) {
    try {
      console.log(`[${new Date().toISOString()}] [LpmedioController.createLpmedio] - Received request with body:`, req.body);
      
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: 'Tenant ID requerido' });
      }
      
      // Validate request body
      const validatedData = lpmedioSchema.parse(req.body);
      
      // Sanitize RUT
      const sanitizedRut = sanitizeRut(validatedData.rut);
      
      // Create new Lpmedio entry
      const newLpmedio = new Lpmedio({
        ...validatedData,
        rut: sanitizedRut,
        fechaIncorporacion: new Date(validatedData.fechaIncorporacion),
        tenant: tenantId,
      });

      // Save to database
      await newLpmedio.save();
      
      return res.status(201).json({
        message: 'Entrada creada exitosamente',
        data: newLpmedio,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error(`[${new Date().toISOString()}] [LpmedioController.createLpmedio] - Validation error:`, error.errors);
        return res.status(400).json({
          error: 'Error de validación',
          details: error.errors,
        });
      }

      console.error(`[${new Date().toISOString()}] [LpmedioController.createLpmedio] - Error:`, error);
      return res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  }

  // Update Lpmedio entry
  static async updateLpmedio(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      
      if (!tenantId) {
        return res.status(401).json({ error: 'Tenant ID requerido' });
      }
      
      console.log(`[${new Date().toISOString()}] [LpmedioController.updateLpmedio] - Updating entry ${id} with body:`, req.body);
      
      // Validate request body
      const validatedData = lpmedioSchema.parse(req.body);
      
      // Sanitize RUT
      const sanitizedRut = sanitizeRut(validatedData.rut);
      
      // Find and update Lpmedio entry (only if it belongs to the tenant)
      const updatedLpmedio = await Lpmedio.findOneAndUpdate(
        { _id: id, tenant: tenantId },
        {
          ...validatedData,
          rut: sanitizedRut,
          fechaIncorporacion: new Date(validatedData.fechaIncorporacion),
        },
        { new: true, runValidators: true }
      );

      if (!updatedLpmedio) {
        return res.status(404).json({ error: 'Entrada no encontrada' });
      }

      return res.status(200).json({
        message: 'Entrada actualizada exitosamente',
        data: updatedLpmedio,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error(`[${new Date().toISOString()}] [LpmedioController.updateLpmedio] - Validation error:`, error.errors);
        return res.status(400).json({
          error: 'Error de validación',
          details: error.errors,
        });
      }

      console.error(`[${new Date().toISOString()}] [LpmedioController.updateLpmedio] - Error:`, error);
      return res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  }

  // Delete Lpmedio entry
  static async deleteLpmedio(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      
      if (!tenantId) {
        return res.status(401).json({ error: 'Tenant ID requerido' });
      }
      
      console.log(`[${new Date().toISOString()}] [LpmedioController.deleteLpmedio] - Deleting entry ${id}`);
      
      const deletedLpmedio = await Lpmedio.findOneAndDelete({ _id: id, tenant: tenantId });

      if (!deletedLpmedio) {
        return res.status(404).json({ error: 'Entrada no encontrada' });
      }

      return res.status(200).json({
        message: 'Entrada eliminada exitosamente',
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [LpmedioController.deleteLpmedio] - Error:`, error);
      return res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  }

  // Search Lpmedio entries by RUT
  static async searchByRut(req: AuthenticatedRequest, res: Response) {
    try {
      const { rut } = req.params;
      const tenantId = req.tenantId;
      
      if (!tenantId) {
        return res.status(401).json({ error: 'Tenant ID requerido' });
      }
      
      console.log(`[${new Date().toISOString()}] [LpmedioController.searchByRut] - Searching for RUT: ${rut} in tenant: ${tenantId}`);
      
      // Sanitize RUT
      const sanitizedRut = sanitizeRut(rut);
      
      const lpmedioEntries = await Lpmedio.find({ 
        tenant: tenantId,
        rut: { $regex: sanitizedRut, $options: 'i' } 
      }).sort({ createdAt: -1 });
      console.warn(431,lpmedioEntries);
      return res.status(200).json(lpmedioEntries);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [LpmedioController.searchByRut] - Error:`, error);
      return res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  }
}