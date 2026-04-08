import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { Result } from '../models/Result';
import { CompanyRisks } from '../models/CompanyRisks';
import type { ISheriffDataLog } from '../models/SheriffDataLog';
import type { FilterQuery, HydratedDocument } from 'mongoose';
import type { IResult } from '../models/Result';

type Args = {
  rut?: string;
  resultId?: string;
  dryRun: boolean;
  includePep: boolean;
  includeArchived: boolean;
  limit?: number;
};

const parseArgs = (): Args => {
  const argv = process.argv.slice(2);

  const getValue = (key: string): string | undefined => {
    const idx = argv.findIndex(a => a === `--${key}` || a.startsWith(`--${key}=`));
    if (idx === -1) return undefined;
    const token = argv[idx];
    if (token.includes('=')) return token.split('=').slice(1).join('=').trim() || undefined;
    const next = argv[idx + 1];
    if (!next || next.startsWith('--')) return undefined;
    return next.trim() || undefined;
  };

  const hasFlag = (key: string): boolean => argv.includes(`--${key}`);

  const parseOptionalInt = (value: string | undefined): number | undefined => {
    if (!value) return undefined;
    const n = Number.parseInt(value, 10);
    if (Number.isNaN(n)) return undefined;
    return n;
  };

  return {
    rut: getValue('rut'),
    resultId: getValue('resultId') || getValue('id') || getValue('_id'),
    dryRun: hasFlag('dry-run') || hasFlag('dryRun'),
    includePep: hasFlag('include-pep') || hasFlag('includePep'),
    includeArchived: hasFlag('include-archived') || hasFlag('includeArchived'),
    limit: parseOptionalInt(getValue('limit'))
  };
};

const normalizeRutVariants = (rawRut: string): string[] => {
  const clean = (rawRut || '').toString().trim();
  const noDots = clean.replace(/\./g, '').toUpperCase();
  const noDash = noDots.replace(/-/g, '');
  const normalizedAlnum = clean.replace(/[^0-9Kk]/g, '').toUpperCase();

  const formatBodyWithDots = (body: string): string => {
    const digitsOnly = body.replace(/\D/g, '');
    let out = '';
    let count = 0;
    for (let i = digitsOnly.length - 1; i >= 0; i--) {
      out = digitsOnly[i] + out;
      count += 1;
      if (count % 3 === 0 && i !== 0) {
        out = `.${out}`;
      }
    }
    return out;
  };

  const variants = new Set<string>();
  if (clean) variants.add(clean);
  if (noDots) variants.add(noDots);
  if (noDash) variants.add(noDash);
  if (normalizedAlnum) variants.add(normalizedAlnum);
  if (noDash.length >= 2) {
    const body = noDash.slice(0, -1);
    const dv = noDash.slice(-1).toUpperCase();
    const withDash = `${body}-${dv}`;
    variants.add(withDash);
    variants.add(withDash.toLowerCase());
    const dotted = `${formatBodyWithDots(body)}-${dv}`;
    variants.add(dotted);
    variants.add(dotted.toLowerCase());
  }

  return Array.from(variants);
};

const loadEnv = () => {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });
  dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
  dotenv.config();
};

const getMongoUri = (): string => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Missing MongoDB connection string. Set MONGODB_URI in server/.env');
  }
  return uri;
};

const main = async () => {
  const args = parseArgs();

  loadEnv();
  const mongoUri = getMongoUri();

  const [{ RiskCalculationService }, { RutController }] = await Promise.all([
    import('../services/riskCalculationService'),
    import('../controllers/rutController')
  ]);

  await mongoose.connect(mongoUri);

  try {
    const processOne = async (doc: HydratedDocument<IResult>) => {
      const tenantId = String(doc.tenantId);
      const rut = String(doc.rut);

      const logEntry = doc.sheriffLogData as unknown as ISheriffDataLog | undefined;
      if (!logEntry || !logEntry.summaryData?.data) {
        throw new Error(`Result ${doc._id} does not contain sheriffLogData.summaryData.data`);
      }

      const previousSemaphore = doc.riskAssessment?.riskSummary?.semaphore ?? null;
      const previousRiskDesc = doc.riskAssessment?.riskSummary?.riskLevelDescription ?? null;

      const riskData = await RiskCalculationService.calculateRisk(logEntry, 'script:recalculate-rut-risk');
      if (!riskData) {
        throw new Error('RiskCalculationService.calculateRisk returned null');
      }

      RutController.truncateArraysRecursively(riskData, 100);

      const sanitizedRiskAssessment = RutController.sanitizeData(riskData, 5000000, 'riskAssessment');
      const sanitizedNewSummaryData = RutController.sanitizeData(riskData.riskSummary, 5000000, 'newSummaryData');
      const sanitizedDuxiterRiskData = RutController.sanitizeData(riskData, 5000000, 'duxiterRiskData');
      const sanitizedDuxiterRiskList = RutController.sanitizeData({
        compliance: riskData.allRules?.complianceRules || [],
        legal: riskData.allRules?.legalRules || [],
        capitalHumano: riskData.allRules?.capitalHumanoRules || [],
        financieroTributario: riskData.allRules?.financieroTributarioRules || []
      }, 5000000, 'duxiterRiskList');

      const nextSemaphore = riskData.riskSummary?.semaphore ?? null;
      const nextRiskDesc = riskData.riskSummary?.riskLevelDescription ?? null;

      return {
        tenantId,
        rut,
        previous: { semaphore: previousSemaphore, riskLevelDescription: previousRiskDesc },
        next: { semaphore: nextSemaphore, riskLevelDescription: nextRiskDesc },
        apply: async () => {
          doc.riskAssessment = sanitizedRiskAssessment;
          doc.newSummaryData = sanitizedNewSummaryData;
          doc.duxiterRiskLevel = nextSemaphore;
          doc.duxiterRiskData = sanitizedDuxiterRiskData;
          doc.duxiterRiskList = sanitizedDuxiterRiskList;
          doc.set('updatedAt', new Date());

          RutController.truncateArraysRecursively(doc, 100);
          await doc.save();

          const companyRisksDoc = await CompanyRisks.findOne({ resultId: doc._id }).sort({ createdAt: -1 }).exec();
          if (companyRisksDoc) {
            companyRisksDoc.newSummaryData = sanitizedNewSummaryData;
            companyRisksDoc.duxiterRiskLevel = nextSemaphore;
            companyRisksDoc.duxiterRiskData = sanitizedDuxiterRiskData;
            companyRisksDoc.duxiterRiskList = sanitizedDuxiterRiskList;
            companyRisksDoc.riskAssessment = {
              globalSemaphore: nextSemaphore,
              riskData: sanitizedDuxiterRiskData
            };
            companyRisksDoc.updatedAt = new Date();
            RutController.truncateArraysRecursively(companyRisksDoc, 100);
            await companyRisksDoc.save();
          }
        }
      };
    };

    if (args.resultId) {
      const resultDoc = await Result.findOne({ _id: args.resultId }).exec();
      if (!resultDoc) {
        throw new Error(`Result not found for _id=${args.resultId}`);
      }

      const info = await processOne(resultDoc);
      console.log(JSON.stringify({
        action: args.dryRun ? 'dry-run' : 'update',
        resultId: String(resultDoc._id),
        rut: info.rut,
        tenantId: info.tenantId,
        queryType: resultDoc.queryType ?? null,
        previous: info.previous,
        next: info.next
      }, null, 2));

      if (!args.dryRun) {
        await info.apply();
      }
      return;
    }

    if (args.rut) {
      const rutVariants = normalizeRutVariants(args.rut);
      const baseQuery: FilterQuery<IResult> = { rut: { $in: rutVariants } };
      if (!args.includeArchived) {
        baseQuery.archived = { $ne: true };
      }
      if (!args.includePep) {
        baseQuery.queryType = 'primary';
      }

      let resultDoc = await Result.findOne(baseQuery).sort({ createdAt: -1 }).exec();

      if (!resultDoc) {
        const normalizedWanted = args.rut.replace(/[^0-9Kk]/g, '').toUpperCase();
        const bodyDigits = normalizedWanted.slice(0, -1);

        const tryFindFromCandidates = async (query: FilterQuery<IResult>) => {
          const candidates = await Result.find(query, { _id: 1, tenantId: 1, rut: 1, createdAt: 1, queryType: 1 })
            .sort({ createdAt: -1 })
            .limit(300)
            .lean()
            .exec() as Array<{ _id: mongoose.Types.ObjectId; tenantId: string; rut: string; createdAt?: Date; queryType?: string }>;

          const match = candidates.find(c => c.rut?.replace(/[^0-9Kk]/g, '').toUpperCase() === normalizedWanted);
          if (!match) return null;
          return Result.findOne({ _id: match._id }).exec();
        };

        const candidateQuery1: FilterQuery<IResult> = { rut: { $regex: bodyDigits, $options: 'i' } };
        if (!args.includeArchived) {
          candidateQuery1.archived = { $ne: true };
        }
        if (!args.includePep) {
          candidateQuery1.queryType = 'primary';
        }

        resultDoc = await tryFindFromCandidates(candidateQuery1);
        if (!resultDoc && !args.includePep) {
          const candidateQuery2: FilterQuery<IResult> = { rut: { $regex: bodyDigits, $options: 'i' } };
          if (!args.includeArchived) {
            candidateQuery2.archived = { $ne: true };
          }
          resultDoc = await tryFindFromCandidates(candidateQuery2);
        }

        if (!resultDoc) {
          const debugQuery: FilterQuery<IResult> = { rut: { $regex: bodyDigits, $options: 'i' } };
          if (!args.includePep) debugQuery.queryType = 'primary';
          if (!args.includeArchived) debugQuery.archived = { $ne: true };
          const candidates = await Result.find(debugQuery, { _id: 1, tenantId: 1, rut: 1, createdAt: 1, queryType: 1, archived: 1 })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean()
            .exec();
          throw new Error(`No result found for rut=${args.rut}. Candidates: ${JSON.stringify(candidates)}`);
        }
      }
      const info = await processOne(resultDoc);
      console.log(JSON.stringify({
        action: args.dryRun ? 'dry-run' : 'update',
        resultId: String(resultDoc._id),
        rut: info.rut,
        tenantId: info.tenantId,
        queryType: resultDoc.queryType ?? null,
        previous: info.previous,
        next: info.next
      }, null, 2));

      if (!args.dryRun) {
        await info.apply();
      }
      return;
    }

    const query: FilterQuery<IResult> = {};
    if (!args.includeArchived) query.archived = { $ne: true };
    if (!args.includePep) query.queryType = 'primary';

    const cursor = Result.find(query).sort({ createdAt: -1 }).cursor();

    let processed = 0;
    let updated = 0;
    let failed = 0;

    for await (const doc of cursor) {
      processed += 1;
      if (typeof args.limit === 'number' && processed > args.limit) {
        break;
      }

      try {
        const hydrated = doc as HydratedDocument<IResult>;
        const info = await processOne(hydrated);
        const id = String(hydrated._id);
        const prev = info.previous.semaphore ?? 'null';
        const next = info.next.semaphore ?? 'null';
        console.log(`${processed} ${id} ${info.rut} ${prev} -> ${next}`);
        if (!args.dryRun) {
          await info.apply();
          updated += 1;
        }
      } catch (err) {
        failed += 1;
        const docId = (doc as unknown as { _id?: unknown })._id;
        const id = docId ? String(docId) : 'unknown';
        console.error(`[FAILED] ${processed} ${id} ${(err as Error)?.message ?? err}`);
      }
    }

    console.log(JSON.stringify({
      action: args.dryRun ? 'dry-run' : 'update',
      mode: 'bulk',
      processed,
      updated,
      failed,
      filters: { includePep: args.includePep, includeArchived: args.includeArchived },
      limit: args.limit ?? null
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

main().catch(err => {
  console.error(err?.stack || err);
  process.exitCode = 1;
});
