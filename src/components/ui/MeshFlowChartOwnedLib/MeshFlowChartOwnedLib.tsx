import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  applyNodeChanges,
  type Node,
  type Edge,
  type NodeProps,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// 🔧 Fix 25.09: RUT FORMAT SBAGLIATO!
//   formatRut() da rutFormat.ts CALCOLA DV da zero (tutti i digit = corpo)
//   → "14243612" (8digit: corpo+DV insieme) → "14243612-X" invece di "1424361-2"
//   Soluzione: stesso algoritmo di formatChileanRut (preserva ultimo char come DV).
const formatRutForDisplay = (rut: string | number): string => {
  if (rut == null) return '';
  const clean = String(rut).replace(/[^0-9Kk]/g, '').toUpperCase();
  if (clean.length < 2) return clean;
  const dv = clean.charAt(clean.length - 1);
  const body = clean.substring(0, clean.length - 1).replace(/^0+/, '') || '0';
  return `${body}-${dv}`;
};

/**
 * MeshFlowChartOwned — mapa de participaciones (red bidireccional) + socios directos.
 * (versione FIX 15.09 v1.5-duxiter: RIMOSSO filtro match_type e aggiunto normalize robusto 3 fallback!)
 *
 * Render con @xyflow/react usando layout RADIAL:
 *  - El RUT principal va al centro.
 *  - Empresas relacionadas en anillos concéntricos según su nivel.
 *  - Socios (personas naturales) que poseen directamente el RUT principal
 *    se muestran como nodos VERDE CLARO en el primer anillo.
 *  - Nodos arrastrables (drag).
 *
 * BFS bidireccional para empresas:
 *  - Cada empresa expande TODAS sus relaciones OWNED_BY con otras empresas,
 *    en ambos sentidos (poseídas y dueñas). No se pierden relaciones laterales.
 *  - Las personas naturales NO se expanden: solo se agregan los socios directos
 *    del RUT principal (1 nivel).
 */

const MAX_DEPTH = 5;

// 🔧 NUCLEAR PRINT-ONCE GUARD (module-level, non resetta tra mount/re-render!)
const __MESHFL_PRINTED_KEYS: Set<string> = new Set();
const printOnceFl = (key: string, ...args: any[]) => {
  if (__MESHFL_PRINTED_KEYS.has(key)) return;
  __MESHFL_PRINTED_KEYS.add(key);
  console.log(...args);
};
const tableOnceFl = (key: string, ...args: any[]) => {
  if (__MESHFL_PRINTED_KEYS.has(key)) return;
  __MESHFL_PRINTED_KEYS.add(key);
  console.table(...args);
};

// dimensiones de nodo (en px) usadas tanto por el render como por il layout
const NODE_WIDTH = 220;
const NODE_HEIGHT = 90;

// radios de cada anillo: nivel 0 = centro, 1..5 = anillos concéntricos
const RING_RADIUS = [0, 320, 600, 880, 1160, 1440];

// ---- helpers ----
// 🔧 Fix v1.5-duxiter: normalize robusto (come in MeshTable rutMatchRobust!)
const normalizeRut = (rut: string | number): string => {
  if (rut == null) return '';
  return String(rut).replace(/[^0-9Kk]/g, '').toLowerCase();
};
const digitsOnly = (rut: string | number): string => {
  if (rut == null) return '';
  return String(rut).replace(/[^0-9]/g, '');
};
const rutMatchRobust = (a: any, b: any): boolean => {
  const a1 = normalizeRut(a), b1 = normalizeRut(b);
  if (a1 && b1 && a1 === b1) return true;
  const a2 = digitsOnly(a), b2 = digitsOnly(b);
  if (a2 && b2 && a2 === b2) return true;
  if (a2 && b2 && a2.length >= 7 && b2.length >= 7) {
    return a2.startsWith(b2.slice(0, 8)) || b2.startsWith(a2.slice(0, 8)) ||
           a2.includes(b2.slice(0, 8)) || b2.includes(a2.slice(0, 8));
  }
  return false;
};

const isSociedad = (rut: string): boolean => {
  const n = parseInt(digitsOnly(rut).slice(0, 8), 10);
  return !isNaN(n) && n >= 25_000_000;
};

const extractPct = (info: any): number | null => {
  if (!info) return null;
  const v = info.shares_percent ?? info.percentage ?? null;
  return v != null ? Number(v) : null;
};

// Formatea il porcentaje a un máximo de 2 decimales, sin ceros sobrantes.
const formatPct = (v: number | null): string | undefined => {
  if (v == null || Number.isNaN(v)) return undefined;
  const rounded = Math.round(v * 100) / 100;
  return `${rounded.toLocaleString('es-CL', { maximumFractionDigits: 2 })}%`;
};

interface GraphNode {
  rut: string;
  name: string;
  level: number;
  isCompany: boolean;
}

interface GraphEdge {
  from: string; // rut origen (el poseído)
  to: string;   // rut destino (el dueño)
  percentage: number | null;
}

// ---- nodo custom: 4 handles nombrados (top/right/bottom/left) per enrutar
// le frecce por il lato corretto e evitare sovrapposizione ----
interface MeshNodeData {
  level: number;
  rut: string;
  name: string;
  isMain: boolean;
  isPerson: boolean;
}

const HANDLE_STYLE: React.CSSProperties = { opacity: 0, width: 1, height: 1, border: 'none', background: 'transparent' };

const MeshNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as unknown as MeshNodeData;
  const { level, rut, name, isMain, isPerson } = d;

  let background = '#ffffff';
  let border = '1px solid #60a5fa';
  let badgeColor = '#6b7280';
  let nameColor = '#111827';
  let typeLabel = 'Empresa';

  if (isMain) {
    background = '#2563eb';
    border = '2px solid #1d4ed8';
    badgeColor = '#bfdbfe';
    nameColor = '#ffffff';
  } else if (isPerson) {
    background = '#dcfce7';        // verde claro (green-100)
    border = '1px solid #4ade80';  // green-400
    badgeColor = '#15803d';        // green-700
    nameColor = '#14532d';         // green-900
    typeLabel = 'Socio';
  }

  // Ogni lato ha un handle source e uno target con lo stesso id di lato.
  const sides: Array<{ id: 'top' | 'right' | 'bottom' | 'left'; pos: Position }> = [
    { id: 'top', pos: Position.Top },
    { id: 'right', pos: Position.Right },
    { id: 'bottom', pos: Position.Bottom },
    { id: 'left', pos: Position.Left },
  ];

  return (
    <div
      style={{
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
        padding: 8,
        background,
        border,
        borderRadius: 10,
        boxShadow: isMain ? '0 4px 12px rgba(37,99,235,0.35)' : '0 2px 4px rgba(0,0,0,0.06)',
        boxSizing: 'border-box',
        textAlign: 'left',
        lineHeight: 1.3,
      }}
    >
      {sides.map((s) => (
        <React.Fragment key={s.id}>
          <Handle type="source" id={s.id} position={s.pos} style={HANDLE_STYLE} isConnectable={false} />
          <Handle type="target" id={s.id} position={s.pos} style={HANDLE_STYLE} isConnectable={false} />
        </React.Fragment>
      ))}

      <div style={{ fontSize: 10, color: isMain ? '#bfdbfe' : badgeColor, marginBottom: 2 }}>
        N{level} · {typeLabel}
      </div>
      <div
        style={{
          fontSize: 11,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          color: isMain ? '#dbeafe' : badgeColor,
          marginBottom: 2,
        }}
      >
        {formatRutForDisplay(rut)}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: nameColor, whiteSpace: 'normal', wordBreak: 'break-word' }}>
        {name || 'Sin nombre'}
      </div>
    </div>
  );
};

const NODE_TYPES = { mesh: MeshNode };

// ---- props ----
interface MeshFlowChartOwnedProps {
  title?: string;
  dequienesRelationships: any;
  mainRut: string;
  /** NOME VERO IMPRESA MAIN (da cleanedData.companyGeneralInfo) — FALLBACK 0 BEST! Se non c'è usa entityNames con lookup robusto. */
  mainCompanyName?: string;
  /** alto del viewport en pantalla (ignorado quando forceExpanded = true) */
  height?: string | number;
  /** true durante la exportación PDF: renderiza il mapa inline expandido */
  forceExpanded?: boolean;
}

// ---- builder: converte il grafo logico in nodes/edges di React Flow con layout radial ----
const buildRadialLayout = (
  graph: { nodes: Map<string, GraphNode>; edges: GraphEdge[]; rootRut: string },
  effectiveMaxLevel: number
): { nodes: Node[]; edges: Edge[] } => {
  const visible: GraphNode[] = [];
  graph.nodes.forEach((n) => {
    if (n.level <= effectiveMaxLevel) visible.push(n);
  });
  const visibleRuts = new Set(visible.map((n) => n.rut));

  // raggruppare per livello per repartire en cada anillo
  const byLevel = new Map<number, GraphNode[]>();
  for (const n of visible) {
    if (!byLevel.has(n.level)) byLevel.set(n.level, []);
    byLevel.get(n.level)!.push(n);
  }

  // posiciones (centro de cada nodo) per calcolare il lato dei handles
  const centers = new Map<string, { x: number; y: number }>();

  const rfNodes: Node[] = visible.map((n) => {
    const isMain = n.rut === graph.rootRut;
    const isPerson = !n.isCompany;

    let cx = 0;
    let cy = 0;
    if (!isMain) {
      const ringNodes = byLevel.get(n.level)!;
      const idx = ringNodes.findIndex((rn) => rn.rut === n.rut);
      const count = ringNodes.length;
      const r = RING_RADIUS[Math.min(n.level, RING_RADIUS.length - 1)];
      // offset alternado entre anillos para que los nodos de niveles consecutivos no queden alineados
      const offset = n.level % 2 === 0 ? Math.PI / count : 0;
      const angle = (2 * Math.PI * idx) / count + offset - Math.PI / 2;
      cx = r * Math.cos(angle);
      cy = r * Math.sin(angle);
    }
    centers.set(n.rut, { x: cx, y: cy });

    return {
      id: n.rut,
      type: 'mesh',
      // React Flow usa il top-left como posición → centriamo restando media dimensione
      position: { x: cx - NODE_WIDTH / 2, y: cy - NODE_HEIGHT / 2 },
      data: {
        level: n.level,
        rut: n.rut,
        name: n.name,
        isMain,
        isPerson,
      },
    };
  });

  const visibleEdges = graph.edges.filter(
    (e) => visibleRuts.has(e.from) && visibleRuts.has(e.to)
  );

  // Scegliere handles según la posición relativa de los nodos, para che le
  // frecce escano/entren por il lato corretto e non si sovrappongano.
  // Il nodo custom 'mesh' espone 4 handles nombrados (top/right/bottom/left),
  // ognuno come source e target.
  const pickSide = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0
        ? { source: 'right', target: 'left' }
        : { source: 'left', target: 'right' };
    }
    return dy >= 0
      ? { source: 'bottom', target: 'top' }
      : { source: 'top', target: 'bottom' };
  };

  const rfEdges: Edge[] = visibleEdges.map((e, idx) => {
    const a = centers.get(e.from) || { x: 0, y: 0 };
    const b = centers.get(e.to) || { x: 0, y: 0 };
    const sides = pickSide(a, b);
    return {
      id: `${e.from}->${e.to}#${idx}`,
      source: e.from,
      target: e.to,
      sourceHandle: sides.source,
      targetHandle: sides.target,
      type: 'straight', // líneas rectas diagonales
      label: formatPct(e.percentage),
      labelStyle: { fontSize: 10, fontWeight: 700, fill: '#1d4ed8' },
      labelBgStyle: { fill: '#eff6ff', stroke: '#bfdbfe' },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#94a3b8',
        width: 18,
        height: 18,
      },
      style: { stroke: '#94a3b8', strokeWidth: 1.6 },
    };
  });

  return { nodes: rfNodes, edges: rfEdges };
};

// ---- subcomponente: il lienzo de React Flow con refit automático al cambiar el livello ----
interface FlowCanvasProps {
  layouted: { nodes: Node[]; edges: Edge[] };
  effectiveMaxLevel: number;
  forceExpanded: boolean;
}

const FlowCanvas: React.FC<FlowCanvasProps> = ({ layouted, effectiveMaxLevel, forceExpanded }) => {
  const [nodes, setNodes] = useNodesState(layouted.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layouted.edges);
  const { fitView } = useReactFlow();

  // 🔧 FIX 21.09: MIDDLEWARE CUSTOM onNodesChange SICURO!
  // ReactFlow built-in `applyNodeChanges` (triggerato da ZOOM / DRAG / PAN) DISTRUGGE I CAMPI CUSTOM dentro data:
  // → data.level, data.rut, data.name, data.isMain, data.isPerson diventano undefined!
  // → MeshNode vede TUTTO vuoto → stili invisibili, nodi sembrano "spariti" dopo zoom!
  // Soluzione: PRIMA di setNodes, RIPRISTINIAMO TUTTI i campi data.* dal NODO ORIGINALE (layouted.nodes, fonte VERITA'!)
  const safeOnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((prevNodes) => {
        // Passo 1: Applica i cambiamenti standard (position, select, dimension, etc.)
        const updated = applyNodeChanges(changes, prevNodes);

        // Passo 2: Build mappa origine VERITA' (layouted.nodes)
        const origMap = new Map<string, any>();
        layouted.nodes.forEach((n: any) => { origMap.set(String(n.id), n); });
        // Backup mappa da prevNodes (se layouted non lo ha — raro!)
        const prevMap = new Map<string, any>();
        prevNodes.forEach((n: any) => { prevMap.set(String(n.id), n); });

        // Passo 3: Per ogni nodo aggiornato → RIPRISTINA data.* + level custom root node
        const fixed = updated.map((node) => {
          const id = String(node.id);
          const orig: any = origMap.get(id) || prevMap.get(id);

          if (!orig) return node; // nodo non trovato (molto raro!)

          // Data origine: priorita' orig.data (verita'), fallback orig stessa (se custom fuori data)
          const origData = orig.data || orig;
          const curNode: any = node;
          const curData = curNode.data || {};
          const curLevel = curNode.level ?? curData.level ?? undefined;
          const livelloFisso: number = (orig as any).level ?? origData.level ?? 0;

          // 🔧 FIX 21.09: SE I CAMPI SONO GIA' TUTTI PRESENTI E CORRETTI → NON creare nuovo oggetto!
          // (React shallow compare = stesso reference = NON re-render del nodo!)
          const giaCorretto =
            curLevel === livelloFisso &&
            curData.level === origData.level &&
            String(curData.rut || '') === String(origData.rut || '') &&
            String(curData.name || 'Sin nombre') === String(origData.name || 'Sin nombre') &&
            Boolean(curData.isMain) === Boolean(origData.isMain) &&
            Boolean(curData.isPerson) === Boolean(origData.isPerson);

          if (giaCorretto) return node; // 👉 SAME REFERENCE → NO RE-RENDER! No blink! 🎉

          // Costruisci data NUOVO con tutti i campi CUSTOM + eventuali nuove chiavi di ReactFlow
          const dataFixed: any = {
            level: origData.level ?? (orig as any).level ?? 0,
            rut: origData.rut ?? (orig as any).rut ?? '',
            name: origData.name ?? (orig as any).name ?? 'Sin nombre',
            isMain: origData.isMain ?? (orig as any).isMain ?? false,
            isPerson: origData.isPerson ?? (orig as any).isPerson ?? false,
            // Campi che ReactFlow magari aggiunge in data (non perdiamoli!)
            ...curData,
          };

          return {
            ...node,
            level: livelloFisso,
            data: dataFixed,
          };
        });
        return fixed;
      });
    },
    [setNodes, layouted.nodes]
  );

  // 🔧 FIX 21.09 BIS: Safety filter prima di passare nodes a ReactFlow!
  // Per sicurezza, se per caso un nodo ha level undefined → cerchiamo in layouted.nodes origine!
  // Filtro visibilita' SEMPRE applicato (non dipende piu' da data.level corrotto!)
  const safeNodesForRender = useMemo(() => {
    const levelMap = new Map<string, number>();
    layouted.nodes.forEach((n: any) => {
      const id = String(n.id);
      const lvl = n.level ?? n.data?.level ?? 0;
      levelMap.set(id, lvl);
    });
    return nodes.filter((n: any) => {
      const id = String(n.id);
      const levelFallback = levelMap.get(id) ?? 0;
      const level = (n as any).level ?? n.data?.level ?? levelFallback;
      return level <= effectiveMaxLevel;
    });
  }, [nodes, effectiveMaxLevel, layouted.nodes]);

  // Refs per il fitView + nodi/edges (evitiamo dipendenze cambiano ogni render!)
  const fitViewRef = useRef(fitView);
  const setNodesRef = useRef(setNodes);
  const setEdgesRef = useRef(setEdges);
  const lastLayoutedKeyRef = useRef<string>('__INIT__');
  fitViewRef.current = fitView;
  setNodesRef.current = setNodes;
  setEdgesRef.current = setEdges;

  // quando cambia il livello o il grafo se reconstruye → resetemos posiciones a la griglia radial
  useEffect(() => {
    // Key univoca: se non cambia, NON facciamo NULLA! (evita 30+ re-render/sec!)
    // layouted.nodes può cambiare ref per motivi tecnici ma se lunghezza e ID primi 3 sono uguali → STESSO!
    const primi3 = layouted.nodes.slice(0, 3).map((n: any) => String(n.id)).join('|');
    const key = `${layouted.nodes.length}__${primi3}__${effectiveMaxLevel}`;
    if (key === lastLayoutedKeyRef.current) return;
    lastLayoutedKeyRef.current = key;

    setNodesRef.current(layouted.nodes);
    setEdgesRef.current(layouted.edges);

    // Chiamiamo fitView SUBITO + ridoppiamo dopo 250ms solo per sicurezza (1 SOLA COPPIA!)
    try { fitViewRef.current({ padding: 0.2, duration: 150 }); } catch(e){}
    const t = setTimeout(() => {
      try { fitViewRef.current({ padding: 0.25, duration: 250 }); } catch(e){}
    }, 250);
    return () => clearTimeout(t);
    // 🚨 DEPS VUOTE! Rifaremo solo quando cambia veramente layouted dal useMemo (parent!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layouted, effectiveMaxLevel]);

  return (
    <ReactFlow
      nodes={safeNodesForRender}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodesChange={safeOnNodesChange}
      onEdgesChange={onEdgesChange}
      // 🔧 FIX 21.09: RIMOSSI `fitView` + `fitViewOptions` DALLE PROPS!
      // La prop `fitView={true}` faceva AUTO-fitView AD OGNI CAMBIAMENTO AI NODI (incluso ZOOM!) → zoom tornava indietro subito! 😱
      // Ora fitView viene chiamato SOLO da useEffect (quando grafo/livello cambia!), non internamente da ReactFlow.
      // 🔧 FIX 21.09: style height/width ESPLICITI 100%!
      // ReactFlow bug classico: senza style height esplicito (o 100% + container padre height) rende height=0!
      style={{ height: '100%', width: '100%', minHeight: 400 }}
      nodesDraggable={!forceExpanded}
      nodesConnectable={false}
      elementsSelectable={!forceExpanded}
      panOnDrag={!forceExpanded}
      zoomOnScroll={!forceExpanded}
      zoomOnPinch={!forceExpanded}
      zoomOnDoubleClick={!forceExpanded}
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} />
      {!forceExpanded && <Controls showInteractive={false} />}
      {!forceExpanded && <MiniMap pannable zoomable />}
    </ReactFlow>
  );
};

// ---- componente principal ----
const MeshFlowChartOwned: React.FC<MeshFlowChartOwnedProps> = ({
  title = 'Mapa de Empresas Controladas',
  dequienesRelationships,
  mainRut,
  mainCompanyName,
  height = 600,
  forceExpanded = false,
}) => {
  // 1) Construire il grafo (BFS bidireccional para empresas + socios directos)
  const graph = useMemo(() => {
    if (!dequienesRelationships?.relationships?.length) return null;

    const { relationships, entityNames = {} } = dequienesRelationships;

    // 🔧 FIX 21.09: getName SUPER ROBUSTO 5 FALLBACK!
    // (entityNames puo' avere chiavi in QUALSIASI formato: con trattino / senza trattino / solo cifre / k finale!)
    const allEntityKeys = Object.keys(entityNames || {});
    const getName = (rut: string, isMain = false): string => {
      // 🔥 FALLBACK 0 (MAIN SOLO!) — NOME VERO da cleanedData.companyGeneralInfo, passato dal genitore! BEST!
      if (isMain && mainCompanyName && String(mainCompanyName).trim().length > 0) {
        return String(mainCompanyName).trim();
      }
      const r = String(rut || '').trim();
      if (!r) return '';
      const candidates = [
        r,
        normalizeRut(r),
        digitsOnly(r),
        r.replace(/\./g, ''),
        r.replace(/\./g, '').replace('-', ''),
      ];
      // Fallback 1-3: match diretto su varianti
      for (const c of candidates) {
        if (c && entityNames[c]) return String(entityNames[c]);
      }
      // Fallback 4 (SLOW, solo se non trovato): rutMatchRobust SU TUTTE le chiavi entityNames!
      for (const k of allEntityKeys) {
        if (rutMatchRobust(k, r)) return String(entityNames[k]);
      }
      return '';
    };

    const cleanMain = normalizeRut(mainRut || '');
    if (!cleanMain) return null;

    // 🔧 Fix v1.5-duxiter: RIMOSSO filtro match_type!
    // (come in MeshTable v1.5 — prima buttava via TUTTE le MAIN relazioni con match_type=TRUE!)
    const ownRels_raw_ALL = (relationships || []).filter((r: any) => r && r.label === 'OWNED_BY');
    // dedup source_norm__target_norm
    const dedup = new Set<string>();
    const ownRels: any[] = [];
    for (const r of ownRels_raw_ALL) {
      if (!r || (!r.source && !r.target)) continue;
      const k = normalizeRut(String(r.source ?? '')) + '__' + normalizeRut(String(r.target ?? ''));
      if (!dedup.has(k)) { dedup.add(k); ownRels.push(r); }
    }

    const nodes = new Map<string, GraphNode>();
    nodes.set(cleanMain, {
      rut: cleanMain,
      name: getName(cleanMain, true), // 🔧 isMain=true → FALLBACK 0 mainCompanyName!
      level: 0,
      isCompany: isSociedad(cleanMain),
    });

    // BFS bidirezionale SOLO tra aziende
    const queue: string[] = [cleanMain];
    while (queue.length) {
      const cur = queue.shift()!;
      const curNode = nodes.get(cur)!;
      if (curNode.level >= MAX_DEPTH) continue;

      // Aziende possedute da `cur` -> target = cur (freccia hacia dentro)
      const owned = ownRels.filter((r: any) => rutMatchRobust(r.target, cur));
      for (const r of owned) {
        const childRut = normalizeRut(String(r.source || ''));
        if (!childRut || childRut === cur) continue;
        if (!isSociedad(childRut)) continue; // solamente aziende
        if (!nodes.has(childRut)) {
          nodes.set(childRut, {
            rut: childRut,
            name: getName(childRut),
            level: curNode.level + 1,
            isCompany: true,
          });
          queue.push(childRut);
        }
      }

      // Aziende dueñas di `cur` -> source = cur (freccia hacia fuera)
      const owners = ownRels.filter((r: any) => rutMatchRobust(r.source, cur));
      for (const r of owners) {
        const parentRut = normalizeRut(String(r.target || ''));
        if (!parentRut || parentRut === cur) continue;
        if (!isSociedad(parentRut)) continue; // solamente aziende
        if (!nodes.has(parentRut)) {
          nodes.set(parentRut, {
            rut: parentRut,
            name: getName(parentRut),
            level: curNode.level + 1,
            isCompany: true,
          });
          queue.push(parentRut);
        }
      }
    }

    // Socios diretti del RUT principale: persone naturali che posseggono il centro.
    // (relazione OWNED_BY dove target = cleanMain e source è persona naturale)
    const directOwners = ownRels.filter(
      (r: any) => rutMatchRobust(r.target, cleanMain)
    );
    for (const r of directOwners) {
      const ownerRut = normalizeRut(String(r.source || ''));
      if (!ownerRut || ownerRut === cleanMain) continue;
      if (isSociedad(ownerRut)) continue;      // già coperti dal BFS di aziende
      if (nodes.has(ownerRut)) continue;
      nodes.set(ownerRut, {
        rut: ownerRut,
        name: getName(ownerRut),
        level: 1,
        isCompany: false,                       // persona naturale → socio (verde)
      });
    }

    // Aristas: una por cada relazione OWNED_BY che connette due nodi del grafo.
    // Dirección: source (poseído) -> target (dueño).
    const edges: GraphEdge[] = [];
    const seenEdgeKeys = new Set<string>();
    for (const r of ownRels) {
      const fromRut = normalizeRut(String(r.source || ''));
      const toRut = normalizeRut(String(r.target || ''));
      if (!fromRut || !toRut) continue;
      if (!nodes.has(fromRut) || !nodes.has(toRut)) continue;
      const pct = extractPct(r.information_source);
      const key = `${fromRut}|${toRut}|${pct ?? 'null'}`;
      if (seenEdgeKeys.has(key)) continue;
      seenEdgeKeys.add(key);
      edges.push({ from: fromRut, to: toRut, percentage: pct });
    }

    // banner debug ROSA v1.5-duxiter (stesso stile di MeshTable)
    if (typeof window !== 'undefined') {
      try {
        const ownMtFalse = ownRels.filter((r: any) => !r?.information_source?.match_type);
        const ownMtTrue = ownRels.filter((r: any) => r?.information_source?.match_type === true);
        const mainCount = ownRels.filter((r: any) => rutMatchRobust(r.source, cleanMain) || rutMatchRobust(r.target, cleanMain)).length;
        const nodeCount = nodes.size - 1;
        printOnceFl('meshflow_v1.5_duxiter', `%c   ➕ [MESH FLOW v1.5-duxiter 🔥 RADIAL!] OWNED_BY raw=${ownRels_raw_ALL.length} dedup=${ownRels.length} noMt=${ownMtFalse.length} mtTrue=${ownMtTrue.length} | MAIN dentro ownRels: ${mainCount} | nodi: ${nodeCount} | edges: ${edges.length}`, 'color:#831843;background:#fce7f3;border:1px solid #f9a8d4;padding:2px 10px;border-radius:4px;font-weight:700');
      } catch(e){}
    }

    return { nodes, edges, rootRut: cleanMain };
  }, [dequienesRelationships, mainRut]);

  // 2) Estado di espansione e modal
  // 🔧 FIX 21.09: init 99 (> MAX_DEPTH 5) → TUTTI I LIVELLI SEMPRE VISIBILI di default!
  // NESSUN setState dinamico iniziale (evitiamo loop re-render che facevano sparire nodi mezzo secondo!)
  const [maxVisibleLevel, setMaxVisibleLevel] = useState(99);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const totalMaxLevel = useMemo(() => {
    if (!graph) return 0;
    let max = 0;
    graph.nodes.forEach((n) => {
      if (n.level > max) max = n.level;
    });
    return max;
  }, [graph]);

  // ✅ Safety: effectiveMaxLevel MAI minore di totalMaxLevel se siamo in auto-mode (init 99)
  // Evita che durante re-render maxVisibleLevel venga temporaneamente abbassato a 2!
  const __autoExpanded = maxVisibleLevel >= 99;
  const effectiveMaxLevel =
    forceExpanded
      ? totalMaxLevel
      : __autoExpanded
        ? Math.max(totalMaxLevel, 2)  // auto: TUTTI i livelli disponibili!
        : Math.max(maxVisibleLevel, 1);  // manuale: minimo 1 (sempre MAIN + N1 visibili!)

  // 3) Layout radial: pre-cómputo di nodes/edges para React Flow
  const layouted = useMemo(() => {
    if (!graph) return { nodes: [] as Node[], edges: [] as Edge[] };
    return buildRadialLayout(graph, effectiveMaxLevel);
  }, [graph, effectiveMaxLevel]);

  const showNextLevel = useCallback(() => {
    setMaxVisibleLevel((v) => Math.min(v + 1, totalMaxLevel));
  }, [totalMaxLevel]);

  const collapseAll = useCallback(() => setMaxVisibleLevel(0), []);

  const setLevel = useCallback(
    (lvl: number) => {
      setMaxVisibleLevel(Math.min(Math.max(lvl, 0), totalMaxLevel));
    },
    [totalMaxLevel]
  );

  // Chiudere modal con tecla Escape
  useEffect(() => {
    if (!isModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isModalOpen]);

  // 🔧 FIX 21.09: timestamp primo render per safety "caricamento iniziale"
  // Per i primi 1000ms NON mostriamo MAI messaggio "nessuna impresa" (graph.nodes.size puo' essere temporaneamente 1!)
  const [firstRenderedAt] = useState(() => Date.now());
  const stillLoading = () => (Date.now() - firstRenderedAt) < 1500;

  // 🔧 FIX 21.09: il "return pannello vuoto" DISTRUGGEVA modale + ReactFlow ogni volta che nodes.size scendeva temporaneamente a 1!
  // → RIMOSSO EARLY RETURN distruttivo! → MAI piu' sparizione mezzo secondo!
  // → Ora se davvero non ci sono dati, mostriamo solo un WARNING PICCOLO nel footer, NON blocchiamo il render.
  const isEmptyReal = !graph || (graph.nodes.size <= 1 && !stillLoading());

  // 4) Estado vacío WARNING SOFT (non blocca render!)
  const EmptyWarn = () => isEmptyReal ? (
    <div className="mt-2 mb-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-4 py-2 text-xs text-yellow-900 dark:text-yellow-300 italic">
      ⚠️ No se detectaron empresas relacionadas con el RUT principal.
    </div>
  ) : null;

  const visibleNodesCount = Math.max(0, layouted.nodes.length - 1);
  const totalNodesCount = graph ? (graph.nodes.size - 1) : 0;

  // 5) Contenuto del mapa (controles + react-flow). Se reutiliza inline (PDF) e dentro del modal.
  const mapContent = (containerHeight: string | number | undefined) => (
    <>
      {!forceExpanded && (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 mb-3 flex flex-wrap items-center gap-3 text-sm">
          <span>
            <span className="text-gray-600 dark:text-gray-400">Visibles: </span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {visibleNodesCount} / {totalNodesCount}
            </span>
          </span>
          <span className="text-gray-300">|</span>
          <span>
            <span className="text-gray-600 dark:text-gray-400">Nivel: </span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {maxVisibleLevel} / {totalMaxLevel}
            </span>
          </span>

          <div className="flex gap-1 ml-2">
            {Array.from({ length: totalMaxLevel }, (_, i) => i + 1).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevel(lvl)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  maxVisibleLevel >= lvl
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200'
                }`}
              >
                N{lvl}
              </button>
            ))}
          </div>

          <div className="ml-auto flex gap-2">
            <button
              onClick={showNextLevel}
              disabled={maxVisibleLevel >= totalMaxLevel}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs font-medium rounded transition-colors"
            >
              ▶ Mostrar siguiente nivel
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

      <div
        className="border border-gray-300 dark:border-gray-600 rounded-lg"
        style={{
          background: '#ffffff',
          height: typeof containerHeight === 'number' ? `${containerHeight}px` : containerHeight,
          width: '100%',
          // 🔧 FIX 21.09: minHeight 400px + overflow hidden
          // ReactFlow bug: FlexBox figlio a volte collassa a height=0 anche se padre ha height!
          minHeight: 400,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <ReactFlowProvider>
            <FlowCanvas
              layouted={layouted}
              effectiveMaxLevel={effectiveMaxLevel}
              forceExpanded={forceExpanded}
            />
          </ReactFlowProvider>
        </div>
      </div>

      {!forceExpanded && (
        <p className="text-xs text-gray-400 mt-1.5">
          Usá los botones <strong>N1..N{totalMaxLevel}</strong> o <strong>Mostrar siguiente nivel</strong> para expandir. Arrastrá los nodos para reacomodarlos. Hasta {MAX_DEPTH} niveles. Flechas hacia el centro = empresas controladas; hacia afuera = empresas que controlan. Nodos verdes = socios (personas naturales) directos.
        </p>
      )}
    </>
  );

  // 🔧 FIX 22.09: Nascondi INTERA sezione "Mapa de Empresas Controladas" (h3 + Ver diagrama) richiesto utente.
  //    Si mostra SOLO in export PDF (forceExpanded=true).
  if (!forceExpanded) {
    return null;
  }

  return (
    <div className="mt-4 mb-4" id="pdf-mesh-flow-owned">
      <h3 className="text-lg font-bold dark:text-white mb-3">{title}</h3>
      <EmptyWarn />

      {forceExpanded ? (
        mapContent(height)
      ) : (
        <>
          {/* 🔧 FIX 22.09: Nascondi bottone "Ver diagrama" (richiesta utente) */}

          {isModalOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
              onClick={() => setIsModalOpen(false)}
            >
              <div
                className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full flex flex-col"
                style={{ maxWidth: '95vw', maxHeight: '95vh' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h3>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl leading-none px-2"
                    aria-label="Cerrar"
                  >
                    ×
                  </button>
                </div>
                <div className="p-4 overflow-auto flex-1">
                  {/* 🔧 FIX 21.09: height FISSA 600px invece di 70vh variabile!
                      ReactFlow richiede un container con ALTEZZA DEFINITA (vh puo' valere 0 se FlexBox non calcola bene!).
                      Risolve i casi: 'Appare per mezzo secondo e poi height=0!' */}
                  <div style={{ width: '100%', height: 600, minHeight: 500 }}>
                    {mapContent(600)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MeshFlowChartOwned;
