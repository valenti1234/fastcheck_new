
const fs = require('fs');
const BAK = '.bak.FastCheckEX.preF4edit';
const p   = 'src/pages/FastCheckEX.tsx';
// 1) Ripristina PULITO
fs.copyFileSync(BAK, p);
let c = fs.readFileSync(p, 'utf8');
const bakLines = c.split('\n'); // = bak ripristinato, linee corrette!

// ================ MOD1 ================
const idxsIfLine = bakLines.findIndex(l => l.includes('dequienesForMesh?.relationships?.length > 0') && l.includes('entityNames) {'));
console.log('MOD1 if FONTE4 idx=', idxsIfLine, 'L', idxsIfLine+1, bakLines[idxsIfLine]);
// OLD1: 6 righe consecutive: L(idx..idx+5) → [idx..idx+6)
const OLD1 = bakLines.slice(idxsIfLine, idxsIfLine + 6).join('\n');
const NEW1_lines = [
  bakLines[idxsIfLine], // mantieni "if (...)"
  "        const repsAll = dequinesForMesh.relationships.filter((r: any) => r?.label === 'REPRESENTED_BY');",
  "        debugF4Counts.repsTotali = repsAll.length;",
  "        const repsOnly = repsAll.filter((r: any) => !r?.information_source?.match_type);",
  "        debugF4Counts.repsNoMatchType = repsOnly.length;",
  bakLines[idxsIfLine+4], // "const namesDict = dequinesForMesh.entityNames;"
  bakLines[idxsIfLine+5], // "const mainNormLocal = normRut(companyData?.rut);"
  "        debugF4Counts.srcEqMain = repsOnly.filter((r:any)=> normRut(String(r.source||''))===mainNormLocal).length;",
  "        debugF4Counts.tgtEqMain = repsOnly.filter((r:any)=> normRut(String(r.target||''))===mainNormLocal).length;"
];
const NEW1 = NEW1_lines.join('\n');
if (!c.includes(OLD1)) { console.error('❌ OLD1 FAIL (trovato da bakLines slice?)'); process.exit(1);}
c = c.replace(OLD1, NEW1);
console.log('✅ MOD1 OK (repsAll + split + src/tgt counts, da idx bakLines safe)');

// ================ MOD2 ================
const idx2 = bakLines.findIndex(l => l.includes('else continue;') && l.includes('relazione non collegata'));
const OLD2 = bakLines[idx2];
const NEW2 = OLD2.replace('else continue;', 'else { debugF4Counts.saltatiNoRutMatch += 1; continue; }');
if (!c.includes(OLD2)) process.exit(2);
c = c.replace(OLD2, NEW2);
console.log('✅ MOD2 saltatiNoRutMatch L'+(idx2+1));

// ================ MOD3 ================
const idx3a = bakLines.findIndex(l => l.includes('if (isNotaryEntry({ nombre: socioName, rut: socioRutOrig }))'));
// OLD3: riga if + riga push + riga continue + riga } (4 linee consecutive)
const OLD3 = bakLines.slice(idx3a, idx3a + 4).join('\n');
const NEW3_lines = bakLines.slice(idx3a, idx3a + 4);
NEW3_lines.splice(1, 0, '            debugF4Counts.saltatiNotary += 1;'); // inserisci dopo if, prima push
const NEW3 = NEW3_lines.join('\n');
if (!c.includes(OLD3)) process.exit(3);
c = c.replace(OLD3, NEW3);
console.log('✅ MOD3 saltatiNotary L'+(idx3a+1));

// ================ MOD4 ================
const idx4 = bakLines.findIndex(l => l.includes('if (!socioName) continue;') && l.includes('senza nome'));
const OLD4 = bakLines[idx4];
const NEW4 = OLD4.replace('if (!socioName) continue;', 'if (!socioName) { debugF4Counts.saltatiNoName += 1; continue; }');
if (!c.includes(OLD4)) process.exit(4);
c = c.replace(OLD4, NEW4);
console.log('✅ MOD4 saltatiNoName L'+(idx4+1));

// ================ MOD5 ================
const idx5 = bakLines.findIndex(l => l.trim() === 'if (seenKeys.has(key)) continue;');
const OLD5 = bakLines[idx5];
const NEW5 = OLD5.replace('if (seenKeys.has(key)) continue;', 'if (seenKeys.has(key)) { debugF4Counts.deduped += 1; continue; }');
if (!c.includes(OLD5)) process.exit(5);
c = c.replace(OLD5, NEW5);
console.log('✅ MOD5 deduped L'+(idx5+1));

// ================ MOD6: blocco if addedFrom finale → banner SEMPRE ================
const idx6 = bakLines.findIndex(l => l.includes('if (addedFromDequinesRep > 0 || skippedDequinesNotary.length > 0) {'));
// OLD6: dalla idx6 fino a chiusura (3 linee, logger.log fra { ... })
const OLD6_lines = [];
let d=0, i6=idx6;
for (; i6<bakLines.length; i6++) {
  OLD6_lines.push(bakLines[i6]);
  if (bakLines[i6].includes('{')) d++;
  if (bakLines[i6].includes('}')) { d--; if (d===0) break; }
}
const OLD6 = OLD6_lines.join('\n');
console.log('MOD6 OLD6 linee L'+(idx6+1)+'-L'+(i6+1)+' (count:', OLD6_lines.length+')');
const NEW6_lines = [
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
const NEW6 = NEW6_lines.join('\n');
if (!c.includes(OLD6)) { console.error('❌ OLD6 FAIL match'); process.exit(6); }
c = c.replace(OLD6, NEW6);
console.log('✅ MOD6 OK (banner SEMPRE)');

// Write finale
fs.writeFileSync(p, c);
console.log('\n✅✅✅ TUTTE LE 6 MOD FONTE4 v1.2 APPLICATE!');
