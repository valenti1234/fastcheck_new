const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'src/pages/FastCheckEX.tsx');
const content = fs.readFileSync(filePath, 'utf8');

const marker = '    const raw =\n      cleanedData?.sheriffLogData?.filteredDetails?.dequinesRelationships ||';
console.log('Marker length:', marker.length);
console.log('Marker hex first 30 chars:', Buffer.from(marker.substring(0, 30)).toString('hex'));

const pos = content.indexOf(marker);
console.log('indexOf marker:', pos);

if (pos < 0) {
  // Cerca la posizione di "const raw =" e poi i prossimi 200 char in hex per confrontare!
  const rawPos = content.indexOf('const raw =');
  console.log('\nRaw pos:', rawPos);
  if (rawPos >= 0) {
    const substring = content.substring(rawPos - 4, rawPos + 150);
    console.log('Raw context (rawPos-4 ... +150) chars:', substring.length);
    console.log('In HEX confrontabile:', Buffer.from(substring).toString('hex'));
    console.log('\n--- As string:');
    console.log(substring);
    console.log('\n--- Marker in hex:', Buffer.from(marker).toString('hex'));
  }
}
