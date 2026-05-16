import { createWorker } from 'tesseract.js';
import path from 'path';
import fs from 'fs/promises';
import { createCanvas, ImageData } from 'canvas';

// pdfjs-dist v5 NodeCanvasFactory hard-requires @napi-rs/canvas.
// We use the `canvas` package instead, so we provide a custom factory
// and polyfill the globals pdfjs expects.
if (!globalThis.ImageData) (globalThis as any).ImageData = ImageData;

class CustomCanvasFactory {
  constructor(_options?: any) {}
  create(width: number, height: number) {
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(e: any, w: number, h: number) { e.canvas.width = w; e.canvas.height = h; }
  destroy(e: any) { e.canvas.width = 0; e.canvas.height = 0; e.canvas = null; e.context = null; }
}

interface WordBox {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/**
 * Extract text from a file via OCR.
 * For PDFs:
 *   - Pages with embedded text are kept as-is (copied into the output PDF unchanged).
 *   - Image-only pages are replaced with a proper sandwich PDF:
 *     rendered scan as PNG background + Tesseract text as invisible searchable layer.
 * The original file is overwritten with the searchable version.
 */
export async function performOCR(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.pdf' ? processPdf(filePath) : ocrImageFile(filePath);
}

async function ocrImageFile(filePath: string): Promise<string> {
  const worker = await createWorker('deu+eng');
  try {
    const { data } = await worker.recognize(filePath);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

async function runTesseract(input: Buffer): Promise<{ text: string; words: WordBox[] }> {
  const worker = await createWorker('deu+eng');
  try {
    // Tesseract.js v7: data.words is not returned by default — must request tsv output
    const { data } = await worker.recognize(input, {}, { tsv: true });
    const words: WordBox[] = parseTsvWords(data.tsv);
    return { text: data.text, words };
  } finally {
    await worker.terminate();
  }
}

function parseTsvWords(tsv: string | null): WordBox[] {
  if (!tsv) return [];
  const words: WordBox[] = [];
  const lines = tsv.trim().split('\n');
  // TSV columns: level page_num block_num par_num line_num word_num left top width height conf text
  for (const line of lines.slice(1)) {
    const cols = line.split('\t');
    if (cols[0] !== '5') continue; // level 5 = word
    const text = cols.slice(11).join('\t').trim();
    if (!text) continue;
    const left = parseInt(cols[6], 10);
    const top = parseInt(cols[7], 10);
    const width = parseInt(cols[8], 10);
    const height = parseInt(cols[9], 10);
    const confidence = parseFloat(cols[10]);
    words.push({
      text,
      confidence,
      bbox: { x0: left, y0: top, x1: left + width, y1: top + height },
    });
  }
  return words;
}

async function processPdf(filePath: string): Promise<string> {
  console.log(`[OCR] Processing PDF: ${filePath}`);

  // --- pdfjs setup (for rendering + text extraction) ---
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const { app } = await import('electron');
    pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(
      app.getAppPath(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs'
    );
  }
  const { app } = await import('electron');
  const fontsPath = path
    .join(app.getAppPath(), 'node_modules', 'pdfjs-dist', 'standard_fonts')
    .replace(/\\/g, '/');

  const fileBytes = await fs.readFile(filePath);
  const pdfjsDoc = await pdfjsLib.getDocument({
    data: new Uint8Array(fileBytes),
    standardFontDataUrl: `${fontsPath}/`,
    CanvasFactory: CustomCanvasFactory,
  }).promise;

  // --- pdf-lib setup (for building the output PDF) ---
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const srcDoc = await PDFDocument.load(fileBytes);
  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);

  console.log(`[OCR] PDF loaded: ${pdfjsDoc.numPages} page(s)`);

  let fullText = '';
  let modifiedAnyPage = false;

  for (let pageNum = 1; pageNum <= pdfjsDoc.numPages; pageNum++) {
    const pdfjsPage = await pdfjsDoc.getPage(pageNum);

    // --- Try embedded text first ---
    let embeddedText = '';
    try {
      const content = await pdfjsPage.getTextContent();
      let lastY = -1;
      for (const item of content.items as any[]) {
        if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 5) embeddedText += '\n';
        embeddedText += item.str + ' ';
        lastY = item.transform[5];
      }
      embeddedText = embeddedText.trim();
    } catch {}

    if (embeddedText.length > 50) {
      // Page already has text — copy it unchanged into the output PDF
      console.log(`[OCR] Page ${pageNum}: embedded text OK (${embeddedText.length} chars) — copying as-is`);
      const [copied] = await outDoc.copyPages(srcDoc, [pageNum - 1]);
      outDoc.addPage(copied);
      fullText += embeddedText + '\n\n';
      continue;
    }

    // --- No embedded text — render + Tesseract ---
    console.log(`[OCR] Page ${pageNum}: image-only, running Tesseract...`);
    modifiedAnyPage = true;

    const scale = 2.0;
    const viewport = pdfjsPage.getViewport({ scale });
    const widthPx = Math.ceil(viewport.width);
    const heightPx = Math.ceil(viewport.height);
    const widthPts = widthPx / scale;
    const heightPts = heightPx / scale;

    // Render the page to a PNG
    const factory = new CustomCanvasFactory();
    const { canvas, context } = factory.create(widthPx, heightPx);
    await pdfjsPage.render({ canvasContext: context, viewport }).promise;
    const pngBuffer: Buffer = (canvas as any).toBuffer('image/png');

    // OCR the rendered image
    const { text, words } = await runTesseract(pngBuffer);
    console.log(`[OCR] Page ${pageNum}: Tesseract OK (${text.trim().length} chars)`);
    fullText += text + '\n\n';

    // Build sandwich page: text FIRST (behind), image SECOND (on top).
    // This is the standard "text-under-image" OCR PDF technique:
    // the image visually covers the text, but the text exists in the content
    // stream and is fully indexed by every PDF viewer and OS search.
    const outPage = outDoc.addPage([widthPts, heightPts]);

    for (const word of words) {
      const wordText = word.text.trim();
      if (!wordText || word.confidence < 30) continue;

      // Tesseract pixels → PDF points, flip Y (Tesseract: top-left, PDF: bottom-left)
      const x = word.bbox.x0 / scale;
      const y = heightPts - word.bbox.y1 / scale;
      const fontSize = Math.max(2, (word.bbox.y1 - word.bbox.y0) / scale * 0.85);

      try {
        // White text — invisible on white background and covered by the image above
        outPage.drawText(wordText, { x, y, size: fontSize, font, color: rgb(1, 1, 1) });
      } catch {
        // Skip words with characters unsupported by the standard font
      }
    }

    // Draw scan image on top — covers the text visually, PDF stream still contains it
    const embeddedPng = await outDoc.embedPng(pngBuffer);
    outPage.drawImage(embeddedPng, { x: 0, y: 0, width: widthPts, height: heightPts });
  }

  const trimmed = fullText.trim();
  if (trimmed.length === 0) throw new Error('No text could be extracted from PDF.');

  // Overwrite original with the searchable sandwich PDF (only if we changed anything)
  if (modifiedAnyPage) {
    await fs.writeFile(filePath, await outDoc.save());
    console.log(`[OCR] Searchable PDF written: ${path.basename(filePath)}`);
  }

  console.log(`[OCR] Total extracted: ${trimmed.length} chars`);
  return trimmed;
}
