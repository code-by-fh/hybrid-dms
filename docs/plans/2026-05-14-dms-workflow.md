# DMS Workflow Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Korrekter 3-Phasen-Workflow: Inbox (auto OCR+KI+auto-move) → Sortieren (Review) → Archiv (Umbenennen/Ordnen/Metadaten).

**Architecture:** Der syncEngine.ts-Watcher verarbeitet neue Inbox-PDFs vollautomatisch (OCR→KI). Bei Erfolg auto-move nach Sortieren, bei Fehler status=`error` in der DB. Archiv bekommt Drag&Drop via `@dnd-kit/core` + Inline-Rename via neue IPC-Handler.

**Tech Stack:** Electron IPC, chokidar, better-sqlite3, @dnd-kit/core (Drag&Drop), React 18, TypeScript, Tailwind CSS

---

### Task 1: syncEngine.ts — Fehler-Status auf `error` setzen

**Files:**
- Modify: `src/main/services/syncEngine.ts`

**Context:** Bei OCR- oder KI-Fehlern wird aktuell `status='new'` gesetzt. Soll auf `status='error'` geändert werden. `processPendingDocuments` soll auch `error`-Docs retrien.

**Step 1:** Alle 4 Stellen in `startWatcher` wo `updateDocumentStatus(hash, 'new')` nach einem Fehler aufgerufen wird, auf `'error'` ändern:
- Zeile ~118: OCR zu kurz → `updateDocumentStatus(hash, 'error')`
- Zeile ~121: OCR catch → `updateDocumentStatus(hash, 'error')`
- Zeile ~158: AI kein Ergebnis → `updateDocumentStatus(hash, 'error')`
- Zeile ~163: AI catch → `updateDocumentStatus(hash, 'error')`

**Step 2:** In `processPendingDocuments` (Zeile ~240) Bedingung erweitern:
```typescript
// ALT:
if ((isInBox || isProcessing) && metadata.needsOcr) {
// NEU:
if (isInBox && (metadata.needsOcr || doc.status === 'error')) {
```

**Step 3: Commit**
```bash
git add src/main/services/syncEngine.ts
git commit -m "fix: set status=error on OCR/AI failure, enable retry in pending scan"
```

---

### Task 2: main.ts — Neue IPC-Handler (retry, rename, move-file)

**Files:**
- Modify: `src/main/main.ts`

**Step 1:** Handler `retry-processing` am Ende der Datei einfügen:
```typescript
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
    return { success: false, error: (err as Error).message };
  }
});
```

**Step 2:** Handler `rename-file` einfügen:
```typescript
ipcMain.handle('rename-file', async (event, { hash, newName }) => {
  try {
    const doc = getDocumentByHash(hash);
    if (!doc) throw new Error('Document not found');
    const dir = path.dirname(doc.last_path);
    const ext = path.extname(doc.last_path);
    const safeName = newName.replace(/[<>:"/\\|?*]/g, '_').trim();
    const newPath = path.join(dir, safeName.endsWith(ext) ? safeName : safeName + ext);
    await fs.rename(doc.last_path, newPath);
    updateDocumentPath(hash, newPath);
    return { success: true, newPath };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
```

**Step 3:** Handler `move-file` einfügen:
```typescript
ipcMain.handle('move-file', async (event, { hash, targetDir }) => {
  try {
    const doc = getDocumentByHash(hash);
    if (!doc) throw new Error('Document not found');
    const config = getConfig();
    if (!targetDir.startsWith(config.ARCHIVE_PATH)) {
      throw new Error('Target directory must be within the archive');
    }
    await fs.mkdir(targetDir, { recursive: true });
    const fileName = path.basename(doc.last_path);
    const newPath = path.join(targetDir, fileName);
    await fs.rename(doc.last_path, newPath);
    updateDocumentPath(hash, newPath);
    return { success: true, newPath };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
```

**Step 4: Commit**
```bash
git add src/main/main.ts
git commit -m "feat: add retry-processing, rename-file, move-file IPC handlers"
```

---

### Task 3: preload.ts + vite-env.d.ts — neue APIs exponieren

**Files:**
- Modify: `src/preload/preload.ts`
- Modify: `src/vite-env.d.ts`

**Step 1:** In `preload.ts` nach `performOCR` einfügen:
```typescript
retryProcessing: (hash: string) => ipcRenderer.invoke('retry-processing', hash),
renameFile: (data: { hash: string; newName: string }) => ipcRenderer.invoke('rename-file', data),
moveFile: (data: { hash: string; targetDir: string }) => ipcRenderer.invoke('move-file', data),
```

**Step 2:** `src/vite-env.d.ts` — Window-Interface ergänzen oder erstellen:
```typescript
interface Window {
  electronAPI: {
    getDocuments: () => Promise<any[]>;
    saveAndMove: (data: any) => Promise<any>;
    onDocumentsChanged: (callback: () => void) => void;
    openDirectoryDialog: () => Promise<string | null>;
    getSettings: () => Promise<any>;
    updateSettings: (settings: any) => Promise<any>;
    moveToProcessing: (hash: string) => Promise<any>;
    checkOllamaStatus: () => Promise<boolean>;
    analyzeDocument: (hash: string) => Promise<any>;
    performOCR: (hash: string) => Promise<any>;
    retryProcessing: (hash: string) => Promise<any>;
    renameFile: (data: { hash: string; newName: string }) => Promise<any>;
    moveFile: (data: { hash: string; targetDir: string }) => Promise<any>;
  };
}
```

**Step 3: Commit**
```bash
git add src/preload/preload.ts src/vite-env.d.ts
git commit -m "feat: expose retryProcessing, renameFile, moveFile in preload bridge"
```

---

### Task 4: @dnd-kit installieren

**Files:** `package.json`

**Step 1:**
```bash
npm install @dnd-kit/core @dnd-kit/utilities
```

**Step 2: Commit**
```bash
git add package.json package-lock.json
git commit -m "chore: add @dnd-kit/core for archive drag-and-drop"
```

---

### Task 5: FileDashboard.tsx — Error-Badge für Fehlerstatus

**Files:**
- Modify: `src/renderer/components/FileDashboard.tsx`

**Step 1:** Props-Interface erweitern:
```typescript
interface FileDashboardProps {
  documents: DocumentType[];
  selectedDoc: DocumentType | null;
  onSelect: (doc: DocumentType) => void;
  isInbox?: boolean;
}
```

**Step 2:** Im `documents.map` nach `isAiProcessing` ergänzen:
```typescript
const isError = doc.status === 'error';
```

**Step 3:** Badge für Error-Status nach dem `isNew`-Badge einfügen:
```typescript
} : isError ? (
  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
    <AlertCircle className="w-3 h-3 mr-1" /> Fehler
  </span>
) : (
  // ... existing processed badge
```

**Step 4: Commit**
```bash
git add src/renderer/components/FileDashboard.tsx
git commit -m "feat: error status badge in FileDashboard"
```

---

### Task 6: Sidebar.tsx — Retry-Button + korrigierte Footer-Buttons

**Files:**
- Modify: `src/renderer/components/Sidebar.tsx`

**Step 1:** State/Konstante ergänzen (nach `isProcessing`):
```typescript
const isError = document.status === 'error';
```

**Step 2:** Retry-Handler hinzufügen:
```typescript
const handleRetry = async () => {
  setLoading(true);
  try {
    await window.electronAPI.retryProcessing(document.hash);
  } catch (e) {
    console.error('Retry failed', e);
  } finally {
    setLoading(false);
  }
};
```

**Step 3:** Error-Info-Banner nach dem `isProcessing`-Banner einfügen:
```typescript
{isError && isInbox && (
  <div className="bg-red-50 border border-red-200 p-4 rounded-lg text-sm text-red-800 mb-2 flex items-start">
    <AlertCircle className="w-5 h-5 mr-3 text-red-600 flex-shrink-0 mt-0.5" />
    <div>
      <p className="font-bold">Verarbeitung fehlgeschlagen</p>
      <p className="text-xs mt-1 opacity-80">OCR oder KI-Analyse konnte nicht abgeschlossen werden.</p>
    </div>
  </div>
)}
```

**Step 4:** Footer komplett ersetzen (den bestehenden `<div className="p-4 border-t bg-gray-50...">` Block):
```typescript
<div className="p-4 border-t bg-gray-50 flex flex-col space-y-2">
  {isInbox && isError && (
    <>
      <button
        onClick={handleRetry}
        disabled={loading}
        className="w-full py-3 px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors flex items-center justify-center font-bold shadow-md disabled:opacity-50"
      >
        <RefreshCw className={`w-5 h-5 mr-2 ${loading ? 'animate-spin' : ''}`} />
        Erneut versuchen
      </button>
      <button
        onClick={onMoveToProcessing}
        disabled={loading}
        className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center justify-center font-bold shadow-md disabled:opacity-50"
      >
        <LayoutGrid className="w-5 h-5 mr-2" />
        Manuell nach Sortieren
      </button>
    </>
  )}
  {isInbox && !isError && (
    <p className="text-center text-sm text-gray-400 py-2 italic">
      {isProcessing ? processingText : 'Warte auf automatische Verarbeitung…'}
    </p>
  )}
  {!isInbox && (
    <button
      onClick={handleSave}
      disabled={isProcessing || loading}
      className={`w-full py-3 px-4 text-white rounded-lg transition-colors flex items-center justify-center font-bold shadow-md disabled:opacity-50 ${
        isArchive ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'
      }`}
    >
      <Save className="w-5 h-5 mr-2" />
      {isArchive ? 'Metadaten aktualisieren' : 'Speichern & Archivieren'}
    </button>
  )}
</div>
```

**Step 5:** `AlertCircle` zu den Lucide-Imports hinzufügen falls noch nicht vorhanden.

**Step 6: Commit**
```bash
git add src/renderer/components/Sidebar.tsx
git commit -m "feat: retry button and corrected workflow buttons in Sidebar"
```

---

### Task 7: ArchiveTree.tsx — Drag&Drop + Inline-Rename

**Files:**
- Modify: `src/renderer/components/ArchiveTree.tsx`

**Step 1:** Imports erweitern:
```typescript
import { DndContext, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { Pencil, Check, X as XIcon } from 'lucide-react';
import path from 'path-browserify'; // HINWEIS: path-browserify für den Renderer nutzen
```

> **Hinweis:** Im Renderer läuft kein Node.js `path`. Entweder `path-browserify` installieren (`npm install path-browserify`) oder `absolutePath` direkt beim Tree-Aufbau mit String-Operationen berechnen.

**Alternative ohne path-browserify** — absolutePath direkt in useMemo berechnen:
```typescript
// Im useMemo beim Aufbau des Trees:
const absoluteNodePath = archivePath + '/' + currentPath.replace(/^\//, '');
current.children[part] = {
  name: part,
  path: currentPath,
  absolutePath: absoluteNodePath, // für useDroppable id
  isDirectory: !isFile,
  children: {},
  document: isFile ? doc : undefined
};
```

**Step 2:** TreeNode-Interface erweitern:
```typescript
interface TreeNode {
  name: string;
  path: string;
  absolutePath?: string;
  isDirectory: boolean;
  children: { [key: string]: TreeNode };
  document?: DocumentType;
}
```

**Step 3:** State in der Hauptkomponente ergänzen:
```typescript
const [renamingPath, setRenamingPath] = useState<string | null>(null);
const [renameValue, setRenameValue] = useState('');
```

**Step 4:** Handler-Funktionen:
```typescript
const handleRenameConfirm = async (node: TreeNode) => {
  if (!node.document || !renameValue.trim() || renameValue === node.name) {
    setRenamingPath(null);
    return;
  }
  await window.electronAPI.renameFile({ hash: node.document.hash, newName: renameValue.trim() });
  setRenamingPath(null);
};

const handleDragEnd = async (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;
  await window.electronAPI.moveFile({
    hash: active.id as string,
    targetDir: over.id as string,
  });
};
```

**Step 5:** `renderNode` für Ordner — `useDroppable` nutzen:
```typescript
// Für Ordner-Nodes:
const DroppableFolderWrapper = ({ node, level, children }: { node: TreeNode; level: number; children: React.ReactNode }) => {
  const { setNodeRef, isOver } = useDroppable({ id: node.absolutePath || node.path });
  const isExpanded = expandedFolders.has(node.path);
  return (
    <div ref={setNodeRef} className={`select-none rounded-md ${isOver ? 'bg-blue-50 ring-2 ring-blue-300' : ''}`}>
      <div
        className="flex items-center py-1.5 px-2 hover:bg-gray-100 cursor-pointer rounded-md"
        style={{ paddingLeft: `${level * 1.5 + 0.5}rem` }}
        onClick={() => toggleFolder(node.path)}
      >
        {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-500 mr-1" /> : <ChevronRight className="w-4 h-4 text-gray-500 mr-1" />}
        <Folder className={`w-4 h-4 mr-2 ${isOver ? 'text-blue-500' : 'text-yellow-500'}`} />
        <span className="text-sm font-medium text-gray-700">{node.name}</span>
      </div>
      {isExpanded && <div className="flex flex-col">{children}</div>}
    </div>
  );
};
```

**Step 6:** `renderNode` für Dateien — `useDraggable` + Inline-Rename:
```typescript
// Für File-Nodes:
const DraggableFileItem = ({ node, level }: { node: TreeNode; level: number }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: node.document!.hash });
  const isSelected = selectedDoc?.hash === node.document?.hash;
  const isRenaming = renamingPath === node.path;

  return (
    <div
      ref={setNodeRef}
      style={{ paddingLeft: `${level * 1.5 + 1.75}rem`, opacity: isDragging ? 0.4 : 1 }}
      className={`flex items-center py-1.5 px-2 rounded-md transition-colors group ${
        isSelected ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
      }`}
    >
      <span {...listeners} {...attributes} className="cursor-grab mr-2 flex-shrink-0">
        <FileText className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
      </span>
      {isRenaming ? (
        <div className="flex items-center flex-1 gap-1" onClick={e => e.stopPropagation()}>
          <input
            autoFocus
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleRenameConfirm(node);
              if (e.key === 'Escape') setRenamingPath(null);
            }}
            className="flex-1 text-sm border border-blue-400 rounded px-1 py-0.5 outline-none"
          />
          <button onClick={() => handleRenameConfirm(node)} className="text-green-600"><Check className="w-4 h-4" /></button>
          <button onClick={() => setRenamingPath(null)} className="text-gray-400 hover:text-red-500"><XIcon className="w-4 h-4" /></button>
        </div>
      ) : (
        <>
          <span
            className={`text-sm flex-1 cursor-pointer ${isSelected ? 'font-semibold' : 'text-gray-600'}`}
            onClick={() => node.document && onSelectDocument(node.document)}
          >
            {node.name}
          </span>
          <button
            onClick={e => { e.stopPropagation(); setRenamingPath(node.path); setRenameValue(node.name); }}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-blue-600 ml-1"
            title="Umbenennen"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
};
```

**Step 7:** `renderNode` aktualisieren um DroppableFolderWrapper und DraggableFileItem zu nutzen (statt der bisherigen div-Elemente).

**Step 8:** Rückgabe in `ArchiveTree` mit `DndContext` wrappen:
```typescript
return (
  <DndContext onDragEnd={handleDragEnd}>
    <div className="bg-white rounded-xl shadow-sm border overflow-auto p-4 h-full">
      <div className="flex flex-col">
        {renderNode(tree)}
      </div>
      {Object.keys(tree.children).length === 0 && (
        <div className="text-center py-10 text-gray-500 text-sm">
          Keine Dokumente im Archiv gefunden.
        </div>
      )}
    </div>
  </DndContext>
);
```

**Step 9: Commit**
```bash
git add src/renderer/components/ArchiveTree.tsx
git commit -m "feat: drag-and-drop and inline rename in ArchiveTree"
```

---

### Task 8: App.tsx — isInbox Prop übergeben

**Files:**
- Modify: `src/App.tsx:187-192`

**Step 1:** `isInbox` Prop an FileDashboard übergeben:
```typescript
<FileDashboard 
  documents={filteredDocuments} 
  selectedDoc={selectedDoc} 
  onSelect={setSelectedDoc}
  isInbox={currentView === 'inbox'}
/>
```

**Step 2: Commit**
```bash
git add src/App.tsx
git commit -m "feat: pass isInbox prop to FileDashboard"
```

---

### Task 9: Verifikation

**Step 1:** Dev-Server läuft bereits (`npm run dev`). Electron-Fenster öffnen.

**Step 2: Inbox-Flow testen**
1. PDF in konfigurierten Inbox-Ordner kopieren
2. App: Status-Badge `OCR Scanning` → `AI Analyzing` erscheint
3. Nach Abschluss: Dokument verschwindet aus Inbox, erscheint in Sortieren-Tab

**Step 3: Fehler-Flow testen**
1. Ollama stoppen
2. Neues PDF in Inbox legen
3. Status-Badge `Fehler` erscheint, Sidebar zeigt Retry-Button
4. Ollama starten, `Erneut versuchen` klicken → Verarbeitung startet erneut

**Step 4: Sortieren-Flow testen**
1. Dokument in Sortieren-Tab anklicken
2. KI-Metadaten prüfen, anpassen
3. `Speichern & Archivieren` → Dokument im Archiv-Tab sichtbar

**Step 5: Archiv-Flow testen**
1. Datei: Pencil-Icon hover → klicken → Inline-Input → Enter
2. Datei per Drag auf Ordner ziehen → blaues Highlight → loslassen
3. Datei anklicken → Metadaten in Sidebar

**Step 6: Final Commit**
```bash
git add -A
git commit -m "feat: complete DMS 3-phase workflow implementation"
```
