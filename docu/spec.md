Spezifikation: Portable Electron DMS "Hybrid-Archive"

1. Projekt-Übersicht
   Ziel: Entwicklung einer portablen Windows-Desktop-App (Electron), die Dokumente (PDF) verwaltet, ohne die Ordnerstruktur auf einem NAS zu zerstören.
   Kernkonzept: "Sidecar-Database" mit Hash-Abgleich. Die Datei auf dem NAS ist die Wahrheit, die Datenbank ist der Index.

2. Technischer Stack
   Runtime: Electron (Node.js)

Datenbank: SQLite (better-sqlite3)

File-Handling: chokidar (Watcher), crypto (Hashes)

External Binaries (Portable): exiftool.exe (Metadaten), tesseract.exe (OCR)

AI-Schnittstelle: REST-API Integration für Ollama (lokal)

3. Daten-Modell (SQLite)
   Der Agent muss eine Datenbank mit folgendem Schema anlegen:

documents:

id (Primary Key)

hash (SHA-256 des Datei-Inhalts)

last_path (Absoluter Pfad auf dem NAS/PC)

tags (JSON-Array oder kommagetrennte Liste)

metadata (JSON: Datum, Absender, Betrag)

indexed_at (Timestamp)

4. Funktionsmodule für den Agenten
   Modul A: File-Processing & OCR
   Watchdog: Überwache CONFIG.INBOX_PATH.

OCR-Check: Nutze Node-Library (z.B. pdf-parse), um zu prüfen, ob Text vorhanden ist.

OCR-Execution: Falls kein Text: Führe tesseract.exe via child_process aus und speichere das Ergebnis als durchsuchbares PDF.

Hashing: Generiere SHA-256 Hash und verschiebe Datei in CONFIG.PROCESSING_PATH.

Modul B: KI-Agent Integration (Ollama)
Connection: Verbinde zu http://localhost:11434/api/generate.

System-Prompt:
"Du bist ein Dokumenten-Analyst. Extrahiere aus dem folgenden Text: 1. Absender, 2. Datum (YYYY-MM-DD), 3. Dokumententyp, 4. Schlagworte. Antworte ausschließlich in validem JSON."

Fallback: Falls Ollama offline, nutze vordefinierte RegEx-Muster für "Rechnung", "Versicherung", "Steuer".

Modul C: Metadaten-Persistenz (ExifTool)
Nach Bestätigung durch den User: Nutze exiftool.exe, um Tags in das XMP-Feld Keywords und den Absender in Author zu schreiben.

Kommando-Muster: exiftool -keywords+=Tag1 -Author="Absender" datei.pdf.

Modul D: Der "Heilungsscan" (Hash-Sync)
Iteriere stündlich durch CONFIG.ARCHIVE_PATH.

Für jede Datei: Berechne Hash.

Abgleich mit Datenbank:

Wenn Hash existiert, aber path ungleich last_path: Update last_path in DB (Verschiebung erkannt).

Wenn Hash neu: Indexiere als neues Dokument.

Wenn DB-Eintrag existiert, aber Datei an last_path fehlt: Markiere als "Missing".

5. UI-Anforderungen (Renderer)
   Inbox-View: Liste der neuen Dateien in /Verarbeiten.

Preview: PDF-Vorschau (Embed).

Sidebar: Input-Felder für Tags, Absender, Datum (vorausgefüllt durch KI).

Archive-Search: Volltextsuche über die SQLite-Datenbank.

6. Portabilitäts-Instruktionen
   Nutze process.resourcesPath, um auf den /bin-Ordner zuzugreifen.

Pfade müssen relativ zur .exe aufgelöst werden.

Speichere die SQLite-Datei standardmäßig im AppData Verzeichnis des Users oder im App-Ordner (konfigurierbar).

Handlungsaufforderung an den Coding-Agenten:
"Erstelle eine Electron-App basierend auf dieser Spezifikation. Beginne mit dem Setup des Main-Process und der SQLite-Integration. Implementiere anschließend den Datei-Watcher und die ExifTool-Anbindung. Achte darauf, dass alle externen Aufrufe asynchron erfolgen, um die UI nicht zu blockieren."
