// tmp_edit_fonte4_matchtype_v14c.cjs — usa indice diretto
const fs = require('fs');
const path = require('path');
const file = path.resolve(process.cwd(), 'src/pages/FastCheckEX.tsx');
const lines = fs.readFileSync(file, 'utf8').split('\n');
const startIdx = 1809; // L1810 (0-based = 1809) if L1806 = index 1805! ATTENZIONE: 0-based da letto nel node: L1810 corrisponde a i=1809.
const endIdx = 1814;   // L1815 namesDict.
console.log('startIdx 0-based:', startIdx, ' → riga:', lines[startIdx]);
console.log('endIdx 0-based:',   endIdx,   ' → riga:', lines[endIdx]);

const indent = '        ';
const replacement = [
`${indent}if ((dequinesForMesh as any)?.relationships?.length > 0 && (dequinesForMesh as any)?.entityNames) {`,
`${indent}  const repsAllRaw = (dequinesForMesh as any)?.relationships?.filter((r: any) => r?.label === 'REPRESENTED_BY') || [];`,
`${indent}  debugF4Counts.repsTotali = repsAllRaw.length;`,
`${indent}  // 🔧 FIX 15.09 FONTE4 v1.4: STESSO BUG MESH! Unisci match_type + no match_type (non buttar via 23 stimate)`,
`${indent}  const repsOnlyNoType = repsAllRaw.filter((r: any) => !r?.information_source?.match_type);`,
`${indent}  const repsOnlyMatchType = repsAllRaw.filter((r: any) => r?.information_source?.match_type === true);`,
`${indent}  const f4Set = new Set();`,
`${indent}  const repsOnly = [];`,
`${indent}  for (const r of [...repsOnlyNoType, ...repsOnlyMatchType]) {`,
`${indent}    const k = String(r.source||'')+'__'+String(r.target||'');`,
`${indent}    if (!f4Set.has(k)) { f4Set.add(k); repsOnly.push(r); }`,
`${indent}  }`,
`${indent}  debugF4Counts.repsNoMatchType = repsOnly.length;`,
`${indent}  debugF4Counts.repsOnly_noMatchType_raw = repsOnlyNoType.length;`,
`${indent}  debugF4Counts.repsOnly_matchTypeTRUE_raw = repsOnlyMatchType.length;`,
`${indent}  const namesDict = (dequinesForMesh as any)?.entityNames || {};`,
];

lines.splice(startIdx, endIdx - startIdx + 1, ...replacement);
fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log('✅ OK. nuove righe:', replacement.length);
