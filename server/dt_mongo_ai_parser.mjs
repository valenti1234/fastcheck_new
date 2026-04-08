import fs from 'fs/promises';
import path from 'path';
import { MongoClient } from 'mongodb';
import OpenAI from 'openai';
import pdfjs from 'pdfjs-dist/legacy/build/pdf.js';
import { createRequire } from 'module';
import 'dotenv/config';

// PDF.js setup
const require = createRequire(import.meta.url);
const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
const { getDocument, GlobalWorkerOptions } = pdfjs;
GlobalWorkerOptions.workerSrc = workerPath;

const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'dux2';
const COLLECTION_NAME = 'dt_cases';
const reportsDir = "/root/duxhub/duxiter/server/downloads/dt_reports";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function extractTextFromPDF(filePath) {
  const data = new Uint8Array(await fs.readFile(filePath)); // Prevent Buffer deprecation
  const pdf = await getDocument({ data }).promise;
  let text = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(item => item.str);
    text += strings.join(' ') + '\n';
  }

  return text;
}

// Funzione per pulire il RUT rimuovendo i punti e mantenendo il trattino
function cleanRUT(rut) {
  if (!rut) return rut;
  // Rimuove tutti i punti ma mantiene il trattino
  return rut.replace(/\./g, '');
}

function parseAntiUnionCases(text) {
  const cases = [];
  const blocks = text.replace(/\s+/g, ' ').trim().split(/(?=\d{2}\.\d{3}\.\d{3}-[\dkK])/g);

  for (const block of blocks) {
    const rutMatch = block.match(/^(\d{2}\.\d{3}\.\d{3}-[\dkK])/);
    if (!rutMatch) continue;
    const rut = cleanRUT(rutMatch[1]); // Pulisce il RUT rimuovendo i punti

    let rit = 'UNKNOWN';
    const ritMatch = block.match(/(S-\d{1,4}|T-\d{1,4})/);
    if (ritMatch) rit = ritMatch[1];
    else {
      const altRitMatch = block.match(/\/(\d{2,6}-\d{2,4})/);
      if (altRitMatch) rit = altRitMatch[1];
    }

    const tribunalMatch = block.match(/(JLT[^0-9]+|J\.L\.T[^0-9]+|Juzgado de Letras[^0-9]+|J\.L\.T de [^\d]+)/i);
    const dateMatch = block.match(/(\d{2}-\d{2}-\d{4}|\d{2}\.\d{2}\.\d{4})/);
    const fineMatch = block.match(/(\d+\s*UTM|S\/M|RESERVADA)/);

    let companyName = 'UNKNOWN';
    if (ritMatch && rutMatch) {
      const start = rutMatch.index + rut.length;
      const end = ritMatch.index;
      companyName = block.substring(start, end).trim();
    }

    if (companyName === 'UNKNOWN') {
      const nameMatch = block.match(/\d{1,2}\.\s+([A-ZÁÉÍÓÚÑ0-9][^/]{3,})\s*(?:\/[^:]+)?\s+R\.?U\.?T\.?:/i);
      if (nameMatch) {
        companyName = nameMatch[1].trim();
      } else {
        const altMatch = block.match(/(?:\d+\s*UTM|RESERVADA)[^\d]{0,50}([A-ZÁÉÍÓÚÑ\s]{5,})\s+R\.?U\.?T\.?:/i);
        if (altMatch) {
          companyName = altMatch[1].trim();
        }
      }
    }

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

    if (companyName === 'UNKNOWN') {
      cases.push({ __raw: block.trim() });
    } else {
      cases.push({
        rut,
        companyName,
        rit,
        tribunal: tribunalMatch ? tribunalMatch[0].trim() : 'UNKNOWN',
        date: dateMatch ? dateMatch[1].replace(/\./g, '-') : 'UNKNOWN',
        description,
        complaintType,
        fineAmount: fineMatch ? fineMatch[1] : 'UNKNOWN'
      });
    }
  }

  return cases;
}

async function retryWithAI(text) {
  const prompt = `Extract the following fields in strict JSON format. Only output valid JSON. Do not include any explanation:

{
  "rut": string,
  "companyName": string,
  "rit": string,
  "tribunal": string,
  "date": string,
  "fineAmount": string,
  "description": string,
  "complaintType": string
}

Text:
"""
${text}
"""`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2
    });

    const reply = completion.choices[0].message.content;
    const jsonStart = reply.indexOf('{');
    const jsonEnd = reply.lastIndexOf('}');

    if (jsonStart !== -1 && jsonEnd !== -1) {
      const json = reply.slice(jsonStart, jsonEnd + 1);
      return JSON.parse(json);
    }

    return JSON.parse(reply); // fallback
  } catch (err) {
    console.error("❌ AI Parse failed:", err.message);
    return null;
  }
}

(async () => {
  const mongo = new MongoClient(MONGO_URI);

  try {
    await mongo.connect();
    const db = mongo.db(DB_NAME);
    const col = db.collection(COLLECTION_NAME);

    const files = await fs.readdir(reportsDir);
    const pdfFiles = files.filter(f => f.endsWith('.pdf'));

    for (const file of pdfFiles) {
      const filePath = path.join(reportsDir, file);
      const rawText = await extractTextFromPDF(filePath);
      const parsedCases = parseAntiUnionCases(rawText);
      let upserted = 0;

      for (let caseData of parsedCases) {
        if (caseData.__raw) {
          const aiParsed = await retryWithAI(caseData.__raw);
          if (!aiParsed) continue;
          caseData = aiParsed;
        }

        caseData.source_pdf = file;

        const filter = caseData.rit && caseData.rit !== 'UNKNOWN'
          ? { rut: caseData.rut, rit: caseData.rit }
          : { rut: caseData.rut, date: caseData.date, tribunal: caseData.tribunal };

        if (!filter.rut || !filter.date || !filter.tribunal) continue;

        const result = await col.updateOne(filter, { $set: caseData }, { upsert: true });
        if (result.upsertedCount || result.modifiedCount) upserted++;
      }

      console.log(`✅ Processed ${parsedCases.length} cases from ${file}, upserted ${upserted}`);
    }

    console.log("✅ All PDF cases parsed and inserted/updated.");
  } catch (err) {
    console.error("❌ Fatal Error:", err);
  } finally {
    await mongo.close();
  }
})();
