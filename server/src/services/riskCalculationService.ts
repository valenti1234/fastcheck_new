import e from 'express';
import { format, parse } from 'date-fns';
import { ISheriffDataLog } from '../models/SheriffDataLog';
import { log } from 'console';
import { Ley21121 } from '../models/Ley21121';
import { AntiunionCase } from '../models/AntiunionCase';
import { SnifaSancionatorio } from '../models/SnifaSancionatorio';
import { OpenAIService } from './OpenAIService';
import { EquifaxResponse } from '../models/EquifaxResponse';
import { eq } from 'lodash';
import * as fs from 'fs';
import path from 'path';
import { Result } from '../models/Result';
import { Logger } from 'winston';
import { RiskDetailsFormatter } from '../helpers/RiskDetailsFormatter';

export class RiskCalculationService {
  public static formatDateDDMMYYYY(d: unknown): string | unknown {
    if (d == null) return d;
    try {
      let dt: Date;
      if (typeof d === 'string') {
        dt = /^\d{2}-\d{2}-\d{4}$/.test(d) ? parse(d, 'dd-MM-yyyy', new Date()) : new Date(d);
      } else {
        dt = new Date(d as any);
      }
      return isNaN(dt.getTime()) ? d : format(dt, 'dd/MM/yyyy');
    } catch {
      return d;
    }
  }
  public static async calculateRisk(logEntry: ISheriffDataLog, caller?: string) {
    //console.warn(8, logEntry);
    console.warn(`[calculateRisk][${caller || 'unknown'}] RUT ${logEntry.rut}`);
    if (!logEntry || !logEntry.summaryData?.data) {
      console.log("Warning: Missing log entry or summary data in calculateRisk");
      return null;
    }

    //    const deuda = await this.evaluateDeuda(logEntry);

    const complianceRules = await this.evaluateComplianceRules(logEntry);
    // console.log("complianceRules", complianceRules);

    const legalRules = this.evaluateLegalRules(logEntry);
    // console.log("legalRules", legalRules);

    const capitalHumanoRules = await this.evaluateCapitalHumanoRules(logEntry);

    const financieroTributarioRules = this.evaluateFinancioeroTributarioRules(logEntry);
    // console.log("financieroTributarioRules", financieroTributarioRules);
    const allRules = { complianceRules, legalRules, capitalHumanoRules, financieroTributarioRules };

    //    console.warn("allRules", allRules);

    const riskSummary = this.riskSummary(complianceRules, legalRules, capitalHumanoRules, financieroTributarioRules);
    // console.log("RiskCalculationService.riskSummary", riskSummary, allRules);
    const summaryDocumentMD = this.buildDocMarkdown(logEntry, riskSummary, allRules);
    //get data from mongodb collection equifax-responses
    const tenantId = logEntry.tenantId;
    const rut = logEntry.rut?.replace(/\./g, '').toUpperCase();
    const baseRut = rut?.replace(/-/g, '');
    const rutWithDash = baseRut ? `${baseRut.slice(0, -1)}-${baseRut.slice(-1)}` : undefined;
    const rutWithoutDash = baseRut;

    let equifaxData: any = null;
    let equifaxCommercialData: any = null;

    try {
      const query: any = {};
      if (tenantId) query.tenantId = tenantId;
      const or: any[] = [];
      if (rutWithDash) or.push({ rut: rutWithDash });
      if (rutWithoutDash) or.push({ rut: rutWithoutDash });
      if (or.length > 0) {
        query.$or = or;
      }
      const doc = await EquifaxResponse.findOne(query)
        .sort({ createdAt: -1 })
        .lean();

      // console.warn(68, 'EquifaxResponse', doc);
      if (doc?.requestPayload?.requestType === "personal") {
        const p360 = doc?.data?.platinum360?.getInformePlatinum360Response?.response || null;
        // Normalize personal (platinum360) response to commercial-like format
        if (p360) {
          const debts = p360?.Credit?.DebtsSummary || {};
          const protest = debts?.ProtestSummary || {};
          const sumBolab = debts?.SumaryBOLAB || {};
          equifaxCommercialData = {
            behavior: {
              contactability: {
                contactsDataDetail: {
                  addresses: {
                    // No direct mapping for commercialAddresses in personal; set empty array
                    commercialAddresses: []
                  }
                }
              }
            },
            credit: {
              debtsSummary: {
                protestSummary: {
                  expirationDateLastProtest: protest?.ExpirationDateLastProtest ?? null,
                  totalProtests: Number(protest?.TotalProtests ?? 0),
                  amountLastProtest: Number(protest?.AmountLastProtest ?? 0),
                  totalAmountProtests: Number(protest?.TotalAmountProtests ?? 0)
                },
                // Map unpaid total amount from personal to commercial key
                unpaidTotalAmount: Number(debts?.UnpaidAmountPesos ?? 0),
                // Map summaryBolab to align with commercial usage
                summaryBolab: {
                  totalBolab: Number(sumBolab?.TotalBolab ?? 0),
                  totalAmountBolab: Number(sumBolab?.TotalAmountBolab ?? 0),
                  amountLastBolab: sumBolab?.AmountLastBolab ?? "0"
                }
              }
            },
            guarantees: {
              // No direct mapping in personal; provide minimal shape
              accreditations: {
                commercialPartnerPartnership: {
                  commercialPartners: {
                    commercialPartnerEmpresarial: []
                  }
                }
              }
            }
          };
        } else {
          equifaxCommercialData = null;
        }
        //  console.warn(71, 'equifaxCommercialData normalized from platinum360', equifaxCommercialData);
      } else {
        equifaxCommercialData = doc?.data?.data?.commercialData || null;
        //    console.warn(74, 'equifaxCommercialData commercialData', equifaxCommercialData);
      }
      equifaxData = doc?.normalizedData || null;
      //console.warn(44, 'equifaxCommercialData',equifaxCommercialData);
    } catch (err) {
      console.warn('Failed to fetch Equifax data:', err);
    }

    (logEntry as any).equifaxData = equifaxData;
    (logEntry as any).equifaxCommercialData = equifaxCommercialData;
    (logEntry as any).equifaxData = (logEntry as any).equifaxData || {};
    (logEntry as any).equifaxCommercialData = (logEntry as any).equifaxCommercialData || {};
    if (!(logEntry as any).equifaxData.label) {
      (logEntry as any).equifaxData.label = "";
    }
    (logEntry as any).equifaxData.label = "Protestos y Morosidades, Deuda Previsional Publicada";

    //get data from mongodb antiunioncase
    try {
      //il numero o la lettera dopo il dash puo essere sia maiuscola che minuscola
      //perciò aggiungo anche la versione minuscola
      const rutWithDashLower = rutWithDash ? `${rutWithDash.slice(0, -1)}${rutWithDash.slice(-1).toLowerCase()}` : undefined;
      const rutWithoutDashLower = rutWithoutDash ? `${rutWithoutDash.slice(0, -1)}${rutWithoutDash.slice(-1).toLowerCase()}` : undefined;
      const query: any = { $or: [{ rut: rutWithDash }, { rut: rutWithoutDash }] };
      if (rutWithDashLower) query.$or.push({ rut: rutWithDashLower });
      if (rutWithoutDashLower) query.$or.push({ rut: rutWithoutDashLower });


      const docs = await AntiunionCase.find(query)
        .sort({ createdAt: -1 })
        .lean();

      (logEntry as any).antiunionCases = docs || [];
      if ((logEntry as any).antiunionCases && Array.isArray((logEntry as any).antiunionCases)) {
        (logEntry as any).antiunionCases.forEach((c: any) => {
          try { c.label = "Condenas por Prácticas Antisindicales"; } catch { }
        });
      }
    } catch (err) {
      console.warn('Failed to fetch AntiunionCase data:', err);
    }


    /*
        console.warn(95,"antiunionCase", (logEntry as any).antiunionCase);
        console.warn(96,"equifaxData", (logEntry as any).equifaxData);
        */

    /*    
    (logEntry as any).multasLaborales = logEntry.summaryData.data.multaLaboralSummary;
    
    (logEntry as any).multasLaborales.label = "Multas Laborales";
    */

    const financialRisk = null;
    const res = {
      riskSummary,
      allRules,
      summaryDocumentMD,
      financialRisk,
    };

    const totalResult = {
      logEntry,
      res
    };
    //save res to json file in json_data folder with time and rut
    try {
      const jsonDataDir = path.resolve(process.cwd(), 'json_data');
      fs.mkdirSync(jsonDataDir, { recursive: true });
      const fileName = `riskCalculationResult_${Date.now()}_${rut}.json`;
      fs.writeFileSync(path.join(jsonDataDir, fileName), JSON.stringify(totalResult, null, 2));
    } catch (err) {
      console.warn('[RiskCalculationService.calculateRisk] Failed to write json_data result file:', err);
    }
    // console.warn(311, "call completed", res);
    return res;

  }
  //check Environmental Sanctions LOCAL DB
  private static async checkEnvironmentalSanctions(logEntry: ISheriffDataLog, complianceArray: any[], rulObj: any) {

    const razonSocialRaw = logEntry.filteredDetails.razonSocial;

    console.log(`[Environmental Sanctions] Searching for: "${razonSocialRaw}"`);
    let sanctions = [] as any[];
    if (razonSocialRaw) {
      try {
        const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const normalize = (s: string) => s
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[.,;:"'()]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const fastCheckFilter = { fastCheckSanciones: { $regex: /^SI$/i } };
        const STOPWORDS = new Set([
          'SPA', 'SP.A', 'SpA', 'SA', 'S.A', 'S.A.', 'LTDA', 'LTD.A', 'LIMITADA', 'ANONIMA', 'SOCIEDAD',
          'DE', 'LA', 'EL', 'Y', 'DEL', 'EIRL', 'E.I.R.L', 'E.I.R.L.', 'E.U.', 'CORP', 'CORPORACION', 'CORPORACIÓN',
          'COMERCIAL', 'COMERCIALIZADORA', 'SERVICIOS', 'INDUSTRIAL', 'INTERNACIONAL', 'DISTRIBUIDORA', 'COMPANIA', 'COMPAÑIA', 'COMPAÑÍA', 'CHILE'
        ]);
        const COMMON_TOKENS = new Set([
          'INMOBILIARIA',
          'INVERSION',
          'INVERSIONES',
          'CONSTRUCTORA',
          'INGENIERIA',
          'TRANSPORTES',
          'AGRÍCOLA',
          'AGRICOLA',
          'MINERA',
          'FORESTAL',
          'INMOBILIARIAS',
        ]);
        const isStopword = (w: string) => STOPWORDS.has(w.toUpperCase());
        const getTokens = (s: string) => normalize(s).split(/\s+/).filter(w => w.length > 2);

        const tokensAll = getTokens(razonSocialRaw).filter(w => !isStopword(w));
        const tokensPreferred = tokensAll.filter(w => !COMMON_TOKENS.has(w.toUpperCase()));
        const tokensForSearch = (tokensPreferred.length >= 2 ? tokensPreferred : tokensAll);
        console.log(`[Environmental Sanctions] Tokens (preferred): ${JSON.stringify(tokensPreferred)}`);
        console.log(`[Environmental Sanctions] Tokens (fallback): ${JSON.stringify(tokensAll)}`);

        const normalizeRut = (r: unknown) => String(r || '').replace(/\./g, '').trim().toUpperCase();
        const rutRaw = (logEntry as any)?.filteredDetails?.rut || (logEntry as any)?.rut || '';
        const rutNorm = normalizeRut(rutRaw);
        const rutVariants = Array.from(new Set([rutNorm, rutNorm.replace(/-/g, '')].filter(Boolean)));

        // 0) Match by RUT when available in SNIFA DB
        if (sanctions.length === 0 && rutVariants.length > 0) {
          sanctions = await SnifaSancionatorio.find({
            ...fastCheckFilter,
            rut: { $in: rutVariants }
          });
          console.log(`[Environmental Sanctions] RUT match (${rutVariants.join(' / ')}) found: ${sanctions.length} results`);
        }

        // 1) Exact match
        if (sanctions.length === 0) {
          sanctions = await SnifaSancionatorio.find({
            ...fastCheckFilter,
            $or: [
              { nombre: razonSocialRaw },
              { razonSocial: razonSocialRaw }
            ]
          });
          console.log(`[Environmental Sanctions] Exact match found: ${sanctions.length} results`);
        }

        // 2) Case-insensitive exact match
        if (sanctions.length === 0) {
          const exactRegex = new RegExp(`^${escapeRegex(razonSocialRaw)}$`, 'i');
          sanctions = await SnifaSancionatorio.find({
            ...fastCheckFilter,
            $or: [
              { nombre: { $regex: exactRegex } },
              { razonSocial: { $regex: exactRegex } }
            ]
          });
          console.log(`[Environmental Sanctions] Case-insensitive match found: ${sanctions.length} results`);
        }

        // 3) Ordered phrase search using first two distinctive tokens
        if (sanctions.length === 0 && tokensForSearch.length > 1) {
          const phraseRegex = new RegExp(tokensForSearch.slice(0, 2).map(escapeRegex).join('\\s+'), 'i');
          sanctions = await SnifaSancionatorio.find({
            ...fastCheckFilter,
            $or: [
              { nombre: { $regex: phraseRegex } },
              { razonSocial: { $regex: phraseRegex } }
            ]
          });
          console.log(`[Environmental Sanctions] Ordered phrase search (${tokensForSearch.slice(0, 2).join(' ')}) found: ${sanctions.length} results`);
        }

        // 4) AND search: require all distinctive tokens present
        if (sanctions.length === 0 && tokensForSearch.length > 0) {
          const selectedTokens = tokensForSearch.slice().sort((a, b) => b.length - a.length).slice(0, 4);
          const andClauses = selectedTokens.map(w => {
            const tokenRegex = new RegExp(`\\b${escapeRegex(w)}\\b`, 'i');
            return {
              $or: [
                { nombre: { $regex: tokenRegex } },
                { razonSocial: { $regex: tokenRegex } }
              ]
            };
          });
          sanctions = await SnifaSancionatorio.find({ ...fastCheckFilter, $and: andClauses }).limit(200);
          console.log(`[Environmental Sanctions] AND-token search (${selectedTokens.join(', ')}) found: ${sanctions.length} results`);
        }

        // 5) Fallback: require at least one long distinctive token (>=5 chars) and another token if available
        if (sanctions.length === 0 && tokensForSearch.length > 0) {
          const sortedTokens = tokensForSearch.slice().sort((a, b) => b.length - a.length);
          const primary = sortedTokens.find(w => w.length >= 5) || sortedTokens[0];
          const secondary = sortedTokens.find(w => w !== primary);
          const andTokens = secondary ? [primary, secondary] : [primary];

          const andClauses = andTokens.map(w => {
            const tokenRegex = new RegExp(`\\b${escapeRegex(w)}\\b`, 'i');
            return {
              $or: [
                { nombre: { $regex: tokenRegex } },
                { razonSocial: { $regex: tokenRegex } }
              ]
            };
          });

          sanctions = await SnifaSancionatorio.find({ ...fastCheckFilter, $and: andClauses }).limit(200);
          console.log(`[Environmental Sanctions] Fallback AND on top tokens (${andTokens.join(', ')}) result: ${sanctions.length}`);
        }

        // 6) Filter out false positives by token overlap ratio
        if (sanctions.length > 0 && tokensForSearch.length > 0) {
          const selectedTokens = tokensForSearch.slice().sort((a, b) => b.length - a.length).slice(0, 4);
          const filterTokens = selectedTokens.length > 0 ? selectedTokens : tokensForSearch;
          const isUsingPreferredTokens = tokensPreferred.length >= 2;
          const distinctiveSet = new Set(filterTokens.map(t => t.toLowerCase()));
          const filtered = sanctions.filter(s => {
            const tokenFilter = (w: string) => {
              if (isStopword(w)) return false;
              if (isUsingPreferredTokens && COMMON_TOKENS.has(w.toUpperCase())) return false;
              return true;
            };
            const nameTokens = getTokens(s.nombre || '').filter(tokenFilter).map(w => w.toLowerCase());
            const razonTokens = getTokens(s.razonSocial || '').filter(tokenFilter).map(w => w.toLowerCase());

            const nameMatchCount = nameTokens.filter(w => distinctiveSet.has(w)).length;
            const razonMatchCount = razonTokens.filter(w => distinctiveSet.has(w)).length;
            const maxMatches = Math.max(nameMatchCount, razonMatchCount);

            const minRequired = filterTokens.length <= 2
              ? filterTokens.length
              : Math.max(2, Math.ceil(filterTokens.length * 0.75));

            return maxMatches >= minRequired;
          });
          if (filtered.length !== sanctions.length) {
            console.log(`[Environmental Sanctions] Filtered ${sanctions.length - filtered.length} possible false positives`);
          }
          sanctions = filtered;
        }

        // 7) Logs of results or sample entries
        if (sanctions.length === 0) {
          const sampleEntries = await SnifaSancionatorio.find(fastCheckFilter).limit(5);
          console.log(`[Environmental Sanctions] No matches found. Sample DB entries:`);
          sampleEntries.forEach((entry, index) => {
            console.log(`  ${index + 1}. "${entry.nombre}"`);
          });
        } else {
          console.log(`[Environmental Sanctions] Found matches:`);
          sanctions.slice(0, Number(process.env.SANCTIONS_PREVIEW_LIMIT || 3)).forEach((sanction, index) => {
            console.log(`  ${index + 1}. "${sanction.nombre}"`);
          });
        }

        rulObj.detected = sanctions.length > 0;
        rulObj.score = sanctions.length;
      } catch (error) {
        console.error('[Environmental Sanctions] Error checking environmental sanctions:', error);
        rulObj.detected = false;
      }
    } else {
      console.log('[Environmental Sanctions] No razonSocial found in logEntry');
      rulObj.detected = false;
    }

    if (rulObj.detected) {
      (rulObj as any).details = sanctions.map(s => s.toObject());
      (rulObj as any).details = RiskDetailsFormatter.formatDetails(rulObj.label, (rulObj as any).details);
      //take out _id from each detail
      for (let detail of (rulObj as any).details) {
        delete detail._id;
        delete detail.linkSNIFA_UF;
        delete detail.linkSNIFA;
        delete detail.createdAt;
        delete detail.updatedAt;
        delete detail.__v;
        delete detail.fechaActualizacion;
        delete detail.uploadedBy;
      }
    } else {
      (rulObj as any).details = [];
    }

    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }

    complianceArray.push(rulObj);
    return rulObj.detected;
  }

  private static async checkProcesoEnvironmentalSanctions(logEntry: ISheriffDataLog, complianceArray: any[], rulObj: any) {

    const razonSocialRaw = logEntry.filteredDetails.razonSocial;

    console.log(`[Proceso Environmental Sanctions] Searching for: "${razonSocialRaw}"`);
    let sanctions = [] as any[];
    if (razonSocialRaw) {
      try {
        const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const normalize = (s: string) => s
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[.,;:"'()]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const fastCheckFilter = { fastCheckProcesoSancionatorio: { $regex: /^SI$/i } };
        const STOPWORDS = new Set([
          'SPA', 'SP.A', 'SpA', 'SA', 'S.A', 'S.A.', 'LTDA', 'LTD.A', 'LIMITADA', 'ANONIMA', 'SOCIEDAD',
          'DE', 'LA', 'EL', 'Y', 'DEL', 'EIRL', 'E.I.R.L', 'E.I.R.L.', 'E.U.', 'CORP', 'CORPORACION', 'CORPORACIÓN',
          'COMERCIAL', 'COMERCIALIZADORA', 'SERVICIOS', 'INDUSTRIAL', 'INTERNACIONAL', 'DISTRIBUIDORA', 'COMPANIA', 'COMPAÑIA', 'COMPAÑÍA', 'CHILE'
        ]);
        const COMMON_TOKENS = new Set([
          'INMOBILIARIA',
          'INVERSION',
          'INVERSIONES',
          'CONSTRUCTORA',
          'INGENIERIA',
          'TRANSPORTES',
          'AGRÍCOLA',
          'AGRICOLA',
          'MINERA',
          'FORESTAL',
          'INMOBILIARIAS',
        ]);
        const isStopword = (w: string) => STOPWORDS.has(w.toUpperCase());
        const getTokens = (s: string) => normalize(s).split(/\s+/).filter(w => w.length > 2);

        const tokensAll = getTokens(razonSocialRaw).filter(w => !isStopword(w));
        const tokensPreferred = tokensAll.filter(w => !COMMON_TOKENS.has(w.toUpperCase()));
        const tokensForSearch = (tokensPreferred.length >= 2 ? tokensPreferred : tokensAll);
        console.log(`[Proceso Environmental Sanctions] Tokens (preferred): ${JSON.stringify(tokensPreferred)}`);
        console.log(`[Proceso Environmental Sanctions] Tokens (fallback): ${JSON.stringify(tokensAll)}`);

        const normalizeRut = (r: unknown) => String(r || '').replace(/\./g, '').trim().toUpperCase();
        const rutRaw = (logEntry as any)?.filteredDetails?.rut || (logEntry as any)?.rut || '';
        const rutNorm = normalizeRut(rutRaw);
        const rutVariants = Array.from(new Set([rutNorm, rutNorm.replace(/-/g, '')].filter(Boolean)));

        // 0) Match by RUT when available in SNIFA DB
        if (sanctions.length === 0 && rutVariants.length > 0) {
          sanctions = await SnifaSancionatorio.find({
            ...fastCheckFilter,
            rut: { $in: rutVariants }
          });
          console.log(`[Proceso Environmental Sanctions] RUT match (${rutVariants.join(' / ')}) found: ${sanctions.length} results`);
        }

        // 1) Exact match
        if (sanctions.length === 0) {
          sanctions = await SnifaSancionatorio.find({
            ...fastCheckFilter,
            $or: [
              { nombre: razonSocialRaw },
              { razonSocial: razonSocialRaw }
            ]
          });
          console.log(`[Proceso Environmental Sanctions] Exact match found: ${sanctions.length} results`);
        }

        // 2) Case-insensitive exact match
        if (sanctions.length === 0) {
          const exactRegex = new RegExp(`^${escapeRegex(razonSocialRaw)}$`, 'i');
          sanctions = await SnifaSancionatorio.find({
            ...fastCheckFilter,
            $or: [
              { nombre: { $regex: exactRegex } },
              { razonSocial: { $regex: exactRegex } }
            ]
          });
          console.log(`[Proceso Environmental Sanctions] Case-insensitive match found: ${sanctions.length} results`);
        }

        // 3) Ordered phrase search using first two distinctive tokens
        if (sanctions.length === 0 && tokensForSearch.length > 1) {
          const phraseRegex = new RegExp(tokensForSearch.slice(0, 2).map(escapeRegex).join('\\s+'), 'i');
          sanctions = await SnifaSancionatorio.find({
            ...fastCheckFilter,
            $or: [
              { nombre: { $regex: phraseRegex } },
              { razonSocial: { $regex: phraseRegex } }
            ]
          });
          console.log(`[Proceso Environmental Sanctions] Ordered phrase search (${tokensForSearch.slice(0, 2).join(' ')}) found: ${sanctions.length} results`);
        }

        // 4) AND search: require all distinctive tokens present
        if (sanctions.length === 0 && tokensForSearch.length > 0) {
          const selectedTokens = tokensForSearch.slice().sort((a, b) => b.length - a.length).slice(0, 4);
          const andClauses = selectedTokens.map(w => {
            const tokenRegex = new RegExp(`\\b${escapeRegex(w)}\\b`, 'i');
            return {
              $or: [
                { nombre: { $regex: tokenRegex } },
                { razonSocial: { $regex: tokenRegex } }
              ]
            };
          });
          sanctions = await SnifaSancionatorio.find({ ...fastCheckFilter, $and: andClauses }).limit(200);
          console.log(`[Proceso Environmental Sanctions] AND-token search (${selectedTokens.join(', ')}) found: ${sanctions.length} results`);
        }

        // 5) Fallback: require at least one long distinctive token (>=5 chars) and another token if available
        if (sanctions.length === 0 && tokensForSearch.length > 0) {
          const sortedTokens = tokensForSearch.slice().sort((a, b) => b.length - a.length);
          const primary = sortedTokens.find(w => w.length >= 5) || sortedTokens[0];
          const secondary = sortedTokens.find(w => w !== primary);
          const andTokens = secondary ? [primary, secondary] : [primary];

          const andClauses = andTokens.map(w => {
            const tokenRegex = new RegExp(`\\b${escapeRegex(w)}\\b`, 'i');
            return {
              $or: [
                { nombre: { $regex: tokenRegex } },
                { razonSocial: { $regex: tokenRegex } }
              ]
            };
          });

          sanctions = await SnifaSancionatorio.find({ ...fastCheckFilter, $and: andClauses }).limit(200);
          console.log(`[Proceso Environmental Sanctions] Fallback AND on top tokens (${andTokens.join(', ')}) result: ${sanctions.length}`);
        }

        // 6) Filter out false positives by token overlap ratio
        if (sanctions.length > 0 && tokensForSearch.length > 0) {
          const selectedTokens = tokensForSearch.slice().sort((a, b) => b.length - a.length).slice(0, 4);
          const filterTokens = selectedTokens.length > 0 ? selectedTokens : tokensForSearch;
          const isUsingPreferredTokens = tokensPreferred.length >= 2;
          const distinctiveSet = new Set(filterTokens.map(t => t.toLowerCase()));
          const filtered = sanctions.filter(s => {
            const tokenFilter = (w: string) => {
              if (isStopword(w)) return false;
              if (isUsingPreferredTokens && COMMON_TOKENS.has(w.toUpperCase())) return false;
              return true;
            };
            const nameTokens = getTokens(s.nombre || '').filter(tokenFilter).map(w => w.toLowerCase());
            const razonTokens = getTokens(s.razonSocial || '').filter(tokenFilter).map(w => w.toLowerCase());

            const nameMatchCount = nameTokens.filter(w => distinctiveSet.has(w)).length;
            const razonMatchCount = razonTokens.filter(w => distinctiveSet.has(w)).length;
            const maxMatches = Math.max(nameMatchCount, razonMatchCount);

            const minRequired = filterTokens.length <= 2
              ? filterTokens.length
              : Math.max(2, Math.ceil(filterTokens.length * 0.75));

            return maxMatches >= minRequired;
          });
          if (filtered.length !== sanctions.length) {
            console.log(`[Proceso Environmental Sanctions] Filtered ${sanctions.length - filtered.length} possible false positives`);
          }
          sanctions = filtered;
        }

        // 7) Logs of results or sample entries
        if (sanctions.length === 0) {
          const sampleEntries = await SnifaSancionatorio.find(fastCheckFilter).limit(5);
          console.log(`[Proceso Environmental Sanctions] No matches found. Sample DB entries:`);
          sampleEntries.forEach((entry, index) => {
            console.log(`  ${index + 1}. "${entry.nombre}"`);
          });
        } else {
          console.log(`[Proceso Environmental Sanctions] Found matches:`);
          sanctions.slice(0, Number(process.env.SANCTIONS_PREVIEW_LIMIT || 3)).forEach((sanction, index) => {
            console.log(`  ${index + 1}. "${sanction.nombre}"`);
          });
        }

        rulObj.detected = sanctions.length > 0;
        rulObj.score = sanctions.length;
      } catch (error) {
        console.error('[Proceso Environmental Sanctions] Error checking environmental sanctions:', error);
        rulObj.detected = false;
      }
    } else {
      console.log('[Proceso Environmental Sanctions] No razonSocial found in logEntry');
      rulObj.detected = false;
    }

    if (rulObj.detected) {
      (rulObj as any).details = sanctions.map(s => s.toObject());
      (rulObj as any).details = RiskDetailsFormatter.formatDetails(rulObj.label, (rulObj as any).details);
      //take out _id from each detail
      for (let detail of (rulObj as any).details) {
        delete detail._id;
        delete detail.linkSNIFA_UF;
        delete detail.linkSNIFA;
        delete detail.createdAt;
        delete detail.updatedAt;
        delete detail.__v;
        delete detail.fechaActualizacion;
        delete detail.uploadedBy;
      }
    } else {
      (rulObj as any).details = [];
    }

    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }

    complianceArray.push(rulObj);
    return rulObj.detected;
  }


  private static async evaluateComplianceRules(logEntry: ISheriffDataLog) {

    let complianceArray = [];

    let rulObj = {
      label: "Condenas Ley 21.121",
      impacto: "severo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Dettagli prelevati da logEntry.summaryData.data.ley21121Records e normalizzati; rilevazione basata su logEntry.summaryData.data.ley21121Detected"
    };

    //check db by rut for condenas ley 21.2021.121

    // Since we can't use async/await in this synchronous function,
    // we'll need to check for the presence of the RUT in the Ley21121 collection
    // before calling this function and store that information in the logEntry.

    // For now, we'll set detected to false and add a comment indicating that
    // this should be checked before calling calculateRisk

    // TODO: Check if the RUT exists in the Ley21121 collection before calling calculateRisk
    // and pass that information to this function

    // Check if the summaryData contains information about Ley21121
    if (logEntry.summaryData?.data?.ley21121Detected === true) {
      (rulObj as any).details = logEntry.summaryData?.data?.ley21121Records || [];
      (rulObj as any).details = RiskDetailsFormatter.formatDetails(rulObj.label, (rulObj as any).details);
      //details debe traer las siguientes 4 columnasdebe indicar: Rol de la Causa - Fechas - Duración - Motivo
      if ((rulObj as any).details.length > 0) {
        for (let detail of (rulObj as any).details) {
          detail.rol = detail.rolCausa || null;
          detail.Desde = RiskCalculationService.formatDateDDMMYYYY(detail.fechaDesde) || null;
          detail.Hasta = RiskCalculationService.formatDateDDMMYYYY(detail.fechaHasta) || null;
          detail.duracion = detail.duracion || null;
          detail.motivo = detail.motivo || null;
          delete detail.rolCausa;
          delete detail.fechaDesde;
          delete detail.fechaHasta;
          delete detail.duracion;
          delete detail.rut;
          delete detail.razonSocial;
          delete detail.createdAt;
          delete detail.updatedAt;
          delete detail.__v;

        }

      }

      rulObj.detected = true;
      //console.log(`[evaluateComplianceRules] RUT ${logEntry.rut} found in Ley21121 collection`);
      console.warn(879, (rulObj as any).details);
    } else {
      (rulObj as any).details = [];
      rulObj.detected = false;
    }
    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }
    complianceArray.push(rulObj);

    rulObj = {
      label: "Condenas Ley 20.393",
      impacto: "severo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Dettagli prelevati da logEntry.summaryData.data.ley20393Records e normalizzati; rilevazione basata su logEntry.summaryData.data.ley20393Detected"
    };

    // Check if the RUT exists in the Ley20393 collection
    if (logEntry.summaryData?.data?.ley20393Detected === true) {
      (rulObj as any).details = logEntry.summaryData?.data?.ley20393Records || [];
      (rulObj as any).details = RiskDetailsFormatter.formatDetails(rulObj.label, (rulObj as any).details);
      rulObj.detected = true;

      if ((rulObj as any).details.length > 0) {
        for (let detail of (rulObj as any).details) {
          detail.rol = detail.rolCausa || null;
          detail.Desde = RiskCalculationService.formatDateDDMMYYYY(detail.fechaDesde) || null;
          detail.Hasta = RiskCalculationService.formatDateDDMMYYYY(detail.fechaHasta) || null;
          detail.duracion = detail.duracion || null;
          detail.motivo = detail.motivo || null;
          delete detail.rolCausa;
          delete detail.fechaDesde;
          delete detail.fechaHasta;
          delete detail.duracion;
          delete detail.rut;
          delete detail.razonSocial;
          delete detail.createdAt;
          delete detail.updatedAt;
          delete detail.__v;

        }

      }


      console.log(`[evaluateComplianceRules] RUT ${logEntry.rut} found in Ley20393 collection`);



    } else {
      (rulObj as any).details = [];
      rulObj.detected = false;
    }
    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }
    complianceArray.push(rulObj);
    /*
        console.warn(883, "*******************************************************");
        console.warn(883, logEntry.filteredDetails.sheriffV2Data.compliance.data);
        console.warn(883, "*******************************************************");
    */

    //sheriffV2 - Listas Internacionales
    rulObj = {
      label: "Listas Internacionales",
      impacto: "severo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Dettagli sintetici derivati da logEntry.filteredDetails.sheriffV2Data.compliance.data.listasInternacionales.coincidencias"
    };

    if (logEntry.filteredDetails.sheriffV2Data) {
      (rulObj as any).details = logEntry.filteredDetails.sheriffV2Data.compliance.data.listasInternacionales.coincidencias;
    } else {
      (rulObj as any).details = [];
    }

    if ((rulObj as any).details.length > 0) {
      rulObj.detected = true;
    } else {
      rulObj.detected = false;
    }

    {
      const sociosDetected = await RiskCalculationService.detectSociosCompliance(logEntry, rulObj.label);
      if (sociosDetected.length > 0) {
        rulObj.detected = true;
        (rulObj as any).details = Array.isArray((rulObj as any).details) ? (rulObj as any).details : [];
        (rulObj as any).details.push({ [RiskCalculationService.getSociosKeyForLabel(rulObj.label)]: sociosDetected });
      }
    }
    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }
    complianceArray.push(rulObj);

    rulObj = {
      label: "Sanciones Medioambientales",
      impacto: "significativo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Ricerca in DB SnifaSancionatorio usando sii.razonSocial con matching incrementale; dettagli sanificati dalle entità Mongoose"
    };

    // Check environmental sanctions in database
    const hasEnvironmentalSanctions = await this.checkEnvironmentalSanctions(logEntry, complianceArray, rulObj);
    if (hasEnvironmentalSanctions) {
      console.log(`[Environmental Sanctions] Found environmental sanctions for RUT ${logEntry.rut}`);
    } else {
      console.warn(`[Environmental Sanctions] No environmental sanctions found for RUT ${logEntry.rut}`);
    }

    rulObj = {
      label: "Proceso Sanciones Medioambientales",
      impacto: "significativo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Ricerca in DB SnifaSancionatorio usando sii.razonSocial con matching incrementale; dettagli sanificati dalle entità Mongoose"
    };

    // Check environmental sanctions in database
    const hasProcesoosecorPEnvironmentalSanctions = await this.checkProcesoEnvironmentalSanctions(logEntry, complianceArray, rulObj);
    if (hasProcesoosecorPEnvironmentalSanctions) {
      console.log(`[Proceso Environmental Sanctions] Found environmental sanctions for RUT ${logEntry.rut}`);
    } else {
      console.warn(`[Proceso osecorPEnvironmental Sanctions] No environmental sanctions found for RUT ${logEntry.rut}`);
    }



    rulObj = {
      label: "Listas Propias Alto Impacto",
      impacto: "severo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Dettagli da logEntry.summaryData.data.lpaltosRecords; pulizia di campi superflui"
    }

    //check if rut exist in lpaltos collection
    if (logEntry.summaryData?.data?.lpaltosDetected === true) {
      rulObj.detected = true;
      (rulObj as any).details = logEntry.summaryData.data.lpaltosRecords || [];
      (rulObj as any).details = RiskDetailsFormatter.formatDetails(rulObj.label, (rulObj as any).details);
      for (let detail of (rulObj as any).details) {
        detail.fechaIncorporacion = RiskCalculationService.formatDateDDMMYYYY(detail.fechaIncorporacion) || "";
        delete detail.tenant;
        delete detail.createdAt;
        delete detail.updatedAt;
        delete detail.__v;
      }
      console.log(`[evaluateComplianceRules] RUT ${logEntry.rut} found in lpaltos collection`);
      //      console.warn(1862,logEntry.summaryData.data);
    } else {
      (rulObj as any).details = [];
      rulObj.detected = false;
    }

    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }

    complianceArray.push(rulObj);
    rulObj = {
      label: "Listas Propias Mediano Impacto",
      impacto: "significativo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Dettagli da logEntry.summaryData.data.lpmediosRecords; pulizia di campi superflui"
    }

    //check if rut exist in lpmedios collection
    if (logEntry.summaryData?.data?.lpmediosDetected === true) {
      rulObj.detected = true;
      (rulObj as any).details = logEntry.summaryData.data.lpmediosRecords || [];
      (rulObj as any).details = RiskDetailsFormatter.formatDetails(rulObj.label, (rulObj as any).details);
      for (let detail of (rulObj as any).details) {
        delete detail.tenant;
        delete detail.createdAt;
        delete detail.updatedAt;
        delete detail.__v;
      }
      console.log(`[evaluateComplianceRules] RUT ${logEntry.rut} found in lpmedios collection`);
    } else {
      (rulObj as any).details = [];
      rulObj.detected = false;
    }

    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }

    complianceArray.push(rulObj);


    rulObj = {
      label: "Reputación Pública y Mediática",
      impacto: "severo",
      risk: "critico",
      detected: false,
      score: 0,
      dataSourceDesc: "Dettagli da sheriffLogData.filteredDetails.compliance.noticias.coincidencias"
    }

    //check if rut exist in lpmedios collection
    if (logEntry.filteredDetails?.compliance?.noticias?.coincidencias?.length > 0) {
      rulObj.detected = true;
      (rulObj as any).details = logEntry.filteredDetails.compliance.noticias.coincidencias || [];
      (rulObj as any).details = RiskDetailsFormatter.formatDetails(rulObj.label, (rulObj as any).details);
    } else {
      (rulObj as any).details = [];
      rulObj.detected = false;
    }

    console.warn(909, `[evaluateComplianceRules] RUT ${logEntry.rut} found in noticias coincidencias collection`, rulObj);

    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }

    complianceArray.push(rulObj);



//AV 080426
    //sheriffV2 
    rulObj = {
      label: "PEP Chile",
      impacto: "significativo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Rilevazione da compliance.summary; dettagli provenienti da pepChileRecords"
    }

    if (logEntry.filteredDetails.sheriffV2Data) {
      (rulObj as any).details = logEntry.filteredDetails.sheriffV2Data.compliance.data.pepChile.coincidencias;
    } else {
      (rulObj as any).details = [];
    }

    if ((rulObj as any).details.length > 0) {
      rulObj.detected = true;
      (rulObj as any).details = RiskDetailsFormatter.formatDetails(rulObj.label, (rulObj as any).details);
    }
    {
      const sociosDetected = await RiskCalculationService.detectSociosCompliance(logEntry, rulObj.label);
      if (sociosDetected.length > 0) {
        rulObj.detected = true;
        (rulObj as any).details = Array.isArray((rulObj as any).details) ? (rulObj as any).details : [];
        (rulObj as any).details.push({ [RiskCalculationService.getSociosKeyForLabel(rulObj.label)]: sociosDetected });
      }
    }

    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }

    complianceArray.push(rulObj);
//AV 080426


 //causas penales 030426
    rulObj = {
      label: "Causas Penales",
      impacto: "severo",
      risk: "critico",
      detected: false,
      score: 0,
      dataSourceDesc: "Dettagli da logEntry.filteredDetails.compliance.penal.coincidencias"
    }

   // console.warn(1046,"penales",(logEntry?.filteredDetails?.sheriffV2Data?.compliance.data.penal.coincidencias));
    
    if (logEntry.filteredDetails.sheriffV2Data) {
      (rulObj as any).details = logEntry.filteredDetails.sheriffV2Data.compliance.data.penal.coincidencias;
    } else {
      (rulObj as any).details = [];
    }

    if ((rulObj as any).details.length > 0) {
      rulObj.detected = true;
      (rulObj as any).details = RiskDetailsFormatter.formatDetails(rulObj.label, (rulObj as any).details);
    }
  //  console.warn(1056,"casos",(rulObj as any).details);


    {
      const sociosDetected = await RiskCalculationService.detectSociosCompliance(logEntry, rulObj.label);
      if (sociosDetected.length > 0) {
        rulObj.detected = true;
        (rulObj as any).details = Array.isArray((rulObj as any).details) ? (rulObj as any).details : [];
        (rulObj as any).details.push({ [RiskCalculationService.getSociosKeyForLabel(rulObj.label)]: sociosDetected });
      }
    }
    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }

    complianceArray.push(rulObj);

    //sheriffV2 
    rulObj = {
      label: "Familiares PEP",
      impacto: "significativo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Rilevazione da compliance.summary; dettaglio sintetico senza elenco nominativo"
    }

    if (logEntry.filteredDetails.sheriffV2Data) {
      (rulObj as any).details = logEntry.filteredDetails.sheriffV2Data.compliance.data.familiaresPep.coincidencias;
    } else {
      (rulObj as any).details = [];
    }

    if ((rulObj as any).details.length > 0) {
      rulObj.detected = true;
      (rulObj as any).details = RiskDetailsFormatter.formatDetails(rulObj.label, (rulObj as any).details);
    }

    {
      const sociosDetected = await RiskCalculationService.detectSociosCompliance(logEntry, rulObj.label);
      if (sociosDetected.length > 0) {
        rulObj.detected = true;
        (rulObj as any).details = Array.isArray((rulObj as any).details) ? (rulObj as any).details : [];
        (rulObj as any).details.push({ [RiskCalculationService.getSociosKeyForLabel(rulObj.label)]: sociosDetected });
      }
    }

    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }

    complianceArray.push(rulObj);

    return complianceArray;


  }
  private static getSocioRuts(logEntry: ISheriffDataLog): string[] {
    const socios: any[] = Array.isArray((logEntry as any)?.companyGeneralInfo?.socios)
      ? (logEntry as any).companyGeneralInfo.socios
      : [];
    const ruts: string[] = [];
    for (const s of socios) {
      if (s?.rut) ruts.push(String(s.rut));
    }
    return Array.from(new Set(ruts));
  }
  private static async detectSociosCompliance(logEntry: ISheriffDataLog, label: string): Promise<{ rut: string; name: string; count: number }[]> {
    const ruts = RiskCalculationService.getSocioRuts(logEntry);
    const tenantId = (logEntry as any).tenantId;
    const detected: { rut: string; name: string; count: number }[] = [];
    for (const sRut of ruts) {
      const clean = sRut.replace(/[.-]/g, '').toUpperCase();
      const withDash = clean ? `${clean.slice(0, -1)}-${clean.slice(-1)}` : sRut;
      const candidate = await Result.findOne({
        tenantId,
        archived: { $ne: true },
        $or: [{ rut: sRut }, { rut: withDash }, { rut: clean }]
      }).sort({ createdAt: -1 }).lean();
      const summary = (candidate as any)?.details?.compliance?.summary;
      if (Array.isArray(summary)) {
        const liItem = summary.find((i: any) => i && i.table === label);
        const count = Number(liItem?.countResults || 0);
        const name = ((candidate as any)?.details?.razonSocial) || (candidate as any)?.name || "";
        if (count > 0) detected.push({ rut: sRut, name, count });
      }
    }
    console.warn(`[detectSociosCompliance] Socios detected for RUT ${logEntry.rut} with label ${label}:`, detected);
    return detected;
  }
  private static getSociosKeyForLabel(label: string): string {
    switch (label) {
      case "Listas Internacionales":
        return "sociosListasInternacionalesDetected";
      case "PEP Chile":
        return "sociosPepChileDetected";
      case "Familiares PEP":
        return "sociosFamiliaresPepDetected";
      default:
        return "sociosDetected";
    }
  }

  private static async evaluateCapitalHumanoRules(logEntry: ISheriffDataLog) {
    let resultArray = [];
    let rulObj = {
      label: "Condenas por Prácticas Antisindicales",
      impacto: "severo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Query su AntiunionCase per RUT in vari formati; mapping dei campi principali"
    };

    // Search for antiunion cases by RUT
    try {
      const rut = logEntry.rut;
      if (rut) {
        // Clean the input RUT (remove dots and dashes)
        const cleanRut = rut.replace(/[.-]/g, '');
        // Search for RUT in different formats:
        // 1. Exact match with original format
        // 2. Match with dots and dash (XX.XXX.XXX-X)
        // 3. Match with only dash (XXXXXXXX-X)
        // 4. Match with clean format (XXXXXXXXX)
        const antiunionCases = await AntiunionCase.find({
          $or: [
            { rut: { $regex: `^${rut.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
            { rut: { $regex: `^${cleanRut.slice(0, -1).replace(/(\d{2})(\d{3})(\d{3})/, '$1\\.$2\\.$3')}-${cleanRut.slice(-1)}$`, $options: 'i' } },
            { rut: { $regex: `^${cleanRut.slice(0, -1)}-${cleanRut.slice(-1)}$`, $options: 'i' } },
            { rut: { $regex: `^${cleanRut}$`, $options: 'i' } }
          ]
        });
        (logEntry as any).antiunionCases = antiunionCases;

        rulObj.detected = antiunionCases.length > 0;
        if (rulObj.detected) {
          (rulObj as any).details = RiskDetailsFormatter.formatDetails(rulObj.label, antiunionCases);
        } else {
          (rulObj as any).details = [];
        }
        rulObj.score = antiunionCases.length;
      }
    } catch (error) {
      console.error('Error searching antiunion cases:', error);
      rulObj.detected = false;
      rulObj.score = 0;
    }

    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }

    resultArray.push(rulObj);

    //equifax
    rulObj = {
      label: "Deuda Previsional Publicada",
      impacto: "significativo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Dettagli da equifaxCommercialData.credit.debtsSummary.bolab.commercialBolab filtrando injuryType != 'M'"
    };

    rulObj.detected = false;


    let deudaPrevisiionalPublicada: any[] = [];

    console.log("personType for rut", logEntry.filteredDetails.rut, logEntry.filteredDetails.compliancePersonType);

    if (logEntry.filteredDetails.compliancePersonType === 'juridical') {
      const bolab = (logEntry as any).equifaxData?.allData?.commercialData?.credit?.debtsSummary?.bolab?.commercialBolab;
      deudaPrevisiionalPublicada = Array.isArray(bolab) ? bolab : [];
    } else {
      deudaPrevisiionalPublicada = [];
    }
    const filteredDebts = deudaPrevisiionalPublicada.filter((entry: any) => {
      const it = (entry?.injuryType ?? entry?.injuryType ?? '').toString().toUpperCase();
      return it !== 'M';
    }) ?? [];
    (rulObj as any).details = RiskDetailsFormatter.formatDetails(rulObj.label, filteredDebts);
    for (let detail of (rulObj as any).details) {
      // Convert date from "AAAAMMDD" to "DD/MM/YYYY" format
      detail.boletinDate = detail.boletinDate ? detail.boletinDate.slice(6, 8) + "/" + detail.boletinDate.slice(4, 6) + "/" + detail.boletinDate.slice(0, 4) : "";
    }

    if ((rulObj as any).details.length > 0) {
      rulObj.detected = true;
    } else {
      rulObj.detected = false;
    }

    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    }

    resultArray.push(rulObj);

    /*
        // Check if compliance data exists
        const complianceData = logEntry.summaryData?.data?.compliance;
        if (!complianceData) {
          console.log("Warning: Missing compliance data in evaluateCapitalHumanoRules");
        }
          */

    //equifax - Multas Laborales
    rulObj = {
      label: "Multas Laborales",
      impacto: "significativo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Dettagli da filteredDetails.bolabTypePersonaJuridica/Natural filtrando voci con injuryType 'M'"
    };

    const bolabJ = Array.isArray((logEntry as any).filteredDetails?.bolabTypePersonaJuridica)
      ? (logEntry as any).filteredDetails.bolabTypePersonaJuridica
      : [];

    const bolabN = Array.isArray((logEntry as any).filteredDetails?.bolabTypePersonaNatural)
      ? (logEntry as any).filteredDetails.bolabTypePersonaNatural
      : [];


    const hasLaborFines = [...bolabJ, ...bolabN].some((entry: any) => {
      const it = (entry?.injuryType ?? entry?.injurytype ?? '').toString().toUpperCase();
      return it === 'M';
    });


    if (hasLaborFines) {
      rulObj.detected = true;
      const laborFines = [...bolabJ, ...bolabN];
      //filter only injuryType == M
      const filteredLaborFines = laborFines.filter((entry: any) => {
        const it = (entry?.injuryType ?? entry?.injurytype ?? '').toString().toUpperCase();
        return it === 'M';
      });
      (rulObj as any).details = RiskDetailsFormatter.formatDetails(rulObj.label, filteredLaborFines);
    } else {
      (rulObj as any).details = [];
    }

    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }
    //console.warn(1326,rulObj);
    resultArray.push(rulObj);

    //sheriffV2 - Deuda Previsional Presunta
    rulObj = {
      label: "Deuda Previsional Presunta",
      impacto: "significativo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Dettagli da logEntry.moraPrevisionalCasesData se moraPrevisionalSummary.totalCases > 0"
    };

    if (logEntry.filteredDetails.sheriffV2Data) {
//      (rulObj as any).details = logEntry.filteredDetails.sheriffV2Data.cobranzaLaboral.moraPrevisional.data;
      (rulObj as any).details = logEntry.filteredDetails.sheriffV2Data.cobranzaLaboral.moraPrevisional.data.casos;
      console.warn(1356,"casos",(rulObj as any).details);
    } else {
      (rulObj as any).details = [];
    }


    if ((rulObj as any).details.length > 0) {
      rulObj.detected = true;
      (rulObj as any).details = RiskDetailsFormatter.formatDetails(rulObj.label, (rulObj as any).details);
    }

    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }

    resultArray.push(rulObj);

    return resultArray;

  }

  private static evaluateLegalRules(logEntry: ISheriffDataLog) {
    // Check if necessary data exists
    if (!logEntry.summaryData?.data) {
      console.log("Warning: Missing summary data in evaluateLegalRules");
    }

    let resultArray = [];

    let rulObj = {
      label: "Quiebra Judicial",
      impacto: "severo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Dettagli derivati da summaryData.data.creditScoring.judicialBankruptcy"
    };
    console.warn(1204, logEntry.filteredDetails.sheriffV2Data.resumen.data.judicial.casosQuiebra);
    if (logEntry.filteredDetails.sheriffV2Data.resumen.data.judicial.casosQuiebra > 0) {
      (rulObj as any).details = ["Existe quiebra judicial"];
    } else {
      (rulObj as any).details = [];
    }

    if ((rulObj as any).details.length > 0) {
      rulObj.detected = true;
      (rulObj as any).details = RiskDetailsFormatter.formatDetails(rulObj.label, (rulObj as any).details);
    }

    /*
    if (logEntry.summaryData?.data?.creditScoring?.judicialBankruptcy === true) {
      rulObj.detected = true;
      (rulObj as any).details = [{
        "Quiebra Judicial": logEntry.summaryData?.data?.creditScoring.judicialBankruptcy
      }];
    } else {
      rulObj.detected = false;
      (rulObj as any).details = [];
    }
      */

    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }

    resultArray.push(rulObj);

    //equifax

    rulObj = {
      label: "Boletin Concursal", //AV chack also deuda previsional 177 194  37 195
      impacto: "significativo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Dettagli da equifaxCommercialData.credit.boletinConcursal.detailBoletinConcursal.commercialDetailBoletinConcursal"
    };

    const detailsBoletinConcursal = (logEntry as any).equifaxData?.allData?.commercialData?.credit?.boletinConcursal?.detailBoletinConcursal?.commercialDetailBoletinConcursal || [];

    //    console.warn(1543, detailsBoletinConcursal);
    if (detailsBoletinConcursal.length > 0) {
      rulObj.detected = true;
      (rulObj as any).details = RiskDetailsFormatter.formatDetails(rulObj.label, detailsBoletinConcursal);
      //(rulObj as any).details = detailsBoletinConcursal;
    } else {
      rulObj.detected = false;
      (rulObj as any).details = [];
    }

    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }

    resultArray.push(rulObj);

    rulObj = {
      label: "Causas Civiles",
      impacto: "significativo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Dettagli da logEntry.civilCasesData filtrando soggetti DDO/DDOR e rimuovendo link"
    };
    const v2: any = logEntry.filteredDetails.sheriffV2Data

    const civilCases = v2.judicial.civil.data.casos || [];
    //console.warn(1293, "------------->", civilCases);
    (rulObj as any).details = RiskDetailsFormatter.formatDetails(rulObj.label, civilCases || []);
    if ((rulObj as any).details.length > 0) {
      rulObj.detected = true;
    } else {
      rulObj.detected = false;
    }
    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }
    resultArray.push(rulObj);
    //---------------------------------------------------------------------------------

    rulObj = {
      label: "Causas Laborales",
      impacto: "significativo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Dettagli da logEntry.laboralCasesData filtrando soggetti DDO/DDOR e normalizzando date"
    };
    const laboralCases = v2.judicial.laboral.data || [];
    rulObj.score = laboralCases.length;
    (rulObj as any).details = RiskDetailsFormatter.formatDetails(rulObj.label, laboralCases || []);

    if ((rulObj as any).details.length > 0) {
      rulObj.detected = true;
    } else {
      rulObj.detected = false;
    }

    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }

    resultArray.push(rulObj);
    //---------------------------------------------------------------------------------
    rulObj = {
      label: "Causas de Cobranza Laboral",
      impacto: "significativo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Dettagli da logEntry.cobranzaCasesData con filtraggio campi e normalizzazione date"
    };

    //    console.warn(1365,v2.judicial);
    const cobranzaLaboral = v2?.judicial?.cobranza?.data || [];

    //    const cobranzaLaboral =  v2.cobranzaLaboral.multaLaboral.data || [];

    rulObj.score = cobranzaLaboral.length;
    (rulObj as any).details = RiskDetailsFormatter.formatDetails(rulObj.label, cobranzaLaboral || []);
    if ((rulObj as any).details.length > 0) {
      rulObj.detected = true;
    } else {
      rulObj.detected = false;
    }

    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }

    resultArray.push(rulObj);
    return resultArray;
  }
  /*
  private static detectMultasLaboralesFromBolab(logEntry: ISheriffDataLog) {
    try {
      const j = Array.isArray((logEntry as any).filteredDetails?.bolabTypePersonaJuridica)
        ? (logEntry as any).filteredDetails.bolabTypePersonaJuridica
        : [];
      const n = Array.isArray((logEntry as any).filteredDetails?.bolabTypePersonaNatural)
        ? (logEntry as any).filteredDetails.bolabTypePersonaNatural
        : [];
      //display log how many multas laborales are detected
      console.warn(1709, "logEntry.filteredDetails.bolabTypePersonaJuridica", j);
      console.warn(1709, "logEntry.filteredDetails.bolabTypePersonaNatural", n);
      return [...j, ...n].filter((e: any) => {
        const it = (e?.injuryType ?? e?.injurytype ?? '').toString().toUpperCase();
        return it === 'M';
      });
    } catch {
      return [];
    }
  }

  private static getCivilJudicialSummary(logEntry: ISheriffDataLog) {
    try {
      const v2: any = (logEntry as any).sheriffV2Data;

      const civilCases: any[] = Array.isArray(v2?.judicial?.civil?.data) ? v2.judicial.civil.data : [];
      const cobranzaCases: any[] = Array.isArray(v2?.judicial?.cobranza?.data) ? v2.judicial.cobranza.data : [];
      const laboralCases: any[] = Array.isArray(v2?.judicial?.laboral?.data) ? v2.judicial.laboral.data : [];

      const hasAnyCases = civilCases.length > 0 || cobranzaCases.length > 0 || laboralCases.length > 0;
      const judicialSummary: any = v2?.data?.judicial;

      if (!hasAnyCases && !judicialSummary) return null;

      const normalizeText = (value: any): string =>
        String(value ?? '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s]/gi, ' ')
          .toLowerCase()
          .trim()
          .replace(/\s+/g, ' ');

      const isArchived = (c: any): boolean => {
        const estado = normalizeText(c?.estado);
        const estadoCausa = normalizeText(c?.estadoCausa);
        const estadoActual = normalizeText(c?.estadoActual);

        if (estadoCausa.includes('archiv')) return true;
        if (estadoActual.includes('archiv')) return true;
        if (estado.includes('archiv')) return true;
        if (estado.includes('arch') && estado.includes('judic')) return true;
        return false;
      };

      const isConcluded = (c: any): boolean => {
        if (isArchived(c)) return true;
        const estado = normalizeText(c?.estado);
        const etapa = normalizeText(c?.etapa);
        const estadoActual = normalizeText(c?.estadoActual);
        return (
          estado.includes('conclu') ||
          estadoActual.includes('conclu') ||
          etapa.includes('terminad') ||
          etapa.includes('finaliz') ||
          estado.includes('cerrad') ||
          estadoActual.includes('cerrad')
        );
      };

      const isCurrent = (c: any): boolean => {
        if (isArchived(c) || isConcluded(c)) return false;
        return true;
      };

      const countWhere = (arr: any[], predicate: (x: any) => boolean): number => {
        let count = 0;
        for (const it of arr) if (predicate(it)) count++;
        return count;
      };

      const civilCurrent = countWhere(civilCases, isCurrent);
      const civilConcluded = countWhere(civilCases, isConcluded);

      const allJudicialCases = [...civilCases, ...cobranzaCases, ...laboralCases];
      const currentCases = countWhere(allJudicialCases, isCurrent);
      const archivedCases = countWhere(allJudicialCases, isArchived);
      const concludedCases = countWhere(allJudicialCases, isConcluded);

      return {
        civilActiveCases: civilCurrent,
        civilFiledCases: civilCases.length,
        civilConcludedCases: civilConcluded,
        currentCases,
        archivedCases,
        concludedCases,
        allCases: currentCases + archivedCases + concludedCases,
        activeFiledPosturesResume: judicialSummary?.posturasActivasPresentadas ?? null
      };
    } catch {
      return null;
    }
  }

  private static _getCivilJudicialSummary(logEntry: ISheriffDataLog) {
    try {
      const js: any = (logEntry as any).summaryData?.data?.judicialSummary;
      if (!js) return null;
      return {
        civilActiveCases: js.civilActiveCases ?? null,
        civilFiledCases: js.civilFiledCases ?? null,
        civilConcludedCases: js.civilConcludedCases ?? null,
        currentCases: js.currentCases ?? null,
        archivedCases: js.archivedCases ?? null,
        concludedCases: js.concludedCases ?? null,
        allCases: js.allCases ?? null,
        activeFiledPosturesResume: js.activeFiledPosturesResume ?? null
      };
    } catch {
      return null;
    }
  }
    */
  private static riskSummary(complianceRules: any, legalRules: any, capitalHumanoRules: any, financieroTributarioRules: any) {
 /*   console.warn(1722,"complianceRules",complianceRules);
    console.warn(1722,"legalRules",legalRules);
    console.warn(1722,"capitalHumanoRules",capitalHumanoRules);
    console.warn(1722,"financieroTributarioRules",financieroTributarioRules);
*/
    //count the number of all compliance rules with impacto "severo" and "significativo"  and detected rules
    let totalSevero = complianceRules.filter((rule: any) => rule.impacto === "severo" && rule.detected).length;
    let totalSignificativo = complianceRules.filter((rule: any) => rule.impacto === "significativo" && rule.detected).length;
    let totalDetected = complianceRules.filter((rule: any) => rule.detected).length;

    totalSevero = totalSevero + legalRules.filter((rule: any) => rule.impacto === "severo" && rule.detected).length;
    totalSignificativo = totalSignificativo + legalRules.filter((rule: any) => rule.impacto === "significativo" && rule.detected).length;
    totalDetected = totalDetected + legalRules.filter((rule: any) => rule.detected).length;

    totalSevero = totalSevero + capitalHumanoRules.filter((rule: any) => rule.impacto === "severo" && rule.detected).length;
    totalSignificativo = totalSignificativo + capitalHumanoRules.filter((rule: any) => rule.impacto === "significativo" && rule.detected).length;
    totalDetected = totalDetected + capitalHumanoRules.filter((rule: any) => rule.detected).length;

    totalSevero = totalSevero + financieroTributarioRules.filter((rule: any) => rule.impacto === "severo" && rule.detected).length;
    totalSignificativo = totalSignificativo + financieroTributarioRules.filter((rule: any) => rule.impacto === "significativo" && rule.detected).length;
    totalDetected = totalDetected + financieroTributarioRules.filter((rule: any) => rule.detected).length;
    //count the total of all parameters excluding "no_disponible" ones
    const totalParameters = complianceRules.filter((rule: any) => rule.risk !== "no_disponible").length +
      legalRules.filter((rule: any) => rule.risk !== "no_disponible").length +
      capitalHumanoRules.filter((rule: any) => rule.risk !== "no_disponible").length +
      financieroTributarioRules.filter((rule: any) => rule.risk !== "no_disponible").length;

    let semaphore = "green";

    if (totalSevero > 0) {
      semaphore = "red";
    } //if totalSignificativo > 70% of totalParameters detected is true
    else if (totalSignificativo > 0.7 * totalParameters) {
      semaphore = "red";
    }
    else if (totalSignificativo > 0.5 * totalParameters) {
      semaphore = "orange";
    } else {
      if (totalSignificativo > 0) {
        semaphore = "yellow";
      }
    }

    let semaphoreIcon = "🟢";
    let riskLevelDescription = "Riego Bajo";


    switch (semaphore) {
      case "red":
        semaphoreIcon = "🔴";
        riskLevelDescription = "Riesgo Crítico";
        break;
      case "orange":
        semaphoreIcon = "🟠";
        riskLevelDescription = "Riesgo Alto";
        break;
      case "yellow":
        semaphoreIcon = "🟡";
        riskLevelDescription = "Riesgo Medio";
        break;
      case "green":
        semaphoreIcon = "🟢";
        riskLevelDescription = "Riego Bajo";
        break;
      default:
        semaphoreIcon = "🟢";
        riskLevelDescription = "Riego Bajo";
        break;
    }


    const res = {
      totalSevero,
      totalSignificativo,
      totalDetected,
      totalParameters,
      semaphore,
      semaphoreIcon,
      riskLevelDescription
    };
    console.warn(1819,"riskSummary", res);

    return res;

  }

  private static evaluateFinancioeroTributarioRules(logEntry: ISheriffDataLog) {
    // Check if necessary data exists
    if (!logEntry.summaryData?.data) {
      console.log("Warning: Missing summary data in evaluateFinancioeroTributarioRules");
    }

    let resultArray = [];

    let rulObj = {
      label: "Término de Giro",
      impacto: "severo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Dettagli da summaryData.data.sii.observaciones trasformati in array di oggetti"
    };

    const terminoGiro = logEntry.filteredDetails.sheriffV2Data.resumen.data.identificacion.observaciones.toLowerCase().includes("término de giro")

    if (terminoGiro) {
      (rulObj as any).details = logEntry.filteredDetails.sheriffV2Data.resumen.data.identificacion.observaciones
      rulObj.detected = true;
    } else {
      (rulObj as any).details = [];
      rulObj.detected = false;
    }

    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }

    resultArray.push(rulObj);

    rulObj = {
      label: "Protestos y Morosidades",
      impacto: "significativo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Dettagli da filteredDetails.equifaxData.protestosMorosidadesPersonaNaturalList o fallback a debtsSummary.bed.commercialBed; normalizzazione date e rimozione campi"
    };

    // console.warn(1773, "filteredDetails.equifaxData", logEntry?.filteredDetails?.equifaxData);
    // (rulObj as any).details = [];
    (rulObj as any).details = logEntry?.filteredDetails?.equifaxData?.allData?.commercialData?.credit?.debtsSummary?.icom?.commercialIcom || [];
    if ((rulObj as any).details.length < 1) {
      //try with personal data list
      (rulObj as any).details = logEntry?.filteredDetails?.equifaxData?.protestosMorosidadesPersonaNaturalList || [];
    }
    //console.warn(1729,"details", (rulObj as any).details );

    /*
    if (logEntry.filteredDetails.equifaxData) {
      if (logEntry.filteredDetails.equifaxData.protestosMorosidadesPersonaNaturalList) {
        (rulObj as any).details = RiskDetailsFormatter.formatDetails(rulObj.label, logEntry.filteredDetails.equifaxData.protestosMorosidadesPersonaNaturalList || []);

      } else {
        (rulObj as any).details = RiskDetailsFormatter.formatDetails(rulObj.label, logEntry.filteredDetails.equifaxData.allData.commercialData.credit.debtsSummary.bed.commercialBed || []);
      }
    }
      */


    if ((rulObj as any).details.length > 0) {
      rulObj.detected = true;
    } else {
      (rulObj as any).details = [];
      rulObj.detected = false;
    }

    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }

    resultArray.push(rulObj);

    rulObj = {
      label: "Inicio de Actividades",
      impacto: "significativo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Dettagli da summaryData.data.sii.actividadEconomicaVigente con normalizzazione data; rilevazione basata sulla presenza di inicioActividades"
    };

    // console.warn(1693,"V2 ----> logEntry.filteredDetails",logEntry.filteredDetails.sheriffV2Data.resumen.data.identificacion);
    const inicioActividades = logEntry.filteredDetails.sheriffV2Data.resumen.data.identificacion.inicioActividades

    if (inicioActividades !== null) {
      //      const actividadEconomicaVigente = logEntry.filteredDetails.sheriffV2Data.resumen.data.identificacion.actividadEconomicaVigente
      (rulObj as any).details = logEntry.filteredDetails.sheriffV2Data.resumen.data.identificacion.actividadEconomicaVigente
      rulObj.detected = false;
    }
    else {
      (rulObj as any).details = [];
      rulObj.detected = true;
    }

    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }

    resultArray.push(rulObj);

    // Add "Contribuyente de difícil fiscalización" parameter
    rulObj = {
      label: "Contribuyente de difícil fiscalización",
      impacto: "significativo",
      risk: "bajo",
      detected: false,
      score: 0,
      dataSourceDesc: "Dettagli da summaryData.data.sii.situacionActual quando indica presenza in nómina"
    };

    // Check if the company is in the "Nómina de Contribuyentes de Difícil Fiscalización"
    const situacionActual = logEntry.filteredDetails.sheriffV2Data.resumen.data.identificacion.situacionActual;
    //const situacionActual = logEntry.summaryData?.data?.sii?.situacionActual;
    console.warn(1956, "situacionActual", situacionActual);
    if (!situacionActual) {
      (rulObj as any).details = [];
      rulObj.detected = false;
    }
    //check regex for "No se encuentra "
    else if(/No se encuentra/.test(situacionActual)){
    console.warn(1963, "situacionActual found regex", situacionActual);
      (rulObj as any).details = [];
      rulObj.detected = false;
    }
    else {
    console.warn(1968, "situacionActual positive", situacionActual);
      (rulObj as any).details = [{ situacionActual }];
      rulObj.detected = true;
    }

    /*
        if (situacionActual &&
          !situacionActual.toLowerCase().includes("No se encuentra")) {
          // If situacionActual doesn't contain the "no se encuentra" text, it means they are in the list
          (rulObj as any).details = [{ situacionActual }];
          rulObj.detected = true;
        } else {
          (rulObj as any).details = [];
          rulObj.detected = false;
        }
    */
    if (rulObj.detected) {
      switch (rulObj.impacto) {
        case "severo":
          rulObj.risk = "critico";
          break;
        case "significativo":
          rulObj.risk = "alto";
          break;
        default:
          rulObj.risk = "bajo";
          break;
      }
    } else {
      rulObj.risk = "bajo";
    }

    resultArray.push(rulObj);

    return resultArray;
  }


  private static countRisks(rules: any) {
    const counts = {
      complianceCriticalCount: 0, complianceHighCount: 0, complianceMediumCount: 0, complianceLowCount: 0,
      legalCriticalCount: 0, legalHighCount: 0, legalMediumCount: 0, legalLowCount: 0,
      capitalHumanoCriticalCount: 0, capitalHumanoHighCount: 0, capitalHumanoMediumCount: 0, capitalHumanoLowCount: 0,
      financieroTributarioCriticalCount: 0, financieroTributarioHighCount: 0, financieroTributarioMediumCount: 0, financieroTributarioLowCount: 0,
    };

    for (const key in rules.compliance) {
      if (rules.compliance.hasOwnProperty(key)) {
        const typedKey = key as keyof typeof rules.compliance;
        if (rules.compliance[typedKey].isCritical && rules.compliance[typedKey].detected) {
          counts.complianceCriticalCount++;
        } else if (rules.compliance[typedKey].risk === "alto" && rules.compliance[typedKey].detected) {
          counts.complianceHighCount++;
        } else if (rules.compliance[typedKey].risk === "medio" && rules.compliance[typedKey].detected) {
          counts.complianceMediumCount++;
        } else if (rules.compliance[typedKey].risk === "bajo" && rules.compliance[typedKey].detected) {
          counts.complianceLowCount++;
        }
      }
    }

    for (const key in rules.legal) {
      if (rules.legal.hasOwnProperty(key)) {
        const typedKey = key as keyof typeof rules.legal;
        if (rules.legal[typedKey].isCritical && rules.legal[typedKey].detected) {
          counts.legalCriticalCount++;
        } else if (rules.legal[typedKey].risk === "alto" && rules.legal[typedKey].detected) {
          counts.legalHighCount++;
        } else if (rules.legal[typedKey].risk === "medio" && rules.legal[typedKey].detected) {
          counts.legalMediumCount++;
        } else if (rules.legal[typedKey].risk === "bajo" && rules.legal[typedKey].detected) {
          counts.legalLowCount++;
        }
      }
    }

    for (const key in rules.capitalHumano) {
      if (rules.capitalHumano.hasOwnProperty(key)) {
        const typedKey = key as keyof typeof rules.capitalHumano;
        if (rules.capitalHumano[typedKey].isCritical && rules.capitalHumano[typedKey].detected) {
          counts.capitalHumanoCriticalCount++;
        } else if (rules.capitalHumano[typedKey].risk === "alto" && rules.capitalHumano[typedKey].detected) {
          counts.capitalHumanoHighCount++;
        } else if (rules.capitalHumano[typedKey].risk === "medio" && rules.capitalHumano[typedKey].detected) {
          counts.capitalHumanoMediumCount++;
        } else if (rules.capitalHumano[typedKey].risk === "bajo" && rules.capitalHumano[typedKey].detected) {
          counts.capitalHumanoLowCount++;
        }
      }
    }

    for (const key in rules.financieroTributario) {
      if (rules.financieroTributario.hasOwnProperty(key)) {
        const typedKey = key as keyof typeof rules.financieroTributario;
        if (rules.financieroTributario[typedKey].isCritical && rules.financieroTributario[typedKey].detected) {
          counts.financieroTributarioCriticalCount++;
        } else if (rules.financieroTributario[typedKey].risk === "alto" && rules.financieroTributario[typedKey].detected) {
          counts.financieroTributarioHighCount++;
        } else if (rules.financieroTributario[typedKey].risk === "medio" && rules.financieroTributario[typedKey].detected) {
          counts.financieroTributarioMediumCount++;
        } else if (rules.financieroTributario[typedKey].risk === "bajo" && rules.financieroTributario[typedKey].detected) {
          counts.financieroTributarioLowCount++;
        }
      }
    }

    return counts;
  }
  private static calculateGeneralSemaphore(riskCounts: any) {
    const totalCriticalCount = riskCounts.complianceCriticalCount + riskCounts.legalCriticalCount + riskCounts.capitalHumanoCriticalCount + riskCounts.financieroTributarioCriticalCount;
    const totalHighCount = riskCounts.complianceHighCount + riskCounts.legalHighCount + riskCounts.capitalHumanoHighCount + riskCounts.financieroTributarioHighCount;

    if (totalCriticalCount > 0) {
      return "red";
    } else if (totalHighCount > 1) {
      return "orange";
    } else if (totalHighCount < 2 && totalHighCount > 0) {
      return "yellow";
    }
    return "green";
  }
  private static buildNewSummaryData(rules: any, riskCounts: any, generalSemaphore: string) {
    return {
      compliance: rules.compliance,
      legal: rules.legal,
      capitalHumano: rules.capitalHumano,
      financieroTributario: rules.financieroTributario,
      ...riskCounts,
      totalCriticalCount: riskCounts.complianceCriticalCount + riskCounts.legalCriticalCount + riskCounts.capitalHumanoCriticalCount + riskCounts.financieroTributarioCriticalCount,
      totalHighCount: riskCounts.complianceHighCount + riskCounts.legalHighCount + riskCounts.capitalHumanoHighCount + riskCounts.financieroTributarioHighCount,
      totalMediumCount: riskCounts.complianceMediumCount + riskCounts.legalMediumCount + riskCounts.capitalHumanoMediumCount + riskCounts.financieroTributarioMediumCount,
      totalLowCount: riskCounts.complianceLowCount + riskCounts.legalLowCount + riskCounts.capitalHumanoLowCount + riskCounts.financieroTributarioLowCount,
      generalSemaphore,
    };
  }
  private static calculateGlobalSemaphore(riskData: any): string {
    return Object.values(riskData).reduce((acc: any, curr: any) => {
      if (curr.semaphore === "red") {
        return "red";
      } else if (curr.semaphore === "yellow" && acc !== "red") {
        return "yellow";
      }
      return acc;
    }, "green") as string;
  }
  private static getSemaphoreIcon(semaphore: string) {
    switch (semaphore) {
      case 'green':
        return '🟢';
      case 'yellow':
        return '🟡';
      case 'red':
        return '🔴';
      default:
        return semaphore;
    }
  }
  private static buildDocMarkdown(logEntry: ISheriffDataLog, riskSummary: any, allRules: any) {
    let socios = [];
    let addministradores = [];
    let constitucionFecha = null;
    let inicioActividades = null;

    if (logEntry.mallaSocietariaData?.empresaEnUnDia[0]) {

      socios = logEntry.mallaSocietariaData?.empresaEnUnDia[0].socios || [];
      addministradores = logEntry.mallaSocietariaData?.empresaEnUnDia[0].administradores || [];
      constitucionFecha = logEntry.mallaSocietariaData?.empresaEnUnDia[0].fecha || 'Sin Información';

      constitucionFecha = new Date(constitucionFecha).toLocaleDateString('es-CL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    } else {
      socios = logEntry.mallaSocietariaData?.socios || [];
      addministradores = logEntry.mallaSocietariaData?.administradores || [];
      constitucionFecha = logEntry.mallaSocietariaData?.fecha || 'Sin Información';

    }
    //TODO check this
    inicioActividades = logEntry.summaryData?.data?.sii?.inicioActividades || 'Sin Información';

    const evaluacionFecha = new Date(logEntry.fetchedAt).toLocaleDateString('es-CL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })


    //console.log(1239, "RiskCalculationService.buildDocMarkdown", socios, addministradores);

    //console.log("RiskCalculationService.buildDocMarkdown", riskSummary,allRules,logEntry);
    let docMD = `![Duxiter Logo](https://duxiter.azurianlab.com/src/assets/dux_logo_small.png) \n## Resumen   evaluado el ${evaluacionFecha} \n\n`;
    docMD += `RUT: ${logEntry.rut}  Compania: ${logEntry.summaryData?.data?.sii?.razonSocial}\n\n`;
    docMD += `Fecha Constitucion: ${constitucionFecha}\n\n`;
    docMD += `Inicio Actividades: ${inicioActividades}\n\n`;
    docMD += "\n\n";
    //display socios and addministradores rut name and tipo in a table
    docMD += `|RUT|Nombre|Tipo|\n`;
    docMD += `|:-------|:------------------|-------------:|\n`;
    socios.forEach((item: any) => {
      docMD += `|${item.rut}|${item.socio}|socio|\n`;
    });
    //docMD += `\n\n`;
    addministradores.forEach((item: any) => {
      docMD += `|${item.rut}|${item.administrador}|administrador|\n`;
    });
    docMD += `\n\n`;


    docMD += `Parametros evaluados: ${riskSummary.totalParameters}\n\n`;

    //list allRules
    docMD += `## Detalle del Riesgo\n\n`;
    docMD += `|Severo|Significativo|\n`;
    docMD += `|:----:|:-----------:|\n`;
    docMD += `|${riskSummary.totalSevero}|${riskSummary.totalSignificativo}|\n`;


    docMD += `\n\n`;
    docMD += `### El nivel de riesgo general es: **${this.getSemaphoreIcon(riskSummary.semaphore)}**\n\n`;
    docMD += `\n\n\n\n`;

    //make a table with compliance rules label and semaphore
    docMD += `## Detalle del Riesgo: Compliance\n\n`;
    docMD += `|Tipo de Riesgo|Detectado|Impacto|\n`;
    docMD += `|:-------------------------------|:-------:|:-----:|\n`;
    const complianceRules = allRules.complianceRules;
    complianceRules.forEach((item: any) => {
      let det = "SI"
      if (item.detected === false) {
        det = "NO"
      }
      docMD += `|${item.label}|${det}|${item.impacto}|\n`;
    });

    docMD += `## Detalle del Riesgo: Legal\n\n`;
    docMD += `|Tipo de Riesgo|Detectado|Impacto|\n`;
    docMD += `|:-------------------------------|:-------:|:-----:|\n`;
    const legalRules = allRules.legalRules;
    legalRules.forEach((item: any) => {
      let det = "SI"
      if (item.detected === false) {
        det = "NO"
      }
      docMD += `|${item.label}|${det}|${item.impacto}|\n`;
    });

    docMD += `## Detalle del Riesgo: Capital Humano\n\n`;
    docMD += `|Tipo de Riesgo|Detectado|Impacto|\n`;
    docMD += `|:-------------------------------|:-------:|:-----:|\n`;
    const capitalHumanoRules = allRules.capitalHumanoRules;
    capitalHumanoRules.forEach((item: any) => {
      let det = "SI"
      if (item.detected === false) {
        det = "NO"
      }
      docMD += `|${item.label}|${det}|${item.impacto}|\n`;
    });

    docMD += `## Detalle del Riesgo: Financiero Tributario\n\n`;
    docMD += `|Tipo de Riesgo|Detectado|Impacto|\n`;
    docMD += `|:-------------------------------|:-------:|:-----:|\n`;
    const financieroTributarioRules = allRules.financieroTributarioRules;
    financieroTributarioRules.forEach((item: any) => {
      let det = "SI"
      if (item.detected === false) {
        det = "NO"
      }
      docMD += `|${item.label}|${det}|${item.impacto}|\n`;
    });

    //console.log("RiskCalculationService.buildDocMarkdown", docMD);

    return docMD;
    /*
    let duxiterMD = `## Resumen\n\n`;
    duxiterMD += `| Característica | Valor |\n`;
    duxiterMD += `| :------ | :---------------- |\n`;

    vistaDuxiter.forEach(item => {
      let value = item.value;
      if (["Resultado evaluacion", "Compliance", "Legal", "Capital Humano", "Financiero Tributario"].includes(item.label)) {
        value = this.getSemaphoreIcon(item.value as string);
      }
      duxiterMD += `| ${item.label} | ${value} |\n`;
    });
    duxiterMD += `\n`;

    duxiterMD += `\n\n`;
    duxiterMD += `### El nivel de riesgo general es: **${this.getSemaphoreIcon(globalSemaphore)}**\n\n`;
    duxiterMD += `\n\n\n\n`;

    duxiterMD += `## Detalle del Riesgo\n\n`;
    duxiterMD += `|Compliance|Legal|Capital Humano|Financiero Tributario|\n`;
    duxiterMD += `|:--------:|:----:|:-------------:|:-----------------:|\n`;
    duxiterMD += `|${this.getSemaphoreIcon(riskData.compliance.semaphore)}|${this.getSemaphoreIcon(riskData.legal.semaphore)}|${this.getSemaphoreIcon(riskData.capitalHumano.semaphore)}|${this.getSemaphoreIcon(riskData.financieroTributario.semaphore)}|\n`;

    if (riskData.compliance.list.length > 0) {
      duxiterMD += `|${riskData.compliance.list.join(', ')}|`;
    } else {
      duxiterMD += `|*(none)*|`;
    }
    if (riskData.legal.list.length > 0) {
      duxiterMD += `${riskData.legal.list.join(', ')}|`;
    } else {
      duxiterMD += `*(none)*|`;
    }
    if (riskData.capitalHumano.list.length > 0) {
      duxiterMD += `${riskData.capitalHumano.list.join(', ')}|`;
    } else {
      duxiterMD += `*(none)*|`;
    }
    if (riskData.financieroTributario.list.length > 0) {
      duxiterMD += `${riskData.financieroTributario.list.join(', ')}|\n`;
    } else {
      duxiterMD += `*(none)*|\n`;
    }
    duxiterMD += `\n\n`;

    return duxiterMD;
    */
  }


}
