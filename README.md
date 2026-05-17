# Documents DMS

A local document management system (DMS) built as an Electron desktop app for Windows. New PDF files are automatically detected, analyzed via OCR and AI, tagged, and filed into the archive — fully offline, no cloud services required.

## What it does

**Automatic document pipeline:**

1. **Inbox monitoring** — New PDFs in the configured inbox folder are detected immediately (Chokidar file watcher).
2. **Text extraction** — Embedded text is extracted via `pdf-parse`. Scans without embedded text are automatically processed via OCR (Tesseract.js).
3. **AI analysis via Ollama** — A locally running LLM (e.g. `llama3.2`) analyzes the document text and returns:
   - Sender / issuer
   - Document date
   - Document type (Invoice, Contract, Cancellation, …)
   - Tags
   - Suggested filename (`YYMMDD_Type_Sender`)
   - Suggested archive path (`Category/Subcategory`)
4. **Review** — The document lands in the "Sortieren" (review) view with pre-filled metadata. Details can be checked and adjusted before the document is moved to the archive with one click.
5. **Archive** — Documents are stored in the configured directory structure. Each PDF receives a UUID written into its XMP metadata field, so renames and moves are tracked reliably.

**Additional features:**

- Full-text search across all archived documents (SQLite FTS5), accessible via the global shortcut `Ctrl+Alt+D` from any application
- Fast global search window (frameless, always on top)
- Archive tree view with drag & drop for moving documents between folders
- System tray integration (app runs in the background, minimizes to tray)
- Manual OCR trigger per document
- Log file with automatic rotation (max. ~95 MB)

## Requirements

| Dependency | Version | Notes                                                     |
| ---------- | ------- | --------------------------------------------------------- |
| Node.js    | ≥ 18    | Required for development and build                        |
| Ollama     | current | Must be running locally: [ollama.com](https://ollama.com) |
| LLM model  | —       | e.g. `llama3.2` via `ollama pull llama3.2`                |

## Installation & Development

```bash
# Install dependencies
npm install

# Start development server (Electron + Vite HMR)
npm run dev
```

## Build & Distribution

```bash
# Production build (TypeScript + Vite)
npm run build

# Create portable Windows executable (output in /release)
npm run dist
```

The result is a portable `.exe` with no installer — just run it.

## Initial Setup

On first launch the app automatically creates default folders in the app data path (`%APPDATA%/documents_dms`). These can be changed in the settings panel.

**Open settings:** Gear icon in the top right of the app.

| Setting                         | Description                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| **Inbox path**                  | Folder watched for new PDFs. Files dropped here start the pipeline automatically.          |
| **Processing path (Sortieren)** | Temporary staging folder. Documents wait here until manually moved to the archive.         |
| **Archive path**                | Root directory of the document archive. Shown as a directory tree in the app.              |
| **Excluded folders**            | Comma-separated folder names to ignore during archive scans (e.g. `.git, Temp`).           |
| **Ollama API URL**              | Default: `http://localhost:11434`. Change if Ollama runs on a different port or host.      |
| **Ollama model**                | Name of the model to use, e.g. `llama3.2`. Must be pulled first via `ollama pull <model>`. |
| **Log file path**               | Optional custom path for the log file.                                                     |

After saving, the app immediately checks the Ollama connection and reports whether the configured model is available.

## Workflow

```
Drop PDF into inbox
       ↓
Text extraction (pdf-parse)
  └─ no text? → OCR (Tesseract.js)
       ↓
AI analysis (Ollama)
  → suggest filename, tags, archive path
       ↓
Review view in the app
  → verify / adjust metadata
       ↓
"Archive" → file is moved & XMP metadata is written
```

## Keyboard shortcuts

| Shortcut     | Action                                                    |
| ------------ | --------------------------------------------------------- |
| `Ctrl+Alt+D` | Open / close the global search window (works system-wide) |

## Notes

- **Ollama must be running** before documents are dropped into the inbox. Without a reachable model the AI analysis fails and the document lands in the review view with an error status. A retry button is available.
- **Scanned PDFs:** OCR is triggered automatically when no embedded text is found. Quality depends on scan resolution.
- **UUID in XMP:** Every PDF gets a UUID written into its XMP metadata. This lets the app reliably recognize documents even after renaming or moving.
- **Archive scan:** On startup a crawler runs over the archive folder to detect moved files and keep the database index up to date. Can also be triggered manually via the "Scan" button.
- **Database:** The SQLite database lives in the app data path (`%APPDATA%/documents_dms`) and holds the full document index including full text for search.
