# UUID Identity, XMP Tags, FTS5 Search, System Tray — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hash-based document identity with UUID-in-XMP so tags survive any move/rename; add FTS5 full-text search and a hotkey-accessible system tray search window.

**Architecture:** Each PDF gets a UUID written into its Subject metadata field on first import (via pdf-lib). The DB uses UUID as the primary identifier; SHA256 hash is kept only for deduplication on inbox import. A UUID crawler replaces the old every-minute hash crawler, running only on startup and on manual trigger. FTS5 powers both in-app search and a second Electron window reachable via Ctrl+Alt+D.

**Tech Stack:** Electron 33, better-sqlite3 (FTS5), pdf-lib 1.17, chokidar, React 19, Tailwind CSS, TypeScript, lucide-react. No new npm packages needed (crypto.randomUUID() is built into Node.js 18+).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/main/db/index.ts` | Modify | Add uuid/full_text columns, FTS5 table, new DB functions |
| `src/main/services/xmpService.ts` | Create | Read/write UUID + tags via pdf-lib Subject+Keywords fields |
| `src/main/services/syncEngine.ts` | Modify | UUID-first watcher logic, replace hash crawler with UUID crawler |
| `src/main/main.ts` | Modify | Tray, hotkey, crawler IPC, search IPC, search window creation |
| `src/preload/preload.ts` | Modify | Expose new IPC: runCrawler, getCrawlerStatus, searchDocuments, onCrawlerStatus |
| `src/App.tsx` | Modify | Add uuid to DocumentType; update search to use FTS5 IPC; use uuid in handlers |
| `src/renderer/components/NavSidebar.tsx` | Modify | Add "Archiv scannen" crawler button with running state |
| `src/renderer/components/Sidebar.tsx` | Modify | Pass uuid instead of hash to IPC calls |
| `src/renderer/components/SearchWindow.tsx` | Create | Compact always-on-top search UI for tray window |
| `src/search.tsx` | Create | React entry point for search window |
| `src/search.html` | Create | HTML entry point for search window |
| `resources/tray-icon.png` | Create | 16×16 PNG tray icon (white document silhouette) |
| `vite.config.ts` | Modify | Add search.html as second Vite entry point |

---

## Task 1: DB Schema — UUID + FTS5

**Files:**
- Modify: `src/main/db/index.ts`
- Modify: `src/App.tsx` (DocumentType interface only)

- [ ] **Step 1.1: Add uuid and full_text columns + FTS5 table in initDb()**

Replace the `initDb` function in `src/main/db/index.ts`:

```typescript
export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT,
      hash TEXT NOT NULL,
      last_path TEXT NOT NULL,
      tags TEXT,
      metadata TEXT,
      full_text TEXT,
      status TEXT DEFAULT 'new',
      indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      uuid,
      full_text,
      tokenize='unicode61'
    );
  `);

  // Migration: add uuid column if it doesn't exist yet (for existing DBs)
  const cols = (db.prepare("PRAGMA table_info(documents)").all() as any[]).map(c => c.name);
  if (!cols.includes('uuid')) {
    db.exec("ALTER TABLE documents ADD COLUMN uuid TEXT");
  }
  if (!cols.includes('full_text')) {
    db.exec("ALTER TABLE documents ADD COLUMN full_text TEXT");
  }

  // Assign UUIDs to existing rows that have none
  const rowsWithoutUuid = db.prepare("SELECT id FROM documents WHERE uuid IS NULL OR uuid = ''").all() as any[];
  const updateUuid = db.prepare("UPDATE documents SET uuid = ? WHERE id = ?");
  const insertFts = db.prepare("INSERT OR IGNORE INTO documents_fts (uuid, full_text) VALUES (?, '')");
  for (const row of rowsWithoutUuid) {
    const newUuid = crypto.randomUUID();
    updateUuid.run(newUuid, row.id);
    insertFts.run(newUuid);
  }
}
```

Add `import crypto from 'crypto';` at the top of `src/main/db/index.ts`.

- [ ] **Step 1.2: Add new DB functions**

Append these functions to `src/main/db/index.ts`:

```typescript
export function getDocumentByUuid(uuid: string) {
  return db.prepare('SELECT * FROM documents WHERE uuid = ?').get(uuid) as any;
}

export function insertDocumentWithUuid(
  uuid: string, hash: string, lastPath: string,
  tags?: string, metadata?: string, status: string = 'new'
) {
  const stmt = db.prepare(
    'INSERT INTO documents (uuid, hash, last_path, tags, metadata, status) VALUES (?, ?, ?, ?, ?, ?)'
  );
  stmt.run(uuid, hash, lastPath, tags || '[]', metadata || '{}', status);
  db.prepare("INSERT OR IGNORE INTO documents_fts (uuid, full_text) VALUES (?, '')").run(uuid);
}

export function updateFullText(uuid: string, fullText: string) {
  db.prepare('UPDATE documents SET full_text = ? WHERE uuid = ?').run(fullText, uuid);
  db.prepare('DELETE FROM documents_fts WHERE uuid = ?').run(uuid);
  db.prepare('INSERT INTO documents_fts (uuid, full_text) VALUES (?, ?)').run(uuid, fullText);
}

export function searchDocuments(query: string): any[] {
  return db.prepare(`
    SELECT d.uuid, d.last_path, d.tags, d.metadata, d.status,
           snippet(documents_fts, 1, '<mark>', '</mark>', '...', 20) AS snippet
    FROM documents_fts f
    JOIN documents d ON d.uuid = f.uuid
    WHERE documents_fts MATCH ?
    ORDER BY rank
    LIMIT 50
  `).all(query) as any[];
}

export function deleteDocumentByUuid(uuid: string) {
  db.prepare('DELETE FROM documents_fts WHERE uuid = ?').run(uuid);
  db.prepare('DELETE FROM documents WHERE uuid = ?').run(uuid);
}

export function getUuidByHash(hash: string): string | null {
  const row = db.prepare('SELECT uuid FROM documents WHERE hash = ?').get(hash) as any;
  return row ? row.uuid : null;
}
```

- [ ] **Step 1.3: Update DocumentType in App.tsx**

In `src/App.tsx`, update the `DocumentType` interface:

```typescript
export interface DocumentType {
  id: number;
  uuid: string;
  hash: string;
  last_path: string;
  tags: string;
  metadata: string;
  status: string;
  indexed_at: string;
}
```

- [ ] **Step 1.4: Commit**

```bash
git add src/main/db/index.ts src/App.tsx
git commit -m "feat: add UUID and FTS5 to DB schema with migration for existing rows"
```

---

## Task 2: XMP Service — Read/Write UUID + Tags via pdf-lib

**Files:**
- Create: `src/main/services/xmpService.ts`

- [ ] **Step 2.1: Create xmpService.ts**

Create `src/main/services/xmpService.ts`:

```typescript
import { PDFDocument } from 'pdf-lib';
import fs from 'fs/promises';

const UUID_PREFIX = 'dms-uuid:';

export async function readDocumentUuid(filePath: string): Promise<string | null> {
  try {
    const bytes = await fs.readFile(filePath);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const subject = doc.getSubject();
    if (subject && subject.startsWith(UUID_PREFIX)) {
      return subject.slice(UUID_PREFIX.length);
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeXmpMetadata(
  filePath: string,
  uuid: string,
  tags: string[],
  textExcerpt: string = ''
): Promise<void> {
  const bytes = await fs.readFile(filePath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  doc.setSubject(`${UUID_PREFIX}${uuid}`);
  doc.setKeywords(tags);
  if (textExcerpt) {
    // Store first 500 chars of text as the PDF description for Windows Search
    doc.setProducer(textExcerpt.slice(0, 500));
  }
  const savedBytes = await doc.save();
  await fs.writeFile(filePath, savedBytes);
}
```

- [ ] **Step 2.2: Commit**

```bash
git add src/main/services/xmpService.ts
git commit -m "feat: add xmpService to read/write document UUID and tags via pdf-lib"
```

---

## Task 3: Inbox Pipeline — UUID Generation + XMP Write + FTS5

**Files:**
- Modify: `src/main/services/syncEngine.ts`
- Modify: `src/main/db/index.ts` (update insertDocument to insertDocumentWithUuid calls)

- [ ] **Step 3.1: Update imports in syncEngine.ts**

At the top of `src/main/services/syncEngine.ts`, add to the imports:

```typescript
import crypto from 'crypto';
import { readDocumentUuid, writeXmpMetadata } from './xmpService.js';
import {
  getDocumentByHash, getDocumentByUuid, insertDocumentWithUuid,
  updateDocumentPath, getAllDocuments, getSetting, updateDocumentMetadata,
  deleteDocumentByPath, updateDocumentStatus, updateFullText, getUuidByHash
} from '../db/index.js';
```

Remove the old `insertDocument` import — replace it with `insertDocumentWithUuid`.

- [ ] **Step 3.2: Update processInboxFile to generate UUID, write XMP, store full_text**

Replace the entire `processInboxFile` function in `src/main/services/syncEngine.ts`:

```typescript
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

  // Write UUID + tags to PDF XMP
  try {
    await writeXmpMetadata(normalizedPath, uuid, tags, extractedText.slice(0, 500));
  } catch (xmpErr) {
    console.warn(`[Pipeline] XMP write failed (non-fatal):`, xmpErr);
  }

  const processingPath = path.join(config.PROCESSING_PATH, newFileName);
  try {
    let finalProcessingPath = processingPath;
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
  }

  if (onDbChange) onDbChange();
}
```

- [ ] **Step 3.3: Update watcher to pass uuid into processInboxFile**

In the `startWatcher` function, update the `add` event handler. Replace the section that calls `enqueueInboxFile` with:

```typescript
currentWatcher.on('add', async (filePath) => {
  const normalizedPath = path.normalize(filePath);
  try {
    const config = getConfig();
    const filePathLower = normalizedPath.toLowerCase();
    const isInInboxDir = filePathLower.startsWith(path.normalize(config.INBOX_PATH).toLowerCase());

    // Try UUID from XMP first (fast path for known files)
    const xmpUuid = await readDocumentUuid(normalizedPath);
    if (xmpUuid) {
      const existing = getDocumentByUuid(xmpUuid);
      if (existing) {
        if (path.normalize(existing.last_path).toLowerCase() !== filePathLower) {
          updateDocumentPath(existing.hash, normalizedPath);
          if (onDbChange) onDbChange();
        }
        if (!isInInboxDir) return; // Known file outside inbox — path updated, done
      }
    }

    // Hash-based path (new files or migration)
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
```

- [ ] **Step 3.4: Commit**

```bash
git add src/main/services/syncEngine.ts
git commit -m "feat: update inbox pipeline to generate UUID, write XMP, and store full_text in FTS5"
```

---

## Task 4: UUID Crawler — Replace Hash Crawler

**Files:**
- Modify: `src/main/services/syncEngine.ts`
- Modify: `src/main/main.ts`
- Modify: `src/renderer/components/NavSidebar.tsx`
- Modify: `src/preload/preload.ts`

- [ ] **Step 4.1: Add UUID crawler to syncEngine.ts**

Remove the `runHashCrawler` function entirely from `src/main/services/syncEngine.ts`. Add this instead:

```typescript
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
            if (path.normalize(existing.last_path) !== normalizedPath) {
              console.log(`[Crawler] Path updated for ${xmpUuid}`);
              updateDocumentPath(existing.hash, normalizedPath);
              if (onDbChange) onDbChange();
            }
          } else {
            // UUID in PDF but not in DB (e.g., other computer imported it)
            const hash = await calculateHash(normalizedPath);
            insertDocumentWithUuid(xmpUuid, hash, normalizedPath, '[]', '{}', 'processed');
            if (onDbChange) onDbChange();
          }
        } else {
          // No UUID in PDF — assign one and write it
          const hash = await calculateHash(normalizedPath);
          const existingByHash = getDocumentByHash(hash);
          const uuid = existingByHash?.uuid || crypto.randomUUID();
          await writeXmpMetadata(normalizedPath, uuid, existingByHash
            ? JSON.parse(existingByHash.tags || '[]')
            : []
          );
          if (!existingByHash) {
            insertDocumentWithUuid(uuid, hash, normalizedPath, '[]', '{}', 'processed');
            if (onDbChange) onDbChange();
          } else if (!existingByHash.uuid) {
            // Existing row had no uuid — update it
            import('../db/index.js').then(db => {
              db.default.prepare('UPDATE documents SET uuid = ? WHERE hash = ?').run(uuid, hash);
            });
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
```

Also add `import { readDocumentUuid, writeXmpMetadata } from './xmpService.js';` if not already there from Task 3.

Export `runUuidCrawler` and remove the export of `runHashCrawler`.

- [ ] **Step 4.2: Update main.ts — replace hash crawler with UUID crawler**

In `src/main/main.ts`:

1. Replace `import { startWatcher, runHashCrawler, getConfig, processPendingDocuments }` with:
```typescript
import { startWatcher, runUuidCrawler, isCrawlerRunning, getConfig, processPendingDocuments } from './services/syncEngine.js';
```

2. Replace the `app.whenReady()` startup block's crawler section:

Old:
```typescript
// Start periodic crawler (e.g., every hour, but we'll do 1 minute for testing)
setInterval(runHashCrawler, 60 * 1000);

// Initial processing
runHashCrawler().then(() => {
  processPendingDocuments(...)
});
```

New:
```typescript
// Run UUID crawler on startup (healing scan + first-time migration)
runUuidCrawler(
  (status) => { if (mainWindow) mainWindow.webContents.send('crawler-status-changed', status); },
  () => { if (mainWindow) mainWindow.webContents.send('documents-changed'); }
).then(() => {
  processPendingDocuments(() => {
    if (mainWindow) mainWindow.webContents.send('documents-changed');
  });
});
```

3. Add IPC handlers for crawler control:
```typescript
ipcMain.handle('run-crawler', async () => {
  if (isCrawlerRunning()) return { running: true };
  runUuidCrawler(
    (status) => { if (mainWindow) mainWindow.webContents.send('crawler-status-changed', status); },
    () => { if (mainWindow) mainWindow.webContents.send('documents-changed'); }
  );
  return { started: true };
});

ipcMain.handle('get-crawler-status', () => {
  return { running: isCrawlerRunning() };
});
```

- [ ] **Step 4.3: Update preload.ts — expose crawler IPC**

In `src/preload/preload.ts`, add to the exposed API:

```typescript
runCrawler: () => ipcRenderer.invoke('run-crawler'),
getCrawlerStatus: () => ipcRenderer.invoke('get-crawler-status'),
onCrawlerStatusChanged: (callback: (status: 'running' | 'idle') => void) => {
  ipcRenderer.removeAllListeners('crawler-status-changed');
  ipcRenderer.on('crawler-status-changed', (_event, status) => callback(status));
},
```

- [ ] **Step 4.4: Add crawler button to NavSidebar**

Read `src/renderer/components/NavSidebar.tsx` first, then add a crawler trigger button. Add `crawlerRunning` prop to the interface and a button at the bottom of the sidebar:

In `NavSidebar.tsx`, add to the props interface:
```typescript
crawlerRunning?: boolean;
onRunCrawler?: () => void;
```

Add this button near the bottom of the sidebar JSX (above or below the settings button):
```tsx
<button
  onClick={onRunCrawler}
  disabled={crawlerRunning}
  title={crawlerRunning ? 'Archiv wird gescannt…' : 'Archiv scannen'}
  className="p-2 rounded-lg transition-colors text-text-subtle hover:text-accent-primary hover:bg-bg-surface disabled:opacity-40 disabled:cursor-not-allowed"
>
  <RefreshCw className={`w-5 h-5 ${crawlerRunning ? 'animate-spin' : ''}`} />
</button>
```

Import `RefreshCw` from `lucide-react` if not already imported.

- [ ] **Step 4.5: Wire crawler state in App.tsx**

In `src/App.tsx`:

1. Add state: `const [crawlerRunning, setCrawlerRunning] = useState(false)`

2. In the `useEffect`, add:
```typescript
window.electronAPI.getCrawlerStatus().then(s => setCrawlerRunning(s.running));
window.electronAPI.onCrawlerStatusChanged((status) => {
  setCrawlerRunning(status === 'running');
});
```

3. Add handler:
```typescript
const handleRunCrawler = async () => {
  await window.electronAPI.runCrawler();
};
```

4. Pass to NavSidebar:
```tsx
<NavSidebar
  ...
  crawlerRunning={crawlerRunning}
  onRunCrawler={handleRunCrawler}
/>
```

- [ ] **Step 4.6: Commit**

```bash
git add src/main/services/syncEngine.ts src/main/main.ts src/preload/preload.ts \
        src/renderer/components/NavSidebar.tsx src/App.tsx
git commit -m "feat: replace hash crawler with UUID crawler; add manual trigger button"
```

---

## Task 5: FTS5 Search IPC + Update In-App Search

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/App.tsx`
- Modify: `src/main/db/index.ts` (already done in Task 1 — `searchDocuments` function)

- [ ] **Step 5.1: Add search IPC handler in main.ts**

In `src/main/main.ts`, add import for `searchDocuments`:
```typescript
import { ..., searchDocuments } from './db/index.js';
```

Add the IPC handler:
```typescript
ipcMain.handle('search-documents', async (_event, query: string) => {
  if (!query || query.trim().length < 2) return [];
  // Escape special FTS5 characters and append wildcard
  const safeQuery = query.trim().replace(/["*^]/g, '') + '*';
  return searchDocuments(safeQuery);
});
```

- [ ] **Step 5.2: Expose search in preload.ts**

Add to `src/preload/preload.ts`:
```typescript
searchDocuments: (query: string) => ipcRenderer.invoke('search-documents', query),
```

- [ ] **Step 5.3: Update App.tsx search to use FTS5**

In `src/App.tsx`:

1. Add debounced FTS5 search. Replace the `filteredDocuments` logic:

```typescript
const [ftsResults, setFtsResults] = useState<DocumentType[] | null>(null);

useEffect(() => {
  if (!searchQuery || searchQuery.trim().length < 2) {
    setFtsResults(null);
    return;
  }
  const timer = setTimeout(async () => {
    const results = await window.electronAPI.searchDocuments(searchQuery);
    setFtsResults(results);
  }, 200);
  return () => clearTimeout(timer);
}, [searchQuery]);

const filteredDocuments = ftsResults !== null
  ? ftsResults
  : documents.filter(doc => {
      if (!settings) return true;
      if (currentView === 'inbox') return doc.last_path.startsWith(settings.INBOX_PATH);
      if (currentView === 'sort') return doc.last_path.startsWith(settings.PROCESSING_PATH);
      if (currentView === 'archive') return doc.last_path.startsWith(settings.ARCHIVE_PATH);
      return true;
    });
```

- [ ] **Step 5.4: Update save-and-move and related IPC in main.ts to write XMP on tag save**

In the `save-and-move` IPC handler in `src/main/main.ts`, after `updateDocumentMetadata`, add XMP write:

```typescript
// Write updated tags + UUID to PDF XMP
import { writeXmpMetadata } from './services/xmpService.js';
// (add this import at top of file)

// Inside the handler, after updateDocumentMetadata:
try {
  await writeXmpMetadata(targetPath, doc.uuid, Array.isArray(tags) ? tags : JSON.parse(tags), '');
} catch (e) {
  console.warn('[save-and-move] XMP write failed (non-fatal):', e);
}
```

Also update `rename-file` IPC to write XMP after rename:
```typescript
// After updateDocumentPath(hash, newPath):
try {
  const doc2 = getDocumentByHash(hash);
  if (doc2?.uuid) {
    const currentTags = JSON.parse(doc2.tags || '[]');
    await writeXmpMetadata(newPath, doc2.uuid, currentTags, '');
  }
} catch (e) {
  console.warn('[rename-file] XMP write failed (non-fatal):', e);
}
```

- [ ] **Step 5.5: Commit**

```bash
git add src/main/main.ts src/preload/preload.ts src/App.tsx
git commit -m "feat: add FTS5 search IPC and update in-app search to use full-text index"
```

---

## Task 6: System Tray + Search Window

**Files:**
- Create: `resources/tray-icon.png`
- Create: `src/search.html`
- Create: `src/search.tsx`
- Create: `src/renderer/components/SearchWindow.tsx`
- Modify: `src/main/main.ts`
- Modify: `vite.config.ts`

- [ ] **Step 6.1: Create tray icon**

Create `resources/tray-icon.png` — a 16×16 or 32×32 PNG. Use the following base64 PNG (white document icon on transparent background, copy and decode):

Since creating a binary PNG requires a script, run this in the project root:

```bash
node -e "
const {createCanvas} = require('canvas');
const fs = require('fs');
const c = createCanvas(32,32);
const ctx = c.getContext('2d');
ctx.fillStyle = 'rgba(0,0,0,0)';
ctx.fillRect(0,0,32,32);
ctx.fillStyle = '#ffffff';
ctx.fillRect(6,2,20,28);
ctx.fillStyle = '#cccccc';
ctx.fillRect(6,2,20,2);
ctx.fillRect(6,6,14,2);
ctx.fillRect(6,10,18,2);
ctx.fillRect(6,14,16,2);
fs.mkdirSync('resources',{recursive:true});
fs.writeFileSync('resources/tray-icon.png', c.toBuffer('image/png'));
console.log('done');
"
```

- [ ] **Step 6.2: Create search.html**

Create `src/search.html`:

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DMS Suche</title>
  </head>
  <body>
    <div id="search-root"></div>
    <script type="module" src="/src/search.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6.3: Create SearchWindow.tsx component**

Create `src/renderer/components/SearchWindow.tsx`:

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { Search, FileText, X } from 'lucide-react';

interface SearchResult {
  uuid: string;
  last_path: string;
  tags: string;
  metadata: string;
  snippet: string;
}

export const SearchWindow: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await window.electronAPI.searchDocuments(query);
        setResults(res);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const handleOpen = (result: SearchResult) => {
    window.electronAPI.openDocumentFromTray?.(result.uuid);
  };

  const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;
  const meta = (r: SearchResult) => {
    try {
      const m = JSON.parse(r.metadata || '{}');
      return [m.date, m.sender, m.docType].filter(Boolean).join(' · ');
    } catch { return ''; }
  };

  return (
    <div className="flex flex-col h-screen bg-bg-surface text-text-main font-sans select-none">
      {/* Search input */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-base bg-bg-app">
        <Search className="w-4 h-4 text-text-subtle shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Dokument suchen…"
          className="flex-1 bg-transparent outline-none text-text-main placeholder:text-text-subtle text-sm"
          onKeyDown={e => { if (e.key === 'Escape') window.close(); }}
        />
        {loading && <div className="w-3 h-3 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {results.length === 0 && query.trim().length >= 2 && !loading && (
          <p className="text-center text-text-subtle text-xs py-8">Keine Ergebnisse</p>
        )}
        {results.map(r => (
          <button
            key={r.uuid}
            onClick={() => handleOpen(r)}
            className="w-full text-left px-3 py-2.5 hover:bg-bg-app border-b border-border-base last:border-0 transition-colors"
          >
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-accent-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{fileName(r.last_path)}</p>
                {meta(r) && <p className="text-xs text-text-subtle truncate">{meta(r)}</p>}
                {r.snippet && (
                  <p
                    className="text-xs text-text-subtle mt-0.5 line-clamp-2"
                    dangerouslySetInnerHTML={{ __html: r.snippet }}
                  />
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 6.4: Create search.tsx entry point**

Create `src/search.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { SearchWindow } from './renderer/components/SearchWindow';
import './index.css';

ReactDOM.createRoot(document.getElementById('search-root')!).render(
  <React.StrictMode>
    <SearchWindow />
  </React.StrictMode>
);
```

- [ ] **Step 6.5: Update vite.config.ts for second entry point**

Replace `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import tailwindcss from '@tailwindcss/vite'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    electron({
      main: {
        entry: 'src/main/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['better-sqlite3', 'pdf-parse', 'chokidar', 'pdf-lib', 'tesseract.js', 'pdfjs-dist/legacy/build/pdf.mjs', 'canvas']
            }
          }
        }
      },
      preload: {
        input: 'src/preload/preload.ts',
      },
    }),
    renderer(),
  ],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        search: 'src/search.html',
      },
    },
  },
})
```

- [ ] **Step 6.6: Add Tray + hotkey + search window in main.ts**

In `src/main/main.ts`:

1. Add imports at the top:
```typescript
import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, globalShortcut, nativeImage } from 'electron';
import path from 'path';
```

2. Add variables after `let mainWindow`:
```typescript
let tray: Tray | null = null;
let searchWindow: BrowserWindow | null = null;
```

3. Add `createSearchWindow` function:
```typescript
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
      preload: path.join(__dirname, 'dist-electron', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    searchWindow.loadURL(process.env.VITE_DEV_SERVER_URL + 'src/search.html');
  } else {
    searchWindow.loadFile(path.join(__dirname, 'dist', 'src', 'search.html'));
  }

  searchWindow.on('blur', () => searchWindow?.hide());
}
```

4. Add `createTray` function:
```typescript
function createTray() {
  const iconPath = path.join(app.getAppPath(), 'resources', 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);

  const menu = Menu.buildFromTemplate([
    { label: 'Suche öffnen (Strg+Alt+D)', click: createSearchWindow },
    { label: 'Hauptfenster', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Beenden', click: () => app.quit() },
  ]);
  tray.setToolTip('DMS Dokumentenarchiv');
  tray.setContextMenu(menu);
  tray.on('click', createSearchWindow);
}
```

5. In `app.whenReady()`, after `createWindow()`, add:
```typescript
createTray();
globalShortcut.register('CommandOrControl+Alt+D', createSearchWindow);
```

6. Add IPC handler so search window can open a document in the main window:
```typescript
ipcMain.on('open-document-from-tray', (_event, uuid: string) => {
  mainWindow?.show();
  mainWindow?.focus();
  mainWindow?.webContents.send('open-document-by-uuid', uuid);
});
```

7. In `app.on('will-quit')`, unregister shortcuts:
```typescript
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
```

- [ ] **Step 6.7: Expose tray IPC in preload.ts**

Add to `src/preload/preload.ts`:

```typescript
openDocumentFromTray: (uuid: string) => ipcRenderer.send('open-document-from-tray', uuid),
onOpenDocumentByUuid: (callback: (uuid: string) => void) => {
  ipcRenderer.removeAllListeners('open-document-by-uuid');
  ipcRenderer.on('open-document-by-uuid', (_event, uuid) => callback(uuid));
},
```

- [ ] **Step 6.8: Handle open-document-by-uuid in App.tsx**

In the `useEffect` in `src/App.tsx`, add:

```typescript
window.electronAPI.onOpenDocumentByUuid?.((uuid: string) => {
  const doc = documents.find(d => d.uuid === uuid);
  if (doc) setSelectedDoc(doc);
});
```

- [ ] **Step 6.9: Start dev server and verify**

```bash
npm run dev
```

Verify:
- App starts, tray icon appears in system tray
- `Ctrl+Alt+D` opens the search window
- Typing in the search window returns FTS5 results
- Clicking a result brings the main window to front and selects the document
- Crawler button in NavSidebar shows spinner while running, disabled when active
- Moving a file in Windows Explorer updates the path in app without losing tags

- [ ] **Step 6.10: Commit**

```bash
git add src/search.html src/search.tsx src/renderer/components/SearchWindow.tsx \
        src/main/main.ts src/preload/preload.ts src/App.tsx vite.config.ts resources/
git commit -m "feat: add system tray, Ctrl+Alt+D search window, and global hotkey"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] UUID as document identity — Tasks 1, 3, 4
- [x] Tags written to PDF XMP (hybrid) — Tasks 2, 3, 5
- [x] UUID Crawler replacing hash crawler — Task 4
- [x] Manual crawler trigger with running state — Task 4
- [x] FTS5 full-text search — Tasks 1, 5
- [x] Windows Search via XMP keywords/subject — Task 2 (Keywords = tags indexed by Windows Search)
- [x] System Tray icon — Task 6
- [x] Ctrl+Alt+D hotkey — Task 6
- [x] Search window (400×500, always-on-top, closes on blur) — Task 6
- [x] Click result → open in main window — Task 6
- [x] Multi-computer safe (UUID read before write) — Tasks 2, 4

**Type consistency:**
- `processInboxFile(uuid, hash, normalizedPath, onDbChange)` — signature defined in Task 3, called in Task 3 watcher update
- `insertDocumentWithUuid` — defined in Task 1, used in Tasks 3 and 4
- `runUuidCrawler` — defined in Task 4, imported in main.ts Task 4
- `DocumentType.uuid` — added in Task 1, used in Task 6

**No placeholders:** All code blocks are complete.
