import React, { useState, useMemo } from 'react';
import { filterOutNotaryRelationships } from '../../../utils/dequienes';
import { formatChileanRutCanonical } from '../../../utils/rutCanonical';

/**
 * 🩹 FIX 29.09.2026: Helper centralizzato; la vecchia `formatRutForDisplay` con
 *    slice(0,-1) troncava 1 cifra DEL corpo quando il RUT arrivava a 8+ cifre e
 *    senza trattino (es. 20779347 sbagliato in 2077934-7 invece di 20779347-7).
 */
const formatRutForDisplay = formatChileanRutCanonical;

const MAX_DEPTH = 5;

// 🔧 Fix 21.09 v1.2: DV PRESERVAZIONE! split('-')[0] toglieva DV → mismatch con relazioni Dequines
const normalizeRut = (rut: string | number): string => {
  if (rut == null) return '';
  return String(rut).replace(/[^0-9Kk]/g, '').toLowerCase();
};

const normalizeRutOnlyDigits = (rut: string | number): string => String(rut ?? '').replace(/[^0-9]/g, '');

// 🔧 Fix 21.09 v1.5: RUT MATCH ROBUST 3-FALLBACK (stesso algoritmo di MeshTable)
const rutMatchRobust = (rutA: any, rutB: any): boolean => {
  if (!rutA || !rutB) return false;
  const a1 = normalizeRut(rutA), b1 = normalizeRut(rutB);
  if (a1 && b1 && a1 === b1) return true;
  const a2 = normalizeRutOnlyDigits(rutA), b2 = normalizeRutOnlyDigits(rutB);
  if (a2 && b2 && a2 === b2) return true;
  if (a2 && b2 && a2.length >= 7 && b2.length >= 7) {
    if (a2.startsWith(b2.slice(0, 8)) || b2.startsWith(a2.slice(0, 8))) return true;
    if (a2.includes(b2.slice(0, 8)) || b2.includes(a2.slice(0, 8))) return true;
  }
  return false;
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
  mainName?: string;
  height?: string | number;
  forceExpanded?: boolean;
}

const MeshFlowTable: React.FC<Props> = ({
  title = 'Mapa de Empresas en las que Participa',
  dequienesRelationships,
  mainRut,
  mainName = '',
  forceExpanded = false,
}) => {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // BFS bidireccional desde el centro, igual que MeshFlowChart
  const rows = useMemo<FlowRow[]>(() => {
    // Filtra via: scarta notari / conservador / registro civile (tipoDeParticipacion + nomi blacklist)
    const cleaned = filterOutNotaryRelationships(dequienesRelationships);
    if (!cleaned?.relationships?.length) return [];
    const { relationships, entityNames = {} } = cleaned;
    const cleanMain = normalizeRut(mainRut || '');
    if (!cleanMain) return [];

    // 🔧 Fix 22.09: getName con 6 FALLBACK — MAI PIÙ "Sin nombre" per main / middle enti
    //    Stesso algoritmo di MeshTable (L142) + iniezione esplicita mainName prop.
    const _normRutG = (r: any) => String(r ?? '').replace(/[^0-9Kk]/g, '').toLowerCase();
    const _normDigG = (r: any) => String(r ?? '').replace(/[^0-9]/g, '');
    const _rutMatchG = (a: any, b: any) => {
      if (!a || !b) return false;
      const a1 = _normRutG(a), b1 = _normRutG(b); if (a1 && b1 && a1 === b1) return true;
      const a2 = _normDigG(a), b2 = _normDigG(b); if (a2 && b2 && a2 === b2) return true;
      if (a2 && b2 && a2.length >= 7 && b2.length >= 7) { if (a2.startsWith(b2.slice(0, 8)) || b2.startsWith(a2.slice(0, 8))) return true; }
      return false;
    };
    // Inietta MAIN NAME (prop) → entityNames TANTO per mainRut normalizzato QUANTO in varianti (digits only / originali)
    const entityNamesAug: Record<string, string> = { ...(entityNames || {}) };
    if (mainName && String(mainName).trim() && cleanMain) {
      entityNamesAug[cleanMain] = entityNamesAug[cleanMain] || String(mainName).trim();
      if (_normDigG(mainRut)) entityNamesAug[_normDigG(mainRut)] = entityNamesAug[_normDigG(mainRut)] || String(mainName).trim();
      if (String(mainRut).trim()) entityNamesAug[String(mainRut).trim()] = entityNamesAug[String(mainRut).trim()] || String(mainName).trim();
    }

    const getName = (rut: string): string => {
      if (!rut) return '';
      const n1 = entityNamesAug[rut];
      if (n1) return n1;
      const n2 = entityNamesAug[_normRutG(rut)];
      if (n2) return n2;
      const n3 = entityNamesAug[_normDigG(rut)];
      if (n3) return n3;
      // 🔧 FALLBACK RELAZIONALE: scansione relationships per RUT match robusto
      //    (le relazioni hanno spesso name inline in source.name / information_source — entityNames può avere key sbagliate!)
      for (const r of relationships) {
        if (!r) continue;
        if (_rutMatchG(rut, r.source) && typeof r.source === 'object' && r.source?.name) return String(r.source.name);
        if (_rutMatchG(rut, r.target) && typeof r.target === 'object' && r.target?.name) return String(r.target.name);
        const inf = r.information_source || {};
        for (const side of ['entidad_a', 'entidad_b', 'entityA', 'entityB', 'owner', 'owned', 'socio', 'empresa'] as const) {
          const o = (inf as any)?.[side];
          if (o && _rutMatchG(rut, o?.rut || o?.RUT) && (o?.name || o?.nombre || o?.razonSocial)) {
            return String(o?.name || o?.nombre || o?.razonSocial);
          }
        }
      }
      return '';
    };

    // 🔧 Fix 21.09 v1.5: RIMUOVIAMO filtro !match_type! Stesso bug di MeshTable —
    //    match_type TRUE = relazioni trovate via provider Python (stimate ma CORRETTE per main).
    //    Se filtriamo per !match_type perdiamo TUTTE le 33+ relazioni OWNED_BY del main.
    const ownRels_raw_ALL = relationships.filter((r: any) => r && r.label === 'OWNED_BY');
    // Dedup robusto (source_norm__target_norm) — senza badare a match_type!
    const dedupFlow = new Set<string>();
    const ownRels: any[] = [];
    for (const r of ownRels_raw_ALL) {
      if (!r || (!r.source && !r.target)) continue;
      const k = normalizeRut(String(r.source ?? '')) + '__' + normalizeRut(String(r.target ?? ''));
      if (!dedupFlow.has(k)) { dedupFlow.add(k); ownRels.push(r); }
    }

    // 🔧 Fix 25.09: SEPARAZIONE NETTA — MeshFlowTable = SOLO partecipazioni (OWNED / dove main è PROPRIETARIO).
    //    RIMUOVIAMO il ramo "owners" (padri / struttura di proprietà) — esclusivamente in MeshTable.
    //    Semantica OWNED_BY canonica: source = ENTITÀ POSSEDUTA, target = PROPRIETARIO.
    //    → main in target = main è proprietario → source = società posseduta (FIGLIA ✔︎ partecipazione).
    //    → main in source = main è posseduta → NON va qui (è STRUTTURA PROPRIETÀ ✘).
    //
    //    Normalizzazione BIDIREZIONALE resta ma:
    //      • A N1 (cur = cleanMain) usiamo solo owned (main è proprietario) per evitare
    //        "inclusioni inverse" dovute al bidirezionale totale.
    //      • Da N2+ usiamo pool completo (società intermedia potrebbe avere relazioni flipped
    //        nel JSON rispetto alla direzione canonica).
    const unionKeyFlow = new Set<string>();
    const bfsFlowPool: any[] = [];
    for (const r of ownRels) {
      const s = normalizeRut(String(r.source || ''));
      const t = normalizeRut(String(r.target || ''));
      if (!s || !t || s === t) continue;
      const k1 = `${s}__${t}`;
      if (!unionKeyFlow.has(k1)) {
        unionKeyFlow.add(k1);
        bfsFlowPool.push({ ...r, _direction: 'direct' });
      }
      const k2 = `${t}__${s}`;
      if (!unionKeyFlow.has(k2)) {
        unionKeyFlow.add(k2);
        bfsFlowPool.push({
          ...r,
          _flippedDirection: true,
          source: String(r.target || ''),
          target: String(r.source || ''),
        });
      }
    }
    const ownRelsNormalizzatoFlow = bfsFlowPool;

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

      // "Empresas donde participa cur" (cur POSSEE / è proprietario):
      //   cur = TARGET (proprietario) → SOURCE = società posseduta (figlia).
      const owned = bfsFlowPool.filter((r: any) => rutMatchRobust(r.target, cur));
      for (const r of owned) {
        const childRut = normalizeRut(String(r.source || ''));
        if (!childRut || rutMatchRobust(childRut, cur)) continue;
        // 🔧 Fix 25.09: A N1 scartiamo le relazioni flipped-inverse dove main sarebbe
        //    in source (main posseduta). Il bidirezionale totale infatti aggiunge
        //    anche OWNED_BY(main, dueño) come flipped (source=dueño, target=main)
        //    → ritorna in questo owned filter come "dueño è proprietario di main".
        //    Per evitare che escano come "partecipazioni di main" i DUEÑOS di main,
        //    a N1 imponiamo che child NON sia un match di cleanMain e che r._direction
        //    originale non fosse quella flipped inversa.
        if (level === 0) {
          // Figlia NON può coincidere col dueño di main (inversione strutturale).
          // Test: se child matcha r.source e cur matcha r.target nella relazione
          // ORIGINALE (prima del flip) → OK.
          // Se invece la relazione matchava nell'inverso originale (main=source,
          // dueño=target) → SKIP (è struttura di proprietà, non partecipazione).
          const origS = normalizeRut(String((r._flippedDirection ? r.target : r.source) || ''));
          const origT = normalizeRut(String((r._flippedDirection ? r.source : r.target) || ''));
          // Relazione ORIGINALE dove main fosse in source = STRUTTURA PROPRIETÀ → salta
          if (rutMatchRobust(origS, cleanMain) && !rutMatchRobust(origT, cleanMain)) {
            // origS=main e origT≠main → originalmente main era posseduta → skip
            continue;
          }
        }
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
        if (isSociedad(childRut)) queue.push({ rut: childRut, level: level + 1, parentId: id });
      }

      // 🔧 Fix 25.09: RIMOSSO il blocco owners (struttura di proprietà).
      //   Da N2+ si esplora solo owned ricorsiva (solo partecipazioni).
    }

    // 🔧 DEBUG ESPLICITO 22.09: stampa SEMPRE (una tantum via console + PrintOnce) counts per vedere se è
    //    normalizzazione / filtro isSociedad / BFS ad aver creato rows=[]
    try {
      const __dbgPrintedKey = `mfdbg_${cleanMain}__${ownRels.length}__${ownRelsNormalizzatoFlow.length}__${result.length}`;
      if (typeof window !== 'undefined') {
        const w: any = window;
        w.__mfdbg_seen = w.__mfdbg_seen || new Set();
        if (!w.__mfdbg_seen.has(__dbgPrintedKey)) {
          w.__mfdbg_seen.add(__dbgPrintedKey);
          // eslint-disable-next-line no-console
          console.table([
            {
              item: 'cleanMain (norm)', value: cleanMain,
            },
            { item: 'mainRut (prop)', value: String(mainRut || '') },
            { item: '# ownRels raw (label=OWNED_BY)', value: ownRels.length },
            { item: '# OWNED_BY main match source (Caso A)', value: ownRels.filter((r: any) => rutMatchRobust(r.source, cleanMain)).length },
            { item: '# OWNED_BY main match target (Caso B)', value: ownRels.filter((r: any) => rutMatchRobust(r.target, cleanMain)).length },
            { item: '# ownRelsNormalizzatoFlow (union direct+flipped)', value: ownRelsNormalizzatoFlow.length },
            {
              item: '# owned post-norm (main=target)',
              value: ownRelsNormalizzatoFlow.filter((r: any) => rutMatchRobust(r.target, cleanMain)).length,
            },
            {
              item: '# owners post-norm (main=source)',
              value: ownRelsNormalizzatoFlow.filter((r: any) => rutMatchRobust(r.source, cleanMain)).length,
            },
            { item: '# SOCIETÀ in owned (main)', value: ownRelsNormalizzatoFlow.filter((r: any) => rutMatchRobust(r.target, cleanMain) && isSociedad(String(r.source || ''))).length },
            { item: '# PERSONE in owned (main)', value: ownRelsNormalizzatoFlow.filter((r: any) => rutMatchRobust(r.target, cleanMain) && !isSociedad(String(r.source || ''))).length },
            { item: '# rows finali (BFS)', value: result.length },
          ]);
        }
      }
    } catch (e) { /* non bloccante */ }

    return result;
  }, [dequienesRelationships, mainRut]);

  if (!dequienesRelationships) {
    return null;
  }
  const cleanedCheck = filterOutNotaryRelationships(dequienesRelationships);
  const emptyRels = Array.isArray(cleanedCheck)
    ? !cleanedCheck.length
    : !(cleanedCheck?.relationships?.length);
  if (emptyRels) {
    return null;
  }
  const rootIsPerson = !isSociedad(String(mainRut || ''));
  if (rootIsPerson) {
    return null;
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
      <span style={{ fontSize: '11px', color: '#9ca3af', flexShrink: 0 }}>{formatRutForDisplay(rut)}</span>
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

  // 🔧 FIX 22.09: sezione VUOTA → MOSTRA SEMPRE IL BOX (come MeshTable),
  //    invece di ritornare null (che lo faceva "sparire" del tutto — es. 78135280-2).
  //    MAI PIÙ sparizione totale; se empty, mostra titolo + msg (stesso stile di MeshTable Sin datos).
  const hasRows = rows.length > 0;

  return (
    <div className="mt-4 mb-4" data-pdf="mesh-flow-table">
      <h3 className="text-lg font-bold dark:text-white mb-3">{title}</h3>

      {!forceExpanded && hasRows && (
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

      {hasRows ? (
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
        </div>
      ) : (
        <p className="text-gray-500 dark:text-gray-400 italic text-sm py-4">Sin datos de malla societaria</p>
      )}
    </div>
  );
};

export default MeshFlowTable;
