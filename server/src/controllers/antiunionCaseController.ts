import { Request, Response } from 'express';
import { AntiunionCase, IAntiunionCase } from '../models/AntiunionCase';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import OpenAI from 'openai';

// Interfaccia per il file upload
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configurazione multer per l'upload dei PDF
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'antiunion-pdfs');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `antiunion-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Solo i file PDF sono consentiti'));
  }
};

export const upload = multer({ 
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Funzione per pulire il RUT rimuovendo i punti e mantenendo il trattino
const cleanRUT = (rut: string): string => {
  if (!rut) return rut;
  // Rimuove tutti i punti ma mantiene il trattino
  return rut.replace(/\./g, '');
};

// Funzione per estrarre dati dal PDF usando AI
const extractDataFromPDF = async (pdfBuffer: Buffer): Promise<Partial<IAntiunionCase>[]> => {
  try {
    // Import pdfjs-dist dynamically
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
    
    // Convert Buffer to Uint8Array for pdfjs-dist
    const uint8Array = new Uint8Array(pdfBuffer);
    
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdfDocument = await loadingTask.promise;
    
    let text = '';
    
    // Extract text from all pages
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      text += pageText + '\n';
    }

    const prompt = `
Analizza il seguente testo estratto da un PDF contenente informazioni su aziende condannate per pratiche antisindicali.
Estrai le seguenti informazioni per ogni caso trovato e restituisci un array JSON:

- rut: RUT dell'azienda (formato: XX.XXX.XXX-X)
- companyName: Nome/Ragione sociale dell'azienda
- rit: Numero RIT del caso
- tribunal: Nome del tribunale
- date: Data della sentenza (formato ISO: YYYY-MM-DD)
- description: Descrizione della violazione/pratica antisindacale
- complaintType: Tipo di denuncia (DT, PARTICULAR, o UNKNOWN)
- fineAmount: Importo della multa (es: "100 UTM", "S/M" se non specificato)

Testo del PDF:
${text}

Rispondi SOLO con un array JSON valido, senza testo aggiuntivo:`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 2000
    });

    const aiResponse = completion.choices[0]?.message?.content || '';

    try {
      const extractedData = JSON.parse(aiResponse);
      return Array.isArray(extractedData) ? extractedData : [extractedData];
    } catch (parseError) {
      console.error('Errore nel parsing della risposta AI:', parseError);
      return [];
    }
  } catch (error) {
    console.error('Errore nell\'estrazione dati dal PDF:', error);
    throw new Error('Impossibile estrarre dati dal PDF');
  }
};

// Nuovo endpoint per Server-Sent Events
export const uploadPDFWithProgress = async (req: MulterRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Nessun file PDF caricato'
      });
    }

    // Configura SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    const sendProgress = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Invia progresso iniziale
      sendProgress({ stage: 'reading', progress: 10, message: 'Lettura del file PDF...' });
      
      // Leggi il file PDF
      const pdfBuffer = fs.readFileSync(req.file.path);
      
      sendProgress({ stage: 'extracting', progress: 30, message: 'Estrazione dati dal PDF...' });
      
      // Estrai i dati dal PDF
      const extractedData = await extractDataFromPDF(pdfBuffer);
      
      if (!extractedData || extractedData.length === 0) {
        sendProgress({ stage: 'error', progress: 0, message: 'Nessun dato valido estratto dal PDF' });
        res.end();
        return;
      }

      sendProgress({ stage: 'processing', progress: 50, message: `Elaborazione di ${extractedData.length} record...` });

      // Funzione per mappare il complaintType ai valori enum corretti
      const mapComplaintType = (type: string): 'DT' | 'PARTICULAR' | 'UNKNOWN' => {
        if (!type) return 'UNKNOWN';
        const normalizedType = type.toLowerCase().trim();
        
        if (normalizedType.includes('dirección del trabajo') || 
            normalizedType.includes('direccion del trabajo') ||
            normalizedType.includes('dt') ||
            normalizedType === 'dt') {
          return 'DT';
        }
        
        if (normalizedType.includes('particular') ||
            normalizedType.includes('privado') ||
            normalizedType.includes('trabajador')) {
          return 'PARTICULAR';
        }
        
        return 'UNKNOWN';
      };

      // Salva i dati estratti nel database evitando duplicati
      const savedCases = [];
      const skippedCases = [];
      const totalRecords = extractedData.length;
      
      for (let i = 0; i < extractedData.length; i++) {
        const caseData = extractedData[i];
        const cleanedRUT = cleanRUT(caseData.rut || '');
        
        // Calcola progresso (da 50% a 90%)
        const progress = 50 + Math.round((i / totalRecords) * 40);
        sendProgress({ 
          stage: 'saving', 
          progress, 
          message: `Elaborazione record ${i + 1} di ${totalRecords}...`,
          current: i + 1,
          total: totalRecords
        });
        
        // Controlla se esiste già un caso con lo stesso RUT e RIT
        const existingCase = await AntiunionCase.findOne({
          rut: cleanedRUT,
          rit: caseData.rit
        });
        
        if (existingCase) {
          skippedCases.push({
            rut: cleanedRUT,
            rit: caseData.rit,
            companyName: caseData.companyName,
            reason: 'Duplicato esistente'
          });
          continue;
        }
        
        const mappedData = {
          ...caseData,
          rut: cleanedRUT,
          complaintType: mapComplaintType(caseData.complaintType as string),
          pdfFileName: req.file.originalname,
          pdfPath: req.file.path,
          uploadedBy: req.user?.email || 'unknown'
        };
        
        const newCase = new AntiunionCase(mappedData);
        const savedCase = await newCase.save();
        savedCases.push(savedCase);
      }

      const totalExtracted = savedCases.length + skippedCases.length;
      let message = `${savedCases.length} casi salvati con successo`;
      
      if (skippedCases.length > 0) {
        message += `, ${skippedCases.length} duplicati saltati`;
      }
      
      // Invia risultato finale
      sendProgress({ 
        stage: 'completed', 
        progress: 100, 
        message: message,
        result: {
          success: true,
          data: savedCases,
          skipped: skippedCases,
          summary: {
            total: totalExtracted,
            saved: savedCases.length,
            skipped: skippedCases.length
          }
        }
      });
      
    } catch (error) {
      console.error('Errore nell\'elaborazione:', error);
      sendProgress({ 
        stage: 'error', 
        progress: 0, 
        message: 'Errore durante l\'elaborazione',
        error: error instanceof Error ? error.message : 'Errore sconosciuto'
      });
    }
    
    res.end();
    
  } catch (error) {
    console.error('Errore nell\'upload PDF:', error);
    return res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
};

// Mantieni il vecchio endpoint per compatibilità
export const uploadPDF = async (req: MulterRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Nessun file PDF caricato'
      });
    }

    const pdfBuffer = fs.readFileSync(req.file.path);
    const extractedData = await extractDataFromPDF(pdfBuffer);

    if (extractedData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nessun dato valido estratto dal PDF'
      });
    }

    // Funzione per mappare il complaintType ai valori enum corretti
    const mapComplaintType = (type: string): 'DT' | 'PARTICULAR' | 'UNKNOWN' => {
      if (!type) return 'UNKNOWN';
      const normalizedType = type.toLowerCase().trim();
      
      if (normalizedType.includes('dirección del trabajo') || 
          normalizedType.includes('direccion del trabajo') ||
          normalizedType.includes('dt') ||
          normalizedType === 'dt') {
        return 'DT';
      }
      
      if (normalizedType.includes('particular') ||
          normalizedType.includes('privado') ||
          normalizedType.includes('trabajador')) {
        return 'PARTICULAR';
      }
      
      return 'UNKNOWN';
    };

    // Salva i dati estratti nel database evitando duplicati
    const savedCases = [];
    const skippedCases = [];
    
    for (const caseData of extractedData) {
      const cleanedRUT = cleanRUT(caseData.rut || '');
      
      // Controlla se esiste già un caso con lo stesso RUT e RIT
      const existingCase = await AntiunionCase.findOne({
        rut: cleanedRUT,
        rit: caseData.rit
      });
      
      if (existingCase) {
        skippedCases.push({
          rut: cleanedRUT,
          rit: caseData.rit,
          companyName: caseData.companyName,
          reason: 'Duplicato esistente'
        });
        continue;
      }
      
      const mappedData = {
        ...caseData,
        rut: cleanedRUT,
        complaintType: mapComplaintType(caseData.complaintType as string),
        pdfFileName: req.file.originalname,
        pdfPath: req.file.path,
        uploadedBy: req.user?.email || 'unknown'
      };
      
      const newCase = new AntiunionCase(mappedData);
      const savedCase = await newCase.save();
      savedCases.push(savedCase);
    }

    const totalExtracted = savedCases.length + skippedCases.length;
    let message = `${savedCases.length} casi salvati con successo`;
    
    if (skippedCases.length > 0) {
      message += `, ${skippedCases.length} duplicati saltati`;
    }
    
    return res.status(201).json({
      success: true,
      message: message,
      data: savedCases,
      skipped: skippedCases,
      summary: {
        total: totalExtracted,
        saved: savedCases.length,
        skipped: skippedCases.length
      }
    });
  } catch (error) {
    console.error('Errore nell\'upload PDF:', error);
    return res.status(500).json({
      success: false,
      message: 'Errore interno del server',
      error: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
};

// Get all antiunion cases
export const getAllAntiunionCases = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const query: any = {};
    
    // Filtri opzionali
    if (req.query.rut) {
      const cleanedRut = cleanRUT(req.query.rut as string);
      query.rut = { $regex: cleanedRut.replace(/[-]/g, ''), $options: 'i' };
    }
    if (req.query.companyName) {
      query.companyName = { $regex: req.query.companyName, $options: 'i' };
    }
    if (req.query.tribunal) {
      query.tribunal = { $regex: req.query.tribunal, $options: 'i' };
    }
    if (req.query.complaintType) {
      query.complaintType = req.query.complaintType;
    }

    const total = await AntiunionCase.countDocuments(query);
    const cases = await AntiunionCase.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      data: cases,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit
      }
    });
  } catch (error) {
    console.error('Errore nel recupero dei casi:', error);
    return res.status(500).json({
      success: false,
      message: 'Errore interno del server',
      error: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
};

// Get antiunion case by ID
export const getAntiunionCaseById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const antiunionCase = await AntiunionCase.findById(id);

    if (!antiunionCase) {
      return res.status(404).json({
        success: false,
        message: 'Caso non trovato'
      });
    }

    return res.status(200).json({
      success: true,
      data: antiunionCase
    });
  } catch (error) {
    console.error('Errore nel recupero del caso:', error);
    return res.status(500).json({
      success: false,
      message: 'Errore interno del server',
      error: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
};

// Search by RUT
export const getAntiunionCaseByRut = async (req: Request, res: Response) => {
  try {
    const { rut } = req.params;
    const cleanedRut = cleanRUT(rut);
    const cases = await AntiunionCase.find({ 
      rut: { $regex: cleanedRut.replace(/[-]/g, ''), $options: 'i' } 
    }).sort({ date: -1 });

    return res.status(200).json({
      success: true,
      count: cases.length,
      data: cases
    });
  } catch (error) {
    console.error('Errore nella ricerca per RUT:', error);
    return res.status(500).json({
      success: false,
      message: 'Errore interno del server',
      error: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
};

// Create new antiunion case manually
export const createAntiunionCase = async (req: Request, res: Response) => {
  try {
    const newCase = new AntiunionCase({
      ...req.body,
      uploadedBy: req.user?.email || 'unknown'
    });

    const savedCase = await newCase.save();

    return res.status(201).json({
      success: true,
      message: 'Caso creato con successo',
      data: savedCase
    });
  } catch (error) {
    console.error('Errore nella creazione del caso:', error);
    return res.status(500).json({
      success: false,
      message: 'Errore interno del server',
      error: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
};

// Update antiunion case
export const updateAntiunionCase = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updatedCase = await AntiunionCase.findByIdAndUpdate(
      id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!updatedCase) {
      return res.status(404).json({
        success: false,
        message: 'Caso non trovato'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Caso aggiornato con successo',
      data: updatedCase
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento del caso:', error);
    return res.status(500).json({
      success: false,
      message: 'Errore interno del server',
      error: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
};

// Delete antiunion case
export const deleteAntiunionCase = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deletedCase = await AntiunionCase.findByIdAndDelete(id);

    if (!deletedCase) {
      return res.status(404).json({
        success: false,
        message: 'Caso non trovato'
      });
    }

    // Elimina il file PDF se esiste
    if (deletedCase.pdfPath && fs.existsSync(deletedCase.pdfPath)) {
      fs.unlinkSync(deletedCase.pdfPath);
    }

    return res.status(200).json({
      success: true,
      message: 'Caso eliminato con successo'
    });
  } catch (error) {
    console.error('Errore nell\'eliminazione del caso:', error);
    return res.status(500).json({
      success: false,
      message: 'Errore interno del server',
      error: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
};

// Get statistics
export const getAntiunionCaseStats = async (req: Request, res: Response) => {
  try {
    const totalCases = await AntiunionCase.countDocuments();
    const casesByType = await AntiunionCase.aggregate([
      {
        $group: {
          _id: '$complaintType',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const casesByTribunal = await AntiunionCase.aggregate([
      {
        $group: {
          _id: '$tribunal',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const recentCases = await AntiunionCase.find()
      .sort({ date: -1 })
      .limit(5)
      .select('companyName rut date tribunal');

    return res.status(200).json({
      success: true,
      data: {
        totalCases,
        casesByType,
        casesByTribunal,
        recentCases
      }
    });
  } catch (error) {
    console.error('Errore nel recupero delle statistiche:', error);
    return res.status(500).json({
      success: false,
      message: 'Errore interno del server',
      error: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
};