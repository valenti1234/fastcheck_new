import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { LogService } from './logService';
// Removed pdf-parse import - will use pdfjs-dist dynamically when needed
import { MongoClient } from 'mongodb';

// Use process.cwd() for cross-compatibility (ESM, Jest)
const SERVER_ROOT = process.cwd();

// MongoDB configuration
const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'dux2';
const COLLECTION_NAME = 'dt_cases';

interface PDFLink {
  href: string | undefined;
  text: string;
}

interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creationDate?: string;
  modificationDate?: string;
}

interface PDFInfo {
  filename: string;
  isTextBased: boolean;
  textContent?: string;
  pageCount?: number;
  metadata?: PDFMetadata;
}

interface AntiUnionCase {
  rut: string;
  companyName: string;
  rit: string;
  tribunal: string;
  date: string;
  description: string;
  complaintType: string;
  fineAmount: string;
  source_pdf?: string;
}

interface DTCasesResponse {
  success: boolean;
  message: string;
  cases?: AntiUnionCase[];
  total?: number;
  page?: number;
  limit?: number;
}

export class ScraperService {
  private static readonly BASE_URL = 'https://www.dt.gob.cl/portal/1626';
  private static readonly ARTICLE_URL = `${ScraperService.BASE_URL}/w3-article-94445.html`;
  private static readonly DOWNLOAD_DIR = path.join(SERVER_ROOT, 'downloads/dt_reports');
  private static readonly MIN_TEXT_LENGTH = 100; // Minimum text length to consider a PDF as text-based

  private static async analyzePDF(filepath: string): Promise<PDFInfo> {
    try {
      const dataBuffer = await fs.readFile(filepath);
      
      try {
        // Import pdfjs-dist dynamically
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
        
        // Load the PDF document
        const loadingTask = pdfjsLib.getDocument({ data: dataBuffer });
        const pdfDocument = await loadingTask.promise;
        
        let extractedText = '';
        
        // Extract text from all pages
        for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
          const page = await pdfDocument.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join(' ');
          extractedText += pageText + '\n\n';
        }

        // Clean and normalize extracted text
        const cleanText = extractedText
          .replace(/\s+/g, ' ')
          .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
          .replace(/(\w)-\s+(\w)/g, '$1$2')
          .trim();
        
        const isTextBased = cleanText.length > ScraperService.MIN_TEXT_LENGTH && 
                          /[a-zA-Z]/.test(cleanText) && 
                          cleanText.split(/\s+/).length > 20;
        
        // Get metadata from PDF document
         const metadata: PDFMetadata = {};
         try {
           const pdfMetadata = await pdfDocument.getMetadata();
           if (pdfMetadata.info) {
             const info = pdfMetadata.info as any;
             metadata.title = typeof info.Title === 'string' ? info.Title.trim() : undefined;
             metadata.author = typeof info.Author === 'string' ? info.Author.trim() : undefined;
             metadata.subject = typeof info.Subject === 'string' ? info.Subject.trim() : undefined;
             metadata.keywords = typeof info.Keywords === 'string' ? info.Keywords.trim() : undefined;
             metadata.creationDate = typeof info.CreationDate === 'string' ? info.CreationDate : undefined;
             metadata.modificationDate = typeof info.ModDate === 'string' ? info.ModDate : undefined;
           }
         } catch (metadataError) {
           console.warn('Could not extract PDF metadata:', metadataError);
         }

        const hasMetadata = Object.values(metadata).some(value => value !== undefined && value !== '');

        console.log(`PDF Analysis for ${path.basename(filepath)}:`, {
          isTextBased,
          textLength: cleanText.length,
          wordCount: cleanText.split(/\s+/).length,
          hasLetters: /[a-zA-Z]/.test(cleanText),
          pageCount: pdfDocument.numPages,
          rawText: cleanText.substring(0, 100) + '...'
        });

        return {
          filename: path.basename(filepath),
          isTextBased,
          textContent: cleanText,
          pageCount: pdfDocument.numPages,
          metadata: hasMetadata ? metadata : undefined
        };
      } catch (parseError) {
        console.error('Error parsing PDF:', parseError);
        return {
          filename: path.basename(filepath),
          isTextBased: false,
          pageCount: undefined
        };
      }
    } catch (error) {
      console.error('Error reading PDF file:', error);
      return {
        filename: path.basename(filepath),
        isTextBased: false
      };
    }
  }

  // Funzione per pulire il RUT rimuovendo i punti e mantenendo il trattino
  private static cleanRUT(rut: string): string {
    if (!rut) return rut;
    // Rimuove tutti i punti ma mantiene il trattino
    return rut.replace(/\./g, '');
  }

  private static parseAntiUnionCases(text: string): AntiUnionCase[] {
    const cases: AntiUnionCase[] = [];
    const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Split by RUT pattern, but also include numbered cases
    const blocks = cleanText.split(/(?=\d{1,2}\.-?\s*|(?:\d{2}\.){2}\d{3}-[\dkK])/g);

    for (const block of blocks) {
      // Skip empty blocks
      if (!block.trim()) continue;

      // Try to find RUT in the block
      const rutMatch = block.match(/(\d{2}\.\d{3}\.\d{3}-[\dkK])/);
      if (!rutMatch) {
        console.log("No RUT found in block:", block);
        continue;
      }
      const rut = ScraperService.cleanRUT(rutMatch[1]); // Pulisce il RUT rimuovendo i punti

      // More flexible tribunal pattern
      const tribunalMatch = block.match(/(\d{1,2}(?:er|do|ro|to|º)?\s*JLT[^0-9]+|J\.L\.T[^0-9]+|Juzgado\s+de\s+Letras[^0-9]+|J\.L\.T\s+de\s+[^\d]+|\b(?:JLT|JL)\s+[A-ZÁÉÍÓÚÑ][^\d]+)/i);
      
      // More flexible RIT/case number pattern
      const ritMatch = block.match(/(?:RIT\s*)?(?:T-\d{1,4}|S-\d{1,4}|O-\d{1,4}|\d{3,5}-\d{4})/i);
      
      // More flexible date pattern
      const dateMatch = block.match(/(\d{2}[-\.]\d{2}[-\.]\d{4})/);
      
      // More flexible fine amount pattern
      const fineMatch = block.match(/(\d+\s*UTM|S\/M|RESERVADA|SIN\s+MULTA)/i);

      // Extract company name: look between RUT and tribunal/RIT
      let companyName = 'UNKNOWN';
      if (rutMatch.index !== undefined) {
        const afterRut = block.substring(rutMatch.index + rut.length);
        const nextMarker = afterRut.match(/(?:\d{1,2}(?:er|do|ro|to|º)?\s*JLT|RIT|T-\d|S-\d|\d{3,5}-\d{4})/i);
        if (nextMarker && nextMarker.index !== undefined) {
          companyName = afterRut.substring(0, nextMarker.index).trim();
        }
      }

      // Extract description: everything between date and fine amount or end
      let description = 'UNKNOWN';
      if (dateMatch) {
        const afterDate = block.substring(block.indexOf(dateMatch[0]) + dateMatch[0].length);
        const beforeFine = fineMatch 
          ? afterDate.substring(0, afterDate.indexOf(fineMatch[0]))
          : afterDate;
        description = beforeFine.trim();
      }

      // Extract complaint type from description
      let complaintType = 'PARTICULAR'; // Default type
      const complaintTypes = ['PARTICULAR', 'DT', 'RESERVADA'];
      for (const type of complaintTypes) {
        if (description.toUpperCase().includes(type)) {
          complaintType = type;
          description = description.replace(new RegExp(type, 'i'), '').trim();
          break;
        }
      }

      // Clean up description
      description = description
        .replace(/^\W+|\W+$/g, '') // Remove leading/trailing non-word chars
        .replace(/\s{2,}/g, ' ') // Normalize spaces
        .trim();

      // Log parsing results for debugging
      console.log("Parsing block:", {
        rut,
        companyName,
        rit: ritMatch?.length ? ritMatch[0] : 'UNKNOWN',
        tribunal: tribunalMatch?.length ? tribunalMatch[0] : 'UNKNOWN',
        date: dateMatch?.length ? dateMatch[0] : 'UNKNOWN',
        fineAmount: fineMatch?.length ? fineMatch[0] : 'UNKNOWN',
        description,
        complaintType
      });

      cases.push({
        rut,
        companyName,
        rit: ritMatch ? ritMatch[0] : 'UNKNOWN',
        tribunal: tribunalMatch ? tribunalMatch[0].trim() : 'UNKNOWN',
        date: dateMatch ? dateMatch[1] : 'UNKNOWN',
        description,
        complaintType,
        fineAmount: fineMatch ? fineMatch[0] : 'UNKNOWN'
      });
    }

    return cases;
  }

  static async getDownloadedFiles(): Promise<PDFInfo[]> {
    try {
      const files = await fs.readdir(ScraperService.DOWNLOAD_DIR);
      const pdfFiles = files.filter(file => 
        file.endsWith('.pdf') && 
        file.toLowerCase().includes('semestre')
      );
      
      const pdfInfos = await Promise.all(
        pdfFiles.map(file => 
          ScraperService.analyzePDF(path.join(ScraperService.DOWNLOAD_DIR, file))
        )
      );
      
      return pdfInfos;
    } catch (error) {
      console.error('Error reading downloaded files:', error);
      return [];
    }
  }

  static async analyzeAllPDFs(): Promise<{
    success: boolean;
    message: string;
    analyzedFiles?: PDFInfo[];
    antiUnionCases?: AntiUnionCase[];
  }> {
    try {
      try {
        await fs.access(ScraperService.DOWNLOAD_DIR);
      } catch (error) {
        return {
          success: false,
          message: 'Download directory does not exist'
        };
      }

      const files = await fs.readdir(ScraperService.DOWNLOAD_DIR);
      const pdfFiles = files.filter(file => file.endsWith('.pdf'));

      if (pdfFiles.length === 0) {
        return {
          success: false,
          message: 'No PDF files found in download directory'
        };
      }

      const analyzedFiles: PDFInfo[] = [];
      const allCases: AntiUnionCase[] = [];

      for (const file of pdfFiles) {
        const filepath = path.join(ScraperService.DOWNLOAD_DIR, file);
        try {
          const pdfInfo = await ScraperService.analyzePDF(filepath);
          analyzedFiles.push(pdfInfo);

          if (pdfInfo.isTextBased && pdfInfo.textContent) {
            const cases = ScraperService.parseAntiUnionCases(pdfInfo.textContent);
            allCases.push(...cases);
          }
        } catch (error) {
          console.error(`Error analyzing PDF ${file}:`, error);
        }
      }

      return {
        success: true,
        message: `Successfully analyzed ${analyzedFiles.length} PDF files`,
        analyzedFiles,
        antiUnionCases: allCases
      };
    } catch (error) {
      console.error('Error analyzing PDFs:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to analyze PDFs'
      };
    }
  }

  static async getDTCases(page: number = 1, limit: number = 10, filters: Partial<AntiUnionCase> = {}): Promise<DTCasesResponse> {
    try {
      const mongo = new MongoClient(MONGO_URI);
      await mongo.connect();
      
      const db = mongo.db(DB_NAME);
      const col = db.collection(COLLECTION_NAME);

      // Build query based on filters
      const query: any = {};
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== '') {
          if (typeof value === 'string') {
            // Case-insensitive search for string fields
            query[key] = { $regex: value, $options: 'i' };
          } else {
            query[key] = value;
          }
        }
      });

      // Get total count for pagination
      const total = await col.countDocuments(query);

      // Get paginated results with type assertion
      const cases = await col
        .find(query)
        .sort({ date: -1 }) // Sort by date descending
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray() as unknown as AntiUnionCase[];

      await mongo.close();

      return {
        success: true,
        message: `Successfully retrieved ${cases.length} cases`,
        cases,
        total,
        page,
        limit
      };
    } catch (error) {
      console.error('Error getting DT cases:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get DT cases'
      };
    }
  }
}