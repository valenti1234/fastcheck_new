import { Request, Response } from 'express';
import axios from 'axios'; // Added axios for PDF download
import { SheriffService } from '../services/sheriffService'; // Import SheriffService
import { sheriffV2Service } from '../services/sheriffV2Service'; // Import SheriffV2Service
import { OpenAIService } from '../services/OpenAIService'; // Import OpenAI Service
import { CompanyAnalysisService } from '../services/companyAnalysisService'; // Import CompanyAnalysisService
import { Result } from '../models/Result';
import { Summary } from '../models/Summary'; // Import Summary model
import { logSherifData } from '../models/LogSherifData'; // Import logSherifData model
import { SheriffDataLog, ISheriffDataLog } from '../models/SheriffDataLog'; // Import SheriffDataLog model and interface
import { CompanyDetails } from '../models/CompanyDetails'; // Import CompanyDetails model
import { CompanyRisks } from '../models/CompanyRisks'; // Import CompanyRisks model
import { z } from 'zod';
import { RiskCalculationService } from '../services/riskCalculationService';
import { log } from 'console';
import { Ley21121 } from '../models/Ley21121'; // Import Ley21121 model
import { Ley20393 } from '../models/Ley20393'; // Import Ley20393 model
import mongoose from 'mongoose'; // Import mongoose for direct collection access
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Tenant } from '../models/tenant.model'; // Import Tenant model for credit system
import { User } from '../models/user.model';
import { CreditOperation } from '../models/creditOperation.model'; // Import CreditOperation model
import { AuthenticatedRequest } from '../types/auth'; // Import AuthenticatedRequest type
import { EquifaxService } from '../services/equifaxService';
import { ConsultaHistoryService } from '../services/consultaHistoryService'; // Import ConsultaHistoryService
import { DequienesService } from '../services/dequienesService';
import { UserNote } from '../models/UserNote';
import elkService from '../services/elkService';
import { performance } from 'perf_hooks';


const rutLookupSchema = z.object({
  rut: z.string().min(1),
  isMonitoring: z.boolean().default(false),
  isRefreshing: z.boolean().default(false),
  isPep: z.boolean().default(false),
  type: z.string().default('individual')
});

export class RutController {
  private static logDebug(step: string, data: any = {}, level: 'info' | 'debug' | 'warn' | 'error' = 'info') {
    // Only log if enabled or if it's an error/warning
//    if (process.env.ENABLE_DETAILED_LOGGING !== 'true' && level !== 'error' && level !== 'warn') return;

    const timestamp = new Date().toISOString();
    const logPrefix = `[${timestamp}] [${level.toUpperCase()}] [RutController.lookupRut] [${step}]`;

    // Format for readability
    if (level === 'error') {
      console.error(logPrefix, JSON.stringify(data, null, 2));
    } else if (level === 'warn') {
      console.warn(logPrefix, JSON.stringify(data, null, 2));
    } else {
      console.log(logPrefix, JSON.stringify(data, null, 2));
    }
  }

  // Normalize RUT to a canonical format: remove dots, ensure single dash before check digit,
  // and uppercase the check digit. Example: 12.345.678-k -> 12345678-K
  static normalizeRut(rut: string): string {
    if (!rut || typeof rut !== 'string') return rut as any;
    const cleaned = rut.replace(/\./g, '').replace(/\s+/g, '');
    // If it already has a dash, split and rebuild; otherwise add dash before last char
    const hasDash = cleaned.includes('-');
    if (hasDash) {
      const [num, dv] = cleaned.split('-');
      const numericRaw = num.replace(/[^0-9]/g, '');
      const check = (dv || '').replace(/[^0-9kK]/g, '').toUpperCase();
      if (!numericRaw) return cleaned.toUpperCase();
      const numeric = (numericRaw.replace(/^0+/, '') || '0');
      return `${numeric}-${check}`;
    } else {
      const base = cleaned.replace(/[^0-9kK]/g, '').toUpperCase();
      if (base.length < 2) return base;
      const numericRaw = base.slice(0, -1).replace(/[^0-9]/g, '');
      const check = base.slice(-1);
      const numeric = (numericRaw.replace(/^0+/, '') || '0');
      return `${numeric}-${check}`;
    }
  }

  // Normalize and validate date string to ISO format (YYYY-MM-DD)
  static normalizeDate(dateStr: string): string {
    if (!dateStr) {
      return dateStr as any;
    }
    // Already ISO?
    const isoMatch = dateStr.match(/^\d{4}-\d{2}-\d{2}/);
    if (isoMatch) {
      const dateObj = new Date(dateStr);
      if (!isNaN(dateObj.getTime())) {
        return isoMatch[0];
      }
    }
    // Handle MM/YYYY
    const monthYearMatch = dateStr.match(/^(\d{2})\/?(\d{4})$/);
    if (monthYearMatch) {
      const [, month, year] = monthYearMatch;
      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);
      if (monthNum > 0 && monthNum <= 12 && yearNum > 1900 && yearNum < 2100) {
        return `${year}-${month.padStart(2, '0')}-01`;
      }
    }
    // Handle common Chilean formats (DD-MM-YYYY or DD/MM/YYYY)
    const dateMatch = dateStr.match(/(\d{2})[-.\/ ](\d{2})[-.\/ ](\d{4})/);
    if (dateMatch) {
      const [, day, month, year] = dateMatch;
      const dayNum = parseInt(day, 10);
      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);
      if (dayNum > 0 && dayNum <= 31 && monthNum > 0 && monthNum <= 12 && yearNum > 1900 && yearNum < 2100) {
        const normalizedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        const dateObj = new Date(normalizedDate);
        if (!isNaN(dateObj.getTime()) && dateObj.toISOString().startsWith(normalizedDate)) {
          return normalizedDate;
        }
      }
    }
    return dateStr;
  }

  // Sanitize and limit the size of large data objects
  static sanitizeData(
    data: any,
    maxSize: number = 15000000,
    path: string = 'root',
    visited: WeakSet<object> = new WeakSet()
  ): any {
    if (!data) {
      return null;
    }

    if (data instanceof Date) {
      const iso = data.toISOString();
      return iso.split('T')[0];
    }

    // Handle primitive types first
    if (typeof data !== 'object') {
      if (typeof data === 'string') {
        if (data.length > maxSize) {
          console.warn(`[RutController.lookupRut] String length at ${path} exceeds ${maxSize} characters, truncating...`);
          return data.substring(0, maxSize);
        }
        return data;
      }
      // Handle other primitive values
      try {
        const str = JSON.stringify(data);
        if (str && str.length > maxSize) {
          console.warn(`[RutController.lookupRut] Data size at ${path} exceeds ${maxSize / 1000000}MB limit, truncating...`);
          return {
            error: 'Data size exceeded limit',
            path,
            truncated: true,
            originalSize: str.length,
            maxSize
          };
        }
      } catch (jsonError) {
        console.warn(`[RutController.lookupRut] JSON stringify error for primitive at ${path}:`, jsonError);
        return {
          error: 'JSON stringify failed for primitive',
          path,
          jsonError: true
        };
      }
      return data;
    }

    // Check for circular references
    if (visited.has(data)) {
      console.warn(`[RutController.lookupRut] Circular reference detected at ${path}, skipping...`);
      return {
        error: 'Circular reference detected',
        path,
        circular: true
      };
    }

    // Add current object to visited set
    visited.add(data);

    try {
      // Handle arrays
      if (Array.isArray(data)) {
        const result = data.map((item, index) => {
          return RutController.sanitizeData(item, maxSize, `${path}[${index}]`, visited);
        });
        return result;
      }

      // Handle objects
      const result: any = {};
      for (const [key, value] of Object.entries(data)) {
        // Apply stricter limits for specific fields
        const fieldMaxSize = key.includes('fecha') || key.includes('date') || key.includes('time') ? 100 :
          key.includes('rut') || key.includes('name') || key.includes('nombre') ? 1000 :
            key.includes('domicilio') || key.includes('address') ? 5000 : maxSize;
        // Normalize date fields
        let processedValue = value;
        if ((key.includes('fecha') || key.includes('date')) && typeof value === 'string') {
          processedValue = RutController.normalizeDate(value);
        } else if ((key.includes('fecha') || key.includes('date')) && value instanceof Date) {
          processedValue = value.toISOString().split('T')[0];
        }
        result[key] = RutController.sanitizeData(processedValue, fieldMaxSize, `${path}.${key}`, visited);
      }

      // Check size after processing
      try {
        const str = JSON.stringify(result);
        if (str.length > maxSize) {
          console.warn(`[RutController.lookupRut] Data size at ${path} exceeds ${maxSize / 1000000}MB limit, truncating...`);
          return {
            error: 'Data size exceeded limit',
            path,
            truncated: true,
            originalSize: str.length,
            maxSize
          };
        }
      } catch (jsonError) {
        console.warn(`[RutController.lookupRut] JSON stringify error at ${path}:`, jsonError);
        return {
          error: 'JSON stringify failed',
          path,
          jsonError: true
        };
      }

      return result;
    } finally {
      // Remove from visited set when done processing
      visited.delete(data);
    }
  }

  // Recursively truncate arrays that exceed the limit
  static truncateArraysRecursively(obj: any, limit: number = 100): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    // Skip Date and ObjectId
    if (obj instanceof Date || obj instanceof mongoose.Types.ObjectId) {
      return obj;
    }

    if (Array.isArray(obj)) {
      const newArray = obj.length > limit ? obj.slice(0, limit) : obj;
      // Recursively process items
      return newArray.map((item: any) => RutController.truncateArraysRecursively(item, limit));
    }

    // Process object properties
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        obj[key] = RutController.truncateArraysRecursively(obj[key], limit);
      }
    }
    return obj;
  }

  // Check Ley21121 presence for a normalized RUT and update log entry flags
  static async checkLey21121AndFlag(rut: string, logEntry: any): Promise<void> {
    const cleanRut = rut.replace(/\./g, '').toUpperCase();
    const ley21121Records = await Ley21121.find({ rut: cleanRut });

    if (!logEntry.summaryData) {
      logEntry.summaryData = { data: {} };
    } else if (!logEntry.summaryData.data) {
      logEntry.summaryData.data = {};
    }
    logEntry.summaryData.data.ley21121Detected = ley21121Records.length > 0;
    if (logEntry.summaryData.data.ley21121Detected) {
      logEntry.summaryData.data.ley21121Records = ley21121Records;
      console.log(`[RutController.lookupRut] - Ley21121 records for RUT ${cleanRut}`, ley21121Records);
    }
  }

  // Check Ley20393 presence for a normalized RUT and update log entry flags
  static async checkLey20393AndFlag(rut: string, logEntry: any): Promise<void> {
    const cleanRut = rut.replace(/\./g, '').toUpperCase();
    const ley20393Records = await Ley20393.find({ rut: cleanRut });
    if (!logEntry.summaryData) {
      logEntry.summaryData = { data: {} };
      console.warn(`[RutController.lookupRut] - Ley20393 check for RUT ${rut} - No summaryData.data found`);
    } else if (!logEntry.summaryData.data) {
      logEntry.summaryData.data = {};
      console.warn(`[RutController.lookupRut] - Ley20393 check for RUT ${rut} - No summaryData.data found`);
    }
    logEntry.summaryData.data.ley20393Detected = ley20393Records.length > 0;
    if (logEntry.summaryData.data.ley20393Detected) {
      logEntry.summaryData.data.ley20393Records = ley20393Records.map((r: any) => ({
        razonSocial: r.razonSocial || null,
        rolCausa: r.rolCausa || null,
        fechaDesde: RiskCalculationService.formatDateDDMMYYYY(r.fechaDesde) || null,
        fechaHasta: RiskCalculationService.formatDateDDMMYYYY(r.fechaHasta) || null,
        duracion: r.duracion || null,
        motivo: r.motivo || null,
      }));
      console.log(`[RutController.lookupRut] - Ley20393 records for RUT ${cleanRut}`, logEntry.summaryData.data.ley20393Records);
    }
  }

  // Check lpaltos presence for a normalized RUT and tenant, update log entry flags
  static async checkLpaltosAndFlag(rut: string, tenantId: string, logEntry: any): Promise<void> {
    try {
      if (logEntry.summaryData.data.lpaltosDetected > 0) {
        console.warn (297,"already detected lpaltos records for RUT ${cleanRut} - Tenant ${tenantId}");
        return;
      }
      const cleanRut = rut.replace(/\./g, '').toUpperCase();
      const lpaltosCollection = mongoose.connection.db.collection('lpaltos');
      console.warn(302,`[RutController.lookupRut] - Lpaltos check for RUT ${rut} - Tenant ${tenantId}`);
      const lpaltosRecords = await lpaltosCollection.find({
        rut: cleanRut,
        tenant: tenantId
      }).toArray();

      console.warn(`[RutController.lookupRut] - Lpaltos records for RUT ${cleanRut} - Tenant ${tenantId}`, lpaltosRecords);
      if (!logEntry.summaryData) {
        logEntry.summaryData = { data: {} };
      } else if (!logEntry.summaryData.data) {
        logEntry.summaryData.data = {};
      }
      logEntry.summaryData.data.lpaltosDetected = lpaltosRecords.length > 0;
      logEntry.summaryData.data.lpaltosRecords = lpaltosRecords || [];
      console.log(`[RutController.lookupRut] - Lpaltos check for tenant ${tenantId}: ${lpaltosRecords.length} records found`);
    } catch (error) {
      console.error(`[RutController.lookupRut] - Error checking lpaltos collection:`, error);
      if (!logEntry.summaryData) {
        logEntry.summaryData = { data: {} };
      } else if (!logEntry.summaryData.data) {
        logEntry.summaryData.data = {};
      }
      logEntry.summaryData.data.lpaltosDetected = false;
    }
  }

  // Check lpmedios presence for a normalized RUT and tenant, update log entry flags
  static async checkLpmediosAndFlag(rut: string, tenantId: string, logEntry: any): Promise<void> {
    try {
      if (logEntry.summaryData.data.lpmediosDetected > 0) {
        return;
      }
      const cleanRut = rut.replace(/\./g, '').toUpperCase();
      const lpmediosCollection = mongoose.connection.db.collection('lpmedios');
      console.warn(`[RutController.lookupRut] - Lpmedios check for RUT ${rut} - Tenant ${tenantId}`);

      const lpmediosRecords = await lpmediosCollection.find({
        rut: cleanRut,
        tenant: tenantId
      }).toArray();

      if (!logEntry.summaryData) {
        logEntry.summaryData = { data: {} };
      } else if (!logEntry.summaryData.data) {
        logEntry.summaryData.data = {};
      }

      logEntry.summaryData.data.lpmediosDetected = lpmediosRecords.length > 0;
      logEntry.summaryData.data.lpmediosRecords = lpmediosRecords || [];
      console.log(`[RutController.lookupRut] - Lpmedios check for tenant ${tenantId}: ${lpmediosRecords.length} records found`);
    } catch (error) {
      console.error(`[RutController.lookupRut] - Error checking lpmedios collection:`, error);
      if (!logEntry.summaryData) {
        logEntry.summaryData = { data: {} };
      } else if (!logEntry.summaryData.data) {
        logEntry.summaryData.data = {};
      }
      logEntry.summaryData.data.lpmediosDetected = false;
    }
  }

  // Apply SII representante legal into companyGeneralInfo with sensible defaults
  static applyRepresentanteLegalFromSii(logEntry: any, companyGeneralInfo: any): void {
    try {
      const representanteLegal = logEntry?.summaryData?.data?.sii?.representanteLegal;
      if (representanteLegal) {
        companyGeneralInfo.rapresentanteLegal = representanteLegal;
      } else {
        console.log(381, "No hay representante legal");
        companyGeneralInfo.rapresentanteLegal = "No hay informacion";
        companyGeneralInfo.rapresentanteLegalRut = "No hay informacion";
      }
    } catch (error) {
      console.error(`[RutController.applyRepresentanteLegalFromSii] Error applying representante legal:`, error);
      companyGeneralInfo.rapresentanteLegal = "No hay informacion";
      companyGeneralInfo.rapresentanteLegalRut = "No hay informacion";
    }
  }

  // Extract fecha de constitución from empresaEnUnDia array in mallaSocietariaData
  static applyFechaDeConstitucionFromEmpresaEnUnDia(filteredDetails: any, companyGeneralInfo: any): void {
    try {
      const empresaEnUnDia = filteredDetails?.mallaSocietariaData?.empresaEnUnDia;
      if (Array.isArray(empresaEnUnDia)) {
        const constitucion = empresaEnUnDia.find((item: any) => item?.actuacion === 'CONSTITUCIÓN' && item?.fecha);
        if (constitucion && constitucion.fecha) {
          companyGeneralInfo.fechaDeConstitucion = constitucion.fecha;
          console.warn(`[RutController.applyFechaDeConstitucionFromEmpresaEnUnDia] - Found fecha de constitución: ${constitucion.fecha}`);
          return;
        }
      }
      // Fallback: keep existing value or set default if missing
      if (!companyGeneralInfo.fechaDeConstitucion) {
        companyGeneralInfo.fechaDeConstitucion = 'No hay informacion';
      }
    } catch (error) {
      console.error(`[RutController.applyFechaDeConstitucionFromEmpresaEnUnDia] Error extracting fecha:`, error);
      if (!companyGeneralInfo.fechaDeConstitucion) {
        companyGeneralInfo.fechaDeConstitucion = 'No hay informacion';
      }
    }
  }

  // Extract fecha de constitución from Diario Oficial (max 10 items)
  static applyFechaDeConstitucionFromDiarioOficial(filteredDetails: any, companyGeneralInfo: any): void {
    try {
      const diarioOficial = filteredDetails?.mallaSocietariaData?.diarioOficial;
      if (Array.isArray(diarioOficial) && !companyGeneralInfo.fechaDeConstitucion) {
        for (let i = 0; i < diarioOficial.length && i < 10; i++) {
          const item = diarioOficial[i];
          if (item?.seccion === 'CONSTITUCIÓN' && item?.fecha) {
            companyGeneralInfo.fechaDeConstitucion = item.fecha;
            console.warn(`[RutController.applyFechaDeConstitucionFromDiarioOficial] - Found fecha de constitución: ${item.fecha}`);
            break;
          }
        }
      }
      if (!companyGeneralInfo.fechaDeConstitucion) {
        companyGeneralInfo.fechaDeConstitucion = 'No hay informacion';
      }
    } catch (error) {
      console.error(`[RutController.applyFechaDeConstitucionFromDiarioOficial] Error extracting fecha:`, error);
      if (!companyGeneralInfo.fechaDeConstitucion) {
        companyGeneralInfo.fechaDeConstitucion = 'No hay informacion';
      }
    }
  }

  // Extract fecha de constitución from Empresa En Un Día cases found in logEntry
  static applyFechaDeConstitucionFromEmpresaEnUnDiaCases(logEntry: any, companyGeneralInfo: any): void {
    try {
      const cases = logEntry?.summaryData?.data?.empresaEnUnDiaCases;
      if (Array.isArray(cases) && !companyGeneralInfo.fechaDeConstitucion) {
        for (let i = 0; i < cases.length; i++) {
          const actuacion = cases[i];
          if (actuacion?.actuacion === 'CONSTITUCIÓN' && actuacion?.fecha) {
            companyGeneralInfo.fechaDeConstitucion = actuacion.fecha;
            console.warn(`[RutController.applyFechaDeConstitucionFromEmpresaEnUnDiaCases] - Found fecha de constitución: ${actuacion.fecha}`);
            break;
          }
        }
      }
      if (!companyGeneralInfo.fechaDeConstitucion) {
        companyGeneralInfo.fechaDeConstitucion = 'No hay informacion';
      }
    } catch (error) {
      console.error(`[RutController.applyFechaDeConstitucionFromEmpresaEnUnDiaCases] Error extracting fecha:`, error);
      if (!companyGeneralInfo.fechaDeConstitucion) {
        companyGeneralInfo.fechaDeConstitucion = 'No hay informacion';
      }
    }
  }

  // Extract socios from Equifax response and normalize their RUTs
  static extractSociosFromEquifax(equifaxData: any): { name: string; rut: string; personType?: string; isNaturalPerson?: boolean }[] {
    try {
      const sociosRaw = Array.isArray(equifaxData?.socios) ? equifaxData.socios : [];
      let socios = sociosRaw.map((socio: any) => {
        const rawType = String(socio?.typePartner ?? socio?.type ?? socio?.tipo ?? '').toLowerCase();
        const isNatural = rawType ? rawType.includes('natural') : undefined;
        return {
          name: socio?.namePartner ?? socio?.socio ?? '',
          rut: RutController.normalizeRut(String(socio?.rutPartner ?? socio?.rut ?? '')),
          personType: rawType || undefined,
          isNaturalPerson: typeof isNatural === 'boolean' ? isNatural : undefined,
        };
      });
      const sociosLimit = Number(process.env.SOCIOS_LIMIT || 10);
      if (socios.length > sociosLimit) {
        socios = socios.slice(0, sociosLimit);
      }
      return socios;
    } catch (err) {
      console.warn('extractSociosFromEquifax failed', err);
      return [];
    }
  }

  // Extract socios from society mesh external and normalize their RUTs
  static extractSociosFromSheriff(filteredDetails: any): { name: string; rut: string; personType?: string; isNaturalPerson?: boolean }[] {
    try {
      if (!filteredDetails?.societyMeshExternal || filteredDetails.societyMeshExternal.length < 1) {
        console.warn('No socios found in societyMeshExternal', filteredDetails);
        return [];
      }
      if (filteredDetails.compliancePersonType === 'natural') {
        return [];
      }
      console.log(353, filteredDetails.societyMeshExternal);
      const sociosRaw = filteredDetails.societyMeshExternal[0]?.socios ?? [];
      let socios = sociosRaw.map((socio: any) => {
        const rawType = String(socio?.tipo ?? socio?.type ?? '').toLowerCase();
        const isNatural = rawType ? rawType.includes('natural') : undefined;
        return {
          name: socio.socio,
          rut: RutController.normalizeRut(String(socio.rut ?? '')),
          personType: rawType || undefined,
          isNaturalPerson: typeof isNatural === 'boolean' ? isNatural : undefined,
        };
      });
      const sociosLimit = Number(process.env.SOCIOS_LIMIT || 10);
      if (socios.length > sociosLimit) {
        socios = socios.slice(0, sociosLimit);
      }
      return socios;
    } catch (err) {
      console.warn('extractSociosFromSheriff failed', err);
      return [];
    }

  }

  static async lookupRut(req: AuthenticatedRequest, res: Response) {
    const startTime = performance.now();
    
    // 1. Log di ingresso
    RutController.logDebug('ENTRY', {
      params: {
        ...req.body,
        rut: req.body.rut ? `${req.body.rut.substring(0, 3)}...` : undefined // Mask sensitive RUT
      },
      tenantId: req.user?.tenant,
      userId: req.user?.id
    });

    try {
      const testNotRefresh = false;
      //TODO check better the way of refresh and delete 
      let refresh = false;
      RutController.logDebug('REQUEST_BODY', req.body);
      // Use validated data to derive refresh state consistently
      const validatedData = rutLookupSchema.parse(req.body);
      
      // Normalize RUT consistently
      validatedData.rut = RutController.normalizeRut(validatedData.rut);
      
      RutController.logDebug('NORMALIZED_DATA', { 
        rut: validatedData.rut,
        isMonitoring: validatedData.isMonitoring,
        isRefreshing: validatedData.isRefreshing
      });

      refresh = validatedData.isMonitoring || validatedData.isRefreshing;

      if (!testNotRefresh && refresh) {
        RutController.logDebug('REFRESH_ARCHIVE_START', { rut: validatedData.rut, tenantId: req.user?.tenant });
        const archiveResult = await Result.updateMany(
          { rut: validatedData.rut, tenantId: req.user?.tenant, archived: { $ne: true } },
          { $set: { archived: true, archivedAt: new Date() } }
        );
        console.log("[REFRESH] Archived previous results for RUT:", validatedData.rut, "Count:", archiveResult.modifiedCount);
        RutController.logDebug('REFRESH_ARCHIVE_END', { archivedCount: archiveResult.modifiedCount });
      } else {
        console.warn(59, "************************ lookupRut not refresh test", validatedData);
      }
      
      RutController.logDebug('CHECK_EXISTING_START', { rut: validatedData.rut });
      const existingResult = await Result.findOne({ rut: validatedData.rut, tenantId: req.user?.tenant, archived: { $ne: true } }).sort({ createdAt: -1 });
      
      if (existingResult && !refresh) {
        console.warn(503, "[NO REFRESH] Existing result found for RUT:", validatedData.rut);
        RutController.logDebug('EXIT_EXISTING_FOUND', { 
          resultId: existingResult._id,
          processingTime: `${(performance.now() - startTime).toFixed(3)}ms`
        });
        return res.status(200).json(existingResult);
      }
      RutController.logDebug('CHECK_EXISTING_END', { found: !!existingResult, refresh });

      // Avoid extra deletions; previous results are only deleted on explicit refresh/monitoring
      const previousRisk = existingResult?.riskAssessment;
      if (previousRisk) {
        console.log(72, "previous risk", previousRisk);
      }

      // Get tenant ID from authenticated user
      const tenantId = req.user?.tenant;
      if (!tenantId) {
        RutController.logDebug('EXIT_ERROR_AUTH', { error: 'Tenant information missing' }, 'warn');
        return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
      }

      // Credit system: do not deduct when isPep; otherwise deduct for normal lookup and user-initiated refresh, skip for monitoring
      const shouldDeductCredits = !validatedData.isPep && (validatedData.isRefreshing || !refresh);
      let creditPrecheckPassed = false;
      let finalCreditDeducted = false;
      const userId = req.user?.id;

      if (!userId) {
        console.error('[CREDIT_SYSTEM] ERROR: User ID missing from authenticated request');
        RutController.logDebug('EXIT_ERROR_AUTH', { error: 'User ID missing' }, 'error');
        return res.status(401).json({ message: 'Authentication required: User information missing' });
      }

      RutController.logDebug('CREDIT_PRECHECK_START', { shouldDeductCredits, availableCredits: 'CHECKING' });

      if (shouldDeductCredits) {
        try {
          console.log('[CREDIT_SYSTEM] Performing credit precheck for RUT lookup. Tenant:', tenantId, 'User:', userId, 'RUT:', validatedData.rut);
          const tenant = await Tenant.findById(tenantId);
          if (!tenant) {
            console.error('[CREDIT_SYSTEM] ERROR: Tenant not found for ID:', tenantId);
            return res.status(404).json({ message: 'Tenant not found' });
          }

          const availableCredits = tenant.creditBalance.availableCredits;
          console.log('[CREDIT_SYSTEM] Current available credits:', availableCredits, 'Credits needed: 1');

          if (availableCredits < 1) {
            console.error('[CREDIT_SYSTEM] ERROR: Insufficient credits for RUT lookup. Available:', availableCredits);
            RutController.logDebug('EXIT_INSUFFICIENT_CREDITS', { availableCredits }, 'warn');
            return res.status(402).json({
              message: 'Crediti insufficienti per eseguire la ricerca RUT',
              availableCredits: availableCredits,
              creditsNeeded: 1
            });
          }

          creditPrecheckPassed = true;
          console.log('[CREDIT_SYSTEM] Credit precheck passed. Deduction will occur at end upon success.');
          RutController.logDebug('CREDIT_PRECHECK_PASSED', { availableCredits });
        } catch (creditError) {
          console.error('[CREDIT_SYSTEM] ERROR during credit precheck for RUT lookup:', creditError);
          RutController.logDebug('CREDIT_PRECHECK_ERROR', { error: creditError }, 'error');
          return res.status(500).json({
            message: 'Errore nel sistema di crediti',
            error: creditError instanceof Error ? creditError.message : 'Unknown error'
          });
        }
      } else {
        RutController.logDebug('CREDIT_PRECHECK_SKIPPED', { reason: validatedData.isPep ? 'isPep' : 'isRefresh/Monitoring' });
        if (validatedData.isPep) {
          console.log('[CREDIT_SYSTEM] Skipping credit precheck/deduction due to PEP-only evaluation');
        } else if (validatedData.isRefreshing) {
          console.log('[CREDIT_SYSTEM] Skipping credit precheck/deduction for refreshing request');
        } else {
          console.log('[CREDIT_SYSTEM] Skipping credit precheck/deduction for refresh/monitoring request');
        }
      }

      /* AV new version sheriffv2
      const sheriffService = SheriffService.getInstance();
      const initialLogEntry = await sheriffService.queryRut(validatedData, tenantId, refresh);
      let logEntry = { ...initialLogEntry };
      */
      let logEntry = {};

      //add companyGeneralInfo to logEntry
      (logEntry as any).companyGeneralInfo = null;
      //add filteredDetails to logEntry
      (logEntry as any).filteredDetails = null;
      //we need to call equifax service here
      let companyGeneralInfo = { rapresentanteLegal: "N/D", rapresentanteLegalRut: "N/D", inicioActividades: "", fechaDeConstitucion: "", empresaMenor: "", razonSocial: "", socios: [] as { name: string; rut: string }[], administradores: [] as any[], rangoVentas: "", tamanoEmpresa: "", iconImpresa: "" };

      //console.log(540,logEntry);

      const sheriffV2 = sheriffV2Service.getInstance();
      RutController.logDebug('SHERIFF_CALL_START', { rut: validatedData.rut });
      const newSheriff = await sheriffV2.queryRut({ rut: validatedData.rut, isMonitoring: false }, tenantId, false);
      RutController.logDebug('SHERIFF_CALL_END', { success: (newSheriff as any)?.success });

      //console.warn(586, "-------------------- newSheriff", newSheriff);

      const resumen = (newSheriff as any)?.resumen?.data ?? {};
      // const summarySheriff = logEntry.summaryData;
      if (logEntry) {
        (logEntry as any).rut = (newSheriff as any)?.resumen?.data?.rut;
      }
      const dataSii = resumen.identificacion ?? {};

      const creditScoring = (newSheriff as any)?.creditScore?.data ?? {};
      const filteredDetails = {
        rut: (newSheriff as any)?.resumen?.data?.rut,
        razonSocial: dataSii?.razonSocial,
        presentaActividades: dataSii?.presentaActividades,
        inicioActividades: dataSii?.inicioActividades,
        autorizadoMonedaExtranjera: dataSii?.autorizadoMonedaExtranjera,
        empresaMenor: dataSii?.empresaMenor,
        observaciones: dataSii?.observaciones,
        notas: dataSii?.notas,
        situacionActual: dataSii?.situacionActual,
        fetchedAt: new Date(),
        creditScoringData: creditScoring,
        compliance: (newSheriff as any)?.compliance?.data ?? {},
        boletinComercialSummary: (newSheriff as any)?.resumen?.boletinComercial ?? {},
        boletinLaboralSummary: (newSheriff as any)?.resumen?.data?.boletinLaboral ?? {},
        boletinLaboralLastUpdate: (newSheriff as any)?.resumen?.data?.boletinLaboral?.ultimaActualizacion,
        vehiclesSummary: (newSheriff as any)?.resumen?.data.bienes.vehiculos ?? {},
        propertiesSummary: (newSheriff as any)?.resumen?.data.bienes.propiedades ?? {},
        deudaBancariaSummary: (newSheriff as any)?.resumen.deudaBancaria ?? {},
        mallaSocietariaData: (newSheriff as any)?.legal?.mallaSocietaria.data ?? {},
        officialDiaryData: (newSheriff as any)?.legal?.mallaSocietaria.data.diarioOficial ?? {},
        civilCasesData: (newSheriff as any)?.judicial?.civil.data ?? {},
        laboralCasesData: (newSheriff as any)?.judicial?.laboral.data ?? {},

        cobranzaCasesData: (newSheriff as any)?.judicial?.cobranza.data ?? {},
        moraPrevisionalCasesData: (newSheriff as any)?.cobranzaLaboral?.moraPrevisional.data ?? {},
        multaLaboralCasesData: (newSheriff as any)?.cobranzaLaboral?.multaLaboral.data ?? {},

        commercialBulletinCasesData: {},

        timestampsSubHelpers: {},
        ratings: {},
        complianceId: {},
        complianceRisk: {},
        complianceCreatedAt: {},
        complianceUpdatedAt: {},
        complianceName: {},
        complianceSecondName: {},
        complianceSurname: {},
        complianceSecondSurname: {},
        complianceScrappedRutId: {},
        complianceUserId: {},
        complianceCorporationId: {},
        complianceSelectedRowsSocietaryMesh: {},
        complianceSelectedRowsNews: {},
        complianceLastDataUpdate: {},
        complianceSummary: {},
        societyMeshExternal: {},


        deudaPrevisionalPublicadaPersonaJuridica: 0,
        deudaPrevisionalPublicadaPersonaNatural: 0,
        protestosMorosidadesPersonaJuridica: 0,
        protestosMorosidadesPersonaNatural: 0,
        bolabTypePersonaJuridica: [],
        bolabTypePersonaNatural: [],
        bolabTypePersonaNaturalList: [],
        equifaxData: (logEntry as any).equifaxData,
        sheriffV2Data: newSheriff,
        allCallsSucceeded: (newSheriff as any)?.success ?? false,
      };
      if ((newSheriff as any)?.resumen.data.esPersonaJuridica) {
        (filteredDetails as any).compliancePersonType = "juridical";
      }
      else {
        (filteredDetails as any).compliancePersonType = "natural";
      }

      //AV sheriffV2
      if (newSheriff && (newSheriff as any).compliance) {
        console.warn(586, "-------------------- newSheriff", (newSheriff as any)?.compliance?.data);
        (filteredDetails as any).complianceSelectedRowsPepChile = (newSheriff as any)?.compliance?.data?.pepChile?.coincidencias || [];
        (filteredDetails as any).complianceSelectedRowsPublicOfficial = (newSheriff as any)?.compliance?.data?.funcionariosPublicos?.coincidencias || [];
        (filteredDetails as any).complianceSelectedRowsPepChileFamily = (newSheriff as any)?.compliance?.data?.familiaresPep?.coincidencias || [];
        (filteredDetails as any).complianceSelectedRowsPenal = (newSheriff as any)?.compliance?.data?.penal?.coincidencias || [];
        (filteredDetails as any).complianceSelectedlistasInternacionales = (newSheriff as any)?.compliance?.data?.listasInternacionales?.coincidencias || [];
      } else {
        (filteredDetails as any).complianceSelectedRowsPepChile = [];
        (filteredDetails as any).complianceSelectedRowsPublicOfficial = [];
        (filteredDetails as any).complianceSelectedRowsPepChileFamily = [];
        (filteredDetails as any).complianceSelectedRowsPenal = [];
        (filteredDetails as any).complianceSelectedlistasInternacionales = [];
      }


      // console.warn(350, "filteredDetails", filteredDetails);
      // console.warn(595, "compliancePersonType", filteredDetails.equifaxData);
      //console.warn(580, "compliancePersonType", filteredDetails.compliancePersonType);
      const sheriffCompany = false;
      companyGeneralInfo.socios = [];

      const doIt = !validatedData.isPep;
      //        if (filteredDetails.compliancePersonType !== "natural" ) {
      if (doIt) {

        // implement here new equifax queryRut
        try {
          const equifaxService = EquifaxService.getInstance();
          const requestType = ((filteredDetails as any).compliancePersonType || '').toLowerCase() === 'natural' ? 'personal' : 'empresarial';
          const equifaxRequest = {
            rut: validatedData.rut,
            tenantId: tenantId,
            personalData: { requestType }
          };

          RutController.logDebug('EQUIFAX_CALL_START', { requestType });
          const equifaxResponse = await equifaxService.queryRut(equifaxRequest);
          RutController.logDebug('EQUIFAX_CALL_END', { success: equifaxResponse.success });
          
          // console.warn(611, 'Equifax query successful for RUT:', validatedData.rut, equifaxResponse);
          if (equifaxResponse.success && equifaxResponse.data) {
          //   console.warn(390, 'Equifax query successful for RUT:', validatedData.rut, equifaxResponse.data);
            companyGeneralInfo.socios = RutController.extractSociosFromEquifax(equifaxResponse.data);
            (logEntry as any).equifaxData = equifaxResponse.data;
            (filteredDetails as any).equifaxData = equifaxResponse.data;
            if (equifaxResponse.data.deudaPrevisionalPublicadaPersonaJuridica) {
              filteredDetails.deudaPrevisionalPublicadaPersonaJuridica = equifaxResponse.data.deudaPrevisionalPublicadaPersonaJuridica.totalBolab || 0;
            } else {
              filteredDetails.deudaPrevisionalPublicadaPersonaJuridica = 0;
            }
            if (equifaxResponse.data.deudaPrevisionalPublicadaPersonaNatural) {
              filteredDetails.deudaPrevisionalPublicadaPersonaNatural = equifaxResponse.data.deudaPrevisionalPublicadaPersonaNatural.totalBolab || 0;
            } else {
              filteredDetails.deudaPrevisionalPublicadaPersonaNatural = 0;
            }
            //need to convert to int
            if (equifaxResponse.data.protestosMorosidadesPersonaJuridica) {
              filteredDetails.protestosMorosidadesPersonaJuridica = parseInt(equifaxResponse.data.protestosMorosidadesPersonaJuridica) || 0;
            } else {
              filteredDetails.protestosMorosidadesPersonaJuridica = 0;
            }
            if (equifaxResponse.data.protestosMorosidadesPersonaNatural) {
              
              filteredDetails.protestosMorosidadesPersonaNatural = parseInt(equifaxResponse.data.protestosMorosidadesPersonaNatural) || 0;
            } else {
              filteredDetails.protestosMorosidadesPersonaNatural = 0;
            }
            if (equifaxResponse.data.bolabTypePersonaJuridica) {
              filteredDetails.bolabTypePersonaJuridica = equifaxResponse.data.bolabTypePersonaJuridica;
            } else {
              filteredDetails.bolabTypePersonaJuridica = [];
            }
            if (equifaxResponse.data.bolabTypePersonaNatural) {
              filteredDetails.bolabTypePersonaNatural = equifaxResponse.data.bolabTypePersonaNatural;
            } else {
              filteredDetails.bolabTypePersonaNatural = [];
            }
            if (equifaxResponse.data.getInformePlatinum360Response) {
              filteredDetails.bolabTypePersonaNaturalList = equifaxResponse.data.getInformePlatinum360Response.Credit.DebtsSummary.BOLAB.BOLABType;
            } else {
              filteredDetails.bolabTypePersonaNaturalList = [];
            }
            if (equifaxResponse.data.protestosMorosidadesPersonaNaturalList) {
              (filteredDetails as any).protestosMorosidadesPersonaNaturalList = equifaxResponse.data.protestosMorosidadesPersonaNaturalList;
            } else {
              (filteredDetails as any).protestosMorosidadesPersonaNaturalList = [];
            }

            //   console.warn(693, "bolabTypePersonaNaturalList", equifaxResponse.data);

          } else {
            console.warn('Equifax query failed for RUT:', validatedData.rut, 'Error:', equifaxResponse.error);
          }

          //  console.warn(625, "equifaxData", filteredDetails.equifaxData);
        } catch (equifaxError) {
          console.error('Error calling Equifax service for RUT:', validatedData.rut, equifaxError);
        }


      } else {
        console.warn("Skipping Equifax due to PEP-only evaluation");
      }



      if (companyGeneralInfo.socios.length === 0) {
        console.warn(660, "fallback socios from sheriff", (logEntry as any).empresaEnUnDiaSocios);
        companyGeneralInfo.socios = (logEntry as any).empresaEnUnDiaSocios || [];
      }

      companyGeneralInfo.administradores = [];
      console.log(298, "new socios", companyGeneralInfo.socios);

      // Call Dequienes solo per company
      if (!validatedData.isPep) {
        try {
          console.log(721, ">>>> start calling Dequienes service for RUT:", validatedData.rut);
          const dequienesService = DequienesService.getInstance();
          RutController.logDebug('DEQUIENES_RELATIONSHIPS_START', { rut: validatedData.rut });
          const deqRes = await dequienesService.queryRelationships({
            rut: validatedData.rut,
            tenantId: tenantId,
            distance: 2,
            relationshipDirection: 'BOTH',
            onePathPerNode: false
          });
          RutController.logDebug('DEQUIENES_RELATIONSHIPS_END', { success: deqRes.success });
          
          if (deqRes.success && deqRes.data) {
            //  console.warn(730, ">>>> dequens", deqRes.data);
            (filteredDetails as any).dequienesRelationships = deqRes.data;
          } else {
            console.warn(732, ">>>> dequens fail", deqRes);
          }
          try {
            RutController.logDebug('DEQUIENES_LEGAL_EVENTS_START', { rut: validatedData.rut });
            const legalRes = await dequienesService.queryLegalEvents({ rut: validatedData.rut, tenantId });
            RutController.logDebug('DEQUIENES_LEGAL_EVENTS_END', { success: legalRes.success });
            
            if (legalRes.success && legalRes.data) {
              (filteredDetails as any).dequienesLegalEvents = legalRes.data;
              const rawDate = legalRes.data.constitution_date;
              if (rawDate && typeof rawDate === 'string') {
                const normalized = RutController.normalizeDate(rawDate);
                if (normalized && typeof normalized === 'string' && normalized.match(/^\d{4}-\d{2}-\d{2}$/)) {
                  if (!companyGeneralInfo.fechaDeConstitucion) {
                    companyGeneralInfo.fechaDeConstitucion = normalized;
                  }
                }
              }
            } else {
              console.warn('[Dequienes legal events] No data or unsuccessful response', legalRes);
            }
          } catch (deqLegalError) {
            console.error('Error calling Dequienes legal events for RUT:', validatedData.rut, deqLegalError);
          }
        } catch (deqError) {
          console.error('Error calling Dequienes service for RUT:', validatedData.rut, deqError);
        }
      }



      const newLogEntry = new logSherifData({ sheriffLogData: logEntry });
      console.warn(1086, "save newLogEntry");
      await newLogEntry.save();
      //-----------------------------------------------------------------------------
      // Esegui controlli leggi e liste proprie solo per company
      let cleanRut = validatedData.rut.replace(/\./g, '').toUpperCase();
      if (!validatedData.isPep) {
        // Ley21121
        await RutController.checkLey21121AndFlag(validatedData.rut, logEntry);
        // Ley20393
        await RutController.checkLey20393AndFlag(validatedData.rut, logEntry);
        // Liste proprie
        await RutController.checkLpaltosAndFlag(validatedData.rut, tenantId, logEntry);
        await RutController.checkLpmediosAndFlag(validatedData.rut, tenantId, logEntry);
      }


      if (!validatedData.isPep) {
        // check socios lists only in company mode
        for (const socio of companyGeneralInfo.socios) {
          if (socio.rut) {
            await RutController.checkLpaltosAndFlag(socio.rut, tenantId, logEntry);
          }
        }
        for (const socio of companyGeneralInfo.socios) {
          if (socio.rut) {
            await RutController.checkLpmediosAndFlag(socio.rut, tenantId, logEntry);
          }
        }
      }


      const openAIService = OpenAIService.getInstance();

      //-----------------------------------------------------------------------------
      //we call the risk calculation service to get the risk assessment
      (logEntry as any).companyGeneralInfo = companyGeneralInfo;
      (logEntry as any).filteredDetails = filteredDetails;
      let riskData: any = null;
      let riskAssessment: any = null;
      if (!validatedData.isPep) {
        RutController.logDebug('RISK_CALCULATION_START');
        riskData = await RiskCalculationService.calculateRisk(logEntry as ISheriffDataLog);
        RutController.logDebug('RISK_CALCULATION_END', { riskLevel: riskData?.riskSummary?.semaphore });
        riskAssessment = { ...riskData };
        if (!riskData) {
          return res.status(404).json({
            error: 'Summary data not found for the given RUT.',
            sheriffLogData: logEntry
          });
        }

        //console.warn(701, "rutController", riskData);
        if (!validatedData.isPep) {
          RutController.applyRepresentanteLegalFromSii(logEntry, companyGeneralInfo);
          //   console.log(772, "companyGeneralInfo", companyGeneralInfo);
          // Fecha de constitución desde empresaEnUnDia
          RutController.applyFechaDeConstitucionFromEmpresaEnUnDia(filteredDetails, companyGeneralInfo);

          // Fecha de constitución desde Diario Oficial
          RutController.applyFechaDeConstitucionFromDiarioOficial(filteredDetails, companyGeneralInfo);

          // Always set inicio de actividades from SII
          companyGeneralInfo.inicioActividades = filteredDetails.inicioActividades;

          // Fecha de constitución desde Empresa En Un Día (logEntry)
          RutController.applyFechaDeConstitucionFromEmpresaEnUnDiaCases(logEntry, companyGeneralInfo);

          companyGeneralInfo.empresaMenor = filteredDetails.empresaMenor;
          companyGeneralInfo.razonSocial = filteredDetails.razonSocial;
          companyGeneralInfo.rangoVentas = (newSheriff as any)?.resumen?.tamanoEmpresaSii?.ventasAnuales ?? null;
          companyGeneralInfo.tamanoEmpresa = (newSheriff as any)?.resumen?.tamanoEmpresaSii?.tamanoEmpresa ?? null;
          (companyGeneralInfo as any).cantidadTrabajadores = (newSheriff as any)?.resumen?.tamanoEmpresaSii?.cantidadTrabajadores ?? null;
          companyGeneralInfo.iconImpresa = "";

          /*
          companyGeneralInfo.rangoVentas = logEntry.summaryData?.data?.siiBusinessSize?.annualSales;
          companyGeneralInfo.tamanoEmpresa = logEntry.summaryData?.data?.siiBusinessSize?.textSize;
          companyGeneralInfo.iconImpresa = logEntry.summaryData?.data?.siiBusinessSize?.icon;
          */

          companyGeneralInfo.administradores.forEach((administrador: any) => {
            if (administrador.socio) {
              administrador.name = administrador.socio;
            } else if (administrador.nombre) {
              administrador.name = administrador.nombre;
            } else if (administrador.administrador) {
              administrador.name = administrador.administrador;
            }
          })
        }

        // Use class-level date normalizer for consistent formatting

        // Apply normalization to both dates
        if (!validatedData.isPep) {
          companyGeneralInfo.fechaDeConstitucion = RutController.normalizeDate(companyGeneralInfo.fechaDeConstitucion);
          companyGeneralInfo.inicioActividades = RutController.normalizeDate(companyGeneralInfo.inicioActividades);
        }

        // Use class-level sanitizer for consistent data limiting and normalization
        const sanitizeData = (data: any, maxSize: number = 15000000, path: string = 'root', visited: WeakSet<object> = new WeakSet()): any => {
          return RutController.sanitizeData(data, maxSize, path, visited);
        };
      } else {
        console.warn('[RutController.lookupRut] Skipping calculateRisk due to PEP-only evaluation');
        riskAssessment = null;
      }
      const pepChileRule = riskData?.allRules?.complianceRules?.find((rule: any) => rule.label === 'PEP Chile');
      const familiaresPepRule = riskData?.allRules?.complianceRules?.find((rule: any) => rule.label === 'Familiares PEP');
      const computedIsPep = !!(pepChileRule?.detected || familiaresPepRule?.detected);

      const comp = (newSheriff as any)?.compliance?.data ?? {}
      const isPepFromCompliance = !!(
        (comp?.selectedRowsPepChile && comp.selectedRowsPepChile.length > 0) ||
        (comp?.selectedRowsPepChileFamily && comp.selectedRowsPepChileFamily.length > 0) ||
        (comp?.selectedRowsPublicOfficial && comp.selectedRowsPublicOfficial.length > 0)
      );

      const endTime = performance.now();
      const processingTime = (endTime - startTime).toFixed(3) + 'ms';

      let userEmail = req.user?.email;
      if (!userEmail && req.user?.id) {
        try {
          const user = await User.findById(req.user.id);
          userEmail = user?.email;
        } catch (e) {
          console.warn('Failed to fetch user email', e);
        }
      }

      const dataResponse = {
        rut: (logEntry as any).rut,
        tenantId,
        sheriffLogData: RutController.sanitizeData(logEntry, 15000000, 'sheriffLogData'),
        previousRisk: previousRisk,
        riskAssessment: riskAssessment ? RutController.sanitizeData(riskAssessment, 5000000, 'riskAssessment') : null,
        details: RutController.sanitizeData(filteredDetails, 15000000, 'details'),
        companyGeneralInfo: validatedData.isPep ? null : RutController.sanitizeData(companyGeneralInfo, 5000000, 'companyGeneralInfo'),
        isPep: computedIsPep || isPepFromCompliance,
        createdAt: new Date(),
        updatedAt: new Date(),
        userEmail: userEmail,
        status: 200,
        queryType: validatedData.isPep ? 'derived_socio_pep' : 'primary',
        type: validatedData.type,
        processingTime,
        creditsConsumed: shouldDeductCredits ? 1 : 0
      };
      // Recursively truncate arrays exceeding 100 elements
      RutController.truncateArraysRecursively(dataResponse, 100);
      const newResult = new Result(dataResponse);
      RutController.logDebug('SAVE_RESULT_START');
      if(newResult.queryType === "primary"){
        newResult.isPep = false;
      }
      console.warn(1087, "save newResult", newResult);
      await newResult.save();
      RutController.logDebug('SAVE_RESULT_END', { resultId: newResult._id });
 
      if (riskData && riskData.riskSummary && !validatedData.isPep) {
        const companyRisksData = {
          rut: (logEntry as any).rut,
          tenantId,
          newSummaryData: RutController.sanitizeData(riskData.riskSummary, 5000000, 'newSummaryData'),
          duxiterRiskLevel: riskData.riskSummary?.semaphore,
          duxiterRiskData: RutController.sanitizeData(riskData, 5000000, 'duxiterRiskData'),
          duxiterRiskList: RutController.sanitizeData({
            compliance: riskData.allRules?.complianceRules || [],
            legal: riskData.allRules?.legalRules || [],
            capitalHumano: riskData.allRules?.capitalHumanoRules || [],
            financieroTributario: riskData.allRules?.financieroTributarioRules || []
          }, 5000000, 'duxiterRiskList'),
          riskAssessment: RutController.sanitizeData({
            globalSemaphore: riskData.riskSummary?.semaphore,
            riskData: riskData
          }, 5000000, 'riskAssessment'),
          resultId: newResult._id,
          sheriffLogId: (logEntry as any)._id
        };

        RutController.truncateArraysRecursively(companyRisksData, 100);

        const companyRisks = new CompanyRisks(companyRisksData);
        Object.entries(companyRisks.toObject()).forEach(([key, value]) => {
          if (value && typeof value === 'object' && 'truncated' in value) {
            console.warn(`[RutController.lookupRut] Truncated risk data in ${key}:`, value);
          }
        });
        console.warn(1086, "save companyRisk");
        RutController.logDebug('SAVE_COMPANY_RISKS_START');
        await companyRisks.save();
        RutController.logDebug('SAVE_COMPANY_RISKS_END');
      }

      if (riskData && riskData.riskSummary && !validatedData.isPep) {
        try {
          const summaryContent = `Resumen automático generado para ${filteredDetails?.razonSocial || 'empresa'} (RUT: ${(logEntry as any).rut})\n\nNivel de Riesgo: ${riskData.riskSummary?.riskLevelDescription || 'No determinado'}\nSemáforo: ${riskData.riskSummary?.semaphore || 'No determinado'}\n\nEste resumen fue generado automáticamente al completar la evaluación.`;

          const metadata: any = {
            analysisDate: new Date(),
            resultId: newResult._id,
            fullCompanyDetails: filteredDetails || {},
            riskAssessment: riskAssessment || {},
            sheriffLogData: logEntry || {},
    
            duxiterRiskLevel: riskData.riskSummary?.semaphore || '',
            duxiterRiskData: riskData || {},
            duxiterRiskList: {
              compliance: riskData.allRules?.complianceRules || [],
              legal: riskData.allRules?.legalRules || [],
              capitalHumano: riskData.allRules?.capitalHumanoRules || [],
              financieroTributario: riskData.allRules?.financieroTributarioRules || []
            },
            newSummaryData: riskData.riskSummary || {},
            autoGenerated: true
          };

          if (filteredDetails?.razonSocial) {
            metadata.companyName = filteredDetails.razonSocial;
          }
          if (riskData.riskSummary?.riskLevelDescription) {
            metadata.riskLevel = riskData.riskSummary.riskLevelDescription;
          }
          if (dataSii?.actividadEconomica) {
            metadata.businessActivity = dataSii.actividadEconomica;
          }
          if (filteredDetails?.inicioActividades) {
            metadata.constitutionDate = filteredDetails.inicioActividades;
          }

          const mustSaveSummary = false;

          if (mustSaveSummary) {
            // Check if a summary already exists for this RUT and tenant
            const existingSummary = await Summary.findOne({
              rut: (logEntry as any).rut,
              tenantId: tenantId,
              summaryType: 'evaluation-result'
            }).sort({ createdAt: -1 });

            if (existingSummary) {
              // Update existing summary
              existingSummary.content = summaryContent;
              existingSummary.metadata = metadata;
              console.warn(1086, "save existingSummary");

              RutController.logDebug('SAVE_SUMMARY_UPDATE_START');
              await existingSummary.save();
              RutController.logDebug('SAVE_SUMMARY_UPDATE_END');
              console.log(`[RutController.lookupRut] Updated existing evaluation summary for RUT: ${(logEntry as any).rut}`);
            } else {
              // Create new summary document
              const newSummary = new Summary({
                rut: (logEntry as any).rut,
                tenantId: tenantId,
                summaryType: 'evaluation-result',
                content: summaryContent,
                metadata: metadata
              });
              console.warn(1086, "save newSummary");
              RutController.logDebug('SAVE_SUMMARY_CREATE_START');
              await newSummary.save();
              RutController.logDebug('SAVE_SUMMARY_CREATE_END');
              console.log(`[RutController.lookupRut] Created new evaluation summary for RUT: ${(logEntry as any).rut}`);
            }
          }

        } catch (summaryError) {
          console.error(`[RutController.lookupRut] Error creating evaluation summary for RUT ${(logEntry as any).rut}:`, summaryError);
          // Don't fail the main request if summary creation fails
        }
      }
      // Perform final credit deduction only if everything above succeeded
      try {
        if (shouldDeductCredits && creditPrecheckPassed) {
          console.log('[CREDIT_SYSTEM] Attempting final credit deduction after successful lookup.');
          RutController.logDebug('FINAL_CREDIT_DEDUCTION_START');
          const tenant = await Tenant.findById(tenantId);
          if (!tenant) {
            console.error('[CREDIT_SYSTEM] ERROR: Tenant not found at final deduction stage:', tenantId);
            RutController.logDebug('FINAL_CREDIT_DEDUCTION_ERROR', { error: 'Tenant not found' }, 'error');
          } else {
            const availableCredits = tenant.creditBalance.availableCredits;
            if (availableCredits >= 1) {
              const newBalance = availableCredits - 1;
              const updateResult = await Tenant.findByIdAndUpdate(
                tenantId,
                {
                  'creditBalance.availableCredits': newBalance,
                  'creditBalance.totalCreditsUsed': tenant.creditBalance.totalCreditsUsed + 1,
                  'creditBalance.lastCreditOperation': new Date(),
                  updatedAt: new Date()
                }
              );
              if (!updateResult) {
                console.error('[CREDIT_SYSTEM] Final credit deduction failed: tenant update returned null');
                RutController.logDebug('FINAL_CREDIT_DEDUCTION_ERROR', { error: 'Update returned null' }, 'error');
              } else {
                const opType = validatedData.isRefreshing ? 'user_refresh' : 'rut_lookup';
                const creditOperation = await CreditOperation.create({
                  tenantId: new mongoose.Types.ObjectId(tenantId),
                  userId: new mongoose.Types.ObjectId(userId),
                  operationType: opType,
                  creditsChanged: -1,
                  balanceAfter: newBalance,
                  description: opType === 'user_refresh' ? `Refresh Fast-Check per ${validatedData.rut}` : `Ricerca RUT per ${validatedData.rut}`,
                  metadata: {
                    rut: validatedData.rut,
                    operationType: opType
                  }
                });
                console.log('[CREDIT_SYSTEM] Final credit operation recorded with ID:', creditOperation._id);
                RutController.logDebug('FINAL_CREDIT_DEDUCTION_SUCCESS', { operationId: creditOperation._id, newBalance });
                finalCreditDeducted = true;
              }
            } else {
              console.error('[CREDIT_SYSTEM] Final credit deduction skipped: insufficient credits at deduction time');
              RutController.logDebug('FINAL_CREDIT_DEDUCTION_SKIPPED', { reason: 'Insufficient credits', availableCredits }, 'warn');
            }
          }
        }
      } catch (finalCreditError) {
        console.error('[CREDIT_SYSTEM] ERROR during final credit deduction:', finalCreditError);
        RutController.logDebug('FINAL_CREDIT_DEDUCTION_ERROR', { error: finalCreditError }, 'error');
      }

      // Log successful consultation
      try {
        const processingTime = Date.now() - startTime;
        await ConsultaHistoryService.logIndividualConsulta(
          req,
          validatedData.rut,
          '/api/rut/lookup',
          200,
          {
            rut: dataResponse.rut,
            riskLevel: dataResponse.riskAssessment?.globalSemaphore || 'unknown',
            companyName: dataResponse.companyGeneralInfo?.razonSocial || 'unknown'
          },
          undefined, // errorMessage
          processingTime,
          finalCreditDeducted ? 1 : 0,
          {
            isRefresh: refresh,
            isMonitoring: validatedData.isMonitoring,
            isRefreshing: validatedData.isRefreshing,
            isPep: validatedData.isPep,
            hasExistingResult: !!existingResult,
            requestData: {
              rut: validatedData.rut,
              isMonitoring: validatedData.isMonitoring,
              isRefreshing: validatedData.isRefreshing,
              refresh,
              isPep: validatedData.isPep
            }
          }
        );
      } catch (logError) {
        console.error('[CONSULTA_HISTORY] Error logging successful consultation:', logError);
        RutController.logDebug('CONSULTA_HISTORY_LOG_ERROR', { error: logError }, 'warn');
        // Don't fail the main request if logging fails
      }
//      console.warn(1171, "filteredDetails", filteredDetails);
      
      RutController.logDebug('EXIT_SUCCESS', { 
        rut: validatedData.rut, 
        processingTime: `${(performance.now() - startTime).toFixed(3)}ms` 
      });
      return res.status(200).json(dataResponse);
      //END of block
    } catch (error) {
      // Log failed consultation
      try {
        const processingTime = Date.now() - startTime;
        const validatedData = req.body; // Use original body since validation might have failed
        const errorStatus = error instanceof z.ZodError ? 400 :
          (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_OUT_OF_RANGE') ? 413 : 500;

        await ConsultaHistoryService.logIndividualConsulta(
          req,
          validatedData?.rut || 'unknown',
          '/api/rut/lookup',
          errorStatus,
          undefined, // responseData
          error instanceof Error ? error.message : 'Unknown error',
          processingTime,
          0, // creditsUsed - no credits used on error
          {
            errorType: error instanceof z.ZodError ? 'validation' :
              (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_OUT_OF_RANGE') ? 'buffer_overflow' : 'internal',
            errorDetails: error instanceof z.ZodError ? error.errors : undefined,
            requestData: validatedData
          }
        );
      } catch (logError) {
        console.error('[CONSULTA_HISTORY] Error logging failed consultation:', logError);
        // Don't fail the error response if logging fails
      }

      RutController.logDebug('EXIT_ERROR', { 
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        processingTime: `${(performance.now() - startTime).toFixed(3)}ms`
      }, 'error');

      if (error instanceof z.ZodError) {
        console.error(`[RutController.lookupRut] Validation error:`, error.errors);
        return res.status(400).json({
          error: 'Validation error',
          details: error.errors
        });
      }

      console.error(`[RutController.lookupRut] Error processing request:`, error);
      console.error(`[RutController.lookupRut] Error stack:`, error instanceof Error ? error.stack : 'No stack trace available');
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_OUT_OF_RANGE') {
        console.error(`[RutController.lookupRut] Buffer overflow error detected. Path: ${(error as any).path || 'unknown'}, Size: ${(error as any).size || 'unknown'}`);
        return res.status(413).json({
          error: 'Data size exceeds processing limits',
          details: 'The request contains data that is too large to process'
        });
      }
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    //-------------------------------------------------------------------------------------


  }

  static async getRutResume(req: AuthenticatedRequest, res: Response) {
    const { rut } = req.params;
    try {
      if (!rut) {
        console.warn(`[${new Date().toISOString()}] [RutController.getRutResume] - RUT parameter is missing.`);
        return res.status(400).json({ error: 'RUT parameter is required.' });
      }

      // Fetch the latest log for this RUT
      const sheriffLog = await SheriffDataLog.findOne({ rut }).sort({ createdAt: -1 });

      if (!sheriffLog) {
        console.warn(`[${new Date().toISOString()}] [RutController.getRutResume] - No SheriffDataLog found for RUT: ${rut}`);
        return res.status(404).json({ error: `No data found for RUT: ${rut}. Please run the lookup first.` });
      }

      // --- PDF Download Logic ---
      let updatedLog = false;
      if (!sheriffLog.associatedPdfs) {
        sheriffLog.associatedPdfs = [];
      }

      // Assuming mallaSocietariaData.empresaEnUnDia is an array of objects with linkPdf
      // Adjust the path if the structure is different.
      const empresaEnUnDiaArray = sheriffLog.mallaSocietariaData?.empresaEnUnDia as any[];

      if (Array.isArray(empresaEnUnDiaArray)) {
        for (let i = 0; i < empresaEnUnDiaArray.length; i++) {
          const item = empresaEnUnDiaArray[i];
          const pdfUrl = item?.linkPdf;
          const docTitle = item?.nombreDocumento || `Document ${i + 1}`;
          const sourcePath = `mallaSocietariaData.empresaEnUnDia[${i}].linkPdf`;

          if (pdfUrl && typeof pdfUrl === 'string') {
            // Check if this PDF (by URL) has already been processed
            const existingPdf = sheriffLog.associatedPdfs.find(p => p.originalUrl === pdfUrl);
            if (existingPdf && (existingPdf.contentBase64 || existingPdf.error)) {
              continue; // Skip if already downloaded or error recorded
            }

            let pdfEntryIndex = sheriffLog.associatedPdfs.findIndex(p => p.originalUrl === pdfUrl);
            if (pdfEntryIndex === -1) {
              sheriffLog.associatedPdfs.push({ sourcePath, originalUrl: pdfUrl, documentTitle: docTitle });
              pdfEntryIndex = sheriffLog.associatedPdfs.length - 1;
            }
            const currentPdfEntry = sheriffLog.associatedPdfs[pdfEntryIndex];


            try {
              const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
              const contentType = response.headers['content-type'] || 'application/pdf';

              if (contentType.includes('pdf')) {
                currentPdfEntry.contentBase64 = Buffer.from(response.data, 'binary').toString('base64');
                currentPdfEntry.contentType = contentType;
                currentPdfEntry.downloadedAt = new Date();
                currentPdfEntry.error = undefined; // Clear previous error if any
                updatedLog = true;
              } else {
                console.warn(`[${new Date().toISOString()}] [RutController.getRutResume] - Downloaded content from ${pdfUrl} is not a PDF. Content-Type: ${contentType}`);
                currentPdfEntry.error = `Downloaded content is not a PDF (Content-Type: ${contentType})`;
                updatedLog = true;
              }
            } catch (downloadError) {
              console.error(`[${new Date().toISOString()}] [RutController.getRutResume] - Failed to download PDF from ${pdfUrl}:`, downloadError);
              currentPdfEntry.error = downloadError instanceof Error ? downloadError.message : String(downloadError);
              updatedLog = true;
            }
          }
        }
      }

      if (updatedLog) {
        console.warn(1086, "save sheriffLog");
        await sheriffLog.save();
      }
      // --- End PDF Download Logic ---

      const openAIService = OpenAIService.getInstance();
      // Pass the potentially updated sheriffLog (with PDF info) to OpenAI
      const sheriffService = SheriffService.getInstance();
      const riskAssessmentLevel = sheriffService.calculateRiskLevelFromSheriff(sheriffLog);

      // Get tenant ID from authenticated user
      const tenantId = req.user?.tenant;

      if (!tenantId) {
        return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
      }

      // Fetch company details and risks from the separate collections
      const companyDetails = await CompanyDetails.findOne({
        rut: rut,
        sheriffLogId: sheriffLog._id,
        tenantId
      }).sort({ createdAt: -1 });

      const companyRisks = await CompanyRisks.findOne({
        rut: rut,
        sheriffLogId: sheriffLog._id,
        tenantId
      }).sort({ createdAt: -1 });

      const detailsData = companyDetails ? companyDetails.toObject() : {};
      const risksData = companyRisks ? companyRisks.toObject() : {};

      const markdownResume = await openAIService.analyzeSheriffData(
        sheriffLog as ISheriffDataLog,
        { level: riskAssessmentLevel },
        detailsData,
        req.user?.tenant,
        req.user?.id
      );

      // Prepare the downloadable PDFs list for the frontend
      const downloadablePdfs = sheriffLog.associatedPdfs
        ?.filter(pdf => pdf.contentBase64 && pdf.contentType)
        .map(pdf => ({
          title: pdf.documentTitle || 'Documento',
          filename: `${(pdf.documentTitle || 'documento').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${rut}.pdf`,
          contentType: pdf.contentType,
          // Base64 content will be handled by frontend to create data URL
          // For security and efficiency, we might not send all base64 back in this specific response
          // if they are very large and numerous.
          // However, for simplicity now, we assume the frontend will parse the full sheriffLog if needed,
          // or we can explicitly send a subset of PDF info.
          // Let's send a simplified list of what's available.
          originalUrl: pdf.originalUrl, // For reference
          sourcePath: pdf.sourcePath, // For reference
          downloaded: true
        })) || [];

      const erroredPdfs = sheriffLog.associatedPdfs
        ?.filter(pdf => pdf.error)
        .map(pdf => ({
          title: pdf.documentTitle || 'Documento',
          originalUrl: pdf.originalUrl,
          error: pdf.error,
          downloaded: false
        })) || [];

      return res.status(200).json({
        rut: sheriffLog.rut,
        markdownResume,
        // We are sending the full sheriffLog so frontend can access base64 directly if needed
        // or just use the summary lists below.
        sheriffLogData: sheriffLog.toObject(), // Send the full log for frontend to pick base64
        availablePdfs: downloadablePdfs,
        failedPdfDownloads: erroredPdfs,
        companyDetails: detailsData, // Include the company details in the response
        companyRisks: risksData // Include the company risks in the response
      });

    } catch (error) {
      console.error(`[${new Date().toISOString()}] [RutController.getRutResume] - Error for RUT ${rut}:`, error);
      const message = error instanceof Error ? error.message : 'Unknown error during resume generation';
      return res.status(500).json({
        error: 'Internal server error',
        message: message
      });
    }
  }

  static async getAllSheriffLogs(req: AuthenticatedRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const rutFilterRaw = (req.query.rut as string) || undefined;
      const startDate = (req.query.startDate as string) || undefined;
      const endDate = (req.query.endDate as string) || undefined;

      // Normalize optional RUT: remove dots and uppercase, keep dash
      const rut = rutFilterRaw
        ? rutFilterRaw.replace(/[.\s]/g, '').toUpperCase()
        : undefined;

      // Get tenant ID from authenticated user
      const tenantId = req.user?.tenant;

      // Superuser: list across all tenants, optionally filtered
      if (req.user?.role === 'superuser') {
        const result = await SheriffService.getAllLogsAcrossTenants({ page, limit, rut, startDate, endDate });
        return res.status(200).json(result);
      }

      if (!tenantId) {
        return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
      }

      const result = await SheriffService.getAllLogs({ tenantId, page, limit, rut, startDate, endDate });

      return res.status(200).json(result);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [RutController.getAllSheriffLogs] - Error:`, error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  static async getSheriffLogDetail(req: AuthenticatedRequest, res: Response) {
    const { logId } = req.params;
    console.log(`[${new Date().toISOString()}] [RutController.getSheriffLogDetail] - Received request for logId: ${logId}`);
    try {
      if (!logId) {
        console.warn(`[${new Date().toISOString()}] [RutController.getSheriffLogDetail] - Log ID parameter is missing.`);
        return res.status(400).json({ error: 'Log ID parameter is required.' });
      }

      // Get tenant ID from authenticated user
      const tenantId = req.user?.tenant;

      // Superuser: fetch without tenant restriction
      let log: any | null;
      if (req.user?.role === 'superuser') {
        log = await SheriffService.getLogByIdAcrossTenants(logId);
      } else {
        if (!tenantId) {
          return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
        }
        log = await SheriffService.getLogById(logId, tenantId);
      }

      if (!log) {
        console.warn(`[${new Date().toISOString()}] [RutController.getSheriffLogDetail] - Sheriff log not found with ID: ${logId}`);
        return res.status(404).json({ error: `Sheriff log not found with ID: ${logId}` });
      }

      return res.status(200).json(log);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [RutController.getSheriffLogDetail] - Error for logId ${logId}:`, error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  static async getResults(req: AuthenticatedRequest, res: Response) {
    console.warn(`[${new Date().toISOString()}] [RutController.getResults] - Received request for results.`);
    try {
      const tenantId = req.user?.tenant;
      if (!tenantId) {
        return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
      }

      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const search = (req.query.search as string)?.trim() || '';
      const sortFieldInput = (req.query.sortField as string) || 'createdAt';
      const sortDirection = (req.query.sortDirection as string) === 'asc' ? 1 : -1;

      const sortFieldMap: Record<string, string> = {
        rut: 'rut',
        'details.razonSocial': 'details.razonSocial',
        razonSocial: 'details.razonSocial',
        createdAt: 'createdAt',
        riskLevel: 'riskAssessment.riskSummary.semaphore',
        'riskAssessment.riskSummary.semaphore': 'riskAssessment.riskSummary.semaphore',
        tag: 'isPep',
        isPep: 'isPep'
      };

      const resolvedSortField = sortFieldMap[sortFieldInput] || sortFieldInput;
      const allowedFields = new Set([
        'rut',
        'details.razonSocial',
        'createdAt',
        'riskAssessment.riskSummary.semaphore',
        'isPep'
      ]);
      const safeSortField = allowedFields.has(resolvedSortField) ? resolvedSortField : 'createdAt';
      const sort: any = { [safeSortField]: sortDirection };

      const filters: any = { tenantId };
      filters.isPep = { $ne: true };
      if (search) {
        const regexRut = new RegExp(search.replace(/[.\s]/g, '').replace(/-/g, ''), 'i');
        const regexName = new RegExp(search, 'i');
        filters.$or = [
          { rut: regexRut },
          { 'details.razonSocial': regexName }
        ];
      }

      const projection: any = {
        _id: 1,
        rut: 1,
        createdAt: 1,
        isPep: 1,
        archived: 1,
        archivedAt: 1,
        'details.razonSocial': 1,
        'riskAssessment.riskSummary.semaphore': 1
      };

      const total = await Result.countDocuments(filters);
      console.warn(`[${new Date().toISOString()}] [RutController.getResults] - Total results: ${total} filters: ${JSON.stringify(filters)}`);
      const items = await Result.find(filters)
        .select(projection)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec();

      // Link user notes to each result (by RUT and tenant)
      const ruts = Array.from(new Set((items || []).map((it: any) => it.rut).filter(Boolean)));
      const rutVariants = new Set<string>();
      for (const r of ruts) {
        const clean = (r || '').toString();
        rutVariants.add(clean);
        rutVariants.add(clean.replace(/-/g, ''));
      }

      let notesByRut: Record<string, { count: number; latest?: { note?: string; tags?: string[] }; allTags: Set<string> }> = {};
      if (rutVariants.size > 0) {
        const notes = await UserNote.find({ tenantId, rut: { $in: Array.from(rutVariants) } })
          .sort({ createdAt: -1 })
          .lean()
          .exec();

        for (const n of notes as any[]) {
          const keyNoDash = (n.rut || '').replace(/-/g, '');
          const current = notesByRut[keyNoDash];
          const tagsArr: string[] = Array.isArray(n.tags) ? n.tags : [];
          if (!current) {
            const tagSet = new Set<string>();
            for (const t of tagsArr) tagSet.add(t);
            notesByRut[keyNoDash] = { count: 1, latest: { note: n.note, tags: tagsArr }, allTags: tagSet };
          } else {
            current.count += 1;
            for (const t of tagsArr) current.allTags.add(t);
          }
        }
      }

      // Attach aggregated note info to each item
      for (const it of items as any[]) {
        const keyNoDash = (it.rut || '').replace(/-/g, '');
        const agg = notesByRut[keyNoDash];
        it.notesCount = agg?.count || 0;
        it.noteSummary = agg?.latest?.note || undefined;
        it.noteTags = agg ? Array.from(agg.allTags) : [];
        if (it.archived === undefined) it.archived = true;
      }

      return res.status(200).json({
        data: items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit))
        }
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [RutController.getResults] - Error:`, error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  static async getResultById(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    try {
      if (!id || id === 'undefined') {
        return res.status(400).json({ error: 'Result ID is required.' });
      }
      // Get tenant ID from authenticated user
      const tenantId = req.user?.tenant;

      if (!tenantId) {
        return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
      }

      const result = await Result.findOne({ _id: id, tenantId });
      if (!result) {
        return res.status(404).json({ error: 'Result not found' });
      }

      // Fetch associated company details and risks
      const companyDetails = await CompanyDetails.findOne({ resultId: id, tenantId });
      const companyRisks = await CompanyRisks.findOne({ resultId: id, tenantId });

      // Combine result with company details and risks
      const responseData = {
        ...result.toObject(),
        companyDetails: companyDetails ? companyDetails.toObject() : null,
        companyRisks: companyRisks ? companyRisks.toObject() : null
      };

      return res.status(200).json(responseData);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [RutController.getResultById] - Error:`, error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  static async getResultByRut(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const { rut } = req.params;
    try {
      // Get tenant ID from authenticated user
      const tenantId = req.user?.tenant;

      if (!tenantId) {
        console.error(1694, "tenantId not found in request", req.user);
        return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
      }
      /* *orig will get result only for this tenant 
            const result = await Result.findOne({
              $or: [{ rut: rut }, { rut: rut.replace('-', '') }],
              tenantId
            }).sort({ createdAt: -1 });
            if (!result) {
              return res.status(404).json({ error: 'Result not found' });
            }
      */
      //we are reciclyng result for any tenants
      const result = await Result.findOne({
        $or: [{ rut: rut }, { rut: rut.replace('-', '') }],
        archived: { $ne: true }
      }).sort({ createdAt: -1 });
      if (!result) {
        return res.status(404).json({ error: 'Result not found' });
      }
      //check if tenant is different
      if (result.tenantId !== tenantId) {
        //need to exclude _id to avoid duplication
        const resultObject = result.toObject();
        delete resultObject._id;
        delete (resultObject as any).createdAt;
        delete (resultObject as any).updatedAt;
        console.log(1009, "reciclying result for tenant", tenantId, "new ObjectId will be generated");

        // CRITICAL: Recalculate tenant-specific lista propia flags
        // These lists are tenant-specific and must ALWAYS be recalculated
        const cleanRut = rut.replace(/\./g, '').replace(/-/g, '');
        // Format RUT with dash for lpaltos/lpmedios queries (they store RUTs with dash)
        const rutWithDash = cleanRut.slice(0, -1) + '-' + cleanRut.slice(-1);

        // Log original flags from the recycled result
        const originalLpaltosDetected = resultObject.sheriffLogData?.summaryData?.data?.lpaltosDetected;
        const originalLpmediosDetected = resultObject.sheriffLogData?.summaryData?.data?.lpmediosDetected;
        console.log(`[LISTA_PROPIA_RECALC] 🔄 Starting recalculation for RUT: ${rutWithDash}`);
        console.log(`[LISTA_PROPIA_RECALC] 📋 Original result from tenant: ${result.tenantId}`);
        console.log(`[LISTA_PROPIA_RECALC] 🎯 Target tenant: ${tenantId}`);
        console.log(`[LISTA_PROPIA_RECALC] 📊 Original flags - lpaltosDetected: ${originalLpaltosDetected}, lpmediosDetected: ${originalLpmediosDetected}`);

        try {
          // Check if the RUT exists in the lpaltos collection (tenant-isolated)
          console.log(`[LISTA_PROPIA_RECALC] 🔍 Querying lpaltos collection for RUT: ${rutWithDash}, tenant: ${tenantId}`);
          const lpaltosCollection = mongoose.connection.db.collection('lpaltos');
          const lpaltosRecords = await lpaltosCollection.find({
            rut: rutWithDash,
            tenant: tenantId
          }).toArray();
          console.log(`[LISTA_PROPIA_RECALC] 📈 Lpaltos query result: ${lpaltosRecords.length} records found`);

          // Check if the RUT exists in the lpmedios collection (tenant-isolated)
          console.log(`[LISTA_PROPIA_RECALC] 🔍 Querying lpmedios collection for RUT: ${rutWithDash}, tenant: ${tenantId}`);
          const lpmediosCollection = mongoose.connection.db.collection('lpmedios');
          const lpmediosRecords = await lpmediosCollection.find({
            rut: rutWithDash,
            tenant: tenantId
          }).toArray();
          console.log(`[LISTA_PROPIA_RECALC] 📊 Lpmedios query result: ${lpmediosRecords.length} records found`);

          // Update the recycled result with tenant-specific lista propia flags
          if (resultObject.sheriffLogData && resultObject.sheriffLogData.summaryData && resultObject.sheriffLogData.summaryData.data) {
            const newLpaltosDetected = lpaltosRecords.length > 0;
            const newLpmediosDetected = lpmediosRecords.length > 0;

            resultObject.sheriffLogData.summaryData.data.lpaltosDetected = newLpaltosDetected;
            resultObject.sheriffLogData.summaryData.data.lpmediosDetected = newLpmediosDetected;

            console.log(`[LISTA_PROPIA_RECALC] ✅ Flags updated successfully:`);
            console.log(`[LISTA_PROPIA_RECALC] 📈 lpaltosDetected: ${originalLpaltosDetected} → ${newLpaltosDetected} ${originalLpaltosDetected !== newLpaltosDetected ? '(CHANGED)' : '(UNCHANGED)'}`);
            console.log(`[LISTA_PROPIA_RECALC] 📊 lpmediosDetected: ${originalLpmediosDetected} → ${newLpmediosDetected} ${originalLpmediosDetected !== newLpmediosDetected ? '(CHANGED)' : '(UNCHANGED)'}`);
            console.log(`[LISTA_PROPIA_RECALC] 🎯 Final result for tenant ${tenantId}: lpaltosDetected=${newLpaltosDetected}, lpmediosDetected=${newLpmediosDetected}`);

            // Recalculate riskAssessment with updated lista propia flags
            console.log(`[RISK_RECALC] 🧮 Starting riskAssessment recalculation with updated lista propia flags...`);
            const originalRiskAssessment = resultObject.riskAssessment;
            console.log(`[RISK_RECALC] 📊 Original riskAssessment exists: ${!!originalRiskAssessment}`);

            try {
              const newRiskAssessment = await RiskCalculationService.calculateRisk(resultObject.sheriffLogData, 'getResultByRut:lpflags');

              if (newRiskAssessment) {
                resultObject.riskAssessment = newRiskAssessment;
                console.log(`[RISK_RECALC] ✅ RiskAssessment recalculated successfully`);
                console.log(`[RISK_RECALC] 🎯 New risk level: ${newRiskAssessment.riskSummary?.riskLevelDescription || 'N/A'}`);
                console.log(`[RISK_RECALC] 🚦 New semaphore: ${newRiskAssessment.riskSummary?.semaphore || 'N/A'}`);

                // Compare risk levels if both exist
                if (originalRiskAssessment && originalRiskAssessment.riskSummary && newRiskAssessment.riskSummary) {
                  const originalLevel = originalRiskAssessment.riskSummary.riskLevelDescription;
                  const newLevel = newRiskAssessment.riskSummary.riskLevelDescription;
                  const originalSemaphore = originalRiskAssessment.riskSummary.semaphore;
                  const newSemaphore = newRiskAssessment.riskSummary.semaphore;

                  console.log(`[RISK_RECALC] 📈 Risk level: ${originalLevel} → ${newLevel} ${originalLevel !== newLevel ? '(CHANGED)' : '(UNCHANGED)'}`);
                  console.log(`[RISK_RECALC] 🚦 Semaphore: ${originalSemaphore} → ${newSemaphore} ${originalSemaphore !== newSemaphore ? '(CHANGED)' : '(UNCHANGED)'}`);
                }
              } else {
                console.warn(`[RISK_RECALC] ⚠️ RiskAssessment recalculation returned null/undefined - keeping original`);
              }
            } catch (riskError) {
              console.error(`[RISK_RECALC] ❌ Error recalculating riskAssessment:`, riskError);
              console.log(`[RISK_RECALC] 🛡️ Keeping original riskAssessment due to calculation error`);
            }
          } else {
            console.warn(`[LISTA_PROPIA_RECALC] ⚠️ Could not update flags - sheriffLogData structure not found in result object`);
          }

        } catch (error) {
          console.error(`[LISTA_PROPIA_RECALC] ❌ Error recalculating lista propia flags for tenant ${tenantId}:`, error);
          console.error(`[LISTA_PROPIA_RECALC] 🔧 Setting flags to false as safety fallback`);
          // Set flags to false on error to be safe
          if (resultObject.sheriffLogData && resultObject.sheriffLogData.summaryData && resultObject.sheriffLogData.summaryData.data) {
            resultObject.sheriffLogData.summaryData.data.lpaltosDetected = false;
            resultObject.sheriffLogData.summaryData.data.lpmediosDetected = false;
            console.log(`[LISTA_PROPIA_RECALC] 🛡️ Safety fallback applied - both flags set to false`);

            // Try to recalculate riskAssessment with fallback flags
            console.log(`[RISK_RECALC] 🔧 Attempting riskAssessment recalculation with fallback flags...`);
            try {
              const fallbackRiskAssessment = await RiskCalculationService.calculateRisk(resultObject.sheriffLogData, 'getResultByRut:fallback');
              if (fallbackRiskAssessment) {
                resultObject.riskAssessment = fallbackRiskAssessment;
                console.log(`[RISK_RECALC] ✅ RiskAssessment recalculated successfully with fallback flags`);
              } else {
                console.warn(`[RISK_RECALC] ⚠️ Fallback riskAssessment calculation failed - keeping original`);
              }
            } catch (fallbackRiskError) {
              console.error(`[RISK_RECALC] ❌ Error in fallback riskAssessment calculation:`, fallbackRiskError);
              console.log(`[RISK_RECALC] 🛡️ Keeping original riskAssessment due to fallback calculation error`);
            }
          }
        }

        //we need to recycle the result of another tenant for the current one by creating a new result record
        const newResult = new Result({
          ...resultObject,
          tenantId
        });

        //navigate all object in newResult and trim arrays if lenght more than 100 elements
        Object.keys(newResult).forEach((key) => {
          if (Array.isArray(newResult[key]) && newResult[key].length > 100) {
            console.warn(1924, `trim array ${key} to 100 elements`);
            newResult[key] = newResult[key].slice(0, 100);
          }
        });




        console.warn(1920, "save newResult");
        await newResult.save();
        //call again the function getresultbyrut with the new id
        req.params.rut = rut;
        return RutController.getResultByRut(req, res);

      }



      const riskRecalc = (req.query as any)?.risk === 'true';
      if (riskRecalc) {
        try {
          const newRiskAssessment = await RiskCalculationService.calculateRisk(result.sheriffLogData as any, 'getResultByRut:onDemand');
          if (newRiskAssessment) {
            await Result.updateOne({ _id: result._id }, { riskAssessment: newRiskAssessment });
            (result as any).riskAssessment = newRiskAssessment;
          }
        } catch (riskError) {
          console.error('[RISK_RECALC] Error recalculating riskAssessment on demand:', riskError);
        }
      }

      // Fetch associated company details and risks
      const companyDetails = await CompanyDetails.findOne({
        $or: [{ rut: rut }, { rut: rut.replace('-', '') }],
        resultId: result._id
      });

      const companyRisks = await CompanyRisks.findOne({
        $or: [{ rut: rut }, { rut: rut.replace('-', '') }],
        resultId: result._id
      });

      // Combine result with company details and risks
      const responseData = {
        ...result.toObject(),
        companyDetails: companyDetails ? companyDetails.toObject() : null,
        companyRisks: companyRisks ? companyRisks.toObject() : null
      };

      return res.status(200).json(responseData);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [RutController.getResultByRut] - Error:`, error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  static async getLatestResult(req: AuthenticatedRequest, res: Response) {
    try {
      // Get tenant ID from authenticated user
      const tenantId = req.user?.tenant;

      if (!tenantId) {
        console.error(1900, "tenantId not found in request", req.user);
        return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
      }

      const result = await Result.findOne({ tenantId, archived: { $ne: true } }).sort({ createdAt: -1 });
      if (!result) {
        return res.status(404).json({ error: 'No results found' });
      }

      // Fetch associated company details and risks
      const companyDetails = await CompanyDetails.findOne({ resultId: result._id, tenantId });
      const companyRisks = await CompanyRisks.findOne({ resultId: result._id, tenantId });

      // Combine result with company details and risks
      const responseData = {
        ...result.toObject(),
        companyDetails: companyDetails ? companyDetails.toObject() : null,
        companyRisks: companyRisks ? companyRisks.toObject() : null
      };

      return res.status(200).json(responseData);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [RutController.getLatestResult] - Error:`, error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  static async getCompanyDetailsByRut(req: AuthenticatedRequest, res: Response) {
    const { rut } = req.params;
    try {

      // Get tenant ID from authenticated user
      const tenantId = req.user?.tenant;

      if (!tenantId) {
        return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
      }

      // Find the latest company details for this RUT and tenant
      const companyDetails = await CompanyDetails.findOne({
        $or: [{ rut: rut }, { rut: rut.replace('-', '') }],
        tenantId
      }).sort({ createdAt: -1 });

      if (!companyDetails) {
        return res.status(404).json({ error: 'Company details not found' });
      }

      return res.status(200).json(companyDetails);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [RutController.getCompanyDetailsByRut] - Error:`, error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  static async getCompanyRisksByRut(req: AuthenticatedRequest, res: Response) {
    const { rut } = req.params;
    try {

      // Get tenant ID from authenticated user
      const tenantId = req.user?.tenant;

      if (!tenantId) {
        return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
      }

      // Find the latest company risks for this RUT and tenant
      const companyRisks = await CompanyRisks.findOne({
        $or: [{ rut: rut }, { rut: rut.replace('-', '') }],
        tenantId
      }).sort({ createdAt: -1 });

      if (!companyRisks) {
        return res.status(404).json({ error: 'Company risks not found' });
      }

      return res.status(200).json(companyRisks);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [RutController.getCompanyRisksByRut] - Error:`, error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  static async deleteResult(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    try {

      if (!id || id === 'undefined') {
        return res.status(400).json({ error: 'Result ID is required.' });
      }

      // Get tenant ID from authenticated user
      const tenantId = req.user?.tenant;

      if (!tenantId) {
        return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
      }

      const result = await Result.findOne({ _id: id, tenantId });
      if (!result) {
        return res.status(404).json({ error: 'Result not found' });
      }

      // Delete associated company details and risks if they exist
      await CompanyDetails.deleteOne({ resultId: id, tenantId });
      await CompanyRisks.deleteOne({ resultId: id, tenantId });

      // Delete the result
      await Result.findByIdAndDelete(id);

      return res.status(200).json({ message: 'Result deleted successfully' });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [RutController.deleteResult] - Error:`, error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  static async getAIAnalysis(req: AuthenticatedRequest, res: Response) {
    try {
      const { rut } = req.params;
      const { regenerate } = req.query; // Check if user wants to regenerate analysis

      if (!rut) {
        return res.status(400).json({ error: 'RUT parameter is required' });
      }

      // Get the latest result for this RUT
      const result = await Result.findOne({ rut, archived: { $ne: true } }).sort({ createdAt: -1 });

      if (!result) {
        return res.status(404).json({ error: `No evaluation data found for RUT: ${rut}` });
      }

      // Check if AI analysis already exists and user doesn't want to regenerate
      if (result.aiAnalysis && result.aiAnalysisDate && regenerate !== 'true') {
        return res.status(200).json({
          rut: result.rut,
          aiAnalysis: result.aiAnalysis,
          analysisDate: result.aiAnalysisDate,
          isFromCache: true,
          riskSummary: result.riskAssessment
        });
      }

      // Calculate risk assessment
      const riskAssessment = await RiskCalculationService.calculateRisk(result.sheriffLogData, 'getAIAnalysis');

      if (!riskAssessment) {
        return res.status(500).json({ error: 'Failed to calculate risk assessment' });
      }

      // Get tenant ID from authenticated user
      const tenantId = req.user?.tenant;

      // Fetch company details
      const companyDetails = await CompanyDetails.findOne({
        rut: rut,
        tenantId
      }).sort({ createdAt: -1 });

      // Prepare data for AI analysis
      const analysisData = {
        rut: result.rut,
        companyName: companyDetails?.razonSocial || 'N/A',
        evaluationDate: new Date(),
        riskAssessment: riskAssessment,
        parameters: {
          compliance: result.sheriffLogData?.complianceRules || [],
          legal: result.sheriffLogData?.legalRules || [],
          capitalHumano: result.sheriffLogData?.capitalHumanoRules || [],
          financieroTributario: result.sheriffLogData?.financieroTributarioRules || []
        },
        totalParameters: riskAssessment.riskSummary?.totalParameters || 0,
        detectedIssues: riskAssessment.riskSummary?.totalDetected || 0,
        criticalIssues: riskAssessment.riskSummary?.totalSevero || 0,
        significantIssues: riskAssessment.riskSummary?.totalSignificativo || 0,
        riskLevel: riskAssessment.riskSummary?.riskLevelDescription || 'N/A',
        semaphore: riskAssessment.riskSummary?.semaphore || 'unknown'
      };

      // Get OpenAI service instance
      const openAIService = OpenAIService.getInstance();

      // Generate AI analysis
      const aiAnalysis = await openAIService.analyzeEvaluationParameters(
        analysisData,
        req.user?.tenant,
        req.user?.id
      );

      // Save AI analysis to database
      const analysisDate = new Date();
      await Result.updateOne(
        { _id: result._id },
        {
          aiAnalysis: aiAnalysis,
          aiAnalysisDate: analysisDate
        }
      );

      return res.status(200).json({
        rut: result.rut,
        aiAnalysis: aiAnalysis,
        analysisDate: analysisDate,
        isFromCache: false,
        riskSummary: riskAssessment
      });

    } catch (error) {
      console.error(`Error generating AI analysis for RUT ${req.params.rut}:`, error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error during AI analysis'
      });
    }
  }

  static async savePdfReport(req: AuthenticatedRequest, res: Response) {
    try {
      const { pdfData, rut, companyName } = req.body;

      if (!pdfData || !rut) {
        return res.status(400).json({
          error: 'Missing required fields: pdfData and rut'
        });
      }

      // Generate unique PDF ID
      const pdfId = uuidv4();

      // Create PDF directory if it doesn't exist
      const pdfDir = path.join(process.cwd(), 'static', 'pdfs');
      if (!fs.existsSync(pdfDir)) {
        fs.mkdirSync(pdfDir, { recursive: true });
      }

      // Save PDF file
      const fileName = `${pdfId}.pdf`;
      const filePath = path.join(pdfDir, fileName);

      // Convert base64 to buffer and save
      const pdfBuffer = Buffer.from(pdfData.replace(/^data:application\/pdf;base64,/, ''), 'base64');
      fs.writeFileSync(filePath, pdfBuffer);

      // Save metadata to database (you might want to create a PdfReport model)
      const pdfMetadata = {
        pdfId,
        rut,
        companyName,
        fileName,
        filePath,
        createdAt: new Date(),
        tenantId: req.user?.tenant
      };

      // For now, we'll store in a simple collection
      const db = mongoose.connection.db;
      await db.collection('pdf_reports').insertOne(pdfMetadata);

      const accessUrl = `${req.protocol}://${req.get('host')}/api/rut/pdf/${pdfId}`;

      return res.status(200).json({
        success: true,
        pdfId,
        accessUrl
      });
    } catch (error) {
      console.error('Error saving PDF report:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error saving PDF'
      });
    }
  }

  static async getPdfReport(req: AuthenticatedRequest, res: Response) {
    try {
      const { pdfId } = req.params;

      if (!pdfId) {
        return res.status(400).json({
          error: 'PDF ID is required'
        });
      }

      // Get PDF metadata from database
      const db = mongoose.connection.db;
      const pdfMetadata = await db.collection('pdf_reports').findOne({ pdfId });

      if (!pdfMetadata) {
        return res.status(404).json({
          error: 'PDF not found'
        });
      }

      // Check if file exists
      const filePath = pdfMetadata.filePath;
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          error: 'PDF file not found on disk'
        });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${pdfMetadata.fileName}"`);

      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error('Error retrieving PDF report:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error retrieving PDF'
      });
    }
  }

  static async saveFastCheckSummary(req: AuthenticatedRequest, res: Response) {
    try {
      const { rut } = req.params;
      const { summary } = req.body;

      if (!rut) {
        return res.status(400).json({ error: 'RUT parameter is required' });
      }

      if (!summary) {
        return res.status(400).json({ error: 'Summary is required' });
      }

      // Get tenant ID from authenticated user
      const tenantId = req.user?.tenant;

      if (!tenantId) {
        return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
      }

      // Get complete company info from the latest result for metadata
      const result = await Result.findOne({
        rut: rut,
        tenantId: tenantId,
        archived: { $ne: true }
      }).sort({ createdAt: -1 });

      // Create comprehensive metadata object with all available information
      const metadata: any = {
        analysisDate: new Date(),
        resultId: result?._id,
        fullCompanyDetails: result?.details || {},
        riskAssessment: result?.riskAssessment || {},
        sheriffLogData: result?.sheriffLogData || {},
        vistaDuxiter: result?.vistaDuxiter || [],
        duxiterFilter: result?.duxiterFilter || {},
        duxiterRiskLevel: result?.duxiterRiskLevel || '',
        duxiterRiskData: result?.duxiterRiskData || {},
        duxiterRiskList: result?.duxiterRiskList || {},
        newSummaryData: result?.newSummaryData || {},
        aiAnalysis: result?.aiAnalysis || '',
        aiAnalysisDate: result?.aiAnalysisDate || null
      };

      // Extract key information for easy access
      if (result) {
        if (result.details?.razonSocial) {
          metadata.companyName = result.details.razonSocial;
        }
        if (result.riskAssessment?.riskSummary?.riskLevelDescription) {
          metadata.riskLevel = result.riskAssessment.riskSummary.riskLevelDescription;
        }
        if (result.details?.giro) {
          metadata.businessActivity = result.details.giro;
        }
        if (result.details?.fechaConstitucion) {
          metadata.constitutionDate = result.details.fechaConstitucion;
        }
      }

      // Check if a summary already exists for this RUT and tenant
      const existingSummary = await Summary.findOne({
        rut: rut,
        tenantId: tenantId,
        summaryType: 'fast-check'
      }).sort({ createdAt: -1 });

      let savedSummary;

      if (existingSummary) {
        // Update existing summary
        existingSummary.content = summary;
        existingSummary.metadata = metadata;
        console.warn(1086, "save existingSummary");
        savedSummary = await existingSummary.save();

        return res.status(200).json({
          success: true,
          message: 'Fast-Check summary updated successfully',
          rut: rut,
          summaryId: savedSummary._id,
          updatedAt: savedSummary.updatedAt,
          action: 'updated'
        });
      } else {
        // Create new summary document
        const newSummary = new Summary({
          rut: rut,
          tenantId: tenantId,
          summaryType: 'fast-check',
          content: summary,
          metadata: metadata
        });
        console.warn(1086, "save newSummary");
        savedSummary = await newSummary.save();

        return res.status(200).json({
          success: true,
          message: 'Fast-Check summary created successfully',
          rut: rut,
          summaryId: savedSummary._id,
          createdAt: savedSummary.createdAt,
          action: 'created'
        });
      }

    } catch (error) {
      console.error(`Error saving Fast-Check summary for RUT ${req.params.rut}:`, error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error saving Fast-Check summary'
      });
    }
  }

  static async getFastCheckSummary(req: AuthenticatedRequest, res: Response) {
    try {
      const { rut } = req.params;

      if (!rut) {
        return res.status(400).json({ error: 'RUT parameter is required' });
      }

      // Get tenant ID from authenticated user
      const tenantId = req.user?.tenant;

      if (!tenantId) {
        return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
      }

      // Find the latest Fast-Check summary for this RUT and tenant
      const summary = await Summary.findOne({
        rut: rut,
        tenantId: tenantId,
        summaryType: 'fast-check'
      }).sort({ createdAt: -1 });

      if (!summary) {
        return res.status(404).json({
          error: `No Fast-Check summary found for RUT: ${rut}`,
          rut: rut
        });
      }

      return res.status(200).json({
        success: true,
        rut: rut,
        summaryId: summary._id,
        content: summary.content,
        metadata: summary.metadata,
        createdAt: summary.createdAt,
        updatedAt: summary.updatedAt
      });

    } catch (error) {
      console.error(`Error retrieving Fast-Check summary for RUT ${req.params.rut}:`, error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error retrieving Fast-Check summary'
      });
    }
  }

  static async updatePepStatus(req: AuthenticatedRequest, res: Response) {
    try {
      const { rut } = req.params;
      const updatePayload = req.body;

      if (!rut) {
        return res.status(400).json({ error: 'RUT parameter is required' });
      }

      // Get tenant ID from authenticated user
      const tenantId = req.user?.tenant;

      if (!tenantId) {
        return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
      }

      // Validate that the update payload contains PEP-related data
      if (!updatePayload || typeof updatePayload !== 'object') {
        return res.status(400).json({ error: 'Nessun parametro PEP trovato' });
      }

      // Find the latest result for this RUT and tenant
      const result = await Result.findOne({
        rut: rut,
        tenantId: tenantId,
        archived: { $ne: true }
      }).sort({ createdAt: -1 });

      if (!result) {
        return res.status(404).json({
          error: `No result found for RUT: ${rut}`,
          rut: rut
        });
      }

      // Update the result with the new PEP status data
      // Merge the updatePayload into the existing result
      Object.keys(updatePayload).forEach(key => {
        if (updatePayload[key] !== undefined) {
          (result as any)[key] = updatePayload[key];
        }
      });

      // Save the updated result
      if(result.queryType === "primary"){
        result.isPep = false;
      }  
      console.warn(1086, "save updatedResult rut:", rut,result);
      const updatedResult = await result.save();
      // Access updatedAt via toObject to avoid type issues on Document
      const updatedPlain: any = updatedResult.toObject();
      return res.status(200).json({
        success: true,
        message: 'PEP status updated successfully',
        rut: rut,
        resultId: updatedResult._id,
        updatedAt: updatedPlain?.updatedAt ?? new Date()
      });

    } catch (error) {
      console.error(`Error updating PEP status for RUT ${req.params.rut}:`, error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error updating PEP status'
      });
    }
  }

  static async evaluatePepForSocios(req: AuthenticatedRequest, res: Response) {
    console.log('evaluatePepForSocios_invoked');
    const { rut } = req.params;
    const { refresh } = req.query;
    const tenantId = req.user?.tenant;
    if (!rut) {
      return res.status(400).json({ error: 'RUT parameter is required' });
    }
    if (!tenantId) {
      return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
    }
    const normalizedRut = RutController.normalizeRut(rut);
    console.log('evaluate_pep_socios_requested', { rut: normalizedRut, tenantId });
    const session = await mongoose.startSession();
    try {
      let pepChileDetected = false;
      let familiaresPepDetected = false;
      const sheriffService = SheriffService.getInstance();
      await session.withTransaction(async () => {
        const result = await Result.findOne({ rut: normalizedRut, tenantId, archived: { $ne: true } }).sort({ createdAt: -1 }).session(session);
        if (!result) {
          throw new Error('RESULT_NOT_FOUND');
        }
        const sociosList = Array.isArray((result as any).companyGeneralInfo?.socios) ? (result as any).companyGeneralInfo.socios : [];
        const detectedChile: string[] = [];
        const detectedFam: string[] = [];
        for (const socio of sociosList) {
          const srut = typeof socio?.rut === 'string' ? RutController.normalizeRut(socio.rut) : null;
          if (!srut) continue;
          const data = await sheriffService.queryRut({ rut: srut, isMonitoring: false }, tenantId, refresh === 'true');
          const comp = (data as any)?.summaryData?.data?.compliance;
          const selPep = Array.isArray(comp?.selectedRowsPepChile) ? comp.selectedRowsPepChile.length > 0 : false;
          const selFam = Array.isArray(comp?.selectedRowsPepChileFamily) ? comp.selectedRowsPepChileFamily.length > 0 : false;
          const sumArr = Array.isArray(comp?.summary) ? comp.summary : [];
          const pepChileSum = sumArr.find((i: any) => i?.table === 'PEP Chile');
          const famPepSum = sumArr.find((i: any) => i?.table === 'Familiares PEP');
          const hasPepChile = selPep || (!!pepChileSum && !!pepChileSum.countResults && pepChileSum.countResults > 0);
          const hasFamiliares = selFam || (!!famPepSum && !!famPepSum.countResults && famPepSum.countResults > 0);

          try {
             let socioResult = await Result.findOne({ rut: srut, tenantId, archived: { $ne: true } }).sort({ createdAt: -1 }).session(session);
             const isPep = hasPepChile || hasFamiliares;
             if (!socioResult) {
                socioResult = new Result({
                   rut: srut,
                   tenantId,
                   queryType: 'derived_socio_pep',
                   sheriffLogData: data,
                   isPep,
                   createdAt: new Date(),
                   updatedAt: new Date()
                });
                await socioResult.save({ session });
             } else if (refresh === 'true') {
                 socioResult.sheriffLogData = data;
                 socioResult.isPep = isPep;
                 if (!socioResult.queryType) socioResult.queryType = 'derived_socio_pep';
                 socioResult.updatedAt = new Date();
                 await socioResult.save({ session });
             }
          } catch (e) {
             console.error('Error saving socio result', e);
          }
          if (hasPepChile) pepChileDetected = true;
          if (hasFamiliares) familiaresPepDetected = true;
          if (hasPepChile) detectedChile.push(srut);
          if (hasFamiliares) detectedFam.push(srut);
          if (pepChileDetected && familiaresPepDetected) break;
        }
        const detectado = pepChileDetected || familiaresPepDetected;
        if (detectado) {
          console.warn(2532,">>>>>>>>>>>>>> set isPep true");
          (result as any).isPep = true;
          console.warn(2503, " RUT : isPep", normalizedRut, (result as any).isPep);
          const existingAssessment: any = result.riskAssessment || {};
          const allRules = existingAssessment.allRules || {};
          const complianceRules: any[] = Array.isArray(allRules.complianceRules) ? allRules.complianceRules : [];
          const prevPepChileRule = complianceRules.find(r => r && r.label === 'PEP Chile');
          const prevFamiliaresPepRule = complianceRules.find(r => r && r.label === 'Familiares PEP');
          const upsertRule = (label: string, detected: boolean) => {
            const idx = complianceRules.findIndex(r => r && r.label === label);
            if (idx >= 0) {
              complianceRules[idx] = { ...complianceRules[idx], detected: detected ? true : (complianceRules[idx].detected || false), risk: detected ? 'alto' : (complianceRules[idx].risk || 'bajo') };
            } else {
              complianceRules.push({ label, impacto: 'severo', risk: detected ? 'alto' : 'bajo', detected: detected ? true : false, score: detected ? 1 : 0 });
            }
          };
          upsertRule('PEP Chile', pepChileDetected);
          upsertRule('Familiares PEP', familiaresPepDetected);
          const newAssessment = {
            ...existingAssessment,
            allRules: { ...allRules, complianceRules }
          };
          const rs = existingAssessment.riskSummary || {};
          let totalSevero = rs.totalSevero || 0;
          let totalDetected = rs.totalDetected || 0;
          if (pepChileDetected && !(prevPepChileRule && prevPepChileRule.detected === true)) {
            totalSevero += 1;
            totalDetected += 1;
          }
          if (familiaresPepDetected && !(prevFamiliaresPepRule && prevFamiliaresPepRule.detected === true)) {
            totalSevero += 1;
            totalDetected += 1;
          }
          const semaphore = totalSevero > 0 ? 'red' : (rs.semaphore || 'green');
          const riskLevelDescription = totalSevero > 0 ? 'Alto Riesgo' : (rs.riskLevelDescription || 'Bajo Riesgo');
          newAssessment.riskSummary = {
            ...rs,
            totalSevero,
            totalDetected,
            semaphore,
            riskLevelDescription
          };
          (result as any).riskAssessment = newAssessment;

          const logData: any = (result as any).sheriffLogData || {};
          const sd: any = logData.summaryData || {};
          sd.data = sd.data || {};
          sd.data.compliance = sd.data.compliance || {};
          sd.data.compliance.summary = Array.isArray(sd.data.compliance.summary) ? sd.data.compliance.summary : [];
          const upsertSummary = (label: string, count: number) => {
            const idx = sd.data.compliance.summary.findIndex((i: any) => i && i.table === label);
            if (idx >= 0) {
              sd.data.compliance.summary[idx] = { ...sd.data.compliance.summary[idx], countResults: count, textCountResults: count };
            } else {
              sd.data.compliance.summary.push({ table: label, countResults: count, textCountResults: count, risk: 'free', useColor: true });
            }
          };
          if (pepChileDetected) upsertSummary('PEP Chile', 1);
          if (familiaresPepDetected) upsertSummary('Familiares PEP', 1);
          const uniq = (arr: string[]) => Array.from(new Set(arr));
          sd.data.compliance.selectedRowsPepChile = pepChileDetected ? uniq([...(sd.data.compliance.selectedRowsPepChile || []), ...detectedChile]) : (sd.data.compliance.selectedRowsPepChile || []);
          sd.data.compliance.selectedRowsPepChileFamily = familiaresPepDetected ? uniq([...(sd.data.compliance.selectedRowsPepChileFamily || []), ...detectedFam]) : (sd.data.compliance.selectedRowsPepChileFamily || []);
          logData.summaryData = sd;
          (result as any).sheriffLogData = logData;
          console.warn(1086, "save updatedResult");
          await result.save({ session });
        }
        elkService.logBusinessEvent('pep_socios_evaluated', { rut: normalizedRut, tenantId, pepChileDetected, familiaresPepDetected });
      });
      return res.status(200).json({
        success: true,
        rut: normalizedRut,
        detectado: pepChileDetected || familiaresPepDetected,
        pepChileDetected,
        familiaresPepDetected
      });
    } catch (error) {
      try { await session.abortTransaction(); } catch { }
      elkService.logSystemError(error as any, 'evaluatePepForSocios', { rut: normalizedRut, tenantId });
      const isNotFound = (error as any)?.message === 'RESULT_NOT_FOUND';
      if (isNotFound) {
        return res.status(404).json({ error: `No result found for RUT: ${normalizedRut}` });
      }
      return res.status(500).json({ error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error evaluating socios PEP' });
    } finally {
      session.endSession();
    }
  }

  /**
   * Check if socios have already been evaluated
   */
  static async checkSociosEvaluations(req: AuthenticatedRequest, res: Response) {
    try {
      const { ruts } = req.body;
      const tenantId = req.user?.tenant;

      if (!tenantId) {
        return res.status(400).json({ error: 'Tenant ID is required' });
      }

      if (!ruts || !Array.isArray(ruts) || ruts.length === 0) {
        return res.status(400).json({ error: 'RUTs array is required' });
      }

      // Clean RUTs (remove dots) and filter out null/undefined values
      const cleanRuts = ruts
        .filter(rut => rut != null && typeof rut === 'string')
        .map(rut => rut.replace(/\./g, ''));

      // Find existing results for these RUTs
      const existingResults = await Result.find({
        rut: { $in: cleanRuts },
        tenantId: tenantId,
        archived: { $ne: true }
      }).sort({ createdAt: -1 });

      // Create a map of RUT to evaluation data
      const evaluationMap: { [key: string]: any } = {};

      for (const result of existingResults) {
        if (!evaluationMap[result.rut]) {
          // Extract PEP information from the result
          let hasPepChile = false;
          let hasFamiliaresPep = false;
          let evaluationDate = (result as any).createdAt;

          const summary = (result as any)?.sheriffLogData?.summaryData?.data?.compliance?.summary;
          if (Array.isArray(summary)) {
            const pepItem = summary.find((i: any) => i && i.table === 'PEP Chile');
            const famItem = summary.find((i: any) => i && i.table === 'Familiares PEP');
            const pepCount = pepItem ? (pepItem.countResults ?? pepItem.textCountResults ?? 0) : 0;
            const famCount = famItem ? (famItem.countResults ?? famItem.textCountResults ?? 0) : 0;
            hasPepChile = pepCount > 0;
            hasFamiliaresPep = famCount > 0;
          }

          if (!hasPepChile || !hasFamiliaresPep) {
            if (result.riskAssessment?.allRules?.complianceRules) {
              const pepChileRule = result.riskAssessment.allRules.complianceRules.find((rule: any) => rule.label === 'PEP Chile');
              const familiaresPepRule = result.riskAssessment.allRules.complianceRules.find((rule: any) => rule.label === 'Familiares PEP');
              hasPepChile = hasPepChile || (pepChileRule && pepChileRule.detected === true);
              hasFamiliaresPep = hasFamiliaresPep || (familiaresPepRule && familiaresPepRule.detected === true);
            }
            if (result.duxiterRiskData?.complianceRules) {
              const pepChileRule = result.duxiterRiskData.complianceRules.find((rule: any) => rule.label === 'PEP Chile');
              const familiaresPepRule = result.duxiterRiskData.complianceRules.find((rule: any) => rule.label === 'Familiares PEP');
              hasPepChile = hasPepChile || (pepChileRule && pepChileRule.detected === true);
              hasFamiliaresPep = hasFamiliaresPep || (familiaresPepRule && familiaresPepRule.detected === true);
            }
          }

          evaluationMap[result.rut] = {
            rut: result.rut,
            isEvaluated: true,
            evaluationDate,
            evaluationResult: {
              hasPepChile,
              hasFamiliaresPep
            }
          };
        }
      }

      // Add non-evaluated RUTs to the map
      for (const rut of cleanRuts) {
        if (!evaluationMap[rut]) {
          evaluationMap[rut] = {
            rut,
            isEvaluated: false,
            evaluationDate: null,
            evaluationResult: null
          };
        }
      }

      return res.json({
        success: true,
        evaluations: Object.values(evaluationMap)
      });

    } catch (error) {
      console.error('Error checking socios evaluations:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error checking socios evaluations'
      });
    }
  }

  /**
   * Reset socios evaluations by deleting existing Result documents for provided RUTs within the tenant
   */
  static async resetSociosEvaluations(req: AuthenticatedRequest, res: Response) {
    try {
      const tenantId = req.user?.tenant;
      if (!tenantId) {
        return res.status(401).json({ error: 'Authentication required: Tenant information missing' });
      }

      const { ruts, confirm } = req.body || {};
      if (!confirm) {
        return res.status(400).json({ error: 'Reset confirmation required' });
      }
      if (!ruts || !Array.isArray(ruts) || ruts.length === 0) {
        return res.status(400).json({ error: 'RUTs array is required' });
      }

      const cleanRuts = ruts
        .filter((rut: any) => rut != null && typeof rut === 'string')
        .map((rut: string) => rut.replace(/\./g, ''));

      const deleteResult = await Result.deleteMany({
        tenantId,
        rut: { $in: cleanRuts }
      });

      return res.status(200).json({ success: true, deletedCount: deleteResult?.deletedCount || 0 });
    } catch (error) {
      console.error('Error resetting socios evaluations:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error resetting socios evaluations'
      });
    }
  }

  /**
   * Get historical consultas report for the tenant
   */
  static async getHistoricalConsultas(req: AuthenticatedRequest, res: Response): Promise<Response> {
    try {
      const tenantId = req.user?.tenant;
      if (!tenantId) {
        return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
      }

      const {
        page = 1,
        limit = 50,
        consultaType,
        rut,
        endpoint,
        responseStatus,
        startDate,
        endDate
      } = req.query;

      const options = {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        consultaType: consultaType as 'individual' | 'massive' | undefined,
        rut: rut as string | undefined,
        endpoint: endpoint as string | undefined,
        responseStatus: responseStatus ? parseInt(responseStatus as string) : undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined
      };

      const result = await ConsultaHistoryService.getConsultaHistory(tenantId, options);

      // Transform the response to match frontend expectations
      const response = {
        data: result.consultations,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      };

      return res.status(200).json(response);
    } catch (error) {
      console.error('[RutController.getHistoricalConsultas] Error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get historical consultas statistics for the tenant
   */
  static async getHistoricalConsultasStats(req: AuthenticatedRequest, res: Response): Promise<Response> {
    try {
      const tenantId = req.user?.tenant;
      if (!tenantId) {
        return res.status(401).json({ message: 'Authentication required: Tenant information missing' });
      }

      const { startDate, endDate } = req.query;

      const stats = await ConsultaHistoryService.getConsultaStats(
        tenantId,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      // Transform the response to match frontend expectations
      const response = {
        totalConsultas: stats.totalConsultations,
        consultasByType: { 
          individual: stats.individualConsultations,
          massive: stats.massiveConsultations
        },
        consultasByEndpoint: stats.consultationsByEndpoint.reduce((acc, item) => {
          acc[item.endpoint] = item.count;
          return acc;
        }, {} as Record<string, number>),
        consultasByStatus: {
          successful: stats.successfulConsultations,
          failed: stats.failedConsultations
        },
        consultasByDate: stats.consultationsByDay,
        averageProcessingTime: stats.averageProcessingTime,
        totalCreditsUsed: stats.totalCreditsUsed
      };

      return res.status(200).json(response);
    } catch (error) {
      console.error('[RutController.getHistoricalConsultasStats] Error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

}
