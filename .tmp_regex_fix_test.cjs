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
const data = {
  sheriffLogData: {
    filteredDetails: {
      // Chiave VERA come nel payload!
      dequienesRelationships: { relationships: Array(100), entityNames: {} },
      // Altre varianti da testare (nomi sbagliati ma che dovrebbero matchare loose/ultra)
      dequenesRelationships: { relationships: Array(50) },        // senza I
      deQuienesRelationships: { relationships: Array(25) },       // Q maiusc
      mallaSocietariaData: { foo: 'bar' },
      deq: { relationships: Array(10) },
    }
  }
};
const strict = findAllByKeyPatternFn(data, /^dequ[ie]?n[a-z]*Relationships$/i);
const loose  = findAllByKeyPatternFn(data, /deq|relac|relation|^rels?$/i);
const ultra  = findAllByKeyPatternFn(data, /deq/i);
console.log('NUOVA REGEX strict fixata:', strict.length, '→', strict.map(m=>m.path));
console.log('LOOSE:',  loose.length,  '→', loose.map(m=>m.path));
console.log('ULTRA (/deq/i):', ultra.length, '→', ultra.map(m=>m.path));
