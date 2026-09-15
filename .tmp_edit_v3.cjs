const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'src/pages/FastCheckEX.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const OLD_DEP = `  }, [
    cleanedData?.sheriffLogData?.filteredDetails?.dequinesRelationships,
    cleanedData?.details?.sheriffLogData?.filteredDetails?.dequinesRelationships,
    cleanedData?.logEntry?.filteredDetails?.dequinesRelationships,
    (cleanedData as any)?.filteredDetails?.dequinesRelationships,
    cleanedData,
  ]);

  // User notes state`;

const idx = content.indexOf(OLD_DEP);
console.log('[TMP_V3] idx OLD_DEP:', idx, idx >= 0 ? '✅ TROVATO' : '❌ NON TROVATO');

// Se non trovato stampiamo surrounding
if (idx < 0) {
  console.log('\n[TMP_V3] Contenuto intorno a riga 347-360 (dopo last return finalArray):');
  const lines = content.split('\n');
  for (let i = 345; i <= 365 && i < lines.length; i++) {
    console.log(`  L${i+1}: >>>${lines[i]}<<<`);
  }
  process.exit(1);
}

const NEW_DEP_EFFECT = `}, [cleanedData]);

  useEffect(() => {
    const findAllByKeyPattern = (
      obj: any, keyPattern: RegExp, currentPath = 'root',
      visited = new WeakSet(), maxDepth = 14, depth = 0,
      results: Array<{ path: string; value: any; depth: number }> = []
    ) => {
      if (!obj || depth > maxDepth || typeof obj !== 'object') return results;
      try { if (visited.has(obj)) return results; visited.add(obj); } catch {}
      for (const key of Object.keys(obj)) {
        const val = (obj as any)[key];
        const fullPath = \`\${currentPath}.\${key}\`;
        if (keyPattern.test(key)) results.push({ path: fullPath, value: val, depth });
        if (val && typeof val === 'object') findAllByKeyPattern(val, keyPattern, fullPath, visited, maxDepth, depth + 1, results);
      }
      return results;
    };
    (window as any).__debugFastCheck = {
      cleanedData,
      rawData: data,
      dequinesForMesh,
      normRut: (s: any) => String(s ?? '').replace(/[^0-9Kk]/g, '').toLowerCase(),
      findAll: (pattern: RegExp = /dequien|relationship/i) =>
        findAllByKeyPattern(cleanedData, pattern).map(m => ({
          path: m.path, depth: m.depth,
          type: Array.isArray(m.value) ? \`Array(\${m.value.length})\` : (m.value && typeof m.value === 'object') ?
            \`Obj{rels:\${Array.isArray((m.value as any).relationships)?(m.value as any).relationships.length:'?'},names:\${(m.value as any).entityNames?Object.keys((m.value as any).entityNames).length:'?'}}\` :
            String(m.value)
        })),
    };
    console.log(
      '%c🔧 [DEBUG GLOBAL INJECTED]%c window.__debugFastCheck pronta!\\n' +
      '   Comandi utili F12:\\n' +
      '     1) window.__debugFastCheck.findAll(/dequien/i)\\n' +
      '     2) window.__debugFastCheck.dequinesForMesh?.length\\n' +
      '     3) Object.keys(window.__debugFastCheck.cleanedData)',
      'background:#9900cc;color:#fff;padding:3px 6px;border-radius:3px;font-weight:bold',
      'color:#999'
    );
  }, [cleanedData, data, dequinesForMesh]);

  // User notes state`;

content = content.substring(0, idx) + NEW_DEP_EFFECT + content.substring(idx + OLD_DEP.length);

fs.writeFileSync(filePath, content, 'utf8');
console.log('[TMP_V3] Blocco 4 sostituito ✅');
console.log('[TMP_V3] File aggiornato. Ora fai npm run build!');
