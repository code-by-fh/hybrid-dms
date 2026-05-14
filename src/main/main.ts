import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { initDb, getAllDocuments, getSetting, setSetting, getDocumentByHash, updateDocumentMetadata, updateDocumentPath } from './db/index.js';
import { startWatcher, runHashCrawler, getConfig, processPendingDocuments } from './services/syncEngine.js';
import { checkOllamaStatus, analyzeDocumentWithAI } from './services/aiService.js';
import { performOCR } from './services/ocrService.js';
// Use direct require for pdf-parse as it is a CommonJS module
import { PDFParse } from 'pdf-parse';

// Convert import.meta.url to __dirname equivalent for ES modules
// But wait, ts-node or electron might use commonjs.
// Since we set "module": "CommonJS" in tsconfig.electron.json, __dirname is available.
const __dirname = path.resolve(); // fallback

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'dist-electron', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // allow local file loading for pdf viewer
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  // Initialize SQLite
  initDb();

  // Start Sync Engine Watcher
  startWatcher(() => {
      if (mainWindow) {
          mainWindow.webContents.send('documents-changed');
      }
  });

  // Start periodic crawler (e.g., every hour, but we'll do 1 minute for testing)
  setInterval(runHashCrawler, 60 * 1000);
  
  // Initial processing
  runHashCrawler().then(() => {
    processPendingDocuments(() => {
      if (mainWindow) {
        mainWindow.webContents.send('documents-changed');
      }
    });
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('get-documents', async () => {
    return getAllDocuments();
});

ipcMain.handle('save-and-move', async (event, { hash, tags, metadata }) => {
    try {
        const doc = getDocumentByHash(hash);
        if (!doc) throw new Error("Document not found");

        const config = getConfig();
        let fileName = path.basename(doc.last_path);
        
        // Auto-renaming based on metadata if available
        if (metadata) {
            const ext = path.extname(doc.last_path);
            const dateStr = metadata.date ? metadata.date.replace(/[^0-9-]/g, '') : '';
            const senderStr = metadata.sender ? metadata.sender.replace(/[^a-zA-Z0-9_ -]/g, '_').trim() : '';
            const typeStr = metadata.docType ? metadata.docType.replace(/[^a-zA-Z0-9_ -]/g, '_').trim() : '';
            
            let newNameParts = [];
            if (dateStr) newNameParts.push(dateStr);
            if (senderStr) newNameParts.push(senderStr);
            if (typeStr) newNameParts.push(typeStr);
            
            if (newNameParts.length > 0) {
                fileName = newNameParts.join('_').replace(/\s+/g, '_') + ext;
            }
        }
        
        let targetPath = path.join(config.ARCHIVE_PATH, fileName);

        // Ensure unique filename to avoid overwrites
        let counter = 1;
        while (await fs.stat(targetPath).then(() => true).catch(() => false) && doc.last_path !== targetPath) {
           const nameWithoutExt = path.basename(fileName, path.extname(fileName));
           targetPath = path.join(config.ARCHIVE_PATH, `${nameWithoutExt}_${counter}${path.extname(fileName)}`);
           counter++;
        }


        // Move file if not already in target path
        if (doc.last_path !== targetPath) {
            await fs.rename(doc.last_path, targetPath);
        }

        // Update DB
        updateDocumentMetadata(hash, JSON.stringify(tags), JSON.stringify(metadata), 'processed');
        updateDocumentPath(hash, targetPath);

        console.log(`Document moved to archive: ${targetPath}`);
        return { success: true };
    } catch (err) {
        console.error("Save & Move failed:", err);
        return { success: false, error: (err as Error).message };
    }
});

ipcMain.handle('move-to-processing', async (event, hash) => {
    try {
        const doc = getDocumentByHash(hash);
        if (!doc) throw new Error("Document not found");

        const config = getConfig();
        const fileName = path.basename(doc.last_path);
        const targetPath = path.join(config.PROCESSING_PATH, fileName);

        await fs.rename(doc.last_path, targetPath);
        updateDocumentPath(hash, targetPath);

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

ipcMain.handle('update-settings', async (event, newSettings) => {
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

ipcMain.handle('perform-ocr', async (event, hash) => {
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

ipcMain.handle('analyze-document', async (event, hash) => {
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

ipcMain.handle('retry-processing', async (event, hash) => {
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

ipcMain.handle('rename-file', async (event, { hash, newName }: { hash: string; newName: string }) => {
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
        return { success: true, newPath };
    } catch (err) {
        console.error('Rename file failed:', err);
        return { success: false, error: (err as Error).message };
    }
});

ipcMain.handle('move-file', async (event, { hash, targetDir }: { hash: string; targetDir: string }) => {
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
