const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/pages/FastCheckEX.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// ==========================================================================
// BLOCCO 1: sostituiamo "const raw = ... cleanedData?.sheriffLogData?.... if (!raw) return undefined;"
// con la versione con ricerca ricorsiva + banner debug
// ==========================================================================
const oldBlock1Regex = /const raw =\s*\n\s*cleanedData\?\.sheriffLogData\?\.filteredDetails\?\.dequinesRelationships \|\|\s*\n\s*cleanedData\?\.details\?\.sheriffLogData\?\.filteredDetails\?\.dequinesRelationships \|\|\s*\n\s*cleanedData\?\.logEntry\?\.filteredDetails\?\.dequinesRelationships \|\|\s*\n\s*\(cleanedData as any\)\?\.filteredDetails\?\.dequinesRelationships \|\|\s*\n\s*undefined;\s*\n\s*if \(!raw\) return undefined;/;

const matches1 = content.match(oldBlock1Regex);
console.log('[TMP_EDIT] Match blocco 1 (const raw + 4 path hardcodati):', matches1 ? '✅ TROVATO' : '❌ NON TROVATO');

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

if (matches1) {
  content = content.replace(oldBlock1Regex, newBlock1);
  console.log('[TMP_EDIT] Blocco 1 sostituito ✅');
} else {
  console.log('[TMP_EDIT] ❌ Impossibile sostituire blocco 1. Esco senza modifiche.');
  process.exit(1);
}

// ==========================================================================
// BLOCCO 2: Sostituisco il vecchio "const norm = (s: any) =>" nell'inject entityNames
//           perché adesso normRut è già definita sopra
//           E poi sostituisco finalArray uniform + banner output
// ==========================================================================
const oldInjectNorm = /const norm = \(s: any\) => String\(s \?\? ''\)\.replace\(\/\[\^0-9Kk\]\/g, ''\)\.toLowerCase\(\);/;
console.log('[TMP_EDIT] Match vecchio norm() dentro inject:', content.match(oldInjectNorm) ? '✅ TROVATO (da sostituire con normRut)' : '⚠️ NON TROVATO (skip)');
if (content.match(oldInjectNorm)) {
  content = content.replace(oldInjectNorm, '// (normRut già definito sopra)');
  // poi sostituisco i riferimenti norm(k) → normRut(k), norm(r.source) → normRut(r.source)
  content = content.replace(/\blookup\[norm\(k\)\]/g, 'lookup[normRut(k)]');
  content = content.replace(/\blookup\[norm\(r\.source\)\]/g, 'lookup[normRut(r.source)]');
  content = content.replace(/\blookup\[norm\(r\.target\)\]/g, 'lookup[normRut(r.target)]');
  console.log('[TMP_EDIT] Riferimenti norm() → normRut() sostituiti ✅');
}

// ==========================================================================
// BLOCCO 3: sostituisco il vecchio blocco "UNIFORMA SEMPRE AD ARRAY" (if Array.isArray(filteredMesh))
// con la versione che assegna a finalArray e stampa il banner output countByLabel
// ==========================================================================
const oldBlock3Regex = /\/\/ UNIFORMA SEMPRE AD ARRAY \(formato atteso dai 3 componenti!\)\s*\n\s*if \(Array\.isArray\(filteredMesh\)\) return filteredMesh;\s*\n\s*if \(filteredMesh && typeof filteredMesh === 'object'\) \{\s*\n\s*if \(Array\.isArray\(\(filteredMesh as any\)\.relationships\)\) return \(filteredMesh as any\)\.relationships;\s*\n\s*\/\/ Caso estremo: oggetto senza relationships\. Fallback array vuoto\.\s*\n\s*return \[\];\s*\n\s*\}\s*\n\s*return undefined;/;
console.log('[TMP_EDIT] Match blocco 3 (UNIFORMA AD ARRAY return):', content.match(oldBlock3Regex) ? '✅ TROVATO' : '❌ NON TROVATO');

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

if (content.match(oldBlock3Regex)) {
  content = content.replace(oldBlock3Regex, newBlock3);
  console.log('[TMP_EDIT] Blocco 3 (uniform array return) sostituito ✅');
}

// ==========================================================================
// BLOCCO 4: Sostituisco il vecchio dependency array useMemo (con 4 path hardcodati)
//           con solo cleanedData
// ==========================================================================
const oldDepRegex = /\}, \[\s*\n\s*cleanedData\?\.sheriffLogData\?\.filteredDetails\?\.dequinesRelationships,\s*\n\s*cleanedData\?\.details\?\.sheriffLogData\?\.filteredDetails\?\.dequinesRelationships,\s*\n\s*cleanedData\?\.logEntry\?\.filteredDetails\?\.dequinesRelationships,\s*\n\s*\(cleanedData as any\)\?\.filteredDetails\?\.dequinesRelationships,\s*\n\s*cleanedData,\s*\n\s*\]\);/;
console.log('[TMP_EDIT] Match blocco 4 (dep array 4 path):', content.match(oldDepRegex) ? '✅ TROVATO' : '❌ NON TROVATO');

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

if (content.match(oldDepRegex)) {
  content = content.replace(oldDepRegex, newDep);
  console.log('[TMP_EDIT] Blocco 4 (dep array + inject debug global) sostituito ✅');
}

// Backupe vecchio file e scrivi nuovo
const backupPath = filePath + '.bak.v3_ricorsivo_dequines_finder';
fs.copyFileSync(filePath, backupPath);
fs.writeFileSync(filePath, content, 'utf8');
console.log('[TMP_EDIT] Backup salvato in:', path.basename(backupPath));
console.log('[TMP_EDIT] File aggiornato con successo:', path.basename(filePath));
console.log('\nℹ️  ORA esegui: npm run build (poi chiedi refresh utente)');
