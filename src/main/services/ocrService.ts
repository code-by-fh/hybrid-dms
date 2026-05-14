import { createWorker } from 'tesseract.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * Perform OCR or text extraction on a file.
 *
 * Strategy (in order):
 * 1. For PDFs: try pdfjs text extraction (covers text-based PDFs)
 * 2. For PDFs with no embedded text: render each page to an image via canvas, run Tesseract
 * 3. For image files: run Tesseract directly
 */
export async function performOCR(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    return await processPdf(filePath);
  }

  return await ocrImage(filePath);
}

/**
 * Run Tesseract OCR on an image (path or buffer).
 */
async function ocrImage(imageInput: string | Buffer): Promise<string> {
  console.log(`[OCR] Running Tesseract on image...`);
  // Use German + English as primary languages for common documents
  const worker = await createWorker('deu+eng');
  const { data: { text } } = await worker.recognize(imageInput);
  await worker.terminate();
  console.log(`[OCR] Tesseract extracted ${text.trim().length} chars`);
  return text;
}

/**
 * Process a PDF file:
 * 1. Try pdfjs text extraction first (fast, no rendering needed)
 * 2. Fall back to rendering each page via canvas + Tesseract
 */
async function processPdf(filePath: string): Promise<string> {
  console.log(`[OCR] Processing PDF: ${filePath}`);

  // Dynamically import pdfjs-dist (Electron main process compatible)
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(await fs.readFile(filePath));
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  console.log(`[OCR] PDF loaded: ${pdf.numPages} page(s)`);

  let fullText = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    console.log(`[OCR] Processing page ${pageNum}/${pdf.numPages}...`);
    const page = await pdf.getPage(pageNum);

    // --- Attempt 1: Extract embedded text directly ---
    try {
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ')
        .trim();

      if (pageText.length > 20) {
        console.log(`[OCR] Page ${pageNum}: text extraction OK (${pageText.length} chars)`);
        fullText += pageText + '\n\n';
        continue; // Go to next page — no need to render
      }

      console.log(`[OCR] Page ${pageNum}: text too short (${pageText.length} chars), will render for OCR`);
    } catch (textErr) {
      console.warn(`[OCR] Page ${pageNum}: text extraction failed, will render for OCR`, textErr);
    }

    // --- Attempt 2: Render page to PNG via canvas, run Tesseract ---
    try {
      const imageBuffer = await renderPageToBuffer(page);
      const ocrText = await ocrImage(imageBuffer);
      if (ocrText.trim().length > 0) {
        console.log(`[OCR] Page ${pageNum}: Tesseract OCR extracted ${ocrText.trim().length} chars`);
        fullText += ocrText + '\n\n';
      } else {
        console.warn(`[OCR] Page ${pageNum}: Tesseract found no text`);
      }
    } catch (renderErr) {
      console.error(`[OCR] Page ${pageNum}: render + OCR failed`, renderErr);
    }
  }

  const trimmed = fullText.trim();
  if (trimmed.length === 0) {
    throw new Error('No text could be extracted from the PDF (neither text layer nor image OCR).');
  }

  console.log(`[OCR] PDF total extracted: ${trimmed.length} chars`);
  return trimmed;
}

/**
 * Render a single PDF page to a PNG buffer using canvas.
 * Scale 2.0 for better OCR quality.
 */
async function renderPageToBuffer(page: any): Promise<Buffer> {
  // Dynamically import canvas (native module)
  const { createCanvas } = await import('canvas');

  const scale = 2.0;
  const viewport = page.getViewport({ scale });
  const canvasEl = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvasEl.getContext('2d');

  console.log(`[OCR] Rendering page at ${Math.ceil(viewport.width)}x${Math.ceil(viewport.height)} (scale ${scale})...`);

  // pdfjs render expects a canvas context with specific properties
  await page.render({
    canvasContext: ctx as any,
    viewport,
  }).promise;

  return canvasEl.toBuffer('image/png');
}
