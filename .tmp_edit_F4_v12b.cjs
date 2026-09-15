
// Edit safe in-place Fonte4 v1.2 — linee individuali (così non ho mega regex escaping)
const fs = require('fs');
const p = 'src/pages/FastCheckEX.tsx';
let lines = fs.readFileSync(p, 'utf8').split('\n');

function findLine(idx0, predicate, stopAfter=60) {
  for (let i = idx0; i < Math.min(idx0+stopAfter, lines.length); i++) {
    if (predicate(lines[i])) return i;
  }
  return -1;
}

// --- Step1: trova inizio blocco FONTE4: linee 1762-1767 (circa): if(...) { ... repsOnly = ...filter(...) ---
let i = 1760;
i = findLine(1760, l => l.includes(`if (dequienesForMesh?.relationships?.length > 0 && dequienesForMesh?.entityNames)`));
if (i < 0) { console.error('❌ NON trovata linea if FONTE4'); process.exit(1); }
const ifLineIdx = i;
console.log('✅ [if FONTE4] line', ifLineIdx+1, lines[ifLineIdx]);

// Linea dopo if: `const repsOnly = ...filter((r: any) => r?.label === 'REPRESENTED_BY' && ...match_type`
const repsOnlyLineIdx = ifLineIdx + 1;
if (!lines[repsOnlyLineIdx].includes('const repsOnly = dequinesForMesh.relationships.filter')) {
  console.error('❌ repsOnly non trovato. Linea ' + (repsOnlyLineIdx+1) + ' =', lines[repsOnlyLineIdx]);
  process.exit(2);
}
const repsOnlyCloseParenLine = repsOnlyLineIdx + 3; // index 2: `        );`
console.log('✅ repsOnly line ' + (repsOnlyLineIdx+1) + ' close ' + (repsOnlyCloseParenLine+1));

// Inserisci PRIMA di repsOnly: repsAll + counts (2 righe)
// Elimina anche il vecchio filtro inline in repsOnly filter
lines.splice(repsOnlyLineIdx, repsOnlyCloseParenLine - repsOnlyLineIdx + 1,
  `        const repsAll = dequinesForMesh.relationships.filter((r: any) => r?.label === 'REPRESENTED_BY');`,
  `        debugF4Counts.repsTotali = repsAll.length;`,
  `        const repsOnly = repsAll.filter((r: any) => !r?.information_source?.match_type);`,
  `        debugF4Counts.repsNoMatchType = repsOnly.length;`,
);
console.log('✅ Step1: repsAll splice. Linea repsOnly OK');

// --- Step2: dopo namesDict + mainNormLocal → aggiungi srcEqMain e tgtEqMain ---
const namesDictIdx = lines.findIndex(l => l === '        const namesDict = dequinesForMesh.entityNames;');
const mainNormIdx = namesDictIdx >= 0 ? namesDictIdx + 1 : -1;
if (mainNormIdx < 0 || !lines[mainNormIdx].includes('mainNormLocal = normRut')) {
  console.error('❌ mainNormIdx non trovato. namesDictIdx=', namesDictIdx);
  process.exit(3);
}
lines.splice(mainNormIdx+1, 0,
  `        debugF4Counts.srcEqMain = repsOnly.filter((r:any)=> normRut(String(r.source||''))===mainNormLocal).length;`,
  `        debugF4Counts.tgtEqMain = repsOnly.filter((r:any)=> normRut(String(r.target||''))===mainNormLocal).length;`,
);
console.log('✅ Step2: counts srcEqMain/tgtEqMain inseriti dopo mainNormLocal line', mainNormIdx+1);

// --- Step3: dentro loop: else continue; → { debugF4Counts.saltatiNoRutMatch +=1; continue; }
let idx3 = findLine(mainNormIdx+2, l => l.includes('else continue; // relazione non collegata al RUT principale'));
if (idx3<0) { console.error('❌ Step3 non trovato: else continue'); process.exit(4); }
lines[idx3] = lines[idx3].replace('else continue;', 'else { debugF4Counts.saltatiNoRutMatch += 1; continue; }');
console.log('✅ Step3: saltatiNoRutMatch line', idx3+1);

// --- Step4: isNotaryEntry if block ---
let idx4 = findLine(idx3, l => l.includes('if (isNotaryEntry({ nombre: socioName, rut: socioRutOrig }))'));
if (idx4<0) { console.error('❌ Step4: isNotaryEntry non trovato'); process.exit(5); }
lines.splice(idx4+1, 0, `            debugF4Counts.saltatiNotary += 1;`);
console.log('✅ Step4: saltatiNotary line', idx4+2);

// --- Step5: if (!socioName) continue; ---
let idx5 = findLine(idx4, l => l.includes('if (!socioName) continue; // senza nome'));
if (idx5<0) { console.error('❌ Step5: socioName continue non trovato'); process.exit(6); }
lines[idx5] = lines[idx5].replace('if (!socioName) continue;', 'if (!socioName) { debugF4Counts.saltatiNoName += 1; continue; }');
console.log('✅ Step5: saltatiNoName line', idx5+1);

// --- Step6: if (seenKeys.has(key)) continue; ---
let idx6 = findLine(idx5, l => l.trim() === 'if (seenKeys.has(key)) continue;');
if (idx6<0) { console.error('❌ Step6: seenKeys continue non trovato'); process.exit(7); }
lines[idx6] = lines[idx6].replace('if (seenKeys.has(key)) continue;', 'if (seenKeys.has(key)) { debugF4Counts.deduped += 1; continue; }');
console.log('✅ Step6: deduped line', idx6+1);

// --- Step7: Sostituisci il blocco finale `if (addedFromDequinesRep > 0 || skipped...` con nuovo banner SEMPRE
let idx7 = findLine(idx6, l => l.trim().startsWith('if (addedFromDequinesRep > 0 || skippedDequinesNotary.length > 0) {'));
if (idx7<0) { console.error('❌ Step7: if (addedFrom) non trovato'); process.exit(8); }
// il blocco è lungo 6 righe: if(..) { logger.log(...` + 3 }); conta } finale
let idx7End = idx7 + 1;
let depth = 1;
while (depth > 0 && idx7End < lines.length) {
  if (lines[idx7End].includes('{')) depth++;
  if (lines[idx7End].includes('}')) depth--;
  if (depth === 0) break;
  idx7End++;
}
const r7 = [];
r7.push('      // 🔧 Banner SEMPRE visibile (anche 0) → debugging immediato');
r7.push('      {');
r7.push('        const msgStats = `stats=${JSON.stringify(debugF4Counts)} · mainRut_norm=${normRut(companyData?.rut)} · namesDict_keys=${Object.keys((dequienesForMesh as any)?.entityNames || {}).length}`;');
r7.push('        if (addedFromDequinesRep > 0 || skippedDequinesNotary.length > 0) {');
r7.push('          logger.log(');
r7.push('            `🟢 [PEP Socios Filter FONTE4 v1.2] Aggiunti ${addedFromDequinesRep} socios. Scartati notarili=${skippedDequinesNotary.length} · ${msgStats}`');
r7.push('          );');
r7.push('        } else {');
r7.push('          logger.warn(');
r7.push('            `⚠️ [PEP Socios Filter FONTE4 v1.2] AGGIUNTI 0 (controlla counts). ${msgStats} · nomi_notary_scartati=${JSON.stringify(skippedDequinesNotary)}`');
r7.push('          );');
r7.push('        }');
r7.push('      }');
lines.splice(idx7, idx7End - idx7 + 1, ...r7);
console.log('✅ Step7: nuovo banner debug FONTE4 sostituito. Linee ' + (idx7+1) + ' → ' + (idx7 + r7.length));

fs.writeFileSync(p, lines.join('\n'));
console.log('\n✅ ✅ ✅ FONTE4 v1.2 applicato!');
