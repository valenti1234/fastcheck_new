declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PDFOptions {
    version?: string;
    max?: number;
    pagerender?: (pageData: any) => string;
  }

  interface PDFData {
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    text: string;
    version: string;
  }

  function PDFParse(dataBuffer: Buffer, options?: PDFOptions): Promise<PDFData>;
  export default PDFParse;
} 