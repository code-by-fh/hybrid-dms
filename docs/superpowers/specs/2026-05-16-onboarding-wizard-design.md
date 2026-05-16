# Onboarding Wizard — Design Spec

**Date:** 2026-05-16
**Status:** Approved

## Übersicht

Ein dreistufiger Wizard-Modal, der neue Nutzer durch die Erstkonfiguration führt und
jederzeit manuell über die Settings erneut aufrufbar ist.

## Trigger-Logik

- **Erster Start:** `App.tsx` prüft nach `getSettings()` ob `INBOX_PATH` leer ist.
  Wenn ja: `isOnboardingOpen = true` automatisch gesetzt, `OnboardingModal` wird gerendert.
- **Manuell:** Neuer "Setup-Assistent starten"-Button im `SettingsModal` setzt
  `isOnboardingOpen = true` in `App.tsx`.

## Komponenten-Struktur

```
src/renderer/components/OnboardingModal.tsx   ← neues Modal (3 Schritte)
src/renderer/components/onboarding/
  StepAiBackend.tsx                           ← Schritt 1: KI-Auswahl
  StepFolderPaths.tsx                         ← Schritt 2: Ordner-Pfade
  StepOtherSettings.tsx                       ← Schritt 3: Weitere Einstellungen
```

## Modal-Rahmen

```
┌──────────────────────────────────────────────────────────┐
│  [① KI-Setup] ──── [② Ordner] ──── [③ Einstellungen]   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│                   Schritt-Inhalt                         │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  [Zurück]                          [Weiter / Fertig]     │
└──────────────────────────────────────────────────────────┘
```

- Fortschrittsleiste oben: abgeschlossene Schritte farblich markiert.
- "Fertigstellen" speichert alle gesammelten Werte in einem einzigen
  `updateSettings`-IPC-Aufruf.
- Modal ist nicht schließbar (kein X-Button) beim ersten Start —
  beim manuellen Aufruf aus den Settings hat es ein X.

## Schritt 1: KI-Backend

Drei klickbare Cards (nur eine auswählbar). Ausgewählte Card erhält
`border-accent-primary` + leichten Hintergrund. Darunter expandiert
dynamisch ein Konfigurationsblock.

### Card 1: Ollama
Verbindet sich mit einem laufenden Ollama-Dienst.

**Konfigurationsblock:**
- URL-Eingabe (default: `http://localhost:11434`)
- Modellname-Eingabe (default: `llama3.2`)
- "Verbindung testen"-Button → zeigt grünes/rotes Feedback-Badge

**Backend:** bestehende `checkOllamaConfig`-Logik, keine Änderungen.

### Card 2: Lokale Datei
Referenziert eine bereits vorhandene GGUF-Modelldatei auf der Festplatte.

**Konfigurationsblock:**
- "Datei wählen"-Button → neuer `open-file-dialog`-IPC-Handler mit Filter `*.gguf`
- Zeigt nach Auswahl: Dateiname + Dateigröße

**Backend:** `node-llama-cpp` lädt die Datei direkt.

### Card 3: Download
Lädt ein vordefiniertes Modell automatisch herunter.

**Konfigurationsblock:**
```
Modell auswählen:
  ○ Gemma 4  4B  — Q4_K_M  —  3,3 GB
  ○ Gemma 4 12B  — Q4_K_M  —  8,1 GB
  ○ Llama 3.2 3B — Q4_K_M  —  2,0 GB

[Herunterladen]

████████████░░░░░░░░  58%  —  1,9 GB / 3,3 GB
Geschwindigkeit: 4,2 MB/s
```

- Fortschritt via IPC-Push-Event `download-progress` vom Main-Prozess.
- Modelle werden in `%APPDATA%/documents_dms/models/` gespeichert.
- Nach Abschluss: Fortschrittsbalken → grünes "Bereit"-Badge.
- "Weiter" ist erst nach erfolgreichem Download aktiv.
- Abbruch des Downloads lässt den User auf Card 1 (Ollama) zurückfallen.

**Backend:** `node-llama-cpp` mit HuggingFace GGUF-URLs (bartowski-Repos, Q4_K_M).

### "Weiter"-Aktivierung pro Card

| Card | Bedingung für aktives "Weiter" |
|------|-------------------------------|
| Ollama | Immer aktiv (Test ist optional) |
| Lokale Datei | Nach Auswahl einer .gguf-Datei |
| Download | Nach erfolgreichem Download |

### Neue Settings-Keys

| Key | Typ | Beschreibung |
|-----|-----|--------------|
| `AI_BACKEND` | `'ollama' \| 'gguf' \| 'managed'` | Gewähltes Backend |
| `AI_URL` | string | URL für Ollama |
| `AI_MODEL_NAME` | string | Modellname (Ollama) oder verwaltetes Modell |
| `GGUF_MODEL_PATH` | string | Pfad zur lokalen GGUF-Datei |

Bestehende `OLLAMA_URL` / `OLLAMA_MODEL` Keys bleiben erhalten und werden beim
ersten Onboarding-Abschluss auf die neuen Keys migriert.

### aiService.ts Refactoring

`analyzeDocumentWithAI` prüft `AI_BACKEND` und dispatcht:
- `'ollama'` → bestehender Fetch-Pfad (`/api/generate`)
- `'gguf'` → node-llama-cpp mit lokalem Modellpfad
- `'managed'` → node-llama-cpp mit Modell aus `%APPDATA%/documents_dms/models/`

`checkOllamaStatus` wird zu `checkAiStatus` verallgemeinert.

### Neue IPC-Handler

| Channel | Richtung | Zweck |
|---------|----------|-------|
| `open-file-dialog` | R → M | Datei-Browser mit gguf-Filter |
| `download-model` | R → M | Startet Modell-Download |
| `on-download-progress` | M → R | Push: Bytes geladen, Gesamtgröße, MB/s |
| `check-ai-backend` | R → M | Allgemeiner Backend-Status-Check |

## Schritt 2: Ordner-Pfade

Drei Pflichtfelder mit Folder-Picker (identisch zu bestehendem SettingsModal):

- **Inbox** — neue PDFs werden hier erkannt
- **Sortieren** — Zwischenspeicher vor manueller Prüfung
- **Archiv** — Wurzelverzeichnis des digitalen Archivs

"Weiter" ist deaktiviert solange ein Feld leer ist.

Wiederverwendet: bestehenden `open-directory-dialog`-IPC-Handler.

## Schritt 3: Weitere Einstellungen

Beide Felder optional — "Fertigstellen" ist immer aktiv.

### Ausgeschlossene Ordner
- Textarea, kommagetrennt
- Placeholder: `node_modules, .git, Temp`
- Speichert in `EXCLUDE_FOLDERS`

### OCR-Sprache
Zwei Toggle-Cards (Mehrfachauswahl möglich):

```
┌──────────────┐  ┌──────────────┐
│ ✓ Deutsch    │  │ ✓ Englisch   │  ← beide standardmäßig aktiv
└──────────────┘  └──────────────┘
```

- Speichert in neuem Setting `OCR_LANGUAGES` (default: `'deu+eng'`)
- `ocrService.ts` liest `OCR_LANGUAGES` statt hardcoded String
- Löst die offene Frage aus `context/progress-tracker.md`

## SettingsModal-Änderungen

- Neuer Button "Setup-Assistent starten" in der Fußzeile des SettingsModal
- Bestehende Ollama-Konfigurationsfelder bleiben erhalten (für Nutzer die
  den Wizard überspringen wollen)
- KI-Sektion zeigt nach Wizard-Abschluss das gewählte Backend an

## App.tsx Änderungen

```typescript
const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);

// Nach getSettings():
if (!settings.INBOX_PATH) setIsOnboardingOpen(true);
```

OnboardingModal wird parallel zu SettingsModal in den JSX-Baum eingefügt.

## Packaging / Native Modules

`node-llama-cpp` enthält native Node.js Module (llama.cpp Binaries).
Für die electron-builder Konfiguration:
- `extraResources` für die llama.cpp-Binaries
- `asarUnpack` für native `.node`-Dateien
- Prebuilt-Binaries werden von node-llama-cpp automatisch beim `npm install`
  heruntergeladen (CUDA / Vulkan / CPU-Fallback)

## Nicht in Scope

- macOS / Linux Unterstützung
- OpenAI-kompatibler Endpunkt als eigene Option
- Log-Pfad-Konfiguration im Onboarding (bleibt im SettingsModal)
- Modell-Quantisierungsauswahl (fest auf Q4_K_M)
