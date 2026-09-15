// tmp_edit_inject_robust_v11.cjs — replace inject globale L392-L403 con versione ROBUSTA v1.1
const fs = require('fs');
const path = require('path');
const file = path.resolve(process.cwd(), 'src/pages/FastCheckEX.tsx');
const bak = file + '.bak.preInjectRobustV11';
const lines = fs.readFileSync(file, 'utf8').split('\n');
fs.copyFileSync(file, bak);

// Step 1: Trova startIdx = riga con "(window as any).__debugFastCheck = { cleanedData"
const startIdx = lines.findIndex(l => l.includes('(window as any).__debugFastCheck = { cleanedData'));
if (startIdx < 0) { console.error('❌ startIdx non trovato!'); process.exit(1); }

// Step 2: Trova endIdx = prima riga DOPO startIdx che termina con ');' ed ha 'color:#8b949e' (ultimo argomento console.log banner!)
let endIdx = -1;
for (let i = startIdx + 1; i < Math.min(startIdx + 25, lines.length); i++) {
  const trimmed = lines[i].trim();
  if (trimmed === ');' && lines.slice(Math.max(0,i-2), i+1).some(l => l.includes('color:#8b949e'))) {
    endIdx = i;
    break;
  }
  if (trimmed.endsWith(');') && lines[i].includes("'color:#8b949e'")) {
    endIdx = i;
    break;
  }
}
if (endIdx < 0) {
  // Fallback: cerca la riga ');' subito dopo startIdx
  for (let i = startIdx + 1; i < startIdx + 30; i++) {
    if (lines[i].trim() === ');' && !lines[i].includes('warn') && !lines[i].includes('catch')) {
      endIdx = i; break;
    }
  }
}
if (endIdx < 0) { console.error('❌ endIdx non trovato! startIdx=', startIdx); console.log('Righe intorno:', lines.slice(startIdx, startIdx+20)); process.exit(1); }

console.log(`✅ Trovato range: startIdx=${startIdx} endIdx=${endIdx} (${endIdx-startIdx+1} righe)`);
console.log('Prima riga OLD:  ', JSON.stringify(lines[startIdx]));
console.log('Ultima riga OLD: ', JSON.stringify(lines[endIdx]));

// Step 3: Nuove righe (INJECT ROBUSTO v1.1) — identazione 6 spazi (2 livelli dentro useEffect + try)
const indent = '      ';
const replacementLines = [
  `${indent}// 🔧 FIX 15.09 INJECT ROBUSTO v1.1:`,
  `${indent}// Se useMemo non ha ancora calcolato dequinesForMesh (undefined) al momento di useEffect inject,`,
  `${indent}// LO CALCOLIAMO DIRETTAMENTE QUI da path sicuri (lo sappiamo da findAll: depth1 o depth2!)`,
  `${indent}// → Mai più 'Cannot read .relationships of undefined'!`,
  `${indent}let dequinesForMesh_INJECT = dequinesForMesh;`,
  `${indent}if (!dequinesForMesh_INJECT || !(dequinesForMesh_INJECT)?.relationships) {`,
  `${indent}  try {`,
  `${indent}    const tryPaths = [`,
  `${indent}      () => (cleanedData)?.details?.dequinesRelationships,`,
  `${indent}      () => (cleanedData)?.sheriffLogData?.filteredDetails?.dequinesRelationships,`,
  `${indent}      () => (data)?.details?.dequinesRelationships,`,
  `${indent}      () => (data)?.sheriffLogData?.filteredDetails?.dequinesRelationships,`,
  `${indent}    ];`,
  `${indent}    let rawFromPath = undefined;`,
  `${indent}    for (const fn of tryPaths) {`,
  `${indent}      try { const v = fn(); if (v && (Array.isArray(v?.relationships) || Array.isArray(v))) { rawFromPath = v; break; } } catch(e){}`,
  `${indent}    }`,
  `${indent}    if (rawFromPath) {`,
  `${indent}      const relsIn = Array.isArray(rawFromPath) ? rawFromPath : (rawFromPath.relationships || []);`,
  `${indent}      const namesIn = Array.isArray(rawFromPath) ? {} : (rawFromPath.entityNames || {});`,
  `${indent}      const lookup = {};`,
  `${indent}      if (namesIn && typeof namesIn === 'object') for (const [k,v] of Object.entries(namesIn)) lookup[normRut(k)] = String(v ?? '');`,
  `${indent}      const relsWithNames = relsIn.map((r) => {`,
  `${indent}        if (!r) return r;`,
  `${indent}        const sN = lookup[normRut(r.source)];`,
  `${indent}        const tN = lookup[normRut(r.target)];`,
  `${indent}        return { ...r, sourceName: r.sourceName || sN, targetName: r.targetName || tN, _sourceEntityName: sN || r._sourceEntityName, _targetEntityName: tN || r._targetEntityName };`,
  `${indent}      });`,
  `${indent}      try {`,
  `${indent}        const filt = filterOutNotaryRelationships({ relationships: relsWithNames, entityNames: namesIn });`,
  `${indent}        const relsOut = Array.isArray(filt) ? filt : (filt).relationships || [];`,
  `${indent}        const namesOut = Array.isArray(filt) ? namesIn : ((filt).entityNames || namesIn);`,
  `${indent}        dequinesForMesh_INJECT = { relationships: relsOut, entityNames: namesOut, _recalculatedInInjectRobust1_1: true };`,
  `${indent}      } catch(e2) {`,
  `${indent}        dequinesForMesh_INJECT = { relationships: relsWithNames, entityNames: namesIn, _recalculatedInInjectRobust1_1_NO_NOTARY_FILTER: true };`,
  `${indent}      }`,
  `${indent}    }`,
  `${indent}  } catch(e) { console.warn('[DEBUG GLOBAL] fallback calcolo dequinesForMesh fallito:', e); }`,
  `${indent}}`,
  `${indent}(window as any).__debugFastCheck = {`,
  `${indent}  cleanedData, rawData: data,`,
  `${indent}  dequinesForMesh: dequinesForMesh_INJECT,`,
  `${indent}  normRut, findAll,`,
  `${indent}  forceRecalc: () => {`,
  `${indent}    try { (window as any).__debugFastCheck.dequinesForMesh = dequinesForMesh_INJECT; console.log('✅ forceRecalc OK. rels=', dequinesForMesh_INJECT?.relationships?.length); }`,
  `${indent}    catch(e2){ console.error(e2); }`,
  `${indent}  },`,
  `${indent}};`,
  `${indent}console.log('%c🔧 [DEBUG GLOBAL INJECTED v1.1 • 15.09.2026 🔧ROBUSTO]%c window.__debugFastCheck disponibile in console F12. dequinesForMesh type=%s rels=%s names=%s\\n%c  Comandi utili:\\n    %cwindow.__debugFastCheck.dequinesForMesh.relationships%c → array relazioni (atteso 63 per 92604000-6)\\n    %cwindow.__debugFastCheck.findAll(/dequien/i)%c → tabella tutti i match a qualsiasi profondità',`,
  `${indent}  'background:#1f6feb;color:#fff;padding:3px 10px;border-radius:4px;font-weight:bold',`,
  `${indent}  'color:#1f6feb;font-weight:bold',`,
  `${indent}  typeof dequinesForMesh_INJECT,`,
  `${indent}  dequinesForMesh_INJECT?.relationships?.length ?? 0,`,
  `${indent}  Object.keys(dequinesForMesh_INJECT?.entityNames || {}).length,`,
  `${indent}  'color:#8b949e',`,
  `${indent}  'color:#f0883e;background:#161b22;padding:1px 5px;border-radius:3px',`,
  `${indent}  'color:#8b949e',`,
  `${indent}  'color:#f0883e;background:#161b22;padding:1px 5px;border-radius:3px',`,
  `${indent}  'color:#8b949e'`,
  `${indent});`,
];

// Step 4: Sostituisci in place
lines.splice(startIdx, endIdx - startIdx + 1, ...replacementLines);

// Step 5: Write
fs.writeFileSync(file, lines.join('\n'), 'utf8');

console.log(`✅ Replace OK! ${replacementLines.length} nuove righe. Prima vecchie: ${endIdx-startIdx+1}`);
console.log('Backup:', bak);
