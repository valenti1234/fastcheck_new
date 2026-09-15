const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/pages/FastCheckEX.tsx');
let content = fs.readFileSync(filePath, 'utf8');

console.log('[TMP_EDIT] File length:', content.length, 'chars');

// ==========================================================================
// STEP 1: Trova blocco 1 (const raw = ... if (!raw) return undefined;)
// Cerca le substring di inizio e fine
// ==========================================================================
const START1 = 'const raw =\n      cleanedData?.sheriffLogData?.filteredDetails?.dequinesRelationships';
const END1 = 'if (!raw) return undefined;';

const idxStart1 = content.indexOf(START1);
const idxStart1Alt = content.indexOf('const raw =');
const idxAfterFirstConstRaw = idxStart1Alt > 0 ? idxStart1Alt : idxStart1;

console.log('[TMP_EDIT] idx START1 (const raw):', idxAfterFirstConstRaw, '  trovato?:', idxAfterFirstConstRaw >= 0);

if (idxAfterFirstConstRaw < 0) {
  // Prova a cercare tra le linee 239-248 con substring raw letterale
  const lines = content.split('\n');
  for (let i = 235; i <= 255 && i < lines.length; i++) {
    console.log(`  L${i+1}: [${lines[i].length} chars] >>>${lines[i]}<<<`);
  }
  process.exit(1);
}

// Adesso trova il PROSSIMO END1 a partire da idxAfterFirstConstRaw
const tmpAfterStart = content.substring(idxAfterFirstConstRaw);
const idxEnd1_rel = tmpAfterStart.indexOf(END1) + END1.length;
const idxEnd1_abs = idxAfterFirstConstRaw + idxEnd1_rel;

const oldBlock1 = content.substring(idxAfterFirstConstRaw, idxEnd1_abs);
console.log(`[TMP_EDIT] Vecchio blocco 1 trovato (${oldBlock1.length} chars):`);
console.log(oldBlock1.substring(0, 300) + '...\n');

const newBlock1 = `const normRut = (s: any) => String(s ?? '').replace(/[^0-9Kk]/g, '').toLowerCase();
    const findAllByKeyPattern = (
      obj: any, keyPattern: RegExp, currentPath = 'cleanedData',
      visited = new WeakSet(), maxDepth = 14, depth = 0,
      results: Array<{ path: string; value: any; depth: number }> = []
    ) => {
      if (!obj || depth > maxDepth || typeof obj !== 'object') return results;
      try { if (visited.has(obj)) return results; visited.add(obj); } catch {}
      for (const key of Object.keys(obj)) {
        const val = (obj as any)[key];
        const fullPath = \`\${currentPath}.\${key}\`;
        if (keyPattern.test(key)) results.push({ path: fullPath, value: val, depth });
        if (val && typeof val === 'object') findAllByKeyPattern(val, keyPattern, fullPath, visited, maxDepth, depth + 1, results);
      }
      return results;
    };
    const scoreCandidate = (c: { value: any; depth: number }) => {
      const v = c.value;
      if (Array.isArray(v) && v.length > 0) return 1000 - c.depth;
      if (v && typeof v === 'object') {
        const rels = (v as any).relationships;
        if (Array.isArray(rels) && rels.length > 0) return 900 - c.depth;
        if (Array.isArray(rels) && rels.length === 0) return 100 - c.depth;
        return 50 - c.depth;
      }
      if (Array.isArray(v) && v.length === 0) return 10 - c.depth;
      if (v === undefined || v === null) return -1000;
      return 1 - c.depth;
    };
    const allMatches = findAllByKeyPattern(cleanedData, /^dequinesRelationships$/i);
    const allLooseMatches = findAllByKeyPattern(cleanedData, /dequien|relationship/i);
    const sortedCandidates = allMatches.slice().sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
    const topCandidate = sortedCandidates[0];
    const raw = topCandidate?.value;
    const hasRelsArr = raw && !Array.isArray(raw) && typeof raw === 'object' && Array.isArray((raw as any).relationships);
    const countRels = Array.isArray(raw) ? raw.length : hasRelsArr ? (raw as any).relationships.length : 0;
    const countNames = hasRelsArr && (raw as any).entityNames && typeof (raw as any).entityNames === 'object')
      ? Object.keys((raw as any).entityNames).length : 0;
    console.log(
      '%c🟢 [DEQUIES_FINDER v1.0 • 15.09.2026]%c\\n' +
      \`  Top-level cleanedData keys : \${Object.keys(cleanedData ?? {}).join(', ')}\\n\` +
      \`  Match strict found         : \${allMatches.length}\\n\` +
      \`  Match loose found          : \${allLooseMatches.length}\\n\` +
      \`  Scelta finale (top)        : \${topCandidate ? \`\${topCandidate.path}  depth=\${topCandidate.depth}  score=\${scoreCandidate(topCandidate)}\` : 'NESSUNO'}\\n\` +
      \`  Tipo valore scelto         : \${Array.isArray(raw) ? \`Array(\${raw.length})\` : raw && typeof raw === 'object' ? \`Object {relationships:\${countRels}, entityNames:\${countNames}}\` : String(raw)}\\n\` +
      \`  Total rels disponibili     : \${countRels}\`,
      'background:#0052cc;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold',
      'color:#999'
    );
    if (allMatches.length > 0) {
      console.log('  Tutti i match strict trovati:', allMatches.map(m => ({
        path: m.path, depth: m.depth, score: scoreCandidate(m),
        type: Array.isArray(m.value) ? \`Array(\${m.value.length})\` : (m.value && typeof m.value === 'object') ? 'Obj' : String(m.value)
      })));
    }
    if (!raw) {
      console.log('%c  ⚠️ RAW = UNDEFINED → usa window.__debugFastCheck.findAll(/dequien/i)',
        'color:#ff6b00;font-weight:bold');
      return undefined;
    }`;

content = content.substring(0, idxAfterFirstConstRaw) + newBlock1 + content.substring(idxEnd1_abs);
console.log('[TMP_EDIT] Blocco 1 sostituito ✅');

// ==========================================================================
// STEP 2: Rimpiazza "const norm = ..." interno a inject con commento + riferimenti norm() → normRut()
// ==========================================================================
const OLD_NORM_DECL = 'const norm = (s: any) => String(s ?? \'\').replace(/[^0-9Kk]/g, \'\').toLowerCase();';
const idxNorm = content.indexOf(OLD_NORM_DECL);
console.log('[TMP_EDIT] idx OLD_NORM_DECL (const norm):', idxNorm, idxNorm >= 0 ? '✅ TROVATO' : '⚠️ NON TROVATO');
if (idxNorm >= 0) {
  content = content.substring(0, idxNorm) +
    '// (normRut già definito sopra, usiamo quello)' +
    content.substring(idxNorm + OLD_NORM_DECL.length);
  // Ora sostituisci 3 riferimenti norm(k), norm(r.source), norm(r.target)
  content = content.split('lookup[norm(k)]').join('lookup[normRut(k)]');
  content = content.split('lookup[norm(r.source)]').join('lookup[normRut(r.source)]');
  content = content.split('lookup[norm(r.target)]').join('lookup[normRut(r.target)]');
  console.log('[TMP_EDIT] norm() → normRut() sostituiti ✅');
}

// ==========================================================================
// STEP 3: Sostituisco blocco UNIFORMA AD ARRAY + return
// ==========================================================================
const OLD_UNIF_START = '// UNIFORMA SEMPRE AD ARRAY (formato atteso dai 3 componenti!)';
const idxUniformStart = content.indexOf(OLD_UNIF_START);
console.log('[TMP_EDIT] idx OLD_UNIF_START:', idxUniformStart, idxUniformStart >= 0 ? '✅ TROVATO' : '❌ NON TROVATO');

// Cerca end: "return undefined;" che viene dopo la riga commento "Caso estremo"
let idxUniformEnd = -1;
if (idxUniformStart > 0) {
  const tail = content.substring(idxUniformStart);
  // Cerca il PRIMO "return undefined;" dopo OLD_UNIF_START che è vicino a blocco if/else uniform
  const idxRel = tail.indexOf('return undefined;');
  if (idxRel > 0 && idxRel < 1000) {
    idxUniformEnd = idxUniformStart + idxRel + 'return undefined;'.length;
  }
}
console.log('[TMP_EDIT] idxUniformEnd:', idxUniformEnd, idxUniformEnd > 0 ? '✅ OK' : '❌ NON TROVATO (skip)');

if (idxUniformStart > 0 && idxUniformEnd > 0) {
  const oldBlock3 = content.substring(idxUniformStart, idxUniformEnd);
  console.log(`[TMP_EDIT] Vecchio blocco uniform (${oldBlock3.length} chars) trovato; sostituisco...`);
  const newBlock3 = `// UNIFORMA SEMPRE AD ARRAY (formato atteso dai 3 componenti!)
    let finalArray: Array<any> | undefined = undefined;
    if (Array.isArray(filteredMesh)) finalArray = filteredMesh;
    else if (filteredMesh && typeof filteredMesh === 'object') {
      if (Array.isArray((filteredMesh as any).relationships)) finalArray = (filteredMesh as any).relationships;
      else finalArray = [];
    }
    const countByLabel: Record<string, number> = {};
    if (finalArray) for (const r of finalArray) if (r?.label) countByLabel[r.label] = (countByLabel[r.label] || 0) + 1;
    console.log(
      \`%c  🔚 Output useMemo : \${Array.isArray(finalArray) ? \`Array(\${finalArray.length})\` : String(finalArray)}\\n\` +
      (finalArray && finalArray.length ? \`     Per label → \${JSON.stringify(countByLabel)}\` : '     ⚠️ VUOTO!'),
      finalArray && finalArray.length ? 'color:#2ea44f;font-weight:bold' : 'color:#ff2d2d;font-weight:bold'
    );
    return finalArray;`;
  content = content.substring(0, idxUniformStart) + newBlock3 + content.substring(idxUniformEnd);
  console.log('[TMP_EDIT] Blocco 3 (uniform array) sostituito ✅');
}

// ==========================================================================
// STEP 4: Sostituisco dep array + aggiungo useEffect inject debug global
// ==========================================================================
// Vecchio formato:
// }, [
//   cleanedData?.sheriffLogData?.filteredDetails?.dequinesRelationships,
//   cleanedData?.details?.sheriffLogData?.filteredDetails?.dequinesRelationships,
//   cleanedData?.logEntry?.filteredDetails?.dequinesRelationships,
//   (cleanedData as any)?.filteredDetails?.dequinesRelationships,
//   cleanedData,
// ]);
const OLD_DEP_START = '}, [\n    cleanedData?.sheriffLogData?.filteredDetails?.dequinesRelationships,';
const idxDepStart = content.indexOf(OLD_DEP_START);
console.log('[TMP_EDIT] idx OLD_DEP_START:', idxDepStart, idxDepStart >= 0 ? '✅ TROVATO' : '❌ NON TROVATO');

let idxDepEnd = -1;
if (idxDepStart > 0) {
  const tail = content.substring(idxDepStart);
  const rel = tail.indexOf(']);');
  if (rel > 0 && rel < 500) {
    idxDepEnd = idxDepStart + rel + ']);'.length;
  }
}
console.log('[TMP_EDIT] idxDepEnd:', idxDepEnd, idxDepEnd > 0 ? '✅ OK' : '❌ SKIP');

if (idxDepStart > 0 && idxDepEnd > 0) {
  const newDep = `}, [cleanedData]);

  useEffect(() => {
    const findAllByKeyPattern = (
      obj: any, keyPattern: RegExp, currentPath = 'root',
      visited = new WeakSet(), maxDepth = 14, depth = 0,
      results: Array<{ path: string; value: any; depth: number }> = []
    ) => {
      if (!obj || depth > maxDepth || typeof obj !== 'object') return results;
      try { if (visited.has(obj)) return results; visited.add(obj); } catch {}
      for (const key of Object.keys(obj)) {
        const val = (obj as any)[key];
        const fullPath = \`\${currentPath}.\${key}\`;
        if (keyPattern.test(key)) results.push({ path: fullPath, value: val, depth });
        if (val && typeof val === 'object') findAllByKeyPattern(val, keyPattern, fullPath, visited, maxDepth, depth + 1, results);
      }
      return results;
    };
    (window as any).__debugFastCheck = {
      cleanedData,
      rawData: data,
      dequinesForMesh,
      normRut: (s: any) => String(s ?? '').replace(/[^0-9Kk]/g, '').toLowerCase(),
      findAll: (pattern: RegExp = /dequien|relationship/i) =>
        findAllByKeyPattern(cleanedData, pattern).map(m => ({
          path: m.path, depth: m.depth,
          type: Array.isArray(m.value) ? \`Array(\${m.value.length})\` : (m.value && typeof m.value === 'object') ?
            \`Obj{rels:\${Array.isArray((m.value as any).relationships)?(m.value as any).relationships.length:'?'},names:\${(m.value as any).entityNames?Object.keys((m.value as any).entityNames).length:'?'}}\` :
            String(m.value)
        })),
    };
    console.log(
      '%c🔧 [DEBUG GLOBAL INJECTED]%c window.__debugFastCheck pronta!\\n' +
      '   Comandi utili F12:\\n' +
      '     1) window.__debugFastCheck.findAll(/dequien/i)\\n' +
      '     2) window.__debugFastCheck.dequinesForMesh?.length\\n' +
      '     3) Object.keys(window.__debugFastCheck.cleanedData)',
      'background:#9900cc;color:#fff;padding:3px 6px;border-radius:3px;font-weight:bold',
      'color:#999'
    );
  }, [cleanedData, data, dequinesForMesh]);`;

  content = content.substring(0, idxDepStart) + newDep + content.substring(idxDepEnd);
  console.log('[TMP_EDIT] Blocco 4 (dep array + useEffect debug) sostituito ✅');
}

const backupPath = filePath + '.bak.v4_ricorsivo_ok';
fs.copyFileSync(filePath, backupPath);
fs.writeFileSync(filePath, content, 'utf8');
console.log('\n[TMP_EDIT] Backup:', path.basename(backupPath));
console.log('[TMP_EDIT] File aggiornato:', path.basename(filePath));
console.log('\n✅ Ora procedi con: npm run build');
