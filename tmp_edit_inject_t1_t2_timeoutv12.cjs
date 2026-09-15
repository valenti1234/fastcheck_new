// tmp_edit_inject_t1_t2_timeoutv12.cjs — aggiungi T1(250ms)/T2(900ms) DOPO il banner inject
const fs = require('fs');
const path = require('path');
const file = path.resolve(process.cwd(), 'src/pages/FastCheckEX.tsx');
const lines = fs.readFileSync(file, 'utf8').split('\n');

// find: riga "}, [cleanedData, data, dequinesForMesh]);" — chiusura useEffect inject
const endOfUseEffectIdx = lines.findIndex(l => l.trim() === `}, [cleanedData, data, dequinesForMesh]);`);
if (endOfUseEffectIdx <0) { console.error('end useEffect idx NOT FOUND'); process.exit(1); }

// startIdx: prima riga "console.log('[DEBUG GLOBAL INJECTED v1.1'..."
let startIdx = -1;
for (let i = endOfUseEffectIdx - 20; i < endOfUseEffectIdx; i++) {
  if (lines[i].includes('[DEBUG GLOBAL INJECTED v1.1')) { startIdx = i; break; }
}
if (startIdx<0) { console.error('startIdx banner v1.1 not found'); process.exit(1); }

console.log('startIdx banner v1.1:', startIdx, 'endOfUseEffectIdx:', endOfUseEffectIdx, 'righe tra:', endOfUseEffectIdx-startIdx+1);
console.log('Riga start:', JSON.stringify(lines[startIdx]));
console.log('Riga end (useEffect close):', JSON.stringify(lines[endOfUseEffectIdx]));

// OK — sostituisco tutte le righe startIdx ... endOfUseEffectIdx (incluse) con:
//   - vecchio banner + codice nuovo timeout (lo ricostruisco identico ma +doReinject + chiusura!)
const indentInjectBlock = '      ';
const lines2ReplaceCount = endOfUseEffectIdx - startIdx + 1;
const replacement = [
`${indentInjectBlock}console.log('%c🔧 [DEBUG GLOBAL INJECTED v1.1 • 15.09.2026 🔧ROBUSTO]%c window.__debugFastCheck disponibile in console F12. dequinesForMesh type=%s rels=%s names=%s\\n%c  Comandi utili:\\n    %cwindow.__debugFastCheck.dequinesForMesh.relationships%c → array relazioni (atteso 63 per 92604000-6)\\n    %cwindow.__debugFastCheck.findAll(/dequien/i)%c → tabella tutti i match a qualsiasi profondità',`,
`${indentInjectBlock}  'background:#1f6feb;color:#fff;padding:3px 10px;border-radius:4px;font-weight:bold',`,
`${indentInjectBlock}  'color:#1f6feb;font-weight:bold',`,
`${indentInjectBlock}  typeof dequinesForMesh_INJECT,`,
`${indentInjectBlock}  dequinesForMesh_INJECT?.relationships?.length ?? 0,`,
`${indentInjectBlock}  Object.keys(dequinesForMesh_INJECT?.entityNames || {}).length,`,
`${indentInjectBlock}  'color:#8b949e',`,
`${indentInjectBlock}  'color:#f0883e;background:#161b22;padding:1px 5px;border-radius:3px',`,
`${indentInjectBlock}  'color:#8b949e',`,
`${indentInjectBlock}  'color:#f0883e;background:#161b22;padding:1px 5px;border-radius:3px',`,
`${indentInjectBlock}  'color:#8b949e'`,
`${indentInjectBlock});`,
`${indentInjectBlock}// 🔧 FIX 15.09 INJECT ROBUSTO v1.2 — RETRY SETTIMEOUT!`,
`${indentInjectBlock}// (useMemo dequinesForMesh potrebbe essere undefined nel primo render veloce.`,
`${indentInjectBlock}//  Aspettiamo 250ms/900ms → usiamo dequinesForMesh dallo scope (useMemo ha finito!))`,
`${indentInjectBlock}if (typeof window !== 'undefined') {`,
`${indentInjectBlock}  const doReinject = (whenMs: number, tag: string) => {`,
`${indentInjectBlock}    setTimeout(() => {`,
`${indentInjectBlock}      try {`,
`${indentInjectBlock}        const obj = (window as any).__debugFastCheck || {};`,
`${indentInjectBlock}        // Se adesso dequinesForMesh (useMemo) è valorizzato (relazioni >0!) usalo!`,
`${indentInjectBlock}        let meshObj = dequinesForMesh;`,
`${indentInjectBlock}        if (!meshObj || !(meshObj as any)?.relationships?.length) meshObj = dequinesForMesh_INJECT; // fallback inject calcolato prima`,
`${indentInjectBlock}        if (!meshObj || !(meshObj as any)?.relationships?.length) {`,
`${indentInjectBlock}          try {`,
`${indentInjectBlock}            const tryP = (cleanedData as any)?.details?.dequinesRelationships || (cleanedData as any)?.sheriffLogData?.filteredDetails?.dequinesRelationships || (data as any)?.details?.dequinesRelationships;`,
`${indentInjectBlock}            if (tryP && (Array.isArray(tryP.relationships) || Array.isArray(tryP))) {`,
`${indentInjectBlock}              meshObj = Array.isArray(tryP) ? { relationships: tryP, entityNames: {} } : { relationships: tryP.relationships || [], entityNames: tryP.entityNames || {} };`,
`${indentInjectBlock}            }`,
`${indentInjectBlock}          } catch(e3){}`,
`${indentInjectBlock}        }`,
`${indentInjectBlock}        (window as any).__debugFastCheck = {`,
`${indentInjectBlock}          cleanedData: obj.cleanedData || cleanedData,`,
`${indentInjectBlock}          rawData: obj.rawData || data,`,
`${indentInjectBlock}          dequinesForMesh: meshObj,`,
`${indentInjectBlock}          normRut: obj.normRut || normRut,`,
`${indentInjectBlock}          findAll: obj.findAll || findAll,`,
`${indentInjectBlock}          forceRecalc: (obj.forceRecalc) || (() => console.log('OK')),`,
`${indentInjectBlock}          _reinjectTag: tag,`,
`${indentInjectBlock}        };`,
`${indentInjectBlock}        const nlen = ((window as any).__debugFastCheck.dequinesForMesh)?.relationships?.length ?? -1;`,
`${indentInjectBlock}        if (nlen > 0) console.log(%c  ✅ [REINJECT '+tag+' @'+whenMs+'ms] dequinesForMesh OK! rels='+nlen, 'color:#16a34a;background:#dcfce7;padding:1px 6px;border-radius:3px;font-weight:600');`,
`${indentInjectBlock}        else console.warn('  ⚠️ [REINJECT '+tag+' @'+whenMs+'ms] ancora NON TROVATO rels='+nlen);`,
`${indentInjectBlock}      } catch(errTimeout){ console.warn('[Reinject timeout fail]', errTimeout); }`,
`${indentInjectBlock}    }, whenMs);`,
`${indentInjectBlock}  };`,
`${indentInjectBlock}  doReinject(250, 'T1');`,
`${indentInjectBlock}  doReinject(900, 'T2-FINALE');`,
`${indentInjectBlock}}`,
`${indentInjectBlock}    } catch (e) { console.warn('[DEBUG GLOBAL] inject fallito:', e); }`,
`${indentInjectBlock}  }, [cleanedData, data, dequinesForMesh]);`,
];
// ATTENZIONE: riga console.log con REINJECT ho usato apici singoli dentro le graffe per errore! Devo fixare la sintassi:
// — ho ${indentInjectBlock}        if (nlen > 0) console.log(%c  ✅ [REINJECT '+tag+' @'+whenMs+'ms] ... — SBAGLIATO, %c non è dentro le graffe! Riscriverò correttamente in-place con replace:
for (let i = 0; i < replacement.length; i++) {
  if (replacement[i].includes(`console.log(%c  ✅ [REINJECT '+tag+' @'+whenMs+'ms]`)) {
    replacement[i] = `${indentInjectBlock}        if (nlen > 0) console.log('%c  ✅ [REINJECT '+tag+' @'+whenMs+'ms] dequinesForMesh OK! rels='+nlen, 'color:#16a34a;background:#dcfce7;padding:1px 6px;border-radius:3px;font-weight:600');`;
  }
}
lines.splice(startIdx, lines2ReplaceCount, ...replacement);
fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log('✅ sostituiti ', lines2ReplaceCount, 'righe con', replacement.length, 'righe nuove.');
