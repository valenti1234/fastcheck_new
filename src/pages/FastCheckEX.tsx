import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Users } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import PageLayout from '../components/layouts/PageLayout';
import { apiClient, userNotesApi, UserNote, formatChileanRut } from '../services/api';
import RuleDetailsModal from '../components/ui/RuleDetailsModal/RuleDetailsModal';

import { deriveRelations } from '../utils/dequienes';
import { applyConstitutionDate } from '../utils/constitution';
import { lookupRut, checkSociosEvaluations, resetSociosEvaluations } from '../services/companyService';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import duxiterLogo from '../assets/duxiter_logo.png';
import duxiterLogoBar from '../assets/duxiter_logo_bar.jpg';
import { logger } from '../utils/logger';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Dialog } from '@headlessui/react';
import {
  Tooltip,
} from '@mui/material';

import { ChevronDown, ChevronUp, Download, Edit3, Save, X, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useTranslation } from 'react-i18next';
import type { AntiunionCase } from '../services/antiunionCaseService';
import formatRut from '../utils/rutFormat';
import TableAssessment from '../components/ui/TableAssessment/TableAssessment';
import TableSummary from '../components/ui/TableSummary/TableSummary';
import TableBasic from '../components/ui/TableBasic/TableBasic';
import MeshTable from '../components/ui/MeshTable/MeshTable';
import Legalrepresentatives from '../components/ui/Legalrepresentatives/Legalrepresentatives';

interface ParameterData {
  label: string;
  impacto: string;
  risk: string;
  detected: boolean;
  details?: any;
}

interface RiskData {
  complianceRules: ParameterData[];
  legalRules: ParameterData[];
  capitalHumanoRules: ParameterData[];
  financieroTributarioRules: ParameterData[];
}

interface RiskSummary {
  riskSummary: {
    totalSevero: number;
    totalSignificativo: number;
    totalDetected: number;
    totalParameters: number;
    semaphore: string;
    riskLevelDescription: string;
  }
  allRules?: RiskData;
}

interface CompanyData {
  razonSocial: string;
  rut: string;
  fechaEvaluacion: string;
}

interface ListaPropiaEntry {
  _id: string;
  rut: string;
  nombre: string;
  tipoPersona: 'Empresa' | 'Persona';
  tipoLista: string;
  nombreSubLista: string;
  fechaIncorporacion: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface ListasPropias {
  altoImpacto: ListaPropiaEntry[];
  medioImpacto: ListaPropiaEntry[];
}

interface SocioEvaluation {
  rut: string;
  name: string;
  isSelected: boolean;
  isEvaluating: boolean;
  status?: 'pending' | 'in_progress' | 'completed' | 'error';
  errorMessage?: string;
  rutFoundAutomatically?: boolean; // Track if RUT was found in external data
  evaluationResult?: {
    hasPepChile: boolean;
    hasFamiliaresPep: boolean;
    sheriffData?: any;
  };
  previousEvaluation?: {
    hasBeenEvaluated: boolean;
    evaluationDate?: string;
    hasPepChile?: boolean;
    hasFamiliaresPep?: boolean;
  };
  isNaturalPerson?: boolean;
}

interface PepEvaluationSummary {
  pepChileDetected: boolean;
  familiaresPepDetected: boolean;
  evaluatedSocios: string[];
}

interface FinancialRisk {
  summary: string;
  riskLevel: 'Critical' | 'High' | 'Medium' | 'Low';
  riskScore?: number;
  keyIndicators?: {
    boletinComercialDebt?: number | null;
    laborDebt?: number | null;
    bankDebt?: number | null;
    bankruptcy?: boolean;
    assetsValue?: number | null;
  };
}

const FastCheck: React.FC = () => {
  const [searchParams] = useSearchParams();
  const exportJsonEnabled = searchParams.get('xjson') === 'true';
  const [data, setData] = useState<any>(null);
  const [resetRequested, setResetRequested] = useState(false);
  const [resetPerformed, setResetPerformed] = useState(false);
  //  logger.log(45,data);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Format date to DD-MM-YYYY format
  const formatDateToDDMMYYYY = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Fecha no disponible';
      }

      // Format as DD-MM-YYYY
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();

      return `${day}-${month}-${year}`;
    } catch (error) {
      return 'Fecha no disponible';
    }
  };
  const [rut, setRut] = useState('');
  const [expandedSections, setExpandedSections] = useState({
    parametros: true,
    informacion: true,
    hallazgos: true,
    resumen: true,
    notas: true
  });
  const [exportingPdf, setExportingPdf] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const [companyData, setCompanyData] = useState<CompanyData>({
    razonSocial: 'MAS RECICLABLE LIMITADA',
    rut: '77.777.777-7',
    fechaEvaluacion: '17 abril 2025',
  });
  const [riskSummary, setRiskSummary] = useState<RiskSummary>({
    riskSummary: {
      totalSevero: 1,
      totalSignificativo: 1,
      totalDetected: 17,
      totalParameters: 19,
      semaphore: 'red',
      riskLevelDescription: 'Alto Riesgo'
    },
    allRules: {
      complianceRules: [],
      legalRules: [],
      capitalHumanoRules: [],
      financieroTributarioRules: [],
    }
  });

  const [financialRisk, setFinancialRisk] = useState<FinancialRisk | null>(null);

  // User notes state
  const [userNote, setUserNote] = useState<UserNote | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [currentTag, setCurrentTag] = useState('');
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  // AI Analysis state
  const showAI = false;
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);

  const [loadingAiAnalysis, setLoadingAiAnalysis] = useState(false);
  const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null);
  const [aiAnalysisFromCache, setAiAnalysisFromCache] = useState(false);
  const [aiAnalysisDate, setAiAnalysisDate] = useState<Date | null>(null);
  const [showRuleDetailsModal, setShowRuleDetailsModal] = useState(false);
  const [ruleDetailsContent, setRuleDetailsContent] = useState<any>(null);
  const [ruleDetailsTitle, setRuleDetailsTitle] = useState<string>('');
  const [ruleDetailsFilter, setRuleDetailsFilter] = useState<string>('');
  const [ruleDetailsSortKey, setRuleDetailsSortKey] = useState<string | null>(null);
  const [ruleDetailsSortDir, setRuleDetailsSortDir] = useState<'asc' | 'desc'>('asc');

  const [ruleDetailsColumnOrder, setRuleDetailsColumnOrder] = useState<string[]>([]);


  const [sociosSortKey, setSociosSortKey] = useState<string | null>(null);
  const [sociosSortDir, setSociosSortDir] = useState<'asc' | 'desc'>('asc');

  const headerRenameMap: Record<string, string> = {
    // Expedientes y documentos
    numeroSancion: 'Expediente',
    expediente: 'Expediente',

    // Estados y regiones
    estado: 'Estado',
    region: 'Región',

    // Fechas
    fechaImposicion: 'Fecha',
    fecha: 'Fecha',
    fechaDesde: 'Fecha Desde',
    fechaEjecutoria: 'Fecha Ejecutoria',
    fechaPublicacion: 'Fecha de Publicación',
    fechaDemanda: 'Fecha Demanda',
    fechaIncorporacion: 'Fecha Incorporación',
    vencimiento: 'Vencimiento',
    publicacion: 'Publicación',
    desde: 'Desde',
    hasta: 'Hasta',

    // Sanciones y tipos
    tipoSancion: 'Tipo Sanción',
    tipoInfraccion: 'Tipo Infracción',
    tipoDeuda: 'Tipo de Deuda',
    tipoDenuncia: 'Tipo de Denuncia',
    tipoPersona: 'Tipo Persona',
    tipoLista: 'Tipo Lista',
    tipoProcedimiento: 'Tipo de Procedimiento',
    tipoProducto: 'Tipo de Producto',

    // Identificación
    rut: 'RUT',
    rutAfiliado: 'RUT Afiliado',
    nombreAfiliado: 'Nombre Afiliado',
    name: 'Nombre',
    nombre: 'Nombre',
    nombreSubLista: 'Nombre Sub Lista',
    nombrePublicacion: 'Nombre Publicación',

    // Actividades económicas
    activities: 'Actividad',
    actividades: 'Actividades',
    category: 'Categoría',
    categoria: 'Categoría',
    ivaAffection: 'Afectación de IVA',
    afectaIva: 'Afecta IVA',
    codigo: 'Código',

    // Montos y valores
    monto: 'Monto',
    montoMulta: 'Monto Multa',
    multa: 'Multa',

    // Tribunal y legal
    tribunal: 'Tribunal',
    rit: 'RIT',
    rol: 'ROL',
    resolucion: 'Resolución',

    // Deuda Previsional
    afp: 'AFP',
    periodo: 'Período',
    meses: 'Meses',
    cotizaciones: 'Cotizaciones',
    tipo: 'Tipo',
    institucion: 'Institución',

    // Causas judiciales
    postura: 'Postura',
    fase: 'Fase',
    etapa: 'Etapa',
    materia: 'Materia',

    // Medioambiente
    unidadFiscalizable: 'Unidad Fiscalizable',

    // Otros
    count: 'Cantidad',
    motivo: 'Motivo',
    boletin: 'Boletín',
    infraccion: 'Infracción',
    duracion: 'Duración',
    hechosCondenados: 'Hechos Condenados',
    veedorLiquidadorMartillero: 'Veedor / Liquidador / Martillero',




    /*  procesoSancionId: 'ID Proceso',
     categoriaEconomicaNombre: 'Categoría Económica',
     comunaNombre: 'Comuna',
     confirmaPdC: 'Confirma PdC',
     fastCheckProcesoSancionatorio: 'Proceso Sancionatorio',
     fastCheckSanciones: 'Sanciones',
     fechaInicio: 'Fecha Inicio',
     fechaTermino: 'Fecha Término',
     latitud: 'Latitud', */
    procesoSancionTipo: 'Tipo',
    procesoSancionEstado: 'Estado',
    nombreProcesoSancionEstado: 'Estado',
    fechaInicio: 'Inicio',
    fechaTermino: 'Término',
    confirmaPdC: 'Plan Cumplimiento',
    multaTotalUTA: 'Multa UTA',
    linkSNIFA: 'Link Snifa',
    linkSnifa: 'Link Snifa',
    unidadFiscalizableId: 'ID Unidad Fiscalizable',
    nombreRegion: 'Región',
    comunaNombre: 'Comuna',
    nombreComunaNombre: 'Comuna',
    procesoSancionTipoNombre: 'Tipo Proceso',
    razonSocial: 'Razón Social',
    regionNombre: 'Región',
    lista: 'Lista',
    expirationDate: 'Vencimiento',
    unpaidAmount: 'Monto',
    documentType: 'Tipo de Deuda',
    totalUTA: 'Multa UTA',
  };

  const [count, setCount] = useState<any>({
    criticalParams: 0,
    highParams: 0,
    lowParams: 0
  });


  const columnasPermitidas: Record<string, string[]> = {
    'Multas Laborales': ['motivo', 'Motivo', 'boletin', 'Boletín', 'fecha', 'Fecha', 'tipoInfraccion', 'Tipo Infracción', 'infraccion', 'Infracción', 'monto', 'Monto', 'resolucion', 'Resolución'],
    'Protestos y Morosidades': ['vencimiento', 'Vencimiento', 'monto', 'Monto', 'tipoDeuda', 'Tipo de Deuda', 'publicacion', 'Publicación', 'expirationDate', 'unpaidAmount', 'documentType',],
    'Condenas por Prácticas Antisindicales': ['rit', 'RIT', 'tribunal', 'Tribunal', 'fechaEjecutoria', 'Fecha ejecutoria', 'hechosCondenados', 'Hechos condenados', 'tipoDenuncia', 'Tipo de Denuncia', 'montoMulta', 'Monto Multa'],
    'Proceso Sanciones Medioambientales': ['unidadFiscalizable', 'expediente', 'procesoSancionTipoNombre', 'Estado', 'fechaInicio', 'fechaTermino', 'confirmaPdC', 'multaTotalUTA', 'linkSNIFA', 'regionNombre', 'comunaNombre', 'linkSNIFA_UF', 'fechaActualizacion'],
    'Sanciones Medioambientales': ['Unidad Fiscalizable', 'Expediente', 'Tipo Sanción', 'Estado', 'Fecha', 'totalUTA', 'Región',],
    'Condenas Ley 21.121': ['rol', 'ROL de la Causa', 'fechaDesde', 'Fecha Desde', 'duracion', 'Duración', 'motivo', 'Motivo'],
    'Condenas Ley 20.393': ['motivo', 'Motivo', 'rol', 'ROL', 'desde', 'Desde', 'hasta', 'Hasta'],
    'Listas Propias Alto Impacto': ['rut', 'RUT', 'nombre', 'Nombre', 'tipoPersona', 'Tipo Persona', 'tipoLista', 'Tipo Lista', 'nombreSubLista', 'Nombre Sub Lista', 'Fecha Incorporación'],
    'Listas Propias Mediano Impacto': ['rut', 'RUT', 'nombre', 'Nombre', 'tipoPersona', 'Tipo Persona', 'tipoLista', 'Tipo Lista', 'nombreSubLista', 'Nombre Sub Lista', 'fechaIncorporacion', 'Fecha Incorporación'],
    'Boletín Concursal': ['tipoProcedimiento', 'Tipo de Procedimiento', 'fechaPublicacion', 'Fecha de Publicación', 'nombrePublicacion', 'Nombre Publicación', 'veedorLiquidadorMartillero', 'Veedor / Liquidador/ Martillero'],
    'Deuda Previsional Presunta': ['Rut Afiliado', 'Nombre Afiliado', 'Tipo Producto', 'Tipo entidad', 'Periodo', 'Fecha carta', 'Estado', 'ID'],
    'Deuda Previsional Publicada': ['motivo', 'Motivo', 'boletin', 'Boletin', 'fecha', 'Fecha', 'meses', 'Meses', 'cotizaciones', 'Cotizaciones', 'monto', 'Monto', 'tipo', 'Tipo', 'institucion', 'Institución'],
    'Causas Civiles': ['Fecha de ingreso', 'Fecha', 'postura', 'Postura', 'estado', 'Estado', 'fase', 'Fase', 'etapa', 'Etapa', 'materia', 'Materia', 'rol', 'ROL', 'tribunal', 'Tribunal'],
    'Causas Laborales': ['fecha', 'Fecha', 'postura', 'Postura', 'estado', 'Estado', 'fase', 'Fase', 'etapa', 'Etapa', 'materia', 'Materia', 'rol', 'ROL', 'tribunal', 'Tribunal'],
    'Causas de Cobranza Laboral': ['fecha', 'Fecha', 'postura', 'Postura', 'estado', 'Estado', 'fase', 'Fase', 'etapa', 'Etapa', 'materia', 'Materia', 'rol', 'ROL', 'tribunal', 'Tribunal'],
    'Causas Penales': ['nombre', 'Nombre', 'postura', 'Postura', 'rol', 'ROL', 'fecha', 'Fecha', 'infraccion', 'Infracción', 'estado', 'Estado', 'etapa', 'Etapa', 'materia', 'Materia', 'tribunal', 'Tribunal'],
    'Inicio de Actividades': ['activities', 'category', 'ivaAffection'],
    'PEP Chile': ['rut', 'name', 'count'],
    'Familiares PEP': ['rut', 'name', 'count']
  };

  useEffect(() => {
    const allRules = [
      ...(riskSummary.allRules?.complianceRules || []),
      ...(riskSummary.allRules?.legalRules || []),
      ...(riskSummary.allRules?.capitalHumanoRules || []),
      ...(riskSummary.allRules?.financieroTributarioRules || []),
    ];

    let critical = 0;
    let high = 0;
    let low = 0;

    // Antecedentes Penales
    const todasCoincidencias = data?.sheriffLogData?.filteredDetails?.compliance?.penal?.coincidencias ||
      data?.details?.sheriffLogData?.filteredDetails?.compliance?.penal?.coincidencias ||
      data?.logEntry?.filteredDetails?.compliance?.penal?.coincidencias ||
      [];
/*
    console.warn(
      '[FastCheckEX] compliance.penal.coincidencias',
      data?.sheriffLogData?.filteredDetails?.compliance?.penal?.coincidencias
    );
*/
    const coincidenciasFiltradas = todasCoincidencias.filter((item: any) => {
      const postura = item?.postura?.toLowerCase() || '';
      return postura === 'demandado' || postura === 'querellado' || postura === 'denunciado';
    });

    const penalRisk = coincidenciasFiltradas.length > 0 ? "critico" : "bajo";

    if (penalRisk === "critico") {
      critical++;
    } else {
      low++;
    }

    // Reputación Pública y Mediática (Noticias)
    const noticiasCoincidencias = data?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
      data?.details?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
      data?.logEntry?.filteredDetails?.compliance?.noticias?.coincidencias ||
      [];

    const noticiasRisk = noticiasCoincidencias.length > 0 ? "alto" : "bajo";

    if (noticiasRisk === "alto") {
      high++;
    } else {
      low++;
    }

    allRules.forEach(rule => {
      if (
        rule.label === 'Reputación Pública y Mediática' ||
        rule.label === 'Causas Penales'
      ) return;

      let dataRisk = rule.risk;

      // 🔧 FIX EXCLUSIVO: Deuda Previsional Presunta
      if (rule.label === "Deuda Previsional Presunta") {
        const hasCases = (rule.details as any)?.casos?.length > 0;

        if (hasCases) {
          dataRisk = "alto"; // 🟠 impacto significativo → NO crítico
        }
      }

      // Conteo basado en dataRisk normalizado
      if (dataRisk === "critico") {
        critical++;
      } else if (dataRisk === "alto") {
        high++;
      } else if (dataRisk !== "no_disponible") {
        low++;
      }
    });

    setCount({
      criticalParams: critical,
      highParams: high,
      lowParams: low
    });
  }, [riskSummary.allRules, data]);

  const tooltipMessages: Record<string, Record<string, string>> = {
    // ——— Nuevas categorías ———
    "Integridad, Ética y Riesgo Penal": {
      "Inhabilitación Estado – Ley 21.121": "Identifica terceros críticos inhabilitados para contratar con el Estado por delitos de corrupción. Fuente: ChileCompra.",
      "Inhabilitación Estado – Ley 20.393": "Identifica terceros críticos inhabilitados para contratar con el Estado por responsabilidad penal empresarial. Fuente: ChileCompra.",
      "Condenas Ley 21.121": "Identifica terceros críticos inhabilitados para contratar con el Estado por delitos de corrupción. Fuente: ChileCompra.",
      "Condenas Ley 20.393": "Identifica terceros críticos inhabilitados para contratar con el Estado por responsabilidad penal empresarial. Fuente: ChileCompra.",
      "Listas Internacionales": "Verifica si el tercero crítico figura en listas internacionales de sanciones. Fuente: organismos internacionales (OFAC, ONU, UE, INTERPOL, CMF, UAF, entre otros).",
      "PEP Chile": "Identifica si el tercero crítico o personas relacionadas califican como PEP. Fuente: registros públicos.",
      "Familiares PEP": "Identifica si personas relacionadas califican como familiares PEP. Fuente: registros públicos.",
      "Causas Penales": "Identifica causas penales asociadas al tercero crítico o personas relacionadas. Fuente: Poder Judicial.",
    },
    "Reputación y Conflictos de Interés": {
      "Listas Propias Alto Impacto": "Identifica terceros críticos incluidos en listas internas por conflictos graves o malas prácticas. Fuente: cliente.",
      "Listas Propias Mediano Impacto": "Identifica terceros críticos incluidos en listas internas que requieren seguimiento. Fuente: cliente.",
      "Reputación Pública y Mediática": "(Beta) Analiza la exposición pública del tercero crítico en medios. Fuente: medios y fuentes públicas. ",

    },
    "Ambiental y Sostenibilidad": {
      "Sanciones Medioambientales": "Identifica sanciones ambientales asociadas al tercero crítico. Fuente: Seremi de Medio Ambiente.",
      "Procesos Sancionatorios Medioambientales": "Identifica procesos sancionatorios ambientales en curso. Fuente: Seremi de Medio Ambiente.",
    },
    "Legal y Judicial": {
      "Quiebra Judicial": "Identifica procesos de quiebra del tercero crítico. Fuente: Poder Judicial.",
      "Boletín Concursal": "Identifica procedimientos concursales del tercero crítico. Fuente: Poder Judicial.",
      "Boletin Concursal": "Identifica procedimientos concursales del tercero crítico. Fuente: Poder Judicial.",
      "Causas Civiles": "Identifica causas civiles asociadas al tercero crítico. Fuente: Poder Judicial.",
      "Causas Laborales": "Identifica causas laborales asociadas al tercero crítico. Fuente: Poder Judicial.",
      "Causas de Cobranza Laboral": "Identifica causas por cobranza laboral del tercero crítico. Fuente: Poder Judicial.",
    },
    "Laboral y Capital Humano": {
      "Condenas por Prácticas Antisindicales": "Identifica condenas por prácticas antisindicales del tercero crítico. Fuente: Dirección del Trabajo.",
      "Deuda Previsional Publicada": "Identifica deuda previsional publicada del tercero crítico. Fuente: AFP.",
      "Multas Laborales": "Identifica multas laborales del tercero crítico. Fuente: Dirección del Trabajo.",
      "Deuda Previsional Presunta": "Identifica posibles incumplimientos previsionales. Fuente: Dirección del Trabajo.",
    },
    "Financiero y Tributario": {
      "Término de Giro": "Identifica si el tercero crítico registra término de giro. Fuente: SII.",
      "Inicio de Actividades": "Verifica la existencia formal del tercero crítico. Fuente: SII.",
      "Contribuyente de difícil fiscalización": "Identifica clasificación tributaria de difícil fiscalización. Fuente: SII.",
      "Empresa de Difícil Fiscalización": "Identifica clasificación tributaria de difícil fiscalización. Fuente: SII.",
      "Protestos y Morosidades": "Identifica protestos y deudas impagas del tercero crítico. Fuente: Bolcom, ICOM y Dicom.",
    },
    // ——— Categorías legacy (compatibilidad con getTooltip fallbacks) ———
    "Compliance": {
      "Condenas Ley 21.121": "Identifica terceros críticos inhabilitados para contratar con el Estado por delitos de corrupción. Fuente: ChileCompra.",
      "Condenas Ley 20.393": "Identifica terceros críticos inhabilitados para contratar con el Estado por responsabilidad penal empresarial. Fuente: ChileCompra.",
      "Listas Internacionales": "Verifica si el tercero crítico figura en listas internacionales de sanciones. Fuente: organismos internacionales (OFAC, ONU, UE, INTERPOL, CMF, UAF, entre otros).",
      "Sanciones Medioambientales": "Identifica sanciones ambientales asociadas al tercero crítico. Fuente: Seremi de Medio Ambiente.",
      "Procesos Sancionatorios Medioambientales": "Identifica procesos sancionatorios ambientales en curso. Fuente: Seremi de Medio Ambiente.",
      "Listas Propias Alto Impacto": "Identifica terceros críticos incluidos en listas internas por conflictos graves o malas prácticas. Fuente: cliente.",
      "Listas Propias Mediano Impacto": "Identifica terceros críticos incluidos en listas internas que requieren seguimiento. Fuente: cliente.",
      "PEP Chile": "Identifica si el tercero crítico o personas relacionadas califican como PEP. Fuente: registros públicos.",
      "Familiares PEP": "Identifica si personas relacionadas califican como familiares PEP. Fuente: registros públicos.",
    },
    "Legal": {
      "Quiebra Judicial": "Identifica procesos de quiebra del tercero crítico. Fuente: Poder Judicial.",
      "Boletín Concursal": "Identifica procedimientos concursales del tercero crítico. Fuente: Poder Judicial.",
      "Boletin Concursal": "Identifica procedimientos concursales del tercero crítico. Fuente: Poder Judicial.",
      "Causas Civiles": "Identifica causas civiles asociadas al tercero crítico. Fuente: Poder Judicial.",
      "Causas Laborales": "Identifica causas laborales asociadas al tercero crítico. Fuente: Poder Judicial.",
      "Causas de Cobranza Laboral": "Identifica causas por cobranza laboral del tercero crítico. Fuente: Poder Judicial.",
    },
    "Capital Humano": {
      "Condenas por Prácticas Antisindicales": "Identifica condenas por prácticas antisindicales del tercero crítico. Fuente: Dirección del Trabajo.",
      "Deuda Previsional Publicada": "Identifica deuda previsional publicada del tercero crítico. Fuente: AFP.",
      "Multas Laborales": "Identifica multas laborales del tercero crítico. Fuente: Dirección del Trabajo.",
      "Deuda Previsional Presunta": "Identifica posibles incumplimientos previsionales. Fuente: Dirección del Trabajo.",
    },
    "Financiero - Tributario": {
      "Término de Giro": "Identifica si el tercero crítico registra término de giro. Fuente: SII.",
      "Protestos y Morosidades": "Identifica protestos y deudas impagas del tercero crítico. Fuente: Bolcom, ICOM y Dicom.",
      "Inicio de Actividades": "Verifica la existencia formal del tercero crítico. Fuente: SII.",
      "Contribuyente de difícil fiscalización": "Identifica clasificación tributaria de difícil fiscalización. Fuente: SII.",
      "Empresa de Difícil Fiscalización": "Identifica clasificación tributaria de difícil fiscalización. Fuente: SII.",
    }
  };

  const getTooltip = (category: string, label: string): string | undefined => {
    return tooltipMessages[category]?.[label];
  };
  const normalizeDetails = (details: any) => {
    if (!details) return [];
    if (Array.isArray(details)) return details;
    if (typeof details === 'object') {
      if (Array.isArray(details.casos)) return details.casos;
      return Object.values(details);
    }
    return [];
  };
  const normalizeDetailsForExport = (): { columns: string[]; rows: Record<string, unknown>[] } => {
    let d: unknown = ruleDetailsContent;
    if (typeof d === 'string') {
      const s = d.trim();
      if (s.startsWith('{') || s.startsWith('[')) {
        try { d = JSON.parse(s); } catch { }
      }
    }
    const serialize = (v: unknown): string => {
      if (v == null) return '';
      if (Array.isArray(v) || typeof v === 'object') return JSON.stringify(v);
      return String(v);
    };
    if (d == null) {
      return { columns: ['Valor'], rows: [] };
    }
    if (Array.isArray(d)) {
      if (d.length === 0) return { columns: ['Valor'], rows: [] };
      const first = d[0];
      if (typeof first === 'object' && first !== null) {
        const colsSet = new Set<string>();
        (d as Array<Record<string, unknown>>).forEach((it) => Object.keys(it).forEach((k) => colsSet.add(k)));
        const columns = Array.from(colsSet);
        const rows = (d as Array<Record<string, unknown>>).map((row) => {
          const out: Record<string, unknown> = {};
          columns.forEach((c) => { out[c] = serialize((row as Record<string, unknown>)[c]); });
          return out;
        });
        return { columns, rows };
      }
      const rows = (d as Array<unknown>).map((v, i) => ({ Indice: i, Valor: serialize(v) }));
      return { columns: ['Indice', 'Valor'], rows };
    }
    if (typeof d === 'object') {
      const entries = Object.entries(d as Record<string, unknown>);
      const rows = entries.map(([k, v]) => ({ Campo: k, Valor: serialize(v) }));
      return { columns: ['Campo', 'Valor'], rows };
    }
    return { columns: ['Valor'], rows: [{ Valor: serialize(d) }] };
  };

  const handleExportCSVDetails = () => {
    const { columns, rows } = normalizeDetailsForExport();
    if (rows.length === 0) {
      toast.error('Sin datos para exportar');
      return;
    }
    const escape = (v: unknown): string => {
      const s = String(v ?? '');
      const q = '"';
      const needQuote = /[",\n]/.test(s);
      const body = s.replace(/"/g, '""');
      return needQuote ? q + body + q : body;
    };
    const header = columns.map(escape).join(',');
    const body = rows.map((r) => columns.map((c) => escape((r as Record<string, unknown>)[c])).join(',')).join('\n');
    const csv = header + '\n' + body;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(ruleDetailsTitle || 'detalles').replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportXLSXDetails = () => {
    const { columns, rows } = normalizeDetailsForExport();
    if (rows.length === 0) {
      toast.error('Sin datos para exportar');
      return;
    }
    const ws = XLSX.utils.json_to_sheet(rows, { header: columns });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Detalles');
    const fname = `${(ruleDetailsTitle || 'detalles').replace(/\s+/g, '_')}.xlsx`;
    XLSX.writeFile(wb, fname);
  };

  // Listas Propias state
  const [listasPropias, setListasPropias] = useState<ListasPropias>({ altoImpacto: [], medioImpacto: [] });
  const [loadingListasPropias, setLoadingListasPropias] = useState(false);
  const [antiunionCases, setAntiunionCases] = useState<AntiunionCase[]>([]);

  // Socios evaluation state
  const [sociosEvaluations, setSociosEvaluations] = useState<SocioEvaluation[]>([]);
  const [pepEvaluationSummary, setPepEvaluationSummary] = useState<PepEvaluationSummary>({
    pepChileDetected: false,
    familiaresPepDetected: false,
    evaluatedSocios: []
  });

  const inferIsNaturalFromRut = (rutVal?: string): boolean | undefined => {
    if (!rutVal) return undefined;
    const numPart = rutVal.split('-')[0]?.replace(/\./g, '');
    const n = parseInt(numPart || '', 10);
    if (Number.isNaN(n)) return undefined;
    return n > 0 && n < 25000000;
  };
  const [isEvaluatingSocios, setIsEvaluatingSocios] = useState(false);

  // Server status state
  const [serverError, setServerError] = useState<string | null>(null);

  // Progress state for long-running evaluation
  type StepStatus = 'pending' | 'in_progress' | 'done' | 'error';
  interface ProgressStep { key: string; label: string; status: StepStatus; }
  const initialSteps: ProgressStep[] = [
    { key: 'start', label: t('fastCheck.progress.start'), status: 'pending' },
    { key: 'lookup', label: t('fastCheck.progress.lookup'), status: 'pending' },
    { key: 'fetch', label: t('fastCheck.progress.fetch'), status: 'pending' },
    { key: 'listas', label: t('fastCheck.progress.listas'), status: 'pending' },
    { key: 'ready', label: t('fastCheck.progress.ready'), status: 'pending' },
  ];
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>(initialSteps);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const setStep = (key: string, status: StepStatus) => {
    setProgressSteps(prev => prev.map(s => s.key === key ? { ...s, status } : s));
  };

  // Progressive percentage bar
  const stepsOrder = ['start', 'lookup', 'fetch', 'listas', 'ready'];
  const [progressPercent, setProgressPercent] = useState(0);
  const computeTargetPercent = (steps: ProgressStep[]) => {
    const total = stepsOrder.length;
    let target = 0;
    stepsOrder.forEach((k, idx) => {
      const s = steps.find(x => x.key === k);
      if (!s) return;
      if (s.status === 'done') {
        target = Math.max(target, Math.round(((idx + 1) / total) * 100));
      } else if (s.status === 'in_progress') {
        target = Math.max(target, Math.round((idx / total) * 100 + 8));
      }
    });
    return Math.min(99, target);
  };

  useEffect(() => {
    const target = computeTargetPercent(progressSteps);
    if (target <= progressPercent) return;
    const id = setInterval(() => {
      setProgressPercent(prev => {
        const next = Math.min(prev + 2, target);
        if (next >= target) clearInterval(id);
        return next;
      });
    }, 70);
    return () => clearInterval(id);
  }, [progressSteps]);

  useEffect(() => {
    const ready = progressSteps.find(s => s.key === 'ready')?.status;
    if (ready === 'done') setProgressPercent(100);
  }, [progressSteps]);

  // Helpers: dynamic color/animation and current step label
  const currentStepObj = progressSteps.find(s => s.status === 'in_progress')
    || [...progressSteps].reverse().find(s => s.status === 'done')
    || progressSteps[0];
  const currentStepLabel = currentStepObj?.label || '';
  const hasErrorStep = progressSteps.some(s => s.status === 'error');
  const isReadyDone = progressSteps.find(s => s.key === 'ready')?.status === 'done';
  const progressBarClass = `h-2 ${hasErrorStep ? 'bg-red-500' : isReadyDone ? 'bg-green-500' : 'bg-blue-500'} ${!isReadyDone && !hasErrorStep ? 'animate-pulse' : ''}`;

  const resetSteps = () => {
    setProgressSteps(initialSteps.map(s => ({ ...s, status: 'pending' })));
    setProgressPercent(0);
  };

  // Export JSON function
  const handleExportJSON = () => {
    if (!data) {
      toast.error('No hay datos para exportar');
      return;
    }

    try {
      // Create a comprehensive data object with all available information
      const exportData = {
        metadata: {
          exportDate: new Date().toISOString(),
          rut: data.details?.rut || rut,
          razonSocial: data.details?.razonSocial,
          evaluationDate: data.createdAt || data.updatedAt
        },
        completeData: data, // Full data from results collection
        riskAssessment: riskSummary,
        companyInfo: companyData,
        userNote: userNote,
        aiAnalysis: aiAnalysis ? {
          content: aiAnalysis,
          date: aiAnalysisDate,
          fromCache: aiAnalysisFromCache
        } : null
      };

      // Convert to JSON string with proper formatting
      const jsonString = JSON.stringify(exportData, null, 2);

      // Create blob and download
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = `duxiter-fastcheck-${data.details?.rut || rut}-${new Date().toISOString().split('T')[0]}.json`;

      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up
      URL.revokeObjectURL(url);

      toast.success('Datos exportados exitosamente');
    } catch (error) {
      logger.error('Error exporting JSON:', error);
      toast.error('Error al exportar los datos');
    }
  };

  // Function to search for missing RUTs in external data sources
  const searchRutInExternalData = (socioName: string, externalData: any): string | null => {
    if (!externalData || !socioName) return null;
    //logger.log(231, externalData.sheriffLogData?.summaryData?.data?.societaryMeshExternal);
    // Normalize the socio name for comparison (remove accents, convert to lowercase, remove extra spaces)
    const normalizeString = (str: string): string => {
      return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/\./g, '') // Remove dots (S.A. -> SA)
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .replace(/\bsa\b/g, 'sa') // Normalize SA
        .replace(/\bspa\b/g, 'spa') // Normalize SPA  
        .replace(/\bltda\b/g, 'ltda') // Normalize LTDA
        .replace(/\beirl\b/g, 'eirl') // Normalize EIRL
        .trim();
    };

    const normalizedSocioName = normalizeString(socioName);
    logger.log(`🔍 Searching for RUT for: "${socioName}" -> normalized: "${normalizedSocioName}"`);

    // Extract first two words for partial matching
    const socioWords = normalizedSocioName.split(' ').filter(word => word.length > 2);
    const firstTwoWords = socioWords.slice(0, 2).join(' ');
    logger.log(`📝 First two words: "${firstTwoWords}"`);

    // Helper function to check if names match using various strategies
    const isMatch = (normalizedSocioName: string, normalizedExternalName: string, firstTwoWords: string): boolean => {
      const similarity = calculateSimilarity(normalizedSocioName, normalizedExternalName);

      // Strategy 1: Full name similarity (70% threshold)
      if (similarity > 0.7) return true;

      // Strategy 2: Full name inclusion (bidirectional)
      if (normalizedExternalName.includes(normalizedSocioName) ||
        normalizedSocioName.includes(normalizedExternalName)) return true;

      // Strategy 3: First two words inclusion
      if (firstTwoWords && (normalizedExternalName.includes(firstTwoWords) ||
        firstTwoWords.includes(normalizedExternalName))) return true;

      // Strategy 4: First two words similarity (80% threshold for partial match)
      if (firstTwoWords) {
        const externalWords = normalizedExternalName.split(' ').filter(word => word.length > 2);
        const externalFirstTwoWords = externalWords.slice(0, 2).join(' ');
        if (externalFirstTwoWords && calculateSimilarity(firstTwoWords, externalFirstTwoWords) > 0.8) return true;
      }

      return false;
    };

    // Search in mallaSocietariaData.empresaEnUnDia
    if (externalData.mallaSocietariaData?.empresaEnUnDia) {
      logger.log(`📊 Searching in empresaEnUnDia (${externalData.mallaSocietariaData.empresaEnUnDia.length} entries)`);
      for (const empresa of externalData.mallaSocietariaData.empresaEnUnDia) {
        if (empresa.socios && Array.isArray(empresa.socios)) {
          for (const socio of empresa.socios) {
            if (socio.nombre && socio.rut) {
              const normalizedExternalName = normalizeString(socio.nombre);
              const similarity = calculateSimilarity(normalizedSocioName, normalizedExternalName);

              logger.log(`  🔍 Comparing: "${normalizedSocioName}" vs "${normalizedExternalName}" (similarity: ${similarity.toFixed(2)})`);

              if (isMatch(normalizedSocioName, normalizedExternalName, firstTwoWords)) {
                const formattedRut = formatChileanRut(socio.rut);
                logger.log(`✅ Found RUT match in empresaEnUnDia: ${socioName} -> ${socio.nombre} (RUT: ${formattedRut})`);
                return formattedRut;
              }
            }
          }
        }
      }
    }

    // Search in mallaSocietariaData.diarioOficial
    if (externalData.mallaSocietariaData?.diarioOficial) {
      logger.log(`📊 Searching in diarioOficial (${externalData.mallaSocietariaData.diarioOficial.length} entries)`);
      for (const diario of externalData.mallaSocietariaData.diarioOficial) {
        if (diario.socios && Array.isArray(diario.socios)) {
          for (const socio of diario.socios) {
            if (socio.nombre && socio.rut) {
              const normalizedExternalName = normalizeString(socio.nombre);
              const similarity = calculateSimilarity(normalizedSocioName, normalizedExternalName);

              logger.log(`  🔍 Comparing: "${normalizedSocioName}" vs "${normalizedExternalName}" (similarity: ${similarity.toFixed(2)})`);

              if (isMatch(normalizedSocioName, normalizedExternalName, firstTwoWords)) {
                const formattedRut = formatChileanRut(socio.rut);
                logger.log(`✅ Found RUT match in diarioOficial: ${socioName} -> ${socio.nombre} (RUT: ${formattedRut})`);
                return formattedRut;
              }
            }
          }
        }
      }
    }

    // Search in sheriffLogData.summaryData.data.societaryMeshExternal
    if (externalData.sheriffLogData?.summaryData?.data?.societaryMeshExternal) {
      logger.log(`📊 Searching in societaryMeshExternal (${externalData.sheriffLogData.summaryData.data.societaryMeshExternal.length} entries)`);
      for (const external of externalData.sheriffLogData.summaryData.data.societaryMeshExternal) {
        if (external.societiesIsParticipant && Array.isArray(external.societiesIsParticipant)) {
          for (const socio of external.societiesIsParticipant) {
            if (socio.society && socio.rut) {
              const normalizedExternalName = normalizeString(socio.society);
              const similarity = calculateSimilarity(normalizedSocioName, normalizedExternalName);

              logger.log(`  🔍 Comparing: "${normalizedSocioName}" vs "${normalizedExternalName}" (similarity: ${similarity.toFixed(2)})`);

              if (isMatch(normalizedSocioName, normalizedExternalName, firstTwoWords)) {
                const formattedRut = formatChileanRut(socio.rut);
                logger.log(`✅ Found RUT match in societaryMeshExternal: ${socioName} -> ${socio.society} (RUT: ${formattedRut})`);
                return formattedRut;
              }
            }
          }
        }
      }
    }

    return null;
  };

  // Simple string similarity calculation using Levenshtein distance
  const calculateSimilarity = (str1: string, str2: string): number => {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    const maxLength = Math.max(str1.length, str2.length);
    return maxLength === 0 ? 1 : (maxLength - matrix[str2.length][str1.length]) / maxLength;
  };

  const normalizeRuleLabel = (value: string) => {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const pepChileAliases = ['PEPChile', 'PEP - Chile', 'PEP (Chile)', 'PEP-Chile'];
  const familiaresPepAliases = ['Familiares PEP Chile', 'Familiares de PEP', 'Familiares_PEP', 'PEP Familiares'];
  const condenasLey21121Aliases = ['Inhabilitación Estado – Ley 21.121', 'Inhabilitacion Estado - Ley 21.121', 'Inhabilitacion Estado – Ley 21.121'];
  const condenasLey20393Aliases = ['Inhabilitación Estado – Ley 20.393', 'Inhabilitacion Estado - Ley 20.393', 'Inhabilitacion Estado – Ley 20.393'];

  const ruleLabelMatches = (label: string, canonical: string, aliases: string[] = []) => {
    const nl = normalizeRuleLabel(label);
    const candidates = [canonical, ...aliases].map(normalizeRuleLabel).filter(Boolean);
    if (candidates.includes(nl)) return true;
    return candidates.some((c) => nl.startsWith(c));
  };

  const canonicalizeComplianceRule = (
    rules: ParameterData[],
    canonicalLabel: string,
    aliases: string[] = [],
    defaultImpacto = 'severo'
  ): ParameterData => {
    const found = rules.find((r) => ruleLabelMatches(r.label, canonicalLabel, aliases));
    if (found) return { ...found, label: canonicalLabel };
    return { label: canonicalLabel, impacto: defaultImpacto, risk: 'no_disponible', detected: false, details: [] };
  };

  const getIntegridadComplianceRules = (rules: ParameterData[]): ParameterData[] => {
    return [
      canonicalizeComplianceRule(rules, 'Condenas Ley 21.121', condenasLey21121Aliases, 'severo'),
      canonicalizeComplianceRule(rules, 'Condenas Ley 20.393', condenasLey20393Aliases, 'severo'),
      canonicalizeComplianceRule(rules, 'Listas Internacionales', [], 'severo'),
      canonicalizeComplianceRule(rules, 'PEP Chile', pepChileAliases, 'severo'),
      canonicalizeComplianceRule(rules, 'Familiares PEP', familiaresPepAliases, 'severo'),
    ];
  };

  const fetchData = async (searchRut?: string, resultId?: string) => {
    setLoading(true);
    setStep('fetch', 'in_progress');
    try {
      let response;
      const needsRiskRecalc = new URLSearchParams(window.location.search).get('risk') === 'true';

      if (resultId) {
        logger.info(`Fetching data for Result ID: ${resultId}`);
        response = await apiClient.get(`/rut/results/${resultId}${needsRiskRecalc ? '?risk=true' : ''}`);
        logger.log(489, 'response.data', response.data);
      } else if (searchRut) {
        logger.info(`Fetching data for RUT: ${searchRut}`);
        response = await apiClient.get(`/rut/results/rut/${searchRut}${needsRiskRecalc ? '?risk=true' : ''}`);
        logger.log(489, 'response.data', response.data);
      } else {
        logger.info('No RUT provided, fetching latest result');
        const latestResultResponse = await apiClient.get('/rut/results/latest');
        response = await apiClient.get(`/rut/results/rut/${latestResultResponse.data.rut}${needsRiskRecalc ? '?risk=true' : ''}`);
      }

      const buildDimension = (rules: ParameterData[] = []) => {
        const totals = {
          total: rules.length,
          detected: rules.filter(r => r.detected).length,
          critico: rules.filter(r => r.risk === 'critico').length,
          alto: rules.filter(r => r.risk === 'alto').length,
          bajo: rules.filter(r => r.risk === 'bajo').length,
          no_disponible: rules.filter(r => r.risk === 'no_disponible').length,
        };
        const parameters = rules.map(r => ({
          label: r.label,
          impacto: r.impacto,
          risk: r.risk,
          detected: r.detected,
          details: [],
        }));
        return { totals, parameters };
      };


      const allRules = response.data?.riskAssessment?.allRules || null;
      const calculation = allRules ? {
        compliance: buildDimension(allRules.complianceRules),
        legal: buildDimension(allRules.legalRules),
        capitalHumano: buildDimension(allRules.capitalHumanoRules),
        financieroTributario: buildDimension(allRules.financieroTributarioRules),
        summary: {
          totalParameters: [
            allRules.complianceRules?.length || 0,
            allRules.legalRules?.length || 0,
            allRules.capitalHumanoRules?.length || 0,
            allRules.financieroTributarioRules?.length || 0,
          ].reduce((a, b) => a + b, 0),
          totalDetected: [
            ...(allRules.complianceRules || []),
            ...(allRules.legalRules || []),
            ...(allRules.capitalHumanoRules || []),
            ...(allRules.financieroTributarioRules || []),
          ].filter(r => r.detected).length,
        }
      } : null;

      if (calculation) {
        response.data.calculation = calculation;
        logger.log(548, 'response.data calculation', response.data.calculation);
      }
      const dr = deriveRelations(response.data.details?.dequienesRelationships, response.data.details?.rut);
      if (response.data.companyGeneralInfo) {
        if (dr.representantes.length > 0) {
          response.data.companyGeneralInfo.administradores = dr.representantes.map(x => ({ name: x.name, rut: x.rut }));
        }
      }
      applyConstitutionDate(response.data.details, response.data.companyGeneralInfo);
      setData(response.data);
      setStep('fetch', 'done');

      // Set company data
      if (response.data.details) {
        logger.log(500, 'response.data.details', response.data);
        const companyRut = response.data.details.rut || 'N/A';
        // Ensure button state computes correctly by storing the current RUT
        setRut(companyRut);
        // Use createdAt or updatedAt from database instead of current date
        const evaluationDate = response.data.createdAt || response.data.updatedAt || new Date();
        setCompanyData({
          razonSocial: response.data.details.razonSocial || 'N/A',
          rut: companyRut,
          fechaEvaluacion: new Date(evaluationDate).toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
        });

        // Load user note for this RUT
        setStep('listas', 'in_progress');
        await loadUserNote(companyRut);

        // Check Listas Propias for this RUT
        await checkListasPropias(companyRut);
        await checkAntiunionCases(companyRut);
        setStep('listas', 'done');
      }

      // Set risk summary
      if (response.data.riskAssessment) {
        logger.log(528, 'response.data.riskAssessment', response.data.riskAssessment);
        setRiskSummary(response.data.riskAssessment);
      }

      // Set risk data
      if (response.data.riskAssessment.allRules) {
        setRiskSummary(prev => ({
          ...prev,
          allRules: response.data.riskAssessment.allRules
        }));
      }

      // Set financial risk (AI) — normalize backend payload (string or object) and unwrap fenced code blocks
      if (response.data.riskAssessment && response.data.riskAssessment.financialRisk) {
        const frRaw = response.data.riskAssessment.financialRisk;


        const unwrapFenced = (md: string) => {
          const trimmed = (md || '').trim();
          const fenceRegex = /^```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)\n?```$/;
          const match = trimmed.match(fenceRegex);
          return match ? match[1].trim() : trimmed;
        };

        if (typeof frRaw === 'string') {
          // Backend returns markdown string — normalize to expected object shape
          const normalizedSummary = unwrapFenced(frRaw);
          setFinancialRisk({ summary: normalizedSummary, riskLevel: 'Low' });
        } else if (typeof frRaw === 'object' && frRaw !== null) {
          // Ensure required fields exist and unwrap any fenced blocks in summary
          const rawSummary = frRaw.summary ?? '';
          const normalizedSummary = typeof rawSummary === 'string' ? unwrapFenced(rawSummary) : '';
          setFinancialRisk({
            summary: normalizedSummary,
            riskLevel: frRaw.riskLevel ?? 'Low',
            riskScore: frRaw.riskScore,
            keyIndicators: frRaw.keyIndicators,
          } as FinancialRisk);
        } else {
          setFinancialRisk(null);
        }
      } else {

        setFinancialRisk(null);
      }

      // Load AI analysis if available
      if (response.data.aiAnalysis && response.data.aiAnalysisDate) {
        setAiAnalysis(response.data.aiAnalysis);
        setAiAnalysisFromCache(true);
        setAiAnalysisDate(new Date(response.data.aiAnalysisDate));
      } else {
        // Reset AI analysis state if not available
        setAiAnalysis(null);
        setAiAnalysisFromCache(false);
        setAiAnalysisDate(null);
      }
      setStep('ready', 'done');
    } catch (error) {
      logger.error('Error fetching data:', error);
      setStep('fetch', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchData_PRE = async (searchRut?: string) => {
    setLoading(true);
    setStep('fetch', 'in_progress');
    try {
      let response;
      if (searchRut) {
        logger.info(`Fetching data for RUT: ${searchRut}`);
        response = await apiClient.get(`/rut/results/rut/${searchRut}`);
        logger.log(489, 'response.data', response.data);
      } else {
        logger.info('No RUT provided, fetching latest result');
        const latestResultResponse = await apiClient.get('/rut/results/latest');
        response = await apiClient.get(`/rut/results/rut/${latestResultResponse.data.rut}`);
      }
      setData(response.data);
      setStep('fetch', 'done');

      // Set company data
      if (response.data.details) {
        logger.log(500, 'response.data.details', response.data);
        const companyRut = response.data.details.rut || 'N/A';
        // Ensure button state computes correctly by storing the current RUT
        setRut(companyRut);
        // Use createdAt or updatedAt from database instead of current date
        const evaluationDate = response.data.createdAt || response.data.updatedAt || new Date();
        setCompanyData({
          razonSocial: response.data.details.razonSocial || 'N/A',
          rut: companyRut,
          fechaEvaluacion: new Date(evaluationDate).toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
        });

        // Load user note for this RUT
        setStep('listas', 'in_progress');
        await loadUserNote(companyRut);

        // Check Listas Propias for this RUT
        await checkListasPropias(companyRut);
        await checkAntiunionCases(companyRut);
        setStep('listas', 'done');
      }

      // Set risk summary
      if (response.data.riskAssessment) {
        logger.log(528, 'response.data.riskAssessment', response.data.riskAssessment);
        setRiskSummary(response.data.riskAssessment);
      }

      // Set risk data
      if (response.data.riskAssessment.allRules) {
        setRiskSummary(prev => ({
          ...prev,
          allRules: response.data.riskAssessment.allRules
        }));
      }

      // Set financial risk (AI) — normalize backend payload (string or object) and unwrap fenced code blocks
      if (response.data.riskAssessment && response.data.riskAssessment.financialRisk) {
        const frRaw = response.data.riskAssessment.financialRisk;


        const unwrapFenced = (md: string) => {
          const trimmed = (md || '').trim();
          const fenceRegex = /^```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)\n?```$/;
          const match = trimmed.match(fenceRegex);
          return match ? match[1].trim() : trimmed;
        };

        if (typeof frRaw === 'string') {
          // Backend returns markdown string — normalize to expected object shape
          const normalizedSummary = unwrapFenced(frRaw);
          setFinancialRisk({ summary: normalizedSummary, riskLevel: 'Low' });
        } else if (typeof frRaw === 'object' && frRaw !== null) {
          // Ensure required fields exist and unwrap any fenced blocks in summary
          const rawSummary = frRaw.summary ?? '';
          const normalizedSummary = typeof rawSummary === 'string' ? unwrapFenced(rawSummary) : '';
          setFinancialRisk({
            summary: normalizedSummary,
            riskLevel: frRaw.riskLevel ?? 'Low',
            riskScore: frRaw.riskScore,
            keyIndicators: frRaw.keyIndicators,
          } as FinancialRisk);
        } else {
          setFinancialRisk(null);
        }
      } else {

        setFinancialRisk(null);
      }

      // Load AI analysis if available
      if (response.data.aiAnalysis && response.data.aiAnalysisDate) {
        setAiAnalysis(response.data.aiAnalysis);
        setAiAnalysisFromCache(true);
        setAiAnalysisDate(new Date(response.data.aiAnalysisDate));
      } else {
        // Reset AI analysis state if not available
        setAiAnalysis(null);
        setAiAnalysisFromCache(false);
        setAiAnalysisDate(null);
      }
      setStep('ready', 'done');
    } catch (error) {
      logger.error('Error fetching data:', error);
      setStep('fetch', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Load user note for the current RUT
  const loadUserNote = async (rut: string) => {
    try {
      const note = await userNotesApi.getNoteByRut(rut);
      setUserNote(note);
      setNoteText(note?.note || '');
      setNoteTags(note?.tags || []);
    } catch (error) {
      logger.error('Error loading user note:', error);
    }
  };

  // Save or update user note
  const saveUserNote = async () => {
    if (!companyData.rut || !noteText.trim()) {
      toast.error('Por favor ingrese una nota válida');
      return;
    }

    setSavingNote(true);
    try {
      let savedNote;
      if (userNote && userNote._id) {
        // Update existing note
        logger.log('Updating note with ID:', userNote._id);
        savedNote = await userNotesApi.updateNote(userNote._id, noteText.trim(), noteTags);
        toast.success('Nota actualizada correctamente');
      } else {
        // Create new note
        logger.log('Creating new note for RUT:', companyData.rut);
        savedNote = await userNotesApi.saveNote(companyData.rut, noteText.trim(), noteTags);
        toast.success('Nota guardada correctamente');
      }
      setUserNote(savedNote);
      setNoteTags(savedNote.tags || []);
      setIsEditingNote(false);
    } catch (error) {
      logger.error('Error saving note:', error);
      toast.error('Error al guardar la nota');
    } finally {
      setSavingNote(false);
    }
  };

  // Delete user note
  const deleteUserNote = async () => {
    if (!userNote) return;

    try {
      await userNotesApi.deleteNote(userNote._id);
      setUserNote(null);
      setNoteText('');
      setIsEditingNote(false);
      toast.success('Nota eliminada correctamente');
    } catch (error) {
      logger.error('Error deleting note:', error);
      toast.error('Error al eliminar la nota');
    }
  };

  // Cancel editing
  const cancelEditing = () => {
    setNoteText(userNote?.note || '');
    setNoteTags(userNote?.tags || []);
    setCurrentTag('');
    setIsEditingNote(false);
  };

  // Add tag
  const addTag = () => {
    const tag = currentTag.trim();
    if (tag && !noteTags.includes(tag) && noteTags.length < 10) {
      setNoteTags([...noteTags, tag]);
      setCurrentTag('');
    }
  };

  // Remove tag
  const removeTag = (tagToRemove: string) => {
    setNoteTags(noteTags.filter(tag => tag !== tagToRemove));
  };

  // Handle tag input key press
  const handleTagKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  // Check if RUT is in Listas Propias
  const checkListasPropias = async (rutToCheck: string) => {
    setLoadingListasPropias(true);
    try {
      // Sanitize RUT for search
      const sanitizedRut = rutToCheck.replace(/\./g, '');
      logger.log('Listas Propias fetch start', { rut: sanitizedRut });

      // Check both Alto Impacto and Medio Impacto lists
      const [altoImpactoResponse, medioImpactoResponse] = await Promise.all([
        apiClient.get(`/lpalto/search/rut/${sanitizedRut}`),
        apiClient.get(`/lpmedio/search/rut/${sanitizedRut}`)
      ]);
      logger.log('LP Alto Impatto risultati', sanitizedRut, Array.isArray(altoImpactoResponse.data) ? altoImpactoResponse.data.length : 0);
      if (Array.isArray(altoImpactoResponse.data) && altoImpactoResponse.data.length > 0) {
        logger.debug('LP Alto Impatto primo elemento', altoImpactoResponse.data[0]);
      }
      logger.log('LP Medio Impatto risultati', sanitizedRut, Array.isArray(medioImpactoResponse.data) ? medioImpactoResponse.data.length : 0);
      if (Array.isArray(medioImpactoResponse.data) && medioImpactoResponse.data.length > 0) {
        logger.debug('LP Medio Impatto primo elemento', medioImpactoResponse.data[0]);
      }

      setListasPropias({
        altoImpacto: altoImpactoResponse.data || [],
        medioImpacto: medioImpactoResponse.data || []
      });
      logger.log('Listas Propias fetch done', { alto: (altoImpactoResponse.data || []).length, medio: (medioImpactoResponse.data || []).length });
    } catch (error) {
      logger.error('Error checking Listas Propias:', error);
      // Reset state on error
      setListasPropias({ altoImpacto: [], medioImpacto: [] });
    } finally {
      setLoadingListasPropias(false);
    }
  };

  const checkAntiunionCases = async (rutToCheck: string) => {
    try {
      const sanitizedRut = rutToCheck.replace(/\./g, '');
      logger.log('Antisindicales fetch start', { rut: sanitizedRut });
      const response = await apiClient.get(`/antiunion-cases/rut/${sanitizedRut}`);
      const cases: AntiunionCase[] = Array.isArray(response.data?.data) ? response.data.data : [];
      logger.log('Antisindicales risultati', sanitizedRut, cases.length);
      if (cases.length > 0) {
        logger.debug('Antisindicales primo elemento', cases[0]);
      }
      setAntiunionCases(cases);
      logger.log('Antisindicales fetch done', { count: cases.length });
    } catch (error) {
      logger.error('Error fetching antiunion cases:', error);
      setAntiunionCases([]);
    }
  };

  // Save Fast-Check Summary to Database
  const saveFastCheckSummary = async (rutToSave: string, summary: string) => {
    try {
      await apiClient.post(`/rut/fast-check-summary/${rutToSave}`, {
        summary: summary
      });
      logger.log('Fast-Check summary saved to database successfully');
    } catch (error) {
      logger.error('Error saving Fast-Check summary:', error);
      // Don't show error to user as this is a background operation
    }
  };

  // Fetch AI Analysis
  const fetchAiAnalysis = async (rutToAnalyze: string, regenerate: boolean = false) => {
    setLoadingAiAnalysis(true);
    setAiAnalysisError(null);
    setStep('ai', 'in_progress');
    try {
      logger.log('AI analysis fetch start', { rut: rutToAnalyze, regenerate });
      const url = regenerate
        ? `/rut/ai-analysis/${rutToAnalyze}?regenerate=true`
        : `/rut/ai-analysis/${rutToAnalyze}`;
      const response = await apiClient.get(url);
      setAiAnalysis(response.data.aiAnalysis);
      setAiAnalysisFromCache(response.data.isFromCache || false);
      setAiAnalysisDate(response.data.analysisDate ? new Date(response.data.analysisDate) : null);
      logger.log('AI analysis fetch done', { fromCache: response.data.isFromCache, hasAnalysis: !!response.data.aiAnalysis });

      // Save the AI analysis as Fast-Check summary to database
      if (response.data.aiAnalysis && !response.data.isFromCache) {
        await saveFastCheckSummary(rutToAnalyze, response.data.aiAnalysis);
      }

      if (regenerate && !response.data.isFromCache) {
        toast.success('Análisis AI regenerado exitosamente');
      }
      setStep('ai', 'done');
      setStep('ready', 'done');
    } catch (error) {
      logger.error('Error fetching AI analysis:', error);
      setAiAnalysisError('Error al generar análisis AI');
      toast.error('Error al generar análisis AI');
      setStep('ai', 'error');
    } finally {
      setLoadingAiAnalysis(false);
    }
  };

  // Initialize socios evaluations when data changes
  useEffect(() => {
    const initializeSociosEvaluations = async () => {
      if (data?.companyGeneralInfo?.socios) {
        const socios = data.companyGeneralInfo.socios;
        const sociosRuts = socios.map((socio: { rut: string }) => socio.rut);

        // Helper function to process socios with RUT search functionality
        const processSociosWithRutSearch = (socios: { name: string; rut: string; isNaturalPerson?: boolean; personType?: string }[], existingEvaluations?: any) => {
          return socios.map((socio: { name: string; rut: string; isNaturalPerson?: boolean; personType?: string }) => {
            logger.log('Processing socio:', socio.name, 'with RUT:', socio.rut);

            let finalRut = socio.rut;
            let rutFoundAutomatically = false;

            // If socio doesn't have a RUT, try to find it in external data
            if (!socio.rut || socio.rut.trim() === '') {
              logger.warn('⚠️ Socio without RUT found:', socio.name);

              // Search for RUT in external data sources
              const foundRut = searchRutInExternalData(socio.name, data);
              if (foundRut) {
                finalRut = foundRut;
                rutFoundAutomatically = true;
                logger.log(`✅ Found RUT for ${socio.name}: ${foundRut}`);
              } else {
                logger.log(`❌ No RUT found for ${socio.name} in external data`);
              }
            }

            // Try to find existing evaluation if available
            const existingEvaluation = existingEvaluations?.evaluations?.find(
              (evaluation: any) => evaluation.rut === finalRut?.replace(/\./g, '')
            );

            return {
              rut: finalRut,
              name: socio.name,
              isSelected: false,
              isEvaluating: false,
              rutFoundAutomatically,
              evaluationResult: undefined,
              previousEvaluation: {
                hasBeenEvaluated: existingEvaluation?.isEvaluated || false,
                evaluationDate: existingEvaluation?.evaluationDate || undefined,
                hasPepChile: existingEvaluation?.evaluationResult?.hasPepChile || undefined,
                hasFamiliaresPep: existingEvaluation?.evaluationResult?.hasFamiliaresPep || undefined
              },
              isNaturalPerson: typeof socio.isNaturalPerson === 'boolean' ? socio.isNaturalPerson : undefined
            };
          });
        };

        try {
          // Try to check for existing evaluations
          logger.log('🔍 Attempting to check existing evaluations...');
          const existingEvaluations = await checkSociosEvaluations(sociosRuts);
          logger.log('✅ Successfully retrieved existing evaluations');

          // Clear any previous server error since the request succeeded
          setServerError(null);

          const initialEvaluations = processSociosWithRutSearch(socios, existingEvaluations);

          logger.log('All socios RUTs:', initialEvaluations.map(s => s.rut));
          logger.log('Unique RUTs count:', new Set(initialEvaluations.map(s => s.rut)).size);

          // Count and log socios without RUT
          const sociosWithoutRut = initialEvaluations.filter(s => !s.rut || s.rut.trim() === '');
          if (sociosWithoutRut.length > 0) {
            logger.warn(`📊 Found ${sociosWithoutRut.length} socios without RUT:`, sociosWithoutRut.map(s => s.name));
          }

          // If reset was performed, clear previous evaluation flags
          setSociosEvaluations((prev) => {
            if (resetPerformed) {
              return initialEvaluations.map(s => ({
                ...s,
                previousEvaluation: { hasBeenEvaluated: false },
                evaluationResult: undefined
              }));
            }
            return initialEvaluations;
          });
        } catch (error) {
          logger.warn('⚠️ Server error when checking existing evaluations:', error);
          logger.log('🔄 Continuing with RUT search functionality in offline mode...');

          // Set server error state for user notification
          setServerError('Il servizio di valutazione è temporaneamente non disponibile. La funzionalità di ricerca RUT automatica continua a funzionare.');

          // Fallback: Continue with RUT search functionality even if server is unavailable
          const initialEvaluations = processSociosWithRutSearch(socios);

          logger.log('All socios RUTs (offline mode):', initialEvaluations.map(s => s.rut));
          logger.log('Unique RUTs count (offline mode):', new Set(initialEvaluations.map(s => s.rut)).size);

          // Count and log socios without RUT
          const sociosWithoutRut = initialEvaluations.filter(s => !s.rut || s.rut.trim() === '');
          if (sociosWithoutRut.length > 0) {
            logger.warn(`📊 Found ${sociosWithoutRut.length} socios without RUT (offline mode):`, sociosWithoutRut.map(s => s.name));
          }

          setSociosEvaluations(initialEvaluations);

          // Show a user-friendly toast message about the server issue
          /*
          toast('⚠️ Servizio di valutazione temporaneamente non disponibile. La ricerca automatica RUT continua a funzionare.', {
            duration: 5000,
            style: {
              background: '#F59E0B',
              color: 'white',
            },
            icon: '⚠️'
          });
          */
        }
      }
    };

    initializeSociosEvaluations();
  }, [data, resetPerformed]);

  // Helper function to count socios that are already evaluated or currently selected
  const countEvaluatedAndSelectedSocios = useCallback((sociosEvaluations: SocioEvaluation[]) => {
    return sociosEvaluations.filter(socio =>
      socio.isSelected ||
      socio.previousEvaluation?.hasBeenEvaluated ||
      socio.evaluationResult
    ).length;
  }, []);

  // Helper function to calculate complete PEP evaluation summary including previous evaluations
  const calculateCompletePepSummary = useCallback((sociosEvaluations: SocioEvaluation[]) => {
    let pepChileDetected = false;
    let familiaresPepDetected = false;
    const evaluatedSocios: string[] = [];

    sociosEvaluations.forEach(socio => {
      // Check if socio has been evaluated (either new evaluation or previous evaluation)
      const hasNewEvaluation = !!socio.evaluationResult;
      const hasPreviousEvaluation = socio.previousEvaluation?.hasBeenEvaluated;

      if (hasNewEvaluation || hasPreviousEvaluation) {
        evaluatedSocios.push(socio.rut);

        // Check for PEP Chile
        if (hasNewEvaluation && socio.evaluationResult?.hasPepChile) {
          pepChileDetected = true;
        } else if (hasPreviousEvaluation && socio.previousEvaluation?.hasPepChile) {
          pepChileDetected = true;
        }

        // Check for Familiares PEP
        if (hasNewEvaluation && socio.evaluationResult?.hasFamiliaresPep) {
          familiaresPepDetected = true;
        } else if (hasPreviousEvaluation && socio.previousEvaluation?.hasFamiliaresPep) {
          familiaresPepDetected = true;
        }
      }
    });

    return {
      pepChileDetected,
      familiaresPepDetected,
      evaluatedSocios
    };
  }, []);

  useEffect(() => {
    if (sociosEvaluations.length > 0) {
      const completePepSummary = calculateCompletePepSummary(sociosEvaluations);
      setPepEvaluationSummary(completePepSummary);
    }
  }, [sociosEvaluations, calculateCompletePepSummary]);


  useEffect(() => {
    const hasEvaluated = sociosEvaluations.some(s => s.previousEvaluation?.hasBeenEvaluated || s.evaluationResult);
    if (hasEvaluated) {
      setSociosSortKey('estadoEvaluacion');
      setSociosSortDir('desc');
    }
  }, [sociosEvaluations]);


  useEffect(() => {

  }, [riskSummary.allRules]);
  const toggleSocioSelection = useCallback((rutToToggle: string) => {
    logger.log('toggleSocioSelection called with rut:', rutToToggle);

    setSociosEvaluations(prev => {
      logger.log('Current sociosEvaluations:', prev);

      const socioToToggle = prev.find(s => s.rut === rutToToggle);
      if (!socioToToggle) return prev;

      if (!socioToToggle.isSelected) {
        const naturalCheck = socioToToggle.isNaturalPerson ?? inferIsNaturalFromRut(socioToToggle.rut);
        if (naturalCheck !== true) {
          toast.error('Solo socios persona natural pueden ser evaluados para PEP');
          return prev;
        }
        const currentCount = countEvaluatedAndSelectedSocios(prev);

        if (currentCount >= 3) {
          toast.error('Puedes evaluar un máximo de 3 socios en total (incluyendo los ya evaluados)');
          return prev;
        }
      }

      const updated = prev.map((socio) => {
        const shouldToggle = socio.rut === rutToToggle;
        logger.log(`Socio (RUT: ${socio.rut}): shouldToggle=${shouldToggle}, current isSelected=${socio.isSelected}`);
        return shouldToggle
          ? { ...socio, isSelected: !socio.isSelected }
          : socio;
      });

      logger.log('Updated sociosEvaluations:', updated);
      return updated;
    });
  }, []);

  // Evaluate selected socios for PEP status
  const evaluateSelectedSocios = async () => {
    // Enforce 3 max rule even after reset
    const selectedSocios = sociosEvaluations.filter(socio => socio.isSelected);

    if (selectedSocios.length === 0) {
      toast.error('Selecciona al menos un socio para evaluar');
      return;
    }

    // Check total count including already evaluated socios
    const totalCount = countEvaluatedAndSelectedSocios(sociosEvaluations);
    if (totalCount > 3) {
      toast.error('Puedes evaluar un máximo de 3 socios en total (incluyendo los ya evaluados). Por favor, deselecciona algunos socios.');
      return;
    }

    setIsEvaluatingSocios(true);
    setSociosEvaluations(prev => prev.map(s => s.isSelected ? { ...s, status: 'in_progress', errorMessage: undefined } : s));

    try {
      // First, check which socios have already been evaluated
      const selectedRuts = selectedSocios.map(socio => socio.rut);
      logger.log('Checking existing evaluations for RUTs:', selectedRuts);

      const existingEvaluations = await checkSociosEvaluations(selectedRuts);
      logger.log('Existing evaluations found:', existingEvaluations);

      const evaluationPromises = selectedSocios.map(async (socio) => {
        try {
          // Check if this socio has already been evaluated
          const existingEvaluation = existingEvaluations.evaluations.find(
            evaluation => evaluation.rut === socio.rut.replace(/\./g, '')
          );

          // Update individual socio as evaluating and populate previous evaluation info
          setSociosEvaluations(prev =>
            prev.map(s =>
              s.rut === socio.rut
                ? {
                  ...s,
                  isEvaluating: true,
                  status: 'in_progress',
                  evaluationResult: undefined,
                  previousEvaluation: {
                    hasBeenEvaluated: existingEvaluation?.isEvaluated || false,
                    evaluationDate: existingEvaluation?.evaluationDate || undefined,
                    hasPepChile: existingEvaluation?.evaluationResult?.hasPepChile || undefined,
                    hasFamiliaresPep: existingEvaluation?.evaluationResult?.hasFamiliaresPep || undefined
                  }
                } as SocioEvaluation
                : s
            )
          );

          let hasPepChile = false;
          let hasFamiliaresPep = false;
          let sheriffData = null;
          if (existingEvaluation && existingEvaluation.isEvaluated && existingEvaluation.evaluationResult) {
            // Use existing evaluation results
            logger.log(`Using existing evaluation for RUT ${socio.rut}:`, existingEvaluation);
            hasPepChile = existingEvaluation.evaluationResult.hasPepChile;
            hasFamiliaresPep = existingEvaluation.evaluationResult.hasFamiliaresPep;

            toast.success(`Socio ${socio.name} ya había sido evaluado - usando resultados existentes`);
          } else {
            // Call Sheriff API to evaluate the socio
            logger.log(`Evaluating new RUT ${socio.rut} via Sheriff API [PEP-only]`);
            sheriffData = await lookupRut(socio.rut, false, { isPep: true });

            // Check for PEP Chile and Familiares PEP in the compliance data
            // Check in different possible locations for compliance data
            const sheriffDataAny = sheriffData as any;
            let complianceRules = null;
            logger.log(500, sheriffDataAny.riskAssessment);
            // Try different possible paths for compliance data
            if (sheriffDataAny.riskAssessment?.allRules?.complianceRules) {
              complianceRules = sheriffDataAny.riskAssessment.allRules.complianceRules;
            } else if (sheriffDataAny.summaryData?.complianceData?.riskAssessment?.allRules?.complianceRules) {
              complianceRules = sheriffDataAny.summaryData.complianceData.riskAssessment.allRules.complianceRules;
            } else if (sheriffDataAny.loadRutData?.complianceData?.riskAssessment?.allRules?.complianceRules) {
              complianceRules = sheriffDataAny.loadRutData.complianceData.riskAssessment.allRules.complianceRules;
            }

            if (complianceRules) {
              const pepChileRule = complianceRules.find((rule: any) =>
                ruleLabelMatches(rule.label, 'PEP Chile', pepChileAliases)
              );
              const familiaresPepRule = complianceRules.find((rule: any) =>
                ruleLabelMatches(rule.label, 'Familiares PEP', familiaresPepAliases)
              );

              hasPepChile = pepChileRule && pepChileRule.detected === true;
              hasFamiliaresPep = familiaresPepRule && familiaresPepRule.detected === true;

              logger.log('Compliance Rules found in:', complianceRules);
              logger.log('PEP Chile Rule:', pepChileRule);
              logger.log('Familiares PEP Rule:', familiaresPepRule);
              logger.log('Has PEP Chile:', hasPepChile);
              logger.log('Has Familiares PEP:', hasFamiliaresPep);
            } else {
              logger.log('No compliance rules found in sheriff data structure');
              logger.log('Available properties:', Object.keys(sheriffDataAny));
            }
          }

          // Update socio with evaluation result
          setSociosEvaluations(prev =>
            prev.map(s =>
              s.rut === socio.rut
                ? {
                  ...s,
                  isEvaluating: false,
                  status: 'completed',
                  evaluationResult: {
                    hasPepChile,
                    hasFamiliaresPep,
                    sheriffData
                  }
                }
                : s
            )
          );

          try {
            const normalizedRut = socio.rut.replace(/\./g, '');
            await apiClient.put(`/rut/results/rut/${normalizedRut}/update-pep-status`, { isPep: true });
          } catch (e) {
            logger.error('Error updating isPep flag for socio', socio.rut, e);
          }

          return { rut: socio.rut, hasPepChile, hasFamiliaresPep, status: 'completed' };
        } catch (error) {
          logger.error(`Error evaluating socio ${socio.rut}:`, error);

          // Update socio with error state
          setSociosEvaluations(prev =>
            prev.map(s =>
              s.rut === socio.rut
                ? { ...s, isEvaluating: false, status: 'error', errorMessage: (error as any)?.message }
                : s
            )
          );

          toast.error(`Error evaluando socio ${socio.name}`);
          return { rut: socio.rut, hasPepChile: false, hasFamiliaresPep: false, status: 'error' };
        }
      });

      const results = await Promise.all(evaluationPromises);

      const allCompleted = results.length === selectedSocios.length && results.every(r => r.status === 'completed');
      if (!allCompleted) {
        toast.error('Alcune valutazioni non sono state completate. Controlla gli errori.');
        return;
      }

      // Update PEP evaluation summary using the complete calculation that includes previous evaluations
      const completePepSummary = calculateCompletePepSummary(sociosEvaluations);
      setPepEvaluationSummary(completePepSummary);

      // For the company risk summary update, we only consider the new evaluations
      const pepChileDetected = results.some(result => result.hasPepChile);
      const familiaresPepDetected = results.some(result => result.hasFamiliaresPep);

      // Update company risk summary if PEP detected
      if (pepChileDetected || familiaresPepDetected) {
        await updateCompanyRiskSummary(pepChileDetected, familiaresPepDetected);
      }

      toast.success(`Evaluación completata per ${selectedSocios.length} soci`);

      try {
        const normalizedCompanyRut = (rut || companyData.rut || '').replace(/\./g, '');
        if (normalizedCompanyRut) {
          await apiClient.put(`/rut/results/rut/${normalizedCompanyRut}/update-pep-status`, { isPep: true });
        }
      } catch (e) {
        logger.error('Error updating isPep flag for company', rut || companyData.rut, e);
      }

      const newParams = new URLSearchParams(searchParams.toString());
      newParams.set('risk', 'true');
      if (rut) newParams.set('rut', rut);
      const qs = newParams.toString();
      navigate(`${window.location.pathname}${qs ? `?${qs}` : ''}`, { replace: true });
      await fetchData(rut || undefined);
    } catch (error) {
      logger.error('Error during socios evaluation:', error);
      toast.error('Error durante la evaluación de socios');
    } finally {
      setIsEvaluatingSocios(false);
    }
  };

  // Update company risk summary based on socios PEP status
  const updateCompanyRiskSummary = async (pepChileDetected: boolean, familiaresPepDetected: boolean) => {
    try {
      let hasChanges = false;
      let newRiskData: RiskData;
      let newRiskSummary: RiskSummary;

      // Check if changes are needed first
      const pepChileRule = (riskSummary.allRules?.complianceRules || []).find(rule => ruleLabelMatches(rule.label, 'PEP Chile', pepChileAliases));
      const familiaresPepRule = (riskSummary.allRules?.complianceRules || []).find(rule => ruleLabelMatches(rule.label, 'Familiares PEP', familiaresPepAliases));

      if ((pepChileDetected && (!pepChileRule || !pepChileRule.detected)) ||
        (familiaresPepDetected && (!familiaresPepRule || !familiaresPepRule.detected))) {
        hasChanges = true;
      }

      if (!hasChanges) {
        logger.log('No changes needed - PEP rules already detected');
        return;
      }

      // Update the risk data
      const updatedComplianceRules = (riskSummary.allRules?.complianceRules || []).map(rule => {
        if (ruleLabelMatches(rule.label, 'PEP Chile', pepChileAliases) && pepChileDetected && !rule.detected) {
          return { ...rule, label: 'PEP Chile', detected: true, risk: 'alto' };
        }
        if (ruleLabelMatches(rule.label, 'Familiares PEP', familiaresPepAliases) && familiaresPepDetected && !rule.detected) {
          return { ...rule, label: 'Familiares PEP', detected: true, risk: 'alto' };
        }
        return rule;
      });

      if (pepChileDetected && !pepChileRule) {
        updatedComplianceRules.push({ label: 'PEP Chile', impacto: 'severo', detected: true, risk: 'alto', details: [] });
      }
      if (familiaresPepDetected && !familiaresPepRule) {
        updatedComplianceRules.push({ label: 'Familiares PEP', impacto: 'severo', detected: true, risk: 'alto', details: [] });
      }

      newRiskData = {
        ...(riskSummary.allRules || { complianceRules: [], legalRules: [], capitalHumanoRules: [], financieroTributarioRules: [] }),
        complianceRules: updatedComplianceRules
      };

      // Calculate new totals for risk summary
      let newTotalSevero = riskSummary.riskSummary.totalSevero;
      let newTotalDetected = riskSummary.riskSummary.totalDetected;

      // Add new severe risks if they weren't detected before
      if (pepChileDetected && (!pepChileRule || !pepChileRule.detected)) {
        newTotalSevero += 1;
        newTotalDetected += 1;
      }
      if (familiaresPepDetected && (!familiaresPepRule || !familiaresPepRule.detected)) {
        newTotalSevero += 1;
        newTotalDetected += 1;
      }

      // Update semaphore based on new severe count
      let newSemaphore = 'green';
      let newRiskLevelDescription = 'Bajo Riesgo';

      if (newTotalSevero > 0) {
        newSemaphore = 'red';
        newRiskLevelDescription = 'Alto Riesgo';
      } else if (riskSummary.riskSummary.totalSignificativo > 0) {
        newSemaphore = 'yellow';
        newRiskLevelDescription = 'Riesgo Medio';
      }

      newRiskSummary = {
        riskSummary: {
          ...riskSummary.riskSummary,
          totalSevero: newTotalSevero,
          totalDetected: newTotalDetected,
          semaphore: newSemaphore,
          riskLevelDescription: newRiskLevelDescription
        }
      };

      // Update state
      setRiskSummary({ ...newRiskSummary, allRules: newRiskData });

      // Persist changes to the database
      if (companyData.rut) {
        try {
          const updatePayload = {
            rut: companyData.rut,
            riskAssessment: {
              riskSummary: newRiskSummary.riskSummary,
              allRules: newRiskData
            },
            sociosEvaluationSummary: pepEvaluationSummary,
            lastPepUpdate: new Date().toISOString()
          };

          await apiClient.put(`/rut/results/rut/${companyData.rut}/update-pep-status`, updatePayload);

          // Show success notification with details
          const pepMessages = [];
          if (pepChileDetected) pepMessages.push('PEP Chile');
          if (familiaresPepDetected) pepMessages.push('Familiares PEP');

          toast.success(
            `✅ ¡Resultados actualizados automáticamente!\n` +
            `Detectados ${pepMessages.join(' y ')} en los socios.\n` +
            `El nivel de riesgo de la empresa ha sido actualizado a: ${newRiskSummary.riskSummary.riskLevelDescription}`,
            {
              duration: 6000,
              style: {
                background: '#10B981',
                color: 'white',
                fontWeight: 'bold'
              }
            }
          );

          logger.log('Company risk summary updated and persisted to database');
        } catch (persistError) {
          logger.error('Error persisting updated risk summary:', persistError);
          toast.error('Risultati aggiornati localmente ma errore nel salvataggio. Riprova più tardi.');
        }
      }

      logger.log('Company risk summary updated based on socios PEP evaluation');
    } catch (error) {
      logger.error('Error updating company risk summary:', error);
      toast.error('Errore durante l\'aggiornamento dei risultati');
    }
  };

  useEffect(() => {
    // Check if there's a RUT in the URL parameters and reset flag
    const rutParam = searchParams.get('rut');
    const resultIdParam = searchParams.get('resultId') || searchParams.get('_id') || searchParams.get('id');
    const resetParam = searchParams.get('reset_evaluacion');
    setResetRequested(resetParam === 'true');
    if (resultIdParam) {
      fetchData(undefined, resultIdParam);
    } else if (rutParam) {
      setRut(rutParam);
      fetchData(rutParam);
    } else {
      fetchData();
    }
  }, [searchParams]);

  // When socios are initialized and reset is requested, prompt and perform reset once
  useEffect(() => {
    const shouldReset = resetRequested && !resetPerformed && sociosEvaluations.length > 0;
    if (!shouldReset) return;
    const confirmed = window.confirm('¿Resetear evaluaciones previas de socios? Esta acción eliminará resultados anteriores.');
    if (!confirmed) {
      toast('Reset cancelado');
    } else {
      (async () => {
        try {
          const rutsToReset = sociosEvaluations.map(s => s.rut).filter(Boolean);
          const { deletedCount } = await resetSociosEvaluations(rutsToReset, true);
          toast.success(`Evaluaciones reseteadas (${deletedCount} eliminadas)`);
          setSociosEvaluations(prev => prev.map(s => ({
            ...s,
            previousEvaluation: { hasBeenEvaluated: false },
            evaluationResult: undefined
          })));
        } catch (error) {
          logger.error('Error resetting socios evaluations:', error);
          toast.error('Error al resetear evaluaciones');
        } finally {
          setResetPerformed(true);
          // Remove reset flag from URL while preserving other params
          const newParams = new URLSearchParams(searchParams);
          newParams.delete('reset_evaluacion');
          const qs = newParams.toString();
          const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
          window.history.replaceState({}, '', newUrl);
        }
      })();
    }
  }, [resetRequested, resetPerformed, sociosEvaluations, searchParams]);

  const handleSearch = () => {
    fetchData(rut);
    setResetPerformed(false);
  };

  const handleRefresh = async () => {
    if (!rut) return;

    setLoading(true);
    setIsRefreshing(true);
    resetSteps();
    setStep('start', 'in_progress');

    try {
      // The backend will automatically delete all existing evaluations for this RUT
      // when we call the lookup endpoint, so we don't need to manually delete them here
      logger.log('Preparing to refresh evaluation - backend will handle deletion of existing evaluations');

      // Reset all data before refetching
      setData(null);
      setCompanyData({
        razonSocial: '',
        rut: '',
        fechaEvaluacion: '',
      });
      setRiskSummary({
        riskSummary: {
          totalSevero: 0,
          totalSignificativo: 0,
          totalDetected: 0,
          totalParameters: 0,
          semaphore: '',
          riskLevelDescription: ''
        },
        allRules: { complianceRules: [], legalRules: [], capitalHumanoRules: [], financieroTributarioRules: [] }
      });
      setAiAnalysis(null);
      setAiAnalysisError(null);
      setAiAnalysisFromCache(false);
      setAiAnalysisDate(null);
      setUserNote(null);
      setNoteText('');
      setNoteTags([]);
      setIsEditingNote(false);
      setListasPropias({ altoImpacto: [], medioImpacto: [] });

      // Create a new individual evaluation by calling the RUT lookup endpoint
      // This will trigger a fresh evaluation as if it were an individual evaluation
      setStep('lookup', 'in_progress');
      const response = await apiClient.post(`/rut/lookup`, {
        rut: rut,
        isMonitoring: false,
        isRefreshing: true
      });
      setStep('lookup', 'done');

      // After creating the new evaluation, fetch the updated data
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.set('risk', 'true');
      if (rut) newParams.set('rut', rut);
      const qs = newParams.toString();
      navigate(`${window.location.pathname}${qs ? `?${qs}` : ''}`, { replace: true });
      await fetchData(rut);
      setResetPerformed(false);

      toast.success('Evaluación actualizada exitosamente');

    } catch (error) {
      logger.error('Error refreshing evaluation:', error);
      toast.error('Error al actualizar la evaluación');
      setStep('start', 'error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const toggleSection = (section: 'parametros' | 'informacion' | 'hallazgos' | 'notas' | 'resumen') => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const calculateSemaphore = (count: { criticalParams: number; highParams: number; lowParams: number }): string => {
    const totalParams = count.criticalParams + count.highParams + count.lowParams;

    // Criterio 1: Si hay al menos 1 parámetro crítico → Rojo
    if (count.criticalParams >= 1) {
      return 'red';
    }

    // Criterio 2: Si todos los parámetros son de riesgo bajo → Verde
    if (count.lowParams === totalParams && totalParams > 0) {
      return 'green';
    }

    // Criterio 3: Si (riesgo alto / total) >= 50% → Rojo
    if (totalParams > 0 && (count.highParams / totalParams) >= 0.5) {
      return 'red';
    }

    // Criterio 4: Si (riesgo alto / total) >= 30% → Naranja
    if (totalParams > 0 && (count.highParams / totalParams) >= 0.3) {
      return 'orange';
    }

    // Criterio 5: Todas las otras opciones → Amarillo
    return 'yellow';
  };

  const getSemaphoreColor = (semaphore: string) => {
    switch (semaphore) {
      case 'red':
        return 'bg-red-500';
      case 'orange':
        return 'bg-orange-500';
      case 'yellow':
        return 'bg-yellow-500';
      case 'green':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'critico':
        return 'text-red-500';
      case 'alto':
        return 'text-orange-500';
      case 'medio':
        return 'text-yellow-500';
      case 'bajo':
        return 'text-green-500';
      default:
        return 'text-gray-500';
    }
  };

  const getImpactColor = (impacto: string) => {
    switch (impacto) {
      case 'severo':
        return 'text-black';
      case 'significativo':
        return 'text-black';
      default:
        return 'text-black';
    }
  };

  const handleExportPDF = async () => {
    if (!reportRef.current) return;

    setExportingPdf(true);

    try {
      const currentExpandedState = { ...expandedSections };

      setExpandedSections({
        parametros: true,
        informacion: true,
        hallazgos: true,
        resumen: true,
        notas: true
      });

      await new Promise(resolve => setTimeout(resolve, 1500));

      // === OCULTAR INICIO DE ACTIVIDADES SI TIENE DATOS ===
      let inicioActividadesSection: HTMLElement | null = null;
      let inicioActividadesOriginalDisplay = '';

      const inicioActividadesRule = (riskSummary.allRules?.financieroTributarioRules || [])
        .find(rule => rule.label === 'Inicio de Actividades');

      const hasInicioActividadesData = inicioActividadesRule?.details &&
        Array.isArray(inicioActividadesRule.details) &&
        inicioActividadesRule.details.length > 0 &&
        typeof inicioActividadesRule.details[0] === 'object' &&
        inicioActividadesRule.details[0] !== null;

      if (hasInicioActividadesData && reportRef.current) {
        inicioActividadesSection = reportRef.current.querySelector('#inicio-actividades-section');
        if (inicioActividadesSection) {
          inicioActividadesOriginalDisplay = inicioActividadesSection.style.display;
          inicioActividadesSection.style.display = 'none';
        }
      }
      // === FIN OCULTAR ===

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 15;
      const contentWidth = pageWidth - (2 * margin);
      let currentY = margin;

      // 🔹 CREAR IFRAME OCULTO PARA RENDERIZAR SIN ZOOM
      const createIframeForCapture = (): HTMLIFrameElement => {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.left = '-9999px';
        iframe.style.top = '0';
        iframe.style.width = '1200px';
        iframe.style.height = '10000px';
        iframe.style.border = 'none';
        iframe.style.overflow = 'hidden';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write('<!DOCTYPE html><html><head>');

          Array.from(document.styleSheets).forEach(styleSheet => {
            try {
              if (styleSheet.href) {
                iframeDoc.write(`<link rel="stylesheet" href="${styleSheet.href}">`);
              } else if (styleSheet.cssRules) {
                iframeDoc.write('<style>');
                Array.from(styleSheet.cssRules).forEach(rule => {
                  iframeDoc.write(rule.cssText);
                });
                iframeDoc.write('</style>');
              }
            } catch (e) {
              console.warn('No se pudo copiar stylesheet:', e);
            }
          });

          const styleElements = document.querySelectorAll('style');
          styleElements.forEach(style => {
            iframeDoc.write(`<style>${style.textContent}</style>`);
          });

          iframeDoc.write('<style>html, body { zoom: 1 !important; transform: none !important; }</style>');
          iframeDoc.write('</head><body></body></html>');
          iframeDoc.close();
        }

        return iframe;
      };

      const captureElementInIframe = async (element: HTMLElement): Promise<string> => {
        const iframe = createIframeForCapture();

        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!iframeDoc) throw new Error('No se pudo acceder al documento del iframe');

          const clonedElement = element.cloneNode(true) as HTMLElement;

          clonedElement.querySelectorAll('button,input,textarea').forEach((el: any) => {
            el.style.display = 'none';
          });

          iframeDoc.body.appendChild(clonedElement);

          await new Promise(resolve => setTimeout(resolve, 100));

          const canvas = await html2canvas(clonedElement, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            allowTaint: false,
            foreignObjectRendering: false
          });

          return canvas.toDataURL('image/jpeg', 0.85);
        } finally {
          document.body.removeChild(iframe);
        }
      };

      // Función auxiliar para agregar la imagen de barra en cada página
      const addPageHeaderImage = async () => {
        try {
          const headerImg = new Image();
          headerImg.crossOrigin = 'anonymous';
          await new Promise<void>((resolve, reject) => {
            headerImg.onload = () => {
              const imgWidth = pageWidth;
              const imgHeight = (headerImg.height * imgWidth) / headerImg.width;
              pdf.addImage(headerImg, 'JPEG', 0, 0, imgWidth, imgHeight);
              currentY = imgHeight + 10;
              resolve();
            };
            headerImg.onerror = () => {
              console.warn("Header image load error");
              currentY = margin;
              resolve();
            };
            headerImg.src = duxiterLogoBar;
          });
        } catch (err) {
          console.warn("Header image error:", err);
          currentY = margin;
        }
      };

      await addPageHeaderImage();

      // Logo
      pdf.setFontSize(24);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(59, 130, 246);
      const titleText = "Fast Check";
      const titleWidth = pdf.getTextWidth(titleText);
      pdf.text(titleText, (pageWidth - titleWidth) / 2, currentY + 10);
      currentY += 16;

      // ── Variable para la malla diferida ──────────────────────────────────
      let deferredMeshEl: HTMLElement | null = null;

      // ====== SECCIONES NORMALES (SIN DETAILS) ======
      const normalSections = Array.from(reportRef.current.children).filter(
        child => {
          if (!(child instanceof HTMLElement)) return false;
          if (child.offsetHeight === 0) return false;
          if (child.id === "divContainerDetails") return false;
          if (child.querySelector("#divContainerDetails")) return false;
          return true;
        }
      ) as HTMLElement[];

      for (const section of normalSections) {
        const heading = section.querySelector('h2');
        if (heading && heading.textContent?.trim().includes('Resumen')) {
          pdf.addPage();
          await addPageHeaderImage();

          const imgData = await captureElementInIframe(section);
          const tempImg = new Image();
          await new Promise((resolve) => {
            tempImg.onload = resolve;
            tempImg.src = imgData;
          });
          const imgHeight = (tempImg.height * contentWidth) / tempImg.width;
          pdf.addImage(imgData, 'JPEG', margin, currentY, contentWidth, imgHeight);
          currentY += imgHeight + 5;
          continue;
        }

        // ── MeshTable: guardar para el final del PDF ──────────────────────
        const meshEl = section.querySelector('[data-pdf="mesh-table"]') as HTMLElement | null;

        if (meshEl) {
          // 1. Renderizar la sección SIN la malla
          const sectionClone = section.cloneNode(true) as HTMLElement;
          (sectionClone.querySelector('[data-pdf="mesh-table"]') as HTMLElement | null)?.remove();
          const sectionImg = await captureElementInIframe(sectionClone);
          const tempImg = new Image();
          await new Promise((resolve) => { tempImg.onload = resolve; tempImg.src = sectionImg; });
          const imgH = (tempImg.height * contentWidth) / tempImg.width;
          if (currentY + imgH > pageHeight - margin - 15) { pdf.addPage(); await addPageHeaderImage(); }
          pdf.addImage(sectionImg, 'JPEG', margin, currentY, contentWidth, imgH);
          currentY += imgH + 5;

          // 2. Renderizar la malla con solo filas N1 (inline, justo después de la sección)
          // Capturar encabezado (info box, título) sin tablas
          const meshHeaderClone = meshEl.cloneNode(true) as HTMLElement;
          meshHeaderClone.querySelectorAll('table, .overflow-x-auto').forEach(el => el.remove());
          meshHeaderClone.querySelectorAll('p.text-xs').forEach(el => el.remove());
          const meshHeaderImg = await captureElementInIframe(meshHeaderClone);
          const mhEl = new Image();
          await new Promise((resolve) => { mhEl.onload = resolve; mhEl.src = meshHeaderImg; });
          const mhH = (mhEl.height * contentWidth) / mhEl.width;
          if (mhH > 5) {
            if (currentY + mhH > pageHeight - margin - 15) { pdf.addPage(); await addPageHeaderImage(); }
            pdf.addImage(meshHeaderImg, 'JPEG', margin, currentY, contentWidth, mhH);
            currentY += mhH + 3;
          }

          // Solo la tabla own con filas N1
          const ownTable = meshEl.querySelector('table[data-pdf-table="own"]') as HTMLTableElement | null;
          if (ownTable) {
            const thead = ownTable.querySelector('thead');
            const allRows = Array.from(ownTable.querySelectorAll('tbody tr')) as HTMLElement[];

            // Filtrar solo N1: las que contienen el badge con texto "N1"
            const n1Rows = allRows.filter(row => {
              const badges = Array.from(row.querySelectorAll('span'));
              return badges.some(s => s.textContent?.trim() === 'N1');
            });

            if (thead && n1Rows.length > 0) {
              const makeHeaderTable = (): HTMLTableElement => {
                const t = document.createElement('table');
                t.style.cssText = 'width:1180px;border-collapse:collapse;table-layout:fixed;font-size:13px;';
                const colgroup = ownTable.querySelector('colgroup');
                if (colgroup) t.appendChild(colgroup.cloneNode(true));
                t.appendChild(thead.cloneNode(true));
                return t;
              };

              const h0Img = await captureElementInIframe(makeHeaderTable());
              const h0ImgEl = new Image();
              await new Promise((resolve) => { h0ImgEl.onload = resolve; h0ImgEl.src = h0Img; });
              const h0H = (h0ImgEl.height * contentWidth) / h0ImgEl.width;
              if (currentY + h0H > pageHeight - margin - 10) { pdf.addPage(); await addPageHeaderImage(); }
              pdf.addImage(h0Img, 'JPEG', margin, currentY, contentWidth, h0H);
              currentY += h0H;

              for (const row of n1Rows) {
                const rowTable = document.createElement('table');
                rowTable.style.cssText = 'width:1180px;border-collapse:collapse;table-layout:fixed;font-size:13px;';
                const colgroup = ownTable.querySelector('colgroup');
                if (colgroup) rowTable.appendChild(colgroup.cloneNode(true));
                const tbody = document.createElement('tbody');
                tbody.appendChild(row.cloneNode(true));
                rowTable.appendChild(tbody);

                const rImg = await captureElementInIframe(rowTable);
                const rImgEl = new Image();
                await new Promise((resolve) => { rImgEl.onload = resolve; rImgEl.src = rImg; });
                const rH = (rImgEl.height * contentWidth) / rImgEl.width;

                if (currentY + rH > pageHeight - margin - 10) {
                  pdf.addPage();
                  await addPageHeaderImage();
                  const hRepImg = await captureElementInIframe(makeHeaderTable());
                  const hRepImgEl = new Image();
                  await new Promise((resolve) => { hRepImgEl.onload = resolve; hRepImgEl.src = hRepImg; });
                  const hRepH = (hRepImgEl.height * contentWidth) / hRepImgEl.width;
                  pdf.addImage(hRepImg, 'JPEG', margin, currentY, contentWidth, hRepH);
                  currentY += hRepH;
                }

                pdf.addImage(rImg, 'JPEG', margin, currentY, contentWidth, rH);
                currentY += rH;
              }
              currentY += 6;
            }
          }

          // 3. Guardar la malla completa para renderizar al final del PDF
          deferredMeshEl = meshEl;
          continue;
        }
        // ── fin MeshTable diferido ────────────────────────────────────────

        const imgData = await captureElementInIframe(section);

        const tempImg = new Image();
        await new Promise((resolve) => {
          tempImg.onload = resolve;
          tempImg.src = imgData;
        });

        const imgWidth = contentWidth;
        const imgHeight = (tempImg.height * imgWidth) / tempImg.width;

        const isParametersGrid = section.querySelector('.grid.grid-cols-1.md\\:grid-cols-3') !== null;
        const threshold = isParametersGrid ? 60 : 15;

        if (currentY + imgHeight > pageHeight - margin - threshold) {
          pdf.addPage();
          await addPageHeaderImage();
        }

        pdf.addImage(imgData, 'JPEG', margin, currentY, imgWidth, imgHeight);

        const spacing = isParametersGrid ? 2 : 5;
        currentY += imgHeight + spacing;
      }

      // ====== SALTO DE PÁGINA Y TÍTULO "Detalles de hallazgos" ======
      if (currentY + 20 > pageHeight - margin - 15) {
        pdf.addPage();
        await addPageHeaderImage();
      }
      // Círculo azul (bullet)
      pdf.setFillColor(59, 130, 246);
      pdf.circle(margin + 2, currentY - 1.5, 2.5, "F");

      // Texto del título
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(59, 130, 246);
      pdf.text("Detalles de hallazgos", margin + 7, currentY);
      currentY += 7;

      // ====== CONSTRUIR SECCIONES DESDE riskSummary ======
      const tableSections: Array<{
        h3Title: string;
        h4Title: string;
        sectionTitle: string;
        sectionData: any;
      }> = [];

      // Compliance
      if (riskSummary.allRules?.complianceRules) {
        riskSummary.allRules.complianceRules
          .filter(rule => {
            if (!rule.details) return false;
            if (Array.isArray(rule.details)) return rule.details.length > 0;
            if (typeof rule.details === 'object' && rule.details !== null)
              return Object.keys(rule.details).length > 0;
            return true;
          })
          .forEach(rule => {
            tableSections.push({
              h3Title: 'Compliance',
              h4Title: rule.label,
              sectionTitle: rule.label,
              sectionData: rule.details
            });
          });
      }

      // Legal
      const todasCoincidenciasPdf =
        data?.sheriffLogData?.filteredDetails?.compliance?.penal?.coincidencias ||
        data?.details?.sheriffLogData?.filteredDetails?.compliance?.penal?.coincidencias ||
        data?.logEntry?.filteredDetails?.compliance?.penal?.coincidencias ||
        [];
      const coincidenciasFiltradasPdf = todasCoincidenciasPdf.filter((item: any) => {
        const postura = item?.postura?.toLowerCase() || '';
        return postura === 'demandado' || postura === 'querellado' || postura === 'denunciado';
      });
      if (coincidenciasFiltradasPdf.length > 0) {
        tableSections.push({
          h3Title: 'Integridad, Ética y Riesgo Penal',
          h4Title: 'Causas Penales',
          sectionTitle: 'Causas Penales',
          sectionData: coincidenciasFiltradasPdf.map(({ esDenunciado, litigantes, ...rest }: any) => rest),
        });
      }

      const noticiasCoincidenciasPdf =
        data?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
        data?.details?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
        data?.logEntry?.filteredDetails?.compliance?.noticias?.coincidencias ||
        [];
      if (noticiasCoincidenciasPdf.length > 0) {
        tableSections.push({
          h3Title: 'Reputación y Conflictos de Interés ',
          h4Title: 'Reputación Pública y Mediática (versión Beta)',
          sectionTitle: 'Reputación Pública y Mediática',
          sectionData: noticiasCoincidenciasPdf,
        });
      }

      if (riskSummary.allRules?.legalRules) {
        riskSummary.allRules.legalRules.forEach(rule => {
          tableSections.push({
            h3Title: 'Legal',
            h4Title: rule.label,
            sectionTitle: rule.label,
            sectionData: rule.details
          });
        });
      }

      // Capital Humano
      if (riskSummary.allRules?.capitalHumanoRules) {
        riskSummary.allRules.capitalHumanoRules.forEach(rule => {
          let details = rule.details;
          if (rule.label === 'Deuda Previsional Presunta' && (rule.details as any)?.casos) {
            details = (rule.details as any).casos;
          }
          tableSections.push({
            h3Title: 'Capital Humano',
            h4Title: rule.label,
            sectionTitle: rule.label,
            sectionData: details
          });
        });
      }

      // Financiero - Tributario
      if (riskSummary.allRules?.financieroTributarioRules) {
        riskSummary.allRules.financieroTributarioRules.forEach(rule => {
          tableSections.push({
            h3Title: 'Financiero - Tributario',
            h4Title: rule.label,
            sectionTitle: rule.label,
            sectionData: rule.details
          });
        });
      }

      const listasPropiasReputacion = (riskSummary.allRules?.complianceRules || [])
        .filter(rule => ['Listas Propias Alto Impacto', 'Listas Propias Mediano Impacto'].includes(rule.label));

      listasPropiasReputacion.forEach(rule => {
        tableSections.push({
          h3Title: 'Reputación y Conflictos de Interés',
          h4Title: rule.label,
          sectionTitle: rule.label,
          sectionData: rule.details
        });
      });

      const coincidencias =
        data?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
        data?.details?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
        data?.logEntry?.filteredDetails?.compliance?.noticias?.coincidencias ||
        [];

      if (Array.isArray(coincidencias) && coincidencias.length > 0) {
        tableSections.push({
          h3Title: 'Reputación y Conflictos de Interés',
          h4Title: 'Reputación Pública y Mediática',
          sectionTitle: 'Reputación Pública y Mediática',
          sectionData: coincidencias
        });
      }

      const formatDate = (value: any): string => {
        if (value == null) return '—';
        const valueStr = String(value).trim();

        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(valueStr)) {
          const [day, month, year] = valueStr.split('/');
          return `${day}-${month}-${year}`;
        }

        if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(valueStr)) {
          return valueStr;
        }

        if (/^\d{8}$/.test(valueStr)) {
          const year = valueStr.substring(0, 4);
          const month = valueStr.substring(4, 6);
          const day = valueStr.substring(6, 8);
          return `${day}-${month}-${year}`;
        }

        if (/^\d{4}-\d{2}-\d{2}/.test(valueStr)) {
          const [year, month, day] = valueStr.split('T')[0].split('-');
          return `${day}-${month}-${year}`;
        }

        try {
          const date = new Date(valueStr);
          if (!isNaN(date.getTime())) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}-${month}-${year}`;
          }
        } catch { }

        return valueStr;
      };

      const extractDate = (text: string): string => {
        const dateMatch1 = text.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
        if (dateMatch1) return dateMatch1[0];

        const dateMatch2 = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (dateMatch2) {
          const [, day, month, year] = dateMatch2;
          return `${day}-${month}-${year}`;
        }

        const dateMatch3 = text.match(/(\d{8})/);
        if (dateMatch3) {
          const dateStr = dateMatch3[0];
          const year = dateStr.substring(0, 4);
          const month = dateStr.substring(4, 6);
          const day = dateStr.substring(6, 8);
          return `${day}-${month}-${year}`;
        }

        const dateMatch4 = text.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (dateMatch4) {
          const [, year, month, day] = dateMatch4;
          return `${day}-${month}-${year}`;
        }

        return '';
      };

      const findTextInObject = (obj: any): string => {
        if (typeof obj === 'string') return obj;
        if (typeof obj === 'object' && obj !== null) {
          for (const value of Object.values(obj)) {
            if (typeof value === 'string' && value.length > 0) return value;
            if (typeof value === 'object' && value !== null) {
              const result = findTextInObject(value);
              if (result) return result;
            }
          }
        }
        return '';
      };

      const isTrueValue = (val: any): boolean => {
        if (val === true) return true;
        if (typeof val === 'string') {
          const lower = val.toLowerCase().trim();
          return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'si' || lower === 'sí';
        }
        if (typeof val === 'number') return val === 1;
        return false;
      };

      let currentCategory = '';

      for (const section of tableSections) {
        const { h3Title, h4Title, sectionTitle, sectionData } = section;

        // ============= INICIO DE ACTIVIDADES =============
        if (sectionTitle === 'Inicio de Actividades') {
          const inicioActividadesRule = (riskSummary.allRules?.financieroTributarioRules || [])
            .find(rule => rule.label === 'Inicio de Actividades');

          const hasRealData = inicioActividadesRule?.details &&
            Array.isArray(inicioActividadesRule.details) &&
            inicioActividadesRule.details.length > 0 &&
            typeof inicioActividadesRule.details[0] === 'object' &&
            inicioActividadesRule.details[0] !== null;

          if (hasRealData) {
            continue;
          }

          if (h3Title !== currentCategory) {
            if (currentY > pageHeight - margin - 20) {
              pdf.addPage();
              await addPageHeaderImage();
            }
            pdf.setFontSize(10);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(59, 130, 246);
            pdf.text(h3Title, margin, currentY);
            currentY += 10;
            currentCategory = h3Title;
          }

          if (currentY > pageHeight - margin - 15) {
            pdf.addPage();
            await addPageHeaderImage();
          }

          pdf.setFontSize(9);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(59, 130, 246);
          pdf.text(h4Title, margin, currentY);
          currentY += 8;

          pdf.setFontSize(9);
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(55, 65, 81);
          pdf.text('Rut no presenta registros de Inicio de Actividades', margin, currentY);
          currentY += 12;

          continue;
        }

        // ============= QUIEBRA JUDICIAL =============
        if (sectionTitle === 'Quiebra Judicial') {
          let hasQuiebra = false;

          if (sectionData != null) {
            if (isTrueValue(sectionData)) {
              hasQuiebra = true;
            } else if (Array.isArray(sectionData) && sectionData.length > 0) {
              hasQuiebra = true;
            } else if (typeof sectionData === 'object' && sectionData !== null && !Array.isArray(sectionData)) {
              const values = Object.values(sectionData);
              if (values.some(v => isTrueValue(v))) {
                hasQuiebra = true;
              }
            }
          }

          if (!hasQuiebra) {
            continue;
          }

          if (h3Title !== currentCategory) {
            if (currentY > pageHeight - margin - 20) {
              pdf.addPage();
              await addPageHeaderImage();
            }
            pdf.setFontSize(10);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(59, 130, 246);
            pdf.text(h3Title, margin, currentY);
            currentY += 10;
            currentCategory = h3Title;
          }

          if (currentY > pageHeight - margin - 15) {
            pdf.addPage();
            await addPageHeaderImage();
          }

          pdf.setFontSize(9);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(59, 130, 246);
          pdf.text(h4Title, margin, currentY);
          currentY += 8;

          pdf.setFontSize(9);
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(55, 65, 81);
          pdf.text("Tiene Quiebra Judicial en Tribunales", margin, currentY);
          currentY += 12;

          continue;
        }

        // Normalizar datos para PEP
        let normalizedData = sectionData;
        if (sectionTitle === 'PEP Chile' || sectionTitle === 'Familiares PEP') {
          if (sectionData && typeof sectionData === 'object' && !Array.isArray(sectionData)) {
            const keys = ['sociosFamiliaresPepDetected', 'pepChileDetected', 'data', 'results', 'items'];
            for (const key of keys) {
              if (sectionData[key] && Array.isArray(sectionData[key])) {
                normalizedData = sectionData[key];
                break;
              }
            }

            if (!Array.isArray(normalizedData)) {
              const hasDataKeys = sectionData.rut || sectionData.name || sectionData.count;
              if (hasDataKeys) {
                normalizedData = [sectionData];
              }
            }
          }
        }

        // Casos especiales: Término de Giro, Contribuyente difícil
        const casosEspeciales = ['Término de Giro', 'Contribuyente de difícil fiscalización'];
        if (casosEspeciales.includes(sectionTitle)) {
          let dateOnly = '';
          const textValue = findTextInObject(normalizedData);
          dateOnly = extractDate(textValue);

          if (!dateOnly || dateOnly === '') {
            continue;
          }
          const specialCaseMessage = `La situación se presenta a contar del ${dateOnly}`;

          if (h3Title !== currentCategory) {
            if (currentY > pageHeight - margin - 20) {
              pdf.addPage();
              await addPageHeaderImage();
            }
            pdf.setFontSize(10);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(59, 130, 246);
            pdf.text(h3Title, margin, currentY);
            currentY += 10;
            currentCategory = h3Title;
          }

          if (currentY > pageHeight - margin - 15) {
            pdf.addPage();
            await addPageHeaderImage();
          }

          pdf.setFontSize(9);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(59, 130, 246);
          pdf.text(h4Title, margin, currentY);
          currentY += 8;

          pdf.setFontSize(9);
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(55, 65, 81);
          pdf.text(specialCaseMessage, margin, currentY);
          currentY += 12;

          continue;
        }

        // Verificar si tiene datos para mostrar
        const hasData = normalizedData &&
          Array.isArray(normalizedData) &&
          normalizedData.length > 0 &&
          typeof normalizedData[0] === 'object' &&
          normalizedData[0] !== null;

        if (!hasData) {
          continue;
        }

        // Dibujar título de categoría si cambia
        if (h3Title !== currentCategory) {
          if (currentY > pageHeight - margin - 20) {
            pdf.addPage();
            await addPageHeaderImage();
          }
          pdf.setFontSize(10);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(59, 130, 246);
          pdf.text(h3Title, margin, currentY);
          currentY += 10;
          currentCategory = h3Title;
        }

        if (currentY > pageHeight - margin - 15) {
          pdf.addPage();
          await addPageHeaderImage();
        }

        pdf.setFontSize(9);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(59, 130, 246);
        pdf.text(h4Title, margin, currentY);
        currentY += 8;

        // Procesar tabla
        const colsSet = new Set<string>();
        normalizedData.forEach((item: any) => {
          Object.keys(item).forEach(k => colsSet.add(k));
        });
        let cols = Array.from(colsSet);

        if (sectionTitle === 'Familiares PEP') {
          cols = cols.filter(col => col !== 'datosRelaciones');
        }

        if (sectionTitle && columnasPermitidas[sectionTitle]) {
          const permitidas = columnasPermitidas[sectionTitle];
          const colsFiltradas = cols.filter(col => permitidas.includes(col));

          if (colsFiltradas.length === 0 && (sectionTitle === 'PEP Chile' || sectionTitle === 'Familiares PEP')) {
            cols = cols;
          } else if (colsFiltradas.length > 0) {
            cols = colsFiltradas;
          }
        }

        const numCols = cols.length;
        if (numCols > 0) {
          const colWidth = contentWidth / numCols;

          const splitTextToLines = (text: string, maxWidth: number): string[] => {
            const lines: string[] = [];
            const words = text.split(' ');
            let currentLine = '';

            words.forEach(word => {
              if (pdf.getTextWidth(word) > maxWidth - 4) {
                if (currentLine) {
                  lines.push(currentLine.trim());
                  currentLine = '';
                }

                let remainingWord = word;
                while (remainingWord.length > 0) {
                  let chunk = '';
                  for (let i = 1; i <= remainingWord.length; i++) {
                    const testChunk = remainingWord.substring(0, i) + '-';
                    if (pdf.getTextWidth(testChunk) > maxWidth - 4) {
                      break;
                    }
                    chunk = remainingWord.substring(0, i);
                  }

                  if (chunk.length === 0) {
                    chunk = remainingWord.substring(0, 1);
                  }

                  if (chunk.length < remainingWord.length) {
                    lines.push(chunk + '-');
                    remainingWord = remainingWord.substring(chunk.length);
                  } else {
                    currentLine = remainingWord;
                    remainingWord = '';
                  }
                }
              } else {
                const testLine = currentLine ? `${currentLine} ${word}` : word;
                const testWidth = pdf.getTextWidth(testLine);

                if (testWidth > maxWidth - 4) {
                  if (currentLine) lines.push(currentLine);
                  currentLine = word;
                } else {
                  currentLine = testLine;
                }
              }
            });

            if (currentLine) lines.push(currentLine);
            return lines.length > 0 ? lines : ['-'];
          };

          const drawTableHeader = async () => {
            pdf.setFontSize(8);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(55, 65, 81);

            let maxHeaderLines = 1;
            const headerTextsLines: string[][] = [];

            cols.forEach((col) => {
              const displayText = headerRenameMap[col] || col;
              const lines = splitTextToLines(displayText, colWidth);
              headerTextsLines.push(lines);
              maxHeaderLines = Math.max(maxHeaderLines, lines.length);
            });

            const lineHeight = 4;
            const padding = 4;
            const headerHeight = (maxHeaderLines * lineHeight) + padding;
            const headerStartY = currentY;

            pdf.setFillColor(249, 250, 251);
            pdf.setDrawColor(229, 231, 235);
            pdf.setLineWidth(0.3);
            pdf.rect(margin, headerStartY, contentWidth, headerHeight, 'FD');

            for (let i = 1; i < numCols; i++) {
              pdf.line(
                margin + (i * colWidth),
                headerStartY,
                margin + (i * colWidth),
                headerStartY + headerHeight
              );
            }

            headerTextsLines.forEach((lines, idx) => {
              const xPos = margin + (idx * colWidth) + 2;
              const totalTextHeight = lines.length * lineHeight;
              const verticalOffset = (headerHeight - totalTextHeight) / 2;
              let yPos = headerStartY + verticalOffset + 3;

              lines.forEach((line) => {
                pdf.text(line, xPos, yPos);
                yPos += lineHeight;
              });
            });

            currentY += headerHeight;
          };

          if (currentY > pageHeight - margin - 10) {
            pdf.addPage();
            await addPageHeaderImage();
          }
          await drawTableHeader();

          for (const row of normalizedData) {
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(7);
            pdf.setTextColor(17, 24, 39);

            let maxLines = 1;
            const cellsLines: string[][] = [];

            cols.forEach((col) => {
              let text = row[col];
              if (text == null) text = '—';

              const colLower = col.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              if (colLower.includes('fecha') || colLower.includes('vencimiento') ||
                colLower.includes('publicacion') || colLower.includes('desde') ||
                colLower.includes('hasta') || col === 'Fecha Desde' || col === 'Desde' || col === 'Hasta') {
                text = formatDate(text);
              }

              const tablasConFormateoMonto = [
                'Multas Laborales',
                'Protestos y Morosidades',
                'Condenas por Prácticas Antisindicales',
                'Deuda Previsional Publicada',
              ];

              if (tablasConFormateoMonto.includes(sectionTitle) &&
                (colLower.includes('monto') || colLower.includes('multa'))) {
                const montoNumerico = typeof text === 'number'
                  ? text
                  : Number.parseFloat(String(text).replace(/[^0-9.-]/g, '')) || 0;
                text = '$' + Math.round(montoNumerico).toLocaleString('es-CL');
              }

              text = String(text);
              const lines = splitTextToLines(text, colWidth);
              cellsLines.push(lines);
              maxLines = Math.max(maxLines, lines.length);
            });

            const lineHeight = 5;
            const padding = 4;
            const rowHeight = (maxLines * lineHeight) + padding;

            if (currentY + rowHeight > pageHeight - margin - 10) {
              pdf.addPage();
              await addPageHeaderImage();
              await drawTableHeader();

              pdf.setFont("helvetica", "normal");
              pdf.setFontSize(7);
              pdf.setTextColor(17, 24, 39);
            }

            const rowStartY = currentY;
            const rowIndex = normalizedData.indexOf(row);

            if (rowIndex % 2 === 0) {
              pdf.setFillColor(255, 255, 255);
            } else {
              pdf.setFillColor(249, 250, 251);
            }

            pdf.setDrawColor(229, 231, 235);
            pdf.setLineWidth(0.3);
            pdf.rect(margin, rowStartY, contentWidth, rowHeight, 'FD');

            for (let i = 1; i < numCols; i++) {
              pdf.line(
                margin + (i * colWidth),
                rowStartY,
                margin + (i * colWidth),
                rowStartY + rowHeight
              );
            }

            cellsLines.forEach((lines, idx) => {
              const xPos = margin + (idx * colWidth) + 2;
              const totalTextHeight = lines.length * lineHeight;
              const verticalOffset = (rowHeight - totalTextHeight) / 2;
              let yPos = rowStartY + verticalOffset + 3;

              lines.forEach((line) => {
                pdf.text(line, xPos, yPos);
                yPos += lineHeight;
              });
            });

            currentY += rowHeight;
          }

          currentY += 10;
        }
      }

      // ====== MALLA RELACIONAL AL FINAL DEL PDF ======
      if (deferredMeshEl) {
        if (currentY + 20 > pageHeight - margin - 15) {
          pdf.addPage();
          await addPageHeaderImage();
        }


        // Círculo azul (bullet)
        pdf.setFillColor(59, 130, 246);
        pdf.circle(margin + 2, currentY - 1.5, 2.5, "F");

        // Texto del título
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(59, 130, 246);
        pdf.text("Malla Relacional Detalles", margin + 7, currentY);
        currentY += 7;



        // Capturar encabezado del MeshTable (sin tablas)
        const meshClone = deferredMeshEl.cloneNode(true) as HTMLElement;
        meshClone.querySelectorAll('table, .overflow-x-auto').forEach(el => el.remove());
        meshClone.querySelectorAll('p.text-xs').forEach(el => el.remove());
        const meshHeaderImg = await captureElementInIframe(meshClone);
        const mhImgEl = new Image();
        await new Promise((resolve) => { mhImgEl.onload = resolve; mhImgEl.src = meshHeaderImg; });
        const mhH = (mhImgEl.height * contentWidth) / mhImgEl.width;
        if (mhH > 5) {
          if (currentY + mhH > pageHeight - margin - 15) { pdf.addPage(); await addPageHeaderImage(); }
          pdf.addImage(meshHeaderImg, 'JPEG', margin, currentY, contentWidth, mhH);
          currentY += mhH + 3;
        }

        // Renderizar cada tabla fila por fila
        const meshTables = Array.from(deferredMeshEl.querySelectorAll('table')) as HTMLTableElement[];

        for (const meshTable of meshTables) {
          const thead = meshTable.querySelector('thead');
          const rows = Array.from(meshTable.querySelectorAll('tbody tr')) as HTMLElement[];
          if (!thead || rows.length === 0) continue;

          const makeHeaderTable = (): HTMLTableElement => {
            const t = document.createElement('table');
            t.style.cssText = 'width:1180px;border-collapse:collapse;table-layout:fixed;font-size:13px;';
            const colgroup = meshTable.querySelector('colgroup');
            if (colgroup) t.appendChild(colgroup.cloneNode(true));
            t.appendChild(thead.cloneNode(true));
            return t;
          };

          // Capturar y pegar el header inicial
          const h0Img = await captureElementInIframe(makeHeaderTable());
          const h0ImgEl = new Image();
          await new Promise((resolve) => { h0ImgEl.onload = resolve; h0ImgEl.src = h0Img; });
          const h0H = (h0ImgEl.height * contentWidth) / h0ImgEl.width;
          if (currentY + h0H > pageHeight - margin - 10) { pdf.addPage(); await addPageHeaderImage(); }
          pdf.addImage(h0Img, 'JPEG', margin, currentY, contentWidth, h0H);
          currentY += h0H;

          // Capturar cada fila individualmente
          for (const row of rows) {
            const rowTable = document.createElement('table');
            rowTable.style.cssText = 'width:1180px;border-collapse:collapse;table-layout:fixed;font-size:13px;';
            const colgroup = meshTable.querySelector('colgroup');
            if (colgroup) rowTable.appendChild(colgroup.cloneNode(true));
            const tbody = document.createElement('tbody');
            tbody.appendChild(row.cloneNode(true));
            rowTable.appendChild(tbody);

            const rImg = await captureElementInIframe(rowTable);
            const rImgEl = new Image();
            await new Promise((resolve) => { rImgEl.onload = resolve; rImgEl.src = rImg; });
            const rH = (rImgEl.height * contentWidth) / rImgEl.width;

            if (currentY + rH > pageHeight - margin - 10) {
              pdf.addPage();
              await addPageHeaderImage();
              // Repetir el header en la nueva página
              const hRepImg = await captureElementInIframe(makeHeaderTable());
              const hRepImgEl = new Image();
              await new Promise((resolve) => { hRepImgEl.onload = resolve; hRepImgEl.src = hRepImg; });
              const hRepH = (hRepImgEl.height * contentWidth) / hRepImgEl.width;
              pdf.addImage(hRepImg, 'JPEG', margin, currentY, contentWidth, hRepH);
              currentY += hRepH;
            }

            pdf.addImage(rImg, 'JPEG', margin, currentY, contentWidth, rH);
            currentY += rH;
          }

          currentY += 6; // espacio entre tablas
        }
      }
      // ====== FIN MALLA RELACIONAL ======

      pdf.save(`Fast_Check_Duxiter_${new Date().toISOString().slice(0, 10)}-${companyData.rut}.pdf`);

      if (inicioActividadesSection) {
        inicioActividadesSection.style.display = inicioActividadesOriginalDisplay;
      }

      setExpandedSections(currentExpandedState);
      toast.success("PDF generado");

    } catch (error) {
      console.error(error);
      toast.error("Error generando PDF");
    } finally {
      setExportingPdf(false);
    }
  };




  if (loading && !data) {
    return (
      <PageLayout title={t('fastCheck.title')} showBackButton={true}>
        <div className="mb-4 text-sm text-gray-600 dark:text-gray-300">{t('common.loading')}</div>
        <div className="mb-6 bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
            <div
              className={`${progressBarClass} transition-all duration-300`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
            <span>{progressPercent}% — {currentStepLabel}</span>
            {isRefreshing && <span>{t('fastCheck.progress.inProgress')}</span>}
          </div>
          <div className="mt-4 flex items-center gap-4 flex-wrap">
            {progressSteps.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <div className={
                  s.status === 'done' ? 'w-3 h-3 rounded-full bg-green-500' :
                    s.status === 'in_progress' ? 'w-3 h-3 rounded-full bg-blue-500 animate-pulse' :
                      s.status === 'error' ? 'w-3 h-3 rounded-full bg-red-500' :
                        'w-3 h-3 rounded-full bg-gray-300 dark:bg-gray-600'
                } />
                <span className="text-sm text-gray-800 dark:text-gray-200">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </PageLayout>
    );
  }

  if (!data) {
    return <PageLayout title={t('fastCheck.title')} showBackButton={true}><div>{t('fastCheck.noData')}</div></PageLayout>;
  }

  logger.log(158, "riskSummary", riskSummary);
  // Count parameters by risk level

  const criticalParams = riskSummary.riskSummary.totalSevero;





  const highParams = riskSummary.riskSummary.totalSignificativo;





  // Fix: lowParams should be total parameters minus all detected risks
  const lowParams = riskSummary.riskSummary.totalParameters - riskSummary.riskSummary.totalDetected;
  const companyGeneralInfo = data.companyGeneralInfo;
  //logger.log(240, "companyGeneralInfo", companyGeneralInfo);

  // Compute principales hallazgos
  const allRules = [
    ...(riskSummary.allRules?.complianceRules || []),
    ...(riskSummary.allRules?.legalRules || []),
    ...(riskSummary.allRules?.capitalHumanoRules || []),
    ...(riskSummary.allRules?.financieroTributarioRules || []),
  ];
  const ruleFindings = allRules
    .filter(r => r.detected && (r.risk === 'critico' || r.risk === 'alto'))
    .map(r => ({ type: 'rule', severity: r.risk, label: r.label, impacto: r.impacto }));
  const auxFindings: { type: string; severity: string; label: string; impacto?: string }[] = [];


  const terminoGiroSii = (() => {
    const paths = [
      data?.logEntry?.summaryData?.data?.sii,
      data?.sheriffLogData?.summaryData?.data?.sii,
      data?.details?.sii,
      data?.riskAssessment?.sii,
    ];
    for (const p of paths) {
      if (p && typeof p === 'object') return p;
    }
    return null;
  })();
  const formatCLP = (v: number | string) => {
    const n = typeof v === 'string' ? Number(v) : v;
    try {
      return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
    } catch {
      return `${n ?? 0}`;
    }
  };

  const _mapFinancialSeverity = (level: string) => {
    const l = (level || '').toLowerCase();
    if (l === 'critical') return 'critico';
    if (l === 'high') return 'alto';
    if (l === 'medium') return 'medio';
    return 'info';
  };
  const _translateRiskLevel = (level: string) => {
    switch (level) {
      case 'Critical': return 'Crítico';
      case 'High': return 'Alto';
      case 'Medium': return 'Medio';
      case 'Low': return 'Bajo';
      default: return level;
    }
  };

  if (pepEvaluationSummary.pepChileDetected) {
    auxFindings.push({ type: 'pep', severity: 'critico', label: t('fastCheck.findings.pepChileDetectedInPartners') });
  }
  if (pepEvaluationSummary.familiaresPepDetected) {
    auxFindings.push({ type: 'pep', severity: 'alto', label: t('fastCheck.findings.familiaresPepDetectedInPartners') });
  }
  if (listasPropias.altoImpacto.length > 0) {
    auxFindings.push({ type: 'listas', severity: 'critico', label: t('fastCheck.findings.rutInAltoImpacto', { count: listasPropias.altoImpacto.length }) });
  }
  if (listasPropias.medioImpacto.length > 0) {
    auxFindings.push({ type: 'listas', severity: 'alto', label: t('fastCheck.findings.rutInMedianoImpacto', { count: listasPropias.medioImpacto.length }) });
  }
  // Exclude financial AI analysis from principales hallazgos
  // (previously added as type 'financial' with a label)
  // if (financialRisk) {
  //   auxFindings.push({
  //     type: 'financial',
  //     severity: mapFinancialSeverity(financialRisk.riskLevel),
  //     label: `Análisis Financiero AI: ${translateRiskLevel(financialRisk.riskLevel)}${typeof financialRisk.riskScore === 'number' ? ` (puntaje ${financialRisk.riskScore})` : ''}`
  //   });
  // }
  const findings = [...auxFindings, ...ruleFindings].sort((a, b) => {
    const order: Record<string, number> = { critico: 1, alto: 2, medio: 3, info: 4 };
    return (order[a.severity] || 99) - (order[b.severity] || 99);
  });

  const showHallazgos = false;

  logger.log("riskSummary.allRules complianceRules body", riskSummary.allRules?.complianceRules || []);
  return (

    <PageLayout title={""}/* title={t('fastCheck.title')} */ showBackButton={false}>
      <div className="mb-4 flex justify-between items-center">
        <div>
          <button
            onClick={handleRefresh}
            disabled={loading || !rut.trim()}
            className="ml-2 p-2 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {t('fastCheck.actions.refresh')}
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportPDF}
            disabled={exportingPdf || loading || !data}
            className="p-2 bg-green-600 text-white rounded flex items-center gap-2 hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            <Download size={18} />
            {exportingPdf ? t('fastCheck.exportPdf.generating') : t('fastCheck.actions.exportPdf')}
          </button>
          {exportJsonEnabled && (
            <button
              onClick={handleExportJSON}
              disabled={loading || !data}
              className="p-2 bg-purple-600 text-white rounded flex items-center gap-2 hover:bg-purple-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              <FileText size={18} />
              {t('fastCheck.actions.exportJson')}
            </button>
          )}
        </div>
      </div>

      {/* Progress steps UI */}
      <div className="mb-6 bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        {/* Linear progress bar with percentage */}
        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
          <div
            className={`${progressBarClass} transition-all duration-300`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
          <span>{progressPercent}% — {currentStepLabel}</span>
          {isRefreshing && <span>{t('fastCheck.progress.inProgress')}</span>}
        </div>

        {/* Step dots */}
        <div className="mt-4 flex items-center gap-4 flex-wrap">
          {progressSteps.map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <div className={
                s.status === 'done' ? 'w-3 h-3 rounded-full bg-green-500' :
                  s.status === 'in_progress' ? 'w-3 h-3 rounded-full bg-blue-500 animate-pulse' :
                    s.status === 'error' ? 'w-3 h-3 rounded-full bg-red-500' :
                      'w-3 h-3 rounded-full bg-gray-300 dark:bg-gray-600'
              } />
              <span className="text-sm text-gray-800 dark:text-gray-200">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <h1 className="text-3xl p-2 font-semibold text-blue-500 text-center">Fast Check</h1>

      <div className="space-y-6" ref={reportRef}>



        <RuleDetailsModal
          isOpen={showRuleDetailsModal}
          onClose={() => {
            setShowRuleDetailsModal(false);
            setRuleDetailsFilter('');
            setRuleDetailsSortKey(null);
            setRuleDetailsSortDir('asc');
          }}
          title={ruleDetailsTitle}
          content={ruleDetailsContent}
          filter={ruleDetailsFilter}
          onFilterChange={setRuleDetailsFilter}
          sortKey={ruleDetailsSortKey}
          sortDir={ruleDetailsSortDir}
          onSort={(key) => {
            if (ruleDetailsSortKey === key) {
              setRuleDetailsSortDir(ruleDetailsSortDir === 'asc' ? 'desc' : 'asc');
            } else {
              setRuleDetailsSortKey(key);
              setRuleDetailsSortDir('asc');
            }
          }}
          onExportCSV={handleExportCSVDetails}
          onExportXLSX={handleExportXLSXDetails}
          headerRenameMap={headerRenameMap}
          columnOrder={ruleDetailsColumnOrder}
        />





        {/* Resultado Evaluación */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow dark:shadow-gray-700">
          <div className="flex items-center mb-4">
            <div className="w-8 h-8 bg-blue-500 rounded-full text-white flex items-center justify-center mr-2">
              <span></span>
            </div>
            <h2 className="text-xl font-bold text-blue-500 dark:text-blue-400">Resultado Evaluación</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 ">
            <div className="border-r pr-2 flex flex-col items-start justify-end">
              <p className="font-bold dark:text-white">Razón Social:</p>
              <p className="text-xl dark:text-gray-300">{companyData.razonSocial}</p>
            </div>
            <div className="border-r pr-2 flex flex-col items-start justify-end">
              <p className="font-bold dark:text-white">Rut / ID:</p>
              <p className="text-xl dark:text-gray-300">{companyData.rut}</p>
            </div>
            <div className="border-r pr-2 flex flex-col items-start justify-end">
              <p className="font-bold dark:text-white">Fecha Evaluación:</p>
              <p className="text-xl dark:text-gray-300">{companyData.fechaEvaluacion}</p>
            </div>
            <div className="flex flex-col items-center justify-center">
              <div className={`w-16 h-16 rounded-full ${getSemaphoreColor(calculateSemaphore(count))}`}></div>
              <p className="font-bold mt-2 dark:text-white">Resultado:</p>
              <p className="dark:text-gray-300">
                {calculateSemaphore(count) === 'red' ? 'Riesgo Crítico' :
                  calculateSemaphore(count) === 'orange' ? 'Riesgo Alto' :
                    calculateSemaphore(count) === 'yellow' ? 'Riesgo Medio' :
                      'Riesgo Bajo'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg flex items-center">
              <div className="w-8 h-8 bg-red-500 rounded-full mr-2"></div>
              <div>
                <p className="font-bold dark:text-white">{count?.criticalParams}</p>
                <p className="text-sm dark:text-gray-300"># PARÁMETROS RIESGO CRÍTICO</p>
              </div>
            </div>
            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg flex items-center">
              <div className="w-8 h-8 bg-orange-500 rounded-full mr-2"></div>
              <div>
                <p className="font-bold dark:text-white">{count?.highParams}</p>
                <p className="text-sm dark:text-gray-300"># PARÁMETROS RIESGO ALTO</p>
              </div>
            </div>
            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg flex items-center">
              <div className="w-8 h-8 bg-green-500 rounded-full mr-2"></div>
              <div>
                <p className="font-bold dark:text-white">{count?.lowParams}</p>
                <p className="text-sm dark:text-gray-300"># PARÁMETROS SIN RIESGO</p>
              </div>
            </div>
          </div>
        </div>

        {/* Parámetros Evaluados - Accordion */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow dark:shadow-gray-700">
          <div
            className="flex items-center justify-between mb-4 cursor-pointer"
            onClick={() => toggleSection('parametros')}
          >
            <div className="flex items-center">
              <div className="w-8 h-8 bg-blue-500 rounded-full text-white flex items-center justify-center mr-2">
                <span></span>
              </div>
              <h2 className="text-xl font-bold text-blue-500 dark:text-blue-400">Parámetros Evaluados</h2>
            </div>
            {expandedSections.parametros ?
              <ChevronUp className="h-6 w-6 text-blue-500" /> :
              <ChevronDown className="h-6 w-6 text-blue-500" />
            }
          </div>

          {expandedSections.parametros && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 ">
              {/* 
            
              <TableAssessment
                title="Compliance"
                dataTitle={["Parámetro", "Impacto", "Detectado", "Riesgo", "Detalles"]}
                data={(riskSummary.allRules?.complianceRules || []).map(rule => ({
                  label: rule.label,
                  impacto: rule.impacto,
                  detected: rule.risk === 'no_disponible' ? null : rule.detected,
                  risk: rule.risk,
                  details: rule.details,
                  showDetails: ['Quiebra Judicial', 'Término de Giro', 'Contribuyente de difícil fiscalización'].includes(rule.label) ||
                    (rule.details && (
                      (Array.isArray(rule.details) && rule.details.length > 0) ||
                      (typeof rule.details === 'object' && rule.details !== null && Object.keys(rule.details).length > 0)
                    ))
                }))}
                getImpactColor={getImpactColor}
                getTooltip={(label) => getTooltip("Compliance", label)}
                onShowDetails={(title, details) => {
                  setRuleDetailsTitle(title);
                  setRuleDetailsContent(details);
                  setShowRuleDetailsModal(true);
                }}
              />

         
                <TableAssessment
                  title="Legal"
                  dataTitle={["Parámetro", "Impacto", "Detectado", "Riesgo", "Detalles"]}
                  data={(riskSummary.allRules?.legalRules || []).map(rule => {
                    const isTrueValue = (val: any): boolean => {
                      if (val === true) return true;
                      if (typeof val === 'string') {
                        const lower = val.toLowerCase().trim();
                        return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'si' || lower === 'sí';
                      }
                      if (typeof val === 'number') return val === 1;
                      return false;
                    };

                    let dataDetails = rule.details;
                    if (isTrueValue(dataDetails)) {
                      dataDetails = [];
                    }

                    const hasDetails = ['Contribuyente de difícil fiscalización'].includes(rule.label) ||
                      (dataDetails && (
                        (Array.isArray(dataDetails) && dataDetails.length > 0) ||
                        (typeof dataDetails === 'object' && dataDetails !== null && Object.keys(dataDetails).length > 0)
                      ));

                    return {
                      label: rule.label,
                      impacto: rule.impacto,
                      detected: rule.detected,
                      risk: rule.risk,
                      details: rule.details,
                      showDetails: hasDetails
                    };
                  })}
                  getImpactColor={getImpactColor}
                  getTooltip={(label) => getTooltip("Legal", label)}
                  onShowDetails={(title, details) => {
                    setRuleDetailsTitle(title);
                    setRuleDetailsContent(details);
                    setShowRuleDetailsModal(true);
                  }}
                />
                <TableAssessment
                  title="Antecedentes Penales"
                  dataTitle={["Parámetro", "Impacto", "Detectado", "Riesgo", "Detalles"]}
                  data={(() => {
                    // Acceder a los datos desde la estructura correcta
                    const todasCoincidencias = data?.sheriffLogData?.filteredDetails?.compliance?.penal?.coincidencias ||
                      data?.details?.sheriffLogData?.filteredDetails?.compliance?.penal?.coincidencias ||
                      data?.logEntry?.filteredDetails?.compliance?.penal?.coincidencias ||
                      [];

                    // Filtrar solo Demandado, Querellado y Denunciado
                    const coincidenciasFiltradas = todasCoincidencias.filter((item: any) => {
                      const postura = item?.postura?.toLowerCase() || '';
                      return postura === 'demandado' ||
                        postura === 'querellado' ||
                        postura === 'denunciado';
                    });

                    const hasCoincidencias = coincidenciasFiltradas.length > 0;

                    return [{
                      label: "Causas Penales",
                      impacto: "signifiactivo",
                      detected: hasCoincidencias,
                      risk: hasCoincidencias ? "alto" : "bajo",
                      details: coincidenciasFiltradas,  // ← con litigantes incluido
                      showDetails: hasCoincidencias
                    }];
                  })()}
                  getImpactColor={getImpactColor}
                  onShowDetails={(title, details) => {
                    setRuleDetailsTitle(title);
                    setRuleDetailsContent(details);
                    setShowRuleDetailsModal(true);
                  }}
                />
              </div>
           
              <TableAssessment
                title="Capital Humano"
                dataTitle={["Parámetro", "Impacto", "Detectado", "Riesgo", "Detalles"]}
                data={(riskSummary.allRules?.capitalHumanoRules || []).map(rule => {
                  let dataRisk = rule.risk;
                  let detectedValue = rule.detected;
                  let detailsContent = rule.details;

                  // Fix para Deuda Previsional Presunta
                  if (rule.label === "Deuda Previsional Presunta") {
                    const hasCases = rule.details?.casos?.length > 0;
                    if (hasCases) {
                      dataRisk = "alto";
                      detectedValue = true;
                    } else {
                      dataRisk = "bajo";
                      detectedValue = false;
                    }
                    detailsContent = rule.details?.casos ?? rule.details;
                  }

                  // Fix para Término de Giro
                  let dataToCheck = rule.details;
                  if (rule.label === "Deuda Previsional Presunta" && rule.details?.casos) {
                    dataToCheck = rule.details?.casos;
                  }
                  if (rule.label === "Término de Giro") {
                    dataToCheck = null;
                  }

                  const hasDetails = ['Quiebra Judicial', 'Término de Giro', 'Contribuyente de difícil fiscalización'].includes(rule.label) ||
                    (dataToCheck && (
                      (Array.isArray(dataToCheck) && dataToCheck.length > 0) ||
                      (typeof dataToCheck === 'object' && dataToCheck !== null && Object.keys(dataToCheck).length > 0)
                    ));

                  return {
                    label: rule.label,
                    impacto: rule.impacto,
                    detected: detectedValue,
                    risk: dataRisk,
                    details: detailsContent,
                    showDetails: hasDetails
                  };
                })}
                getImpactColor={getImpactColor}
                onShowDetails={(title, details) => {
                  setRuleDetailsTitle(title);
                  setRuleDetailsContent(details);
                  setShowRuleDetailsModal(true);
                }}
              />

      
              <TableAssessment
                title="Financiero - Tributario"
                dataTitle={["Parámetro", "Impacto", "Detectado", "Riesgo", "Detalles"]}
                data={(riskSummary.allRules?.financieroTributarioRules || []).map(rule => {
                  // Invertir detectado para "Inicio de Actividades"
                  const detectedDisplay = rule.risk === 'no_disponible'
                    ? null
                    : rule.label === 'Inicio de Actividades'
                      ? !rule.detected
                      : rule.detected;

                  const hasDetails = rule.details && (
                    (Array.isArray(rule.details) && rule.details.length > 0) ||
                    (typeof rule.details === 'object' && rule.details !== null && Object.keys(rule.details).length > 0)
                  );

                  return {
                    label: rule.label,
                    impacto: rule.impacto,
                    detected: detectedDisplay,
                    risk: rule.risk,
                    details: rule.details,
                    showDetails: hasDetails
                  };
                })}
                getImpactColor={getImpactColor}
                getTooltip={(label) => getTooltip("Financiero - Tributario", label)}
                onShowDetails={(title, details) => {
                  setRuleDetailsTitle(title);
                  setRuleDetailsContent(details);
                  setShowRuleDetailsModal(true);
                }}
              />
 */}


              <TableAssessment
                titleTooltip="Evalúa riesgos penales y de integridad asociados al tercero crítico que pueden generar impactos legales o reputacionales relevantes para la organización."
                title="Integridad, Ética y Riesgo Penal"
                dataTitle={["Parámetro", "Impacto", "Detectado", "Riesgo", "Detalles"]}
                data={[
                  ...(getIntegridadComplianceRules(riskSummary.allRules?.complianceRules || []))
                    .map(rule => ({
                      label: rule.label === 'Condenas Ley 21.121' ? 'Inhabilitación Estado – Ley 21.121' :
                        rule.label === 'Condenas Ley 20.393' ? 'Inhabilitación Estado – Ley 20.393' :
                          rule.label,
                      impacto: rule.impacto,
                      detected: rule.risk === 'no_disponible' ? null : rule.detected,
                      risk: rule.risk,
                      details: rule.details,
                      showDetails: ['Quiebra Judicial', 'Término de Giro', 'Contribuyente de difícil fiscalización'].includes(rule.label) ||
                        Boolean(rule.details && (
                          (Array.isArray(rule.details) && rule.details.length > 0) ||
                          (typeof rule.details === 'object' && rule.details !== null && Object.keys(rule.details as any).length > 0)
                        ))
                    })),
                  // Causas Penales (antes en tabla Antecedentes Penales)
                  ...(() => {
                    const todasCoincidencias = data?.sheriffLogData?.filteredDetails?.compliance?.penal?.coincidencias ||
                      data?.details?.sheriffLogData?.filteredDetails?.compliance?.penal?.coincidencias ||
                      data?.logEntry?.filteredDetails?.compliance?.penal?.coincidencias ||
                      [];

                    const coincidenciasFiltradas = todasCoincidencias.filter((item: any) => {
                      const postura = item?.postura?.toLowerCase() || '';
                      return postura === 'demandado' ||
                        postura === 'querellado' ||
                        postura === 'denunciado';
                    });

                    const hasCoincidencias = coincidenciasFiltradas.length > 0;

                    return [{
                      label: "Causas Penales",
                      impacto: "severo",
                      detected: hasCoincidencias,
                      risk: hasCoincidencias ? "critico" : "bajo",
                      details: coincidenciasFiltradas,
                      showDetails: hasCoincidencias
                    }];
                  })()
                ]}
                getImpactColor={getImpactColor}
                getTooltip={(label) => {
                  // Mapear nombres nuevos a los originales para tooltips
                  const originalLabel = label === 'Inhabilitación Estado – Ley 21.121' ? 'Condenas Ley 21.121' :
                    label === 'Inhabilitación Estado – Ley 20.393' ? 'Condenas Ley 20.393' :
                      label;
                  return getTooltip("Compliance", originalLabel) || getTooltip("Integridad, Ética y Riesgo Penal", label) || `Información sobre ${label}`;
                }}
                onShowDetails={(title, details) => {
                  let filteredDetails = details;
                  if (title === 'Causas Penales' && Array.isArray(details)) {
                    filteredDetails = details.map(({ esDenunciado, ...rest }) => rest);
                  }


                  setRuleDetailsTitle(title);
                  setRuleDetailsContent(filteredDetails);
                  setRuleDetailsColumnOrder(columnasPermitidas[title] ?? []);
                  setShowRuleDetailsModal(true);
                }}
              />

              <TableAssessment
                titleTooltip="Evalúa procesos judiciales de carácter civil, laboral o concursal asociados al tercero crítico que puedan afectar su continuidad operativa o estabilidad contractual."
                title="Contingencias Judiciales"
                dataTitle={["Parámetro", "Impacto", "Detectado", "Riesgo", "Detalles"]}
                data={(riskSummary.allRules?.legalRules || []).map(rule => {
                  const isTrueValue = (val: any): boolean => {
                    if (val === true) return true;
                    if (typeof val === 'string') {
                      const lower = val.toLowerCase().trim();
                      return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'si' || lower === 'sí';
                    }
                    if (typeof val === 'number') return val === 1;
                    return false;
                  };

                  let dataDetails = rule.details;
                  if (isTrueValue(dataDetails)) {
                    dataDetails = [];
                  }

                  const hasDetails = ['Contribuyente de difícil fiscalización'].includes(rule.label) ||
                    (dataDetails && (
                      (Array.isArray(dataDetails) && dataDetails.length > 0) ||
                      (typeof dataDetails === 'object' && dataDetails !== null && Object.keys(dataDetails).length > 0)
                    ));

                  return {
                    label: rule.label,
                    impacto: rule.impacto,
                    detected: rule.detected,
                    risk: rule.risk,
                    details: rule.details,
                    showDetails: hasDetails
                  };
                })}
                getImpactColor={getImpactColor}
                getTooltip={(label) => getTooltip("Legal", label) || getTooltip("Legal y Judicial", label) || `Información sobre ${label}`}
                onShowDetails={(title, details) => {
                  setRuleDetailsTitle(title);
                  setRuleDetailsContent(details);
                  setRuleDetailsColumnOrder(columnasPermitidas[title] ?? []);
                  setShowRuleDetailsModal(true);
                }}
              />

              <TableAssessment
                titleTooltip="Actualmente analiza fuentes de prensa seleccionadas bajo criterios de relevancia y trazabilidad. La cobertura de medios y bases se encuentra en proceso de ampliación progresiva."
                title="Reputación y Conflictos de Interés"
                dataTitle={["Parámetro", "Impacto", "Detectado", "Riesgo", "Detalles"]}
                data={[
                  ...(riskSummary.allRules?.complianceRules || [])
                    .filter(rule => ['Listas Propias Alto Impacto', 'Listas Propias Mediano Impacto'].includes(rule.label))
                    .map((rule: any) => ({
                      label: rule.label,
                      impacto: rule.impacto,
                      detected: rule.risk === 'no_disponible' ? null : rule.detected,
                      risk: rule.risk,
                      details: rule.details,
                      showDetails: Boolean(rule.details && (
                        (Array.isArray(rule.details) && rule.details.length > 0) ||
                        (typeof rule.details === 'object' && rule.details !== null && Object.keys(rule.details as any).length > 0)
                      ))
                    })),
                  {
                    label: 'Reputación Pública y Mediática',
                    impacto: 'significativo',
                    detected: (() => {
                      const coincidencias = data?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
                        data?.details?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
                        data?.logEntry?.filteredDetails?.compliance?.noticias?.coincidencias ||
                        [];
                      return coincidencias.length > 0 ? true : null;
                    })(),
                    risk: (() => {
                      const coincidencias = data?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
                        data?.details?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
                        data?.logEntry?.filteredDetails?.compliance?.noticias?.coincidencias ||
                        [];
                      return coincidencias.length > 0 ? 'alto' : 'no_detectado';
                    })(),
                    details: data?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
                      data?.details?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
                      data?.logEntry?.filteredDetails?.compliance?.noticias?.coincidencias ||
                      [],
                    showDetails: (() => {
                      const coincidencias = data?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
                        data?.details?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
                        data?.logEntry?.filteredDetails?.compliance?.noticias?.coincidencias ||
                        [];
                      return Array.isArray(coincidencias) && coincidencias.length > 0;
                    })()
                  }
                ]}
                getImpactColor={getImpactColor}
                getTooltip={(label) =>
                  getTooltip("Reputación y Conflictos de Interés", label) ||
                  getTooltip("Compliance", label) ||
                  `Información sobre ${label}`
                }
                onShowDetails={(title, details) => {
                  setRuleDetailsTitle(title);
                  setRuleDetailsContent(details);
                  setRuleDetailsColumnOrder(columnasPermitidas[title] ?? []);
                  setShowRuleDetailsModal(true);
                }}
              />

              <TableAssessment
                titleTooltip="Evalúa riesgos ambientales y de sostenibilidad del tercero crítico que pueden afectar la continuidad operacional o el cumplimiento normativo."
                title="Ambiental y Sostenibilidad"
                dataTitle={["Parámetro", "Impacto", "Detectado", "Riesgo", "Detalles"]}
                data={(riskSummary.allRules?.complianceRules || [])
                  .filter(rule => ['Sanciones Medioambientales', 'Proceso Sanciones Medioambientales', 'Procesos Sanciones Medioambientales'].includes(rule.label))
                  .map(rule => ({
                    label: rule.label,
                    impacto: rule.impacto,
                    detected: rule.risk === 'no_disponible' ? null : rule.detected,
                    risk: rule.risk,
                    details: rule.details,
                    showDetails: Boolean(rule.details && (
                      (Array.isArray(rule.details) && rule.details.length > 0) ||
                      (typeof rule.details === 'object' && rule.details !== null && Object.keys(rule.details as any).length > 0)
                    ))
                  }))}
                getImpactColor={getImpactColor}
                getTooltip={(label) => getTooltip("Compliance", label) || getTooltip("Ambiental y Sostenibilidad", label) || `Información sobre ${label}`}
                onShowDetails={(title, details) => {
                  let filteredDetails = details;
                  if (title === 'Proceso Sanciones Medioambientales' && Array.isArray(details)) {
                    filteredDetails = details.map(({
                      latitud,
                      longitud,
                      fastCheckProcesoSancionatorio,
                      fastCheckSanciones,
                      procesoSancionId,
                      UnidadFiscalizable,
                      Nombre,
                      categoriaEconomicaNombre,
                      subCategoriaEconomicaNombre,
                      rut,
                      unidadFiscalizableId,
                      razonSocial,
                      lista,
                      nombre,
                      /* Rut, procesoSanciones id */
                      ...rest
                    }: any) => rest);
                  }
                  if (title === 'Sanciones Medioambientales' && Array.isArray(details)) {
                    filteredDetails = details.map((row: any) => {
                      const { Categoría, 'Multa UTA': multaUTA, multaTotalUTA, ...rest } = row;
                      const utaValue = multaUTA ?? multaTotalUTA;
                      return {
                        ...rest,
                        totalUTA: utaValue != null ? `${utaValue}` : '—',
                      };
                    });
                  }

                  setRuleDetailsTitle(title);
                  setRuleDetailsContent(filteredDetails);
                  setRuleDetailsColumnOrder(columnasPermitidas[title] ?? []);
                  setShowRuleDetailsModal(true);
                }}
              />

              <TableAssessment
                titleTooltip="Evalúa el cumplimiento laboral y previsional del tercero crítico y su impacto en la operación."
                title="Laboral y Capital Humano"
                dataTitle={["Parámetro", "Impacto", "Detectado", "Riesgo", "Detalles"]}
                data={(riskSummary.allRules?.capitalHumanoRules || []).map((rule) => {
                  let dataRisk = rule.risk;
                  let detectedValue = rule.detected;
                  let detailsContent: any = rule.details;

                  // Fix para Deuda Previsional Presunta
                  if (rule.label === "Deuda Previsional Presunta") {
                    const normalized = normalizeDetails(rule.details);
                    const hasCases = normalized.length > 0;
                    dataRisk = hasCases ? "alto" : "bajo";
                    detectedValue = hasCases;
                    detailsContent = normalized;
                  }

                  // Fix para dataToCheck
                  let dataToCheck = rule.label === "Deuda Previsional Presunta" ? detailsContent : rule.details;
                  if (rule.label === "Término de Giro") {
                    dataToCheck = null;
                  }

                  const hasDetails =
                    [
                      "Quiebra Judicial",
                      "Término de Giro",
                      "Contribuyente de difícil fiscalización",
                    ].includes(rule.label) ||
                    Boolean(
                      dataToCheck &&
                      ((Array.isArray(dataToCheck) && dataToCheck.length > 0) ||
                        (typeof dataToCheck === "object" &&
                          dataToCheck !== null &&
                          Object.keys(dataToCheck as any).length > 0))
                    );

                  return {
                    label: rule.label,
                    impacto: rule.impacto,
                    detected: detectedValue,
                    risk: dataRisk,
                    details: detailsContent,
                    showDetails: hasDetails,
                  };
                })}
                getImpactColor={getImpactColor}
                getTooltip={(label) =>
                  getTooltip("Laboral y Capital Humano", label) ||
                  `Información sobre ${label}`
                }
                onShowDetails={(title, details) => {
                  let processedDetails = details;

                  if (title === "Deuda Previsional Presunta") {
                    const casos = Array.isArray(details)
                      ? details
                      : (details as any)?.casos ?? [];
                    processedDetails = casos.map((row: any) => ({
                      RUT: row["Rut Afiliado"] ?? row.rutAfiliado ?? "—",
                      Nombre: row["Nombre Afiliado"] ?? row.nombreAfiliado ?? "—",
                      "Tipo Producto": row["Tipo Producto"] ?? row.tipoProducto ?? "—",
                      "Tipo Entidad": row["Tipo entidad"] ?? row.afp ?? "—",
                      Período: row["Periodo"] ?? row.periodo ?? "—",
                      "Fecha Carta": row["Fecha carta"] ?? row.fecha ?? "—",
                      Estado: row["Estado"] ?? row.estado ?? "—",
                      ID: row["ID"] ?? row.id ?? "—",
                    }));
                  }

                  setRuleDetailsTitle(title);
                  setRuleDetailsContent(processedDetails);
                  setRuleDetailsColumnOrder([]);
                  setShowRuleDetailsModal(true);
                }}
              />

              <TableAssessment
                title="Financiero y Tributario"
                titleTooltip="Analiza la situación financiera y tributaria del tercero crítico y su impacto en la estabilidad de la relación comercial."
                dataTitle={["Parámetro", "Impacto", "Detectado", "Riesgo", "Detalles"]}
                data={(riskSummary.allRules?.financieroTributarioRules || []).map(rule => {
                  if (rule.label === 'Protestos y Morosidades') {
                    const existingItems = Array.isArray(rule.details) ? rule.details : [];
                    /*   const icomItems = data?.sheriffLogData?.equifaxCommercialData?.credit?.debtsSummary?.icom?.commercialIcom ?? []; */
                    const combined = [...existingItems/* , ...icomItems */];
                    const hasAny = combined.length > 0;
                    return {
                      label: rule.label,
                      impacto: rule.impacto,
                      detected: hasAny ? true : rule.detected,
                      risk: hasAny ? 'alto' : rule.risk,
                      details: hasAny ? combined : rule.details,
                      showDetails: hasAny
                    };
                  }

                  const detectedDisplay = rule.risk === 'no_disponible'
                    ? null
                    : rule.label === 'Inicio de Actividades'
                      ? !rule.detected
                      : rule.detected;

                  const hasDetails = rule.details && (
                    (typeof rule.details === 'string' && rule.details.trim().length > 0) ||
                    (Array.isArray(rule.details) && rule.details.length > 0) ||
                    (typeof rule.details === 'object' && rule.details !== null && Object.keys(rule.details).length > 0)
                  );

                  return {
                    label: rule.label,
                    impacto: rule.impacto,
                    detected: detectedDisplay,
                    risk: rule.risk,
                    details: rule.details,
                    showDetails: hasDetails
                  };
                })}
                getImpactColor={getImpactColor}
                getTooltip={(label) => getTooltip("Financiero - Tributario", label) || getTooltip("Financiero y Tributario", label) || `Información sobre ${label}`}
                onShowDetails={(title, details) => {
                  let filteredDetails = details;
                  if (title === 'Protestos y Morosidades' && Array.isArray(details)) {
                    const keyMap: Record<string, string> = {
                      vencimiento: 'vencimiento',
                      expirationDate: 'vencimiento',
                      monto: 'monto',
                      unpaidAmount: 'monto',
                      tipoDeuda: 'tipoDeuda',
                      documentType: 'tipoDeuda',
                      publicacion: 'publicacion',
                    };
                    const colOrder = ['vencimiento', 'monto', 'tipoDeuda', 'publicacion'];
                    filteredDetails = details.map((row: any) => {
                      const filtered: Record<string, any> = {};
                      Object.keys(keyMap).forEach(srcKey => {
                        if (row[srcKey] !== undefined) {
                          filtered[keyMap[srcKey]] = row[srcKey];
                        }
                      });
                      return filtered;
                    });
                    setRuleDetailsTitle(title);
                    setRuleDetailsContent(filteredDetails);
                    setRuleDetailsColumnOrder(colOrder.filter(c => Object.keys(filteredDetails[0] ?? {}).includes(c)));
                    setShowRuleDetailsModal(true);
                    return;
                  }
                  setRuleDetailsTitle(title);
                  setRuleDetailsContent(filteredDetails);
                  setRuleDetailsColumnOrder(columnasPermitidas[title] ?? []);
                  setShowRuleDetailsModal(true);
                }}
              />

            </div>
          )}
        </div>

        {/* Información General - Accordion */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow dark:shadow-gray-700">
          <div
            className="flex items-center justify-between mb-4 cursor-pointer"
            onClick={() => toggleSection('informacion')}
          >
            <div className="flex items-center">
              <div className="w-8 h-8 bg-blue-500 rounded-full text-white flex items-center justify-center mr-2">
                <span></span>
              </div>
              <h2 className="text-xl font-bold text-blue-500 dark:text-blue-400">Información General</h2>
            </div>
            {expandedSections.informacion ?
              <ChevronUp className="h-6 w-6 text-blue-500" /> :
              <ChevronDown className="h-6 w-6 text-blue-500" />
            }
          </div>





          {expandedSections.informacion && (
            <div className="space-y-6">
              {/* Informazioni generali */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="font-bold dark:text-white">Tipo Persona:</p>
                  <p className="dark:text-gray-300">
                    {data?.details?.compliance?.tipoPersona === 'juridical' ? 'Persona Jurídica' : 'Persona Natural'}
                  </p>
                </div>
                <div>
                  <p className="font-bold dark:text-white">Fecha Constitución:</p>
                  <p className="dark:text-gray-300">{formatDateToDDMMYYYY(companyGeneralInfo.fechaDeConstitucion)}</p>
                </div>
                <div>
                  <p className="font-bold dark:text-white">Fecha Iniciación de Actividades:</p>
                  <p className="dark:text-gray-300">{formatDateToDDMMYYYY(companyGeneralInfo.inicioActividades)}</p>
                </div>
                <div>
                  <p className="font-bold dark:text-white">Tamaño Empresa:</p>
                  <p className="dark:text-gray-300">{companyGeneralInfo.tamanoEmpresa}</p>
                </div>
                <div>
                  <p className="font-bold dark:text-white">Rango Ventas UF:</p>
                  <p className="dark:text-gray-300">{companyGeneralInfo.rangoVentas}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-1 gap-6">

                {/*    <TableBasic
                  title="Representantes Legales"
                  columns={["Nombre", "Rut"]}
                  data={companyGeneralInfo.administradores.map((admin: any) => [
                    admin.name,
                    formatRut(admin.rut),
                  ])}
                /> */}

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold dark:text-white">Socios Historicos</h3>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        ({countEvaluatedAndSelectedSocios(sociosEvaluations)}/3 evaluados/seleccionados)
                      </span>
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {(() => {
                          const total = sociosEvaluations.filter(s => s.isSelected).length;
                          const done = sociosEvaluations.filter(s => s.isSelected && (s.status === 'completed' || s.previousEvaluation?.hasBeenEvaluated)).length;
                          const err = sociosEvaluations.filter(s => s.isSelected && s.status === 'error').length;
                          return `Avanzamento: ${done}/${total}${err > 0 ? `, errori: ${err}` : ''}`;
                        })()}
                      </span>
                    </div>
                    {sociosEvaluations.some(s => s.isSelected) && (
                      <button
                        onClick={evaluateSelectedSocios}
                        disabled={isEvaluatingSocios}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        {isEvaluatingSocios ? 'Evaluando...' : `Evaluar ${sociosEvaluations.filter(s => s.isSelected).length} Seleccionados`}
                      </button>
                    )}
                  </div>

                  {sociosEvaluations.length > 0 && (
                    <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        <strong>Nota:</strong> Puedes evaluar un máximo de 3 socios en total (incluyendo los ya evaluados) para verificar su estado PEP.
                      </p>
                    </div>
                  )}

                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-gray-700">
                        <th className="border dark:border-gray-600 p-2 text-left dark:text-white w-12">
                          <span className="sr-only">Seleccionar</span>
                          <FileText className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                        </th>
                        <th
                          className="border dark:border-gray-600 p-2 text-left dark:text-white cursor-pointer select-none"
                          onClick={() => {
                            if (sociosSortKey === 'name') {
                              setSociosSortDir(sociosSortDir === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSociosSortKey('name');
                              setSociosSortDir('asc');
                            }
                          }}
                        >
                          <span className="inline-flex items-center gap-1">
                            Nombre
                            {sociosSortKey === 'name' && (sociosSortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                          </span>
                        </th>
                        <th
                          className="border dark:border-gray-600 p-2 text-left dark:text-white cursor-pointer select-none"
                          onClick={() => {
                            if (sociosSortKey === 'rut') {
                              setSociosSortDir(sociosSortDir === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSociosSortKey('rut');
                              setSociosSortDir('asc');
                            }
                          }}
                        >
                          <span className="inline-flex items-center gap-1">
                            Rut
                            {sociosSortKey === 'rut' && (sociosSortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                          </span>
                        </th>
                        <th
                          className="border dark:border-gray-600 p-2 text-left dark:text-white cursor-pointer select-none"
                          onClick={() => {
                            if (sociosSortKey === 'estadoEvaluacion') {
                              setSociosSortDir(sociosSortDir === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSociosSortKey('estadoEvaluacion');
                              setSociosSortDir('asc');
                            }
                          }}
                        >
                          <span className="inline-flex items-center gap-1">
                            Estado Evaluación
                            {sociosSortKey === 'estadoEvaluacion' && (sociosSortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                          </span>
                        </th>
                        <th
                          className="border dark:border-gray-600 p-2 text-left dark:text-white cursor-pointer select-none"
                          onClick={() => {
                            if (sociosSortKey === 'estadoPep') {
                              setSociosSortDir(sociosSortDir === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSociosSortKey('estadoPep');
                              setSociosSortDir('asc');
                            }
                          }}
                        >
                          <span className="inline-flex items-center gap-1">
                            Estado PEP
                            {sociosSortKey === 'estadoPep' && (sociosSortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let sortedSocios = [...sociosEvaluations];
                        if (sociosSortKey) {
                          sortedSocios.sort((a, b) => {
                            let aVal = '';
                            let bVal = '';

                            if (sociosSortKey === 'name' || sociosSortKey === 'rut') {
                              aVal = String(a[sociosSortKey as keyof SocioEvaluation] ?? '');
                              bVal = String(b[sociosSortKey as keyof SocioEvaluation] ?? '');
                            } else if (sociosSortKey === 'estadoEvaluacion') {
                              aVal = a.previousEvaluation?.hasBeenEvaluated ? 'Ya evaluado' : 'No evaluado';
                              bVal = b.previousEvaluation?.hasBeenEvaluated ? 'Ya evaluado' : 'No evaluado';
                            } else if (sociosSortKey === 'estadoPep') {
                              aVal = a.evaluationResult?.hasPepChile ? 'PEP Chile' : a.evaluationResult?.hasFamiliaresPep ? 'Familiares PEP' : 'No evaluado';
                              bVal = b.evaluationResult?.hasPepChile ? 'PEP Chile' : b.evaluationResult?.hasFamiliaresPep ? 'Familiares PEP' : 'No evaluado';
                            }

                            const cmp = aVal.localeCompare(bVal, undefined, { sensitivity: 'base' });
                            return sociosSortDir === 'asc' ? cmp : -cmp;
                          });
                        }
                        return (exportingPdf ? sortedSocios.slice(0, 25) : sortedSocios);
                      })().map((socioEval, index) => {
                        logger.log(`Rendering row ${index}: RUT=${socioEval.rut}, Name=${socioEval.name}, isSelected=${socioEval.isSelected}`);
                        const totalCount = countEvaluatedAndSelectedSocios(sociosEvaluations);
                        const naturalCheck = socioEval.isNaturalPerson ?? inferIsNaturalFromRut(socioEval.rut);
                        const isDisabled = socioEval.isEvaluating ||
                          (!socioEval.isSelected && totalCount >= 3) ||
                          (socioEval.previousEvaluation?.hasBeenEvaluated || !!socioEval.evaluationResult) ||
                          (naturalCheck !== true);
                        return (
                          <tr key={`socio-${socioEval.rut}`} className={index % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800' : 'dark:bg-gray-900'}>
                            <td className="border dark:border-gray-600 p-2 w-12">
                              <input
                                type="checkbox"
                                checked={socioEval.isSelected}
                                onChange={(e) => {
                                  logger.log(`Checkbox clicked for RUT: ${socioEval.rut}, Name: ${socioEval.name}`);
                                  toggleSocioSelection(socioEval.rut);
                                }}
                                disabled={isDisabled}
                                className={`w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 ${isDisabled && !socioEval.isSelected ? 'opacity-50 cursor-not-allowed' : ''}`}
                              />
                            </td>
                            <td className="border dark:border-gray-600 p-2 dark:text-gray-300">
                              <div className="flex items-center gap-2">
                                <span>{socioEval.name}</span>
                                {(() => {
                                  const nCheck = socioEval.isNaturalPerson ?? inferIsNaturalFromRut(socioEval.rut);
                                  const label = nCheck === true ? 'Natural' : nCheck === false ? 'Jurídica' : 'Desconocido';
                                  const cls = nCheck === true
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                    : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
                                  return (
                                    <span className={`inline-block text-xs px-2 py-1 rounded ${cls}`} title={label}>
                                      {label}
                                    </span>
                                  );
                                })()}
                              </div>
                            </td>
                            <td className="border dark:border-gray-600 p-2 dark:text-gray-300">
                              {socioEval.rut ? (
                                <div className="flex items-center gap-2">
                                  <span>{formatChileanRut(socioEval.rut)}</span>
                                  {socioEval.rutFoundAutomatically && (
                                    <span
                                      className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded dark:bg-green-900 dark:text-green-300"
                                      title="RUT trovato automaticamente nei dati esterni"
                                    >
                                      Auto
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-500 italic">Sin RUT</span>
                              )}
                            </td>
                            <td className="border dark:border-gray-600 p-2">
                              {socioEval.previousEvaluation?.hasBeenEvaluated ? (
                                <div className="space-y-1">
                                  <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded dark:bg-blue-900 dark:text-blue-300">
                                    Ya evaluado
                                  </span>
                                  {socioEval.previousEvaluation.evaluationDate && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                      {new Date(socioEval.previousEvaluation.evaluationDate).toLocaleDateString('it-IT')}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-500 dark:text-gray-400 text-xs">No evaluado</span>
                              )}
                            </td>
                            <td className="border dark:border-gray-600 p-2">
                              {socioEval.isEvaluating ? (
                                <span className="text-blue-600 dark:text-blue-400">Evaluando...</span>
                              ) : socioEval.evaluationResult ? (
                                <div className="space-y-1">
                                  {socioEval.evaluationResult.hasPepChile && (
                                    <span className="inline-block bg-red-100 text-red-800 text-xs px-2 py-1 rounded dark:bg-red-900 dark:text-red-300">
                                      PEP Chile
                                    </span>
                                  )}
                                  {socioEval.evaluationResult.hasFamiliaresPep && (
                                    <span className="inline-block bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded dark:bg-orange-900 dark:text-orange-300 ml-1">
                                      Familiares PEP
                                    </span>
                                  )}
                                  {!socioEval.evaluationResult.hasPepChile && !socioEval.evaluationResult.hasFamiliaresPep && (
                                    <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded dark:bg-green-900 dark:text-green-300">
                                      Sin PEP
                                    </span>
                                  )}
                                </div>
                              ) : socioEval.previousEvaluation?.hasBeenEvaluated ? (
                                <div className="space-y-1">
                                  {socioEval.previousEvaluation.hasPepChile && (
                                    <span className="inline-block bg-red-100 text-red-800 text-xs px-2 py-1 rounded dark:bg-red-900 dark:text-red-300">
                                      PEP Chile
                                    </span>
                                  )}
                                  {socioEval.previousEvaluation.hasFamiliaresPep && (
                                    <span className="inline-block bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded dark:bg-orange-900 dark:text-orange-300 ml-1">
                                      Familiares PEP
                                    </span>
                                  )}
                                  {!socioEval.previousEvaluation.hasPepChile && !socioEval.previousEvaluation.hasFamiliaresPep && (
                                    <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded dark:bg-green-900 dark:text-green-300">
                                      Sin PEP
                                    </span>
                                  )}
                                  {socioEval.status === 'error' && (
                                    <div className="text-xs text-red-600 dark:text-red-400 mt-1">Errore valutazione: {socioEval.errorMessage || 'sconosciuto'}</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-500 dark:text-gray-400">No evaluado</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  {/* Summary of PEP evaluation */}
                  {pepEvaluationSummary.evaluatedSocios.length > 0 && (
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Resumen Evaluación PEP</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center">
                          <span className="text-blue-700 dark:text-blue-300">Socios evaluados: </span>
                          <span className="ml-1 font-medium">{pepEvaluationSummary.evaluatedSocios.length}</span>
                        </div>
                        {pepEvaluationSummary.pepChileDetected && (
                          <div className="flex items-center">
                            <span className="inline-block w-3 h-3 bg-red-500 rounded-full mr-2"></span>
                            <span className="text-red-700 dark:text-red-300">PEP Chile detectado en socios</span>
                          </div>
                        )}
                        {pepEvaluationSummary.familiaresPepDetected && (
                          <div className="flex items-center">
                            <span className="inline-block w-3 h-3 bg-orange-500 rounded-full mr-2"></span>
                            <span className="text-orange-700 dark:text-orange-300">Familiares PEP detectado en socios</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <MeshTable
            title="Malla Relacional"
            height={exportingPdf && "auto" /* : "35rem" */}
            dequienesRelationships={data?.sheriffLogData?.filteredDetails?.dequienesRelationships}
            mainRut={companyData.rut}
            forceExpanded={exportingPdf}
          />

          <Legalrepresentatives
            dequienesRelationships={data?.sheriffLogData?.filteredDetails?.dequienesRelationships}
            mainRut={companyData.rut}
          />


          <TableBasic
            title="Inicio de Actividades"
            columns={["Actividades", "Codigo", "Categoria", "Afecta iva", "Fecha"]}
            data={
              ((riskSummary.allRules?.financieroTributarioRules || [])
                .find(rule => rule.label === 'Inicio de Actividades')
                ?.details || [])
                .map((activity: any) => [
                  activity.actividades || '—',
                  activity.codigo || '—',
                  activity.categoria || '—',
                  activity.afectaIva || '—',
                  activity.fecha || '—',
                ])
            }
          />

        </div>
        <div className='flex'>
          <div className="w-8 h-8 bg-blue-500 rounded-full text-white flex items-center justify-center mr-2">
            <span></span>
          </div>

          <h2 className="text-xl font-bold text-blue-500 dark:text-blue-400">Resumen de Hallazgos
          </h2>

        </div>


        {/* Principales Hallazgos - Accordion */}
        {findings.length > 0 && showHallazgos && (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow dark:shadow-gray-700">
            <div
              className="flex items-center justify-between mb-4 cursor-pointer"
              onClick={() => toggleSection('hallazgos')}
            >
              <div className="flex items-center">
                <div className="w-8 h-8 bg-blue-500 rounded-full text-white flex items-center justify-center mr-2">
                  <span></span>
                </div>
                <h2 className="text-xl font-bold text-blue-500 dark:text-blue-400">{t('fastCheck.findings.title')}</h2>
              </div>
              {expandedSections.hallazgos ? (
                <ChevronUp className="h-6 w-6 text-blue-500" />
              ) : (
                <ChevronDown className="h-6 w-6 text-blue-500" />
              )}
            </div>
            {expandedSections.hallazgos && (
              <div className="space-y-2">
                {financialRisk && (
                  <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded">
                    <div className="text-sm text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none">
                      {financialRisk.summary ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {financialRisk.summary}
                        </ReactMarkdown>
                      ) : (
                        <div className="text-gray-500 italic">{t('fastCheck.findings.noSummary')}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}






        {/* Resumen Section - MODIFICADO */}
        {expandedSections.resumen && (
          <div className="space-y-6">
            {(() => {

              // ── Causas Penales ──────────────────────────────────────────
              const causasPenalesRule: ParameterData = (() => {
                const todasCoincidencias =
                  data?.sheriffLogData?.filteredDetails?.compliance?.penal?.coincidencias ||
                  data?.details?.sheriffLogData?.filteredDetails?.compliance?.penal?.coincidencias ||
                  data?.logEntry?.filteredDetails?.compliance?.penal?.coincidencias ||
                  [];
                const coincidenciasFiltradas = todasCoincidencias.filter((item: any) => {
                  const postura = item?.postura?.toLowerCase() || '';
                  return postura === 'demandado' || postura === 'querellado' || postura === 'denunciado';
                });
                return {
                  label: "Causas Penales",
                  impacto: "severo",
                  detected: coincidenciasFiltradas.length > 0,
                  risk: coincidenciasFiltradas.length > 0 ? "critico" : "bajo",
                  details: coincidenciasFiltradas,
                };
              })();

              // ── Reputación Pública y Mediática ──────────────────────────
              const reputacionRule: ParameterData = (() => {
                const coincidencias =
                  data?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
                  data?.details?.sheriffLogData?.filteredDetails?.compliance?.noticias?.coincidencias ||
                  data?.logEntry?.filteredDetails?.compliance?.noticias?.coincidencias ||
                  [];
                return {
                  label: "Reputación Pública y Mediática",
                  impacto: "significativo",
                  detected: coincidencias.length > 0,
                  risk: coincidencias.length > 0 ? "alto" : "bajo",
                  details: coincidencias,
                };
              })();

              // ── Normalizar capitalHumanoRules ───────────────────────────
              const normalizedCapitalHumanoRules = (riskSummary.allRules?.capitalHumanoRules || []).map(rule => {
                if (rule.label === 'Deuda Previsional Presunta') {
                  const casos = normalizeDetails(rule.details);
                  const hasCases = casos.length > 0;
                  return {
                    ...rule,
                    risk: hasCases ? 'alto' : 'bajo',
                    detected: hasCases,
                    details: hasCases ? casos : [],
                  };
                }
                return rule;
              });

              // ── Normalizar financieroTributarioRules ────────────────────
              const normalizedFinancieroRules = (riskSummary.allRules?.financieroTributarioRules || []).map(rule => {
                if (rule.label === 'Inicio de Actividades') {
                  const hasActivities = Array.isArray(rule.details) && rule.details.length > 0;
                  return {
                    ...rule,
                    detected: !hasActivities,
                    risk: !hasActivities ? 'alto' : 'bajo',
                  };
                }
                return rule;
              });

              // ── Espejear exactamente cada TableAssessment ───────────────
              const detectedParams = [
                // Integridad, Ética y Riesgo Penal
                ...(getIntegridadComplianceRules(riskSummary.allRules?.complianceRules || []))
                  .map(rule => ({
                    ...rule,
                    label: rule.label === 'Condenas Ley 21.121' ? 'Inhabilitación Estado – Ley 21.121'
                      : rule.label === 'Condenas Ley 20.393' ? 'Inhabilitación Estado – Ley 20.393'
                        : rule.label,
                    detected: rule.risk === 'no_disponible' ? false : rule.detected,
                  })),
                causasPenalesRule,

                // Contingencias Judiciales
                ...(riskSummary.allRules?.legalRules || []),

                // Reputación y Conflictos de Interés
                ...(riskSummary.allRules?.complianceRules || [])
                  .filter(rule => ['Listas Propias Alto Impacto', 'Listas Propias Mediano Impacto'].includes(rule.label))
                  .map(rule => ({
                    ...rule,
                    detected: rule.risk === 'no_disponible' ? false : rule.detected,
                  })),
                reputacionRule,

                // Ambiental y Sostenibilidad
                // Ambiental y Sostenibilidad
                ...(riskSummary.allRules?.complianceRules || [])
                  .filter(rule => [
                    'Sanciones Medioambientales',
                    'Proceso Sanciones Medioambientales',
                    'Procesos Sancionatorios Medioambientales',
                    'Procesos Sanciones Medioambientales'
                  ].includes(rule.label))
                  .map(rule => ({
                    ...rule,
                    detected: rule.risk === 'no_disponible' ? false : rule.detected,
                  })),

                // Laboral y Capital Humano
                ...normalizedCapitalHumanoRules,

                // Financiero y Tributario
                ...normalizedFinancieroRules,

              ].filter(rule =>
                rule.detected === true &&
                rule.risk !== 'no_disponible'
              );

              if (detectedParams.length === 0) {
                return (
                  <div className="text-center py-8">
                    <p className="text-gray-500 dark:text-gray-400">
                      No se detectaron parámetros de riesgo
                    </p>
                  </div>
                );
              }

              // ── calculateTotals ─────────────────────────────────────────
              const calculateTotals = (rule: ParameterData) => {
                let d: any = rule.details;

                if (rule.label === 'Deuda Previsional Presunta' && d?.casos) {
                  d = d.casos;
                }

                const items: Array<{ label: string; value: string | number; variant: string }> = [];
                const label = rule.label || '';
                const riskVariant = rule.risk === 'critico' ? 'danger' : 'warning';

                // Casos especiales sin "Total" encabezado
                if (label === 'Inicio de Actividades') {
                  items.push({ label: 'Sin Inicio de Actividades registrado', value: 'No registra', variant: 'danger' });
                  return items;
                }
                if (label === 'Contribuyente de difícil fiscalización') {
                  items.push({ label: 'Clasificado como difícil fiscalización', value: 'Sí', variant: 'warning' });
                  return items;
                }
                if (label === 'Quiebra Judicial') {
                  items.push({ label: 'Tiene Quiebra Judicial', value: 'Sí', variant: 'danger' });
                  return items;
                }
                if (label === 'Término de Giro') {
                  items.push({ label: 'Registra Término de Giro', value: 'Sí', variant: 'danger' });
                  return items;
                }

                // Sin array de detalles: fallback
                if (d == null || !Array.isArray(d) || d.length === 0) {
                  items.push({ label: label, value: 'Detectado', variant: riskVariant });
                  return items;
                }

                if (typeof d[0] !== 'object' || d[0] === null) {
                  items.push({ label: `Total ${label}`, value: d.length, variant: 'info' });
                  return items;
                }

                // Total encabezado
                items.push({ label: `Total ${label}`, value: d.length, variant: 'info' });

                if (label === 'Multas Laborales') {
                  let montoTotal = 0;
                  d.forEach((row: any) => {
                    const monto = row?.monto || row?.Monto || 0;
                    montoTotal += typeof monto === 'number' ? monto : Number.parseFloat(String(monto).replace(/[^0-9.-]/g, '')) || 0;
                  });
                  items.push({ label: 'Cantidad de multas', value: d.length, variant: 'warning' });
                  items.push({ label: 'Monto total', value: '$' + Math.round(montoTotal).toLocaleString('es-CL'), variant: 'danger' });
                }

                else if (label === 'Protestos y Morosidades') {
                  let montoTotal = 0;
                  d.forEach((row: any) => {
                    const monto = row?.monto || row?.Monto || row?.unpaidAmount || row?.['Monto'] || 0;
                    montoTotal += typeof monto === 'number' ? monto : Number.parseFloat(String(monto).replace(/[^0-9.-]/g, '')) || 0;
                  });
                  items.push({ label: 'Cantidad de protestos y morosidades', value: d.length, variant: 'warning' });
                  items.push({ label: 'Monto total', value: '$' + Math.round(montoTotal).toLocaleString('es-CL'), variant: 'danger' });
                }

                else if (label === 'Condenas por Prácticas Antisindicales') {
                  let montoTotal = 0;
                  d.forEach((row: any) => {
                    const monto = row?.montoMulta || row?.['Monto Multa'] || row?.monto || row?.Monto || 0;
                    montoTotal += typeof monto === 'number' ? monto : Number.parseFloat(String(monto).replace(/[^0-9.-]/g, '')) || 0;
                  });
                  items.push({ label: 'Cantidad de condenas', value: d.length, variant: 'warning' });
                  items.push({ label: 'Monto total multas', value: '$' + Math.round(montoTotal).toLocaleString('es-CL'), variant: 'danger' });
                }

                else if (label === 'Procesos Sancionatorios Medioambientales') {
                  items.push({ label: 'Cantidad de procesos', value: d.length, variant: 'info' });
                }

                else if (label === 'Sanciones Medioambientales') {
                  items.push({ label: 'Cantidad de sanciones', value: d.length, variant: 'warning' });
                }

                else if (label === 'Inhabilitación Estado – Ley 21.121') {
                  items.push({ label: 'Cantidad de condenas', value: d.length, variant: 'danger' });
                }

                else if (label === 'Inhabilitación Estado – Ley 20.393') {
                  items.push({ label: 'Cantidad de condenas', value: d.length, variant: 'danger' });
                }

                else if (label === 'Listas Internacionales') {
                  items.push({ label: 'Registros en listas internacionales', value: d.length, variant: 'danger' });
                }

                else if (label === 'PEP Chile') {
                  items.push({ label: 'Personas PEP detectadas', value: d.length, variant: 'danger' });
                }

                else if (label === 'Familiares PEP') {
                  items.push({ label: 'Familiares PEP detectados', value: d.length, variant: 'warning' });
                }

                else if (label === 'Listas Propias Alto Impacto') {
                  items.push({ label: 'Cantidad de registros', value: d.length, variant: 'danger' });
                }

                else if (label === 'Listas Propias Mediano Impacto') {
                  items.push({ label: 'Cantidad de registros', value: d.length, variant: 'warning' });
                }

                else if (label === 'Reputación Pública y Mediática') {
                  items.push({ label: 'Noticias encontradas', value: d.length, variant: 'warning' });
                }

                else if (label === 'Boletín Concursal' || label === 'Boletin Concursal') {
                  items.push({ label: 'Registros en Boletín Concursal', value: d.length, variant: 'warning' });
                }

                else if (
                  label === 'Causas Civiles' ||
                  label === 'Causas Laborales' ||
                  label === 'Causas de Cobranza Laboral'
                ) {
                  let vigentesCount = 0;
                  let concluidasCount = 0;
                  let archivadasCount = 0;
                  d.forEach((row: any) => {
                    const estadoLower = String(row?.estado || row?.Estado || '').toLowerCase();
                    if (estadoLower.includes('vigente')) vigentesCount++;
                    else if (estadoLower.includes('concluida') || estadoLower.includes('concluido')) concluidasCount++;
                    else if (estadoLower.includes('archivada') || estadoLower.includes('archivado')) archivadasCount++;
                  });
                  items.push({ label: 'Causas Vigentes', value: vigentesCount, variant: 'danger' });
                  items.push({ label: 'Causas Concluidas', value: concluidasCount, variant: 'info' });
                  items.push({ label: 'Causas Archivadas', value: archivadasCount, variant: 'warning' });
                }

                else if (label === 'Deuda Previsional Presunta') {
                  items.push({ label: 'Afiliados con deuda previsional presunta', value: d.length, variant: 'warning' });
                }

                else if (label === 'Deuda Previsional Publicada') {
                  let montoTotal = 0;
                  d.forEach((row: any) => {
                    const monto = row?.monto || row?.Monto || 0;
                    montoTotal += typeof monto === 'number' ? monto : Number.parseFloat(String(monto).replace(/[^0-9.-]/g, '')) || 0;
                  });
                  items.push({ label: 'Cantidad de casos', value: d.length, variant: 'warning' });
                  items.push({ label: 'Monto total', value: '$' + Math.round(montoTotal).toLocaleString('es-CL'), variant: 'danger' });
                }

                else if (label === 'Causas Penales') {
                  let demandadoCount = 0;
                  let querelladoCount = 0;
                  let denunciadoCount = 0;
                  d.forEach((row: any) => {
                    const postura = (row?.postura || row?.Postura || '').toLowerCase().trim();
                    if (postura === 'demandado') demandadoCount++;
                    else if (postura === 'querellado') querelladoCount++;
                    else if (postura === 'denunciado') denunciadoCount++;
                  });
                  items.push({ label: 'Total causas penales', value: d.length, variant: 'danger' });
                  if (demandadoCount > 0) items.push({ label: 'Como demandado', value: demandadoCount, variant: 'warning' });
                  if (querelladoCount > 0) items.push({ label: 'Como querellado', value: querelladoCount, variant: 'warning' });
                  if (denunciadoCount > 0) items.push({ label: 'Como denunciado', value: denunciadoCount, variant: 'warning' });
                }

                return items;
              };

              return (
                <TableSummary
                  criticalAndHighParams={detectedParams}
                  riskSummary={riskSummary}
                  calculateTotals={calculateTotals}
                />
              );
            })()}
          </div>
        )}



        {/* User Notes Section */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow dark:shadow-gray-700">
          <div
            className="flex items-center justify-between mb-4 cursor-pointer"
            onClick={() => toggleSection('notas')}
          >
            <div className="flex items-center">
              <div className="w-8 h-8 bg-blue-500 rounded-full text-white flex items-center justify-center mr-2">
                <span></span>
              </div>
              <h2 className="text-xl font-bold text-blue-500 dark:text-blue-400">{t('fastCheck.notes.title')}</h2>
            </div>
            {expandedSections.notas ?
              <ChevronUp className="h-6 w-6 text-blue-500" /> :
              <ChevronDown className="h-6 w-6 text-blue-500" />
            }
          </div>

          {expandedSections.notas && (
            <div className="space-y-4">
              {!isEditingNote && !userNote && (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400 mb-4">{t('fastCheck.notes.none')}</p>
                  <button
                    onClick={() => setIsEditingNote(true)}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors flex items-center gap-2 mx-auto"
                  >
                    <Edit3 size={16} />
                    {t('fastCheck.notes.addNote')}
                  </button>
                </div>
              )}

              {!isEditingNote && userNote && (
                <div className="space-y-4">
                  <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{userNote.note}</p>
                    {userNote.tags && userNote.tags.length > 0 && (
                      <div className="mt-3">
                        <div className="flex flex-wrap gap-2">
                          {userNote.tags.map((tag, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                      {t('fastCheck.notes.lastUpdated')} {userNote.updatedAt ? new Date(userNote.updatedAt).toLocaleDateString('es-ES', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : t('common.notAvailable')}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsEditingNote(true)}
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors flex items-center gap-2"
                    >
                      <Edit3 size={16} />
                      Editar
                    </button>
                    <button
                      onClick={deleteUserNote}
                      className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors flex items-center gap-2"
                    >
                      <X size={16} />
                      Eliminar
                    </button>
                  </div>
                </div>
              )}

              {isEditingNote && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Nota para {companyData.razonSocial} ({companyData.rut})
                    </label>
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Escriba su nota aquí..."
                      rows={6}
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-vertical"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Tags ({noteTags.length}/10)
                    </label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={currentTag}
                        onChange={(e) => setCurrentTag(e.target.value)}
                        onKeyPress={handleTagKeyPress}
                        placeholder="Agregar tag..."
                        maxLength={30}
                        className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                      />
                      <button
                        onClick={addTag}
                        disabled={!currentTag.trim() || noteTags.includes(currentTag.trim()) || noteTags.length >= 10}
                        className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        Agregar
                      </button>
                    </div>
                    {noteTags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {noteTags.map((tag, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                          >
                            {tag}
                            <button
                              onClick={() => removeTag(tag)}
                              className="ml-1 text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-100"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={saveUserNote}
                      disabled={savingNote || !noteText.trim()}
                      className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors flex items-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      <Save size={16} />
                      {savingNote ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button
                      onClick={cancelEditing}
                      disabled={savingNote}
                      className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors flex items-center gap-2 disabled:cursor-not-allowed"
                    >
                      <X size={16} />
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* AI Analysis Section - show only shoowAI - true Moved to bottom */}
        {showAI && (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow dark:shadow-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-purple-500 rounded-full text-white flex items-center justify-center mr-2">
                  <span></span>
                </div>
                <h2 className="text-xl font-bold text-purple-600 dark:text-purple-400">🤖 Análisis AI de Parámetros</h2>
              </div>
            </div>

            {/* AI Analysis Button */}
            <div className="mb-6 flex justify-center gap-3">
              <button
                onClick={() => fetchAiAnalysis(companyData.rut)}
                disabled={loadingAiAnalysis}
                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingAiAnalysis ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Generando Análisis AI...</span>
                  </>
                ) : (
                  <>
                    🧠 {aiAnalysis ? 'Ver Análisis AI' : 'Generar Análisis AI'}
                  </>
                )}
              </button>

              {aiAnalysis && (
                <button
                  onClick={() => fetchAiAnalysis(companyData.rut, true)}
                  disabled={loadingAiAnalysis}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingAiAnalysis ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Regenerando...</span>
                    </>
                  ) : (
                    <>
                      🔄 Regenerar
                    </>
                  )}
                </button>
              )}
            </div>

            {/* AI Analysis Content */}

            {(aiAnalysis || aiAnalysisError) && (
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 p-6 rounded-lg border border-purple-200 dark:border-purple-700 ai-analysis">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-purple-500 rounded-full text-white flex items-center justify-center mr-3">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-purple-600 dark:text-purple-400 flex items-center gap-2">
                      Risultati Analisi
                    </h3>
                  </div>

                  {aiAnalysisDate && (
                    <div className="text-sm text-purple-600 dark:text-purple-400 flex items-center gap-2">
                      {aiAnalysisFromCache && (
                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                          📋 Desde caché
                        </span>
                      )}
                      <span>
                        📅 {aiAnalysisDate.toLocaleDateString('es-ES', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  )}
                </div>

                {aiAnalysisError ? (
                  <div className="risk-critical px-4 py-3 rounded-lg mb-4 border">
                    <p className="font-medium flex items-center gap-2">
                      🚨 Error al generar análisis:
                    </p>
                    <p className="text-sm mt-1">{aiAnalysisError}</p>
                  </div>
                ) : (
                  <div className="ai-analysis-content">
                    <div
                      className="markdown-content"
                      dangerouslySetInnerHTML={{
                        __html: aiAnalysis?.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                          .replace(/\*(.*?)\*/g, '<em>$1</em>')
                          .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                          .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                          .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
                          .replace(/^- (.*$)/gim, '<li>$1</li>')
                          .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
                          .replace(/🔴/g, '<span class="inline-block w-3 h-3 bg-red-500 rounded-full mr-1"></span>')
                          .replace(/🟡/g, '<span class="inline-block w-3 h-3 bg-yellow-500 rounded-full mr-1"></span>')
                          .replace(/🟢/g, '<span class="inline-block w-3 h-3 bg-green-500 rounded-full mr-1"></span>')
                          .replace(/🔵/g, '<span class="inline-block w-3 h-3 bg-blue-500 rounded-full mr-1"></span>')
                          .replace(/\n\n/g, '</p><p>')
                          .replace(/^(.*)$/gm, '<p>$1</p>')
                          .replace(/<p><\/p>/g, '')
                          .replace(/^<p>/, '')
                          .replace(/<\/p>$/, '') || ''
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------ */}

        <div id="divContainerDetails" className="w-full absolute left-[-99999px] top-0 opacity-0 pointer-events-none select-none">

          {/* ================= COMPLIANCE ================= */}
          <h3 className="text-lg font-bold mb-4 w-full bg-blue-100 p-1 text-blue-500">Compliance</h3>
          {(riskSummary.allRules?.complianceRules || [])
            .filter(rule => {
              if (!rule.details) return false;
              if (Array.isArray(rule.details)) return rule.details.length > 0;
              if (typeof rule.details === 'object' && rule.details !== null)
                return Object.keys(rule.details).length > 0;
              return true;
            })
            .map((rule, index) => {
              const details = rule.details;
              if (!Array.isArray(details) || !details.length || typeof details[0] !== 'object') return null;

              const columns = Array.from(new Set(details.flatMap(item => Object.keys(item || {}))));

              return (
                <div key={`comp-${index}`} className="bg-white rounded-lg shadow mb-4 break-inside-avoid-page">
                  {index === 0 && <h3 className="text-lg font-bold mb-4">Compliance</h3>}
                  <h4 className=" font-semibold text-blue-600 mb-2">{rule.label}</h4>

                  <div className="overflow-x-auto w-full">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-gray-100 dark:bg-gray-700">
                          {columns.map((col, i) => (
                            <th key={i} className="border dark:border-gray-600 p-2 text-left dark:text-white">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {details.map((row, r) => (
                          <tr key={r} className={r % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800' : 'dark:bg-gray-900'}>
                            {columns.map((col, c) => (
                              <td key={c} className="border dark:border-gray-600 p-2 dark:text-gray-300">
                                {row?.[col] !== undefined && row?.[col] !== null
                                  ? typeof row[col] === 'object'
                                    ? JSON.stringify(row[col])
                                    : String(row[col])
                                  : '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

          {/* ================= LEGAL ================= */}
          <h3 className="text-lg font-bold mb-4 w-full bg-blue-100 p-1 text-blue-500">Legal</h3>

          {riskSummary.allRules?.legalRules.length == 0 &&
            <h3 className="text-lg font-bold mb-4 w-full p-1 text-blue-500">Sin datos</h3>}
          {(riskSummary.allRules?.legalRules || []).map((rule, index) => {
            const details = rule.details;
            if (!Array.isArray(details) || !details.length || typeof details[0] !== 'object') return null;

            const columns = Array.from(new Set(details.flatMap((item) => Object.keys(item || {}))));

            return (
              <div key={`leg-${index}`} className="bg-white rounded-lg shadow mb-4 break-inside-avoid-page">
                {/*  {index === 0 && <h3 className="text-lg font-bold mb-4">Legal</h3>} */}
                <h4 className=" font-semibold text-red-600 mb-2">{rule.label}</h4>

                <div className="overflow-x-auto w-full">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-gray-700">
                        {columns.map((col, i) => (
                          <th key={i} className="border dark:border-gray-600 p-2 text-left  dark:text-white">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {details.map((row, r) => (
                        <tr key={r} className={r % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800' : 'dark:bg-gray-900'}>
                          {columns.map((col, c) => (
                            <td key={c} className="border dark:border-gray-600 p-2 dark:text-gray-300">
                              {row?.[col] !== undefined && row?.[col] !== null
                                ? typeof row[col] === 'object'
                                  ? JSON.stringify(row[col])
                                  : String(row[col])
                                : '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {/* ================= CAPITAL HUMANO ================= */}
          <h3 className="text-lg font-bold mb-4 w-full bg-blue-100 p-1 text-blue-500">Capital Humano</h3>
          {(riskSummary.allRules?.capitalHumanoRules || []).map((rule, index) => {
            // Obtener los datos correctos según el parámetro
            let details = rule.details;
            if (rule.label === 'Deuda Previsional Presunta' && rule.details?.casos) {
              details = rule.details.casos;
            }

            if (!Array.isArray(details) || !details.length || typeof details[0] !== 'object') return null;

            const columns = Array.from(new Set(details.flatMap(item => Object.keys(item || {}))));

            return (
              <div key={`hum-${index}`} className="bg-white rounded-lg shadow mb-4 break-inside-avoid-page">
                <h4 className=" font-semibold text-green-600 mb-2">{rule.label}</h4>

                <div className="overflow-x-auto w-full">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-gray-700">
                        {columns.map((col, i) => (
                          <th key={i} className="border dark:border-gray-600 p-2 text-left dark:text-white">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {details.map((row, r) => (
                        <tr key={r} className={r % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800' : 'dark:bg-gray-900'}>
                          {columns.map((col, c) => (
                            <td key={c} className="border dark:border-gray-600 p-2  dark:text-gray-300">
                              {row?.[col] !== undefined && row?.[col] !== null
                                ? typeof row[col] === 'object'
                                  ? JSON.stringify(row[col])
                                  : String(row[col])
                                : '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {/* ================= FINANCIERO - TRIBUTARIO ================= */}
          <h3 className="text-lg font-bold mb-4 w-full bg-blue-100 p-1 text-blue-500">Financiero - Tributario</h3>
          {(riskSummary.allRules?.financieroTributarioRules || []).map((rule, indexFincieroT) => {
            const details = rule.details;
            if (!Array.isArray(details) || !details.length || typeof details[0] !== 'object') return null;
            const columns = Array.from(new Set(details.flatMap(item => Object.keys(item || {}))));
            return (
              <div key={`fin-${indexFincieroT}`} className="bg-white rounded-lg shadow mb-4 break-inside-avoid-page">
                {/*  {indexFincieroT === 0 && <h3 className="text-lg font-bold mb-4">Financiero - Tributario</h3>} */}
                <h4 className=" font-semibold text-purple-600 mb-2">{rule.label}</h4>

                <div className="overflow-x-auto w-full">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-gray-700">
                        {columns.map((col, i) => (
                          <th key={i} className="border dark:border-gray-600 p-2 text-left  dark:text-white">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {details.map((row, r) => (
                        <tr key={r} className={r % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800' : 'dark:bg-gray-900'}>
                          {columns.map((col, c) => (
                            <td key={c} className="border dark:border-gray-600 p-2 dark:text-gray-300">
                              {row?.[col] !== undefined && row?.[col] !== null
                                ? typeof row[col] === 'object'
                                  ? JSON.stringify(row[col])
                                  : String(row[col])
                                : '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

        </div>

      </div>

    </PageLayout>
  );
};

export default FastCheck;
