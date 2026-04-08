const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const pdf = require('pdf-parse');
const { MongoClient } = require('mongodb');

const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'dux2';
const COLLECTION_NAME = 'dt_cases';

function extractCompanyName(block, rutMatch, ritMatch) {
  let companyName = 'UNKNOWN';

  // Strategy 1: Between RUT and RIT
  if (rutMatch && ritMatch && typeof rutMatch.index !== 'undefined' && typeof ritMatch.index !== 'undefined') {
    const start = rutMatch.index + rutMatch[0].length;
    const end = ritMatch.index;
    const candidate = block.substring(start, end).trim();
    if (candidate.length >= 3) return candidate;
  }

  // Strategy 2: Pattern like "27.- COMPANY NAME RUT:"
  const nameMatch = block.match(/\b\d{1,2}[\.\-]\s*([A-ZÁÉÍÓÚÑ0-9][^/:]{3,})\s*(?:\/[^:]+)?\s+R\.?U\.?T\.?:/i);
  if (nameMatch && nameMatch[1].length >= 3) return nameMatch[1].trim();

  // Strategy 3: After fine match, before RUT
  const altMatch = block.match(/(?:\d+\s*UTM|RESERVADA)[^\d]{0,50}([A-ZÁÉÍÓÚÑ\s]{5,})\s+R\.?U\.?T\.?:/i);
  if (altMatch && altMatch[1].length >= 3) return altMatch[1].trim();

  // Strategy 4: Loose match before RUT
  const looseMatch = block.match(/([A-ZÁÉÍÓÚÑ0-9\.\s]{10,})\s+R\.?U\.?T\.?:/i);
  if (looseMatch && looseMatch[1].length >= 5) return looseMatch[1].trim();

  // Strategy 5: Government/public official or individual name
  const govNameMatch = block.match(/([A-ZÁÉÍÓÚÑ\s]{5,})\s+(ABOGADO|DIRECTOR(?:A)?)/i);
  if (govNameMatch && govNameMatch[1].length >= 5) return govNameMatch[1].trim();

  return companyName;
}

// Funzione per pulire il RUT rimuovendo i punti e mantenendo il trattino
function cleanRUT(rut) {
  if (!rut) return rut;
  // Rimuove tutti i punti ma mantiene il trattino
  return rut.replace(/\./g, '');
}

async function parseAntiUnionCases(text, col, source_pdf) {
  let processedCount = 0;
  let upsertedCount = 0;
  const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  const blocks = cleanText.split(/(?=\d{2}\.\d{3}\.\d{3}-[\dkK])/g); // split on each new RUT

  for (const block of blocks) {
    const rutMatch = block.match(/^(\d{2}\.\d{3}\.\d{3}-[\dkK])/);
    if (!rutMatch) continue;
    const rut = cleanRUT(rutMatch[1]); // Pulisce il RUT rimuovendo i punti

    // Match RIT
    let rit = 'UNKNOWN';
    const ritMatch = block.match(/(S-\d{1,4}|T-\d{1,4})/);
    if (ritMatch) {
      rit = ritMatch[1];
    } else {
      const altRitMatch = block.match(/\/(\d{2,6}-\d{2,4})/); // e.g. "/5932-06"
      if (altRitMatch) rit = altRitMatch[1];
    }

    const tribunalMatch = block.match(/(JLT[^0-9]+|J\.L\.T[^0-9]+|Juzgado de Letras[^0-9]+|J\.L\.T de [^\d]+)/i);
    const dateMatch = block.match(/(\d{2}-\d{2}-\d{4}|\d{2}\.\d{2}\.\d{4})/);
    const fineMatch = block.match(/(\d+\s*UTM|S\/M|RESERVADA)/);

    let companyName = extractCompanyName(block, rutMatch, ritMatch);

    let description = 'UNKNOWN';
    if (dateMatch) {
      const descStart = dateMatch.index + dateMatch[0].length;
      const descEnd = fineMatch?.index || block.length;
      description = block.substring(descStart, descEnd).trim();
    }

    let complaintType = 'UNKNOWN';
    const complaintMatchFinal = description.match(/\b(PARTICULAR|DT|RESERVADA)\b$/);
    if (complaintMatchFinal) {
      complaintType = complaintMatchFinal[1];
      description = description.replace(/\b(PARTICULAR|DT|RESERVADA)\b$/, '').trim();
    }
    
    // Map 'Dirección del Trabajo' to 'DT'
    if (block.includes('Dirección del Trabajo') || description.includes('Dirección del Trabajo')) {
      complaintType = 'DT';
    }

    // Allow fallback for known public official/office mentions
    if (companyName === 'UNKNOWN') {
      if (block.includes('DIRECTORA DEL TRABAJO') || block.includes('ABOGADO') || block.includes('ABOGADA')) {
        companyName = 'Dirección del Trabajo / Funcionario Público';
      } else {
        console.log('⚠️ Unparsed case (skipped DB insert):', block.slice(0, 300));
        continue;
      }
    }
    processedCount++;

    const item = {
      rut,
      companyName,
      rit,
      tribunal: tribunalMatch ? tribunalMatch[0].trim() : 'UNKNOWN',
      date: dateMatch ? dateMatch[1].replace(/\./g, '-') : 'UNKNOWN',
      description,
      complaintType,
      fineAmount: fineMatch ? fineMatch[1] : 'UNKNOWN',
      source_pdf
    };

    let filter = {};
    if (item.rit && item.rit !== 'UNKNOWN') {
      filter = { rut: item.rut, rit: item.rit };
      // Check for primary keys for the first filter type (RUT, RIT)
      if (!filter.rut || !filter.rit || filter.rit === 'UNKNOWN') {
         console.log('⚠️ Skipped DB insert due to missing/invalid key fields (RUT or RIT):', item);
         continue;
      }
    } else {
      filter = { rut: item.rut, date: item.date, tribunal: item.tribunal };
      // Check for primary keys for the second filter type
      if (!filter.rut || !filter.date || !filter.tribunal || filter.date === 'UNKNOWN' || filter.tribunal === 'UNKNOWN') {
        console.log('⚠️ Skipped DB insert due to missing/invalid key fields (RUT, Date, or Tribunal):', item);
        continue;
      }
    }

    try {
      const result = await col.updateOne(
        filter,
        { $set: item },
        { upsert: true }
      );
      if (result.upsertedCount || result.modifiedCount) {
        upsertedCount++;
        // console.log(`Upserted/Modified: ${item.rut} - ${item.rit || item.date}`);
      }
    } catch (dbError) {
        console.error(`❌ Error upserting item ${item.rut} from ${source_pdf}:`, dbError);
        console.error("Item details:", item);
    }
  }

  return { processedCount, upsertedCount };
}

const reportsDir = "/root/duxhub/duxiter/server/downloads/dt_reports";

(async () => {
  const mongo = new MongoClient(MONGO_URI);

  try {
    await mongo.connect();
    const db = mongo.db(DB_NAME);
    const col = db.collection(COLLECTION_NAME);

    const files = await fsPromises.readdir(reportsDir);
    const pdfFiles = files.filter(f => f.endsWith('.pdf'));

    if (pdfFiles.length === 0) {
      console.log("❌ No PDF files found.");
      return;
    }

    for (const file of pdfFiles) {
      const filePath = path.join(reportsDir, file);
      console.log(`\n📄 Processing ${file}...`);
      try {
        const buffer = await fsPromises.readFile(filePath);
        const data = await pdf(buffer);
        const { processedCount, upsertedCount } = await parseAntiUnionCases(data.text, col, file);
        console.log(`✅ Finished ${file}: ${processedCount} cases processed, ${upsertedCount} upserted/modified.`);
      } catch (pdfError) {
        console.error(`❌ Error processing PDF file ${file}:`, pdfError);
      }
    }

    console.log("\n✅ All PDF files processed.");
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await mongo.close();
  }
})();
