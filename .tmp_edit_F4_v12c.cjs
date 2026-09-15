
const fs = require('fs');
const p = 'src/pages/FastCheckEX.tsx';
let lines = fs.readFileSync(p, 'utf8').split('\n');

// Helper globale
const findIdx = (matchFn, from=0) => {
  for (let i=from; i<lines.length; i++) { if (matchFn(lines[i])) return i; }
  return -1;
};
const show = (idx) => `L${idx+1} (idx${idx})=${JSON.stringify(lines[idx])}`;

// Step1: trova riga `if (dequienesForMesh?.relationships?.length > 0 && ...entityNames)`
let s = findIdx(l => l.includes('dequienesForMesh?.relationships?.length > 0') && l.includes('entityNames) {'));
if (s<0) { console.error('❌ Step1: if FONTE4 non trovato'); process.exit(1); }
console.log('✅ Step1 if FONTE4:', show(s));
// repsOnly dovrebbe essere la prossima riga:
const repsOnlyStart = s+1;
if (!lines[repsOnlyStart].includes("const repsOnly = dequinesForMesh.relationships.filter")) {
  console.error('❌ repsOnly NON alla riga successiva!', show(repsOnlyStart));
  // cerca repsOnly a mano
  const repsIdx = findIdx(l => l.includes('const repsOnly = ') && l.includes('.relationships.filter'), s);
  if (repsIdx<0) process.exit(2);
  console.log('  trovato a ', show(repsIdx));
}
const repsFilter1 = repsOnlyStart; // prima riga repsOnly filter (const repsOnly = ...)
const repsFilterCloseParen = repsFilter1 + 2; // terza riga `        );`
console.log('  repsOnly start:', show(repsFilter1), 'close paren:', show(repsFilterCloseParen));
if (!lines[repsFilterCloseParen].includes(');')) { console.error('❌ repsFilterCloseParen non ha );'); process.exit(3); }

// ---- Step1 MOD: splice out vecchie 4 righe repsOnly filter(), sostituisci con repsAll + split + counts
lines.splice(repsFilter1, repsFilterCloseParen - repsFilter1 + 1,
  "        const repsAll = dequinesForMesh.relationships.filter((r: any) => r?.label === 'REPRESENTED_BY');",
  "        debugF4Counts.repsTotali = repsAll.length;",
  "        const repsOnly = repsAll.filter((r: any) => !r?.information_source?.match_type);",
  "        debugF4Counts.repsNoMatchType = repsOnly.length;"
);
console.log('✅ Step1 MOD: repsAll sostituito OK. Prossima riga (dovrebbe essere namesDict):', show(repsFilter1));

// Step2: trova namesDict + mainNormLocal, inserisci dopo counts srcEqMain + tgtEqMain
const n2 = findIdx(l => l.includes('const namesDict = dequinesForMesh.entityNames;'));
if (n2<0) { console.error('❌ Step2 namesDict'); process.exit(4); }
console.log('✅ Step2 namesDict:', show(n2));
const mn = n2+1; // mainNorm
if (!lines[mn].includes('mainNormLocal')) { console.error('❌ mainNorm riga dopo'); process.exit(40);}
console.log('✅ mainNorm:', show(mn));
lines.splice(mn + 1, 0,
  "        debugF4Counts.srcEqMain = repsOnly.filter((r:any)=> normRut(String(r.source||''))===mainNormLocal).length;",
  "        debugF4Counts.tgtEqMain = repsOnly.filter((r:any)=> normRut(String(r.target||''))===mainNormLocal).length;"
);
console.log('✅ Step2 counts src/tgtEqMain inseriti');

// Step3: else continue; (relazione non collegata)
const s3 = findIdx(l => l.includes('else continue;') && l.includes('relazione non collegata'));
if (s3<0) { console.error('❌ Step3 else continue non trovato'); process.exit(5); }
lines[s3] = lines[s3].replace('else continue;', 'else { debugF4Counts.saltatiNoRutMatch += 1; continue; }');
console.log('✅ Step3 saltatiNoRutMatch:', show(s3));

// Step4: isNotaryEntry if block → aggiungi riga debug dopo
const s4 = findIdx(l => l.includes('if (isNotaryEntry({ nombre: socioName, rut: socioRutOrig }))'));
if (s4<0) { console.error('❌ Step4: isNotaryEntry if non trovato'); process.exit(6); }
// la riga dopo è: skippedDequinesNotary.push(socioName || socioRutOrig); - inserisco PRIMA? o DOPO? DOPO (push mantengo)
const pushIdx = s4 + 1;
lines.splice(pushIdx, 0, '            debugF4Counts.saltatiNotary += 1;');
console.log('✅ Step4 saltatiNotary pushIdx:', show(pushIdx));

// Step5: if (!socioName) continue;
const s5 = findIdx(l => l.includes('if (!socioName) continue;') && l.includes('senza nome'));
if (s5<0) { console.error('❌ Step5: socioName continue non trovato'); process.exit(7); }
lines[s5] = lines[s5].replace('if (!socioName) continue;', 'if (!socioName) { debugF4Counts.saltatiNoName += 1; continue; }');
console.log('✅ Step5 saltatiNoName:', show(s5));

// Step6: if (seenKeys.has(key)) continue;
const s6 = findIdx(l => l.trim() === 'if (seenKeys.has(key)) continue;');
if (s6<0) { console.error('❌ Step6: seenKeys continue non trovato'); process.exit(8); }
lines[s6] = lines[s6].replace('if (seenKeys.has(key)) continue;', 'if (seenKeys.has(key)) { debugF4Counts.deduped += 1; continue; }');
console.log('✅ Step6 deduped:', show(s6));

// Step7: Sostituisci blocco `if (addedFromDequinesRep > 0 || skippedDequinesNotary.length > 0)` → SEMPRE logger
const s7 = findIdx(l => l.includes('if (addedFromDequinesRep > 0 || skippedDequinesNotary.length > 0) {'));
if (s7<0) { console.error('❌ Step7: if finale non trovato'); process.exit(9); }
// Trova la chiusura dello scope
let depth = 0, i7 = s7;
for (; i7<lines.length; i7++) {
  if (lines[i7].includes('{')) depth++;
  if (lines[i7].includes('}')) {
    depth--;
    if (depth === 0) break;
  }
}
console.log(`✅ Step7: blocco if finale L${s7+1}-L${i7+1}. Sostituisco con SEMPRE logger banner`);
const replacement = [
  "      // 🔧 Banner SEMPRE visibile (anche 0) → debugging immediato",
  "      {",
  "        const msgStats = `stats=${JSON.stringify(debugF4Counts)} · mainRut_norm=${normRut(companyData?.rut)} · namesDict_keys=${Object.keys((dequienesForMesh as any)?.entityNames || {}).length}`;",
  "        if (addedFromDequinesRep > 0 || skippedDequinesNotary.length > 0) {",
  "          logger.log(",
  "            `🟢 [PEP Socios Filter FONTE4 v1.2] Aggiunti ${addedFromDequinesRep} socios. Scartati notarili=${skippedDequinesNotary.length} · ${msgStats}`",
  "          );",
  "        } else {",
  "          logger.warn(",
  "            `⚠️ [PEP Socios Filter FONTE4 v1.2] AGGIUNTI 0 (controlla counts). ${msgStats} · nomi_notary_scartati=${JSON.stringify(skippedDequinesNotary)}`",
  "          );",
  "        }",
  "      }"
];
lines.splice(s7, i7 - s7 + 1, ...replacement);
console.log('✅ Step7 OK. Nuove righe L' + (s7+1) + '-L' + (s7 + replacement.length));

fs.writeFileSync(p, lines.join('\n'));
console.log('✅✅✅ FONTE4 v1.2 APPLICATO!');
