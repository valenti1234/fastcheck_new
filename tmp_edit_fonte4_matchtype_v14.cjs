// tmp_edit_fonte4_matchtype_v14.cjs — fix FONTE4 merge match_type
const fs = require('fs');
const path = require('path');
const file = path.resolve(process.cwd(), 'src/pages/FastCheckEX.tsx');
const bak = file + '.bak.preFonte4v14';
const lines = fs.readFileSync(file, 'utf8').split('\n');
fs.copyFileSync(file, bak);

// Step 1: trova riga "if ((dequinesForMesh as any)?.relationships?.length > 0"
const startIdx = lines.findIndex(l => l.includes(`(dequinesForMesh as any)?.relationships?.length > 0`));
if (startIdx < 0) { console.error('startIdx not found'); process.exit(1); }

console.log('startIdx:', startIdx, '→', JSON.stringify(lines[startIdx]));

// Step 2: trova riga finale "const namesDict = (dequinesForMesh as any)?.entityNames || {};"
let endIdx = -1;
for (let i = startIdx + 1; i < Math.min(startIdx + 8, lines.length); i++) {
  if (lines[i].includes('namesDict =') && lines[i].includes('entityNames')) { endIdx = i; break; }
}
if (endIdx < 0) { console.error('endIdx not found. Intorno:', lines.slice(startIdx, startIdx+10)); process.exit(1); }
console.log('endIdx:', endIdx, '→', JSON.stringify(lines[endIdx]));

const indent = '        ';
const replacement = [
  `${indent}if ((dequinesForMesh as any)?.relationships?.length > 0 && (dequinesForMesh as any)?.entityNames) {`,
  `${indent}  const repsAllRaw = (dequinesForMesh as any)?.relationships?.filter((r: any) => r?.label === 'REPRESENTED_BY') || [];`,
  `${indent}  debugF4Counts.repsTotali = repsAllRaw.length;`,
  `${indent}  // 🔧 FIX 15.09 FONTE4 v1.4: STESSO BUG MESH! Non filtrare !match_type se non abbiamo risultati (merge matchTypeTRUE + noMatchType!)`,
  `${indent}  const repsOnlyNoType = repsAllRaw.filter((r: any) => !r?.information_source?.match_type);`,
  `${indent}  const repsOnlyMatchType = repsAllRaw.filter((r: any) => r?.information_source?.match_type === true);`,
  `${indent}  const f4Set = new Set();`,
  `${indent}  const repsOnly = [];`,
  `${indent}  for (const r of [...repsOnlyNoType, ...repsOnlyMatchType]) {`,
  `${indent}    const k = String(r.source)+'__'+String(r.target);`,
  `${indent}    if (!f4Set.has(k)) { f4Set.add(k); repsOnly.push(r); }`,
  `${indent}  }`,
  `${indent}  debugF4Counts.repsNoMatchType = repsOnly.length;`,
  `${indent}  debugF4Counts['repsOnly_noMatchType_singlecount'] = repsOnlyNoType.length;`,
  `${indent}  debugF4Counts['repsOnly_matchTypeTRUE_singlecount'] = repsOnlyMatchType.length;`,
  `${indent}  const namesDict = (dequinesForMesh as any)?.entityNames || {};`,
];

lines.splice(startIdx, endIdx - startIdx + 1, ...replacement);
fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log(`✅ Replace OK. ${replacement.length} nuove righe. Backup: ${bak}`);
