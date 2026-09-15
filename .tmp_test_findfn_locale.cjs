// TEST: ripeto 1:1 la funzione findAllByKeyPatternFn su struct MOCKATO come cleanedData dell'utente
const cleanedData_MOCK = {
  id: '6aa934f2b06b194c838077d8',
  rut: '92604000-6',
  tenantId: 'tenant1',
  queryType: 'fastcheck',
  sheriffLogData: {
    filteredDetails: {
      // dequienesRelationships annidato come ci aspettiamo dentro sheriffLogData
      dequienesRelationships: {
        pathCount: 100,
        relationships: Array.from({length: 100}, (_,i)=>({source:'r'+i,target:'t'+i,label: i<74?'OWNED_BY':'REPRESENTED_BY'})),
        entityNames: {'92604000-6':'EMPRESA X'}
      },
      altraChiave: 123,
      someRelationshipKey: 'foo', // chiave che matcha /relationship/i (loose)
    }
  },
  details: {
    companyGeneralInfo: { foo: 'bar' }
  },
  companyGeneralInfo: { foo: 'bar' },
  risksAssessment: { total: 'alto' }
};

// FUNZIONE IDENTICA 1:1 a FastCheckEX.tsx L244-L260
const findAllByKeyPatternFn = (
  obj, keyPattern, currentPath = 'cleanedData',
  visited = new WeakSet(), maxDepth = 14, depth = 0,
  results = []
) => {
  if (!obj || depth > maxDepth || typeof obj !== 'object') return results;
  try { if (visited.has(obj)) return results; visited.add(obj); } catch (e) {}
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    const fullPath = currentPath + '.' + key;
    if (keyPattern.test(key)) results.push({ path: fullPath, value: val, depth });
    if (val && typeof val === 'object') {
      findAllByKeyPatternFn(val, keyPattern, fullPath, visited, maxDepth, depth + 1, results);
    }
  }
  return results;
};

const strict = findAllByKeyPatternFn(cleanedData_MOCK, /^dequinesRelationships$/i);
const loose  = findAllByKeyPatternFn(cleanedData_MOCK, /dequien|relationship/i);

console.log('STRICT /^dequinesRelationships$/i →', strict.length, 'match:');
strict.forEach(m => console.log(' ', m.path, 'depth='+m.depth, Array.isArray(m.value)?('Array('+m.value.length+')'):typeof m.value));

console.log('\nLOOSE /dequien|relationship/i →', loose.length, 'match:');
loose.forEach(m => console.log(' ', m.path, 'depth='+m.depth));

console.log('\nConclusione: la funzione RICORSIVA in locale FUNZIONA?', strict.length > 0 && loose.length > 0 ? '✅ SI (match trovati) → BUG ALTROVE: payload REALE cleanedData non contiene proprio le chiavi, oppure problema naming/maiuscole/minuscole.' : '❌ NO (0 match) → BUG nella FUNZIONE.');
