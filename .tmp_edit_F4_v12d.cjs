
const fs = require('fs');
const p = 'src/pages/FastCheckEX.tsx';
console.log('=== PRIMA DI TUTTO restore bak + CHECK namesDict ===');
const bakContent = fs.readFileSync('.bak.FastCheckEX.preF4edit','utf8');
fs.writeFileSync(p, bakContent);
// Check
let lines = fs.readFileSync(p,'utf8').split('\n');
const namesDictLine = lines.findIndex(l => l.includes('const namesDict = dequinesForMesh.entityNames;'));
console.log('namesDictIndex (0-based):', namesDictLine, '- 1-based:', namesDictLine >= 0 ? namesDictLine+1 : 'NONE');
console.log('Contenuto namesDict line:', JSON.stringify(lines[namesDictLine]));
if (namesDictLine<0) process.exit(100);

// Helper
const findIdx = (matchFn, from=0) => {
  for (let i=from; i<lines.length; i++) { if (matchFn(lines[i])) return i; }
  return -1;
};
const show = (idx) => `L${idx+1} (idx${idx})=${JSON.stringify(lines[idx])}`;

// --- Step1.1: repsOnly ---
let s = findIdx(l => l.includes('dequienesForMesh?.relationships?.length > 0') && l.includes('entityNames) {'));
if (s<0) { console.error('❌ Step1 if FONTE4'); process.exit(1); }
console.log('✅ if FONTE4:', show(s));
const repsFilter1 = s+1;
// repsFilter1 è la riga repsOnly? Se NON, cerca
let repsFilterStart = repsFilter1;
if (!lines[repsFilterStart].includes('const repsOnly = dequinesForMesh.relationships.filter')) {
  const findex = findIdx(l => l.includes('const repsOnly =') && l.includes('.relationships.filter'), s);
  console.log('  repsOnly NON a s+1. Trovato a', findex>=0? show(findex) : 'NONE');
  if (findex<0) process.exit(2);
  repsFilterStart = findex;
}
const repsFilterClose = repsFilterStart + 2; // +3 righe (linea 0 = const...filter(, 1=callback, 2= );)
console.log('  repsOnly:', show(repsFilterStart), 'close:', show(repsFilterClose));
// Sostituisco 3 righe vecchie (repsFilterClose - repsFilterStart + 1 = 3) con 4 righe nuove
const toAdd1 = [
  "        const repsAll = dequinesForMesh.relationships.filter((r: any) => r?.label === 'REPRESENTED_BY');",
  "        debugF4Counts.repsTotali = repsAll.length;",
  "        const repsOnly = repsAll.filter((r: any) => !r?.information_source?.match_type);",
  "        debugF4Counts.repsNoMatchType = repsOnly.length;"
];
lines.splice(repsFilterStart, repsFilterClose - repsFilterStart + 1, ...toAdd1);
console.log('✅ Step1.1 repsAll/repsOnly OK');

// --- Step1.2: namesDict aggiungi 2 counts (dopo mainNormLocal) ---
let n2 = findIdx(l => l.includes('const namesDict = dequinesForMesh.entityNames;'));
if (n2<0) { console.error('❌ namesDict dopo splice non trovato! lines vicine:');
  for (let i=repsFilterStart-1;i<repsFilterStart+8;i++) console.log(' idx',i, JSON.stringify(lines[i]));
  process.exit(4);
}
const mn = n2+1;
console.log('✅ Step1.2 namesDict:', show(n2), 'mainNorm:', show(mn));
if (!lines[mn].includes('mainNormLocal')) { console.error('❌ mainNorm dopo namesDict'); process.exit(40);}
lines.splice(mn + 1, 0,
  "        debugF4Counts.srcEqMain = repsOnly.filter((r:any)=> normRut(String(r.source||''))===mainNormLocal).length;",
  "        debugF4Counts.tgtEqMain = repsOnly.filter((r:any)=> normRut(String(r.target||''))===mainNormLocal).length;"
);
console.log('✅ Step1.2 counts src/tgt EqMain inseriti');

// Step3: else continue; relazione non collegata → fix
const s3 = findIdx(l => l.includes('else continue;') && l.includes('relazione non collegata'));
if (s3<0) { console.error('❌ else continue non trovato'); process.exit(5);}
lines[s3] = lines[s3].replace('else continue;', 'else { debugF4Counts.saltatiNoRutMatch += 1; continue; }');
console.log('✅ Step3 saltatiNoRutMatch:', show(s3));

// Step4: isNotaryEntry if block aggiungi riga dopo
const s4 = findIdx(l => l.includes('if (isNotaryEntry({ nombre: socioName, rut: socioRutOrig }))'));
if (s4<0) { console.error('❌ isNotaryEntry non trovato'); process.exit(6); }
lines.splice(s4 + 1, 0, '            debugF4Counts.saltatiNotary += 1;');
console.log('✅ Step4 saltatiNotary inserito dopo', show(s4));

// Step5: if (!socioName) continue → fix
const s5 = findIdx(l => l.includes('if (!socioName) continue;') && l.includes('senza nome'));
if (s5<0) { console.error('❌ socioName continue non trovato'); process.exit(7);}
lines[s5] = lines[s5].replace('if (!socioName) continue;', 'if (!socioName) { debugF4Counts.saltatiNoName += 1; continue; }');
console.log('✅ Step5 saltatiNoName:', show(s5));

// Step6: seenKeys.has → fix
const s6 = findIdx(l => l.trim() === 'if (seenKeys.has(key)) continue;');
if (s6<0) { console.error('❌ seenKeys continue non trovato'); process.exit(8);}
lines[s6] = lines[s6].replace('if (seenKeys.has(key)) continue;', 'if (seenKeys.has(key)) { debugF4Counts.deduped += 1; continue; }');
console.log('✅ Step6 deduped:', show(s6));

// Step7: Sostituisci if (addedFromDequinesRep > 0 || skipped...)
let s7 = findIdx(l => l.includes('if (addedFromDequinesRep > 0 || skippedDequinesNotary.length > 0) {'));
if (s7<0) { console.error('❌ if finale addedFrom non trovato'); process.exit(9);}
let d = 0, i7 = s7;
for (; i7<lines.length; i7++) {
  if (lines[i7].includes('{')) d++;
  if (lines[i7].includes('}')) { d--; if (d===0) break; }
}
console.log(`✅ Step7: blocco finale L${s7+1}-L${i7+1} sostituito con banner sempre visibile`);
const replBanner = [
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
lines.splice(s7, i7 - s7 + 1, ...replBanner);
console.log('✅ Step7 banner inserito, linee finali: ' + lines.slice(s7, s7+replBanner.length).length);

fs.writeFileSync(p, lines.join('\n'));
console.log('✅✅✅ TUTTE LE MODIFICHE FONTE4 v1.2 APPLICATE!');
