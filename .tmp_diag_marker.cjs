const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'src/pages/FastCheckEX.tsx');
const content = fs.readFileSync(filePath, 'utf8');

console.log('Length:', content.length);
console.log('\nindexOf "const raw =":', content.indexOf('const raw ='));

const pos = content.indexOf('const raw =');
if (pos >= 0) {
  console.log('Context (200 chars):');
  console.log('>>>', content.substring(pos - 10, pos + 200), '<<<');
}

console.log('\nindexOf "cleanedData?.sheriffLogData?.filteredDetails?.dequinesRelationships":',
  content.indexOf('cleanedData?.sheriffLogData?.filteredDetails?.dequinesRelationships'));

// Controlliamo anche quale sia la riga
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].indexOf('const raw =') >= 0) {
    console.log('\nLine', i + 1, ':', lines[i]);
    console.log('Line', i + 2, ':', lines[i+1]);
    console.log('Line', i + 3, ':', lines[i+2]);
    console.log('Line', i + 4, ':', lines[i+3]);
    console.log('Line', i + 5, ':', lines[i+4]);
    console.log('Line', i + 6, ':', lines[i+5]);
    console.log('Line', i + 7, ':', lines[i+6]);
    console.log('Line', i + 8, ':', lines[i+7]);
    break;
  }
}

// Proviamo a costruire il marker con esatte linee prelevate
console.log('\nProviamo match su linea per linea:');
const targetLineIdx = lines.findIndex(l => l.indexOf('const raw =') > 0);
if (targetLineIdx >= 0) {
  const mymarker = lines[targetLineIdx] + '\n' + lines[targetLineIdx + 1];
  console.log('Il mio marker personalizzato:', JSON.stringify(mymarker));
  console.log('indexOf di questo marker:', content.indexOf(mymarker));
}
