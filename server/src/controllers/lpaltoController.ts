import { Request, Response } from 'express';
import { Lpalto, ILpalto } from '../models/Lpalto';
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

// Validation schema for Lpalto
const lpaltoSchema = z.object({
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

export class LpaltoController {
  // Multer setup for CSV/XLS/XLSX
  static lpaltoUploadStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(process.cwd(), 'uploads', 'lpalto');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `lpalto-${uniqueSuffix}${path.extname(file.originalname)}`);
    },
  });

  static lpaltoFileFilter: multer.Options['fileFilter'] = (req, file, cb) => {
    const allowed = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    return cb(new Error('Formato no válido. Solo CSV, XLS o XLSX'));
  };

  static uploadExcel = multer({
    storage: LpaltoController.lpaltoUploadStorage,
    fileFilter: LpaltoController.lpaltoFileFilter,
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  static async uploadFile(req: AuthenticatedRequest & { file?: Express.Multer.File }, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Ningún archivo subido' });
      }

      const tenantId = req.tenantId;
      if (!tenantId) {
        // Cleanup temp file
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

        // If already a Date
        if (v instanceof Date && !isNaN(v.getTime())) return v;

        // Normalize input to string for parsing
        const str = String(v).trim();

        // Try ISO or RFC-compliant parsing first
        const direct = new Date(str);
        if (!isNaN(direct.getTime())) return direct;

        // Accept common CSV formats: dd-MM-yyyy, dd/MM/yyyy, dd-MM-yy, dd/MM/yy
        const m1 = str.match(/^([0-3]?\d)[-/]([0-1]?\d)[-/](\d{2}|\d{4})$/);
        if (m1) {
          const day = parseInt(m1[1], 10);
          const month = parseInt(m1[2], 10) - 1; // JS months are 0-based
          let year = parseInt(m1[3], 10);
          // Two-digit year: assume 2000-2099
          if (year < 100) year += 2000;
          const d2 = new Date(Date.UTC(year, month, day));
          if (!isNaN(d2.getTime())) return d2;
        }

        // Accept yyyy-MM-dd and yyyy/MM/dd explicitly
        const m2 = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (m2) {
          const year = parseInt(m2[1], 10);
          const month = parseInt(m2[2], 10) - 1;
          const day = parseInt(m2[3], 10);
          const d3 = new Date(Date.UTC(year, month, day));
          if (!isNaN(d3.getTime())) return d3;
        }

        // Try Excel serial dates
        if (typeof v === 'number') {
          const base = new Date(Date.UTC(1899, 11, 30));
          const d4 = new Date(base.getTime() + v * 86400000);
          if (!isNaN(d4.getTime())) return d4;
        }

        return undefined;
      };

      const mapRow = (row: any): Partial<ILpalto> | null => {
        const keys = Object.keys(row).reduce((acc: Record<string, string>, k) => {
          acc[k.trim().toLowerCase()] = k;
          return acc;
        }, {});

        const get = (name: string) => row[keys[name]] ?? row[name];

        const rutVal = get('rut');
        const nombreVal = get('nombre') ?? get('razon social') ?? get('razón social');
        const tipoPersonaVal = get('tipopersona') ?? get('tipo persona');
        const tipoListaVal = get('tipolista') ?? get('tipo lista') ?? 'Alto Impacto';
        const subListaVal = get('nombresublista') ?? get('nombre sub-lista') ?? get('sublista') ?? 'General';
        const fechaVal = get('fechaincorporacion') ?? get('fecha incorporacion') ?? get('fecha incorporación') ?? get('fecha');

        if (!rutVal || !nombreVal || !tipoPersonaVal || !subListaVal || !fechaVal) {
          return null;
        }

        const sanitizedRut = sanitizeRut(String(rutVal));
        const fecha = toDate(fechaVal);
        if (!fecha) {
          // If date cannot be parsed, skip row as invalid
          return null;
        }

        return {
          rut: sanitizedRut,
          nombre: String(nombreVal),
          tipoPersona: String(tipoPersonaVal) as any,
          tipoLista: String(tipoListaVal || 'Alto Impacto'),
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
          const exists = await Lpalto.findOne({ tenant: tenantId, rut: data.rut, nombreSubLista: data.nombreSubLista });
          if (exists) {
            duplicates++;
            continue;
          }

          const doc = new Lpalto(data as ILpalto);
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
  // Get all Lpalto entries
  static async getAllLpalto(req: AuthenticatedRequest, res: Response) {
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

      const lpaltoEntries = await Lpalto.find(query).sort({ createdAt: -1 });
      return res.status(200).json(lpaltoEntries);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [LpaltoController.getAllLpalto] - Error:`, error);
      return res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  }

  // Get Lpalto by ID
  static async getLpaltoById(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      
      if (!tenantId) {
        return res.status(401).json({ error: 'Tenant ID requerido' });
      }

      const lpaltoEntry = await Lpalto.findOne({ _id: id, tenant: tenantId });

      if (!lpaltoEntry) {
        return res.status(404).json({ error: 'Entrada no encontrada' });
      }

      return res.status(200).json(lpaltoEntry);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [LpaltoController.getLpaltoById] - Error:`, error);
      return res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  }

  // Create new Lpalto entry
  static async createLpalto(req: AuthenticatedRequest, res: Response) {
    try {
      console.log(`[${new Date().toISOString()}] [LpaltoController.createLpalto] - Received request with body:`, req.body);
      
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: 'Tenant ID requerido' });
      }
      
      // Validate request body
      const validatedData = lpaltoSchema.parse(req.body);
      
      // Sanitize RUT
      const sanitizedRut = sanitizeRut(validatedData.rut);
      
      // Create new Lpalto entry
      const newLpalto = new Lpalto({
        ...validatedData,
        rut: sanitizedRut,
        fechaIncorporacion: new Date(validatedData.fechaIncorporacion),
        tenant: tenantId,
      });

      // Save to database
      await newLpalto.save();
      
      return res.status(201).json({
        message: 'Entrada creada exitosamente',
        data: newLpalto,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error(`[${new Date().toISOString()}] [LpaltoController.createLpalto] - Validation error:`, error.errors);
        return res.status(400).json({
          error: 'Error de validación',
          details: error.errors,
        });
      }

      console.error(`[${new Date().toISOString()}] [LpaltoController.createLpalto] - Error:`, error);
      return res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  }

  // Update Lpalto entry
  static async updateLpalto(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      
      if (!tenantId) {
        return res.status(401).json({ error: 'Tenant ID requerido' });
      }
      
      console.log(`[${new Date().toISOString()}] [LpaltoController.updateLpalto] - Updating entry ${id} with body:`, req.body);
      
      // Validate request body
      const validatedData = lpaltoSchema.parse(req.body);
      
      // Sanitize RUT
      const sanitizedRut = sanitizeRut(validatedData.rut);
      
      // Find and update Lpalto entry (only if it belongs to the tenant)
      const updatedLpalto = await Lpalto.findOneAndUpdate(
        { _id: id, tenant: tenantId },
        {
          ...validatedData,
          rut: sanitizedRut,
          fechaIncorporacion: new Date(validatedData.fechaIncorporacion),
        },
        { new: true, runValidators: true }
      );

      if (!updatedLpalto) {
        return res.status(404).json({ error: 'Entrada no encontrada' });
      }

      return res.status(200).json({
        message: 'Entrada actualizada exitosamente',
        data: updatedLpalto,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error(`[${new Date().toISOString()}] [LpaltoController.updateLpalto] - Validation error:`, error.errors);
        return res.status(400).json({
          error: 'Error de validación',
          details: error.errors,
        });
      }

      console.error(`[${new Date().toISOString()}] [LpaltoController.updateLpalto] - Error:`, error);
      return res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  }

  // Delete Lpalto entry
  static async deleteLpalto(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      
      if (!tenantId) {
        return res.status(401).json({ error: 'Tenant ID requerido' });
      }
      
      console.log(`[${new Date().toISOString()}] [LpaltoController.deleteLpalto] - Deleting entry ${id}`);
      
      const deletedLpalto = await Lpalto.findOneAndDelete({ _id: id, tenant: tenantId });

      if (!deletedLpalto) {
        return res.status(404).json({ error: 'Entrada no encontrada' });
      }

      return res.status(200).json({
        message: 'Entrada eliminada exitosamente',
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [LpaltoController.deleteLpalto] - Error:`, error);
      return res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  }

  // Search Lpalto entries by RUT
  static async searchByRut(req: AuthenticatedRequest, res: Response) {
    try {
      const { rut } = req.params;
      const tenantId = req.tenantId;
      
      if (!tenantId) {
        return res.status(401).json({ error: 'Tenant ID requerido' });
      }
      
      console.log(`[${new Date().toISOString()}] [LpaltoController.searchByRut] - Searching for RUT: ${rut} in tenant: ${tenantId}`);
      
      // Sanitize RUT
      const sanitizedRut = sanitizeRut(rut);
      
      const lpaltoEntries = await Lpalto.find({ 
        tenant: tenantId,
        rut: { $regex: sanitizedRut, $options: 'i' } 
      }).sort({ createdAt: -1 });

      return res.status(200).json(lpaltoEntries);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [LpaltoController.searchByRut] - Error:`, error);
      return res.status(500).json({
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  }
}