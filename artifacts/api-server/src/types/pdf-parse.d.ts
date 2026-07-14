declare module "pdf-parse" {
  interface PdfData {
    text: string;
    numpages: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
  }
  function pdfParse(dataBuffer: Buffer, options?: Record<string, unknown>): Promise<PdfData>;
  export = pdfParse;
}
