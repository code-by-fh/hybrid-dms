

# Technisches Anforderungsdokument (PRD) für KI-Coding-Agent

## 1. Projekt-Stack & Architektur

* **Framework:** Electron mit **React 18+** (Vite als Bundler).
* **Sprache:** TypeScript (für Typsicherheit bei Datei-Metadaten).
* **State Management:** React Context oder `zustand` (leichtgewichtig für Datei-Listen).
* **Styling:** Tailwind CSS (für ein schnelles, funktionales Interface).
* **IPC-Kommunikation:** Sicherer Zugriff über `preload.js` und `contextBridge`.

## 2. Ordnerstruktur (Vorgabe für Agent)

```text
/root
├── bin/                # Portable .exe Tools (ExifTool, Tesseract)
├── src/
│   ├── main/           # Electron Main Process (Node.js Logik)
│   │   ├── services/   # HashService, OCRService, AIService
│   │   └── db/         # SQLite Schema & Queries
│   ├── preload/        # ContextBridge Definitionen
│   └── renderer/       # React App (UI)
│       ├── components/ # Preview, Sidebar, FileList
│       └── hooks/      # useFileSystem, useAI
└── package.json

```

## 3. Modulare Funktions-Spezifikation

### A. Main-Process: Der "Sync-Engine" (Hintergrund)

* **Watcher:** Implementiere `chokidar`. Bei neuen Dateien in der Inbox:
1. Berechne SHA-256 Hash.
2. Prüfe via `pdf-parse`, ob OCR nötig ist.
3. Registriere in SQLite (`status: 'new'`).


* **Hash-Crawler:** Ein Intervall-Service, der das Archiv scannt.
* *Logik:* Wenn `db.hash === file.hash` UND `db.path !== file.path` -> Update Datenbank-Pfad (Heilung des Index).



### B. Renderer-Process: Die React UI

* **File Dashboard:** Eine tabellarische Ansicht der Inbox.
* **PDF-Viewer:** Nutze `react-pdf-viewer` oder ein einfaches `<iframe>` mit dem lokalen Pfad (beachte Electron Security/File Protocol).
* **Sidebar-Controller:**
* Anzeige der durch Ollama extrahierten Daten (Sender, Datum, Tags).
* "Save & Move"-Button: Triggered IPC-Event zum Schreiben der Metadaten und Verschieben der Datei.



### C. Agentic AI Integration (Ollama)

* **Endpoint:** `POST http://localhost:11434/api/generate`.
* **Prompt-Konfiguration:**
* Modell: `mistral` oder `llama3`.
* Format: `json`.
* Input: Die ersten 2000 Zeichen des OCR-Textes.


* **Error-Handling:** Wenn Ollama nicht erreichbar ist, muss die UI ein "Manual Mode" Flag setzen und einfache Schlagwort-Regeln (Regex) anwenden.

## 4. Metadaten-Persistenz (Kritisch)

* **Tool:** ExifTool (portable Binary).
* **Task:** Der Agent muss sicherstellen, dass Tags **permanent** in das Dokument geschrieben werden.
* **Befehl:** `exiftool -overwrite_original -Keywords+="TAG" -Subject="SENDER" datei.pdf`.

## 5. Abnahmekriterien für den Code

1. **Portabilität:** Alle Pfade zu `bin/` müssen über `app.getAppPath()` oder `process.resourcesPath` aufgelöst werden.
2. **Performance:** Die UI darf während des Hashens von 2.000 Dateien nicht einfrieren (Nutzung von `async` I/O).
3. **Datensicherheit:** Dateien im Archiv dürfen niemals gelöscht werden, nur Verschiebungen innerhalb des NAS sind erlaubt.
