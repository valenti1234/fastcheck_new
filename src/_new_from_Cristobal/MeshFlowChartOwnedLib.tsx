import React, { useMemo, useState, useCallback, useEffect } from 'react';
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
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import formatRut from '../../../utils/rutFormat';

/**
 * MeshFlowChartOwned — mapa de participaciones (red bidireccional) + socios directos.
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
 *
 * Estética de aristas:
 *  - Líneas rectas diagonales (type 'straight'), no curvas.
 *  - Porcentajes con hasta 2 decimales.
 *  - Handles repartidos por lado para que flechas paralelas no se sobremonten.
 */

const MAX_DEPTH = 5;

// dimensiones de nodo (en px) usadas tanto por el render como por el layout
const NODE_WIDTH = 220;
const NODE_HEIGHT = 90;

// radios de cada anillo: nivel 0 = centro, 1..5 = anillos concéntricos
const RING_RADIUS = [0, 320, 600, 880, 1160, 1440];

// ---- helpers ----
const normalizeRut = (rut: string | number): string => {
  if (rut == null) return '';
  return String(rut).replace(/\./g, '').split('-')[0].trim();
};

const isSociedad = (rut: string): boolean => {
  const n = parseInt(normalizeRut(rut), 10);
  return !isNaN(n) && n >= 25_000_000;
};

const extractPct = (info: any): number | null => {
  if (!info) return null;
  const v = info.shares_percent ?? info.percentage ?? null;
  return v != null ? Number(v) : null;
};

// Formatea el porcentaje a un máximo de 2 decimales, sin ceros sobrantes.
const formatPct = (v: number | null): string | undefined => {
  if (v == null || Number.isNaN(v)) return undefined;
  const rounded = Math.round(v * 100) / 100;
  // toLocaleString quita ceros finales innecesarios (15.00 -> 15, 15.50 -> 15.5)
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

// ---- nodo custom: 4 handles nombrados (top/right/bottom/left) para enrutar
// las flechas por el lado correcto y evitar superposición ----
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

  // Cada lado tiene un handle source y uno target con el mismo id de lado.
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
        {formatRut(rut)}
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
  /** alto del viewport en pantalla (ignorado cuando forceExpanded = true) */
  height?: string | number;
  /** true durante la exportación PDF: renderiza el mapa inline expandido */
  forceExpanded?: boolean;
}

// ---- builder: convierte el grafo lógico en nodes/edges de React Flow con layout radial ----
const buildRadialLayout = (
  graph: { nodes: Map<string, GraphNode>; edges: GraphEdge[]; rootRut: string },
  effectiveMaxLevel: number
): { nodes: Node[]; edges: Edge[] } => {
  const visible: GraphNode[] = [];
  graph.nodes.forEach((n) => {
    if (n.level <= effectiveMaxLevel) visible.push(n);
  });
  const visibleRuts = new Set(visible.map((n) => n.rut));

  // agrupar por nivel para repartir en cada anillo
  const byLevel = new Map<number, GraphNode[]>();
  for (const n of visible) {
    if (!byLevel.has(n.level)) byLevel.set(n.level, []);
    byLevel.get(n.level)!.push(n);
  }

  // posiciones (centro de cada nodo) para calcular el lado de los handles
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
      // React Flow usa el top-left como posición → centramos restando media dimensión
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

  // Elegir handles según la posición relativa de los nodos, para que las
  // flechas salgan/entren por el lado correcto y no se sobremonten.
  // El nodo custom 'mesh' expone 4 handles nombrados (top/right/bottom/left),
  // cada uno como source y target.
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

// ---- subcomponente: el lienzo de React Flow con refit automático al cambiar el nivel ----
interface FlowCanvasProps {
  layouted: { nodes: Node[]; edges: Edge[] };
  effectiveMaxLevel: number;
  forceExpanded: boolean;
}

const FlowCanvas: React.FC<FlowCanvasProps> = ({ layouted, effectiveMaxLevel, forceExpanded }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(layouted.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layouted.edges);
  const { fitView } = useReactFlow();

  // cuando cambia el nivel o el grafo se reconstruye → reseteamos posiciones a la grilla radial
  useEffect(() => {
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
    const t = setTimeout(() => {
      fitView({ padding: 0.2, duration: 300 });
    }, 60);
    return () => clearTimeout(t);
  }, [layouted, setNodes, setEdges, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      fitView
      fitViewOptions={{ padding: 0.2 }}
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
  height = 600,
  forceExpanded = false,
}) => {
  // 1) Construir el grafo (BFS bidireccional para empresas + socios directos)
  const graph = useMemo(() => {
    if (!dequienesRelationships?.relationships?.length) return null;

    const { relationships, entityNames = {} } = dequienesRelationships;
    const getName = (rut: string) =>
      entityNames[rut] || entityNames[normalizeRut(rut)] || '';
    const cleanMain = normalizeRut(mainRut || '');
    if (!cleanMain) return null;

    const ownRels = relationships.filter(
      (r: any) => r.label === 'OWNED_BY' && !r.information_source?.match_type
    );

    const nodes = new Map<string, GraphNode>();
    nodes.set(cleanMain, {
      rut: cleanMain,
      name: getName(cleanMain),
      level: 0,
      isCompany: isSociedad(cleanMain),
    });

    // BFS bidireccional SOLO entre empresas
    const queue: string[] = [cleanMain];
    while (queue.length) {
      const cur = queue.shift()!;
      const curNode = nodes.get(cur)!;
      if (curNode.level >= MAX_DEPTH) continue;

      // Empresas poseídas por `cur` -> target = cur (flecha hacia adentro)
      const owned = ownRels.filter((r: any) => normalizeRut(String(r.target)) === cur);
      for (const r of owned) {
        const childRut = normalizeRut(String(r.source || ''));
        if (!childRut || childRut === cur) continue;
        if (!isSociedad(childRut)) continue; // empresas solamente
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

      // Empresas dueñas de `cur` -> source = cur (flecha hacia afuera)
      const owners = ownRels.filter((r: any) => normalizeRut(String(r.source)) === cur);
      for (const r of owners) {
        const parentRut = normalizeRut(String(r.target || ''));
        if (!parentRut || parentRut === cur) continue;
        if (!isSociedad(parentRut)) continue; // empresas solamente
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

    // Socios directos del RUT principal: personas naturales que poseen el centro.
    // (relación OWNED_BY donde target = cleanMain y source es persona natural)
    const directOwners = ownRels.filter(
      (r: any) => normalizeRut(String(r.target)) === cleanMain
    );
    for (const r of directOwners) {
      const ownerRut = normalizeRut(String(r.source || ''));
      if (!ownerRut || ownerRut === cleanMain) continue;
      if (isSociedad(ownerRut)) continue;      // ya cubierto por el BFS de empresas
      if (nodes.has(ownerRut)) continue;
      nodes.set(ownerRut, {
        rut: ownerRut,
        name: getName(ownerRut),
        level: 1,
        isCompany: false,                       // persona natural → socio (verde)
      });
    }

    // Aristas: una por cada relación OWNED_BY que conecte dos nodos del grafo.
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

    return { nodes, edges, rootRut: cleanMain };
  }, [dequienesRelationships, mainRut]);

  // 2) Estado de expansión y modal
  const [maxVisibleLevel, setMaxVisibleLevel] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const totalMaxLevel = useMemo(() => {
    if (!graph) return 0;
    let max = 0;
    graph.nodes.forEach((n) => {
      if (n.level > max) max = n.level;
    });
    return max;
  }, [graph]);

  const effectiveMaxLevel = forceExpanded ? totalMaxLevel : maxVisibleLevel;

  // 3) Layout radial: pre-cómputo de nodes/edges para React Flow
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

  // Cerrar modal con tecla Escape
  useEffect(() => {
    if (!isModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isModalOpen]);

  // 4) Estado vacío
  if (!graph || graph.nodes.size <= 1) {
    return (
      <div className="mt-4 mb-4">
        <h3 className="text-lg font-bold dark:text-white mb-3">{title}</h3>
        <p className="text-gray-500 dark:text-gray-400 italic text-sm py-4">
          No se detectaron empresas relacionadas con el RUT principal.
        </p>
      </div>
    );
  }

  const visibleNodesCount = Math.max(0, layouted.nodes.length - 1);
  const totalNodesCount = graph.nodes.size - 1;

  // 5) Contenido del mapa (controles + react-flow). Se reutiliza inline (PDF) y dentro del modal.
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
        }}
      >
        <ReactFlowProvider>
          <FlowCanvas
            layouted={layouted}
            effectiveMaxLevel={effectiveMaxLevel}
            forceExpanded={forceExpanded}
          />
        </ReactFlowProvider>
      </div>

      {!forceExpanded && (
        <p className="text-xs text-gray-400 mt-1.5">
          Usá los botones <strong>N1..N{totalMaxLevel}</strong> o <strong>Mostrar siguiente nivel</strong> para expandir. Arrastrá los nodos para reacomodarlos. Hasta {MAX_DEPTH} niveles. Flechas hacia el centro = empresas controladas; hacia afuera = empresas que controlan. Nodos verdes = socios (personas naturales) directos.
        </p>
      )}
    </>
  );

  return (
    <div className="mt-4 mb-4" id="pdf-mesh-flow-owned">
      <h3 className="text-lg font-bold dark:text-white mb-3">{title}</h3>

      {forceExpanded ? (
        mapContent(height)
      ) : (
        <>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors"
          >
            Ver diagrama
          </button>

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
                  {mapContent('70vh')}
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