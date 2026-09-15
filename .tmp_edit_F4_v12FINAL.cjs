
const fs = require('fs');
const p = 'src/pages/FastCheckEX.tsx';
// Ripristina prima
fs.copyFileSync('.bak.FastCheckEX.preF4edit', p);
let c = fs.readFileSync(p, 'utf8');

// ================ MOD 1: repsOnly multi-line → repsAll + split + counts ================
// Vecchio:
//       const repsOnly = dequinesForMesh.relationships.filter(
//         (r: any) => r?.label === 'REPRESENTED_BY' && !r?.information_source?.match_type
//       );
// Nuovo:
const OLD1 = `      if (dequienesForMesh?.relationships?.length > 0 && dequienesForMesh?.entityNames) {
        const repsOnly = dequinesForMesh.relationships.filter(
          (r: any) => r?.label === 'REPRESENTED_BY' && !r?.information_source?.match_type
        );
        const namesDict = dequinesForMesh.entityNames;
        const mainNormLocal = normRut(companyData?.rut);`;
const NEW1 = `      if (dequienesForMesh?.relationships?.length > 0 && dequienesForMesh?.entityNames) {
        const repsAll = dequinesForMesh.relationships.filter((r: any) => r?.label === 'REPRESENTED_BY');
        debugF4Counts.repsTotali = repsAll.length;
        const repsOnly = repsAll.filter((r: any) => !r?.information_source?.match_type);
        debugF4Counts.repsNoMatchType = repsOnly.length;
        const namesDict = dequinesForMesh.entityNames;
        const mainNormLocal = normRut(companyData?.rut);
        debugF4Counts.srcEqMain = repsOnly.filter((r:any)=> normRut(String(r.source||''))===mainNormLocal).length;
        debugF4Counts.tgtEqMain = repsOnly.filter((r:any)=> normRut(String(r.target||''))===mainNormLocal).length;`;
if (!c.includes(OLD1.split('\n')[0])) { console.error('❌ OLD1 match FAIL riga 1'); process.exit(1); }
if (!c.includes(OLD1)) { console.error('❌ OLD1 match FAIL (intero blocco). Riga1 presente ma non blocco intero.'); process.exit(10);}
c = c.replace(OLD1, NEW1);
console.log('✅ MOD1 repsAll + split + src/tgt EqMain OK');

// ================ MOD 2: else continue → saltatiNoRutMatch ================
const OLD2 = `          else continue; // relazione non collegata al RUT principale`;
const NEW2 = `          else { debugF4Counts.saltatiNoRutMatch += 1; continue; } // relazione non collegata al RUT principale`;
if (!c.includes(OLD2)) { console.error('❌ OLD2 FAIL (else continue)'); process.exit(2); }
c = c.replace(OLD2, NEW2);
console.log('✅ MOD2 saltatiNoRutMatch OK');

// ================ MOD3: isNotaryEntry if { push → aggiungi count prima push
const OLD3 = `          if (isNotaryEntry({ nombre: socioName, rut: socioRutOrig })) {
            skippedDequinesNotary.push(socioName || socioRutOrig);
            continue;
          }`;
const NEW3 = `          if (isNotaryEntry({ nombre: socioName, rut: socioRutOrig })) {
            debugF4Counts.saltatiNotary += 1;
            skippedDequinesNotary.push(socioName || socioRutOrig);
            continue;
          }`;
if (!c.includes(OLD3)) { console.error('❌ OLD3 FAIL (isNotaryEntry)'); process.exit(3); }
c = c.replace(OLD3, NEW3);
console.log('✅ MOD3 saltatiNotary OK');

// ================ MOD4: if (!socioName) continue;
const OLD4 = `          if (!socioName) continue; // senza nome = inutile per valutazione PEP`;
const NEW4 = `          if (!socioName) { debugF4Counts.saltatiNoName += 1; continue; } // senza nome = inutile per valutazione PEP`;
if (!c.includes(OLD4)) { console.error('❌ OLD4 FAIL (socioName continue)'); process.exit(4); }
c = c.replace(OLD4, NEW4);
console.log('✅ MOD4 saltatiNoName OK');

// ================ MOD5: if (seenKeys.has(key)) continue;
const OLD5 = `          if (seenKeys.has(key)) continue;`;
const NEW5 = `          if (seenKeys.has(key)) { debugF4Counts.deduped += 1; continue; }`;
if (!c.includes(OLD5)) { console.error('❌ OLD5 FAIL (seenKeys continue)'); process.exit(5); }
c = c.replace(OLD5, NEW5);
console.log('✅ MOD5 deduped OK');

// ================ MOD6: blocco if (addedFrom > 0 finale → nuovo banner SEMPRE
const OLD6 = `      if (addedFromDequinesRep > 0 || skippedDequinesNotary.length > 0) {
        logger.log(
          \`[PEP Socios Filter] FONTE 4 Dequienes REPRESENTED_BY: aggiunti \${addedFromDequinesRep} socios. Scartati notarili: \${skippedDequinesNotary.length} (nomi: \${JSON.stringify(skippedDequinesNotary)}).\`
        );
      }`;
const NEW6 = `      // 🔧 Banner SEMPRE visibile (anche 0) → debugging immediato
      {
        const msgStats = \`stats=\${JSON.stringify(debugF4Counts)} · mainRut_norm=\${normRut(companyData?.rut)} · namesDict_keys=\${Object.keys((dequienesForMesh as any)?.entityNames || {}).length}\`;
        if (addedFromDequinesRep > 0 || skippedDequinesNotary.length > 0) {
          logger.log(
            \`🟢 [PEP Socios Filter FONTE4 v1.2] Aggiunti \${addedFromDequinesRep} socios. Scartati notarili=\${skippedDequinesNotary.length} · \${msgStats}\`
          );
        } else {
          logger.warn(
            \`⚠️ [PEP Socios Filter FONTE4 v1.2] AGGIUNTI 0 (controlla counts). \${msgStats} · nomi_notary_scartati=\${JSON.stringify(skippedDequinesNotary)}\`
          );
        }
      }`;
if (!c.includes(OLD6)) { console.error('❌ OLD6 FAIL (banner finale)'); process.exit(6); }
c = c.replace(OLD6, NEW6);
console.log('✅ MOD6 banner SEMPRE visibile OK');

fs.writeFileSync(p, c);
console.log('\n✅✅✅ TUTTE LE MODIFICHE (6/6) FONTE4 v1.2 APPLICATE!');
