import React, { useState, useCallback } from 'react';
import { Dialog } from '@headlessui/react';
import { X, Download, ChevronUp, ChevronDown } from 'lucide-react';

interface ColumnButton {
  columnName: string;
  buttonLabel?: string;
  ButtonIcon?: React.ComponentType<{ className?: string }>;
  onButtonClick?: (rowData: any, columnValue: any) => void;
  showCondition?: (rowData: any, columnValue: any) => boolean;
  openSubModal?: boolean;
  subModalTitle?: string;
  /** Nombres personalizados para las columnas del sub-modal */
  subModalHeaderRenameMap?: Record<string, string>;
  /** Columnas a ocultar en el sub-modal */
  subModalHiddenColumns?: string[];
  /** Botones para columnas dentro del sub-modal (sub-sub-modal no soportado, solo acciones) */
  subModalColumnButtons?: ColumnButton[];
}

interface RuleDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: any;
  filter: string;
  onFilterChange: (value: string) => void;
  sortKey: string | null;
  sortDir: 'asc' | 'desc';
  onSort: (key: string) => void;
  onExportCSV: () => void;
  onExportXLSX: () => void;
  headerRenameMap: Record<string, string>;
  columnButtons?: ColumnButton[];
  columnOrder?: string[];
}

const RuleDetailsModal: React.FC<RuleDetailsModalProps> = ({
  isOpen,
  onClose,
  title,
  content,
  filter,
  onFilterChange,
  sortKey,
  sortDir,
  onSort,
  onExportCSV,
  onExportXLSX,
  headerRenameMap,
  columnButtons,
  columnOrder
}) => {
  // Estado para el sub-modal
  const [showSubModal, setShowSubModal] = useState(false);
  const [subModalTitle, setSubModalTitle] = useState('');
  const [subModalContent, setSubModalContent] = useState<any>(null);
  const [subModalFilter, setSubModalFilter] = useState('');
  const [subModalSortKey, setSubModalSortKey] = useState<string | null>(null);
  const [subModalSortDir, setSubModalSortDir] = useState<'asc' | 'desc'>('asc');
  const [subModalHeaderRenameMap, setSubModalHeaderRenameMap] = useState<Record<string, string>>({});
  const [subModalHiddenColumns, setSubModalHiddenColumns] = useState<string[]>([]);

  // ─── Utilidades ────────────────────────────────────────────────

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

  /** Normaliza data a un array de objetos */
  const normalizeToArray = (data: any, tableTitle: string): any[] => {
    let d = data;

    if (d == null) return [];

    if (typeof d === 'string') {
      const s = d.trim();
      if (s.startsWith('{') || s.startsWith('[')) {
        try { d = JSON.parse(s); } catch { return []; }
      }
    }

    // Lógica especial para PEP
    if (tableTitle === 'PEP Chile' || tableTitle === 'Familiares PEP') {
      if (d && typeof d === 'object' && !Array.isArray(d)) {
        const keys = ['sociosFamiliaresPepDetected', 'pepChileDetected', 'data', 'results', 'items'];
        for (const key of keys) {
          if (d[key] && Array.isArray(d[key])) {
            d = d[key];
            break;
          }
        }
        if (!Array.isArray(d)) {
          const hasDataKeys = d.rut || d.name || d.count;
          if (hasDataKeys) d = [d];
        }
      }
    }

    // Si es un objeto con claves que parecen ser arrays, intentar extraer
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      const arrayKeys = Object.keys(d).filter(k => Array.isArray(d[k]));
      if (arrayKeys.length === 1) {
        d = d[arrayKeys[0]];
      } else if (arrayKeys.length === 0) {
        // Objeto simple → lo envolvemos
        d = [d];
      }
    }

    if (!Array.isArray(d)) return [];
    return d.filter((item: any) => item != null && typeof item === 'object');
  };

  /** Obtiene columnas visibles de un dataset */
  const getColumns = (data: any[], hiddenCols: string[] = []): string[] => {
    const colsSet = new Set<string>();
    data.forEach((it: any) => Object.keys(it).forEach((k) => colsSet.add(k)));
    const hidden = new Set(hiddenCols.map(c => c.toLowerCase()));
    return Array.from(colsSet).filter(c => !hidden.has(c.toLowerCase()));
  };

  /** Filtra filas */
  const filterRows = (data: any[], cols: string[], filterText: string): any[] => {
    const ft = filterText.trim().toLowerCase();
    if (!ft) return data;
    return data.filter((row: any) =>
      cols.some((c) => {
        const v = row?.[c];
        if (v == null) return false;
        const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
        return s.toLowerCase().includes(ft);
      })
    );
  };

  /** Ordena filas */
  const sortRows = (data: any[], cols: string[], sk: string | null, sd: 'asc' | 'desc'): any[] => {
    if (!sk || !cols.includes(sk)) return data;

    return [...data].sort((a: any, b: any) => {
      const av = a?.[sk];
      const bv = b?.[sk];

      const colLower = sk.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const isDateColumn = colLower.includes('fecha') || colLower.includes('vencimiento') ||
        colLower.includes('publicacion') || colLower.includes('desde') || colLower.includes('hasta');

      if (isDateColumn) {
        const parseDate = (val: any): Date | null => {
          if (val == null) return null;
          const valStr = String(val).trim();
          const match1 = valStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
          if (match1) {
            const [, day, month, year] = match1;
            return new Date(Number(year), Number(month) - 1, Number(day));
          }
          return null;
        };
        const dateA = parseDate(av);
        const dateB = parseDate(bv);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        const cmp = dateA.getTime() - dateB.getTime();
        return sd === 'asc' ? cmp : -cmp;
      }

      const an = typeof av === 'number' ? av : Number.parseFloat(String(av).replace(/[^0-9.-]/g, ''));
      const bn = typeof bv === 'number' ? bv : Number.parseFloat(String(bv).replace(/[^0-9.-]/g, ''));
      const bothNumeric = Number.isFinite(an) && Number.isFinite(bn);
      const cmp = bothNumeric
        ? (an - bn)
        : String(av ?? '').localeCompare(String(bv ?? ''), undefined, { sensitivity: 'base' });
      return sd === 'asc' ? cmp : -cmp;
    });
  };

  // ─── Exportar (genérico) ────────────────────────────────────────

  const exportGenericCSV = useCallback((data: any, tableTitle: string, renameMap: Record<string, string>, hiddenCols: string[] = []) => {
    const rows = normalizeToArray(data, tableTitle);
    if (rows.length === 0) return;

    const cols = getColumns(rows, hiddenCols);
    const headers = cols.map(c => renameMap[c] ?? c);

    const csvContent = [
      headers.join(','),
      ...rows.map(row =>
        cols.map(col => {
          const v = row?.[col];
          if (v == null) return '';
          const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
          return `"${s.replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tableTitle.replace(/\s+/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  const exportGenericXLSX = useCallback((data: any, tableTitle: string, renameMap: Record<string, string>, hiddenCols: string[] = []) => {
    const rows = normalizeToArray(data, tableTitle);
    if (rows.length === 0) return;

    const cols = getColumns(rows, hiddenCols);
    const headers = cols.map(c => renameMap[c] ?? c);

    // Genera un XML compatible con Excel (SpreadsheetML)
    const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const xmlRows = rows.map(row =>
      '<Row>' + cols.map(col => {
        const v = row?.[col];
        if (v == null) return '<Cell><Data ss:Type="String"></Data></Cell>';
        const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
        const isNum = typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()));
        return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${escapeXml(s)}</Data></Cell>`;
      }).join('') + '</Row>'
    );

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${escapeXml(tableTitle.substring(0, 31))}">
<Table>
<Row>${headers.map(h => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join('')}</Row>
${xmlRows.join('\n')}
</Table>
</Worksheet>
</Workbook>`;

    const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tableTitle.replace(/\s+/g, '_')}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  // ─── Sub-modal export handlers ─────────────────────────────────

  const handleExportSubModalCSV = () => {
    exportGenericCSV(subModalContent, subModalTitle, subModalHeaderRenameMap, subModalHiddenColumns);
  };

  const handleExportSubModalXLSX = () => {
    exportGenericXLSX(subModalContent, subModalTitle, subModalHeaderRenameMap, subModalHiddenColumns);
  };

  // ─── Renderizado ───────────────────────────────────────────────
  const renderStatistics = (data: any, tableTitle: string) => {
    const d = normalizeToArray(data, tableTitle);

    const cls = (v: string) => v === 'success'
      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
      : v === 'warning'
        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
        : v === 'danger'
          ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
          : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';

    // ─── Totales específicos por tabla ───────────────────────────────

    // PEP Chile
    if (tableTitle === 'PEP Chile') {
      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Cantidad de PEP</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {d.length}
            </span>
          </div>
        </div>
      );
    }

    // Familiares PEP
    if (tableTitle === 'Familiares PEP') {
      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Cantidad de Familiares PEP</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {d.length}
            </span>
          </div>
        </div>
      );
    }

    // Multas Laborales
    if (tableTitle === 'Multas Laborales') {
      const montoTotal = d.reduce((sum, row) => {
        const monto = row?.monto || row?.Monto || row?.multa || row?.Multa || 0;
        const num = typeof monto === 'number' ? monto : Number.parseFloat(String(monto).replace(/[^0-9.-]/g, '')) || 0;
        return sum + num;
      }, 0);

      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Cantidad de multas</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {d.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Monto total</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              ${Math.round(montoTotal).toLocaleString('es-CL')}
            </span>
          </div>
        </div>
      );
    }

    // Protestos y Morosidades
    if (tableTitle === 'Protestos y Morosidades') {
   const montoTotal = d.reduce((sum, row) => {
  const monto = row?.monto || row?.Monto || row?.unpaidAmount || 0;
  const clean = String(monto).replace(/\$/g, '').replace(/\./g, '').replace(/,/g, '').trim();
  const num = typeof monto === 'number' ? monto : Number.parseFloat(clean) || 0;
  return sum + num;
}, 0);

      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Cantidad de protestos y morosidades</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {d.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Monto total</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              ${Math.round(montoTotal).toLocaleString('es-CL')}
            </span>
          </div>
        </div>
      );
    }

    // Condenas por Prácticas Antisindicales
    if (tableTitle === 'Condenas por Prácticas Antisindicales') {
      const montoTotal = d.reduce((sum, row) => {
        const monto = row?.monto || row?.Monto || row?.multa || row?.Multa || 0;
        const num = typeof monto === 'number' ? monto : Number.parseFloat(String(monto).replace(/[^0-9.-]/g, '')) || 0;
        return sum + num;
      }, 0);

      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Cantidad de Condenas</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {d.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Monto total multas</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              ${Math.round(montoTotal).toLocaleString('es-CL')}
            </span>
          </div>
        </div>
      );
    }

    // Procesos Sancionatorios Medioambientales
    if (tableTitle === 'Procesos Sancionatorios Medioambientales') {
      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Cantidad de procesos</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {d.length}
            </span>
          </div>
        </div>
      );
    }

    // Sanciones Medioambientales
    if (tableTitle === 'Sanciones Medioambientales') {
      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Cantidad de sanciones</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {d.length}
            </span>
          </div>
        </div>
      );
    }

    // Condenas Ley 21.121
    if (tableTitle === 'Condenas Ley 21.121') {
      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Cantidad de condenas</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {d.length}
            </span>
          </div>
        </div>
      );
    }

    // Condenas Ley 20.393
    if (tableTitle === 'Condenas Ley 20.393') {
      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Cantidad de condenas</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {d.length}
            </span>
          </div>
        </div>
      );
    }

    // Listas Internacionales
    if (tableTitle === 'Listas Internacionales') {
      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Cantidad de registros</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {d.length}
            </span>
          </div>
        </div>
      );
    }

    // Listas Propias Alto Impacto
    if (tableTitle === 'Listas Propias Alto Impacto') {
      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Cantidad de registros</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {d.length}
            </span>
          </div>
        </div>
      );
    }

    // Listas Propias Mediano Impacto
    if (tableTitle === 'Listas Propias Mediano Impacto') {
      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Cantidad de registros</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {d.length}
            </span>
          </div>
        </div>
      );
    }

    // Quiebra Judicial
    if (tableTitle === 'Quiebra Judicial') {
      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('danger')}`}>
              Verdadero
            </span>
          </div>
        </div>
      );
    }

    // Boletín Concursal
    if (tableTitle === 'Boletín Concursal') {
      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Presenta registros en el Boletín Concursal</span>
          </div>
        </div>
      );
    }

    // Término de giro
    if (tableTitle === 'Término de giro' || tableTitle === 'termino de giro') {
      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('danger')}`}>
              Verdadero
            </span>
          </div>
        </div>
      );
    }

    // Contribuyente de difícil fiscalización
    if (tableTitle === 'Contribuyente de difícil fiscalización') {
      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('danger')}`}>
              Verdadero
            </span>
          </div>
        </div>
      );
    }

    // Iniciación de actividades
    if (tableTitle === 'Iniciación de actividades' || tableTitle === 'iniciación de actividaes') {
      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('warning')}`}>
              No tiene iniciación de Actividades
            </span>
          </div>
        </div>
      );
    }

    // Deuda Previsional Presunta
    if (tableTitle === 'Deuda Previsional Presunta') {
      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Cantidad de afiliados con deuda previsional presunta</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {d.length}
            </span>
          </div>
        </div>
      );
    }

    // Deuda Previsional Publicada
    if (tableTitle === 'Deuda Previsional Publicada') {
      const montoTotal = d.reduce((sum, row) => {
        const monto = row?.monto || row?.Monto || row?.deuda || row?.Deuda || 0;
        const num = typeof monto === 'number' ? monto : Number.parseFloat(String(monto).replace(/[^0-9.-]/g, '')) || 0;
        return sum + num;
      }, 0);

      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Cantidad de casos</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {d.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Monto total</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              ${Math.round(montoTotal).toLocaleString('es-CL')}
            </span>
          </div>
        </div>
      );
    }

    // Causas Civiles
    if (tableTitle === 'Causas Civiles') {
      const vigentes = d.filter(row => {
        const estado = String(row?.estado || row?.Estado || '').toLowerCase();
        return estado.includes('vigente');
      }).length;

      const concluidas = d.filter(row => {
        const estado = String(row?.estado || row?.Estado || '').toLowerCase();
        return estado.includes('concluida') || estado.includes('concluido');
      }).length;

      const archivadas = d.filter(row => {
        const estado = String(row?.estado || row?.Estado || '').toLowerCase();
        return estado.includes('archivada') || estado.includes('archivado');
      }).length;

      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Causas Vigentes</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {vigentes}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Causas Concluidas</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {concluidas}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Causas Archivadas</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {archivadas}
            </span>
          </div>
        </div>
      );
    }

    // Causas Laborales
    if (tableTitle === 'Causas Laborales') {
      const vigentes = d.filter(row => {
        const estado = String(row?.estado || row?.Estado || '').toLowerCase();
        return estado.includes('vigente');
      }).length;

      const concluidas = d.filter(row => {
        const estado = String(row?.estado || row?.Estado || '').toLowerCase();
        return estado.includes('concluida') || estado.includes('concluido');
      }).length;

      const archivadas = d.filter(row => {
        const estado = String(row?.estado || row?.Estado || '').toLowerCase();
        return estado.includes('archivada') || estado.includes('archivado');
      }).length;

      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Causas Vigentes</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {vigentes}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Causas Concluidas</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {concluidas}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Causas Archivadas</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {archivadas}
            </span>
          </div>
        </div>
      );
    }

    // Causas de Cobranza Laboral
    if (tableTitle === 'Causas de Cobranza Laboral') {
      const vigentes = d.filter(row => {
        const estado = String(row?.estado || row?.Estado || '').toLowerCase();
        return estado.includes('vigente');
      }).length;

      const concluidas = d.filter(row => {
        const estado = String(row?.estado || row?.Estado || '').toLowerCase();
        return estado.includes('concluida') || estado.includes('concluido');
      }).length;

      const archivadas = d.filter(row => {
        const estado = String(row?.estado || row?.Estado || '').toLowerCase();
        return estado.includes('archivada') || estado.includes('archivado');
      }).length;

      return (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Causas Vigentes</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {vigentes}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Causas Concluidas</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {concluidas}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Causas Archivadas</span>
            <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
              {archivadas}
            </span>
          </div>
        </div>
      );
    }

    // ─── Caso por defecto (sin datos) ─────────────────────────────────

    if (d.length === 0) {
      return (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Tipo de datos</span>
          <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
            Sin datos
          </span>
        </div>
      );
    }

    // ─── Caso genérico (para tablas no especificadas) ────────────────

    return (
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-300">Total {tableTitle}</span>
          <span className={`inline-flex items-center px-2 py-1 rounded ${cls('info')}`}>
            {d.length}
          </span>
        </div>
      </div>
    );
  };


  const renderTable = (
    data: any,
    tableTitle: string,
    filterValue: string,
    sortKeyValue: string | null,
    sortDirValue: 'asc' | 'desc',
    onSortChange: (key: string) => void,
    buttons?: ColumnButton[],
    renameMap?: Record<string, string>,
    hiddenCols?: string[]
  ) => {
    // Si el detalle es un string plano (ej: Término de Giro), mostrarlo como texto
    if (typeof data === 'string' && data.trim().length > 0) {
      return (
        <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 rounded p-4 border border-gray-200 dark:border-gray-700">
          {data.trim()}
        </div>
      );
    }

    if (typeof data === 'string' && data.trim().length > 0) {
      return (
        <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 rounded p-4 border border-gray-200 dark:border-gray-700">
          {data.trim()}
        </div>
      );
    }

    const rows = normalizeToArray(data, tableTitle);

    if (rows.length === 0) {
      return <div className="text-sm text-gray-600 dark:text-gray-300">Sin datos para mostrar</div>;
    }

    let cols = getColumns(rows, hiddenCols);

    // Aplicar orden si se proporcionó
    if (columnOrder && columnOrder.length > 0) {
      const ordered = columnOrder.filter(c => cols.includes(c));
      const rest = cols.filter(c => !columnOrder.includes(c));
      cols = [...ordered, ...rest];
    }

    if (cols.length === 0) {
      return <div className="text-sm text-gray-600 dark:text-gray-300">Sin columnas visibles</div>;
    }

    const effectiveRenameMap = renameMap ?? headerRenameMap;
    const filtered = filterRows(rows, cols, filterValue);
    const sorted = sortRows(filtered, cols, sortKeyValue, sortDirValue);

    const getColumnButton = (col: string) => {
      return buttons?.find(btn => btn.columnName === col);
    };

    const tablasConFormateoMonto = [
      'Multas Laborales',
      'Protestos y Morosidades',
      'Condenas por Prácticas Antisindicales',
      'Deuda Previsional Publicada',
      'Sanciones Medioambientales'
    ];

    return (
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100 dark:bg-gray-700">
            {cols.map((col) => {
              const displayCol = effectiveRenameMap[col] ?? col;
              return (
                <th
                  key={`col-${col}`}
                  className="border dark:border-gray-600 p-2 text-left dark:text-white select-none cursor-pointer"
                  onClick={() => onSortChange(col)}
                >
                  <span className="inline-flex items-center gap-1">
                    {displayCol}
                    {sortKeyValue === col && (
                      sortDirValue === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row: any, idx: number) => (
            <tr key={`row-${idx}`} className={idx % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800' : 'dark:bg-gray-900'}>
              {cols.map((col) => {
                const v = row?.[col];
                const columnButton = getColumnButton(col);

                // ── Columna con botón configurado ──
                if (columnButton) {
                  const shouldShowButton = columnButton.showCondition
                    ? columnButton.showCondition(row, v)
                    : (v != null && (Array.isArray(v) ? v.length > 0 : true));

                  if (shouldShowButton) {
                    const Icon = columnButton.ButtonIcon;
                    return (
                      <td key={`cell-${idx}-${col}`} className="border dark:border-gray-600 p-2 dark:text-gray-300">
                        <div className="flex items-center gap-2">
                          {/* Mostrar conteo si es array */}
                          {Array.isArray(v) && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              ({v.length} {v.length === 1 ? 'registro' : 'registros'})
                            </span>
                          )}
                          <button
                            onClick={() => {
                              if (columnButton.openSubModal) {
                                setSubModalTitle(columnButton.subModalTitle || col);
                                setSubModalContent(v);
                                setSubModalFilter('');
                                setSubModalSortKey(null);
                                setSubModalSortDir('asc');
                                setSubModalHeaderRenameMap(columnButton.subModalHeaderRenameMap || {});
                                setSubModalHiddenColumns(columnButton.subModalHiddenColumns || []);
                                setShowSubModal(true);
                              }
                              if (columnButton.onButtonClick) {
                                columnButton.onButtonClick(row, v);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                            aria-label={columnButton.buttonLabel || `Ver ${col}`}
                          >
                            {Icon && <Icon className="w-4 h-4" />}
                            {columnButton.buttonLabel && <span>{columnButton.buttonLabel}</span>}
                          </button>
                        </div>
                      </td>
                    );
                  }
                  // Si la condición no se cumple, renderizar el valor normalmente (caer al flujo normal)
                }

                // ── Renderizado normal de celdas ──
                if (v == null) {
                  return (
                    <td key={`cell-${idx}-${col}`} className="border dark:border-gray-600 p-2 dark:text-gray-300">
                      —
                    </td>
                  );
                }

                // ── Auto-detectar arrays de objetos y mostrar botón automáticamente ──
                // ── Auto-detectar arrays y mostrar botón automáticamente ──
                if (Array.isArray(v) && v.length > 0) {
                  // Si es array de objetos O array de primitivos, mostrar botón
                  const isArrayOfObjects = typeof v[0] === 'object';
                  const isArrayOfPrimitives = typeof v[0] !== 'object';

                  if (isArrayOfObjects || isArrayOfPrimitives) {
                    return (
                      <td key={`cell-${idx}-${col}`} className="border dark:border-gray-600 p-2 dark:text-gray-300">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            ({v.length} {v.length === 1 ? 'elemento' : 'elementos'})
                          </span>
                          <button
                            onClick={() => {
                              // Convertir array de primitivos a array de objetos
                              const contentToShow = isArrayOfPrimitives
                                ? v.map((item: any, index: number) => ({
                                  [effectiveRenameMap[col] ?? col]: item,
                                  '#': index + 1
                                }))
                                : v;

                              setSubModalTitle(effectiveRenameMap[col] ?? col);
                              setSubModalContent(contentToShow);
                              setSubModalFilter('');
                              setSubModalSortKey(null);
                              setSubModalSortDir('asc');
                              setSubModalHeaderRenameMap({});
                              setSubModalHiddenColumns([]);
                              setShowSubModal(true);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                          >
                            Ver {effectiveRenameMap[col] ?? col}
                          </button>
                        </div>
                      </td>
                    );
                  }
                }

                // Si es un array vacío, mostrar conteo
                if (Array.isArray(v)) {
                  return (
                    <td key={`cell-${idx}-${col}`} className="border dark:border-gray-600 p-2 dark:text-gray-300">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        [0 elementos]
                      </span>
                    </td>
                  );
                }
                const colLower = col.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                if (colLower.includes('fecha') || colLower.includes('vencimiento') ||
                  colLower.includes('publicacion') || colLower.includes('desde') || colLower.includes('hasta')) {
                  return (
                    <td key={`cell-${idx}-${col}`} className="border dark:border-gray-600 p-2 dark:text-gray-300">
                      {formatDate(v)}
                    </td>
                  );
                }

                if (tablasConFormateoMonto.includes(tableTitle || '') &&
                  (col.toLowerCase().includes('monto') || col.toLowerCase().includes('multa'))) {
                  const montoNumerico = typeof v === 'number'
                    ? v
                    : Number.parseFloat(String(v).replace(/[^0-9.-]/g, '')) || 0;
                  return (
                    <td key={`cell-${idx}-${col}`} className="border dark:border-gray-600 p-2 dark:text-gray-300">
                      ${Math.round(montoNumerico).toLocaleString('es-CL')}
                    </td>
                  );
                }

                return (
                  <td key={`cell-${idx}-${col}`} className="border dark:border-gray-600 p-2 dark:text-gray-300">
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <>
      {/* Modal Principal */}
      <Dialog open={isOpen} onClose={onClose} className="relative z-50">
        <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto w-full max-w-[90vw] max-h-[80vh] min-w-[320px] min-h-[240px] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-auto resize">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                Detalles: {title || 'Parámetro'}
              </Dialog.Title>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <div className="mb-3 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <label htmlFor="rule-filter" className="sr-only">Filtro</label>
                  <input
                    id="rule-filter"
                    type="text"
                    value={filter}
                    onChange={(e) => onFilterChange(e.target.value)}
                    placeholder="Filtrar..."
                    className="w-full sm:w-64 px-2 py-1 text-sm border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 border-gray-300 dark:border-gray-700"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={onExportCSV}
                    className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Exportar CSV
                  </button>
                  <button
                    onClick={onExportXLSX}
                    className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Exportar XLSX
                  </button>
                </div>
              </div>
              {renderStatistics(content, title)}
            </div>

            <div className="px-6 pt-4 pb-4 overflow-auto">
              {renderTable(content, title, filter, sortKey, sortDir, onSort, columnButtons)}
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Sub-Modal */}
      {showSubModal && (
        <Dialog open={showSubModal} onClose={() => setShowSubModal(false)} className="relative z-[60]">
          <div className="fixed inset-0 bg-black/50" aria-hidden="true" onClick={(e) => e.stopPropagation()} />
          <div className="fixed inset-0 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
            <Dialog.Panel className="mx-auto w-full max-w-[80vw] max-h-[70vh] min-w-[320px] min-h-[240px] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                  {subModalTitle}
                </Dialog.Title>
                <button
                  onClick={() => setShowSubModal(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <div className="mb-3 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <label htmlFor="sub-modal-filter" className="sr-only">Filtro</label>
                    <input
                      id="sub-modal-filter"
                      type="text"
                      value={subModalFilter}
                      onChange={(e) => setSubModalFilter(e.target.value)}
                      placeholder="Filtrar..."
                      className="w-full sm:w-64 px-2 py-1 text-sm border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 border-gray-300 dark:border-gray-700"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={handleExportSubModalCSV}
                      className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Exportar CSV
                    </button>
                    <button
                      onClick={handleExportSubModalXLSX}
                      className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Exportar XLSX
                    </button>
                  </div>
                </div>
                {renderStatistics(subModalContent, subModalTitle)}
              </div>

              <div className="px-6 pt-4 pb-4 overflow-auto">
                {renderTable(
                  subModalContent,
                  subModalTitle,
                  subModalFilter,
                  subModalSortKey,
                  subModalSortDir,
                  (key) => {
                    if (subModalSortKey === key) {
                      setSubModalSortDir(subModalSortDir === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSubModalSortKey(key);
                      setSubModalSortDir('asc');
                    }
                  },
                  undefined, // sin botones en sub-modal por ahora
                  subModalHeaderRenameMap,
                  subModalHiddenColumns
                )}
              </div>
            </Dialog.Panel>
          </div>
        </Dialog>
      )}
    </>
  );
};

export default RuleDetailsModal;