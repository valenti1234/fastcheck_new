import React, { useState, useMemo } from 'react';
import formatRut from '../../../utils/rutFormat';

const MAX_DEPTH = 5;

const normalizeRut = (rut: string | number): string => {
  if (rut == null) return '';
  return String(rut).replace(/\./g, '').split('-')[0].trim();
};

const isSociedad = (rut: string): boolean => {
  const n = parseInt(normalizeRut(rut), 10);
  return !isNaN(n) && n >= 25_000_000;
};

const inferTipo = (rut: string) => (isSociedad(rut) ? 'Sociedad' : 'Persona');

const mapSource = (src: string): string =>
  ({ SII_REP: 'SII', SII: 'SII', SII_REC_COM: 'SII', RES: 'DO', DO: 'DO', DOH: 'DOH', DIARIO_OFICIAL: 'DO' } as Record<string, string>)[src] ?? src ?? '--';

const extractPct = (info: any): number | null => {
  if (!info) return null;
  const v = info.shares_percent ?? info.percentage ?? null;
  return v != null ? Number(v) : null;
};

interface FlowRow {
  id: number;
  parentId: number | null;
  level: number;
  sourceRut: string;
  sourceName: string;
  targetRut: string;
  targetName: string;
  percentage: number | null;
  tipoTarget: string;
  fuente: string;
  direction: 'owned' | 'owner';
}

interface Props {
  title?: string;
  dequienesRelationships: any;
  mainRut: string;
  height?: string | number;
  forceExpanded?: boolean;
}

const MeshFlowTable: React.FC<Props> = ({
  title = 'Mapa de Empresas en las que Participa',
  dequienesRelationships,
  mainRut,
  forceExpanded = false,
}) => {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // BFS bidireccional desde el centro, igual que MeshFlowChart
  const rows = useMemo<FlowRow[]>(() => {
    if (!dequienesRelationships?.relationships?.length) return [];
    const { relationships, entityNames = {} } = dequienesRelationships;
    const cleanMain = normalizeRut(mainRut || '');
    if (!cleanMain) return [];

    const getName = (rut: string) =>
      entityNames[rut] || entityNames[normalizeRut(rut)] || '';

    const ownRels = relationships.filter((r: any) =>
      r.label === 'OWNED_BY' && !r.information_source?.match_type
    );

    const visited = new Set<string>([cleanMain]);
    const result: FlowRow[] = [];
    let nextId = 0;

    interface QueueItem {
      rut: string;
      level: number;
      parentId: number | null;
    }
    const queue: QueueItem[] = [{ rut: cleanMain, level: 0, parentId: null }];

    while (queue.length) {
      const { rut: cur, level, parentId } = queue.shift()!;
      if (level >= MAX_DEPTH) continue;

      // Empresas poseídas por `cur` -> target = cur (hijo = source)
      const owned = ownRels.filter((r: any) => normalizeRut(String(r.target)) === cur);
      for (const r of owned) {
        const childRut = normalizeRut(String(r.source || ''));
        if (!childRut || childRut === cur) continue;
        if (!isSociedad(childRut)) continue;
        if (visited.has(childRut)) continue;
        visited.add(childRut);

        const id = nextId++;
        result.push({
          id,
          parentId,
          level: level + 1,
          sourceRut: cur,
          sourceName: getName(cur),
          targetRut: childRut,
          targetName: getName(childRut),
          percentage: extractPct(r.information_source),
          tipoTarget: inferTipo(childRut),
          fuente: mapSource(r.information_source?.source || ''),
          direction: 'owned',
        });
        queue.push({ rut: childRut, level: level + 1, parentId: id });
      }

      // Dueños-empresa de `cur` -> source = cur (dueño = target)
      const owners = ownRels.filter((r: any) => normalizeRut(String(r.source)) === cur);
      for (const r of owners) {
        const upRut = normalizeRut(String(r.target || ''));
        if (!upRut || upRut === cur) continue;
        if (!isSociedad(upRut)) continue;
        if (visited.has(upRut)) continue;
        visited.add(upRut);

        const id = nextId++;
        result.push({
          id,
          parentId,
          level: level + 1,
          sourceRut: cur,
          sourceName: getName(cur),
          targetRut: upRut,
          targetName: getName(upRut),
          percentage: extractPct(r.information_source),
          tipoTarget: inferTipo(upRut),
          fuente: mapSource(r.information_source?.source || ''),
          direction: 'owner',
        });
        queue.push({ rut: upRut, level: level + 1, parentId: id });
      }
    }

    return result;
  }, [dequienesRelationships, mainRut]);

  if (!rows.length) {
    return (
      <div className="mt-4 mb-4">
        <h3 className="text-lg font-bold dark:text-white mb-4">{title}</h3>
        <p className="text-gray-500 dark:text-gray-400 italic text-sm py-4">
          No se detectaron empresas relacionadas con el RUT principal.
        </p>
      </div>
    );
  }

  const getChildren = (row: FlowRow): FlowRow[] =>
    rows.filter(r => r.parentId === row.id);

  const toggle = (id: number) =>
    setExpandedRows(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const maxLevel = rows.length ? Math.max(...rows.map(r => r.level)) : 0;

  const expandAll = () => {
    const all = new Set<number>();
    rows.forEach(r => {
      if (rows.some(c => c.parentId === r.id)) all.add(r.id);
    });
    setExpandedRows(all);
  };
  const collapseAll = () => setExpandedRows(new Set());

  const thStyle: React.CSSProperties = {
    border: '1px solid #e5e7eb', padding: '6px 8px', textAlign: 'left',
    fontSize: '12px', fontWeight: 600, color: '#374151',
    backgroundColor: '#f3f4f6', wordBreak: 'break-word',
  };
  const tdStyle: React.CSSProperties = {
    border: '1px solid #e5e7eb', padding: '6px 8px', fontSize: '13px',
    verticalAlign: 'middle', wordBreak: 'break-word',
  };

  const NivelBadge = ({ level }: { level: number }) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: '32px', height: '24px', borderRadius: '4px',
      backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: '12px', fontWeight: 700,
    }}>N{level}</span>
  );

  const EntityCell = ({ rut, name }: { rut: string; name: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '11px', color: '#9ca3af', flexShrink: 0 }}>{formatRut(rut)}</span>
      <span style={{ fontWeight: 500, color: '#111827' }}>{name || 'Sin nombre'}</span>
    </div>
  );

  const PctCell = ({ pct }: { pct: number | null }) =>
    pct != null ? (
      <span style={{ fontWeight: 500, color: '#111827' }}>{pct}%</span>
    ) : (
      <span style={{
        display: 'inline-block', fontSize: '11px', padding: '2px 8px',
        borderRadius: '4px', backgroundColor: '#e5e7eb', color: '#6b7280',
      }}>% no informado</span>
    );

  const DirectionBadge = ({ direction }: { direction: 'owned' | 'owner' }) => (
    <span style={{
      display: 'inline-block', fontSize: '10px', padding: '2px 6px',
      borderRadius: '4px',
      backgroundColor: direction === 'owned' ? '#dcfce7' : '#fef3c7',
      color: direction === 'owned' ? '#166534' : '#92400e',
      fontWeight: 600,
    }}>
      {direction === 'owned' ? 'Participa en' : 'Es dueño'}
    </span>
  );

  const renderRows = (currentRows: FlowRow[], bgBase: { count: number }): React.ReactElement[] => {
    const result: React.ReactElement[] = [];

    for (const row of currentRows) {
      const children = getChildren(row);
      const hasKids = children.length > 0;
      const isExpanded = forceExpanded || expandedRows.has(row.id);
      bgBase.count++;

      const indent = (row.level - 1) * 16;

      result.push(
        <tr key={row.id} style={{ backgroundColor: bgBase.count % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
          <td style={tdStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: `${indent}px` }}>
              {hasKids ? (
                <button
                  onClick={() => toggle(row.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: '#3b82f6', fontSize: '10px', lineHeight: 1, flexShrink: 0 }}
                  title={isExpanded ? 'Colapsar' : 'Expandir'}
                >
                  {isExpanded ? '\u25bc' : '\u25b6'}
                </button>
              ) : (
                <span style={{ width: '14px', flexShrink: 0 }} />
              )}
              <NivelBadge level={row.level} />
            </div>
          </td>
          <td style={tdStyle}>
            <EntityCell rut={row.sourceRut} name={row.sourceName} />
          </td>
          <td style={tdStyle}>
            <EntityCell rut={row.targetRut} name={row.targetName} />
          </td>
          <td style={tdStyle}><PctCell pct={row.percentage} /></td>
          <td style={tdStyle}><DirectionBadge direction={row.direction} /></td>
          <td style={{ ...tdStyle, fontSize: '12px', color: '#374151' }}>{row.tipoTarget}</td>
          <td style={{ ...tdStyle, fontSize: '12px', fontWeight: 500, color: '#374151' }}>{row.fuente}</td>
        </tr>
      );

      if (isExpanded && hasKids) {
        result.push(...renderRows(children, bgBase));
      }
    }

    return result;
  };

  const rootRows = rows.filter(r => r.parentId === null);
  const totalNodes = rows.length;

  return (
    <div className="mt-4 mb-4" data-pdf="mesh-flow-table">
      <h3 className="text-lg font-bold dark:text-white mb-3">{title}</h3>

      {!forceExpanded && (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 mb-3 flex flex-wrap items-center gap-3 text-sm">
          <span>
            <span className="text-gray-600 dark:text-gray-400">Empresas relacionadas: </span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{totalNodes}</span>
          </span>
          <span className="text-gray-300">|</span>
          <span>
            <span className="text-gray-600 dark:text-gray-400">Nivel máximo: </span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{maxLevel} / {MAX_DEPTH}</span>
          </span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={expandAll}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors"
            >
              ▶ Expandir todo
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-xs font-medium rounded transition-colors"
            >
              ↺ Colapsar todo
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '13px' }}>
          <colgroup>
            <col style={{ width: '85px' }} />
            <col style={{ width: '26%' }} />
            <col style={{ width: '26%' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '75px' }} />
          </colgroup>
          <thead>
            <tr style={{ backgroundColor: '#f3f4f6' }}>
              <th style={thStyle}>Nivel</th>
              <th style={thStyle}>Origen</th>
              <th style={thStyle}>Relacionado</th>
              <th style={thStyle}>%</th>
              <th style={thStyle}>Relación</th>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}>Fuente</th>
            </tr>
          </thead>
          <tbody>
            {renderRows(rootRows, { count: 0 })}
          </tbody>
        </table>
        <p className="text-xs text-gray-400 mt-1.5">
          Hasta {MAX_DEPTH} niveles · Personas naturales excluidas · BFS desde el RUT principal (mismas relaciones que MeshFlowChart).
        </p>
      </div>
    </div>
  );
};

export default MeshFlowTable;
