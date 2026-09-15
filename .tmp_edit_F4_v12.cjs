
// Edit safe in-place: sostituisci 2 blocchi Fonte4 con versione debug counts (F4 v1.2)
const fs = require('fs');
const p = 'src/pages/FastCheckEX.tsx';
let c = fs.readFileSync(p, 'utf8');

// ---------- Blocco 1: prima porzione if (da filter counts + split repsAll) ----------
const regexBlock1 = /      if \(dequienesForMesh\?\.relationships\?\.length > 0 && dequienesForMesh\?\.entityNames\) \{\n        const repsOnly = dequienesForMesh\.relationships\.filter\(\n          \(r: any\) => r\?\.label === 'REPRESENTED_BY' && !r\?\.information_source\?\.match_type\n        \);\n        const namesDict = dequienesForMesh\.entityNames;\n        const mainNormLocal = normRut\(companyData\?\.rut\);\n        for \(const r of repsOnly\) \{\n          const src = normRut\(String\(r\.source \|\| ''\)\);\n          const tgt = normRut\(String\(r\.target \|\| ''\)\);/;
const replacement1 = `      if (dequienesForMesh?.relationships?.length > 0 && dequienesForMesh?.entityNames) {
        const repsAll = dequinesForMesh.relationships.filter((r: any) => r?.label === 'REPRESENTED_BY');
        debugF4Counts.repsTotali = repsAll.length;
        const repsOnly = repsAll.filter((r: any) => !r?.information_source?.match_type);
        debugF4Counts.repsNoMatchType = repsOnly.length;
        const namesDict = dequienesForMesh.entityNames;
        const mainNormLocal = normRut(companyData?.rut);
        debugF4Counts.srcEqMain = repsOnly.filter((r:any)=> normRut(String(r.source||''))===mainNormLocal).length;
        debugF4Counts.tgtEqMain = repsOnly.filter((r:any)=> normRut(String(r.target||''))===mainNormLocal).length;
        for (const r of repsOnly) {
          const src = normRut(String(r.source || ''));
          const tgt = normRut(String(r.target || ''));`;
if (!regexBlock1.test(c)) {
  console.error('❌ regexBlock1 NON TROVATO!');
  process.exit(1);
}
c = c.replace(regexBlock1, replacement1);
console.log('✅ regexBlock1 OK');

// ---------- Blocco 2: incrementi counts dentro loop (continue → +=1; push → add; isNotaryEntry; if(!socioName); seenKeys.has()) ----------
const regexBlock2 = /          else continue; \/\/ relazione non collegata al RUT principale\n          \/\/ Nome da entityNames \(chiave normalizzata\)\n          socioName =\n            namesDict\[socioRutNorm\] \|\|\n            namesDict\[socioRutOrig\] \|\|\n            namesDict\[normRut\(socioRutOrig\)\] \|\|\n            r\._targetEntityName \|\| r\._sourceEntityName \|\|\n            '';\n          \/\/ Filtro notarile doppia sicurezza \(filterOutNotaryRelationships già applicato, ma cautela\)\n          if \(isNotaryEntry\(\{ nombre: socioName, rut: socioRutOrig \}\)\) \{\n            skippedDequinesNotary\.push\(socioName \|\| socioRutOrig\);\n            continue;\n          \}\n          if \(!socioName\) continue; \/\/ senza nome = inutile per valutazione PEP\n          const key = socioRutNorm \|\| `__noRut__\$\{socioName\.toLowerCase\(\)\}`;\n          if \(seenKeys\.has\(key\)\) continue;\n          seenKeys\.add\(key\);\n          socios\.push\(\{ name: socioName, rut: \(socioRutOrig \|\| ''\)\.trim\(\) \}\);\n          addedFromDequinesRep \+= 1;\n        \}\n      \}\n      if \(addedFromDequinesRep > 0 \|\| skippedDequinesNotary\.length > 0\) \{\n        logger\.log\(\n          `\[PEP Socios Filter\] FONTE 4 Dequienes REPRESENTED_BY: aggiunti \$\{addedFromDequinesRep\} socios\. Scartati notarili: \$\{skippedDequinesNotary\.length\} \(nomi: \$\{JSON\.stringify\(skippedDequinesNotary\)\}\)\.`\n        \);\n      \}/;
const replacement2 = `          else { debugF4Counts.saltatiNoRutMatch += 1; continue; } // relazione non collegata al RUT principale
          // Nome da entityNames (chiave normalizzata)
          socioName =
            namesDict[socioRutNorm] ||
            namesDict[socioRutOrig] ||
            namesDict[normRut(socioRutOrig)] ||
            r._targetEntityName || r._sourceEntityName ||
            '';
          // Filtro notarile doppia sicurezza (filterOutNotaryRelationships già applicato, ma cautela)
          if (isNotaryEntry({ nombre: socioName, rut: socioRutOrig })) {
            debugF4Counts.saltatiNotary += 1;
            skippedDequinesNotary.push(socioName || socioRutOrig);
            continue;
          }
          if (!socioName) { debugF4Counts.saltatiNoName += 1; continue; } // senza nome = inutile per valutazione PEP
          const key = socioRutNorm || `__noRut__${socioName.toLowerCase()}`;
          if (seenKeys.has(key)) { debugF4Counts.deduped += 1; continue; }
          seenKeys.add(key);
          socios.push({ name: socioName, rut: (socioRutOrig || '').trim() });
          addedFromDequinesRep += 1;
        }
      }
      // 🔧 Banner SEMPRE visibile (anche 0) → debugging immediato
      {
        const msgStats = `stats=${JSON.stringify(debugF4Counts)} · mainRut_norm=${normRut(companyData?.rut)} · namesDict_keys=${Object.keys((dequienesForMesh as any)?.entityNames || {}).length}`;
        if (addedFromDequinesRep > 0 || skippedDequinesNotary.length > 0) {
          logger.log(
            `🟢 [PEP Socios Filter FONTE4 v1.2] Aggiunti ${addedFromDequinesRep} socios. Scartati notarili=${skippedDequinesNotary.length} · ${msgStats}`
          );
        } else {
          logger.warn(
            `⚠️ [PEP Socios Filter FONTE4 v1.2] AGGIUNTI 0 (controlla counts). ${msgStats} · nomi_notary_scartati=${JSON.stringify(skippedDequinesNotary)}`
          );
        }
      }`;
if (!regexBlock2.test(c)) {
  console.error('❌ regexBlock2 NON TROVATO!');
  process.exit(2);
}
c = c.replace(regexBlock2, replacement2);
console.log('✅ regexBlock2 OK');

fs.writeFileSync(p, c);
console.log('✅ Write completato');
