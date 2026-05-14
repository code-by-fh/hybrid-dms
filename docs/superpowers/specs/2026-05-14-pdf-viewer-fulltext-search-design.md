# Design: PDF-Viewer & Volltextsuche

**Datum:** 2026-05-14  
**Status:** Approved

---

## Ziel

1. PDFs direkt in der App in einem Vollbild-Overlay anzeigen (react-pdf)
2. Volltextsuche reparieren und auf alle Views ausweiten

---

## Feature 1: PDF-Viewer (Vollbild-Overlay)

### Komponente

**Neue Datei:** `src/renderer/components/PdfViewerModal.tsx`

Props:
```ts
interface PdfViewerModalProps {
  filePath: string;
  fileName: string;
  onClose: () => void;
}
```

Aufbau:
- Overlay (`fixed inset-0 z-50 bg-black/80`) über dem gesamten Fenster
- **Toolbar oben:** Dateiname (links), Seiten-Navigation "Seite X / Y" mit Vor/Zurück-Buttons (Mitte), Zoom + / − (rechts), Schließen-Button (X)
- **Inhaltsbereich:** `react-pdf` `<Document>` + `<Page>` rendert die aktuelle Seite als Canvas
- Keyboard: `Escape` schließt das Modal, Pfeiltasten navigieren Seiten

### Worker-Konfiguration

`react-pdf` benötigt einen PDF.js-Worker. Da `pdfjs-dist` bereits installiert ist, wird der Worker direkt referenziert:

```ts
import { pdfjs } from 'react-pdf';
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
```

Vite bündelt den Worker automatisch. Kein zusätzlicher IPC-Handler nötig — `react-pdf` liest `file://`-Pfade direkt im Renderer (`webSecurity: false` ist bereits gesetzt).

### Integration

**`src/renderer/components/Sidebar.tsx`:**
- Neuer `onOpenPdf?: () => void` Prop
- Neuer Button "PDF anzeigen" (mit `FileText`-Icon aus lucide-react) erscheint oberhalb der Metadaten-Felder, sichtbar für alle Dokumente in allen Views

**`src/App.tsx`:**
- `pdfViewerDoc: DocumentType | null` State
- `PdfViewerModal` wird gerendert wenn `pdfViewerDoc !== null`
- `onOpenPdf` Callback wird an `Sidebar` weitergegeben

---

## Feature 2: Volltextsuche (Bugfix + Erweiterung)

### Das Problem

In `App.tsx` gibt `filteredDocuments` bei jeder benannten View sofort zurück — der `searchQuery`-Block wird nie erreicht:

```ts
// BUG: search wird niemals ausgeführt
if (currentView === 'inbox') return doc.last_path.startsWith(settings.INBOX_PATH);
if (currentView === 'sort')  return doc.last_path.startsWith(settings.PROCESSING_PATH);
if (currentView === 'archive') return doc.last_path.startsWith(settings.ARCHIVE_PATH);
// ↑ alle drei returnen immer, searchQuery bleibt unbenutzt
```

### Fix

Neue Logik: Suche hat Vorrang vor View-Filter.

```ts
const filteredDocuments = documents.filter(doc => {
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    const meta = doc.metadata ? JSON.parse(doc.metadata) : {};
    return (
      doc.last_path.toLowerCase().includes(q) ||
      (doc.tags || '').toLowerCase().includes(q) ||
      (meta.sender || '').toLowerCase().includes(q) ||
      (meta.docType || '').toLowerCase().includes(q) ||
      (meta.archivePath || '').toLowerCase().includes(q)
    );
  }
  // Kein Suchbegriff → nach View filtern (bisheriges Verhalten)
  if (currentView === 'inbox') return doc.last_path.startsWith(settings.INBOX_PATH);
  if (currentView === 'sort')  return doc.last_path.startsWith(settings.PROCESSING_PATH);
  if (currentView === 'archive') return doc.last_path.startsWith(settings.ARCHIVE_PATH);
  return true;
});
```

### Suchergebnis-Anzeige

- Bei aktivem Suchbegriff: `FileDashboard` zeigt alle Treffer aus allen Views
- Kleiner Hinweistext unterhalb des Headers: `"X Ergebnisse (alle Bereiche)"` — nur sichtbar wenn `searchQuery` aktiv ist
- Die Nav-Sidebar bleibt sichtbar, View-Buttons sind inaktiv während der Suche (kein visuelles Deaktivieren nötig — Suche überschreibt einfach den Filter)

---

## Abhängigkeiten

| Paket | Zweck | Neu? |
|-------|-------|------|
| `react-pdf` | PDF-Rendering im Renderer | Ja |
| `pdfjs-dist` | PDF.js Worker | Nein (bereits installiert) |

Installation: `npm install react-pdf`

---

## Dateien die geändert werden

| Datei | Art |
|-------|-----|
| `src/renderer/components/PdfViewerModal.tsx` | Neu |
| `src/renderer/components/Sidebar.tsx` | Änderung: `onOpenPdf` Prop + Button |
| `src/App.tsx` | Änderung: Such-Logik, Modal-State, Callback |
| `package.json` / `package-lock.json` | Änderung: `react-pdf` hinzufügen |

---

## Nicht im Scope

- Volltextindex des PDF-Inhalts in der DB (bewusst ausgeschlossen)
- Suche innerhalb des PDF-Viewers (Strg+F im Modal)
- Drucken oder Herunterladen aus dem Viewer
