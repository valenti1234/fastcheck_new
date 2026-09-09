export interface DequienesRelationshipsData {
  relationships?: Array<{ source: string; target: string; label: string; information_source?: any }>;
  entityNames?: Record<string, string>;
}

export interface DerivedRelation {
  name: string;
  rut: string;
}

// ---------- Lista nera: tipi partecipazione notarili / non-soci reali ----------
// Case-insensitive + match parziale (basta che la stringa lo CONTENGA)
export const NOTARIO_BLACKLIST: RegExp[] = [
  /\bnotario\b/i,
  /\bnotaria\b/i,
  /\bnotar\b/i,   // copre "notariado", "notarial" ecc.
  /\bconservador\b.*\bbienes\s+raíces\b/i,
  /\bconservador\b.*\bregistro\b/i,
  /\bregistro\s+civil\b/i,
  /\boficial\s+del\s+registro\b/i,
  /\boficial\s+civil\b/i,
  /\binspector\s+notarial\b/i,
  /\btestimonio\s+notarial\b/i,
];

/**
 * Controlla se una stringa qualsiasi (tipoDeParticipacion, nombre, cargo, role, etc.)
 * matcha la blacklist notarile.
 * @returns true se da scartare.
 */
export const isNotaryBlacklistedString = (value: any): boolean => {
  if (value === null || value === undefined) return false;
  const s = String(value);
  if (!s.trim()) return false;
  return NOTARIO_BLACKLIST.some(re => re.test(s));
};

/**
 * Controlla una entry singolo "socio" / "participacion" da QUALSIASI fonte
 * (coincidencias[].socios, diarioOficial[].socios, empresaEnUnDia[].socios, companies[].socios, etc.)
 * e ritorna true se la entry è da scartare (è un notario / conservador / registro civile).
 *
 * Oggetti controllati (case-insensitive, varianti spagnolo/inglese):
 *   tipoDeParticipacion, tipo_participacion, participationType, participacionTipo, rol, role, cargo, puesto
 *   nombre, name, razonSocial, nombreSocial, nombres
 * @returns true se da scartare.
 */
export const isNotaryEntry = (entry: any): boolean => {
  if (!entry || typeof entry !== 'object') return false;

  // 1. Controllo diretto: TIPO DI PARTECIPAZIONE / ROL / CARGO (varianti)
  const tipoFields = [
    'tipoDeParticipacion', 'tipo_participacion', 'participationType', 'participacionTipo',
    'rol', 'role', 'cargo', 'puesto', 'position', 'funcion', 'tipoRelacion'
  ];
  for (const k of tipoFields) {
    const v = (entry as any)[k];
    if (isNotaryBlacklistedString(v)) return true;
  }

  // 2. Controllo fallback: NOME (se nel nome c'è "Notaría X" / "Juez X - Oficial Civil")
  const nameFields = [
    'nombre', 'name', 'razonSocial', 'nombreSocial', 'nombres',
    'fullName', 'nombreCompleto', 'razon_social'
  ];
  for (const k of nameFields) {
    const v = (entry as any)[k];
    if (isNotaryBlacklistedString(v)) return true;
  }

  return false;
};

const isBlacklistedTipo = (value: any): boolean => isNotaryBlacklistedString(value);

/**
 * Filtra TUTTI i dati societari da cui emerge un soggetto di tipo notarile / conservador / registro civile.
 *
 * - Pulisce array annidati (companies[].socios, information_source.details, ...) rimuovendo ogni oggetto
 *   il cui campo "tipoDeParticipacion" / varianti / nome matcha la blacklist.
 * - Rimuove le entry corrispondenti da entityNames.
 * - Rimuove dalla lista top-level relationships (quella usata da MeshTable / MeshFlowTable per OWNED_BY / REPRESENTED_BY)
 *   ogni relazione che:
 *     a) contiene in information_source (a qualsiasi profondità) un campo tipoDeParticipacion in blacklist, oppure
 *     b) il target è presente in entityNames e il suo nome matcha la blacklist, oppure
 *     c) l'oggetto relazione stesso è stato etichettato internamente come notarile.
 *
 * L'oggetto input NON viene mutato; viene ritornata una deep copy purgata.
 */
export const filterOutNotaryRelationships = <T = any>(data: T): T => {
  if (data === null || data === undefined) return data;

  // --- Passo 1: deep clone + deep scan per rimuovere oggetti "tipo notario" in array ----------------
  const clone = deepClone(data);
  const removedTargetsRut = new Set<string>();
  const removedNames = new Set<string>();

  const walkAndPurge = (node: any): { purged: boolean } => {
    if (!node || typeof node !== 'object') return { purged: false };

    let anyPurged = false;

    // Array: itera sugli elementi
    if (Array.isArray(node)) {
      const originalLen = node.length;
      let writeIdx = 0;
      for (let i = 0; i < node.length; i++) {
        const item = node[i];
        // Step A: se l'oggetto ha un campo esplicito tipoDeParticipacion → valutalo
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          // 1. Cerca in TUTTI i campi noti tipo partecipazione
          const tipoCandidates: any[] = [];
          const visitTipo = (obj: any) => {
            if (!obj || typeof obj !== 'object') return;
            for (const [k, v] of Object.entries(obj)) {
              const key = k.toLowerCase();
              if (
                key === 'tipodeparticipacion' ||
                key === 'tipo_participacion' ||
                key === 'tipopartecipazione' ||
                key === 'participationtype' ||
                key === 'participation_type' ||
                key === 'tipo' ||
                key === 'relacion' ||
                key === 'tipo_de_participacion' ||
                key === 'role' ||
                key === 'rol'
              ) {
                tipoCandidates.push(v);
              }
              if (v && typeof v === 'object') visitTipo(v);
            }
          };
          visitTipo(item);
          const hasBlacklistedTipo = tipoCandidates.some(t => isBlacklistedTipo(t));

          // 2. Controlla anche il "nombre/nombre/name" dell'item stesso (potrebbe contenere "Notaría X")
          const nameField = (item as any).nombre || (item as any).name || (item as any).nome || (item as any).razonSocial;
          const hasBlacklistedName = typeof nameField === 'string' && NOTARIO_BLACKLIST.some(re => re.test(nameField));

          // 3. Se l'item è un socio/relazione da scartare → estrae i RUT collegati e scarta la riga
          if (hasBlacklistedTipo || hasBlacklistedName) {
            // memorizza nomi/rut per dopo
            if (typeof nameField === 'string' && nameField.trim()) removedNames.add(nameField);
            const rutFields = [
              (item as any).rut,
              (item as any).ruti,
              (item as any).identifier,
              (item as any).documentNumber
            ].filter((x): x is string => typeof x === 'string' && !!x.trim());
            for (const r of rutFields) removedTargetsRut.add(normalizeRutStr(r));

            // skip this item (non lo ri-scriviamo nel nuovo array)
            anyPurged = true;
            continue;
          }
        }

        // Step B: ricorsivamente purga figli
        if (item && typeof item === 'object') {
          const sub = walkAndPurge(item);
          if (sub.purged) anyPurged = true;
        }
        node[writeIdx++] = item;
      }
      // Tronca array se abbiamo rimosso elementi
      if (writeIdx !== originalLen) {
        node.length = writeIdx;
        anyPurged = true;
      }
      return { purged: anyPurged };
    }

    // Oggetto: itera properties
    for (const [k, v] of Object.entries(node)) {
      if (v && typeof v === 'object') {
        const sub = walkAndPurge(v);
        if (sub.purged) anyPurged = true;
      } else {
        // Proprietà primitive: se è un campo tipo (singolo valore) blacklistato → lo cancelliamo dall'oggetto per sicurezza
        const key = k.toLowerCase();
        if (
          key === 'tipodeparticipacion' ||
          key === 'tipo_participacion' ||
          key === 'participationtype' ||
          key === 'participation_type' ||
          key === 'tipo_de_participacion'
        ) {
          if (isBlacklistedTipo(v)) {
            anyPurged = true;
          }
        }
        // Controllo nome match blacklist
        if ((key === 'nombre' || key === 'name' || key === 'nome' || key === 'razonsocial') && typeof v === 'string') {
          if (NOTARIO_BLACKLIST.some(re => re.test(v))) {
            removedNames.add(v);
          }
        }
        // RUT → salva per dopo
        if ((key === 'rut' || key === 'identifier' || key === 'ruti') && typeof v === 'string' && v.trim()) {
          removedTargetsRut.add(normalizeRutStr(v));
        }
      }
    }
    return { purged: anyPurged };
  };

  walkAndPurge(clone);

  // --- Passo 2: entityNames (se presente nell'oggetto) ---------------------------------------------
  const dataAsRel = clone as unknown as DequienesRelationshipsData;
  if (dataAsRel?.entityNames && typeof dataAsRel.entityNames === 'object') {
    const before = Object.keys(dataAsRel.entityNames).length;
    const kept: Record<string, string> = {};
    for (const [rutKey, nm] of Object.entries(dataAsRel.entityNames)) {
      const nrut = normalizeRutStr(rutKey);
      if (removedTargetsRut.has(nrut)) continue; // saltato: RUT di un notario già rimosso in precedenza
      if (typeof nm === 'string' && NOTARIO_BLACKLIST.some(re => re.test(nm))) {
        removedNames.add(nm);
        // non aggiungiamo a kept
        continue;
      }
      kept[rutKey] = nm;
    }
    dataAsRel.entityNames = kept;
    if (before !== Object.keys(kept).length) {
      (clone as any)._notaryCleanup = {
        removedEntityNames: before - Object.keys(kept).length,
        removedRelations: 0,
        removedNames: Array.from(removedNames),
      };
    }
  }

  // --- Passo 3: relationships top-level (OWNED_BY / REPRESENTED_BY) -------------------------------
  if (dataAsRel?.relationships && Array.isArray(dataAsRel.relationships)) {
    const before = dataAsRel.relationships.length;
    const entityNames = dataAsRel.entityNames ?? {};
    const filtered = dataAsRel.relationships.filter(r => {
      if (!r || typeof r !== 'object') return false;

      // a) RUT target nella lista RUT rimossi
      const tgtRut = normalizeRutStr(String((r as any).target ?? ''));
      if (tgtRut && removedTargetsRut.has(tgtRut)) return false;
      const srcRut = normalizeRutStr(String((r as any).source ?? ''));
      if (srcRut && removedTargetsRut.has(srcRut) && tgtRut && srcRut !== tgtRut) return false;

      // b) Nome target in entityNames contiene parola blacklist
      const tgtName = entityNames[(r as any).target] || entityNames[tgtRut] || entityNames[normalizeRutStrBack((r as any).target)] || '';
      if (typeof tgtName === 'string' && tgtName.trim() && NOTARIO_BLACKLIST.some(re => re.test(tgtName))) {
        removedNames.add(tgtName);
        return false;
      }

      // c) L'information_source contiene (a qualsiasi profondità) un oggetto con tipo blacklistato
      const info = (r as any).information_source;
      let hasEmbeddedBlacklist = false;
      const walkInfo = (n: any) => {
        if (!n || typeof n !== 'object') return;
        for (const [k, v] of Object.entries(n)) {
          const key = k.toLowerCase();
          if (
            key === 'tipodeparticipacion' ||
            key === 'tipo_participacion' ||
            key === 'tipo_de_participacion' ||
            key === 'participationtype' ||
            key === 'participation_type'
          ) {
            if (isBlacklistedTipo(v)) {
              hasEmbeddedBlacklist = true;
              return;
            }
          }
          if (v && typeof v === 'object') walkInfo(v);
          if (hasEmbeddedBlacklist) return;
        }
      };
      if (info) walkInfo(info);
      if (hasEmbeddedBlacklist) return false;

      // d) nome sorgente blacklistato (raro, ma per sicurezza)
      const srcName = entityNames[(r as any).source] || entityNames[srcRut] || '';
      if (typeof srcName === 'string' && srcName.trim() && srcRut !== tgtRut && NOTARIO_BLACKLIST.some(re => re.test(srcName))) {
        removedNames.add(srcName);
        return false;
      }

      return true;
    });
    dataAsRel.relationships = filtered;

    // Salviamo la statistica di cleanup in "_notaryCleanup" per i log
    if ((clone as any)._notaryCleanup) {
      (clone as any)._notaryCleanup.removedRelations = before - filtered.length;
    } else if (before !== filtered.length) {
      (clone as any)._notaryCleanup = {
        removedEntityNames: 0,
        removedRelations: before - filtered.length,
        removedNames: Array.from(removedNames),
      };
    }
  }

  return clone;
};

// --- helper interni ---
const normalizeRutStr = (rut: string): string => {
  if (!rut) return '';
  return String(rut).replace(/\./g, '').replace(/-/g, '').toUpperCase().trim();
};
// Inverso: prova a ricostruire da chiave entityNames (se salvato come stringa trattinata)
const normalizeRutStrBack = (rut: string): string => {
  if (!rut) return '';
  const clean = String(rut).replace(/\./g, '').replace(/-/g, '').toUpperCase().trim();
  if (clean.length < 2) return clean;
  return clean;
};

function deepClone<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
  if (obj instanceof RegExp) return new RegExp(obj.source, obj.flags) as unknown as T;
  if (Array.isArray(obj)) return obj.map(x => deepClone(x)) as unknown as T;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj as Record<string, any>)) {
    out[k] = deepClone(v);
  }
  return out as T;
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

  // Applico il filtro notarile anche qui: deriva solo i socios/rappresentanti VERI
  const cleaned = filterOutNotaryRelationships(relData);
  const rels = cleaned.relationships ?? relData.relationships;

  for (const r of rels) {
    if (!r || r.source !== sourceNum) continue;
    if (r.label === 'REPRESENTED_BY') {
      const nm = ents[r.target] || r.target;
      // Doppio controllo: salta nome notarile
      if (typeof nm === 'string' && NOTARIO_BLACKLIST.some(re => re.test(nm))) continue;
      reps.push({ name: nm, rut: r.target });
    } else if (r.label === 'OWNED_BY') {
      const nm = ents[r.target] || r.target;
      if (typeof nm === 'string' && NOTARIO_BLACKLIST.some(re => re.test(nm))) continue;
      socios.push({ name: nm, rut: r.target });
    }
  }
  return { socios, representantes: reps };
};

export interface DeepNotaryCleanupStats {
  removedEntries: number;
  removedNames: string[];
  pathsTouched: string[];
}

/**
 * ⚠️ CLEANUP TOTALE payload: walk deep dell'INTERO oggetto `data` (riskCalculationResult,
 * response.details, sheriffLogData.filteredDetails, QUALSIASI payload) e rimuove
 * da OGNI array ogni entry (oggetto) che soddisfa isNotaryEntry (tipoDeParticipacion notarile
 * o nome tipo "Notaría X").
 *
 * Non muta l'input — ritorna una deep copy purgata.
 * Aggiunge meta `_globalNotaryCleanup` con stats (numero entry rimosse, nomi, path array toccati).
 *
 * Copre TUTTI i path noti/ignoti:
 *   - compliance.sociedades.coincidencias[].socios
 *   - mallaSocietariaData.empresaEnUnDia[].socios
 *   - mallaSocietariaData.diarioOficial[].socios
 *   - societaryMeshExternal[].societiesIsParticipant[].participantes
 *   - QUALSIASI NUOVO PATH futuro contenente entries tipo socio con `tipoDeParticipacion`/`nombre`.
 */
export const deepCleanNotarySociosFromEntirePayload = <T = any>(obj: T): T & { _globalNotaryCleanup?: DeepNotaryCleanupStats } => {
  if (obj === null || obj === undefined) return obj as any;

  const stats: DeepNotaryCleanupStats = {
    removedEntries: 0,
    removedNames: [],
    pathsTouched: [],
  };

  const clone = deepClone(obj);

  const walk = (node: any, path: string) => {
    if (!node || typeof node !== 'object') return;

    // CASO 1 — Array (principale target: filtriamo le entries oggetto)
    if (Array.isArray(node)) {
      // Determina se almeno un elemento dell'array è "entry tipo socio" (isNotaryEntry ritorna true per qualche item).
      // Filtriamo l'array in place (dopo deepClone, al sicuro):
      const before = node.length;
      const filtered: any[] = [];
      for (let i = 0; i < node.length; i++) {
        const item = node[i];
        if (isNotaryEntry(item)) {
          stats.removedEntries += 1;
          const nm =
            item?.nombre || item?.name || item?.razonSocial || item?.nombreCompleto ||
            item?.fullName || item?.nombreSocial || item?.razon_social ||
            null;
          if (nm) stats.removedNames.push(String(nm).trim());
        } else {
          filtered.push(item);
        }
      }
      // Se abbiamo rimosso qualcosa, sovrascriviamo l'array
      if (filtered.length !== before) {
        stats.pathsTouched.push(path);
        // Svuota e ripopola (per mantenere lo stesso riferimento, in caso di oggetto padre che usa l'array come riferimento)
        node.length = 0;
        for (const f of filtered) node.push(f);
      }
      // Infine deep-walk ogni elemento residuo (può contenere a sua volta array annidati)
      for (let i = 0; i < node.length; i++) {
        walk(node[i], `${path}[${i}]`);
      }
      return;
    }

    // CASO 2 — Oggetto plain: itera chiavi
    const keys = Object.keys(node);
    for (const k of keys) {
      const v = node[k];
      if (v !== null && typeof v === 'object') {
        // Salta meta gia presente per non walkarla (non è necessario ma evita noise)
        if (k === '_notaryCleanup' || k === '_globalNotaryCleanup') continue;
        walk(v, `${path}${path ? '.' : ''}${k}`);
      }
    }
  };

  walk(clone, '');

  if (stats.removedEntries > 0) {
    (clone as any)._globalNotaryCleanup = stats;
  }
  return clone as any;
};

