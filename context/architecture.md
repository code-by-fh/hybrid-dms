# Architecture Context

## Stack

| Layer         | Technology                              | Role                                                      |
| ------------- | --------------------------------------- | --------------------------------------------------------- |
| Framework     | Electron 33 + TypeScript                | Desktop shell, OS integration, IPC bridge                 |
| UI            | React 19 + Tailwind CSS 4              | Renderer-process UI                                       |
| Build         | Vite + electron-vite plugins            | Bundler for both renderer and main process                |
| Database      | better-sqlite3 (SQLite)                 | Document records, settings, FTS5 full-text index          |
| File watching | chokidar 3                              | Real-time Inbox/Sortieren/Archive monitoring              |
| OCR           | Tesseract.js 7 (deu + eng)              | Image-only page recognition, sandwich PDF creation        |
| PDF parse     | pdf-parse + pdfjs-dist                  | Text extraction from embedded-text PDFs, page rendering   |
| PDF write     | pdf-lib                                 | XMP metadata (UUID, tags) writing                         |
| AI            | Ollama HTTP API (local)                 | Structured metadata extraction from document text         |
| Packaging     | electron-builder 26                     | Windows portable `.exe` in `/release`                     |
| Icons         | Lucide React                            | UI iconography                                            |
| Drag-and-drop | @dnd-kit/core                           | Archive tree file moving                                  |

## Process Architecture

Electron runs two OS processes:

**Main process** (`src/main/main.ts`):
- Owns all Node.js APIs, file system access, SQLite, and background services.
- Creates two `BrowserWindow` instances: main window and frameless search window.
- Registers global shortcut `Ctrl+Alt+D` to toggle the search window.
- Initializes database, file watcher, and startup crawler on app ready.
- Exposes all capabilities to the renderer exclusively via IPC handlers.

**Renderer process** (`src/renderer/`):
- React 19 SPA running in a sandboxed Chromium window.
- Has no direct Node.js or file system access.
- Communicates with the main process only through `window.electronAPI` (preload bridge).

**Preload** (`src/preload/preload.ts`):
- Runs in a restricted context with `contextIsolation: true`.
- Exposes a typed `electronAPI` object to the renderer via `contextBridge`.
- Every renderer-to-main call goes through a named IPC channel.

## System Boundaries

| Boundary         | Responsibility                                                                   |
| ---------------- | -------------------------------------------------------------------------------- |
| `src/main/`      | OS integration, IPC handlers, app lifecycle, window creation, shortcut registration |
| `src/main/db/`   | All SQLite access: schema creation, queries, FTS5 updates                        |
| `src/main/services/` | Stateless service modules — each owns one concern (OCR, AI, hash, XMP, sync, logging) |
| `src/preload/`   | IPC bridge only — no business logic                                              |
| `src/renderer/`  | Display logic only — no file system access, no DB access, no service calls       |

The renderer never imports from `src/main/`. The main process never imports from
`src/renderer/`. All cross-boundary communication is IPC.

## Storage Model

- **SQLite (`documents_dms.db` in `%APPDATA%/documents_dms/`)**: Document records (uuid,
  hash, last_path, tags JSON, metadata JSON, full_text, status, indexed_at), app settings
  (key/value), and the FTS5 virtual table (`documents_fts`) over `full_text`.
- **PDF XMP metadata (in-file)**: UUID written to `Subject` field (`dms-uuid:<uuid>`),
  tags written to `Keywords` field. This is the source of truth for identity when a file
  is moved or renamed outside the app.
- **File system**: The canonical document store. SQLite `last_path` tracks current location;
  the file itself is the artifact.
- **localStorage (renderer)**: Theme preference (light/dark) only.
- **`%APPDATA%/documents_dms/logs/`**: Rotating log file (`dms.log`, rotates at 95 MB).

## Auth and Access Model

- No authentication. The app is single-user and local-only.
- No network exposure. Ollama is accessed at `localhost:11434` only.
- File system access is governed by the OS user running the app.

## IPC Handler Inventory

| Channel               | Direction        | Purpose                                      |
| --------------------- | ---------------- | -------------------------------------------- |
| `get-documents`       | Renderer → Main  | Fetch all document records                   |
| `save-and-move`       | Renderer → Main  | Archive document, write XMP, update DB       |
| `move-to-processing`  | Renderer → Main  | Move document to Sortieren folder            |
| `open-directory-dialog` | Renderer → Main | OS folder picker                             |
| `get-settings`        | Renderer → Main  | Read all settings from DB                   |
| `update-settings`     | Renderer → Main  | Write one or more settings to DB            |
| `check-ollama-status` | Renderer → Main  | Test Ollama HTTP connectivity               |
| `check-ollama-config` | Renderer → Main  | Verify configured model exists in Ollama    |
| `perform-ocr`         | Renderer → Main  | Manually trigger OCR for a document         |
| `analyze-document`    | Renderer → Main  | Manually trigger AI analysis                |
| `retry-processing`    | Renderer → Main  | Retry a document in error state             |
| `rename-file`         | Renderer → Main  | Rename file, sync XMP                       |
| `move-file`           | Renderer → Main  | Drag-drop move in archive tree              |
| `run-crawler`         | Renderer → Main  | Start UUID healing scan                     |
| `get-crawler-status`  | Renderer → Main  | Poll crawler progress                       |
| `search-documents`    | Renderer → Main  | FTS5 full-text search                       |
| `get-log-path`        | Renderer → Main  | Read log file path setting                  |
| `set-log-path`        | Renderer → Main  | Update log file path setting                |
| `open-log-file`       | Renderer → Main  | Open log in OS default viewer               |

## Document Status State Machine

```
new → ocr_processing → ai_processing → new (ready for review)
new → ai_processing → new            (if no OCR needed)
* → error                            (on any failure)
error → (retry) → ocr_processing     (manual retry)
new → processed                      (on archive action)
```

## Document Pipeline (Sync Engine)

1. chokidar emits `add` event for new file in Inbox.
2. `syncEngine` generates UUID, SHA256 hash, inserts DB record (`status=new`).
3. `pdf-parse` extracts embedded text.
4. If text < 50 chars: OCR path — render pages via pdfjs-dist, run Tesseract.js,
   create sandwich PDF, overwrite file. (`status=ocr_processing`)
5. `aiService` sends first 4,000 chars to Ollama, parses JSON response.
   (`status=ai_processing`)
6. File renamed to `YYMMDD_DocType_Sender` format, moved to Sortieren.
7. `status` reset to `new` (awaiting user review in Sortieren tab).
8. User archives: file moved to `ARCHIVE_PATH/archivePath/filename.pdf`,
   UUID+tags written to XMP, `status=processed`.

## Invariants

1. The renderer never accesses the file system or database directly — all operations
   go through IPC handlers in the main process.
2. Every PDF that passes through the pipeline receives a UUID in its XMP Subject field
   before being archived. The UUID is never changed once assigned.
3. File writes use atomic rename (write to temp file, then `fs.rename`) to avoid
   partial writes on crash.
4. The Ollama call is fire-and-forget from the sync engine — it never blocks the file
   watcher or UI thread.
5. At most 5 files are processed concurrently in the ingestion queue.
6. The FTS5 index is updated in the same SQLite transaction as the document record to
   prevent search results pointing to missing or stale records.
7. Settings are stored in SQLite, not in a config file, so they survive app reinstalls
   on the same machine (`%APPDATA%` is preserved).
8. The startup UUID crawler is read-only with respect to file content — it only writes
   XMP metadata, never reorders or renames archived files.
