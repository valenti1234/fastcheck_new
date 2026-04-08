import fs from 'fs';
import csv from 'csv-parser';

console.log('Testing CSV parser...');

const results = [];
fs.createReadStream('/root/duxiter/test_environmental_sanctions.csv', { encoding: 'utf8' })
  .pipe(csv({ separator: ';' }))
  .on('data', (data) => {
    console.log('Row data:', data);
    console.log('Row keys:', Object.keys(data));
    results.push(data);
    if (results.length >= 2) {
      process.exit(0); // Exit after processing 2 rows
    }
  })
  .on('end', () => {
    console.log('CSV reading completed. Total rows:', results.length);
  })
  .on('error', (error) => {
    console.error('CSV reading error:', error);
  });