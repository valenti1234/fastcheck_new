const fs = require('fs');
const j = JSON.parse(fs.readFileSync('/home/duxiter/duxiter_intermediate/server/json_data/riskCalculationResult_LATEST_92604000-6.json', 'utf8'));
const res = [];
const seen = new WeakSet();
function walk(o, p, d) {
  if (!o || typeof o !== 'object' || d > 14) return;
  try { if (seen.has(o)) return; seen.add(o); } catch (e) { /* primitivi non hanno WeakSet */ }
  for (const k of Object.keys(o)) {
    const np = p + '.' + k;
    const v = o[k];
    if (/deq|relation|relac|rels?$|^deq|deuen|dEqu/i.test(k)) {
      let t;
      if (Array.isArray(v)) t = 'Array(' + v.length + ')';
      else if (v && typeof v === 'object') {
        const ks = Object.keys(v);
        t = 'Object(keys[' + ks.length + ']: ' + ks.slice(0, 6).join(',') + (ks.length > 6 ? '...' : '') + ')';
      } else t = (typeof v) + '=' + String(v).slice(0, 50);
      res.push({ depth: d, path: np, key: k, type: t });
    }
    walk(v, np, d + 1);
  }
}
walk(j, 'ROOT', 0);
console.log('\nMATCH TROVATI nel file di audit LOCALE (riskCalculationResult_LATEST_92604000-6.json):');
console.log('='.repeat(180));
res.forEach(r => console.log(
  String(r.depth).padStart(2),
  ' | ',
  r.key.padEnd(40),
  ' | ',
  r.type.padEnd(60),
  ' | ',
  r.path
));
console.log('\nTOTALI:', res.length);

// Extra: stampa TUTTE le chiavi di TOP-LEVEL + ROOT.filteredDetails (se esiste)
console.log('\n\n🔝 CHIAVI TOP-LEVEL ROOT:', Object.keys(j).join(', '));
if (j.filteredDetails) console.log('📁 ROOT.filteredDetails keys:', Object.keys(j.filteredDetails).join(', '));
if (j.logEntry && j.logEntry.filteredDetails) console.log('📁 ROOT.logEntry.filteredDetails keys:', Object.keys(j.logEntry.filteredDetails).join(', '));
if (j.sheriffLogData && j.sheriffLogData.filteredDetails) console.log('📁 ROOT.sheriffLogData.filteredDetails keys:', Object.keys(j.sheriffLogData.filteredDetails).join(', '));
