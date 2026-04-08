export interface DequienesRelationshipsData {
  relationships?: Array<{ source: string; target: string; label: string; information_source?: any }>;
  entityNames?: Record<string, string>;
}

export interface DerivedRelation {
  name: string;
  rut: string;
}

export const deriveRelations = (
  relData: DequienesRelationshipsData | null | undefined,
  companyRut: string | null | undefined
): { socios: DerivedRelation[]; representantes: DerivedRelation[] } => {
  if (!relData || !relData.relationships || !relData.entityNames || !companyRut) {
    return { socios: [], representantes: [] };
  }
  const sourceNum = (companyRut.split('-')[0] || '').replace(/\./g, '');
  const ents = relData.entityNames;
  const reps: DerivedRelation[] = [];
  const socios: DerivedRelation[] = [];
  for (const r of relData.relationships) {
    if (!r || r.source !== sourceNum) continue;
    if (r.label === 'REPRESENTED_BY') {
      const nm = ents[r.target] || r.target;
      reps.push({ name: nm, rut: r.target });
    } else if (r.label === 'OWNED_BY') {
      const nm = ents[r.target] || r.target;
      socios.push({ name: nm, rut: r.target });
    }
  }
  return { socios, representantes: reps };
};

