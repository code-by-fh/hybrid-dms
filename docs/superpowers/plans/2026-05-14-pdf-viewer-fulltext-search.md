# PDF-Viewer & Volltextsuche Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PDF-Viewer als Vollbild-Modal via react-pdf + Volltextsuche-Bugfix in App.tsx

**Architecture:** Neue `PdfViewerModal`-Komponente mit react-pdf. Sidebar bekommt `onOpenPdf`-Callback. App.tsx: Suchlogik so umbauen, dass `searchQuery` Vorrang vor View-Filter hat.

**Tech Stack:** React 19, react-pdf v9, pdfjs-dist (bereits installiert), TypeScript, Tailwind CSS, Electron 33

---

## Dateiübersicht

| Datei | Art |
|-------|-----|
| `src/renderer/components/PdfViewerModal.tsx` | Neu |
| `src/renderer/components/Sidebar.tsx` | Änderung: `onOpenPdf` Prop + Button |
| `src/App.tsx` | Änderung: Such-Logik, Modal-State |
| `package.json` | Änderung: react-pdf hinzufügen |

---

## Task 1: react-pdf installieren

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Paket installieren**

```bash
npm install react-pdf@^9
```

Expected: react-pdf und zugehörige Typen landen in node_modules, package.json wird aktualisiert.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add react-pdf for PDF viewer"
```

---

## Task 2: PdfViewerModal erstellen

**Files:**
- Create: `src/renderer/components/PdfViewerModal.tsx`

- [ ] **Step 1: Komponente schreiben**

`src/renderer/components/PdfViewerModal.tsx`:

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfViewerModalProps {
  filePath: string;
  fileName: string;
  onClose: () => void;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({ filePath, fileName, onClose }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.2);

  const fileUrl = filePath.startsWith('file://') ? filePath : `file:///${filePath.replace(/\\/g, '/')}`;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setPageNumber(p => Math.min(p + 1, numPages));
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setPageNumber(p => Math.max(p - 1, 1));
  }, [onClose, numPages]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 bg-gray-800 border-b border-gray-700 shrink-0">
        <span className="text-white font-medium text-sm truncate max-w-xs">{fileName}</span>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setPageNumber(p => Math.max(p - 1, 1))}
            disabled={pageNumber <= 1}
            className="p-1.5 rounded text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-gray-300 text-sm tabular-nums">
            Seite {pageNumber} / {numPages || '…'}
          </span>
          <button
            onClick={() => setPageNumber(p => Math.min(p + 1, numPages))}
            disabled={pageNumber >= numPages}
            className="p-1.5 rounded text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div className="w-px h-5 bg-gray-600 mx-1" />

          <button
            onClick={() => setScale(s => Math.max(s - 0.2, 0.4))}
            className="p-1.5 rounded text-gray-300 hover:text-white hover:bg-gray-700"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <span className="text-gray-400 text-xs w-10 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale(s => Math.min(s + 0.2, 3))}
            className="p-1.5 rounded text-gray-300 hover:text-white hover:bg-gray-700"
          >
            <ZoomIn className="w-5 h-5" />
          </button>

          <div className="w-px h-5 bg-gray-600 mx-1" />

          <button
            onClick={onClose}
            className="p-1.5 rounded text-gray-300 hover:text-white hover:bg-red-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* PDF Content */}
      <div className="flex-1 overflow-auto flex justify-center py-6 bg-gray-900">
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages }) => { setNumPages(numPages); setPageNumber(1); }}
          onLoadError={(err) => console.error('PDF load error:', err)}
          loading={<div className="text-gray-400 mt-20">PDF wird geladen…</div>}
          error={<div className="text-red-400 mt-20">PDF konnte nicht geladen werden.</div>}
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={true}
          />
        </Document>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/PdfViewerModal.tsx
git commit -m "feat: add PdfViewerModal component with react-pdf"
```

---

## Task 3: Sidebar — onOpenPdf Button

**Files:**
- Modify: `src/renderer/components/Sidebar.tsx`

- [ ] **Step 1: Props erweitern und Button hinzufügen**

In `src/renderer/components/Sidebar.tsx`:

Zeile 7 — Interface erweitern:
```tsx
interface SidebarProps {
  document: DocumentType;
  isInbox?: boolean;
  isArchive?: boolean;
  onSave: (tags: string[], metadata: any) => void;
  onMoveToProcessing?: () => void;
  onOpenPdf?: () => void;
  onClose: () => void;
}
```

Zeile 14 — Destructuring erweitern:
```tsx
export const Sidebar: React.FC<SidebarProps> = ({ document, isInbox, isArchive, onSave, onMoveToProcessing, onOpenPdf, onClose }) => {
```

Import ergänzen — `FileText` zu den bestehenden lucide-react Imports hinzufügen:
```tsx
import { X, Save, FileBox, Tag, User, Calendar, Cpu, LayoutGrid, RefreshCw, AlertCircle, FolderInput, Clock, FileText } from 'lucide-react';
```

Nach dem `{/* Filename badge */}` Block (nach Zeile ~116), vor den Status-Bannern, Button einfügen:
```tsx
{/* PDF Viewer */}
{onOpenPdf && (
  <button
    onClick={onOpenPdf}
    className="w-full py-2 px-4 border border-gray-200 text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-center text-sm font-medium"
  >
    <FileText className="w-4 h-4 mr-2 text-blue-500" />
    PDF anzeigen
  </button>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/Sidebar.tsx
git commit -m "feat: add PDF viewer button to Sidebar"
```

---

## Task 4: App.tsx — Suchlogik + Modal-State

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import und State hinzufügen**

Import ergänzen (oben in App.tsx):
```tsx
import { PdfViewerModal } from './renderer/components/PdfViewerModal';
```

Nach `const [ollamaStatus, setOllamaStatus] = useState(false)` neuen State hinzufügen:
```tsx
const [pdfViewerDoc, setPdfViewerDoc] = useState<DocumentType | null>(null);
```

- [ ] **Step 2: filteredDocuments Logik reparieren**

Die bestehende `filteredDocuments`-Berechnung (Zeilen 72–95) ersetzen durch:

```tsx
const filteredDocuments = documents.filter(doc => {
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    let meta: any = {};
    try { meta = doc.metadata ? JSON.parse(doc.metadata) : {}; } catch {}
    return (
      doc.last_path.toLowerCase().includes(q) ||
      (doc.tags || '').toLowerCase().includes(q) ||
      (meta.sender || '').toLowerCase().includes(q) ||
      (meta.docType || '').toLowerCase().includes(q) ||
      (meta.archivePath || '').toLowerCase().includes(q)
    );
  }
  if (!settings) return true;
  if (currentView === 'inbox') return doc.last_path.startsWith(settings.INBOX_PATH);
  if (currentView === 'sort') return doc.last_path.startsWith(settings.PROCESSING_PATH);
  if (currentView === 'archive') return doc.last_path.startsWith(settings.ARCHIVE_PATH);
  return true;
});
```

- [ ] **Step 3: Sidebar onOpenPdf Callback verdrahten**

In der `<Sidebar>` Komponente (Zeilen ~207–214) `onOpenPdf` prop hinzufügen:
```tsx
<Sidebar 
  document={selectedDoc} 
  isInbox={currentView === 'inbox'}
  isArchive={currentView === 'archive'}
  onSave={handleSaveAndMove}
  onMoveToProcessing={() => handleMoveToProcessing(selectedDoc.hash)}
  onOpenPdf={() => setPdfViewerDoc(selectedDoc)}
  onClose={() => setSelectedDoc(null)}
/>
```

- [ ] **Step 4: Suchergebnis-Hinweis im Header anzeigen**

Im Header-Bereich, nach dem `<h1>`-Tag, Hinweis ergänzen:
```tsx
{searchQuery && (
  <p className="text-xs text-blue-500 mt-1">
    {filteredDocuments.length} Ergebnisse aus allen Bereichen
  </p>
)}
```

- [ ] **Step 5: PdfViewerModal rendern**

Am Ende des return-Statements, vor dem letzten `</div>`, Modal hinzufügen:
```tsx
{pdfViewerDoc && (
  <PdfViewerModal
    filePath={pdfViewerDoc.last_path}
    fileName={pdfViewerDoc.last_path.split(/[\\/]/).pop() ?? ''}
    onClose={() => setPdfViewerDoc(null)}
  />
)}
```

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: fix fulltext search and wire up PDF viewer modal"
```

---

## Task 5: Build-Test

- [ ] **Step 1: Dev-Server starten und testen**

```bash
npm run dev
```

Prüfen:
1. Dokument anklicken → Sidebar öffnet sich mit "PDF anzeigen"-Button
2. Button klicken → PDF-Modal öffnet sich, PDF wird angezeigt
3. Seiten-Navigation (Pfeiltasten + Buttons) funktioniert
4. Zoom + / − funktioniert
5. Escape schließt das Modal
6. Im Suchfeld tippen → Ergebnisse aus allen Bereichen erscheinen sofort
7. Suchbegriff löschen → View-Filter greift wieder

- [ ] **Step 2: Final Commit (falls nötig)**

```bash
git add -A
git commit -m "chore: finalize PDF viewer and search implementation"
```
