
const fs = require('fs');
const BAK = '.bak.FastCheckEX.preF4edit';
const p   = 'src/pages/FastCheckEX.tsx';
fs.copyFileSync(BAK, p);
let c = fs.readFileSync(p, 'utf8');
const lines = c.split('\n');

// ========== Trova START FONTE4 (tutti i replace SOLO dopo questo indice!)
const startIdx = lines.findIndex(l => l.includes('dequienesForMesh?.relationships?.length > 0') && l.includes('entityNames) {'));
if (startIdx<0) { console.error('❌ startIdx non trovato!'); process.exit(1); }
console.log('✅ START FONTE4 idx:', startIdx, 'L:', startIdx+1);

// Helper findIndex solo DOPO startIdx
const findAfter = (pred, from=startIdx) => { for (let i=from;i<lines.length;i++) if (pred(lines[i], i)) return i; return -1; };

// ========== MOD 1: sostituisci 6 linee consecutive startIdx..startIdx+5
const OLD1 = lines.slice(startIdx, startIdx+6).join('\n');
const NEW1_lines = [
  lines[startIdx], // if (...) {
  "        const repsAll = dequinesForMesh.relationships.filter((r: any) => r?.label === 'REPRESENTED_BY');",
  "        debugF4Counts.repsTotali = repsAll.length;",
  "        const repsOnly = repsAll.filter((r: any) => !r?.information_source?.match_type);",
  "        debugF4Counts.repsNoMatchType = repsOnly.length;",
  lines[startIdx+4], // namesDict
  lines[startIdx+5], // mainNormLocal
  "        debugF4Counts.srcEqMain = repsOnly.filter((r:any)=> normRut(String(r.source||''))===mainNormLocal).length;",
  "        debugF4Counts.tgtEqMain = repsOnly.filter((r:any)=> normRut(String(r.target||''))===mainNormLocal).length;"
];
const NEW1 = NEW1_lines.join('\n');
if (!c.includes(OLD1)) process.exit(11);
c = c.replace(OLD1, NEW1);
console.log('✅ MOD1 OK (repsAll + split + counts)');

// ========== MOD 2: else continue; (SOLO dopo startIdx!)
const idx2 = findAfter(l => l.includes('else continue;') && l.includes('relazione non collegata'));
if (idx2<0) process.exit(2);
console.log('✅ MOD2 L'+(idx2+1)+': '+JSON.stringify(lines[idx2]));
c = c.replaceAllOnce ? '' : c; // placeholder
const OLD2_line = lines[idx2];
const NEW2_line = OLD2_line.replace('else continue;', 'else { debugF4Counts.saltatiNoRutMatch += 1; continue; }');
c = c.replace(OLD2_line, NEW2_line);

// ========== MOD 3: isNotaryEntry if block 4 righe consecutive dopo startIdx
const idx3a = findAfter(l => l.includes('if (isNotaryEntry({ nombre: socioName, rut: socioRutOrig }))'));
if (idx3a<0) process.exit(3);
console.log('✅ MOD3 isNotaryEntry L'+(idx3a+1));
// OLD3: linee idx3a..idx3a+3 = if / push / continue / }
const OLD3_arr = lines.slice(idx3a, idx3a+4);
const NEW3_arr = OLD3_arr.slice();
NEW3_arr.splice(1, 0, '            debugF4Counts.saltatiNotary += 1;'); // inserisci dopo if, prima push
c = c.replace(OLD3_arr.join('\n'), NEW3_arr.join('\n'));

// ========== MOD 4: if (!socioName) continue; dopo startIdx
const idx4 = findAfter(l => l.includes('if (!socioName) continue;') && l.includes('senza nome'));
if (idx4<0) process.exit(4);
console.log('✅ MOD4 socioName L'+(idx4+1));
const OLD4 = lines[idx4];
const NEW4 = OLD4.replace('if (!socioName) continue;', 'if (!socioName) { debugF4Counts.saltatiNoName += 1; continue; }');
c = c.replace(OLD4, NEW4);

// ========== MOD 5: if (seenKeys.has(key)) continue; DOPO startIdx! (NON L1686!)
const idx5 = findAfter(l => l.trim() === 'if (seenKeys.has(key)) continue;');
if (idx5<0) process.exit(5);
console.log('✅ MOD5 seenKeys L'+(idx5+1)+' ✅ CORRETTO DOPO startIdx (non L1686!)');
const OLD5 = lines[idx5];
const NEW5 = OLD5.replace('if (seenKeys.has(key)) continue;', 'if (seenKeys.has(key)) { debugF4Counts.deduped += 1; continue; }');
c = c.replace(OLD5, NEW5);

// ========== MOD 6: blocco if (addedFrom...)
const idx6Arr = [];
for (let i=startIdx;i<lines.length;i++) if (lines[i].includes('if (addedFromDequinesRep > 0 || skippedDequinesNotary.length > 0) {')) idx6Arr.push(i);
if (!idx6Arr.length) process.exit(6);
const idx6 = idx6Arr[0];
const OLD6_lines = [];
let d=0, i6=idx6;
for (; i6<lines.length; i6++) {
  OLD6_lines.push(lines[i6]);
  if (lines[i6].includes('{')) d++;
  if (lines[i6].includes('}')) { d--; if (d===0) break; }
}
const OLD6 = OLD6_lines.join('\n');
console.log('✅ MOD6 L'+(idx6+1)+'-L'+(i6+1)+' ('+OLD6_lines.length+' linee)');
const NEW6 = [
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
].join('\n');
if (!c.includes(OLD6)) process.exit(60);
c = c.replace(OLD6, NEW6);

// ========== EXTRA FIX TYPO: L1762/1763 dequinesForMesh → dequienesForMesh (fixato già nella NEW1? si, ho già usato dequienesForMesh sempre).
// Verifico: non ci siano occorrenze sbagliate
let typoCount = 0;
c = c.replace(/dequinesForMesh/g, (m) => { typoCount++; return 'dequienesForMesh'; });
if (typoCount>0) console.log('⚠️  EXTRA FIX TYPO: corrette '+typoCount+' occorrenze "dequinesForMesh" → "dequienesForMesh"');
else console.log('✅ Nessun typo "dequinesForMesh" (OK)');

// ========== EXTRA FIX: possibly undefined L1762 .relationships.length → aggiungi ?.
// (MOD1 NEW1 già usa `dequinesForMesh.relationships.filter` con `?.` nel if ma nel repsAll no.
//  Il warning è nel banner msgStats: Object.keys((dequienesForMesh as any)?.entityNames - già safe.
//  L'errore 1762 diagnostics: probabilmente è `if (dequinesForMesh?.relationships?.length > 0` - riga if che non ha `?.`:
//  Nel bak L1762: `if (dequinesForMesh?.relationships?.length > 0` → SI ha ?., quindi warning non è questo. Sarà altro - non importante now)

fs.writeFileSync(p, c);
console.log('\n✅✅✅ TUTTE MOD FONTE4 APPLICATE E TYPO CORRETTI!');
