import { useState } from "react";
import { filterOutNotaryRelationships } from "../../../utils/dequienes";
import { formatChileanRutCanonical } from "../../../utils/rutCanonical";

/**
 * 🩹 FIX 29.09.2026: Ora usa helper centralizzato `formatChileanRutCanonical`.
 *    Il vecchio algoritmo slice(0,-1) tronca 1 cifra DEL CORPO quando l'input
 *    ha 8+ cifre SENZA trattino (es. 20779347 → corretto 20779347-7, prima 2077934-7).
 */
const formatRutForDisplay = formatChileanRutCanonical;

const MAX_DEPTH = 5;

// 🔧 NUCLEAR PRINT-ONCE GUARD (module-level, non resetta tra mount/re-render!)
const __MESH_PRINTED_KEYS: Set<string> = new Set();
const printOnce = (key: string, ...args: any[]) => {
  if (__MESH_PRINTED_KEYS.has(key)) return;
  __MESH_PRINTED_KEYS.add(key);
  console.log(...args);
};
const tableOnce = (key: string, ...args: any[]) => {
  if (__MESH_PRINTED_KEYS.has(key)) return;
  __MESH_PRINTED_KEYS.add(key);
  console.table(...args);
};

const normalizeRut = (rut: string | number): string => {
    if (rut == null) return '';
    // 🔧 Fix 15/09 v1.2: DV PRESERVAZIONE! Prima split('-')[0] → TOLGLIEVA DV ("92604000")
    // Ma relazioni Dequines salvano RUT COMPRENSIVO DI DV ("92604000-6")
    // → match 92604000 (senza DV) !== 92604000k (con DV normalizzato) → flipped=0 → 0 righe "Sin datos"
    return String(rut).replace(/[^0-9Kk]/g, '').toLowerCase();
};

const isSociedad = (rut: string): boolean => {
    const n = parseInt(normalizeRut(rut).replace(/[^0-9]/g, ''), 10);
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
    // 🔧 Fix 21.09 v1.4: BIDIREZIONALE! (non solo source ma anche target!)
    //    Nel caso "tutte le OWNED_BY sono flipped" (source=SOC. MADRE, target=MAIN) → la frequenza SOLO su source
    //    trova RUT casuali di società figlie invece del main! → ownRows = [] → "Sin datos".
    const freq: Record<string, number> = {};
    for (const r of relationships) {
        const s = normalizeRut(String(r.source || ''));
        const t = normalizeRut(String(r.target || ''));
        if (s) freq[s] = (freq[s] || 0) + 1;
        if (t) freq[t] = (freq[t] || 0) + 1;
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

// ── layout del mapa conceptual ──────────────────────────────────────────────
const NODE_W = 215;
const NODE_H = 88;
const COL_GAP = 72;
const ROW_GAP = 26;
const PAD = 34;

const wrapName = (name: string, maxChars = 30, maxLines = 2): string[] => {
    const words = (name || 'Sin nombre').trim().split(/\s+/)
        .map(w => (w.length > maxChars ? w.slice(0, maxChars - 1) + '\u2026' : w));
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
        const candidate = cur ? `${cur} ${w}` : w;
        if (candidate.length <= maxChars) cur = candidate;
        else {
            if (cur) lines.push(cur);
            cur = w;
            if (lines.length === maxLines) break;
        }
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    const consumed = lines.join(' ').length;
    if (lines.length === maxLines && (name || '').trim().length > consumed) {
        const last = lines[maxLines - 1];
        lines[maxLines - 1] = (last.length > maxChars - 1 ? last.slice(0, maxChars - 1) : last) + '\u2026';
    }
    return lines.length ? lines : ['Sin nombre'];
};

const MeshTable = ({ title, height, dequienesRelationships, mainRut, forceExpanded = false }: any) => {
    const [showOwn, setShowOwn] = useState(true);
    const [expandedOwn, setExpandedOwn] = useState<Set<number>>(new Set());
    const [viewMode, setViewMode] = useState<'table' | 'map'>('table');

    // 🔧 FIX 22.09: sezione VUOTA → nascondi TUTTO (h3 + messaggio) invece di mostrare "Sin datos"
    if (!dequienesRelationships) {
        return null;
    }

    // Filtra via: scarta notari / conservador / registro civile (tipoDeParticipacion + nomi blacklist)
    const cleaned = filterOutNotaryRelationships(dequienesRelationships);

    const { relationships = [], entityNames = {} } = cleaned;

    if (!relationships.length) {
        return null;
    }

    const normalizeRutOnlyDigits = (rut: string | number): string => String(rut ?? '').replace(/[^0-9]/g, '');
    const rutMatchRobust = (rutA: any, rutB: any): boolean => {
      // 3 FALLBACK per garantire match anche con formati diversi!
      // 1. Normalizzazione standard (con K/k minuscolo):
      const a1 = normalizeRut(rutA), b1 = normalizeRut(rutB);
      if (a1 && b1 && a1 === b1) return true;
      // 2. Solo CIFRE (no K/k, tolgo TUTTO: "-", ".", "k" ecc.) → 8 cifre!
      const a2 = normalizeRutOnlyDigits(rutA), b2 = normalizeRutOnlyDigits(rutB);
      if (a2 && b2 && a2 === b2) return true;
      // 3. FALLBACK includes 8 cifre: match robusto anche se c'è dv o junk a destra/sinistra
      if (a2 && b2 && a2.length >= 7 && b2.length >= 7) {
        if (a2.startsWith(b2.slice(0,8)) || b2.startsWith(a2.slice(0,8))) return true;
        if (a2.includes(b2.slice(0,8)) || b2.includes(a2.slice(0,8))) return true;
      }
      return false;
    };
    // 🔧 Fix 15/09 v1.3: detectMainRut SOLO SE mainRut PROP è vuoto!
    // (prima detectMainRut trovava 81095400 perché RUT frequente = altre società, NON il main!)
    let cleanMain_: string = '';
    if (mainRut && String(mainRut).trim() !== '') cleanMain_ = normalizeRut(mainRut);
    else cleanMain_ = detectMainRut(relationships);
    const cleanMain = cleanMain_;
    const getName = (rut: string) => entityNames[rut] || entityNames[normalizeRut(rut)] || entityNames[normalizeRutOnlyDigits(rut)] || '';
    const rootIsPerson = !isSociedad(cleanMain);

    if (rootIsPerson) {
        // 🔧 FIX 22.09: sezione VUOTA → return null (nascondi)
        return null;
    }

    // 🔧 Fix 15.09 v1.5 — **RIMUOVIAMO DEL TUTTO IL FILTRO !match_type**!
    // Motivo: match_type TRUE era quello su provider Python (trovato via RUT associato STIMATO). Nel caso MAIN RUT, LE SUE
    // 33 OWNED_BY matchano! Ma se scartiamo match_type===TRUE perdiamo TUTTO! → meglio TUTTI i OWNED_BY grezzi.
    const ownRels_raw_ALL = relationships.filter((r: any) => r && r.label === 'OWNED_BY');
    // Dedup TUTTI (source_norm__target_norm) — senza badare a match_type!
    const dedup = new Set<string>();
    const ownRels: any[] = [];
    for (const r of ownRels_raw_ALL) {
      if (!r || (!r.source && !r.target)) continue;
      const k = normalizeRut(String(r.source ?? '')) + '__' + normalizeRut(String(r.target ?? ''));
      if (!dedup.has(k)) { dedup.add(k); ownRels.push(r); }
    }
    const ownRels_noMatchType = ownRels_raw_ALL.filter((r: any) => !r?.information_source?.match_type);
    const ownRels_matchType = ownRels_raw_ALL.filter((r: any) => r?.information_source?.match_type === true);
    // Banner debug EXTRA (vediamo SUBITO se MAIN è dentro ownRels!)
    if (typeof window !== 'undefined') {
      try {
        const normM = normalizeRut(mainRut || cleanMain || '');
        const onlyD = (s: any) => String(s ?? '').replace(/[^0-9]/g, '');
        const robustMatch = (a: any, b: any) => {
          const a1 = normalizeRut(a), b1 = normalizeRut(b); if (a1 && b1 && a1 === b1) return true;
          const a2 = onlyD(a), b2 = onlyD(b); if (a2 && b2 && a2 === b2) return true;
          if (a2 && b2 && a2.length >= 7 && b2.length >= 7) return a2.startsWith(b2.slice(0,8))||b2.startsWith(a2.slice(0,8))||a2.includes(b2.slice(0,8))||b2.includes(a2.slice(0,8));
          return false;
        };
        const mainCount = ownRels.filter(r=>robustMatch(r.source, normM) || robustMatch(r.target, normM)).length;
        const mtTrueCount = ownRels.filter(r=>r?.information_source?.match_type === true).filter(r=>robustMatch(r.source, normM) || robustMatch(r.target, normM)).length;
        const mtFalseCount = ownRels.filter(r=>!r?.information_source?.match_type).filter(r=>robustMatch(r.source, normM) || robustMatch(r.target, normM)).length;
        printOnce('mesh_v1.5_summary', `%c   ➕ [MESH v1.5 🔥 NO MATCHTYPE FILTER!] OWNED_BY TOT=${ownRels_raw_ALL.length} dedup=${ownRels.length} noMatchType=${ownRels_noMatchType.length} matchTRUE=${ownRels_matchType.length} | MAIN dentro ownRels: ${mainCount} (mtFALSE=${mtFalseCount}, mtTRUE=${mtTrueCount})`, 'color:#831843;background:#fce7f3;border:1px solid #f9a8d4;padding:2px 10px;border-radius:4px;font-weight:700');
        if (mainCount > 0) {
          tableOnce('mesh_v1.5_top5', ownRels.filter(r=>robustMatch(r.source, normM) || robustMatch(r.target, normM)).slice(0,5).map(r=>({raw_s:r.source, raw_t:r.target, match_type: (r?.information_source?.match_type === true ? 'TRUE' : (r?.information_source?.match_type ? 'OBJ/STR' : 'FALSE')), robust_s: robustMatch(r.source, normM), robust_t: robustMatch(r.target, normM)})));
        }
      } catch(e){}
    }

    // 🔧 FIX 15/09/2026: OWNED_BY bidirezionale.
    // Il payload Dequienes può ritornare OWNED_BY in ENTRAMBE le direzioni:
    //   Caso A (classico):  {source: "SOCIETA'", target: "DUENO", label:"OWNED_BY"}  → società è posseduta dal dueño
    //   Caso B (inverso):   {source: "FIGLIA",   target: "PADRE/SOC. MADRE", label:"OWNED_BY"}  → il RUT principale È LA SOC. MADRE (POSSIEDE figlie)
    //   Caso C (attuale):   {source: "FIGLIA",   target: "MAIN=92604000",        label:"OWNED_BY"}  → tutte le 20+ righe del JSON sono inversa!
    // Senza questo fix, se il mainRut matcha solo la parte target (Caso B/C): ownRows = [] → "Sin datos".
    //
    // Strategia: costruiamo ownRelsNormalizzato = UNIONE di:
    //   1) ownRels originali (direzione A: source=società → target=dueño: processUpward cerca source==rut)
    //   2) ownRels FLIPPATE : se mainRut === target della relazione (Caso B/C), invertiamo source ↔ target
    //        {source: FIGLIA, target: MAIN} → flippato → {source: MAIN, target: FIGLIA, _flipped: true}
    //        Nota: in questo caso "target" diventa "la società figlia POSSIEDE da MAIN" = MAIN ne è proprietario.
    //        Però processUpward (direzione DUEÑI) non lo mostrerebbe come catena DUEÑI.
    //        In realtà questo scenario B/C = MAIN È PROPRIETARIO → dovrebbe stare in MeshFlowTable ("imprese partecipate").
    //        MA se non esistono relazioni dirette A (dove main è società posseduta), MeshTable va in "Sin datos" confondendo l'utente.
    //        Quindi aggiungiamo ANCHE le righe flipped come se fossero partecipazioni (livello 1) da mostrare per non lasciare vuota la sezione.
    //        → ma non espandiamo verso l'alto (non sono dueños, sono società figlie).
    // 🔧 FIX 15/09/2026 v1.1: OWNED_BY bidirezionale ROBUSTO (UNISCI SEMPRE + deduplica).
    //
    // La versione 1.0 usava un branch "if (!originaliSourceFound) { aggiungi flipped }"
    // BUG FATALE: basta 1 SOLA OWNED_BY CASO A (source=main) in tutto l'array (anche sbagliata
    // o matchante solo per caso) → il branch salta → NESSUNA flipped aggiunta →
    // → buildOwnRows trova solo la 1 riga falsa, oppure 0 righe → "Sin datos" spazzando 37+ relazioni vere.
    //
    // SOLUZIONE v1.1 ROBUSTA (branch eliminato del tutto):
    //   1) Calcola SEMPRE set1 = directSet (source==main → Caso A classico: main è posseduta, dueño=N)
    //   2) Calcola SEMPRE set2 = flippedSet (target==main → Caso B inverso: main è proprietario)
    //   3) UNIONE set1 ∪ set2 tramite chiave `${src}__${tgt}` (deduplicazione 100%)
    // → Qualsiasi mix di casi A + B viene catturato. Mai più "Sin datos" per 1 riga falsa.
    const mainNorm = normalizeRut(cleanMain || '');
    // ========== 🔧 DEBUG BANNER SEMPRE (v1.3 15.09) + counts MATCH ROBUST!
    if (typeof window !== 'undefined') {
        try {
            const ownRelsSrc = ownRels.slice(0,5).map((r: any) => ({raw_s:String(r.source||''), raw_t:String(r.target||''), norm_s:normalizeRut(String(r.source||'')), norm_t:normalizeRut(String(r.target||''))}));
            // counts con FALLBACK ROBUSTO!
            const sEq = ownRels.filter((r:any)=> rutMatchRobust(r.source, cleanMain)).length;
            const tEq = ownRels.filter((r:any)=> rutMatchRobust(r.target, cleanMain)).length;
            // conteggio X campioni per vedere dove sta main (se c'è!)
            const mainHits = ownRels.filter((r:any)=>rutMatchRobust(r.source, cleanMain)||rutMatchRobust(r.target, cleanMain)).length;
            // eslint-disable-next-line no-console
            printOnce('mesh_dbg_v1.3',
                `%c🔎 [MESH DBG v1.3 ROBUSTO • 15.09.2026] %cMAIN debug: cleanMain=${JSON.stringify(cleanMain)} mainNorm=${JSON.stringify(mainNorm)} mainRut_PROP=${JSON.stringify(mainRut)} detectMainRut(rels)=${JSON.stringify(detectMainRut(ownRels))}  ||  ownRels=${ownRels.length}  rutMatchRobust(source==main) (CasoA):${sEq}   rutMatchRobust(target==main) (CasoB flipped):${tEq}   ownRels with MAIN TOT = ${mainHits}  || PRIME 5 relazioni:`,
                'background:#7c3aed;color:#fff;font-weight:700;padding:4px 8px;border-radius:4px',
                'color:#4c1d95;font-weight:600'
            );
            if (mainHits > 0) {
              // eslint-disable-next-line no-console
              tableOnce('mesh_dbg_top5', ownRels.filter((r:any)=>rutMatchRobust(r.source, cleanMain)||rutMatchRobust(r.target, cleanMain)).slice(0,5).map((r:any)=>({raw_s:String(r.source||''), raw_t:String(r.target||''), matchRobust_s:rutMatchRobust(r.source, cleanMain), matchRobust_t:rutMatchRobust(r.target, cleanMain)})));
            } else {
              // eslint-disable-next-line no-console
              tableOnce('mesh_dbg_relsSrc', ownRelsSrc);
            }
        } catch(e){}
    }
    // ========== FINE DEBUG v1.3
    // 🔧 Fix 25.09: SEPARAZIONE NETTA — MeshTable = SOLO struttura di proprietà (DUEÑOS / OWNERS).
    //    NON includere flipped (partecipazioni / owned = società dove main è proprietario).
    //    Semantica OWNED_BY canonica: source = ENTITÀ POSSEDUTA, target = PROPRIETARIO / DUEÑO.
    //    → Direct match (main = source) → main è posseduta da target = dueño N1 (STRUTTURA PROPRIETÀ ✔︎).
    //    → Flipped match (main = target) → main è il proprietario (NON va nella struttura di proprietà ✘).
    const directRels: any[] = [];
    const unionKey = new Set<string>();
    for (const r of ownRels) {
      const s = normalizeRut(String(r.source || ''));
      const t = normalizeRut(String(r.target || ''));
      // SOLO direct: main è posseduta da dueño (main in source, target = dueño N1)
      if (rutMatchRobust(r.source, cleanMain) && s !== t) {
        const k = `${s}__${t}`;
        if (!unionKey.has(k)) { unionKey.add(k); directRels.push({ ...r, _direction: 'direct' }); }
      }
    }
    // 🔧 Fix 25.09: Normalizzazione BIDIREZIONALE per BFS (non-MAIN livelli N2+)
    //    N1 è solo direct (main=source), ma da N2 in su relazioni potrebbero essere in direzione opposta.
    //    Costruiamo union completa (bidirezionale) MA escludiamo flipped a N1 di main.
    const bfsUnionKey = new Set<string>();
    const bfsRelPool: any[] = [];
    for (const r of ownRels) {
      const s = normalizeRut(String(r.source || ''));
      const t = normalizeRut(String(r.target || ''));
      if (!s || !t || s === t) continue;
      const k1 = `${s}__${t}`;
      if (!bfsUnionKey.has(k1)) {
        bfsUnionKey.add(k1);
        bfsRelPool.push({ ...r, _direction: 'direct' });
      }
      const k2 = `${t}__${s}`;
      if (!bfsUnionKey.has(k2)) {
        bfsUnionKey.add(k2);
        bfsRelPool.push({
          ...r,
          _flippedDirection: true,
          source: String(r.target || ''),
          target: String(r.source || ''),
        });
      }
    }
    const ownRelsNormalizzato: any[] = directRels;
    const originaliCountDir = directRels.length;
    const flippedCount = 0;

    // ── OWNED_BY ──────────────────────────────────────────────────────────────

    const buildOwnRows = (): OwnRow[] => {
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

            // A N1 usiamo ownRelsNormalizzato (solo direct, senza flipped di main).
            // Da N2+ usiamo bfsRelPool (bidirezionale) perché relazioni intermedie
            // possono essere in direzione qualsiasi nel JSON originale.
            const pool = level === 1 ? ownRelsNormalizzato : bfsRelPool;
            const matched = pool.filter((r: any) => rutMatchRobust(r.source, rut));

            for (const r of matched) {
                const ownerRut = normalizeRut(String(r.target || ''));
                if (branchAncestors.has(ownerRut)) continue;
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

                // Continuiamo verso l'alto solo per società (padri società → N2+)
                if (isSociedad(ownerRut)) {
                    processUpward(ownerRut, level + 1, id, branchAncestors);
                }
            }
        };

        if (!rootIsPerson) {
            processUpward(cleanMain, 1, null, new Set());
        } else {
            // rootIsPerson: cleanMain è persona. La riga mostra companiesOwned
            // (= società dove la persona è socio / dueña).
            // Per MeshTable (struttura proprietà) cerchiamo relazioni in cui
            // PERSONA è PROPRIETARIA (target = persona), società = source.
            const companiesOwned = bfsRelPool.filter(
                (r: any) => rutMatchRobust(r.target, cleanMain),
            );

            for (const r of companiesOwned) {
                const companyRut = normalizeRut(String(r.source || ''));
                if (!companyRut || rutMatchRobust(companyRut, cleanMain)) continue;
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

    // 🔧 FIX 21.09 — BANNER DIAGNOSTICO "PERCHÉ ownRows=0?"
    //    Se ownRows è vuoto MA ownRels ha OWNED_BY → problema di matching RUT (main vs relazioni).
    //    Stampiamo TUTTO il necessario per capire in console.
    if (typeof window !== 'undefined' && ownRows.length === 0 && ownRels.length > 0) {
      try {
        const cssB = 'background:#b45309;color:#fff;padding:3px 10px;border-radius:4px;font-weight:700';
        const dirC = directRels.length;
        const flipC = flippedCount;
        const normC = (s:any) => String(s??'').replace(/[^0-9]/g,'');
        // Top 5 OWNED_BY più frequenti (per vedere se main c'è o no)
        const fh: Record<string,number> = {};
        for (const r of ownRels) {
          const s=normC(r.source), t=normC(r.target);
          if (s) fh[s]=(fh[s]||0)+1;
          if (t) fh[t]=(fh[t]||0)+1;
        }
        const topFreq = Object.entries(fh).sort((a,b)=>b[1]-a[1]).slice(0,5);
        printOnce(
          'mesh_ownRows0_diag',
          `%c⚠️ [MESH DIAG • ownRows=0 ma ownRels=${ownRels.length}]%c cleanMain=${JSON.stringify(cleanMain)} mainRutProp=${JSON.stringify(mainRut)} detectMainRut(ownRels)=${JSON.stringify(detectMainRut(ownRels))} direct=${dirC} flipped=${flipC}  |  Top5 freq RUT OWNED_BY: ${JSON.stringify(topFreq)}`,
          cssB, 'color:#92400e;font-weight:600'
        );
        if (ownRels.length) {
          tableOnce('mesh_ownRows0_sample', ownRels.slice(0,5).map((r:any)=>({
            raw_s:String(r.source||''), raw_t:String(r.target||''),
            match_s_MAIN:rutMatchRobust(r.source, cleanMain), match_t_MAIN:rutMatchRobust(r.target, cleanMain),
            label:r.label
          })));
        }
      } catch(e){}
    }

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

    const thStyle: React.CSSProperties = {
        border: '1px solid #e5e7eb', padding: '6px 8px', textAlign: 'left',
        fontSize: '12px', fontWeight: 600, color: '#374151',
        backgroundColor: '#f3f4f6', wordBreak: 'break-word',
    };
    const tdStyle: React.CSSProperties = {
        border: '1px solid #e5e7eb', padding: '6px 8px', fontSize: '13px',
        verticalAlign: 'middle', wordBreak: 'break-word',
    };

    // 🔧 Banner deploy versione fix 25/09
    const BANNER_VERSION = '[MESH OWNERS-ONLY v1.2 • 25.09.2026]';
    if (typeof window !== 'undefined') {
        try {
            // eslint-disable-next-line no-console
            printOnce('mesh_bidi_v1.1',
                `%c🟢 ${BANNER_VERSION} %cSOLO struttura di proprietà (directN1=${originaliCountDir} / flipped a N1 esclusi / bidirezionale N2+ pool=${bfsRelPool.length} / ownRels tot=${ownRels.length})`,
                'background:#1d4ed8;color:#fff;font-weight:700;padding:4px 8px;border-radius:4px',
                'color:#1d4ed8;font-weight:600'
            );
        } catch {}
    }

    const NivelBadge = ({ level }: { level: number }) => (
        <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '32px', height: '24px', borderRadius: '4px',
            backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: '12px', fontWeight: 700,
        }}>N{level}</span>
    );

    const EntityCell = ({ rut, name }: { rut: string; name: string; color: string }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: '#9ca3af', flexShrink: 0 }}>{formatRutForDisplay(rut)}</span>
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

    // ── Mapa conceptual ───────────────────────────────────────────────────────
    // Usa exactamente los mismos ownRows que la tabla (dueños hacia arriba).
    // Layout izquierda→derecha: N0 = RUT principal | N1 = dueños | N2..N5 = dueños-de-dueños.
    const buildMapLayout = () => {
        if (!ownRows.length) return null;

        const slot = NODE_H + ROW_GAP;
        const cyMap = new Map<number, number>();
        let rowCursor = 0;

        const place = (rowId: number) => {
            const row = ownRows.find(r => r.id === rowId);
            if (!row) return;
            const kids = ownRows.filter(r => r.parentId === rowId);
            const isExp = forceExpanded || expandedOwn.has(rowId);
            const visibleKids = isExp ? kids : [];
            if (!visibleKids.length) {
                cyMap.set(rowId, rowCursor * slot + NODE_H / 2);
                rowCursor++;
            } else {
                visibleKids.forEach(k => place(k.id));
                const fy = cyMap.get(visibleKids[0].id)!;
                const ly = cyMap.get(visibleKids[visibleKids.length - 1].id)!;
                cyMap.set(rowId, (fy + ly) / 2);
            }
        };

        rootOwnRows.forEach(r => place(r.id));

        let rootCy: number;
        if (rootOwnRows.length) {
            const fy = cyMap.get(rootOwnRows[0].id)!;
            const ly = cyMap.get(rootOwnRows[rootOwnRows.length - 1].id)!;
            rootCy = (fy + ly) / 2;
        } else {
            rootCy = NODE_H / 2;
        }

        interface MapNode {
            key: string;
            level: number;
            rut: string;
            name: string;
            percentage: number | null;
            isCompany: boolean;
            cx: number;
            top: number;
            isMain: boolean;
            rowId: number | null;
            hasChildren: boolean;
            isExpanded: boolean;
        }
        interface MapEdge {
            id: string;
            x1: number; y1: number;
            x2: number; y2: number;
            pct: number | null;
        }

        const colStep = NODE_W + COL_GAP;
        const nodes: MapNode[] = [];
        const edges: MapEdge[] = [];

        let minY = rootCy - NODE_H / 2;
        let maxY = rootCy + NODE_H / 2;
        let maxLvl = 0;

        const visitedIds = new Set<number>();
        const walk = (rowId: number) => {
            if (visitedIds.has(rowId)) return;
            visitedIds.add(rowId);
            const row = ownRows.find(r => r.id === rowId);
            if (!row) return;
            const cy = cyMap.get(rowId);
            if (cy == null) return;
            minY = Math.min(minY, cy - NODE_H / 2);
            maxY = Math.max(maxY, cy + NODE_H / 2);
            maxLvl = Math.max(maxLvl, row.level);

            const kids = ownRows.filter(r => r.parentId === rowId);
            const isExp = forceExpanded || expandedOwn.has(rowId);

            nodes.push({
                key: `n${rowId}`,
                level: row.level,
                rut: row.targetRut,
                name: row.targetName,
                percentage: row.percentage,
                isCompany: isSociedad(row.targetRut),
                cx: row.level * colStep + NODE_W / 2 + PAD,
                top: cy,
                isMain: false,
                rowId,
                hasChildren: kids.length > 0,
                isExpanded: isExp,
            });

            if (isExp) kids.forEach(k => walk(k.id));
        };
        rootOwnRows.forEach(r => walk(r.id));

        const rootNode: MapNode = {
            key: 'root',
            level: 0,
            rut: cleanMain,
            name: getName(cleanMain),
            percentage: null,
            isCompany: isSociedad(cleanMain),
            cx: NODE_W / 2 + PAD,
            top: rootCy,
            isMain: true,
            rowId: null,
            hasChildren: rootOwnRows.length > 0,
            isExpanded: true,
        };

        // Normalizo Y de center -> top con padding
        rootNode.top = rootNode.top - NODE_H / 2 - minY + PAD;
        nodes.forEach(n => { n.top = n.top - NODE_H / 2 - minY + PAD; });

        const allNodes = [rootNode, ...nodes];
        const byKey = new Map(allNodes.map(n => [n.key, n]));
        const rowIdToKey = new Map<number, string>();
        nodes.forEach(n => { if (n.rowId != null) rowIdToKey.set(n.rowId, n.key); });

        // root -> N1
        rootOwnRows.forEach(r => {
            const key = rowIdToKey.get(r.id);
            if (!key) return;
            const child = byKey.get(key)!;
            edges.push({
                id: `root->${key}`,
                x1: rootNode.cx + NODE_W / 2,
                y1: rootNode.top + NODE_H / 2,
                x2: child.cx - NODE_W / 2,
                y2: child.top + NODE_H / 2,
                pct: r.percentage,
            });
        });

        // padre expandido -> hijos
        nodes.forEach(parentNode => {
            if (parentNode.rowId == null || !parentNode.isExpanded) return;
            const kids = ownRows.filter(r => r.parentId === parentNode.rowId);
            kids.forEach(k => {
                const key = rowIdToKey.get(k.id);
                if (!key) return;
                const child = byKey.get(key)!;
                edges.push({
                    id: `${parentNode.key}->${key}`,
                    x1: parentNode.cx + NODE_W / 2,
                    y1: parentNode.top + NODE_H / 2,
                    x2: child.cx - NODE_W / 2,
                    y2: child.top + NODE_H / 2,
                    pct: k.percentage,
                });
            });
        });

        const width = maxLvl * colStep + NODE_W + PAD * 2;
        const fullHeight = maxY - minY + PAD * 2;

        return { allNodes, edges, width, fullHeight, maxLvl };
    };

    const expandAll = () => {
        const all = new Set<number>();
        ownRows.forEach(r => {
            if (ownRows.some(c => c.parentId === r.id)) all.add(r.id);
        });
        setExpandedOwn(all);
    };
    const collapseAll = () => setExpandedOwn(new Set());

    const renderMap = () => {
        const layout = buildMapLayout();
        if (!layout) {
            return (
                <p className="text-gray-500 dark:text-gray-400 italic text-sm py-4">
                    Sin datos de malla societaria
                </p>
            );
        }

        const renderNode = (n: any) => {
            let bg: string, border: string, badgeBg: string, badgeTx: string, sub: string, nameCol: string;
            if (n.isMain) {
                bg = '#2563eb'; border = '#1d4ed8'; badgeBg = '#ffffff';
                badgeTx = '#1d4ed8'; sub = '#bfdbfe'; nameCol = '#ffffff';
            } else if (n.isCompany) {
                bg = '#ffffff'; border = '#60a5fa'; badgeBg = '#dbeafe';
                badgeTx = '#1d4ed8'; sub = '#6b7280'; nameCol = '#111827';
            } else {
                bg = '#fefce8'; border = '#facc15'; badgeBg = '#dbeafe';
                badgeTx = '#1d4ed8'; sub = '#6b7280'; nameCol = '#111827';
            }

            const nameLines = wrapName(n.name);
            const left = n.cx - NODE_W / 2;
            const showToggle = n.hasChildren && !forceExpanded && !n.isMain && n.rowId != null;

            return (
                <g key={n.key} transform={`translate(${left}, ${n.top})`}>
                    <rect width={NODE_W} height={NODE_H} rx={10} fill={bg} stroke={border} strokeWidth={2} />
                    <rect x={12} y={11} width={26} height={15} rx={4} fill={badgeBg} />
                    <text x={25} y={22} textAnchor="middle" fontSize={10} fontWeight={700} fill={badgeTx}>N{n.level}</text>
                    <text x={45} y={22} fontSize={10} fill={sub}>{n.isCompany ? 'Empresa' : 'Persona'}</text>
                    <text x={13} y={42} fontSize={11} fill={sub} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
                        {formatRutForDisplay(n.rut)}
                    </text>
                    {nameLines.map((ln: string, i: number) => (
                        <text key={i} x={13} y={58 + i * 14} fontSize={12} fontWeight={600} fill={nameCol}>{ln}</text>
                    ))}
                    {!n.isMain && n.percentage != null && (
                        <text x={13} y={84} fontSize={10} fontWeight={600} fill="#2563eb">
                            {n.percentage}% participación
                        </text>
                    )}
                    {showToggle && (
                        <g
                            transform={`translate(${NODE_W}, ${NODE_H / 2})`}
                            style={{ cursor: 'pointer' }}
                            onClick={(e) => { e.stopPropagation(); toggleOwn(n.rowId); }}
                        >
                            <circle r={11} fill={n.isExpanded ? '#ef4444' : '#16a34a'} stroke="#ffffff" strokeWidth={2} />
                            <text textAnchor="middle" y={4} fontSize={15} fontWeight={700} fill="#ffffff">
                                {n.isExpanded ? '\u2212' : '+'}
                            </text>
                        </g>
                    )}
                </g>
            );
        };

        return (
            <>
                {!forceExpanded && (
                    <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 mb-3 flex flex-wrap items-center gap-3 text-sm">
                        <span>
                            <span className="text-gray-600 dark:text-gray-400">Nivel: </span>
                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                                {layout.maxLvl} / {maxLevel}
                            </span>
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

                <div
                    className="border border-gray-300 dark:border-gray-600 rounded-lg"
                    style={{ background: '#ffffff', overflow: 'auto' }}
                >
                    <svg
                        width={layout.width}
                        height={layout.fullHeight}
                        viewBox={`0 0 ${layout.width} ${layout.fullHeight}`}
                        xmlns="http://www.w3.org/2000/svg"
                        style={{ display: 'block', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
                    >
                        <rect x={0} y={0} width={layout.width} height={layout.fullHeight} fill="#ffffff" />
                        {layout.edges.map((e: any) => {
                            const midX = (e.x1 + e.x2) / 2;
                            return (
                                <g key={e.id}>
                                    <path
                                        d={`M ${e.x1},${e.y1} C ${midX},${e.y1} ${midX},${e.y2} ${e.x2},${e.y2}`}
                                        fill="none" stroke="#94a3b8" strokeWidth={1.6}
                                    />
                                    {e.pct != null && (
                                        <g transform={`translate(${midX}, ${(e.y1 + e.y2) / 2})`}>
                                            <rect x={-21} y={-9} width={42} height={18} rx={4} fill="#eff6ff" stroke="#bfdbfe" />
                                            <text textAnchor="middle" y={4} fontSize={10} fontWeight={700} fill="#1d4ed8">
                                                {e.pct}%
                                            </text>
                                        </g>
                                    )}
                                </g>
                            );
                        })}
                        {layout.allNodes.map(renderNode)}
                    </svg>
                </div>

                {!forceExpanded && (
                    <p className="text-xs text-gray-400 mt-1.5">
                        Usá el botón <span className="font-semibold text-green-600">+</span> al costado de cada nodo para expandir sus dueños.
                        Hasta {MAX_DEPTH} niveles de profundidad.
                    </p>
                )}
            </>
        );
    };

    return (
        <div className="mt-4 mb-4" data-pdf="mesh-table">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <h3 className="text-lg font-bold dark:text-white">{title}</h3>
           {/*      {ownRows.length > 0 && !forceExpanded && (
                    <button
                        onClick={() => setViewMode(v => v === 'table' ? 'map' : 'table')}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors"
                    >
                        {viewMode === 'table' ? 'Ver mapa conceptual' : 'Ver tabla'}
                    </button>
                )} */}
            </div>

            {viewMode === 'map' && ownRows.length > 0 ? (
                renderMap()
            ) : (
                <div className="space-y-6">
                    {ownRows.length > 0 ? (
                        <div>
                           {/*  <SectionToggle
                                label=""
                                open={showOwn}
                                onToggle={() => setShowOwn(v => !v)}
                            /> */}

                            
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
                          
                        </div>
                    ) : (
                        <p className="text-gray-500 dark:text-gray-400 italic text-sm py-4">Sin datos de malla societaria</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default MeshTable;