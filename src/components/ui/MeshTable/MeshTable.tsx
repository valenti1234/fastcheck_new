import { useState } from "react";
import formatRut from "../../../utils/rutFormat";

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

const detectMainRut = (relationships: any[]): string => {
    const freq: Record<string, number> = {};
    for (const r of relationships) {
        const s = normalizeRut(String(r.source || ''));
        if (s) freq[s] = (freq[s] || 0) + 1;
    }
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
};

interface OwnRow {
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
}

const MeshTable = ({ title, height, dequienesRelationships, mainRut, forceExpanded = false }: any) => {
    const [showOwn, setShowOwn] = useState(true);
    const [expandedOwn, setExpandedOwn] = useState<Set<number>>(new Set());

    if (!dequienesRelationships) return null;

    const { relationships = [], entityNames = {} } = dequienesRelationships;

    if (!relationships.length) {
        return (
            <div className="mt-4 mb-4">
                <h3 className="text-lg font-bold dark:text-white mb-4">{title}</h3>
                <p className="text-gray-500 dark:text-gray-400 italic text-sm py-4">Sin datos de malla societaria</p>
            </div>
        );
    }

    const cleanMain = normalizeRut(mainRut || '') || detectMainRut(relationships);
    const getName = (rut: string) => entityNames[rut] || entityNames[normalizeRut(rut)] || '';
    const rootIsPerson = !isSociedad(cleanMain);

    if (rootIsPerson) {
        return (
            <div className="mt-4 mb-4">
                <h3 className="text-lg font-bold dark:text-white mb-4">{title}</h3>
                <p className="text-gray-500 dark:text-gray-400 italic text-sm py-4">No aplica para persona natural</p>
            </div>
        );
    }

    const ownRels = relationships.filter((r: any) =>
        r.label === 'OWNED_BY' && !r.information_source?.match_type
    );

    // ── OWNED_BY ──────────────────────────────────────────────────────────────

    const buildOwnRows = (): OwnRow[] => {
        if (!ownRels.length) return [];

        const rows: OwnRow[] = [];
        let nextId = 0;

        const processUpward = (
            rut: string,
            level: number,
            parentId: number | null,
            ancestors: Set<string>,
        ) => {
            if (level > MAX_DEPTH || ancestors.has(rut)) return;

            const branchAncestors = new Set(ancestors);
            branchAncestors.add(rut);

            const matched = ownRels.filter(
                (r: any) => normalizeRut(String(r.source)) === rut,
            );

            for (const r of matched) {
                const ownerRut = normalizeRut(String(r.target || ''));
                const pct = extractPct(r.information_source);
                const src = r.information_source?.source || '';
                const id = nextId++;

                rows.push({
                    id,
                    parentId,
                    level,
                    sourceRut: rut,
                    sourceName: getName(rut),
                    targetRut: ownerRut,
                    targetName: getName(ownerRut),
                    percentage: pct,
                    tipoTarget: inferTipo(ownerRut),
                    fuente: mapSource(src),
                });

                if (isSociedad(ownerRut)) {
                    processUpward(ownerRut, level + 1, id, branchAncestors);
                }
            }
        };

        if (!rootIsPerson) {
            processUpward(cleanMain, 1, null, new Set());
        } else {
            const companiesOwned = ownRels.filter(
                (r: any) => normalizeRut(String(r.target)) === cleanMain,
            );

            for (const r of companiesOwned) {
                const companyRut = normalizeRut(String(r.source || ''));
                const pct = extractPct(r.information_source);
                const src = r.information_source?.source || '';
                const id = nextId++;

                rows.push({
                    id,
                    parentId: null,
                    level: 1,
                    sourceRut: companyRut,
                    sourceName: getName(companyRut),
                    targetRut: cleanMain,
                    targetName: getName(cleanMain),
                    percentage: pct,
                    tipoTarget: 'Persona',
                    fuente: mapSource(src),
                });

                processUpward(companyRut, 2, id, new Set([cleanMain]));
            }
        }

        return rows.sort((a, b) => a.level - b.level);
    };

    const ownRows = buildOwnRows();

    const getOwnChildren = (row: OwnRow): OwnRow[] =>
        ownRows.filter(r => r.parentId === row.id);

    const toggleOwn = (id: number) =>
        setExpandedOwn(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

    const maxLevel = ownRows.length ? Math.max(...ownRows.map(r => r.level)) : 0;

    const controlador: OwnRow | null = (() => {
        if (rootIsPerson) {
            return {
                id: -1, parentId: null, level: 0,
                sourceRut: cleanMain, sourceName: getName(cleanMain),
                targetRut: cleanMain, targetName: getName(cleanMain),
                percentage: null, tipoTarget: 'Persona', fuente: '',
            };
        }
        const n1 = ownRows.filter(r => r.level === 1);
        if (!n1.length) return ownRows[0] ?? null;
        return n1.reduce((best, r) => {
            if (best.percentage == null) return r;
            if (r.percentage == null) return best;
            return r.percentage > best.percentage ? r : best;
        });
    })();

    const containerStyle =
        height !== 'auto' ? { maxHeight: height, overflowY: 'auto' as const } : {};

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

    const EntityCell = ({ rut, name }: { rut: string; name: string; color: string }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: '#9ca3af', flexShrink: 0 }}>{formatRut(rut)}</span>
            <span style={{ fontWeight: 500, color: '#111827' }}>{name}</span>
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

    const SectionToggle = ({ label, open, onToggle }: any) => (
        <button
            style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6', fontWeight: 600, fontSize: '14px', marginBottom: '12px', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={onToggle}
        >
            <span>{open ? '\u25be' : '\u25b8'}</span>
            {label}
        </button>
    );

    const renderOwnRows = (rows: OwnRow[], bgBase: { count: number }): React.ReactElement[] => {
        const result: React.ReactElement[] = [];

        for (const row of rows) {
            const children = getOwnChildren(row);
            const hasKids = children.length > 0;
            const isExpanded = forceExpanded || expandedOwn.has(row.id);
            bgBase.count++;

            const indent = (row.level - 1) * 16;

            result.push(
                <tr key={row.id} style={{ backgroundColor: bgBase.count % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                    <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: `${indent}px` }}>
                            {hasKids ? (
                                <button
                                    onClick={() => toggleOwn(row.id)}
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
                        {!rootIsPerson && row.level === 1
                            ? <span style={{ color: '#d1d5db', fontSize: '12px' }}>↳</span>
                            : <EntityCell rut={row.sourceRut} name={row.sourceName} color="#3b82f6" />
                        }
                    </td>
                    <td style={tdStyle}><EntityCell rut={row.targetRut} name={row.targetName} color="#3b82f6" /></td>
                    <td style={tdStyle}><PctCell pct={row.level === 1 ? row.percentage : null} /></td>
                    <td style={{ ...tdStyle, fontSize: '12px', color: '#374151' }}>{row.tipoTarget}</td>
                    <td style={{ ...tdStyle, fontSize: '12px', fontWeight: 500, color: '#374151' }}>{row.fuente}</td>
                </tr>
            );

            if (isExpanded && hasKids) {
                result.push(...renderOwnRows(children, bgBase));
            }
        }

        return result;
    };

    // N1 ordenadas por % descendente, nulls al final
    const rootOwnRows = ownRows
        .filter(r => r.parentId === null)
        .sort((a, b) => (b.percentage ?? -1) - (a.percentage ?? -1));

    return (
        <div className="mt-4 mb-4" data-pdf="mesh-table">
            <h3 className="text-lg font-bold dark:text-white mb-4">{title}</h3>

            <div style={containerStyle} className="space-y-6">
                {ownRows.length > 0 ? (
                    <div>
                        <SectionToggle
                            label="Controladores y Estructura de Propiedad"
                            open={showOwn}
                            onToggle={() => setShowOwn(v => !v)}
                        />

                        {showOwn && (
                            <>
                                <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 mb-3 space-y-1.5 text-sm">
                                    {controlador && (
                                        <div>
                                            <span className="text-gray-600 dark:text-gray-400">Controlador principal identificado: </span>
                                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                                                {controlador.targetRut} {controlador.targetName}
                                            </span>
                                            {controlador.level > 0 && (
                                                <span className="text-gray-500 dark:text-gray-400 ml-2">
                                                    (Nivel {controlador.level}{controlador.percentage != null ? ` - ${controlador.percentage}%` : ''})
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    <div>
                                        <span className="text-gray-600 dark:text-gray-400">Cobertura de la malla: </span>
                                        <span className="text-gray-900 dark:text-gray-100">
                                            Nivel máximo alcanzado: <strong>{maxLevel} de {MAX_DEPTH}</strong>
                                        </span>
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <table data-pdf-table="own" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '13px' }}>
                                        <colgroup>
                                            <col style={{ width: '70px' }} />
                                            <col style={{ width: '30%' }} />
                                            <col style={{ width: '30%' }} />
                                            <col style={{ width: '110px' }} />
                                            <col style={{ width: '90px' }} />
                                            <col style={{ width: '75px' }} />
                                        </colgroup>
                                        <thead>
                                            <tr style={{ backgroundColor: '#f3f4f6' }}>
                                                <th style={thStyle}>Nivel</th>
                                                <th style={thStyle}>Empresa</th>
                                                <th style={thStyle}>Dueño</th>
                                                <th style={thStyle}>%</th>
                                                <th style={thStyle}>Tipo</th>
                                                <th style={thStyle}>Fuente</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {renderOwnRows(rootOwnRows, { count: 0 })}
                                        </tbody>
                                    </table>
                                    <p className="text-xs text-gray-400 mt-1.5">
                                        Nota: Hasta {MAX_DEPTH} niveles · Solo se expanden dueños que son sociedades ·
                                        % según DO / DOH / SII (puede haber múltiples fuentes y duplicados).
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <p className="text-gray-500 dark:text-gray-400 italic text-sm py-4">Sin datos de malla societaria</p>
                )}
            </div>
        </div>
    );
};

export default MeshTable;