// tmp_edit_final_inject_timeout_v12b.cjs — insert T1/T2 timeout TRA banner inject chiusura ) e catch
const fs = require('fs');
const file = process.cwd() + '/src/pages/FastCheckEX.tsx';
const lines = fs.readFileSync(file, 'utf8').split('\n');

// Riga L517 = index 516 è "      );"
// Riga L518 = index 517 è "    } catch (e) { console.warn('[DEBUG GLOBAL] inject fallito:', e); }"
// Inseriamo il codice TIMEOUT dopo riga 516, PRIMA di 517
const insertAfterIdx = 516; // 0-based
console.log('Insert after idx:', insertAfterIdx, 'Current value:', JSON.stringify(lines[insertAfterIdx]));
console.log('Next idx (catch):', JSON.stringify(lines[insertAfterIdx + 1]));

// Righe da inserire (indentazione 6 spazi = livello dentro try/catch useEffect!)
const ind = '      ';
const newLines = [
`${ind}// 🔧 FIX 15.09 INJECT ROBUSTO v1.2 — RETRY SETTIMEOUT T1(250ms) T2(900ms)!`,
`${ind}// (useMemo dequinesForMesh potrebbe essere undefined nel primo render veloce.`,
`${ind}//  Aspettiamo → lo scope dequinesForMesh (useMemo) è valorizzato OR fallback path raw!)`,
`${ind}if (typeof window !== 'undefined') {`,
`${ind}  const doReinject = (whenMs, tag) => {`,
`${ind}    setTimeout(() => {`,
`${ind}      try {`,
`${ind}        const obj = (window as any).__debugFastCheck || {};`,
`${ind}        let meshObj = dequinesForMesh;`,
`${ind}        if (!meshObj || !(meshObj)?.relationships?.length) meshObj = dequinesForMesh_INJECT;`,
`${ind}        if (!meshObj || !(meshObj)?.relationships?.length) {`,
`${ind}          try {`,
`${ind}            const tryP = (cleanedData as any)?.details?.dequinesRelationships || (cleanedData as any)?.sheriffLogData?.filteredDetails?.dequinesRelationships || (data as any)?.details?.dequinesRelationships;`,
`${ind}            if (tryP && (Array.isArray(tryP.relationships) || Array.isArray(tryP))) {`,
`${ind}              meshObj = Array.isArray(tryP) ? { relationships: tryP, entityNames: {} } : { relationships: tryP.relationships || [], entityNames: tryP.entityNames || {} };`,
`${ind}            }`,
`${ind}          } catch(e3){}`,
`${ind}        }`,
`${ind}        (window as any).__debugFastCheck = {`,
`${ind}          cleanedData: obj.cleanedData || cleanedData,`,
`${ind}          rawData: obj.rawData || data,`,
`${ind}          dequinesForMesh: meshObj,`,
`${ind}          normRut: obj.normRut || normRut,`,
`${ind}          findAll: obj.findAll || findAll,`,
`${ind}          forceRecalc: (obj.forceRecalc) || (() => {}),`,
`${ind}          _reinjectTag: tag,`,
`${ind}        };`,
`${ind}        const nlen = ((window as any).__debugFastCheck.dequinesForMesh)?.relationships?.length ?? -1;`,
`${ind}        if (nlen > 0) console.log('%c  ✅ [REINJECT '+tag+' @'+whenMs+'ms] dequinesForMesh OK! rels='+nlen, 'color:#16a34a;background:#dcfce7;padding:1px 6px;border-radius:3px;font-weight:600');`,
`${ind}        else console.warn('  ⚠️ [REINJECT '+tag+' @'+whenMs+'ms] ancora rels='+nlen);`,
`${ind}      } catch(errTimeout){ console.warn('[Reinject timeout fail]', errTimeout); }`,
`${ind}    }, whenMs);`,
`${ind}  };`,
`${ind}  doReinject(250, 'T1');`,
`${ind}  doReinject(900, 'T2-FINALE');`,
`${ind}}`,
];
lines.splice(insertAfterIdx + 1, 0, ...newLines);
fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log('✅ INSERT OK', newLines.length, 'righe dopo idx', insertAfterIdx);
