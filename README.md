# Documents DMS

Ein lokales Dokumentenmanagementsystem (DMS) als Electron-Desktop-App für Windows. Neue PDF-Dateien werden automatisch erkannt, per OCR und KI analysiert, verschlagwortet und ins Archiv einsortiert — vollständig offline und ohne Cloud-Dienste.

## Was die App macht

**Automatische Dokumentenpipeline:**

1. **Inbox überwachen** — Neue PDFs im konfigurierten Inbox-Ordner werden sofort erkannt (Chokidar File-Watcher).
2. **Textextraktion** — Der eingebettete Text wird per `pdf-parse` extrahiert. Scans ohne Text werden automatisch per OCR (Tesseract.js) verarbeitet.
3. **KI-Analyse via Ollama** — Ein lokal laufendes LLM (z. B. `llama3.2`) analysiert den Dokumententext und liefert:
   - Absender / Aussteller
   - Dokumentdatum
   - Dokumenttyp (Rechnung, Vertrag, Kündigung, …)
   - Tags
   - Vorgeschlagener Dateiname (`YYMMDD_Typ_Absender`)
   - Vorgeschlagener Archivpfad (`Kategorie/Unterkategorie`)
4. **Sortieren** — Das Dokument landet mit vorausgefüllten Metadaten im "Sortieren"-Bereich. Dort können Angaben geprüft und angepasst werden, bevor das Dokument mit einem Klick ins Archiv verschoben wird.
5. **Archiv** — Dokumente werden in der konfigurierten Verzeichnisstruktur abgelegt. Jedes PDF erhält eine UUID im XMP-Metadatenfeld, sodass Umbenennungen und Verschiebungen zuverlässig nachverfolgt werden.

**Weitere Funktionen:**
- Volltext-Suche über alle archivierten Dokumente (SQLite FTS5), aufrufbar per Tastenkürzel `Strg+Alt+D` aus jeder App
- Schnelles globales Suchfenster (rahmenlos, immer im Vordergrund)
- Archivbaum-Ansicht mit Drag & Drop zum Verschieben von Dokumenten
- System-Tray-Integration (App läuft im Hintergrund, minimiert in die Taskleiste)
- Manuelle OCR-Auslösung pro Dokument
- Log-Datei mit automatischer Rotation (max. ~95 MB)

## Voraussetzungen

| Abhängigkeit | Version | Hinweis |
|---|---|---|
| Node.js | ≥ 18 | Für Entwicklung und Build |
| Ollama | aktuell | Muss lokal laufen: [ollama.com](https://ollama.com) |
| LLM-Modell | — | z. B. `llama3.2` via `ollama pull llama3.2` |

## Installation & Entwicklung

```bash
# Abhängigkeiten installieren
npm install

# Entwicklungsserver starten (Electron + Vite HMR)
npm run dev
```

## Build & Distribution

```bash
# Produktions-Build (TypeScript + Vite)
npm run build

# Portables Windows-Executable erstellen (im Ordner /release)
npm run dist
```

Das Ergebnis ist eine portable `.exe` ohne Installer — einfach ausführen.

## Erstkonfiguration

Beim ersten Start verwendet die App automatisch erstellte Standardpfade im App-Datenpfad (`%APPDATA%/documents_dms`). Diese können in den Einstellungen angepasst werden:

**Einstellungen öffnen:** Zahnrad-Icon oben rechts in der App.

| Einstellung | Beschreibung |
|---|---|
| **Inbox Pfad** | Ordner, der auf neue PDFs überwacht wird. Neue Dateien hier starten die Pipeline automatisch. |
| **Processing Pfad (Sortieren)** | Temporärer Zwischenordner. Dokumente liegen hier, bis sie manuell ins Archiv übernommen werden. |
| **Archive Pfad** | Wurzelverzeichnis des digitalen Archivs. Wird als Verzeichnisbaum in der App angezeigt. |
| **Ausgeschlossene Ordner** | Kommagetrennte Ordnernamen, die beim Archiv-Scan ignoriert werden (z. B. `.git, Temp`). |
| **Ollama API URL** | Standard: `http://localhost:11434`. Anpassen, wenn Ollama auf einem anderen Port oder Rechner läuft. |
| **Ollama Modell** | Name des zu verwendenden Modells, z. B. `llama3.2`. Muss zuvor mit `ollama pull <modell>` geladen worden sein. |
| **Log-Datei Pfad** | Optionaler benutzerdefinierter Pfad für die Log-Datei. |

Nach dem Speichern der Einstellungen prüft die App sofort die Ollama-Verbindung und zeigt an, ob das Modell verfügbar ist.

## Workflow im Überblick

```
PDF in Inbox ablegen
       ↓
Textextraktion (pdf-parse)
  └─ kein Text? → OCR (Tesseract.js)
       ↓
KI-Analyse (Ollama)
  → Dateiname, Tags, Archivpfad vorschlagen
       ↓
Sortieren-Ansicht in der App
  → Metadaten prüfen / anpassen
       ↓
"Ins Archiv" → Datei wird verschoben & XMP-Metadaten geschrieben
```

## Tastenkürzel

| Kürzel | Funktion |
|---|---|
| `Strg+Alt+D` | Globales Suchfenster öffnen/schließen (funktioniert systemweit) |

## Hinweise

- **Ollama muss laufen**, bevor Dokumente in die Inbox gelegt werden. Ohne erreichbares Modell schlägt die KI-Analyse fehl und das Dokument landet mit Fehlerstatus im Sortieren-Bereich. Ein erneuter Versuch ist per "Retry"-Button möglich.
- **Scans (Bilddateien als PDF):** OCR wird automatisch ausgelöst, wenn kein eingebetteter Text gefunden wird. Die Qualität hängt von der Scan-Auflösung ab.
- **UUID im XMP:** Jedes PDF bekommt eine UUID ins XMP-Metadatenfeld geschrieben. Dadurch erkennt die App Dokumente auch nach Umbenennung oder Verschiebung zuverlässig wieder.
- **Archiv-Scan:** Beim Start läuft automatisch ein Crawler über den Archiv-Ordner, um verschobene Dateien zu erkennen und den Datenbankindex aktuell zu halten. Kann manuell über den "Scan"-Button ausgelöst werden.
- **Datenbank:** Die SQLite-Datenbank liegt im App-Datenpfad (`%APPDATA%/documents_dms`). Sie enthält den gesamten Dokumentenindex inklusive Volltext für die Suche.
