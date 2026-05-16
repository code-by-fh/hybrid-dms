# Project Overview

## Overview

Documents DMS is a Windows desktop application built with Electron and React that automates
the processing and archiving of PDF documents. It monitors a local inbox folder, runs OCR
on scanned PDFs, sends extracted text to a locally-running Ollama LLM to extract structured
metadata (sender, date, document type, tags, suggested filename, and archive path), and
presents the result to the user for review before moving the file into a structured archive.
All processing is fully local — no cloud services are involved.

## Goals

1. Eliminate manual renaming and sorting of incoming PDF documents by automating OCR and
   AI-driven metadata extraction.
2. Give the user a single review step (Sortieren) before a document is permanently archived,
   so automation never acts without human confirmation.
3. Persist document identity across renames and moves by embedding a UUID into each PDF's
   XMP metadata, enabling reliable re-linking if a file is moved outside the app.
4. Make the full archive text-searchable via FTS5 full-text search, accessible from any
   window via a global hotkey (Ctrl+Alt+D).
5. Operate entirely offline — no internet connection, no external APIs, no cloud storage.

## Core User Flow

1. User configures three folder paths in Settings: Inbox, Sortieren, and Archive.
2. User configures Ollama connection (URL + model) and confirms the model is reachable.
3. User drops or saves a PDF into the Inbox folder.
4. The app detects the new file via chokidar, generates a UUID, hashes the file, and
   inserts a record into SQLite with status `new`.
5. The app extracts embedded text via pdf-parse. If fewer than 50 characters are found,
   it renders each page at 2× and runs Tesseract.js OCR (German + English).
6. If OCR was needed, the app writes a "sandwich" PDF — an invisible searchable text layer
   beneath the original scan — and overwrites the file in place.
7. The app sends the first 4,000 characters of extracted text to Ollama and receives a
   structured JSON response: sender, date, docType, tags, suggestedFilename, archivePath.
8. The app renames the file using the AI-suggested filename and moves it to the Sortieren
   folder. Status becomes `new` (ready for manual review).
9. The user opens the app, switches to the Sortieren tab, selects the document, and reviews
   the metadata in the right sidebar. They can edit any field.
10. The user clicks "Archivieren". The app moves the file to
    `ARCHIVE_PATH/archivePath/filename.pdf`, writes the UUID and tags into the PDF's XMP
    Subject/Keywords fields, and updates the DB record to status `processed`.

## Features

### Document Ingestion

- Chokidar file watcher monitors Inbox, Sortieren, and Archive folders in real time.
- Queue-based ingestion with a maximum of 5 concurrent files.
- SHA256 hashing to detect duplicate or re-added files.
- Startup healing scan (UUID crawler) ensures all archived files have a UUID in XMP.

### OCR

- Text extraction using pdf-parse for PDFs with embedded text.
- Tesseract.js OCR (German + English language packs) for image-only pages.
- Sandwich PDF creation: invisible text layer + original scan image, overwriting the source file.
- Per-page OCR decision: pages with sufficient embedded text are kept as-is.

### AI Metadata Extraction

- Sends first 4,000 characters to local Ollama instance (default: llama3.2).
- Returns structured JSON: sender, date (YYYY-MM-DD), docType, tags, suggestedFilename,
  archivePath (Category/Subcategory).
- Filename sanitization: ASCII-only, no umlauts, format `YYMMDD_DocType_Sender`.
- Fallback filename generation if Ollama response is unparseable.

### Document Review (Sortieren)

- Document list table showing filename, sender, date, docType, status badge.
- Right sidebar editor for all metadata fields: sender, date, docType, tags, archivePath.
- PDF viewer modal with zoom, single/double/continuous page modes.
- One-click archive action.
- Retry button for documents in error state.

### Archive Management

- Tree view of the archive folder structure in the left sidebar.
- Drag-and-drop file moving within the archive tree.
- Inline folder rename.
- Full archive browsable inside the Archive tab.

### Full-Text Search

- SQLite FTS5 index over all extracted document text.
- Results include snippets with matched terms highlighted.
- Up to 50 results per query.
- Global search window (frameless, always-on-top) toggled with Ctrl+Alt+D from any
  application. Clicking a result opens the document in the main window.

### Settings & Configuration

- Settings modal for Inbox, Sortieren, and Archive folder paths (OS folder picker).
- Ollama URL and model configuration with live connectivity test.
- Log file path configuration.
- Excluded folders list.

### System Tray

- App minimizes to system tray and continues monitoring.
- Tray menu to show/hide main window, open settings, or quit.

### Theme

- Light and dark mode toggle, persisted in localStorage.

## Scope

### In Scope

- Windows-only Electron desktop application distributed as a portable `.exe`.
- Processing PDFs only (no other file types).
- Three-folder workflow: Inbox, Sortieren, Archive.
- Local Ollama integration for AI metadata extraction (no cloud LLM).
- Tesseract.js OCR with German and English language support.
- SQLite database with FTS5 full-text search.
- XMP metadata embedding (UUID + tags) in PDF files.
- Global search window accessible via system shortcut.
- Drag-and-drop archive tree management.
- Light/dark theme.
- File logging with rotation.

### Out of Scope

- macOS or Linux support.
- Non-PDF file formats (images, Word documents, spreadsheets).
- Cloud storage integration (Dropbox, OneDrive, S3, etc.).
- Cloud-based AI or OCR services.
- Multi-user access, sharing, or collaboration features.
- User authentication or access control.
- Mobile or web interface.
- Email ingestion or scanner integration.
- Document versioning or change history.
- Export or report generation.
- Plugin or extension system.

## Success Criteria

1. A PDF dropped into the Inbox folder is automatically detected, OCR'd if needed, analyzed
   by Ollama, renamed, and moved to Sortieren without any user action.
2. A user can review a document in Sortieren, edit any metadata field, and archive it in
   one click — resulting in the file appearing in the correct subfolder under Archive.
3. The archived PDF contains the document's UUID and tags in its XMP Subject/Keywords fields,
   readable by external PDF tools.
4. Full-text search returns relevant results with snippets for any word present in a
   processed document's extracted text.
5. The global search window (Ctrl+Alt+D) opens from any application and clicking a result
   brings the main window to focus with the document selected.
6. The app starts, initializes the watcher, and is ready to process files within 5 seconds
   on a typical Windows machine.
7. OCR + AI processing completes for a typical single-page scanned PDF in under 60 seconds
   on a machine running Ollama locally.
8. A document that was moved or renamed outside the app is re-linked by UUID on the next
   startup crawler run.
