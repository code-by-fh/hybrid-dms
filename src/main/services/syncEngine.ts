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
    // Pfade normalisieren für Windows/Linux Kompatibilität
    const normalizedPath = path.normalize(filePath);
    console.log(`[Sync] Watcher: File detected - ${normalizedPath}`);
    
    try {
      const hash = await calculateHash(normalizedPath);
      const config = getConfig();
      
      // Auch diese Pfade normalisieren
      const normalizedInbox = path.normalize(config.INBOX_PATH);
      
      const existing = getDocumentByHash(hash);
      if (existing) {
        console.log(`[Sync] File ${hash} already exists in DB.`);
        if (path.normalize(existing.last_path) !== normalizedPath) {
          console.log(`[Sync] Path change detected for ${hash}: ${existing.last_path} -> ${normalizedPath}`);
          updateDocumentPath(hash, normalizedPath);
          if (onDbChange) onDbChange();
        }
      } else {
        const isInbox = normalizedPath.startsWith(normalizedInbox);
        console.log(`[Sync] New file. isInbox: ${isInbox} (Path: ${normalizedPath}, Inbox: ${normalizedInbox})`);
        
        if (isInbox) {
          console.log(`[Sync] Processing file in Inbox: ${normalizedPath}`);
          // Prüfe via pdf-parse, ob OCR nötig ist
          const dataBuffer = await fs.readFile(normalizedPath);
          let hasText = false;
          let extractedText = '';
          try {
            // pdf-parse is a function, not a class
            const pdfData = await pdfParse(dataBuffer);
            extractedText = pdfData.text || '';
            hasText = extractedText.trim().length > 50;
            console.log(`[Sync] Text extraction for ${hash}: ${extractedText.trim().length} chars. hasText: ${hasText}`);
          } catch (e) {
            console.error('[Sync] Fehler beim Parsen der PDF', e);
          }

          // Speichere in DB (noch im Inbox-Pfad)
          insertDocument(hash, filePath, '[]', JSON.stringify({ needsOcr: !hasText }));
          console.log(`[Sync] Document indexed in Inbox: ${hash} (needsOcr: ${!hasText})`);

          // If no text found, try OCR automatically
          if (!hasText) {
            try {
              console.log(`[Sync] No text found in ${hash}, starting automatic OCR...`);
              updateDocumentStatus(hash, 'ocr_processing');
              if (onDbChange) onDbChange();

              extractedText = await performOCR(normalizedPath);
              if (extractedText && extractedText.trim().length > 50) {
                hasText = true;
                console.log(`[Sync] OCR successful for ${hash}, extracted ${extractedText.length} characters.`);
                // Update metadata to indicate OCR was successful
                updateDocumentMetadata(hash, '[]', JSON.stringify({ needsOcr: false }), 'new');
              } else {
                console.warn(`[Sync] OCR results too short for ${hash}.`);
                updateDocumentStatus(hash, 'error');
              }
            } catch (ocrError) {
              console.error(`[Sync] Automatic OCR failed for ${hash}`, ocrError);
              updateDocumentStatus(hash, 'error');
            }
          }
          
          if (onDbChange) onDbChange();

          // Versuche automatische Analyse
          if (hasText) {
            try {
              console.log(`[Sync] Starting automated AI analysis for ${hash}...`);
              updateDocumentStatus(hash, 'ai_processing');
              if (onDbChange) onDbChange();

              const aiResult = await analyzeDocumentWithAI(extractedText);
              if (aiResult) {
                 const tags = Array.isArray(aiResult.tags) ? JSON.stringify(aiResult.tags) : '[]';
                 const metadata = JSON.stringify({
                    sender: aiResult.sender || '',
                    date: aiResult.date || '',
                    docType: aiResult.docType || '',
                    needsOcr: false
                 });
                 
                 // Update DB with AI results
                 updateDocumentMetadata(hash, tags, metadata, 'new'); 
                 
                 // Move to processing path automatically
                 const fileName = path.basename(normalizedPath);
                 const processingPath = path.join(config.PROCESSING_PATH, fileName);
                 await fs.rename(normalizedPath, processingPath);
                 updateDocumentPath(hash, processingPath);
                 console.log(`[Sync] Automated analysis successful. Moved to processing: ${processingPath}`);

                 if (onDbChange) onDbChange();
              } else {
                console.warn(`[Sync] AI analysis returned no result for ${hash}.`);
                updateDocumentStatus(hash, 'error');
                if (onDbChange) onDbChange();
              }
            } catch (aiError) {
               console.error("[Sync] Automated AI analysis failed", aiError);
               updateDocumentStatus(hash, 'error');
               if (onDbChange) onDbChange();
            }
          }
        } else {
          // New file detected directly in Processing or Archive
          console.log(`[Sync] New file detected outside Inbox: ${normalizedPath}`);
          insertDocument(hash, normalizedPath, '[]', '{}', 'processed');
          if (onDbChange) onDbChange();
        }
      }
    } catch (err) {
      console.error('Error processing new file:', err);
    }
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
