const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'src/pages/FastCheckEX.tsx');
let content = fs.readFileSync(filePath, 'utf8');

console.log('[V6] File FastCheckEX.tsx size:', content.length);

// ============================================================================
// BLOCCO 1: const raw (4 path hardcodati) -> ricerca ricorsiva
// MARCATORI costruiti con TEMPLATE LITERAL BACKTICK -> newline VERE 0x0a!
// ============================================================================
const BLK1_START = `    const raw =
      cleanedData?.sheriffLogData?.filteredDetails?.dequinesRelationships ||`;
const BLK1_END   = `    if (!raw) return undefined;`;

const idxBlk1Start = content.indexOf(BLK1_START);
let idxBlk1End = -1;
if (idxBlk1Start >= 0) {
  const tail = content.substring(idxBlk1Start);
  const relIdx = tail.indexOf(BLK1_END);
  if (relIdx >= 0) idxBlk1End = idxBlk1Start + relIdx + BLK1_END.length;
}
console.log('[V6] Blocco 1 start:', idxBlk1Start, ' end:', idxBlk1End, idxBlk1Start>=0 && idxBlk1End>0 ? '✅' : '❌');

const NEW_BLK1 = `    const normRut = (s: any) => String(s ?? '').replace(/[^0-9Kk]/g, '').toLowerCase();
    // Ricerca RICORSIVA dequinesRelationships (qualunque path, qualunque profondità max 14)
    const findAllByKeyPatternFn = (
      obj: any, keyPattern: RegExp, currentPath = 'cleanedData',
      visited = new WeakSet(), maxDepth = 14, depth = 0,
      results: Array<{ path: string; value: any; depth: number }> = []
    ) => {
      if (!obj || depth > maxDepth || typeof obj !== 'object') return results;
      try { if (visited.has(obj)) return results; visited.add(obj); } catch (e) { /* circular safe */ }
      for (const key of Object.keys(obj)) {
        const val = (obj as any)[key];
        const fullPath = currentPath + '.' + key;
        if (keyPattern.test(key)) results.push({ path: fullPath, value: val, depth });
        if (val && typeof val === 'object') {
          findAllByKeyPatternFn(val, keyPattern, fullPath, visited, maxDepth, depth + 1, results);
        }
      }
      return results;
    };
    const scoreCandidateFn = (c: { value: any; depth: number }) => {
      const v = c.value;
      if (Array.isArray(v)) return v.length > 0 ? 1000 - c.depth : 10 - c.depth;
      if (v && typeof v === 'object') {
        const rels = (v as any).relationships;
        if (Array.isArray(rels)) return rels.length > 0 ? 900 - c.depth : 100 - c.depth;
        return 50 - c.depth;
      }
      if (v === undefined || v === null) return -1000;
      return 1 - c.depth;
    };
    const allMatchesFinder = findAllByKeyPatternFn(cleanedData, /^dequinesRelationships$/i);
    const allLooseMatchesFinder = findAllByKeyPatternFn(cleanedData, /dequien|relationship/i);
    const sorted = allMatchesFinder.slice().sort((a, b) => scoreCandidateFn(b) - scoreCandidateFn(a));
    const topCand = sorted[0];
    const raw = topCand ? topCand.value : undefined;

    // Banner console MINIMAL (niente backtick annidati / no crash TS parser!)
    try {
      const countR = Array.isArray(raw) ? raw.length :
        (raw && typeof raw === 'object' && Array.isArray((raw as any).relationships) ? (raw as any).relationships.length : 0);
      const countN = (raw && typeof raw === 'object' && (raw as any).entityNames && typeof (raw as any).entityNames === 'object')
        ? Object.keys((raw as any).entityNames).length : 0;
      const cssBanner = 'background:#0052cc;color:#fff;padding:3px 7px;border-radius:3px;font-weight:bold';
      const cssSub = 'color:#42526e';
      const topKeysShort = Object.keys(cleanedData ?? {}).slice(0, 8).join(',');
      const chosenStr = topCand ? (topCand.path + ' depth=' + topCand.depth) : 'NESSUNO';
      const typeStr = Array.isArray(raw) ? ('Array(' + raw.length + ')') :
        (raw && typeof raw === 'object' ? ('Obj(rels=' + countR + ',names=' + countN + ')') : String(raw));
      const bannerMsg = '%c🟢 [DEQUIES_FINDER v1.0 • 15.09.2026]%c  topkeys=' + topKeysShort +
                        '  matchStrict=' + allMatchesFinder.length +
                        '  matchLoose=' + allLooseMatchesFinder.length +
                        '  chosen=' + chosenStr +
                        '  type=' + typeStr +
                        '  totalRels=' + countR;
      console.log(bannerMsg, cssBanner, cssSub);
      if (allMatchesFinder.length > 0) {
        console.log('  Tutti i match strict:', allMatchesFinder.map(function(m) {
          return {
            p: m.path, d: m.depth, s: scoreCandidateFn(m),
            t: Array.isArray(m.value) ? ('A(' + m.value.length + ')') :
               (m.value && typeof m.value === 'object' ? 'O' : typeof m.value)
          };
        }));
      }
      if (!raw) console.warn('%c  ⚠️ RAW=UNDEFINED! Usa window.__debugFastCheck.findAll(/dequien/i)',
                             'color:#ff6b00;font-weight:bold');
    } catch (e) { /* banner non deve mai bloccare useMemo */ }

    if (!raw) return undefined;`;

if (idxBlk1Start >= 0 && idxBlk1End > 0) {
  content = content.substring(0, idxBlk1Start) + NEW_BLK1 + content.substring(idxBlk1End);
  console.log('[V6] Blocco 1 sostituito ✅');
} else {
  console.log('[V6] ❌ Blocco 1 non trovato, esco!');
  process.exit(1);
}

// ============================================================================
// BLOCCO 2: const norm = ... -> commento + riferimenti norm() -> normRut()
// ============================================================================
const BLK2_NORM_DECL = `    const norm = (s: any) => String(s ?? '').replace(/[^0-9Kk]/g, '').toLowerCase();`;
let idxNorm = content.indexOf(BLK2_NORM_DECL);
console.log('[V6] Blocco 2 idx const norm:', idxNorm, idxNorm >= 0 ? '✅' : '⚠️ SKIP');
if (idxNorm >= 0) {
  content = content.substring(0, idxNorm) + '    // normRut già definito sopra, usiamo quello' + content.substring(idxNorm + BLK2_NORM_DECL.length);
  content = content.split('lookup[norm(k)]').join('lookup[normRut(k)]');
  content = content.split('lookup[norm(r.source)]').join('lookup[normRut(r.source)]');
  content = content.split('lookup[norm(r.target)]').join('lookup[normRut(r.target)]');
  console.log('[V6] Blocco 2 sostituito + riferimenti norm()→normRut() ✅');
}

// ============================================================================
// BLOCCO 3: Aggiorniamo blocco UNIFORMA AD ARRAY
// ============================================================================
const BLK3_START = `    // UNIFORMA SEMPRE AD ARRAY (formato atteso dai 3 componenti!)`;
const BLK3_END   = `    return undefined;`;
let idxBlk3Start = content.indexOf(BLK3_START);
let idxBlk3End = -1;
if (idxBlk3Start >= 0) {
  const chunk = content.substring(idxBlk3Start, idxBlk3Start + 800);
  const relIdx = chunk.indexOf(BLK3_END);
  if (relIdx >= 0) idxBlk3End = idxBlk3Start + relIdx + BLK3_END.length;
}
console.log('[V6] Blocco 3 start:', idxBlk3Start, ' end:', idxBlk3End, idxBlk3Start>=0 && idxBlk3End>0 ? '✅' : '⚠️ SKIP');

const NEW_BLK3_UNIF = `    // UNIFORMA SEMPRE AD ARRAY (formato atteso dai 3 componenti!)
    let finalArray: Array<any> | undefined = undefined;
    if (Array.isArray(filteredMesh)) finalArray = filteredMesh;
    else if (filteredMesh && typeof filteredMesh === 'object') {
      if (Array.isArray((filteredMesh as any).relationships)) finalArray = (filteredMesh as any).relationships;
      else finalArray = [];
    }
    // Banner output minimal
    try {
      const countByLabel: Record<string, number> = {};
      if (finalArray) for (const r of finalArray) { if (r && r.label) countByLabel[r.label] = (countByLabel[r.label] || 0) + 1; }
      const css = finalArray && finalArray.length ? 'color:#2ea44f;font-weight:bold' : 'color:#ff2d2d;font-weight:bold';
      const msg = '%c  🔚 Output useMemo: ' + (Array.isArray(finalArray) ? ('Array(' + finalArray.length + ')') : String(finalArray)) +
                  (finalArray && finalArray.length ? ('  labels=' + JSON.stringify(countByLabel)) : '  ⚠️ VUOTO!');
      console.log(msg, css);
    } catch (e) { /* ignore banner error */ }
    return finalArray;`;

if (idxBlk3Start >= 0 && idxBlk3End > 0 && idxBlk3End - idxBlk3Start < 900) {
  content = content.substring(0, idxBlk3Start) + NEW_BLK3_UNIF + content.substring(idxBlk3End);
  console.log('[V6] Blocco 3 sostituito ✅');
} else {
  console.log('[V6] Blocco 3 SKIP (non trovato o troppo lungo - va bene anche com\'è)');
}

// ============================================================================
// BLOCCO 4: Dep array + useEffect inject window.__debugFastCheck
// ============================================================================
const BLK4_START = `  }, [
    cleanedData?.sheriffLogData?.filteredDetails?.dequinesRelationships,`;
const BLK4_END   = `  // User notes state`;
let idxBlk4Start = content.indexOf(BLK4_START);
let idxBlk4End = -1;
if (idxBlk4Start >= 0) idxBlk4End = content.indexOf(BLK4_END, idxBlk4Start);
console.log('[V6] Blocco 4 start:', idxBlk4Start, ' end:', idxBlk4End, idxBlk4Start>=0 && idxBlk4End>0 ? '✅' : '❌');

const NEW_BLK4_FULL = `}, [cleanedData]);

  useEffect(() => {
    const findFn = (
      obj: any, keyPattern: RegExp, currentPath = 'root',
      visited = new WeakSet(), maxDepth = 14, depth = 0,
      results: Array<{ path: string; value: any; depth: number }> = []
    ) => {
      if (!obj || depth > maxDepth || typeof obj !== 'object') return results;
      try { if (visited.has(obj)) return results; visited.add(obj); } catch (e) {}
      for (const key of Object.keys(obj)) {
        const val = (obj as any)[key];
        const fullPath = currentPath + '.' + key;
        if (keyPattern.test(key)) results.push({ path: fullPath, value: val, depth });
        if (val && typeof val === 'object') findFn(val, keyPattern, fullPath, visited, maxDepth, depth + 1, results);
      }
      return results;
    };
    try {
      (window as any).__debugFastCheck = {
        cleanedData: cleanedData,
        rawData: data,
        dequinesForMesh: dequinesForMesh,
        normRut: function(s: any) { return String(s ?? '').replace(/[^0-9Kk]/g, '').toLowerCase(); },
        findAll: function(pattern: RegExp) {
          if (!pattern) pattern = /dequien|relationship/i;
          return findFn(cleanedData, pattern).map(function(m) {
            const v = m.value;
            let type = typeof v;
            if (Array.isArray(v)) type = 'Array(' + v.length + ')';
            else if (v && typeof v === 'object') {
              const r = (v as any).relationships;
              const n = (v as any).entityNames;
              type = 'Obj{rels:' + (Array.isArray(r) ? r.length : '?') +
                            ', names:' + (n && typeof n === 'object' ? Object.keys(n).length : '?') + '}';
            } else {
              type = String(v);
            }
            return { path: m.path, depth: m.depth, type: type };
          });
        }
      };
      const cssBanner = 'background:#9900cc;color:#fff;padding:3px 7px;border-radius:3px;font-weight:bold';
      const cssSub = 'color:#6b778c';
      console.log('%c🔧 [DEBUG GLOBAL INJECTED]%c window.__debugFastCheck pronta! Prova: window.__debugFastCheck.findAll(/dequien/i)',
                  cssBanner, cssSub);
    } catch (e) { /* ignore */ }
  }, [cleanedData, data, dequinesForMesh]);

  // User notes state`;

if (idxBlk4Start >= 0 && idxBlk4End > idxBlk4Start) {
  content = content.substring(0, idxBlk4Start) + NEW_BLK4_FULL + content.substring(idxBlk4End);
  console.log('[V6] Blocco 4 sostituito ✅');
} else {
  console.log('[V6] ❌ Blocco4 non trovato!');
  process.exit(2);
}

const backupP = filePath + '.bak.v6_FINAL_OK';
fs.copyFileSync(filePath, backupP);
fs.writeFileSync(filePath, content, 'utf8');
console.log('\n✅ TUTTO OK! Backup:', path.basename(backupP));
console.log('✅ Ora esegui npm run build e vediamo se passa!');
