const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'src/pages/FastCheckEX.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Prendi: da "  }, [" (riga dopo return finalArray) fino a inizio "  // User notes state"
const START_MARKER = 'return finalArray;\n  }, [';
const END_MARKER = '  // User notes state';

const idxStartFull = content.indexOf(START_MARKER);
const idxDepOnly = idxStartFull > 0 ? idxStartFull + 'return finalArray;\n'.length : -1;
console.log('[TMP_V4] idx START (return finalArray):', idxStartFull, idxStartFull >= 0 ? '✅' : '❌');
console.log('[TMP_V4] idx  }, [  inizio dep array:', idxDepOnly);

const idxEndUserNotes = content.indexOf(END_MARKER, idxDepOnly);
console.log('[TMP_V4] idx END (// User notes state):', idxEndUserNotes, idxEndUserNotes >= 0 ? '✅' : '❌');

if (idxDepOnly < 0 || idxEndUserNotes < 0) {
  console.log('\nMarker non trovati - exit');
  process.exit(1);
}

const oldBloccoCompreso = content.substring(idxDepOnly, idxEndUserNotes);
console.log(`\n[TMP_V4] Vecchio blocco dep (${oldBloccoCompreso.length} chars):`);
console.log(oldBloccoCompreso);

const NEW_BLOCCO = `}, [cleanedData]);

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

`;

content = content.substring(0, idxDepOnly) + NEW_BLOCCO + content.substring(idxEndUserNotes);
fs.writeFileSync(filePath, content, 'utf8');
console.log('\n[TMP_V4] Blocco 4 sostituito ✅. Ora fai npm run build!');
