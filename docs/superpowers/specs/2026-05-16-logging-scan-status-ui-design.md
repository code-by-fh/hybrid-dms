# Design: Logging, Archiv-Scan-Status & UI-Umbenennung

**Datum:** 2026-05-16  
**Status:** Genehmigt

---

## Überblick

Drei unabhängige Verbesserungen:
1. File-basiertes Logging mit konfigurierbarem Pfad und Größenbegrenzung
2. Sichtbarer Status beim aktiven Archiv-Scan im NavSidebar
3. Umbenennung/Beschriftung von drei Buttons im NavSidebar

---

## 1. File-Logging

### Neues Modul: `src/main/services/logger.ts`

- Exportiert `log(level: 'info' | 'warn' | 'error', ...args: unknown[]): void`
- Schreibt jede Zeile im Format: `[2026-05-16T12:00:00.000Z] [INFO] message`
- Gleichzeitig Weiterleitung an `console.log/warn/error`
- Log-Pfad wird aus der DB geladen (`LOG_PATH`), Default: `app.getPath('userData')/logs/dms.log`
- `initLogger()` wird beim App-Start aufgerufen (nach `initDb()`)

### Rotation bei Größenlimit

- Beim Initialisieren: prüfe Dateigröße per `fs.stat`
- Falls Datei > 95 MB: umbenennen zu `dms.log.old` (überschreibt vorherige `.old`-Datei)
- Neue leere `dms.log` anlegen
- Resultat: max. ~190 MB gesamt (aktuelle + alte Datei), praktisch immer < 100 MB in der aktiven Datei

### Integration

- `initLogger()` in `main.ts` direkt nach `initDb()` aufrufen
- Bestehende `console.log/error/warn` im Main-Prozess bleiben unverändert — kein Refactoring aller Log-Aufrufe
- `logger.ts` wird zunächst nur an kritischen Punkten explizit eingesetzt (App-Start, Crawler-Start/-Ende, Fehler in IPC-Handlern)

---

## 2. IPC-Erweiterung

### Neue Handler in `main.ts`

| Handler | Beschreibung |
|---|---|
| `get-log-path` | Gibt aktuellen `LOG_PATH` aus DB zurück |
| `set-log-path` | Speichert neuen Pfad in DB, ruft `initLogger()` erneut auf |
| `open-log-file` | Öffnet Log-Datei mit `shell.openPath()` |

### Erweiterung `preload.ts`

```ts
getLogPath: () => ipcRenderer.invoke('get-log-path'),
setLogPath: (p: string) => ipcRenderer.invoke('set-log-path', p),
openLogFile: () => ipcRenderer.invoke('open-log-file'),
```

---

## 3. SettingsModal — neuer Abschnitt „Protokoll"

Unterhalb des Ollama-Abschnitts wird ein neuer Abschnitt eingefügt:

```
── Protokoll & Logs ──────────────────────────────
Log-Datei Pfad:
[ /pfad/zur/dms.log                    ] [📁]
                          [Log-Datei öffnen]
```

- Pfad-Input + Ordner-Picker (analog zu INBOX/ARCHIVE/PROCESSING-Feldern)
- Button „Log-Datei öffnen" ruft `openLogFile()` auf
- Beim Speichern der Einstellungen wird der Log-Pfad mit `setLogPath()` übernommen
- Der Log-Pfad wird separat von `handleSave()` gespeichert (eigener State `logPath`)

---

## 4. NavSidebar — Umbenennung & Scan-Status

### Scan-Button (aktuell: Icon-only `p-2`-Button)

Wird zu einem vollständigen Zeilen-Button umgebaut (gleiche Breite und Struktur wie Theme/Settings):

- **Idle:** RefreshCw-Icon + Text `"Archiv scannen"`, enabled
- **Running:** RefreshCw-Icon (animiert, `animate-spin`) + Text `"Läuft…"`, disabled
- CSS: `disabled:opacity-40 disabled:cursor-not-allowed` (bereits vorhanden)

### Theme-Toggle

- Text ändert sich von `theme === 'light' ? 'Dark Mode' : 'Light Mode'`
- Neu: immer `"Design wechseln"` (Icon wechselt weiterhin zwischen Mond und Sonne)

### Settings-Button

- Bleibt `"Einstellungen"` — keine Änderung

---

## Dateien die geändert werden

| Datei | Änderung |
|---|---|
| `src/main/services/logger.ts` | **neu** — Logger-Modul |
| `src/main/main.ts` | `initLogger()` aufrufen, 3 neue IPC-Handler |
| `src/preload/preload.ts` | 3 neue API-Einträge |
| `src/renderer/components/SettingsModal.tsx` | Neuer Logs-Abschnitt |
| `src/renderer/components/NavSidebar.tsx` | Scan-Button umbenennen, Theme-Toggle-Text, Scan-Status |

---

## Nicht im Scope

- Kein Refactoring aller bestehenden `console.log`-Aufrufe
- Kein Log-Viewer innerhalb der App (Logs werden extern geöffnet)
- Keine Log-Level-Filterung in der UI
- Keine automatische Rotation nach Zeit (nur nach Größe)
