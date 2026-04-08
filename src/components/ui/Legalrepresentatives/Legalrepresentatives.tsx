// RepresentantesLegales.tsx
// Uso en FastCheck:
//
//   import RepresentantesLegales from '../components/ui/RepresentantesLegales/RepresentantesLegales';
//
//   <RepresentantesLegales
//     dequienesRelationships={data?.sheriffLogData?.filteredDetails?.dequienesRelationships}
//     mainRut={companyData.rut}
//   />

const normalizeRut = (rut: string | number): string => {
    if (rut == null) return '';
    return String(rut).replace(/\./g, '').split('-')[0].trim();
};

const isSociedad = (rut: string): boolean => {
    const n = parseInt(normalizeRut(rut), 10);
    return !isNaN(n) && n >= 25_000_000;
};

const mapSource = (src: string): string =>
    ({ SII_REP: 'SII', SII: 'SII', SII_REC_COM: 'SII', RES: 'DO', DO: 'DO', DOH: 'DOH', DIARIO_OFICIAL: 'DO' } as Record<string, string>)[src] ?? src ?? '--';

const detectMainRut = (relationships: any[]): string => {
    const freq: Record<string, number> = {};
    for (const r of relationships) {
        const s = normalizeRut(String(r.source || ''));
        if (s) freq[s] = (freq[s] || 0) + 1;
    }
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
};

interface RepresentantesLegalesProps {
    dequienesRelationships: any;
    mainRut: string;
}

const Legalrepresentatives = ({ dequienesRelationships, mainRut }: RepresentantesLegalesProps) => {

//console.log(dequienesRelationships,"quieeeeeeeeeeeeeeeeeeeeeeeeee")

    if (!dequienesRelationships) return null;

    const { relationships = [], entityNames = {} } = dequienesRelationships;
    if (!relationships.length) return null;

    const cleanMain = normalizeRut(mainRut || '') || detectMainRut(relationships);
    const getName = (rut: string) => entityNames[rut] || entityNames[normalizeRut(rut)] || '';
    const rootIsPerson = !isSociedad(cleanMain);

    const repRels = relationships.filter((r: any) => r.label === 'REPRESENTED_BY');
    if (!repRels.length) return null;

    // Solo los representantes directos de la entidad consultada
    const reps = repRels
        .filter((r: any) => normalizeRut(String(r.source)) === cleanMain)
        .map((r: any) => ({
            rut: normalizeRut(String(r.target || '')),
            name: getName(normalizeRut(String(r.target || ''))),
            fuente: mapSource(r.information_source?.source || ''),
            fecha: r.information_source?.started_at || r.information_source?.published_at || '',
        }));

    if (!reps.length) return null;

    const thStyle: React.CSSProperties = {
        border: '1px solid #e5e7eb', padding: '6px 8px', textAlign: 'left',
        fontWeight: 600, color: '#374151',
        backgroundColor: '#f3f4f6', wordBreak: 'break-word',
    };
    const tdStyle: React.CSSProperties = {
        border: '1px solid #e5e7eb', padding: '6px 8px', fontSize: '13px',
        verticalAlign: 'middle', wordBreak: 'break-word',
    };

    const EntityCell = ({ rut, name, color }: { rut: string; name: string; color: string }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
       
            <span style={{ color: '#9ca3af', flexShrink: 0 }}>{rut}</span>
            <span >{name}</span>
        </div>
    );

    const formatFecha = (fecha: string) =>
        fecha ? fecha.split('-').reverse().join('-') : '--';

    return (
        <div className="mt-4 mb-4" data-pdf="representantes-table">
            <h3 className="text-base font-bold mb-2 dark:text-white">
                Representantes Legales
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                    ({reps.length})
                </span>
            </h3>

            <div className="overflow-x-auto">
                <table
                    data-pdf-table="rep"
                    style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', }}
                >
                    <colgroup>
                        {rootIsPerson && <col style={{ width: '32%' }} />}
                        <col style={{ width: rootIsPerson ? '40%' : '65%' }} />
                        <col style={{ width: '75px' }} />
                        <col style={{ width: '110px' }} />
                    </colgroup>
                    <thead>
                        <tr style={{ backgroundColor: '#f3f4f6' }}>
                            {rootIsPerson && <th style={thStyle}>Empresa</th>}
                            <th style={thStyle}>Representante</th>
                            <th style={thStyle}>Fuente</th>
                            <th style={thStyle}>Desde</th>
                        </tr>
                    </thead>
                    <tbody>
                        {reps.map((rep, idx) => (
                            <tr
                                key={`${rep.rut}-${idx}`}
                                style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb' }}
                            >
                                {rootIsPerson && (
                                    <td style={tdStyle}>
                                        <EntityCell rut={cleanMain} name={getName(cleanMain)} color="#3b82f6" />
                                    </td>
                                )}
                                <td style={tdStyle}>
                                    <EntityCell rut={rep.rut} name={rep.name} color="#22c55e" />
                                </td>
                                <td className="text-base " >
                                    {rep.fuente}
                                </td>
                                <td >
                                    {formatFecha(rep.fecha)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Legalrepresentatives;