import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';

import DailyJobsSummary from '../../components/dashboard/DailyJobsSummary';
import TenantUsageSummary from '../../components/dashboard/TenantUsageSummary';
import { apiClient } from '../../services/api';
import RiskDonutChart from '../../components/dashboard/RiskDonutChart';
import ResultsTable from '../../components/dashboard/ResultsTable';
import ConsultationHistoryChart from '../../components/dashboard/ConsultationHistoryChart';
import BulkEvaluationProgressMeter from '../../components/dashboard/BulkEvaluationProgressMeter';
import DeepAnalysisPanel from '../../components/ui/DeepAnalysisPanel/DeepAnalysisPanel';

// Utils e Iconos
import {
  MagnifyingGlassIcon,
  DocumentArrowDownIcon,
  AdjustmentsHorizontalIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { getResults } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import logger from '../../utils/logger';

// Tipos
import { IResult as IResultBackend } from '../../../server/src/models/Result';

const duxiterLogo = '/assets/img/logo.png';

interface IResult extends Omit<IResultBackend, 'rut'> {
  _id: string;
  createdAt: string;
  razonSocial?: string;
  rut?: string;
  identifier?: string;
  noteTags?: string[];
}

const DEEP_ANALYSIS_STORAGE_KEY = 'deepAnalysisCompactData';
const DEEP_ANALYSIS_STORAGE_VERSION = 1;
const DEEP_ANALYSIS_MAX_RUTS = 550;

interface CompactRuleEntry {
  label: string;
  detected: boolean;
  risk: string;
  isSevero: boolean;
}

interface CompactRutData {
  rutValue: string;
  rules: CompactRuleEntry[];
  causasPenalesDetected: boolean;
  noticiasDetected: boolean;
}

interface DeepAnalysisStoragePayload {
  version: number;
  timestamp: number;
  data: CompactRutData[];
}

// Función helper para eliminar RUTs duplicados
const removeDuplicateRuts = (data: IResult[]): IResult[] => {
  const uniqueResults = data.reduce((acc, result) => {
    const rut = result.rut || result.identifier || '';
    if (!rut) return acc;
    const existing = acc.get(rut);
    if (!existing || new Date(result.createdAt) > new Date(existing.createdAt)) {
      acc.set(rut, result);
    }
    return acc;
  }, new Map<string, IResult>());
  return Array.from(uniqueResults.values());
};

const processDeepAnalysisFromCompact = (
  compactData: CompactRutData[],
  allowedRuts: Set<string>
) => {
  const paramCounts: Record<string, number> = {};
  const paramRuts: Record<string, string[]> = {};
  const allCriticoLabels = new Set<string>();
  const criticoCounts: Record<string, number> = {};

  for (const entry of compactData) {
    if (!allowedRuts.has(entry.rutValue)) continue;

    for (const rule of entry.rules) {
      if (rule.isSevero) allCriticoLabels.add(rule.label);

      if (rule.detected && (rule.risk === 'critico' || rule.risk === 'alto')) {
        paramCounts[rule.label] = (paramCounts[rule.label] || 0) + 1;
        if (!paramRuts[rule.label]) paramRuts[rule.label] = [];
        paramRuts[rule.label].push(entry.rutValue);
        if (rule.isSevero) {
          criticoCounts[rule.label] = (criticoCounts[rule.label] || 0) + 1;
        }
      }
    }

    // Causas Penales siempre se considera severo/Crítico como dimensión
    allCriticoLabels.add('Causas Penales');
    if (entry.causasPenalesDetected) {
      paramCounts['Causas Penales'] = (paramCounts['Causas Penales'] || 0) + 1;
      if (!paramRuts['Causas Penales']) paramRuts['Causas Penales'] = [];
      paramRuts['Causas Penales'].push(entry.rutValue);
      criticoCounts['Causas Penales'] = (criticoCounts['Causas Penales'] || 0) + 1;
    }

    if (entry.noticiasDetected) {
      paramCounts['Reputación Pública y Mediática'] =
        (paramCounts['Reputación Pública y Mediática'] || 0) + 1;
      if (!paramRuts['Reputación Pública y Mediática']) paramRuts['Reputación Pública y Mediática'] = [];
      paramRuts['Reputación Pública y Mediática'].push(entry.rutValue);
    }
  }

  const parametrosCriticos = Object.entries(paramCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const dimensionesCriticas = Array.from(allCriticoLabels)
    .map(name => ({ name, count: criticoCounts[name] || 0 }))
    .sort((a, b) => b.count - a.count);

  return { dimensionesCriticas, parametrosCriticos, rutsByParam: paramRuts };
};

// Helper: extrae lo mínimo necesario desde una respuesta cruda de un RUT
const buildCompactEntryFromResponse = (rutValue: string, d: any): CompactRutData => {
  const entry: CompactRutData = {
    rutValue,
    rules: [],
    causasPenalesDetected: false,
    noticiasDetected: false,
  };

  const allRulesData = d?.riskAssessment?.allRules || {};
  for (const catKey of ['complianceRules', 'legalRules', 'capitalHumanoRules', 'financieroTributarioRules']) {
    const rules: any[] = allRulesData[catKey] || [];
    for (const rule of rules) {
      if (rule.label === 'Inicio de Actividades') continue;

      let detected = rule.detected || false;
      let risk = rule.risk || 'bajo';

      if (rule.label === 'Deuda Previsional Presunta') {
        const details = rule.details?.casos || rule.details;
        const detailCount = Array.isArray(details) ? details.length
          : (details && typeof details === 'object' && Object.keys(details).length > 0) ? 1 : 0;
        if (detailCount > 0) {
          detected = true;
          risk = 'alto';
        }
      }

      entry.rules.push({
        label: rule.label,
        detected,
        risk,
        isSevero: rule.impacto === 'severo',
      });
    }
  }

  const todasCoincidencias =
    d?.sheriffLogData?.filteredDetails?.compliance?.penal?.coincidencias ||
    d?.details?.sheriffLogData?.filteredDetails?.compliance?.penal?.coincidencias ||
    d?.logEntry?.filteredDetails?.compliance?.penal?.coincidencias || [];
  const coincidenciasFiltradas = todasCoincidencias.filter((item: any) => {
    const postura = item?.postura?.toLowerCase() || '';
    return postura === 'demandado' || postura === 'querellado' || postura === 'denunciado';
  });
  entry.causasPenalesDetected = coincidenciasFiltradas.length > 0;

  const noticiasCoincidencias =
    d?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
    d?.details?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
    d?.logEntry?.filteredDetails?.compliance?.noticias?.coincidencias || [];
  entry.noticiasDetected = noticiasCoincidencias.length > 0;

  return entry;
};


const processDeepAnalysisFromCache = (
  cachedResponses: Array<{ rutValue: string; data: any }>,
  allowedRuts: Set<string>
) => {
  const paramCounts: Record<string, number> = {};
  const allCriticoLabels = new Set<string>();
  const criticoCounts: Record<string, number> = {};

  for (const { rutValue, data: d } of cachedResponses) {
    if (!allowedRuts.has(rutValue) || !d) continue;

    const allRulesData = d?.riskAssessment?.allRules || {};

    for (const catKey of ['complianceRules', 'legalRules', 'capitalHumanoRules', 'financieroTributarioRules']) {
      const rules: any[] = allRulesData[catKey] || [];
      for (const rule of rules) {
        if (rule.label === 'Inicio de Actividades') continue;

        let detected = rule.detected || false;
        let risk = rule.risk || 'bajo';

        if (rule.impacto === 'severo') {
          allCriticoLabels.add(rule.label);
        }

        if (rule.label === 'Deuda Previsional Presunta') {
          const details = rule.details?.casos || rule.details;
          const detailCount = Array.isArray(details) ? details.length
            : (details && typeof details === 'object' && Object.keys(details).length > 0) ? 1 : 0;
          if (detailCount > 0) {
            detected = true;
            risk = 'alto';
          }
        }

        if (detected && (risk === 'critico' || risk === 'alto')) {
          paramCounts[rule.label] = (paramCounts[rule.label] || 0) + 1;
          if (rule.impacto === 'severo') {
            criticoCounts[rule.label] = (criticoCounts[rule.label] || 0) + 1;
          }
        }
      }
    }

    allCriticoLabels.add('Causas Penales');
    const todasCoincidencias =
      d?.sheriffLogData?.filteredDetails?.compliance?.penal?.coincidencias ||
      d?.details?.sheriffLogData?.filteredDetails?.compliance?.penal?.coincidencias ||
      d?.logEntry?.filteredDetails?.compliance?.penal?.coincidencias || [];
    const coincidenciasFiltradas = todasCoincidencias.filter((item: any) => {
      const postura = item?.postura?.toLowerCase() || '';
      return postura === 'demandado' || postura === 'querellado' || postura === 'denunciado';
    });
    if (coincidenciasFiltradas.length > 0) {
      paramCounts['Causas Penales'] = (paramCounts['Causas Penales'] || 0) + 1;
      criticoCounts['Causas Penales'] = (criticoCounts['Causas Penales'] || 0) + 1;
    }

    const noticiasCoincidencias =
      d?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
      d?.details?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
      d?.logEntry?.filteredDetails?.compliance?.noticias?.coincidencias || [];
    if (noticiasCoincidencias.length > 0) {
      paramCounts['Reputación Pública y Mediática'] = (paramCounts['Reputación Pública y Mediática'] || 0) + 1;
    }
  }

  const parametrosCriticos = Object.entries(paramCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const dimensionesCriticas = Array.from(allCriticoLabels)
    .map(name => ({ name, count: criticoCounts[name] || 0 }))
    .sort((a, b) => b.count - a.count);

  return { dimensionesCriticas, parametrosCriticos };
};
const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();

  const [results, setResults] = useState<IResult[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [totalPages, setTotalPages] = useState(1);

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [riskLevelFilters, setRiskLevelFilters] = useState<string[]>([]);
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [searchFilter, setSearchFilter] = useState<string>('');

  const [appliedStartDate, setAppliedStartDate] = useState<string>('');
  const [appliedEndDate, setAppliedEndDate] = useState<string>('');
  const [appliedRiskLevels, setAppliedRiskLevels] = useState<string[]>([]);
  const [appliedTags, setAppliedTags] = useState<string[]>([]);
  const [appliedSearch, setAppliedSearch] = useState<string>('');

  const [exportingPdf, setExportingPdf] = useState(false);
  const [loadingAllData, setLoadingAllData] = useState(false);
  const [showRiskDropdown, setShowRiskDropdown] = useState(false);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [deepAnalysisData, setDeepAnalysisData] = useState<{ dimensionesCriticas: { name: string; count: number }[]; parametrosCriticos: { label: string; count: number }[]; rutsByParam: Record<string, Array<{ rut: string; razonSocial: string; fecha: string; _id: string }>> } | null>(null);
  const [loadingDeepAnalysis, setLoadingDeepAnalysis] = useState(false);

  const [cachedRutResponses, setCachedRutResponses] = useState<Array<{ rutValue: string; data: any }>>([]);

  const [compactRutData, setCompactRutData] = useState<CompactRutData[]>([]);


  const [allDataForFilters, setAllDataForFilters] = useState<IResult[]>([]);
  const [isFilterMode, setIsFilterMode] = useState(false);


  const [chartViewType, setChartViewType] = useState<'monthly' | 'daily' | 'yearly'>('monthly');


  const [allDataForCharts, setAllDataForCharts] = useState<IResult[]>([]);

  const [selectedRuts, setSelectedRuts] = useState<string[]>([]);

  useEffect(() => {
    setSelectedRuts([]);
  }, [currentPage]);

  useEffect(() => {
    const fetchData = async () => {
      if (user && tenant && !isFilterMode) {
        console.log('Fetching all data to remove duplicates');
        try {
          let allData: IResult[] = [];
          let page = 1;
          let totalP = 1;
          do {
            const res = await getResults({
              page,
              limit: 50,
              sortField,
              sortDirection,
              ...(appliedSearch && { search: appliedSearch })
            });
            if (res?.data) allData = [...allData, ...res.data];
            totalP = res?.pagination?.totalPages || 1;
            page++;
          } while (page <= totalP);

          const uniqueData = removeDuplicateRuts(allData);
          uniqueData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          const startIndex = (currentPage - 1) * itemsPerPage;
          const paginatedData = uniqueData.slice(startIndex, startIndex + itemsPerPage);

          setResults(paginatedData);
          setTotalPages(Math.ceil(uniqueData.length / itemsPerPage));
          setAllDataForCharts(uniqueData);

          console.log('Unique records:', uniqueData.length, 'Showing page:', currentPage);
        } catch (error) {
          logger.error('Error fetching data:', error);
        }
      }
    };
    fetchData();
  }, [user, tenant, currentPage, itemsPerPage, sortField, sortDirection, appliedSearch, isFilterMode]);


  useEffect(() => {
    if (compactRutData.length === 0) {
      setDeepAnalysisData(null);
      return;
    }

    const hasFilters = !!(appliedStartDate || appliedEndDate || appliedRiskLevels.length > 0 || appliedTags.length > 0 || appliedSearch);

    const dataSource = isFilterMode && allDataForFilters.length > 0
      ? allDataForFilters
      : (allDataForCharts.length > 0 ? allDataForCharts : results);

 const rutInfoMap = new Map<string, { razonSocial: string; fecha: string; _id: string }>();
for (const r of dataSource) {
  const rut = r.rut || r.identifier || '';
  if (!rut) continue;
  rutInfoMap.set(rut, {
    razonSocial: r.details?.razonSocial || r.razonSocial || 'N/A',
    fecha: r.createdAt,
    _id: r._id
  });
}

const enrichRuts = (rutsByParam: Record<string, string[]>) => {
  const enriched: Record<string, Array<{ rut: string; razonSocial: string; fecha: string; _id: string }>> = {};
  for (const [label, ruts] of Object.entries(rutsByParam)) {
    enriched[label] = ruts.map(rut => {
      const info = rutInfoMap.get(rut);
      return {
        rut,
        razonSocial: info?.razonSocial || 'N/A',
        fecha: info?.fecha || '',
        _id: info?._id || ''
      };
    });
  }
  return enriched;
};

    if (!hasFilters) {
      let allRuts = new Set(compactRutData.map(r => r.rutValue));
      if (selectedRuts.length > 0) {
        allRuts = new Set([...allRuts].filter(r => selectedRuts.includes(r)));
      }
      const result = processDeepAnalysisFromCompact(compactRutData, allRuts);
      setDeepAnalysisData({
        dimensionesCriticas: result.dimensionesCriticas,
        parametrosCriticos: result.parametrosCriticos,
        rutsByParam: enrichRuts(result.rutsByParam)
      });
      return;
    }

    if (dataSource.length === 0) return;

    const filteredData = applyFiltersToData(dataSource);
    const tableRuts = new Set(filteredData.map(r => r.rut || r.identifier || '').filter(Boolean));

    const allowedRuts = new Set<string>();
    for (const { rutValue } of compactRutData) {
      if (tableRuts.has(rutValue)) allowedRuts.add(rutValue);
    }

    if (selectedRuts.length > 0) {
      for (const r of [...allowedRuts]) {
        if (!selectedRuts.includes(r)) allowedRuts.delete(r);
      }
    }

    const result = processDeepAnalysisFromCompact(compactRutData, allowedRuts);
    setDeepAnalysisData({
      dimensionesCriticas: result.dimensionesCriticas,
      parametrosCriticos: result.parametrosCriticos,
      rutsByParam: enrichRuts(result.rutsByParam)
    });
  }, [appliedStartDate, appliedEndDate, appliedRiskLevels, appliedTags, appliedSearch, compactRutData, allDataForCharts, results, isFilterMode, allDataForFilters, selectedRuts]);


  const handleExportInfo = async () => {
    setLoadingAllData(true);
    try {
      const sourceData = isFilterMode && allDataForFilters.length > 0
        ? allDataForFilters
        : (allDataForCharts.length > 0 ? allDataForCharts : results);
      const uniqueRuts = Array.from(new Set(
        sourceData.map(r => r.rut || r.identifier || '').filter(Boolean)
      ));

      if (uniqueRuts.length === 0) {
        toast.error('No hay RUTs para consultar');
        setLoadingAllData(false);
        return;
      }

      const riskToColor: Record<string, string> = {
        critico: 'rojo', alto: 'naranjo', medio: 'amarillo', bajo: 'verde', no_disponible: 'gris',
      };

      const calculateSemaphore = (c: { critical: number; high: number; low: number }) => {
        const total = c.critical + c.high + c.low;
        if (c.critical >= 1) return 'red';
        if (c.low === total && total > 0) return 'green';
        if (total > 0 && c.high / total >= 0.5) return 'red';
        if (total > 0 && c.high / total >= 0.3) return 'orange';
        return 'yellow';
      };

      const semaphoreToColor: Record<string, string> = { red: 'rojo', orange: 'naranjo', yellow: 'amarillo', green: 'verde' };
      const semaphoreToLabel: Record<string, string> = { red: 'CRÍTICO', orange: 'ALTO', yellow: 'MEDIO', green: 'BAJO' };

      const allRuleLabelsOrdered: string[] = [];
      const allRuleLabelsSet = new Set<string>();
      const allRutResponses: Array<{ rutValue: string; data: any }> = [];

      // Reutilizar cache cuando esté disponible
      const cacheMap = new Map<string, any>();
      for (const c of cachedRutResponses) {
        if (c.data) cacheMap.set(c.rutValue, c.data);
      }

      const rutsToFetch = uniqueRuts.filter(rut => !cacheMap.has(rut));
      const cachedHits = uniqueRuts.length - rutsToFetch.length;

      if (cachedHits > 0) {
        toast.loading(
          `Reutilizando ${cachedHits} RUTs del análisis previo${rutsToFetch.length > 0 ? `, consultando ${rutsToFetch.length} faltantes...` : '...'}`,
          { id: 'export-progress' }
        );
      }

      // 1) Agregar los que ya tenemos en cache
      for (const rutValue of uniqueRuts) {
        if (cacheMap.has(rutValue)) {
          allRutResponses.push({ rutValue, data: cacheMap.get(rutValue) });
        }
      }

      // 2) Fetch de los faltantes
      for (let i = 0; i < rutsToFetch.length; i++) {
        const rutValue = rutsToFetch[i];
        try {
          toast.loading(`Consultando RUT ${i + 1}/${rutsToFetch.length}: ${rutValue}`, { id: 'export-progress' });
          const response = await apiClient.get(`/rut/results/rut/${rutValue}`);
          allRutResponses.push({ rutValue, data: response.data });

          if (i < rutsToFetch.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } catch (err) {
          console.error(`Error RUT ${rutValue}:`, err);
          allRutResponses.push({ rutValue, data: null });
        }
      }

      // 3) Construir labels desde TODAS las respuestas
      for (const { data: d } of allRutResponses) {
        if (!d) continue;
        const allRulesData = d?.riskAssessment?.allRules || {};
        for (const catKey of ['complianceRules', 'legalRules', 'capitalHumanoRules', 'financieroTributarioRules']) {
          const rules: any[] = allRulesData[catKey] || [];
          for (const rule of rules) {
            if (!allRuleLabelsSet.has(rule.label)) {
              allRuleLabelsSet.add(rule.label);
              allRuleLabelsOrdered.push(rule.label);
            }
          }
        }
      }
      if (!allRuleLabelsSet.has('Causas Penales')) {
        allRuleLabelsSet.add('Causas Penales');
        allRuleLabelsOrdered.push('Causas Penales');
      }
      if (!allRuleLabelsSet.has('Reputación Pública y Mediática')) {
        allRuleLabelsSet.add('Reputación Pública y Mediática');
        allRuleLabelsOrdered.push('Reputación Pública y Mediática');
      }

      toast.dismiss('export-progress');
      toast.loading('Generando Excel...', { id: 'export-generating' });

      // ====== A PARTIR DE AQUÍ TODO IDÉNTICO A LO QUE YA TENÍAS ======
      const fixedHeaders = [
        'Razón Social', 'RUT', 'Fecha Evaluación',
        'Resultado Fast Check (color Semáforo)', 'Resultado Fast Check (Nivel de Riesgo)',
        '# parámetros riesgo crítico', '# parámetros riesgo alto', '# parámetros sin riesgo',
      ];

      const subCols = ['Impacto', 'Detectado', 'Riesgo', 'Cant. Detalles'];

      const headerRow1: string[] = [...fixedHeaders];
      for (const label of allRuleLabelsOrdered) {
        headerRow1.push(label, '', '', '');
      }
      headerRow1.push('Resumen de hallazgos', '# hallazgos detectados');

      const headerRow2: string[] = fixedHeaders.map(() => '');
      for (const _label of allRuleLabelsOrdered) {
        headerRow2.push(...subCols);
      }
      headerRow2.push('', '');

      const columnTotals: Record<string, { detected: number; totalDetails: number }> = {};
      allRuleLabelsOrdered.forEach(l => { columnTotals[l] = { detected: 0, totalDetails: 0 }; });
      let totalCritical = 0, totalHigh = 0, totalLow = 0;

      const dataRows: any[][] = [];

      for (const { rutValue, data: d } of allRutResponses) {
        if (!d) {
          const row: any[] = ['Error al consultar', rutValue, '', '', '', 0, 0, 0];
          allRuleLabelsOrdered.forEach(() => { row.push('', '', '', ''); });
          row.push('Error al consultar', '');
          dataRows.push(row);
          continue;
        }

        const razonSocial = d?.details?.razonSocial || 'N/A';
        const fechaEval = d?.createdAt ? new Date(d.createdAt).toLocaleDateString('es-CL') : 'N/A';
        const allRulesData = d?.riskAssessment?.allRules || {};

        const ruleMap: Record<string, { detected: boolean; risk: string; impacto: string; detailCount: number; details: any }> = {};

        for (const catKey of ['complianceRules', 'legalRules', 'capitalHumanoRules', 'financieroTributarioRules']) {
          const rules: any[] = allRulesData[catKey] || [];
          for (const rule of rules) {
            let details = rule.details;
            if (rule.label === 'Deuda Previsional Presunta' && details?.casos) {
              details = details.casos;
            }
            const detailCount = Array.isArray(details) ? details.length
              : (details && typeof details === 'object' && Object.keys(details).length > 0) ? 1
                : 0;

            ruleMap[rule.label] = {
              detected: rule.detected || false,
              risk: rule.risk || 'bajo',
              impacto: rule.impacto || '',
              detailCount,
              details,
            };
          }
        }

        const todasCoincidencias =
          d?.sheriffLogData?.filteredDetails?.compliance?.penal?.coincidencias ||
          d?.details?.sheriffLogData?.filteredDetails?.compliance?.penal?.coincidencias ||
          d?.logEntry?.filteredDetails?.compliance?.penal?.coincidencias || [];
        const coincidenciasFiltradas = todasCoincidencias.filter((item: any) => {
          const postura = item?.postura?.toLowerCase() || '';
          return postura === 'demandado' || postura === 'querellado' || postura === 'denunciado';
        });
        ruleMap['Causas Penales'] = {
          detected: coincidenciasFiltradas.length > 0,
          risk: coincidenciasFiltradas.length > 0 ? 'critico' : 'bajo',
          impacto: 'severo',
          detailCount: coincidenciasFiltradas.length,
          details: coincidenciasFiltradas,
        };

        const noticiasCoincidencias =
          d?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
          d?.details?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
          d?.logEntry?.filteredDetails?.compliance?.noticias?.coincidencias || [];
        ruleMap['Reputación Pública y Mediática'] = {
          detected: noticiasCoincidencias.length > 0,
          risk: noticiasCoincidencias.length > 0 ? 'alto' : 'bajo',
          impacto: 'significativo',
          detailCount: noticiasCoincidencias.length,
          details: noticiasCoincidencias,
        };

        if (ruleMap['Deuda Previsional Presunta']?.detailCount > 0) {
          ruleMap['Deuda Previsional Presunta'].risk = 'alto';
          ruleMap['Deuda Previsional Presunta'].detected = true;
        }

        if (ruleMap['Inicio de Actividades']) {
          const ia = ruleMap['Inicio de Actividades'];
          ia.detected = !ia.detected;
          ia.risk = ia.detected ? 'alto' : 'bajo';
        }

        let critical = 0, high = 0, low = 0;
        for (const label of allRuleLabelsOrdered) {
          const r = ruleMap[label];
          if (!r || r.risk === 'no_disponible') continue;
          if (r.risk === 'critico') critical++;
          else if (r.risk === 'alto') high++;
          else low++;
        }

        const semaphore = calculateSemaphore({ critical, high, low });
        totalCritical += critical;
        totalHigh += high;
        totalLow += low;

        const row: any[] = [
          razonSocial, rutValue, fechaEval,
          semaphoreToColor[semaphore] || '', semaphoreToLabel[semaphore] || '',
          critical, high, low,
        ];

        for (const label of allRuleLabelsOrdered) {
          const r = ruleMap[label];
          if (r) {
            const impactoCapitalized = r.impacto ? r.impacto.charAt(0).toUpperCase() + r.impacto.slice(1) : '';
            row.push(
              impactoCapitalized,
              r.detected ? 'Sí' : 'No',
              riskToColor[r.risk] || r.risk,
              r.detailCount > 0 ? r.detailCount : '',
            );

            if (r.detected && r.risk !== 'bajo' && r.risk !== 'no_disponible') {
              columnTotals[label].detected++;
            }
            columnTotals[label].totalDetails += r.detailCount;
          } else {
            row.push('', '', '', '');
          }
        }

        const hallazgos: string[] = [];
        for (const label of allRuleLabelsOrdered) {
          const r = ruleMap[label];
          if (!r || !r.detected || r.risk === 'bajo' || r.risk === 'no_disponible') continue;

          const color = riskToColor[r.risk] || r.risk;
          let detail = `${label} (${color})`;
          if (r.detailCount > 0) detail += `: ${r.detailCount} hallazgo${r.detailCount > 1 ? 's' : ''}`;

          if (['Multas Laborales', 'Deuda Previsional Publicada', 'Protestos y Morosidades', 'Condenas por Prácticas Antisindicales'].includes(label) && Array.isArray(r.details)) {
            let monto = 0;
            r.details.forEach((item: any) => {
              const m = item?.monto || item?.Monto || item?.montoMulta || item?.['Monto Multa'] || item?.unpaidAmount || 0;
              monto += typeof m === 'number' ? m : parseFloat(String(m).replace(/[^0-9.-]/g, '')) || 0;
            });
            if (monto > 0) detail += ` | Monto: $${Math.round(monto).toLocaleString('es-CL')}`;
          }

          if (['Causas Civiles', 'Causas Laborales', 'Causas de Cobranza Laboral'].includes(label) && Array.isArray(r.details)) {
            let vigentes = 0, concluidas = 0;
            r.details.forEach((item: any) => {
              const estado = String(item?.estado || '').toLowerCase();
              if (estado.includes('vigente')) vigentes++;
              else if (estado.includes('concluida') || estado.includes('concluido')) concluidas++;
            });
            detail += ` | Vigentes: ${vigentes}, Concluidas: ${concluidas}`;
          }

          if (label === 'Causas Penales' && Array.isArray(r.details)) {
            const posturas: Record<string, number> = {};
            r.details.forEach((item: any) => {
              const p = (item?.postura || '').toLowerCase().trim();
              if (p) posturas[p] = (posturas[p] || 0) + 1;
            });
            const parts = Object.entries(posturas).map(([k, v]) => `${k}: ${v}`);
            if (parts.length > 0) detail += ` | ${parts.join(', ')}`;
          }

          if (label === 'Deuda Previsional Presunta' && r.detailCount > 0) {
            detail += ` | ${r.detailCount} afiliado${r.detailCount > 1 ? 's' : ''}`;
          }

          hallazgos.push(detail);
        }

        row.push(hallazgos.join('\n'), hallazgos.length > 0 ? hallazgos.length : '');
        dataRows.push(row);
      }

      const totalsRow: any[] = [
        'TOTALES', `${uniqueRuts.length} RUTs`, '', '', '',
        totalCritical, totalHigh, totalLow,
      ];
      for (const label of allRuleLabelsOrdered) {
        const ct = columnTotals[label];
        totalsRow.push(
          '',
          ct.detected > 0 ? `${ct.detected} RUTs` : '',
          '',
          ct.totalDetails > 0 ? ct.totalDetails : '',
        );
      }
      totalsRow.push('', '');

      const wb = XLSX.utils.book_new();
      const allRows = [headerRow1, headerRow2, ...dataRows, totalsRow];
      const ws = XLSX.utils.aoa_to_sheet(allRows);

      const merges: XLSX.Range[] = [];
      let colIdx = fixedHeaders.length;
      for (const _label of allRuleLabelsOrdered) {
        merges.push({
          s: { r: 0, c: colIdx },
          e: { r: 0, c: colIdx + 3 },
        });
        colIdx += 4;
      }
      ws['!merges'] = merges;

      const colWidths: { wch: number }[] = [
        { wch: 40 }, { wch: 16 }, { wch: 16 },
        { wch: 14 }, { wch: 14 },
        { wch: 12 }, { wch: 12 }, { wch: 12 },
      ];
      for (const _label of allRuleLabelsOrdered) {
        colWidths.push({ wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 });
      }
      colWidths.push({ wch: 80 }, { wch: 12 });
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, 'Reporte');

      const fileName = `Reporte_FastCheck_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast.dismiss('export-generating');

      const conRiesgo = dataRows.filter(r => (r[5] as number) > 0).length;
      toast.success(`Excel generado: ${uniqueRuts.length} RUTs, ${conRiesgo} con riesgo crítico`);
    } catch (error) {
      toast.dismiss('export-progress');
      toast.dismiss('export-generating');
      console.error('Error generating Excel:', error);
      toast.error('Error al generar el Excel');
    } finally {
      setLoadingAllData(false);
    }
  };

  // Cerrar dropdowns al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.relative')) {
        setShowRiskDropdown(false);
        setShowTagDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DEEP_ANALYSIS_STORAGE_KEY);
      if (!stored) return;
      const parsed: DeepAnalysisStoragePayload = JSON.parse(stored);
      if (parsed.version === DEEP_ANALYSIS_STORAGE_VERSION && Array.isArray(parsed.data)) {
        setCompactRutData(parsed.data);
      } else {
        localStorage.removeItem(DEEP_ANALYSIS_STORAGE_KEY);
      }
    } catch (e) {
      console.error('Error cargando análisis profundo cacheado:', e);
    }
  }, []);
  const applyFiltersToData = (data: IResult[]) => {
    return data.filter(result => {
      const resultDate = new Date(result.createdAt);
      const start = appliedStartDate ? new Date(appliedStartDate) : null;
      const end = appliedEndDate ? new Date(appliedEndDate) : null;
      if (start && resultDate < start) return false;
      if (end && resultDate > end) return false;

      if (appliedRiskLevels.length > 0 && !appliedRiskLevels.includes(result.riskAssessment?.riskSummary?.semaphore || '')) return false;

      if (appliedTags.length > 0 && (!result.noteTags || !result.noteTags.some(tag => appliedTags.includes(tag)))) return false;

      return true;
    });
  };

  const handleDeepAnalysis = async () => {
    console.log('=== handleDeepAnalysis START ===');
    setLoadingDeepAnalysis(true);
    try {
      const rawData = isFilterMode && allDataForFilters.length > 0
        ? allDataForFilters
        : (allDataForCharts.length > 0 ? allDataForCharts : results);
      const sourceData = applyFiltersToData(rawData);
      const allUniqueRuts = Array.from(new Set(
        sourceData.map(r => r.rut || r.identifier || '').filter(Boolean)
      ));

      if (allUniqueRuts.length === 0) {
        toast.error('No hay RUTs para analizar');
        setLoadingDeepAnalysis(false);
        return;
      }

      let uniqueRuts = allUniqueRuts;
      if (allUniqueRuts.length > DEEP_ANALYSIS_MAX_RUTS) {
        uniqueRuts = allUniqueRuts.slice(0, DEEP_ANALYSIS_MAX_RUTS);
        toast(
          `El análisis profundo está limitado a ${DEEP_ANALYSIS_MAX_RUTS} RUTs por restricciones de almacenamiento. Se analizarán los primeros ${DEEP_ANALYSIS_MAX_RUTS} de ${allUniqueRuts.length}. Para todos los RUTs usa "Exportar Excel".`,
          { duration: 8000, icon: '⚠️' }
        );
      }

      if (uniqueRuts.length === 0) {
        toast.error('No hay RUTs para analizar');
        setLoadingDeepAnalysis(false);
        return;
      }

      const rutResponses: Array<{ rutValue: string; data: any }> = [];
      const compactEntries: CompactRutData[] = [];

      for (let i = 0; i < uniqueRuts.length; i++) {
        const rutValue = uniqueRuts[i];
        try {
          toast.loading(`Analizando RUT ${i + 1}/${uniqueRuts.length}: ${rutValue}`, { id: 'deep-progress' });

          const response = await apiClient.get(`/rut/results/rut/${rutValue}`);
          const d = response.data;
          rutResponses.push({ rutValue, data: d });
          compactEntries.push(buildCompactEntryFromResponse(rutValue, d));

          if (i < uniqueRuts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } catch (err) {
          console.error(`Error RUT ${rutValue}:`, err);
        }
      }

      setCachedRutResponses(rutResponses);
      setCompactRutData(compactEntries);

      // Persistir solo lo compacto
      try {
        const payload: DeepAnalysisStoragePayload = {
          version: DEEP_ANALYSIS_STORAGE_VERSION,
          timestamp: Date.now(),
          data: compactEntries,
        };
        localStorage.setItem(DEEP_ANALYSIS_STORAGE_KEY, JSON.stringify(payload));
      } catch (e) {
        console.error('Error guardando análisis en localStorage:', e);
        // Si excede la cuota, limpiamos para no dejar estado corrupto
        try { localStorage.removeItem(DEEP_ANALYSIS_STORAGE_KEY); } catch { }
      }

      toast.dismiss('deep-progress');
      toast.success('Análisis profundo completado');
    } catch (error) {
      toast.dismiss('deep-progress');
      console.error('Error deep analysis:', error);
      toast.error('Error al generar análisis profundo');
    } finally {
      setLoadingDeepAnalysis(false);
    }
  };

  // Verificar si hay filtros activos (mover antes de su uso)
  const hasActiveFilters = !!(appliedStartDate || appliedEndDate || appliedRiskLevels.length > 0 || appliedTags.length > 0 || appliedSearch);
  const hasNonSearchFilters = !!(appliedStartDate || appliedEndDate || appliedRiskLevels.length > 0 || appliedTags.length > 0);

  // Determinar qué datos mostrar
  const baseData = isFilterMode ? allDataForFilters : results;

  // Para gráficos: siempre usar todos los datos cargados
  const dataForCharts = allDataForCharts.length > 0 ? allDataForCharts : results;

  const filteredResults = hasNonSearchFilters ? applyFiltersToData(baseData) : baseData;
  const filteredChartsData = applyFiltersToData(dataForCharts);

  const dataAfterSelection = selectedRuts.length > 0
    ? filteredChartsData.filter(r => selectedRuts.includes(r.rut || r.identifier || ''))
    : filteredChartsData;

  const totalFilteredPages = Math.ceil(filteredResults.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedResults = isFilterMode ? filteredResults.slice(startIndex, endIndex) : filteredResults;

  console.log('Dashboard state:', {
    isFilterMode,
    hasNonSearchFilters,
    currentPage,
    baseDataLength: baseData.length,
    allDataForChartsLength: allDataForCharts.length,
    filteredResultsLength: filteredResults.length,
    filteredChartsDataLength: filteredChartsData.length,
    paginatedResultsLength: paginatedResults.length,
    totalPages: isFilterMode ? totalFilteredPages : totalPages
  });

  const uniqueTags = Array.from(new Set(baseData.flatMap(result => result.noteTags || []))).sort();
  const dailyEvaluations = dataAfterSelection.filter(r => r.createdAt.startsWith(new Date().toISOString().split('T')[0])).length;

  const toggleRiskLevel = (level: string) => {
    setRiskLevelFilters(prev =>
      prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]
    );
  };

  const toggleTag = (tag: string) => {
    setTagFilters(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleApplyFilters = async () => {
    const trimmedSearch = searchFilter.trim();

    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setAppliedRiskLevels([...riskLevelFilters]);
    setAppliedTags([...tagFilters]);
    setAppliedSearch(trimmedSearch);
    setCurrentPage(1);

    const needsAllData = startDate || endDate || riskLevelFilters.length > 0 || tagFilters.length > 0;

    if (needsAllData) {
      setLoadingAllData(true);
      setIsFilterMode(true);
      try {
        let allData: IResult[] = [];
        let page = 1;
        let totalP = 1;
        do {
          const res = await getResults({
            page,
            limit: 50,
            sortField,
            sortDirection,
            ...(trimmedSearch && { search: trimmedSearch })
          });
          if (res?.data) allData = [...allData, ...res.data];
          totalP = res?.pagination?.totalPages || 1;
          page++;
        } while (page <= totalP);

        const uniqueData = removeDuplicateRuts(allData);

        setAllDataForFilters(uniqueData);
        toast.success(`Filtros aplicados - ${uniqueData.length} registros cargados`);
      } catch (error) {
        logger.error('Error loading all data:', error);
        toast.error('Error al cargar datos');
      } finally {
        setLoadingAllData(false);
      }
    } else {
      setIsFilterMode(false);
      setAllDataForFilters([]);
      if (trimmedSearch) {
        toast.success('Búsqueda aplicada');
      }
    }
  };

  const clearAllFilters = () => {
    setStartDate('');
    setEndDate('');
    setRiskLevelFilters([]);
    setTagFilters([]);
    setSearchFilter('');
    setAppliedStartDate('');
    setAppliedEndDate('');
    setAppliedRiskLevels([]);
    setAppliedTags([]);
    setAppliedSearch('');
    setCurrentPage(1);
    setIsFilterMode(false);
    setAllDataForFilters([]);
  };

  const removeFilter = (filterType: string, value?: string) => {
    switch (filterType) {
      case 'startDate':
        setStartDate('');
        setAppliedStartDate('');
        break;
      case 'endDate':
        setEndDate('');
        setAppliedEndDate('');
        break;
      case 'riskLevel':
        if (value) {
          const newRiskLevels = appliedRiskLevels.filter(r => r !== value);
          setRiskLevelFilters(newRiskLevels);
          setAppliedRiskLevels(newRiskLevels);
        }
        break;
      case 'tag':
        if (value) {
          const newTags = appliedTags.filter(t => t !== value);
          setTagFilters(newTags);
          setAppliedTags(newTags);
        }
        break;
      case 'search':
        setSearchFilter('');
        setAppliedSearch('');
        break;
    }
    setCurrentPage(1);

    setTimeout(() => {
      const stillNeedsAllData = (filterType === 'startDate' ? false : !!appliedStartDate) ||
        (filterType === 'endDate' ? false : !!appliedEndDate) ||
        (filterType === 'riskLevel' && value ? appliedRiskLevels.filter(r => r !== value).length > 0 : appliedRiskLevels.length > 0) ||
        (filterType === 'tag' && value ? appliedTags.filter(t => t !== value).length > 0 : appliedTags.length > 0);

      if (!stillNeedsAllData) {
        setIsFilterMode(false);
        setAllDataForFilters([]);
      }
    }, 0);
  };

  const getRiskLevelLabel = (level: string) => {
    switch (level) {
      case 'green': return 'Bajo';
      case 'yellow': return 'Medio';
      case 'orange': return 'Alto';
      case 'red': return 'Crítico';
      default: return level;
    }
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'green': return 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700';
      case 'yellow': return 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700';
      case 'orange': return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700';
      case 'red': return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700';
      default: return 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600';
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleRiskChartClick = async (riskLevel: 'green' | 'yellow' | 'orange' | 'red') => {
    setRiskLevelFilters([riskLevel]);
    setAppliedRiskLevels([riskLevel]);
    setCurrentPage(1);

    setLoadingAllData(true);
    setIsFilterMode(true);
    try {
      let allData: IResult[] = [];
      let page = 1;
      let totalP = 1;
      do {
        const res = await getResults({
          page,
          limit: 50,
          sortField,
          sortDirection,
          ...(appliedSearch && { search: appliedSearch })
        });
        if (res?.data) allData = [...allData, ...res.data];
        totalP = res?.pagination?.totalPages || 1;
        page++;
      } while (page <= totalP);

      const uniqueData = removeDuplicateRuts(allData);

      setAllDataForFilters(uniqueData);
      toast.success(`Filtro de riesgo "${getRiskLevelLabel(riskLevel)}" aplicado`);
    } catch (error) {
      logger.error('Error loading all data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoadingAllData(false);
    }
  };

  const handleExportPDF = async () => {
    setExportingPdf(true);
    try {
      let allResults: IResult[] = [];
      let page = 1;
      let totalP = 1;
      do {
        const res = await getResults({ page, limit: 50, sortField, sortDirection, ...(appliedSearch && { search: appliedSearch }) });
        if (res?.data) allResults = [...allResults, ...res.data];
        totalP = res?.pagination?.totalPages || 1;
        page++;
      } while (page <= totalP);

      const uniqueAllResults = removeDuplicateRuts(allResults);

      const finalData = applyFiltersToData(uniqueAllResults);
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
      const pageWidth = 297;
      const pageHeight = 210;
      const margin = 15;
      let currentY = margin;

      try {
        const logoImg = new Image();
        logoImg.crossOrigin = 'anonymous';
        await new Promise((res, rej) => {
          logoImg.onload = res; logoImg.onerror = rej;
          logoImg.src = duxiterLogo;
        });
        pdf.addImage(logoImg, 'PNG', (pageWidth - 34) / 2, currentY, 34, 16);
        currentY += 22;
      } catch (e) { currentY += 10; }

      pdf.setFontSize(16);
      pdf.text("Dashboard consultas", margin, currentY);
      currentY += 10;

      if (hasActiveFilters) {
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        pdf.text("Filtros Aplicados:", margin, currentY);
        currentY += 7;
        pdf.setFontSize(9);
        pdf.setFont("helvetica", "normal");

        if (appliedStartDate) {
          pdf.text(`• Fecha Inicio: ${new Date(appliedStartDate).toLocaleDateString()}`, margin + 5, currentY);
          currentY += 5;
        }
        if (appliedEndDate) {
          pdf.text(`• Fecha Fin: ${new Date(appliedEndDate).toLocaleDateString()}`, margin + 5, currentY);
          currentY += 5;
        }
        if (appliedRiskLevels.length > 0) {
          const riskLabels = appliedRiskLevels.map(r => getRiskLevelLabel(r)).join(', ');
          pdf.text(`• Nivel de Riesgo: ${riskLabels}`, margin + 5, currentY);
          currentY += 5;
        }
        if (appliedTags.length > 0) {
          const tagsText = appliedTags.join(', ');
          pdf.text(`• Tags: ${tagsText}`, margin + 5, currentY);
          currentY += 5;
        }
        if (appliedSearch) {
          pdf.text(`• Búsqueda: "${appliedSearch}"`, margin + 5, currentY);
          currentY += 5;
        }

        currentY += 5;
      }

      const historyEl = document.getElementById('pdf-chart-history');
      if (historyEl) {
        const canvas = await html2canvas(historyEl, { scale: 2, backgroundColor: '#ffffff' });
        const chartWidth = (pageWidth - 2 * margin) * 0.8;
        const imgH = (canvas.height * chartWidth) / canvas.width;
        const xOffset = ((pageWidth - 2 * margin) - chartWidth) / 2 + margin;
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', xOffset, currentY, chartWidth, imgH);
        currentY += imgH + 10;
      }


      if (deepAnalysisData) {
        const deepEl = document.getElementById('pdf-deep-analysis');
        if (deepEl) {
          const buttons = deepEl.querySelectorAll('button[data-pdf-hide="true"]');
          buttons.forEach(btn => (btn as HTMLElement).style.display = 'none');

          const expandables = deepEl.querySelectorAll('[data-pdf-expand="true"]');
          const originalMaxHeights: string[] = [];
          const originalOverflows: string[] = [];
          expandables.forEach((el, i) => {
            const htmlEl = el as HTMLElement;
            originalMaxHeights[i] = htmlEl.style.maxHeight;
            originalOverflows[i] = htmlEl.style.overflow;
            htmlEl.style.maxHeight = 'none';
            htmlEl.style.overflow = 'visible';
          });

          const captureOpts = {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
          };

          const chartWidth = pageWidth - 2 * margin;
          const fullPageHeight = pageHeight - 2 * margin;

          const PX_TO_MM = 0.22;

          // 1) Capturar parte superior (sin las cards de RUT) → ancho completo
          // 1) Capturar parte superior (sin las cards de RUT ni el título de la tabla) → ancho completo
          const cards = Array.from(deepEl.querySelectorAll('[data-pdf-section="rut-card"]')) as HTMLElement[];
          const originalCardDisplay: string[] = [];
          cards.forEach((card, i) => {
            originalCardDisplay[i] = card.style.display;
            card.style.display = 'none';
          });

          // Ocultar también el título "RUTs por Parámetro Seleccionado" para dibujarlo aparte
          const tableHeaderEl = deepEl.querySelector('[data-pdf-table-header="true"]') as HTMLElement | null;
          const originalTableHeaderDisplay = tableHeaderEl ? tableHeaderEl.style.display : '';
          if (tableHeaderEl) tableHeaderEl.style.display = 'none';

          // Quitar truncate del bloque superior para que los nombres se vean completos
          const topTruncated = deepEl.querySelectorAll('.truncate');
          const topTruncatedOriginals: { el: HTMLElement; original: string }[] = [];
          topTruncated.forEach(t => {
            const el = t as HTMLElement;
            topTruncatedOriginals.push({ el, original: el.style.cssText });
            el.style.overflow = 'visible';
            el.style.textOverflow = 'clip';
            el.style.whiteSpace = 'normal';
          });

          await new Promise(resolve => setTimeout(resolve, 80));
          const topCanvas = await html2canvas(deepEl, captureOpts);
          const topImgH = (topCanvas.height * chartWidth) / topCanvas.width;

          if (currentY + topImgH > pageHeight - margin) {
            pdf.addPage();
            currentY = margin;
          }
          pdf.addImage(topCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, currentY, chartWidth, topImgH);
          currentY += topImgH + 8;

          // Restaurar truncate del bloque superior
          topTruncatedOriginals.forEach(({ el, original }) => {
            el.style.cssText = original;
          });

          // Restaurar cards y título ANTES de medir columnas
          cards.forEach((card, i) => {
            card.style.display = originalCardDisplay[i];
          });

          if (tableHeaderEl) tableHeaderEl.style.display = originalTableHeaderDisplay;

          // Esperar a que el DOM reflowee antes de medir columnas
          await new Promise(resolve => setTimeout(resolve, 100));

          // 2) Capturar la tabla de cada card: thead + cada fila independientemente
          // 2) Capturar la tabla de cada card: thead + cada fila independientemente
          type RowCanvas = { canvas: HTMLCanvasElement; cardIndex: number };
          const headerCanvases: (HTMLCanvasElement | null)[] = [];
          const rowCanvases: RowCanvas[] = [];

          // Quitar truncate dentro de las cards
          const cardTruncatedEls: { el: HTMLElement; original: string }[] = [];
          cards.forEach(card => {
            const titles = card.querySelectorAll('.truncate');
            titles.forEach(t => {
              const el = t as HTMLElement;
              cardTruncatedEls.push({ el, original: el.style.cssText });
              el.style.overflow = 'visible';
              el.style.textOverflow = 'clip';
              el.style.whiteSpace = 'normal';
            });
          });

          for (let cardIdx = 0; cardIdx < cards.length; cardIdx++) {
            const card = cards[cardIdx];
            const table = card.querySelector('table') as HTMLTableElement | null;

            if (!table) {
              headerCanvases.push(null);
              continue;
            }

            const cardWidth = card.offsetWidth;
            const tableClass = table.className;

            const thead = table.querySelector('thead');
            const headerCells = thead ? Array.from(thead.querySelectorAll('th')) as HTMLTableCellElement[] : [];
            let columnWidths = headerCells.map(th => th.getBoundingClientRect().width);
            let totalColWidth = columnWidths.reduce((a, b) => a + b, 0);

            if (totalColWidth === 0 && headerCells.length > 0) {
              columnWidths = headerCells.map(() => 1);
              totalColWidth = headerCells.length;
            }

            const buildColgroup = () => {
              const cg = document.createElement('colgroup');
              columnWidths.forEach(w => {
                const col = document.createElement('col');
                col.style.width = `${(w / totalColWidth) * 100}%`;
                cg.appendChild(col);
              });
              return cg;
            };

            // Capturar el thead solo
            if (thead) {
              const headerTable = document.createElement('table');
              headerTable.className = tableClass;
              headerTable.style.width = '100%';
              headerTable.style.borderCollapse = 'collapse';
              headerTable.style.tableLayout = 'fixed';
              headerTable.appendChild(buildColgroup());
              headerTable.appendChild(thead.cloneNode(true));

              const headerWrapper = document.createElement('div');
              headerWrapper.style.cssText = `width: ${cardWidth}px; background: #ffffff; border: 1px solid #e5e7eb; border-bottom: none; border-radius: 8px 8px 0 0; overflow: hidden; position: absolute; left: -99999px; top: 0;`;
              headerWrapper.appendChild(headerTable);
              document.body.appendChild(headerWrapper);

              await new Promise(r => setTimeout(r, 30));
              const headerCanvas = await html2canvas(headerWrapper, captureOpts);
              headerCanvases.push(headerCanvas);
              document.body.removeChild(headerWrapper);
            } else {
              headerCanvases.push(null);
            }

            // Capturar cada fila del tbody
            const trs = Array.from(table.querySelectorAll('tbody tr')) as HTMLTableRowElement[];
            for (let rIdx = 0; rIdx < trs.length; rIdx++) {
              const tr = trs[rIdx];

              const rowTable = document.createElement('table');
              rowTable.className = tableClass;
              rowTable.style.width = '100%';
              rowTable.style.borderCollapse = 'collapse';
              rowTable.style.tableLayout = 'fixed';
              rowTable.appendChild(buildColgroup());
              const tbody = document.createElement('tbody');
              tbody.appendChild(tr.cloneNode(true));
              rowTable.appendChild(tbody);

              const rowWrapper = document.createElement('div');
              const isLast = rIdx === trs.length - 1;
              rowWrapper.style.cssText = `width: ${cardWidth}px; background: #ffffff; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb; ${isLast ? 'border-bottom: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;' : ''} overflow: hidden; position: absolute; left: -99999px; top: 0;`;
              rowWrapper.appendChild(rowTable);
              document.body.appendChild(rowWrapper);

              await new Promise(r => setTimeout(r, 15));
              const rowCanvas = await html2canvas(rowWrapper, captureOpts);
              rowCanvases.push({ canvas: rowCanvas, cardIndex: cardIdx });
              document.body.removeChild(rowWrapper);
            }
          }

          // Restaurar truncate
          cardTruncatedEls.forEach(({ el, original }) => {
            el.style.cssText = original;
          });

          // Capturar el título de la tabla por separado para mantenerlo junto a la grilla
          let titleCanvas: HTMLCanvasElement | null = null;
          let titleImgH = 0;
          if (tableHeaderEl) {
            await new Promise(r => setTimeout(r, 30));
            titleCanvas = await html2canvas(tableHeaderEl, captureOpts);
            titleImgH = (titleCanvas.height * chartWidth) / titleCanvas.width;
          }

          // Dibujar en el PDF: título + por cada card, header + filas con salto de página
          let titleDrawn = false;
          for (let cardIdx = 0; cardIdx < cards.length; cardIdx++) {
            const headerCanvas = headerCanvases[cardIdx];
            const rows = rowCanvases.filter(r => r.cardIndex === cardIdx);
            if (rows.length === 0) continue;

            const headerImgH = headerCanvas ? (headerCanvas.height * chartWidth) / headerCanvas.width : 0;
            const firstRowH = (rows[0].canvas.height * chartWidth) / rows[0].canvas.width;

            const minBlockHeight = (titleDrawn ? 0 : titleImgH + 4) + headerImgH + firstRowH;
            if (currentY + minBlockHeight > pageHeight - margin) {
              pdf.addPage();
              currentY = margin;
            }

            if (!titleDrawn && titleCanvas) {
              pdf.addImage(titleCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, currentY, chartWidth, titleImgH);
              currentY += titleImgH + 4;
              titleDrawn = true;
            }

            if (headerCanvas) {
              pdf.addImage(headerCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, currentY, chartWidth, headerImgH);
              currentY += headerImgH;
            }

            for (const { canvas: rowCanvas } of rows) {
              const rowImgH = (rowCanvas.height * chartWidth) / rowCanvas.width;

              if (currentY + rowImgH > pageHeight - margin) {
                pdf.addPage();
                currentY = margin;
                if (headerCanvas) {
                  pdf.addImage(headerCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, currentY, chartWidth, headerImgH);
                  currentY += headerImgH;
                }
              }

              pdf.addImage(rowCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, currentY, chartWidth, rowImgH);
              currentY += rowImgH;
            }

            currentY += 8;
          }

          // Restaurar truncate
          cardTruncatedEls.forEach(({ el, original }) => {
            el.style.cssText = original;
          });

          // Dibujar en el PDF: por cada card, header + filas con salto de página
          for (let cardIdx = 0; cardIdx < cards.length; cardIdx++) {
            const headerCanvas = headerCanvases[cardIdx];
            const rows = rowCanvases.filter(r => r.cardIndex === cardIdx);
            if (rows.length === 0) continue;

            const headerImgH = headerCanvas ? (headerCanvas.height * chartWidth) / headerCanvas.width : 0;

            // Asegurar que el header + al menos 1 fila entren en la página actual
            const firstRowH = (rows[0].canvas.height * chartWidth) / rows[0].canvas.width;
            if (currentY + headerImgH + firstRowH > pageHeight - margin) {
              pdf.addPage();
              currentY = margin;
            }

            // Dibujar header
            if (headerCanvas) {
              pdf.addImage(headerCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, currentY, chartWidth, headerImgH);
              currentY += headerImgH;
            }

            // Dibujar cada fila, redibujando header en cada nueva página
            for (const { canvas: rowCanvas } of rows) {
              const rowImgH = (rowCanvas.height * chartWidth) / rowCanvas.width;

              if (currentY + rowImgH > pageHeight - margin) {
                pdf.addPage();
                currentY = margin;
                if (headerCanvas) {
                  pdf.addImage(headerCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, currentY, chartWidth, headerImgH);
                  currentY += headerImgH;
                }
              }

              pdf.addImage(rowCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, currentY, chartWidth, rowImgH);
              currentY += rowImgH;
            }

            currentY += 8;
          }





          expandables.forEach((el, i) => {
            const htmlEl = el as HTMLElement;
            htmlEl.style.maxHeight = originalMaxHeights[i];
            htmlEl.style.overflow = originalOverflows[i];
          });
          buttons.forEach(btn => (btn as HTMLElement).style.display = '');
        }
      }

      const smallCharts = ['pdf-chart-risk', 'pdf-chart-daily', 'pdf-meter', 'pdf-tenant'];
      const chartW = ((pageWidth - 3 * margin) / 2) * 0.8;
      let rowMaxH = 0;

      for (let i = 0; i < smallCharts.length; i++) {
        const el = document.getElementById(smallCharts[i]);
        if (el) {
          const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff' });
          const imgH = (canvas.height * chartW) / canvas.width;
          if (currentY + imgH > pageHeight - margin) { pdf.addPage(); currentY = margin + 10; }
          const baseXPos = (i % 2 === 0) ? margin : margin + ((pageWidth - 3 * margin) / 2) + margin;
          const xOffset = baseXPos + (((pageWidth - 3 * margin) / 2) - chartW) / 2;
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', xOffset, currentY, chartW, imgH);
          rowMaxH = Math.max(rowMaxH, imgH);
          if (i % 2 !== 0 || i === smallCharts.length - 1) { currentY += rowMaxH + 10; rowMaxH = 0; }
        }
      }

      pdf.addPage();
      currentY = margin;
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text("Detalle de Evaluaciones", margin, currentY);
      currentY += 10;

      const cols = {
        rut: margin,
        name: margin + 35,
        tag: margin + 140,
        risk: margin + 200,
        date: margin + 245
      };

      pdf.setFontSize(9);
      pdf.setFont("helvetica", "bold");
      pdf.setFillColor(249, 250, 251);
      pdf.setDrawColor(229, 231, 235);
      pdf.rect(margin, currentY - 5, pageWidth - 2 * margin, 8, 'FD');

      pdf.setTextColor(55, 65, 81);
      pdf.text("RUT", cols.rut, currentY);
      pdf.text("RAZÓN SOCIAL", cols.name, currentY);
      pdf.text("TAG", cols.tag, currentY);
      pdf.text("NIVEL DE RIESGO", cols.risk, currentY);
      pdf.text("FECHA CONSULTA", cols.date, currentY);

      currentY += 8;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(17, 24, 39);

      let rowIndex = 0;
      finalData.forEach(item => {
        if (currentY > pageHeight - margin - 10) {
          pdf.addPage();
          currentY = margin + 10;

          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(9);
          pdf.setFillColor(249, 250, 251);
          pdf.setDrawColor(229, 231, 235);
          pdf.rect(margin, currentY - 5, pageWidth - 2 * margin, 8, 'FD');
          pdf.setTextColor(55, 65, 81);
          pdf.text("RUT", cols.rut, currentY);
          pdf.text("RAZÓN SOCIAL", cols.name, currentY);
          pdf.text("TAG", cols.tag, currentY);
          pdf.text("NIVEL DE RIESGO", cols.risk, currentY);
          pdf.text("FECHA CONSULTA", cols.date, currentY);
          currentY += 8;

          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8);
          pdf.setTextColor(17, 24, 39);
          rowIndex = 0;
        }

        if (rowIndex % 2 === 0) {
          pdf.setFillColor(255, 255, 255);
        } else {
          pdf.setFillColor(249, 250, 251);
        }
        pdf.rect(margin, currentY - 4, pageWidth - 2 * margin, 6, 'F');

        const rut = item.rut || item.identifier || '-';
        const razonSocial = item.details?.razonSocial || item.razonSocial || '-';

        pdf.setTextColor(17, 24, 39);
        pdf.setFont("helvetica", "bold");
        pdf.text(rut, cols.rut, currentY);

        pdf.setFont("helvetica", "normal");
        pdf.text(razonSocial.substring(0, 60), cols.name, currentY);

        pdf.setTextColor(30, 64, 175);
        pdf.text((item.noteTags?.join(', ') || '-').substring(0, 30), cols.tag, currentY);

        const sem = item.riskAssessment?.riskSummary?.semaphore || 'N/A';
        const riskLabel = sem === 'red' ? 'CRÍTICO' : sem === 'orange' ? 'ALTO' : sem === 'yellow' ? 'MEDIO' : sem === 'green' ? 'BAJO' : 'N/A';

        pdf.setFont("helvetica", "bold");
        if (sem === 'red') {
          pdf.setTextColor(153, 27, 27);
        } else if (sem === 'orange') {
          pdf.setTextColor(154, 52, 18);
        } else if (sem === 'yellow') {
          pdf.setTextColor(133, 77, 14);
        } else if (sem === 'green') {
          pdf.setTextColor(22, 101, 52);
        } else {
          pdf.setTextColor(31, 41, 55);
        }
        pdf.text(riskLabel, cols.risk, currentY);

        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(107, 114, 128);
        pdf.text(new Date(item.createdAt).toLocaleDateString(), cols.date, currentY);

        currentY += 6;

        pdf.setDrawColor(229, 231, 235);
        pdf.setLineWidth(0.1);
        pdf.line(margin, currentY - 4, pageWidth - margin, currentY - 4);

        rowIndex++;
      });

      pdf.save(`Reporte_Duxiter_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF generado");
    } catch (error) {
      console.error(error);
      toast.error("Error al generar PDF");
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <>
      <div className="max-w-full mx-auto px-6 py-10">
        <div className="space-y-8">
          {/* Panel de Filtros */}
          <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center space-x-3 mb-6">
              <AdjustmentsHorizontalIcon className="h-6 w-6 text-primary-500" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Filtros de Búsqueda</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha Inicio</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha Fin</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nivel de Riesgo</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowRiskDropdown(!showRiskDropdown)}
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none text-left flex items-center justify-between focus:ring-2 focus:ring-primary-500"
                  >
                    <span className="truncate">
                      {riskLevelFilters.length === 0
                        ? 'Seleccionar...'
                        : `${riskLevelFilters.length} seleccionado${riskLevelFilters.length > 1 ? 's' : ''}`
                      }
                    </span>
                    <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {showRiskDropdown && (
                    <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                      {[
                        { value: 'red', label: 'Crítico' },
                        { value: 'orange', label: 'Alto' },
                        { value: 'yellow', label: 'Medio' },
                        { value: 'green', label: 'Bajo' }
                      ].map(risk => (
                        <label key={risk.value} className="flex items-center space-x-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={riskLevelFilters.includes(risk.value)}
                            onChange={() => toggleRiskLevel(risk.value)}
                            className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{risk.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tags</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowTagDropdown(!showTagDropdown)}
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none text-left flex items-center justify-between focus:ring-2 focus:ring-primary-500"
                  >
                    <span className="truncate">
                      {tagFilters.length === 0
                        ? 'Seleccionar...'
                        : `${tagFilters.length} seleccionado${tagFilters.length > 1 ? 's' : ''}`
                      }
                    </span>
                    <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {showTagDropdown && (
                    <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                      {uniqueTags.length > 0 ? (
                        uniqueTags.map(tag => (
                          <label key={tag} className="flex items-center space-x-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={tagFilters.includes(tag)}
                              onChange={() => toggleTag(tag)}
                              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{tag}</span>
                          </label>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No hay tags disponibles</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Búsqueda rápida</label>
                <div className="relative">
                  <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-2.5 text-gray-400" />
                  <input type="text" placeholder="RUT o Nombre..." value={searchFilter} onChange={e => setSearchFilter(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6 border-t border-gray-100 dark:border-gray-700 pt-6">
              <button
                onClick={handleApplyFilters}
                disabled={loadingAllData}
                className="bg-primary-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {loadingAllData ? "Aplicando..." : "Aplicar"}
              </button>
              <button onClick={clearAllFilters} className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">Limpiar</button>
              <button onClick={handleExportPDF} disabled={exportingPdf} className="flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 transition-all disabled:opacity-50">
                <DocumentArrowDownIcon className="h-5 w-5" />
                {exportingPdf ? "Generando..." : "Exportar PDF"}
              </button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-4 items-start">
            <div id="pdf-chart-risk" className="w-full lg:w-96 flex-shrink-0">
              <RiskDonutChart results={dataAfterSelection} onRiskClick={handleRiskChartClick} />
            </div>
            <div className="flex-1 min-w-0">
              <ResultsTable
                results={paginatedResults as IResult[]}
                currentPage={currentPage}
                totalPages={isFilterMode ? totalFilteredPages : totalPages}
                onPageChange={setCurrentPage}
                onSort={handleSort}
                sortField={sortField}
                sortDirection={sortDirection}
                selectedRuts={selectedRuts}
                onSelectionChange={setSelectedRuts}
              />
            </div>

          </div>

          {/* Filtros Activos */}
          {hasActiveFilters && (
            <div className="  p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-3">Filtros Activos:</h4>
                  <div className="flex flex-wrap gap-2">
                    {appliedStartDate && (
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Desde:</span>
                        {new Date(appliedStartDate).toLocaleDateString()}
                        <button onClick={() => removeFilter('startDate')} className="ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </span>
                    )}
                    {appliedEndDate && (
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Hasta:</span>
                        {new Date(appliedEndDate).toLocaleDateString()}
                        <button onClick={() => removeFilter('endDate')} className="ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </span>
                    )}
                    {appliedRiskLevels.map(level => (
                      <span key={level} className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg  ${getRiskLevelColor(level)}`}>
                        <span className="text-xs opacity-75">Riesgo:</span>
                        {getRiskLevelLabel(level)}
                        <button onClick={() => removeFilter('riskLevel', level)} className="ml-1 opacity-75 hover:opacity-100">
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </span>
                    ))}
                    {appliedTags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Tag:</span>
                        {tag}
                        <button onClick={() => removeFilter('tag', tag)} className="ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </span>
                    ))}
                    {appliedSearch && (
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Búsqueda:</span>
                        "{appliedSearch}"
                        <button onClick={() => removeFilter('search')} className="ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={clearAllFilters}
                  className="ml-4 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 whitespace-nowrap"
                >
                  Limpiar todos
                </button>
              </div>
            </div>
          )}

          {/* Deep Analysis Panel */}
          <div id="pdf-deep-analysis">
            <DeepAnalysisPanel
              data={deepAnalysisData}
              loadingAnalysis={loadingDeepAnalysis}
              loadingExcel={loadingAllData}
              onAnalyze={handleDeepAnalysis}
              onExportExcel={handleExportInfo}
            />
          </div>







          {/* Layout Dashboard */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              {/* Información de registros filtrados */}
              {isFilterMode && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-sm font-semibold text-blue-900 dark:text-blue-300">
                          Filtros Aplicados
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-400">
                          Mostrando <span className="font-bold">{filteredResults.length}</span> de <span className="font-bold">{allDataForFilters.length}</span> registros totales
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {filteredResults.length}
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        resultados
                      </p>
                    </div>
                  </div>
                </div>
              )}


              <div id="pdf-chart-history" className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Historial de Consultas</h3>
                  <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                    <label className="flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-gray-200 dark:hover:bg-gray-600">
                      <input
                        type="radio"
                        name="chartViewType"
                        value="monthly"
                        checked={chartViewType === 'monthly'}
                        onChange={() => setChartViewType('monthly')}
                        className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                      />
                      <span className={`text-sm font-medium ${chartViewType === 'monthly' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'}`}>
                        Mensual
                      </span>
                    </label>
                    <label className="flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-gray-200 dark:hover:bg-gray-600">
                      <input
                        type="radio"
                        name="chartViewType"
                        value="daily"
                        checked={chartViewType === 'daily'}
                        onChange={() => setChartViewType('daily')}
                        className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                      />
                      <span className={`text-sm font-medium ${chartViewType === 'daily' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'}`}>
                        Diaria
                      </span>
                    </label>
                    <label className="flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-gray-200 dark:hover:bg-gray-600">
                      <input
                        type="radio"
                        name="chartViewType"
                        value="yearly"
                        checked={chartViewType === 'yearly'}
                        onChange={() => setChartViewType('yearly')}
                        className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                      />
                      <span className={`text-sm font-medium ${chartViewType === 'yearly' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'}`}>
                        Anual
                      </span>
                    </label>
                  </div>
                </div>

                <ConsultationHistoryChart results={dataAfterSelection} viewType={chartViewType} />
              </div>
            </div>

            <div className="space-y-8">

              <div id="pdf-chart-daily"><DailyJobsSummary daily={dailyEvaluations} /></div>
              <div id="pdf-meter"><BulkEvaluationProgressMeter /></div>
              <div id="pdf-tenant"><TenantUsageSummary /></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Dashboard;