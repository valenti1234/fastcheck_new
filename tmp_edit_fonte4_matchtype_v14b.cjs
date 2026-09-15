// tmp_edit_fonte4_matchtype_v14b.cjs
const fs = require('fs');
const path = require('path');
const file = path.resolve(process.cwd(), 'src/pages/FastCheckEX.tsx');
const lines = fs.readFileSync(file, 'utf8').split('\n');

// startIdx = riga che contiene l'if (dequinesForMesh as any)?
const startIdx = lines.findIndex(l => l.includes(`dequinesForMesh as any)?.relationships?.length > 0`) && l.includes('entityNames'));
console.log('startIdx:', startIdx, lines[startIdx]);

// endIdx = la riga namesDict = ...entityNames || {}; SUBITO DOPO repsOnly.
const endIdx = lines.findIndex((l, i) => i > startIdx && i < startIdx + 8 && l.includes('namesDict =') && l.includes('entityNames'));
console.log('endIdx:', endIdx, lines[endIdx]);
if (startIdx<0 || endIdx<0) process.exit(1);

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
lines.splice(startIdx, endIdx-startIdx+1, ...replacement);
fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log('✅ OK');
