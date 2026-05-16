import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, globalShortcut, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { initDb, getAllDocuments, setSetting, getDocumentByHash, updateDocumentMetadata, updateDocumentPath, updateDocumentStatus, searchDocuments } from './db/index.js';
import { writeXmpMetadata } from './services/xmpService.js';
import { startWatcher, runUuidCrawler, isCrawlerRunning, getConfig, processPendingDocuments } from './services/syncEngine.js';
import { initLogger, getLogPath, setLogPath, log } from './services/logger.js';
import { checkOllamaStatus, checkOllamaConfig, analyzeDocumentWithAI } from './services/aiService.js';
import { performOCR } from './services/ocrService.js';
import { PDFParse } from 'pdf-parse';
import { createCanvas, Image } from 'canvas';

// FIX: pdfjs-dist in Node.js needs global.Image and other canvas-related objects 
// to be set BEFORE it starts rendering, especially for images/masks.
if (typeof global !== 'undefined') {
  (global as any).Image = Image;
  if (!(global as any).HTMLCanvasElement) {
    (global as any).HTMLCanvasElement = createCanvas(1, 1).constructor;
  }
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let searchWindow: BrowserWindow | null = null;

function createSearchWindow() {
  if (searchWindow && !searchWindow.isDestroyed()) {
    if (searchWindow.isVisible()) {
      searchWindow.hide();
    } else {
      searchWindow.show();
      searchWindow.focus();
    }
    return;
  }

  searchWindow = new BrowserWindow({
    width: 420,
    height: 480,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'dist-electron', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    searchWindow.loadURL(process.env.VITE_DEV_SERVER_URL + 'src/search.html');
  } else {
    searchWindow.loadFile(path.join(app.getAppPath(), 'dist', 'src', 'search.html'));
  }

  let blurTimer: ReturnType<typeof setTimeout> | null = null;
  searchWindow.on('blur', () => {
    blurTimer = setTimeout(() => searchWindow?.hide(), 150);
  });
  searchWindow.on('focus', () => {
    if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }
  });
}

function createTray() {
  const iconPath = path.join(app.getAppPath(), 'resources', 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);

  const menu = Menu.buildFromTemplate([
    { label: 'Suche öffnen (Strg+Alt+D)', click: createSearchWindow },
    { label: 'Hauptfenster', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Beenden', click: () => { (app as any).isQuitting = true; app.quit(); } },
  ]);
  tray.setToolTip('DMS Dokumentenarchiv');
  tray.setContextMenu(menu);
  tray.on('click', createSearchWindow);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'dist-electron', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // allow local file loading for pdf viewer
    },
  });

  // Hide to tray instead of quitting when main window is closed
  mainWindow.on('close', (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  }
}

app.whenReady().then(async () => {
  // Initialize SQLite
  initDb();
  // Initialize file logger
  initLogger();
  log('info', '[Main] App starting');

  // Start Sync Engine Watcher
  startWatcher(() => {
      if (mainWindow) {
          mainWindow.webContents.send('documents-changed');
      }
  });

  createWindow();

  // Configure pdfjs-dist worker globally (non-blocking)
  import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjsLib) => {
    const workerPath = path.join(app.getAppPath(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
  }).catch((e) => {
    console.warn(`[Main] Failed to configure global pdfjs worker`, e);
  });

  try {
    createTray();
  } catch (e) {
    console.warn('[Main] Tray creation failed (icon missing?):', e);
  }
  globalShortcut.register('CommandOrControl+Alt+D', createSearchWindow);

  // Run UUID crawler on startup (healing scan + first-time migration), then process pending
  runUuidCrawler(
    (status) => { if (mainWindow) mainWindow.webContents.send('crawler-status-changed', status); },
    () => { if (mainWindow) mainWindow.webContents.send('documents-changed'); }
  ).then(() => {
    processPendingDocuments(() => {
      if (mainWindow) mainWindow.webContents.send('documents-changed');
    });
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('get-documents', async () => {
    return getAllDocuments();
});

ipcMain.handle('save-and-move', async (_event, { hash, tags, metadata }) => {
    try {
        const doc = getDocumentByHash(hash);
        if (!doc) throw new Error("Document not found");

        const config = getConfig();
        const fileName = path.basename(doc.last_path); // Already renamed by AI pipeline

        // Build target directory: ARCHIVE_PATH / archivePath (user-editable subfolder)
        const archiveSubPath: string = metadata?.archivePath || '';
        const subDirParts = archiveSubPath
            .split('/')
            .map((p: string) => p.trim())
            .filter(Boolean);
        const targetDir = path.join(config.ARCHIVE_PATH, ...subDirParts);
        await fs.mkdir(targetDir, { recursive: true });

        let targetPath = path.join(targetDir, fileName);

        // Ensure unique filename
        let counter = 1;
        const ext = path.extname(fileName);
        const base = path.basename(fileName, ext);
        while (await fs.stat(targetPath).then(() => true).catch(() => false) && doc.last_path !== targetPath) {
            targetPath = path.join(targetDir, `${base}_${counter}${ext}`);
            counter++;
        }

        if (doc.last_path !== targetPath) {
            await fs.rename(doc.last_path, targetPath);
        }

        const saveMeta = { ...metadata };
        delete saveMeta.archivePath; // don't double-store in metadata
        updateDocumentMetadata(hash, JSON.stringify(tags), JSON.stringify(saveMeta), 'processed');
        updateDocumentPath(hash, targetPath);

        // Write updated tags + UUID to PDF XMP (non-fatal)
        try {
          if (doc.uuid) {
            const tagsArray = Array.isArray(tags) ? tags : JSON.parse(tags as any);
            await writeXmpMetadata(targetPath, doc.uuid, tagsArray);
          }
        } catch (xmpErr) {
          console.warn('[save-and-move] XMP write failed (non-fatal):', xmpErr);
        }

        console.log(`Document archived: ${targetPath}`);
        return { success: true };
    } catch (err) {
        console.error("Save & Move failed:", err);
        return { success: false, error: (err as Error).message };
    }
});

ipcMain.handle('move-to-processing', async (_event, hash) => {
    try {
        const doc = getDocumentByHash(hash);
        if (!doc) throw new Error("Document not found");

        const config = getConfig();
        const fileName = path.basename(doc.last_path);
        const targetPath = path.join(config.PROCESSING_PATH, fileName);

        await fs.rename(doc.last_path, targetPath);
        updateDocumentPath(hash, targetPath);
        // Reset any stuck processing status so Sortieren shows a clean state
        updateDocumentStatus(hash, 'new');

        return { success: true };
    } catch (err) {
        console.error("Move to processing failed:", err);
        return { success: false, error: (err as Error).message };
    }
});

ipcMain.handle('open-directory-dialog', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (result.canceled) return null;
    return result.filePaths[0];
});

ipcMain.handle('get-settings', async () => {
    return getConfig();
});

ipcMain.handle('update-settings', async (_event, newSettings) => {
    Object.entries(newSettings).forEach(([key, value]) => {
        setSetting(key, value as string);
    });
    
    // Restart watcher with new paths
    startWatcher(() => {
        if (mainWindow) {
            mainWindow.webContents.send('documents-changed');
        }
    });
    
    return { success: true };
});

ipcMain.handle('check-ollama-status', async () => {
    return checkOllamaStatus();
});

ipcMain.handle('check-ollama-config', async (_event, { url, model }: { url: string; model: string }) => {
    return checkOllamaConfig(url, model);
});

ipcMain.handle('perform-ocr', async (_event, hash) => {
  try {
    const doc = getDocumentByHash(hash);
    if (!doc) throw new Error("Document not found");
    
    console.log(`Manual OCR requested for ${hash}`);
    const text = await performOCR(doc.last_path);
    
    if (!text || text.trim().length < 50) {
      return { success: false, error: "OCR results too short or empty" };
    }
    
    // Update metadata
    const currentMeta = doc.metadata ? JSON.parse(doc.metadata) : {};
    updateDocumentMetadata(hash, doc.tags, JSON.stringify({ ...currentMeta, needsOcr: false }), doc.status);
    
    return { success: true, text };
  } catch (e) {
    console.error("OCR IPC Error", e);
    return { success: false, error: (e as Error).message };
  }
});

ipcMain.handle('analyze-document', async (_event, hash) => {
    try {
        const doc = getDocumentByHash(hash);
        if (!doc) throw new Error("Document not found");

        const dataBuffer = await fs.readFile(doc.last_path);
        
        const parser = new PDFParse({ data: dataBuffer });
        const pdfData = await parser.getText();
        await parser.destroy();
        const text = pdfData.text;

        if (!text || text.trim().length < 50) {
            return { success: false, error: "Not enough text found in document (OCR needed)" };
        }

        const aiResult = await analyzeDocumentWithAI(text);
        if (!aiResult) {
            return { success: false, error: "AI analysis failed" };
        }

        return { success: true, data: aiResult };
    } catch (e) {
        console.error("Analysis error", e);
        return { success: false, error: (e as Error).message };
    }
});

ipcMain.handle('retry-processing', async (_event, hash) => {
    try {
        const doc = getDocumentByHash(hash);
        if (!doc) throw new Error('Document not found');
        updateDocumentStatus(hash, 'new');
        processPendingDocuments(() => {
            if (mainWindow) mainWindow.webContents.send('documents-changed');
        });
        return { success: true };
    } catch (err) {
        console.error('Retry processing failed:', err);
        return { success: false, error: (err as Error).message };
    }
});

ipcMain.handle('rename-file', async (_event, { hash, newName }: { hash: string; newName: string }) => {
    try {
        const doc = getDocumentByHash(hash);
        if (!doc) throw new Error('Document not found');
        const dir = path.dirname(doc.last_path);
        const ext = path.extname(doc.last_path);
        const safeName = newName.replace(/[<>:"/\\|?*]/g, '_').trim();
        const nameWithExt = safeName.endsWith(ext) ? safeName : safeName + ext;
        const newPath = path.join(dir, nameWithExt);
        await fs.rename(doc.last_path, newPath);
        updateDocumentPath(hash, newPath);
        // Write UUID to XMP after rename
        try {
          const renamedDoc = getDocumentByHash(hash);
          if (renamedDoc?.uuid) {
            let parsedTags: string[] = [];
            try { parsedTags = renamedDoc.tags ? JSON.parse(renamedDoc.tags) : []; } catch { parsedTags = []; }
            await writeXmpMetadata(newPath, renamedDoc.uuid, parsedTags);
          }
        } catch (xmpErr) {
          console.warn('[rename-file] XMP write failed (non-fatal):', xmpErr);
        }
        return { success: true, newPath };
    } catch (err) {
        console.error('Rename file failed:', err);
        return { success: false, error: (err as Error).message };
    }
});

ipcMain.handle('run-crawler', async () => {
  if (isCrawlerRunning()) {
    log('info', '[Crawler] Manual scan requested but already running');
    return { running: true };
  }
  log('info', '[Crawler] Manual archive scan started');
  await runUuidCrawler(
    (status) => { if (mainWindow) mainWindow.webContents.send('crawler-status-changed', status); },
    () => { if (mainWindow) mainWindow.webContents.send('documents-changed'); }
  );
  log('info', '[Crawler] Manual archive scan completed');
  return { started: true };
});

ipcMain.handle('get-crawler-status', () => {
  return { running: isCrawlerRunning() };
});

ipcMain.handle('search-documents', async (_event, query: string) => {
  if (!query || query.trim().length < 2) return [];
  // Append wildcard for prefix matching; strip FTS5 special characters
  const sanitized = query.trim()
    .replace(/["*^(){}\[\]:!]/g, '')         // strip FTS5 special characters
    .replace(/\b(AND|OR|NOT)\b/gi, '')       // strip boolean operators
    .trim();
  if (!sanitized) return [];
  const safeQuery = sanitized + '*';
  return searchDocuments(safeQuery);
});

ipcMain.handle('move-file', async (_event, { hash, targetDir }: { hash: string; targetDir: string }) => {
    try {
        const doc = getDocumentByHash(hash);
        if (!doc) throw new Error('Document not found');
        const config = getConfig();
        // Security: targetDir must be within the archive
        if (!targetDir.startsWith(config.ARCHIVE_PATH)) {
            throw new Error('Target directory must be within the archive');
        }
        await fs.mkdir(targetDir, { recursive: true });
        const fileName = path.basename(doc.last_path);
        const newPath = path.join(targetDir, fileName);
        if (doc.last_path !== newPath) {
            await fs.rename(doc.last_path, newPath);
            updateDocumentPath(hash, newPath);
        }
        return { success: true, newPath };
    } catch (err) {
        console.error('Move file failed:', err);
        return { success: false, error: (err as Error).message };
    }
});

ipcMain.handle('get-log-path', () => {
  return getLogPath();
});

ipcMain.handle('set-log-path', (_event, newPath: string) => {
  setLogPath(newPath);
  return { success: true };
});

ipcMain.handle('open-log-file', async () => {
  const { shell } = await import('electron');
  const filePath = getLogPath();
  if (!filePath) return { success: false, error: 'No log path configured' };
  const result = await shell.openPath(filePath);
  return { success: result === '' };
});

ipcMain.on('open-document-from-tray', (_event, uuid: string) => {
  mainWindow?.show();
  mainWindow?.focus();
  mainWindow?.webContents.send('open-document-by-uuid', uuid);
});

ipcMain.on('hide-search-window', () => {
  searchWindow?.hide();
});
