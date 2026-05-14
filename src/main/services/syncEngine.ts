import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import crypto from 'crypto';
import { app } from 'electron';
import { calculateHash } from './hashService';
import { getDocumentByHash, getDocumentByUuid, insertDocumentWithUuid, updateDocumentPath, getAllDocuments, getSetting, updateDocumentMetadata, deleteDocumentByPath, updateDocumentStatus, updateFullText, updateDocumentUuid } from '../db/index.js';
import { analyzeDocumentWithAI, buildFilename } from './aiService.js';
import { performOCR } from './ocrService.js';
import { readDocumentUuid, writeXmpMetadata } from './xmpService.js';
import { PDFParse } from 'pdf-parse';

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

// Inbox processing queue — max 5 concurrent
const MAX_CONCURRENT_INBOX = 5;
let activeInboxProcessing = 0;
const inboxQueue: Array<() => Promise<void>> = [];

function runNextInQueue() {
  if (activeInboxProcessing >= MAX_CONCURRENT_INBOX || inboxQueue.length === 0) return;
  activeInboxProcessing++;
  const task = inboxQueue.shift()!;
  task().finally(() => {
    activeInboxProcessing--;
    runNextInQueue();
  });
}

function enqueueInboxFile(task: () => Promise<void>) {
  inboxQueue.push(task);
  runNextInQueue();
}

// Watcher für die Inbox und andere Ordner
let currentWatcher: chokidar.FSWatcher | null = null;

async function processInboxFile(uuid: string, hash: string, normalizedPath: string, onDbChange?: () => void) {
  const config = getConfig();
  console.log(`[Pipeline] Starting for uuid=${uuid} hash=${hash} path=${normalizedPath}`);

  // STEP 1: PDF text extraction
  const dataBuffer = await fs.readFile(normalizedPath);
  let hasText = false;
  let extractedText = '';
  try {
    const parser = new PDFParse({ data: dataBuffer });
    const pdfData = await parser.getText();
    await parser.destroy();
    extractedText = pdfData.text || '';
    hasText = extractedText.trim().length > 50;
  } catch (e) {
    console.error(`[Pipeline] PDFParse failed:`, e);
  }

  // STEP 2: Update DB with OCR flag
  updateDocumentMetadata(hash, '[]', JSON.stringify({ needsOcr: !hasText }), 'new');
  if (onDbChange) onDbChange();

  // STEP 3: OCR if no text
  if (!hasText) {
    updateDocumentStatus(hash, 'ocr_processing');
    if (onDbChange) onDbChange();
    try {
      extractedText = await performOCR(normalizedPath);
      if (extractedText && extractedText.trim().length > 50) {
        hasText = true;
        updateDocumentMetadata(hash, '[]', JSON.stringify({ needsOcr: false }), 'new');
        if (onDbChange) onDbChange();
      } else {
        updateDocumentStatus(hash, 'error');
        if (onDbChange) onDbChange();
        return;
      }
    } catch (ocrError) {
      console.error(`[Pipeline] OCR failed:`, ocrError);
      updateDocumentStatus(hash, 'error');
      if (onDbChange) onDbChange();
      return;
    }
  }

  // Store full text in FTS5
  updateFullText(uuid, extractedText);

  // STEP 4: AI Analysis
  updateDocumentStatus(hash, 'ai_processing');
  if (onDbChange) onDbChange();

  let aiResult: any = null;
  try {
    aiResult = await analyzeDocumentWithAI(extractedText);
  } catch (aiError) {
    console.error(`[Pipeline] AI failed:`, aiError);
  }

  if (!aiResult) {
    updateDocumentMetadata(hash, '[]', JSON.stringify({ needsOcr: false, aiPending: true }), 'ai_pending');
    if (onDbChange) onDbChange();
    return;
  }

  // STEP 5: Save metadata + write XMP + move to Sortieren
  const tags = Array.isArray(aiResult.tags) ? aiResult.tags : [];
  const ext = path.extname(normalizedPath);
  const baseName = aiResult.suggestedFilename ||
    buildFilename(aiResult.date || '', aiResult.docType || '', aiResult.sender || '');
  const newFileName = baseName + ext;
  const archivePath = aiResult.archivePath || 'Sonstiges';

  const aiMetadata = JSON.stringify({
    sender: aiResult.sender || '',
    date: aiResult.date || '',
    docType: aiResult.docType || '',
    needsOcr: false,
    archivePath,
    suggestedFilename: newFileName,
  });

  updateDocumentMetadata(hash, JSON.stringify(tags), aiMetadata, 'new');

  const processingPath = path.join(config.PROCESSING_PATH, newFileName);
  let finalProcessingPath = processingPath;
  try {
    let counter = 1;
    while (await fs.stat(finalProcessingPath).then(() => true).catch(() => false)) {
      const nameWithoutExt = path.basename(newFileName, ext);
      finalProcessingPath = path.join(config.PROCESSING_PATH, `${nameWithoutExt}_${counter}${ext}`);
      counter++;
    }
    await fs.rename(normalizedPath, finalProcessingPath);
    updateDocumentPath(hash, finalProcessingPath);
    console.log(`[Pipeline] Moved to Sortieren: ${finalProcessingPath}`);
  } catch (moveErr) {
    console.error(`[Pipeline] Move failed:`, moveErr);
    finalProcessingPath = normalizedPath; // XMP write still uses original path if move failed
  }

  // Write UUID + tags to PDF XMP after move (avoids watcher re-trigger from temp file in inbox)
  try {
    await writeXmpMetadata(finalProcessingPath, uuid, tags);
  } catch (xmpErr) {
    console.warn(`[Pipeline] XMP write failed (non-fatal):`, xmpErr);
  }

  if (onDbChange) onDbChange();
}

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
    try {
      const config = getConfig();
      const filePathLower = normalizedPath.toLowerCase();
      const isInInboxDir = filePathLower.startsWith(path.normalize(config.INBOX_PATH).toLowerCase());

      // Try UUID from XMP first (fast path for known files — avoids hashing)
      const xmpUuid = await readDocumentUuid(normalizedPath);
      if (xmpUuid) {
        const existing = getDocumentByUuid(xmpUuid);
        if (existing) {
          if (!isInInboxDir) {
            // Known file outside inbox — update path if changed, done
            if (path.normalize(existing.last_path).toLowerCase() !== filePathLower) {
              updateDocumentPath(existing.hash, normalizedPath);
              if (onDbChange) onDbChange();
            }
            return;
          }
          // Known file back in inbox — delete record so it can be reprocessed fresh
          deleteDocumentByPath(existing.last_path);
          // Fall through to new-file pipeline below
        }
      }

      // Hash-based path (new files or files without UUID in XMP)
      const hash = await calculateHash(normalizedPath);
      const existing = getDocumentByHash(hash);

      if (existing) {
        const existingPathLower = path.normalize(existing.last_path).toLowerCase();
        if (existingPathLower === filePathLower) {
          if (isInInboxDir && (existing.status === 'new' || existing.status === 'error')) {
            deleteDocumentByPath(existing.last_path);
            // Fall through to new-file pipeline
          } else {
            return;
          }
        } else {
          if (isInInboxDir) {
            deleteDocumentByPath(existing.last_path);
            // Fall through to new-file pipeline
          } else {
            updateDocumentPath(hash, normalizedPath);
            if (onDbChange) onDbChange();
            return;
          }
        }
      }

      if (!isInInboxDir) {
        // Unknown file outside inbox — generate UUID, index as processed
        const newUuid = xmpUuid || crypto.randomUUID();
        insertDocumentWithUuid(newUuid, hash, normalizedPath, '[]', '{}', 'processed');
        if (!xmpUuid) {
          writeXmpMetadata(normalizedPath, newUuid, []).catch(e =>
            console.warn(`[Watcher] XMP write failed for archive file:`, e)
          );
        }
        if (onDbChange) onDbChange();
        return;
      }

      // New inbox file — generate UUID and start pipeline
      const uuid = xmpUuid || crypto.randomUUID();
      insertDocumentWithUuid(uuid, hash, normalizedPath, '[]', '{}', 'new');
      if (onDbChange) onDbChange();

      enqueueInboxFile(() => processInboxFile(uuid, hash, normalizedPath, onDbChange));

    } catch (err) {
      console.error(`[Watcher] Error for ${normalizedPath}:`, err);
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

let crawlerRunning = false;

export function isCrawlerRunning(): boolean {
  return crawlerRunning;
}

export async function runUuidCrawler(
  onStatusChange?: (status: 'running' | 'idle') => void,
  onDbChange?: () => void
): Promise<void> {
  if (crawlerRunning) {
    console.log('[Crawler] Already running, skipping');
    return;
  }
  crawlerRunning = true;
  onStatusChange?.('running');

  console.log('[Crawler] Starting UUID scan...');
  const config = getConfig();

  try {
    const files = await walkDir(config.ARCHIVE_PATH, config.EXCLUDE_FOLDERS);
    console.log(`[Crawler] Found ${files.length} files in archive`);

    for (const filePath of files) {
      try {
        const normalizedPath = path.normalize(filePath);
        const xmpUuid = await readDocumentUuid(normalizedPath);

        if (xmpUuid) {
          const existing = getDocumentByUuid(xmpUuid);
          if (existing) {
            if (path.normalize(existing.last_path).toLowerCase() !== normalizedPath.toLowerCase()) {
              console.log(`[Crawler] Path updated for ${xmpUuid}`);
              updateDocumentPath(existing.hash, normalizedPath);
              if (onDbChange) onDbChange();
            }
          } else {
            // UUID in PDF but not in DB (e.g., another computer imported it)
            const hash = await calculateHash(normalizedPath);
            insertDocumentWithUuid(xmpUuid, hash, normalizedPath, '[]', '{}', 'processed');
            if (onDbChange) onDbChange();
          }
        } else {
          // No UUID in PDF — assign one and write it
          const hash = await calculateHash(normalizedPath);
          const existingByHash = getDocumentByHash(hash);
          if (existingByHash) {
            const uuid = existingByHash.uuid || crypto.randomUUID();
            if (!existingByHash.uuid) {
              // Existing row had no uuid — update it in DB
              updateDocumentUuid(hash, uuid);
            }
            await writeXmpMetadata(normalizedPath, uuid, existingByHash.tags ? JSON.parse(existingByHash.tags) : []);
          } else {
            // Completely new file — generate UUID, write XMP, index as processed
            const uuid = crypto.randomUUID();
            await writeXmpMetadata(normalizedPath, uuid, []);
            insertDocumentWithUuid(uuid, hash, normalizedPath, '[]', '{}', 'processed');
            if (onDbChange) onDbChange();
          }
        }
      } catch (e) {
        console.error(`[Crawler] Error processing ${filePath}:`, e);
      }
    }

    console.log(`[Crawler] Done — scanned ${files.length} files`);
  } finally {
    crawlerRunning = false;
    onStatusChange?.('idle');
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

        const isInBox = doc.last_path.startsWith(config.INBOX_PATH + path.sep);
        const isInSortieren = doc.last_path.startsWith(config.PROCESSING_PATH + path.sep);

        // Reset stuck processing states for docs already in Sortieren
        if (isInSortieren && (doc.status === 'ocr_processing' || doc.status === 'ai_processing')) {
            console.log(`[Sync] Resetting stuck status '${doc.status}' for ${doc.hash} in Sortieren`);
            updateDocumentStatus(doc.hash, 'new');
            if (onDbChange) onDbChange();
            continue;
        }

        // Retry AI for inbox docs that were paused because Ollama was offline
        if (isInBox && doc.status === 'ai_pending') {
            console.log(`[Sync] Retrying AI for ${doc.hash} (was ai_pending)...`);
            try {
                updateDocumentStatus(doc.hash, 'ai_processing');
                if (onDbChange) onDbChange();

                // Re-extract text (OCR already done before, but we need text for AI)
                const extractedText = await performOCR(doc.last_path);
                const aiResult = await analyzeDocumentWithAI(extractedText);

                if (aiResult) {
                    const tags = Array.isArray(aiResult.tags) ? JSON.stringify(aiResult.tags) : '[]';
                    const ext = path.extname(doc.last_path);
                    const baseName = aiResult.suggestedFilename ||
                        buildFilename(aiResult.date || '', aiResult.docType || '', aiResult.sender || '');
                    const newFileName = baseName + ext;
                    const archivePath = aiResult.archivePath || 'Sonstiges';
                    const newMetadata = JSON.stringify({
                        sender: aiResult.sender || '',
                        date: aiResult.date || '',
                        docType: aiResult.docType || '',
                        needsOcr: false,
                        archivePath,
                        suggestedFilename: newFileName,
                    });
                    updateDocumentMetadata(doc.hash, tags, newMetadata, 'new');

                    const processingPath = path.join(config.PROCESSING_PATH, newFileName);
                    try {
                        await fs.rename(doc.last_path, processingPath);
                        updateDocumentPath(doc.hash, processingPath);
                        console.log(`[Sync] AI retry succeeded, moved to Sortieren: ${processingPath}`);
                    } catch (moveErr) {
                        console.error(`[Sync] Move after AI retry failed`, moveErr);
                    }
                } else {
                    // Still offline — reset to ai_pending so we retry next cycle
                    console.warn(`[Sync] AI still unavailable for ${doc.hash}, will retry later`);
                    updateDocumentStatus(doc.hash, 'ai_pending');
                }
                if (onDbChange) onDbChange();
            } catch (e) {
                console.error(`[Sync] AI retry failed for ${doc.hash}`, e);
                updateDocumentStatus(doc.hash, 'ai_pending');
                if (onDbChange) onDbChange();
            }
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
