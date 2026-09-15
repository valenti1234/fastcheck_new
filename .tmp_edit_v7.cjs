const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'src/pages/FastCheckEX.tsx');
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('[V7] Lines:', lines.length);

// ============================================================================
// 1) Trova le linee per i marker ESATTI dal file stesso!
// ============================================================================

// Blocco 1 marker: "const raw ="
let lineConstRaw = -1; // L240 o simili
for (let i = 0; i < lines.length; i++) {
  if (lines[i].indexOf('const raw =') >= 0) { lineConstRaw = i; break; }
}
if (lineConstRaw < 0) { console.log('❌ const raw = non trovato!'); process.exit(1); }
console.log('[V7] Linea const raw = :', lineConstRaw + 1, '>>>', lines[lineConstRaw], '<<<');

// Start marker ESATTO (2 linee)
const BLK1_START = lines[lineConstRaw] + '\n' + lines[lineConstRaw + 1];
console.log('[V7] BLK1_START creato OK, length:', BLK1_START.length);

// End marker ESATTO: "if (!raw) return undefined;"
let lineIfRaw = -1;
// Cerca NELLE RIGHE SUCCESSIVE (entro 20 linee da lineConstRaw)
for (let i = lineConstRaw; i < lineConstRaw + 20 && i < lines.length; i++) {
  if (lines[i].indexOf('if (!raw) return undefined;') >= 0) { lineIfRaw = i; break; }
}
if (lineIfRaw < 0) { console.log('❌ if (!raw) return undefined; non trovato!'); process.exit(1); }
console.log('[V7] Linea if (!raw) ... :', lineIfRaw + 1, '>>>', lines[lineIfRaw], '<<<');
const BLK1_END = lines[lineIfRaw].trim() === 'if (!raw) return undefined;' ? lines[lineIfRaw] : '    if (!raw) return undefined;';

// Indici assoluti (con \n carattere vero 0x0a)
const idxBlk1Start = content.indexOf(BLK1_START);
const idxBlk1EndAbs = content.indexOf(BLK1_END, idxBlk1Start) + BLK1_END.length;
console.log('[V7] idxBlk1Start ABS:', idxBlk1Start, ' idxBlk1EndAbs:', idxBlk1EndAbs, idxBlk1Start>=0 && idxBlk1EndAbs>0 ? '✅' : '❌');

// NUOVO CODICE BLOCCO1
const NEW_BLK1 = `    const normRut = (s: any) => String(s ?? '').replace(/[^0-9Kk]/g, '').toLowerCase();
    // Ricerca RICORSIVA dequinesRelationships (qualunque path, max depth 14)
    const findAllByKeyPatternFn = (
      obj: any, keyPattern: RegExp, currentPath = 'cleanedData',
      visited = new WeakSet(), maxDepth = 14, depth = 0,
      results: Array<{ path: string; value: any; depth: number }> = []
    ) => {
      if (!obj || depth > maxDepth || typeof obj !== 'object') return results;
      try { if (visited.has(obj)) return results; visited.add(obj); } catch (e) {}
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
    const allLooseFinder = findAllByKeyPatternFn(cleanedData, /dequien|relationship/i);
    const sorted = allMatchesFinder.slice().sort((a, b) => scoreCandidateFn(b) - scoreCandidateFn(a));
    const topCand = sorted[0];
    const raw = topCand ? topCand.value : undefined;

    // Banner MINIMAL no-backtick-annidati
    try {
      const countR = Array.isArray(raw) ? raw.length :
        (raw && typeof raw === 'object' && Array.isArray((raw as any).relationships) ? (raw as any).relationships.length : 0);
      const countN = (raw && typeof raw === 'object' && (raw as any).entityNames && typeof (raw as any).entityNames === 'object')
        ? Object.keys((raw as any).entityNames).length : 0;
      const cssBanner = 'background:#0052cc;color:#fff;padding:3px 7px;border-radius:3px;font-weight:bold';
      const topKeysShort = Object.keys(cleanedData ?? {}).slice(0, 8).join(',');
      const chosenStr = topCand ? (topCand.path + ' depth=' + topCand.depth) : 'NESSUNO';
      const typeStr = Array.isArray(raw) ? ('Array(' + raw.length + ')') :
        (raw && typeof raw === 'object' ? ('Obj(rels=' + countR + ',names=' + countN + ')') : String(raw));
      const bannerMsg = '%c🟢 [DEQUIES_FINDER v1.0 • 15.09.2026]%c  topkeys=' + topKeysShort +
                        '  matchStrict=' + allMatchesFinder.length +
                        '  matchLoose=' + allLooseFinder.length +
                        '  chosen=' + chosenStr +
                        '  type=' + typeStr +
                        '  totalRels=' + countR;
      console.log(bannerMsg, cssBanner, 'color:#42526e');
      if (allMatchesFinder.length > 0) {
        console.log('  Match strict:', allMatchesFinder.map(function(m: any) {
          return { p: m.path, d: m.depth, s: scoreCandidateFn(m),
                   t: Array.isArray(m.value) ? ('A'+m.value.length) : (m.value && typeof m.value === 'object' ? 'O' : typeof m.value) };
        }));
      }
      if (!raw) console.warn('%c  ⚠️ RAW=UNDEFINED → usa window.__debugFastCheck.findAll(/dequien/i)',
                             'color:#ff6b00;font-weight:bold');
    } catch (e) {}

    if (!raw) return undefined;`;

if (idxBlk1Start >= 0 && idxBlk1EndAbs > idxBlk1Start) {
  content = content.substring(0, idxBlk1Start) + NEW_BLK1 + content.substring(idxBlk1EndAbs);
  console.log('[V7] Blocco 1 SOSTITUITO ✅');
} else process.exit(1);

// ============================================================================
// Blocco 2: norm() → normRut()
// ============================================================================
// Ricerca nel NUOVO content (dopo blocco1 cambiato)
const lines2 = content.split('\n');
let lineNormDecl = -1;
for (let i = 0; i < lines2.length; i++) {
  if (lines2[i].indexOf('const norm = (s: any) =>') >= 0 && lines2[i].indexOf('String(s') > 0) {
    lineNormDecl = i; break;
  }
}
console.log('[V7] Linea "const norm = ...":', lineNormDecl >= 0 ? lineNormDecl + 1 : 'NON TROVATA skip');
if (lineNormDecl >= 0) {
  const normMarker = lines2[lineNormDecl];
  const idxNorm = content.indexOf(normMarker);
  if (idxNorm >= 0) {
    content = content.substring(0, idxNorm) + '    // normRut già definito sopra' + content.substring(idxNorm + normMarker.length);
    content = content.split('lookup[norm(k)]').join('lookup[normRut(k)]');
    content = content.split('lookup[norm(r.source)]').join('lookup[normRut(r.source)]');
    content = content.split('lookup[norm(r.target)]').join('lookup[normRut(r.target)]');
    console.log('[V7] Blocco 2 sostituito ✅  norm()→normRut()');
  }
}

// ============================================================================
// Blocco 3: UNIFORMA AD ARRAY + banner output
// ============================================================================
const lines3 = content.split('\n');
let startUnif = -1, endUnif = -1;
for (let i = 0; i < lines3.length; i++) {
  if (startUnif < 0 && lines3[i].indexOf('UNIFORMA SEMPRE AD ARRAY') >= 0) startUnif = i;
  if (startUnif >= 0 && lines3[i].indexOf('return undefined;') >= 0 && i - startUnif < 15) { endUnif = i; break; }
}
console.log('[V7] Blocco 3 UNIFORM start/end lines:', startUnif >= 0 ? startUnif+1 : -1, '/', endUnif >= 0 ? endUnif+1 : -1);
if (startUnif >= 0 && endUnif > startUnif) {
  const startMarker = lines3[startUnif];
  const endMarker = lines3[endUnif];
  const idxS = content.indexOf(startMarker);
  const idxE = content.indexOf(endMarker, idxS) + endMarker.length;
  if (idxS >= 0 && idxE > idxS) {
    const NEW_BLK3 = `    // UNIFORMA SEMPRE AD ARRAY (formato atteso dai 3 componenti!)
    let finalArray: Array<any> | undefined = undefined;
    if (Array.isArray(filteredMesh)) finalArray = filteredMesh;
    else if (filteredMesh && typeof filteredMesh === 'object') {
      if (Array.isArray((filteredMesh as any).relationships)) finalArray = (filteredMesh as any).relationships;
      else finalArray = [];
    }
    try {
      const countByLabel: Record<string, number> = {};
      if (finalArray) for (const r of finalArray) { if (r && r.label) countByLabel[r.label] = (countByLabel[r.label] || 0) + 1; }
      const css = finalArray && finalArray.length ? 'color:#2ea44f;font-weight:bold' : 'color:#ff2d2d;font-weight:bold';
      console.log('%c  🔚 Output useMemo: ' + (Array.isArray(finalArray) ? ('Array(' + finalArray.length + ')') : String(finalArray)) +
                  (finalArray && finalArray.length ? ('  labels=' + JSON.stringify(countByLabel)) : '  ⚠️ VUOTO!'), css);
    } catch (e) {}
    return finalArray;`;
    content = content.substring(0, idxS) + NEW_BLK3 + content.substring(idxE);
    console.log('[V7] Blocco 3 sostituito ✅');
  }
}

// ============================================================================
// Blocco 4: Dep array + useEffect inject window.__debugFastCheck
// ============================================================================
const lines4 = content.split('\n');
let startDep = -1, endUserNotes = -1;
for (let i = 0; i < lines4.length; i++) {
  if (startDep < 0 && lines4[i] === '  }, [' && i > 100 && i < 500) {
    // Verifica che la prossima riga contenga cleanedData?.sheriffLogData
    if (lines4[i+1] && lines4[i+1].indexOf('cleanedData?.sheriffLogData?.filteredDetails?.dequinesRelationships') >= 0) {
      startDep = i;
    }
  }
  if (startDep >= 0 && lines4[i].indexOf('// User notes state') >= 0) { endUserNotes = i; break; }
}
console.log('[V7] Blocco 4 startDep/endUserNotes linee:', startDep >= 0 ? startDep+1 : -1, '/', endUserNotes >= 0 ? endUserNotes+1 : -1);

if (startDep >= 0 && endUserNotes > startDep) {
  const depStartStr = lines4[startDep] + '\n' + lines4[startDep + 1];
  const idxDepS = content.indexOf(depStartStr);
  const userNotesStr = lines4[endUserNotes];
  const idxDepE = content.indexOf(userNotesStr, idxDepS);
  if (idxDepS >= 0 && idxDepE > idxDepS) {
    const NEW_BLK4 = `}, [cleanedData]);

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
            } else { type = String(v); }
            return { path: m.path, depth: m.depth, type: type };
          });
        }
      };
      const cssBanner = 'background:#9900cc;color:#fff;padding:3px 7px;border-radius:3px;font-weight:bold';
      console.log('%c🔧 [DEBUG GLOBAL INJECTED]%c window.__debugFastCheck pronta! Prova: window.__debugFastCheck.findAll(/dequien/i)',
                  cssBanner, 'color:#6b778c');
    } catch (e) {}
  }, [cleanedData, data, dequinesForMesh]);

  // User notes state`;

    content = content.substring(0, idxDepS) + NEW_BLK4 + content.substring(idxDepE);
    console.log('[V7] Blocco 4 sostituito ✅');
  }
}

const backupP = filePath + '.bak.v7_MATCH_PER_LINE_OK';
fs.copyFileSync(filePath, backupP);
fs.writeFileSync(filePath, content, 'utf8');
console.log('\n✅ V7 TUTTO PASSATO! Backup:', path.basename(backupP));
console.log('✅ Ora esegui: npx tsc --noEmit src/pages/FastCheckEX.tsx per controllare errori sintassi!');
