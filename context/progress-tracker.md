# Progress Tracker

## Current Phase

Active development — feature/onboarding-wizard branch

## Current Goal

Onboarding wizard implemented. Pending: merge to main, package + test as .exe.

## Completed

- Electron app shell (main window + frameless search window + system tray)
- SQLite database with `documents`, `settings`, and `documents_fts` (FTS5) tables
- Settings persistence (Inbox, Sortieren, Archive paths; Ollama URL/model; log path)
- chokidar file watcher for Inbox, Sortieren, and Archive folders
- Document ingestion pipeline: UUID generation, SHA256 hashing, DB insert
- pdf-parse text extraction
- Tesseract.js OCR (German + English) with sandwich PDF creation
- Ollama AI metadata extraction (sender, date, docType, tags, suggestedFilename,
  archivePath)
- aiService refactored to support three backends: ollama, gguf, managed (node-llama-cpp)
- `checkAiBackend()` exported for connectivity/file-existence checks per backend
- Filename sanitization (ASCII-only, `YYMMDD_DocType_Sender` format)
- Automatic rename and move to Sortieren after AI analysis
- pdf-lib XMP metadata write (UUID to Subject, tags to Keywords)
- User review UI: FileDashboard table, right Sidebar metadata editor
- Archive action: move to `ARCHIVE_PATH/archivePath/filename.pdf`, update DB
- NavSidebar with Inbox / Sortieren / Archiv tab navigation
- ArchiveTree with drag-and-drop file moving and inline rename
- PdfViewerModal (zoom, single/double/continuous page modes)
- SettingsModal with Ollama connectivity test
- Global search window (Ctrl+Alt+D), FTS5 search with snippet highlighting
- Light/dark theme toggle (persisted in localStorage)
- File logger with rotation (95 MB threshold, stored in %APPDATA%)
- Startup UUID crawler (healing scan for archived files without XMP UUID)
- Retry and manual OCR/AI trigger for error-state documents
- Queue-based ingestion (max 5 concurrent files)
- Electron-builder packaging to portable Windows .exe
- CI: GitHub Actions with contents:write for release creation
- Bug fix: white screen and slow startup in packaged exe (431d05a)

## In Progress

- None (onboarding-wizard branch complete, not yet merged).

## Next Up

- (No active roadmap — see Open Questions for potential next work)

## Open Questions

- Should the app support watching multiple inbox folders simultaneously?
- Should the AI-suggested archivePath be validated against the existing folder tree before
  presenting it to the user?
- Is there a plan to add import/backup of the SQLite database for portability?
- OCR language set is now configurable via onboarding + OCR_LANGUAGES setting. ✅ Resolved.

## Architecture Decisions

- **Multi-backend AI (2026-05-16)**: aiService.ts now dispatches to Ollama (HTTP), local GGUF
  (node-llama-cpp), or managed download (node-llama-cpp) based on AI_BACKEND setting.
  Legacy OLLAMA_URL/OLLAMA_MODEL keys kept for backward compat. New keys: AI_BACKEND,
  AI_URL, AI_MODEL_NAME, GGUF_MODEL_PATH, OCR_LANGUAGES.
- **Onboarding wizard (2026-05-16)**: 3-step modal (KI-Setup, Ordner, Sonstiges) shown on
  first run (INBOX_PATH empty) and accessible via "Setup-Assistent" button in Settings.
  Spec: docs/superpowers/specs/2026-05-16-onboarding-wizard-design.md
- **SQLite over a file-based store**: Chosen for FTS5 support and transactional safety
  without a server dependency.
- **XMP UUID in PDF**: Ensures document identity survives moves and renames outside the
  app. Subject field used for UUID, Keywords for tags (compatible with standard PDF
  metadata readers).
- **Sandwich PDF (not replace)**: OCR output overlays the original scan so visual
  fidelity is preserved while making the document text-searchable.
- **Multi-backend AI**: aiService dispatches to `ollama` (HTTP), `gguf` (direct file path
  via node-llama-cpp), or `managed` (bundled model in userData/dms-data/models/) based on
  the `AI_BACKEND` setting. All backends share the same prompt and sanitization logic.
- **Separate frameless search window**: Allows global hotkey access from any application
  without disrupting the main window state.
- **Synchronous better-sqlite3**: Chosen over async alternatives because main-process
  SQLite calls are fast and non-UI-blocking; avoids unnecessary async complexity.

## Session Notes

- All context files were populated from a full repo exploration on 2026-05-16.
- The app is in a working, released state. No breaking changes should be made to the
  pipeline without verifying packaged-exe behavior (renderer-to-main path differs from dev).
