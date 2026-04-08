import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import XLSX from 'xlsx';
import mongoose from 'mongoose';
import { SnifaSancionatorio, ISnifaSancionatorio } from '../models/SnifaSancionatorio';
import { SnifaChangeLog } from '../models/SnifaChangeLog';
import { SnifaImportJob } from '../models/SnifaImportJob';
import { AuthenticatedRequest } from '../types/auth';

interface MulterRequest extends AuthenticatedRequest {
  file?: Express.Multer.File;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'snifa');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `snifa-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
  const allowedExts = ['.xlsx', '.xls'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Formato no válido. Solo XLSX/XLS'));
  }
};

export const snifaUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }
});

const parseDate = (val: any): Date | undefined => {
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  if (typeof val === 'number') {
    const base = new Date(Date.UTC(1899, 11, 30));
    const d4 = new Date(base.getTime() + val * 86400000);
    if (!isNaN(d4.getTime())) return d4;
  }
  const str = String(val ?? '').trim();
  if (!str) return undefined;
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
  return undefined;
};

const readXLS = (filePath: string): any[] => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`El archivo no existe en la ruta especificada: ${filePath}`);
  }
  const workbook = XLSX.readFile(filePath);
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('El archivo Excel no contiene hojas de cálculo');
  }
  const sheet = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheet];
  return XLSX.utils.sheet_to_json(worksheet);
};

const normalizeString = (v: any): string => String(v ?? '').toString().trim();
const normalizeNumber = (v: any): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'string' ? parseFloat(v.replace(/[^\d.,-]/g, '').replace(',', '.')) : Number(v);
  return isNaN(n) ? undefined : n;
};

const mapRowToModel = (row: any): Partial<ISnifaSancionatorio> | null => {
  const keys = Object.keys(row).reduce((acc: Record<string, string>, k) => {
    acc[k.trim().toLowerCase()] = k;
    return acc;
  }, {});
  const get = (name: string) => row[keys[name]] ?? row[name];

  const procesoId = normalizeNumber(get('#')) ?? normalizeNumber(get('proceso sancion id')) ?? normalizeNumber(get('procesosancionid'));
  const expediente = normalizeString(get('expediente'));
  
  // Campos nuevos y mapeo específico
  const razonSocial = normalizeString(get('razón social')) || normalizeString(get('razon social'));
  const rut = normalizeString(get('rut'));
  const unidadFiscalizable = normalizeString(get('unidad fiscalizable'));
  const lista = normalizeString(get('lista'));
  const fastCheckProcesoSancionatorio = normalizeString(get('fast check proceso sancionatorio'));
  const fastCheckSanciones = normalizeString(get('fast check sanciones')) || normalizeString(get('fast check  sanciones'));
  const confirmaPdC = normalizeString(get('confirma pdc')) || normalizeString(get('confirmapdc'));

  // Mapeo existente ajustado
  const nombre = normalizeString(get('nombre')) || normalizeString(get('unidad fiscalizable')) || normalizeString(get('nombre razón social'));
  const categoria = normalizeString(get('categoría')) || normalizeString(get('categoria')) || normalizeString(get('categoriaeconomicanombre'));
  const region = normalizeString(get('región')) || normalizeString(get('region')) || normalizeString(get('regionnombre'));
  const estado = normalizeString(get('estado')) || normalizeString(get('proceso sancion estado')) || normalizeString(get('procesosancionestado')) || 'En curso';
  const tipo = normalizeString(get('proceso sancion tipo nombre')) || normalizeString(get('procesosanciontiponombre')) || 'Sanción Ambiental';
  const multaUTA = normalizeNumber(get('multa (uta)')) ?? normalizeNumber(get('multatotaluta'));
  const fechaInicio = parseDate(get('fecha inicio')) ?? parseDate(get('fechainicio')) ?? new Date();
  const fechaTermino = parseDate(get('fecha termino')) ?? parseDate(get('fechatermino'));
  const comuna = normalizeString(get('comuna')) || normalizeString(get('comunanombre')) || 'No especificada';
  const lat = normalizeNumber(get('latitud'));
  const lon = normalizeNumber(get('longitud'));
  const subCat = normalizeString(get('subcategoriaeconomicanombre')) || 'No especificada';
  const linkSnifaUf = normalizeString(get('detalle')) || normalizeString(get('linksnifa_uf'));
  const linkSnifa = normalizeString(get('linksnifa'));
  const ufId = normalizeNumber(get('unidad fiscalizable id')) ?? normalizeNumber(get('unidadfiscalizableid')) ?? procesoId;
  const fechaAct = parseDate(get('fechaactualizacion')) ?? new Date();

  if (!procesoId || !expediente || !nombre || !categoria || !region) {
    return null;
  }

  return {
    procesoSancionId: procesoId,
    expediente,
    procesoSancionTipoNombre: tipo || 'Sanción Ambiental',
    procesoSancionEstado: estado || 'En curso',
    fechaInicio,
    fechaTermino,
    multaTotalUTA: multaUTA,
    linkSNIFA: linkSnifa || 'https://snifa.sma.gob.cl/',
    unidadFiscalizableId: ufId,
    nombre,
    regionNombre: region,
    comunaNombre: comuna,
    latitud: lat,
    longitud: lon,
    categoriaEconomicaNombre: categoria,
    subCategoriaEconomicaNombre: subCat,
    linkSNIFA_UF: linkSnifaUf || 'Ver detalles',
    fechaActualizacion: fechaAct,
    razonSocial,
    rut,
    unidadFiscalizable,
    lista,
    fastCheckProcesoSancionatorio,
    fastCheckSanciones,
    confirmaPdC
  };
};

export const previewFile = async (req: MulterRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Ningún archivo subido' });
    }
    const filePath = req.file.path;
    const rows = readXLS(filePath);
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const mapped: Partial<ISnifaSancionatorio>[] = [];
    const warnings: Array<{ rowIndex: number; warning: string }> = [];

    for (let i = 0; i < Math.min(50, rows.length); i++) {
      const r = rows[i];
      const m = mapRowToModel(r);
      if (m) {
        mapped.push(m);
      } else {
        warnings.push({ rowIndex: i + 1, warning: 'Fila incompleta o con formatos inválidos' });
      }
    }

    const summary = {
      totalRows: rows.length,
      previewCount: mapped.length,
      missingCount: warnings.length,
      distinctEstados: Array.from(new Set(rows.map(r => String(r['Estado'] || r['estado'] || '').trim()).filter(Boolean))),
      distinctRegiones: Array.from(new Set(rows.map(r => String(r['Región'] || r['region'] || '').trim()).filter(Boolean)))
    };

    fs.unlinkSync(filePath);
    return res.status(200).json({ headers, preview: mapped, warnings, summary });
  } catch (error: any) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(500).json({ error: 'Error al previsualizar archivo', details: error?.message });
  }
};

export const importFile = async (req: MulterRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Ningún archivo subido' });
    }
    const filePath = req.file.path;
    const rows = readXLS(filePath);

    const job = await SnifaImportJob.create({
      status: 'processing',
      startedAt: new Date(),
      total: rows.length,
      createdBy: req.user.email
    });

    const batchSize = 1000;
    let processed = 0;
    let saved = 0;
    let duplicates = 0;
    const errors: Array<{ rowIndex: number; error: string }> = [];
    const warnings: Array<{ rowIndex: number; warning: string }> = [];

    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const slice = rows.slice(offset, Math.min(offset + batchSize, rows.length));

      const ops: any[] = [];
      for (let i = 0; i < slice.length; i++) {
        const r = slice[i];
        processed++;
        const mapped = mapRowToModel(r);
        if (!mapped) {
          warnings.push({ rowIndex: offset + i + 1, warning: 'Fila incompleta o inválida' });
          continue;
        }
        ops.push({
          updateOne: {
            filter: { procesoSancionId: mapped.procesoSancionId },
            update: { $setOnInsert: mapped },
            upsert: true
          }
        });
      }

      if (ops.length) {
        const result = await SnifaSancionatorio.bulkWrite(ops, { ordered: false });
        saved += result.upsertedCount;
        duplicates += (ops.length - result.upsertedCount);
      }

      const currentJob = await SnifaImportJob.findById(job._id);
      if (currentJob?.status === 'canceled') {
        await SnifaImportJob.findByIdAndUpdate(job._id, {
          status: 'canceled',
          completedAt: new Date(),
          processed,
          saved,
          duplicates,
          errorCount: errors.length,
          errorDetails: errors,
          warnings
        });
        try { fs.unlinkSync(filePath); } catch {}
        return res.status(200).json({ message: 'Importación cancelada', jobId: job._id });
      }
    }

    await SnifaImportJob.findByIdAndUpdate(job._id, {
      status: 'completed',
      completedAt: new Date(),
      processed,
      saved,
      duplicates,
      errorCount: errors.length,
      errorDetails: errors,
      warnings
    });

    try { fs.unlinkSync(filePath); } catch {}
    return res.status(200).json({
      message: 'Archivo importado',
      summary: { total: rows.length, processed, saved, duplicates, errors: errors.length, warnings: warnings.length },
      jobId: job._id
    });
  } catch (error: any) {
    try {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    } catch {}
    return res.status(500).json({ error: 'Error al importar archivo', details: error?.message });
  }
};

export const cancelImportJob = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const job = await SnifaImportJob.findByIdAndUpdate(id, { status: 'canceled' }, { new: true });
    if (!job) return res.status(404).json({ error: 'Job no encontrado' });
    return res.status(200).json({ success: true, job });
  } catch (error: any) {
    return res.status(500).json({ error: 'Error al cancelar job', details: error?.message });
  }
};

export const getImportJobStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const job = await SnifaImportJob.findById(id);
    if (!job) return res.status(404).json({ error: 'Job no encontrado' });
    return res.status(200).json({ success: true, job });
  } catch (error: any) {
    return res.status(500).json({ error: 'Error al obtener estado', details: error?.message });
  }
};

export const getSnifaSummary = async (req: Request, res: Response) => {
  try {
    const total = await SnifaSancionatorio.countDocuments();
    
    const byEstado = await SnifaSancionatorio.aggregate([
      { $group: { _id: '$procesoSancionEstado', count: { $sum: 1 } } }
    ]).then(res => res.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {}));

    const byRegion = await SnifaSancionatorio.aggregate([
      { $group: { _id: '$regionNombre', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]).then(res => res.map(r => ({ region: r._id, count: r.count })));

    const lastUpdate = await SnifaSancionatorio.findOne().sort({ fechaActualizacion: -1 }).select('fechaActualizacion');

    res.json({
      total,
      byEstado,
      byRegion,
      lastUpdate: lastUpdate?.fechaActualizacion
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Error getting summary', details: error?.message });
  }
};

export const listSnifaRecords = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = (req.query.search as string || '').trim();
    const sortField = (req.query.sortField as string) || 'fechaInicio';
    const sortOrder = (req.query.sortOrder as string) === 'asc' ? 1 : -1;

    const query: any = {};
    if (search) {
      query.$or = [
        { nombre: { $regex: search, $options: 'i' } },
        { expediente: { $regex: search, $options: 'i' } },
        { razonSocial: { $regex: search, $options: 'i' } },
        { rut: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await SnifaSancionatorio.countDocuments(query);
    const data = await SnifaSancionatorio.find(query)
      .sort({ [sortField]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Error listing records', details: error?.message });
  }
};

// CRUD Operations
export const getSanctionById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const record = await SnifaSancionatorio.findById(id);
    if (!record) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json(record);
  } catch (error: any) {
    res.status(500).json({ error: 'Error getting record', details: error?.message });
  }
};

export const updateSnifaRecord = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const body = (req.body || {}) as Record<string, unknown>;
    const reason = typeof body.reason === 'string' ? body.reason : undefined;
    const { reason: _ignoredReason, ...updates } = body;
    
    // Track changes if needed, for now just update
    const before = await SnifaSancionatorio.findById(id);
    const record = await SnifaSancionatorio.findByIdAndUpdate(id, updates, { new: true });
    if (!record) return res.status(404).json({ error: 'Registro no encontrado' });
    
    // Create change log
    if (req.user) {
      await SnifaChangeLog.create({
        recordId: record._id,
        userId: req.user.id,
        userEmail: req.user.email,
        reason: typeof reason === 'string' && reason.trim() ? reason.trim() : undefined,
        before: before ? before.toObject() : {},
        after: record.toObject()
      });
    }

    res.json(record);
  } catch (error: any) {
    res.status(500).json({ error: 'Error updating record', details: error?.message });
  }
};

export const deleteSanction = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const record = await SnifaSancionatorio.findByIdAndDelete(id);
    if (!record) return res.status(404).json({ error: 'Registro no encontrado' });
    
    if (req.user) {
      const reasonRaw = req.query?.reason;
      await SnifaChangeLog.create({
        recordId: record._id,
        userId: req.user.id,
        userEmail: req.user.email,
        reason: typeof reasonRaw === 'string' && reasonRaw.trim() ? reasonRaw.trim() : undefined,
        before: record.toObject(),
        after: { deleted: true }
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Error deleting record', details: error?.message });
  }
};

export const getSanctionStats = async (req: Request, res: Response) => {
  try {
    const totalSanctions = await SnifaSancionatorio.countDocuments();
    const sanctionsByState = await SnifaSancionatorio.aggregate([
      { $group: { _id: '$procesoSancionEstado', count: { $sum: 1 } } }
    ]);
    const sanctionsByRegion = await SnifaSancionatorio.aggregate([
      { $group: { _id: '$regionNombre', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);
    const sanctionsByCategory = await SnifaSancionatorio.aggregate([
      { $group: { _id: '$categoriaEconomicaNombre', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);
    const totalFinesResult = await SnifaSancionatorio.aggregate([
      { $group: { _id: null, total: { $sum: '$multaTotalUTA' } } }
    ]);
    const totalFines = totalFinesResult[0]?.total || 0;
    
    const recentSanctions = await SnifaSancionatorio.find()
      .sort({ fechaInicio: -1 })
      .limit(5)
      .select('nombre fechaInicio procesoSancionEstado multaTotalUTA');

    res.json({
      totalSanctions,
      sanctionsByState,
      sanctionsByRegion,
      sanctionsByCategory,
      totalFines,
      recentSanctions
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Error getting stats', details: error?.message });
  }
};
