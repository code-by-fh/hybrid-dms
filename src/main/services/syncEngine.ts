import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { app } from 'electron';
import { calculateHash } from './hashService';
import { getDocumentByHash, insertDocument, updateDocumentPath, getAllDocuments, getSetting, updateDocumentMetadata, deleteDocumentByPath, updateDocumentStatus } from '../db/index.js';
import { analyzeDocumentWithAI } from './aiService.js';
import { performOCR } from './ocrService.js';
// @ts-ignore - TS complains about no default export, but Vite handles it
import pdfParseModule from 'pdf-parse';
const pdfParse = (pdfParseModule as any).default || pdfParseModule;

// Konfiguration der Pfade dynamisch aus der DB laden
export function getConfig() {
  const config = {
    INBOX_PATH: getSetting('INBOX_PATH', path.join(app.getPath('userData'), 'Inbox')),
    PROCESSING_PATH: getSetting('PROCESSING_PATH', path.join(app.getPath('userData'), 'Processing')),
    ARCHIVE_PATH: getSetting('ARCHIVE_PATH', path.join(app.getPath('userData'), 'Archive')),
    EXCLUDE_FOLDERS: getSetting('EXCLUDE_FOLDERS', '').split(',').map(s => s.trim()).filter(Boolean),
    OLLAMA_URL: getSetting('OLLAMA_URL', 'http://localhost:11434'),
    OLLAMA_MODEL: getSetting('OLLAMA_MODEL', 'llama3.2'),
  };
  return config;
}

// Ordner erstellen, falls nicht vorhanden
export function ensureDirs() {
  const config = getConfig();
  [config.INBOX_PATH, config.PROCESSING_PATH, config.ARCHIVE_PATH].forEach(dir => {
    if (!fsSync.existsSync(dir)) {
      fsSync.mkdirSync(dir, { recursive: true });
    }
  });
}

// Watcher für die Inbox und andere Ordner
let currentWatcher: chokidar.FSWatcher | null = null;

export function startWatcher(onDbChange?: () => void) {
  if (currentWatcher) {
    currentWatcher.close();
  }
  
  ensureDirs();
  const config = getConfig();
  
  const watchPaths = [config.INBOX_PATH, config.PROCESSING_PATH, config.ARCHIVE_PATH];
  console.log(`[Sync] Starting watcher for paths:`, watchPaths);
  
  currentWatcher = chokidar.watch(watchPaths, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    awaitWriteFinish: true,
  });

  currentWatcher.on('add', async (filePath) => {
    const normalizedPath = path.normalize(filePath);
    console.log(`\n[DEBUG][Watcher] ========================================`);
    console.log(`[DEBUG][Watcher] File detected: ${normalizedPath}`);
    console.log(`[DEBUG][Watcher] Time: ${new Date().toISOString()}`);

    try {
      // --- Hash ---
      const hash = await calculateHash(normalizedPath);
      console.log(`[DEBUG][Watcher] Hash: ${hash}`);

      const config = getConfig();
      const normalizedInbox = path.normalize(config.INBOX_PATH);
      const normalizedProcessing = path.normalize(config.PROCESSING_PATH);

      // Case-insensitive comparison for Windows (drive letter C: vs c:)
      const filePathLower = normalizedPath.toLowerCase();
      const inboxPathLower = normalizedInbox.toLowerCase();
      const isInInboxDir = filePathLower.startsWith(inboxPathLower);

      console.log(`[DEBUG][Watcher] INBOX_PATH      = ${normalizedInbox}`);
      console.log(`[DEBUG][Watcher] PROCESSING_PATH = ${normalizedProcessing}`);
      console.log(`[DEBUG][Watcher] Datei liegt im Inbox-Ordner? ${isInInboxDir}`);
      if (!isInInboxDir) {
        console.log(`[DEBUG][Watcher] MISMATCH DETAIL:`);
        console.log(`[DEBUG][Watcher]   Datei-Pfad (lower): ${filePathLower}`);
        console.log(`[DEBUG][Watcher]   Inbox-Pfad (lower): ${inboxPathLower}`);
      }

      // --- Already known? ---
      const existing = getDocumentByHash(hash);
      if (existing) {
        const existingPathLower = path.normalize(existing.last_path).toLowerCase();

        if (existingPathLower === filePathLower) {
          // Same path, same location
          if (isInInboxDir && (existing.status === 'new' || existing.status === 'error')) {
            // In inbox but unprocessed/errored — delete and reprocess
            console.log(`[DEBUG][Watcher] Datei bereits in Inbox mit Status '${existing.status}' — DB-Eintrag löschen und neu verarbeiten`);
            deleteDocumentByPath(existing.last_path);
            // Fall through to new-file pipeline
          } else {
            console.log(`[DEBUG][Watcher] Gleicher Pfad und kein Handlungsbedarf — überspringe.`);
            console.log(`[DEBUG][Watcher] ========================================\n`);
            return;
          }
        } else {
          // Different path
          if (isInInboxDir) {
            // File moved/copied into inbox — delete old entry, reprocess fresh
            console.log(`[DEBUG][Watcher] Bekannte Datei jetzt in Inbox (${normalizedPath}) — alter Eintrag gelöscht, wird neu verarbeitet`);
            deleteDocumentByPath(existing.last_path);
            // Fall through to new-file pipeline
          } else {
            // File moved to non-inbox location — just update path
            console.log(`[DEBUG][Watcher] Pfad geändert (außerhalb Inbox): ${existing.last_path} -> ${normalizedPath}`);
            updateDocumentPath(hash, normalizedPath);
            if (onDbChange) onDbChange();
            console.log(`[DEBUG][Watcher] ========================================\n`);
            return;
          }
        }
      }

      const isInbox = isInInboxDir;
      console.log(`[DEBUG][Watcher] Neue Datei. isInbox=${isInbox}`);

      if (!isInbox) {
        console.log(`[DEBUG][Watcher] Außerhalb Inbox — als 'processed' indexieren.`);
        insertDocument(hash, normalizedPath, '[]', '{}', 'processed');
        if (onDbChange) onDbChange();
        console.log(`[DEBUG][Watcher] ========================================\n`);
        return;
      }

      // === INBOX PROCESSING PIPELINE ===

      // STEP 1: PDF text extraction
      console.log(`[DEBUG][Step 1] Reading file...`);
      const dataBuffer = await fs.readFile(normalizedPath);
      console.log(`[DEBUG][Step 1] File size: ${dataBuffer.length} bytes`);

      let hasText = false;
      let extractedText = '';
      try {
        console.log(`[DEBUG][Step 1] Running pdf-parse...`);
        const pdfData = await pdfParse(dataBuffer);
        extractedText = pdfData.text || '';
        hasText = extractedText.trim().length > 50;
        console.log(`[DEBUG][Step 1] pdf-parse result: ${extractedText.trim().length} chars, hasText=${hasText}`);
      } catch (e) {
        console.error(`[DEBUG][Step 1] pdf-parse FAILED:`, e);
      }

      // STEP 2: Insert into DB
      insertDocument(hash, normalizedPath, '[]', JSON.stringify({ needsOcr: !hasText }));
      console.log(`[DEBUG][Step 2] Inserted into DB (needsOcr=${!hasText})`);
      if (onDbChange) onDbChange();

      // STEP 3: OCR — only if no text
      if (!hasText) {
        console.log(`[DEBUG][Step 3] No text found — starting OCR...`);
        updateDocumentStatus(hash, 'ocr_processing');
        if (onDbChange) onDbChange();

        try {
          extractedText = await performOCR(normalizedPath);
          if (extractedText && extractedText.trim().length > 50) {
            hasText = true;
            console.log(`[DEBUG][Step 3] OCR SUCCESS: ${extractedText.trim().length} chars`);
            updateDocumentMetadata(hash, '[]', JSON.stringify({ needsOcr: false }), 'new');
            if (onDbChange) onDbChange();
          } else {
            console.warn(`[DEBUG][Step 3] OCR result too short (${extractedText?.trim().length ?? 0} chars) — REAL FAILURE`);
            updateDocumentStatus(hash, 'error');
            if (onDbChange) onDbChange();
            console.log(`[DEBUG][Watcher] ========================================\n`);
            return; // Nothing readable — stop here
          }
        } catch (ocrError) {
          console.error(`[DEBUG][Step 3] OCR THREW exception:`, ocrError);
          updateDocumentStatus(hash, 'error');
          if (onDbChange) onDbChange();
          console.log(`[DEBUG][Watcher] ========================================\n`);
          return; // OCR failed — stop here
        }
      }

      // STEP 4: AI Analysis
      console.log(`[DEBUG][Step 4] Starting AI analysis...`);
      updateDocumentStatus(hash, 'ai_processing');
      if (onDbChange) onDbChange();

      let tags = '[]';
      let aiMetadata = JSON.stringify({ needsOcr: false, aiSkipped: true });

      try {
        const aiResult = await analyzeDocumentWithAI(extractedText);
        if (aiResult) {
          tags = Array.isArray(aiResult.tags) ? JSON.stringify(aiResult.tags) : '[]';
          aiMetadata = JSON.stringify({
            sender: aiResult.sender || '',
            date: aiResult.date || '',
            docType: aiResult.docType || '',
            needsOcr: false,
          });
          console.log(`[DEBUG][Step 4] AI SUCCESS: sender="${aiResult.sender}", date="${aiResult.date}", type="${aiResult.docType}", tags=${tags}`);
        } else {
          console.warn(`[DEBUG][Step 4] AI returned null (Ollama offline?) — will move to Sortieren for manual review`);
        }
      } catch (aiError) {
        console.error(`[DEBUG][Step 4] AI THREW exception:`, aiError);
        // aiMetadata stays as aiSkipped:true
      }

      // STEP 5: Save metadata + move to Sortieren (regardless of AI success)
      updateDocumentMetadata(hash, tags, aiMetadata, 'new');
      console.log(`[DEBUG][Step 5] Metadata saved. Moving to Sortieren...`);

      const fileName = path.basename(normalizedPath);
      const processingPath = path.join(config.PROCESSING_PATH, fileName);
      console.log(`[DEBUG][Step 5] Target: ${processingPath}`);

      try {
        await fs.rename(normalizedPath, processingPath);
        updateDocumentPath(hash, processingPath);
        console.log(`[DEBUG][Step 5] ✓ Moved to Sortieren: ${processingPath}`);
      } catch (moveErr) {
        console.error(`[DEBUG][Step 5] Move FAILED:`, moveErr);
      }

      if (onDbChange) onDbChange();
      console.log(`[DEBUG][Watcher] ✓ Pipeline complete for ${hash}`);

    } catch (err) {
      console.error(`[DEBUG][Watcher] UNHANDLED ERROR for ${normalizedPath}:`, err);
    }

    console.log(`[DEBUG][Watcher] ========================================\n`);
  });


  currentWatcher.on('unlink', (filePath) => {
    console.log(`File deleted: ${filePath}`);
    // Delay deletion to handle renames (unlink + add).
    // If it's a rename, the 'add' event will update the last_path in DB.
    // By the time this runs, the document will have the new path, so this delete will safely do nothing.
    setTimeout(() => {
      import('../db/index.js').then(db => {
          db.deleteDocumentByPath(filePath);
          if (onDbChange) onDbChange();
      });
    }, 2000);
  });

  return currentWatcher;
}

// Crawler für Heilungsscan
export async function runHashCrawler() {
    console.log("Starting Hash Crawler...");
    const config = getConfig();
    const files = await walkDir(config.ARCHIVE_PATH, config.EXCLUDE_FOLDERS);
    for (const filePath of files) {
        try {
            const hash = await calculateHash(filePath);
            const existing = getDocumentByHash(hash);
            
            if (existing) {
                if (existing.last_path !== filePath) {
                    console.log(`Path change detected for ${hash}: ${existing.last_path} -> ${filePath}`);
                    updateDocumentPath(hash, filePath);
                }
            } else {
                 console.log(`New file found in archive, indexing: ${filePath}`);
                 insertDocument(hash, filePath, '[]', '{}', 'processed');
            }
        } catch (e) {
            console.error(`Error hashing file ${filePath}:`, e);
        }
    }
}

/**
 * Scans the database for documents that need OCR or AI analysis and processes them.
 * Also resets stuck processing states for docs in Sortieren.
 */
export async function processPendingDocuments(onDbChange?: () => void) {
    console.log('Checking for pending OCR or AI tasks...');
    const docs = getAllDocuments();
    const config = getConfig();

    for (const doc of docs) {
        let metadata;
        try {
            metadata = JSON.parse(doc.metadata || '{}');
        } catch (e) {
            metadata = {};
        }

        const isInBox = doc.last_path.startsWith(config.INBOX_PATH);
        const isInSortieren = doc.last_path.startsWith(config.PROCESSING_PATH);

        // Reset stuck processing states for docs already in Sortieren
        if (isInSortieren && (doc.status === 'ocr_processing' || doc.status === 'ai_processing')) {
            console.log(`[Sync] Resetting stuck status '${doc.status}' for ${doc.hash} in Sortieren`);
            updateDocumentStatus(doc.hash, 'new');
            if (onDbChange) onDbChange();
            continue;
        }

        // Only process inbox docs that need OCR or had an error
        if (isInBox && (metadata.needsOcr || doc.status === 'error')) {
            console.log(`Auto-starting OCR for pending document: ${doc.hash}`);
            try {
                updateDocumentStatus(doc.hash, 'ocr_processing');
                if (onDbChange) onDbChange();

                const extractedText = await performOCR(doc.last_path);
                if (extractedText && extractedText.trim().length > 50) {
                    console.log(`Auto-OCR successful for ${doc.hash}`);
                    updateDocumentMetadata(doc.hash, doc.tags, JSON.stringify({ ...metadata, needsOcr: false }), 'new');
                    if (onDbChange) onDbChange();

                    // Trigger AI analysis after successful OCR
                    console.log(`Triggering AI analysis for ${doc.hash} after Auto-OCR`);
                    updateDocumentStatus(doc.hash, 'ai_processing');
                    if (onDbChange) onDbChange();

                    const aiResult = await analyzeDocumentWithAI(extractedText);
                    if (aiResult) {
                        const tags = Array.isArray(aiResult.tags) ? JSON.stringify(aiResult.tags) : '[]';
                        const newMetadata = JSON.stringify({
                            sender: aiResult.sender || '',
                            date: aiResult.date || '',
                            docType: aiResult.docType || '',
                            needsOcr: false
                        });
                        updateDocumentMetadata(doc.hash, tags, newMetadata, 'new');
                        // Auto-move to Sortieren after successful processing
                        const fileName = path.basename(doc.last_path);
                        const processingPath = path.join(config.PROCESSING_PATH, fileName);
                        try {
                            await fs.rename(doc.last_path, processingPath);
                            updateDocumentPath(doc.hash, processingPath);
                            console.log(`[Sync] Pending doc processed and moved to Sortieren: ${processingPath}`);
                        } catch (moveErr) {
                            console.error(`[Sync] Failed to move processed doc to Sortieren`, moveErr);
                        }
                        if (onDbChange) onDbChange();
                    } else {
                        updateDocumentStatus(doc.hash, 'error');
                        if (onDbChange) onDbChange();
                    }
                } else {
                    updateDocumentStatus(doc.hash, 'error');
                    if (onDbChange) onDbChange();
                }
            } catch (e) {
                console.error(`Auto-OCR failed for ${doc.hash}`, e);
                updateDocumentStatus(doc.hash, 'error');
                if (onDbChange) onDbChange();
            }
        }
    }
}

async function walkDir(dir: string, excludeFolders: string[]): Promise<string[]> {
    let results: string[] = [];
    try {
        const list = await fs.readdir(dir);
        for (const file of list) {
            const filePath = path.resolve(dir, file);
            const stat = await fs.stat(filePath);
            
            if (stat && stat.isDirectory()) {
                const folderName = path.basename(filePath);
                if (excludeFolders.includes(folderName) || excludeFolders.includes(filePath)) {
                    console.log(`Excluding folder: ${filePath}`);
                    continue;
                }
                results = results.concat(await walkDir(filePath, excludeFolders));
            } else {
                results.push(filePath);
            }
        }
    } catch (e) {
        console.error(e);
    }
    return results;
}
