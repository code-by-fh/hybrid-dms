# Logging, Scan-Status & UI-Umbenennung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** File-basiertes Logging mit konfigurierbarem Pfad und Größenrotation, sichtbarer Archiv-Scan-Status und Umbenennung von NavSidebar-Buttons.

**Architecture:** Neues `logger.ts`-Modul im Main-Prozess schreibt in eine konfigurierbare Log-Datei mit Single-Rotation bei 95 MB. Drei neue IPC-Handler verbinden Main mit Renderer. SettingsModal bekommt einen neuen Abschnitt, NavSidebar wird umgebaut.

**Tech Stack:** Electron, React, TypeScript, Node.js `fs` (sync für Log-Writes), Tailwind CSS

---

## Dateiübersicht

| Datei | Aktion |
|---|---|
| `src/main/services/logger.ts` | **neu** — Logger-Modul |
| `src/main/main.ts` | Modify — `initLogger()` aufrufen, 3 neue IPC-Handler |
| `src/preload/preload.ts` | Modify — 3 neue API-Einträge |
| `src/renderer/components/SettingsModal.tsx` | Modify — neuer Protokoll-Abschnitt |
| `src/renderer/components/NavSidebar.tsx` | Modify — Button-Umbenennung & Scan-Status |

---

### Task 1: Logger-Modul erstellen

**Files:**
- Create: `src/main/services/logger.ts`

- [ ] **Schritt 1: Datei anlegen**

```typescript
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { getSetting, setSetting } from '../db/index.js';

let logFilePath = '';

function rotateIfNeeded(filePath: string) {
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > 95 * 1024 * 1024) {
      const oldPath = filePath + '.old';
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      fs.renameSync(filePath, oldPath);
    }
  } catch {
    // File doesn't exist yet — fine
  }
}

export function initLogger() {
  const stored = getSetting('LOG_PATH', '');
  logFilePath = stored || path.join(app.getPath('userData'), 'logs', 'dms.log');
  const dir = path.dirname(logFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  rotateIfNeeded(logFilePath);
}

export function getLogPath(): string {
  return logFilePath;
}

export function setLogPath(newPath: string) {
  setSetting('LOG_PATH', newPath);
  logFilePath = newPath;
  const dir = path.dirname(logFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  rotateIfNeeded(logFilePath);
}

export function log(level: 'info' | 'warn' | 'error', ...args: unknown[]) {
  const timestamp = new Date().toISOString();
  const message = args
    .map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
    .join(' ');
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;

  if (level === 'error') console.error(...args);
  else if (level === 'warn') console.warn(...args);
  else console.log(...args);

  if (!logFilePath) return;
  try {
    fs.appendFileSync(logFilePath, line, 'utf8');
  } catch {
    // Non-fatal
  }
}
```

- [ ] **Schritt 2: Commit**

```bash
git add src/main/services/logger.ts
git commit -m "feat: add file-based logger with 95MB rotation"
```

---

### Task 2: Logger in main.ts integrieren + IPC-Handler

**Files:**
- Modify: `src/main/main.ts`

- [ ] **Schritt 1: Import hinzufügen**

Direkt nach den bestehenden Imports am Anfang der Datei einfügen:

```typescript
import { initLogger, getLogPath, setLogPath, log } from './services/logger.js';
```

- [ ] **Schritt 2: `initLogger()` nach `initDb()` aufrufen**

Den Aufruf in `app.whenReady()` direkt nach `initDb()` einfügen:

```typescript
app.whenReady().then(async () => {
  // Initialize SQLite
  initDb();
  // Initialize file logger
  initLogger();
  log('info', '[Main] App starting');
  // ... rest bleibt unverändert
```

- [ ] **Schritt 3: Drei neue IPC-Handler ans Ende der Datei anfügen** (vor dem letzten `ipcMain.on`)

```typescript
ipcMain.handle('get-log-path', () => {
  return getLogPath();
});

ipcMain.handle('set-log-path', (_event, newPath: string) => {
  setLogPath(newPath);
  return { success: true };
});

ipcMain.handle('open-log-file', async () => {
  const { shell } = await import('electron');
  const filePath = getLogPath();
  if (!filePath) return { success: false, error: 'No log path configured' };
  const result = await shell.openPath(filePath);
  return { success: result === '' };
});
```

- [ ] **Schritt 4: Commit**

```bash
git add src/main/main.ts
git commit -m "feat: integrate logger into main process, add log IPC handlers"
```

---

### Task 3: Preload erweitern

**Files:**
- Modify: `src/preload/preload.ts`

- [ ] **Schritt 1: Drei Einträge ans Ende des `contextBridge.exposeInMainWorld`-Objekts anfügen**

Die drei neuen Zeilen direkt vor der schließenden `});` einfügen:

```typescript
  getLogPath: () => ipcRenderer.invoke('get-log-path'),
  setLogPath: (p: string) => ipcRenderer.invoke('set-log-path', p),
  openLogFile: () => ipcRenderer.invoke('open-log-file'),
```

- [ ] **Schritt 2: Commit**

```bash
git add src/preload/preload.ts
git commit -m "feat: expose log IPC handlers in preload"
```

---

### Task 4: SettingsModal — Protokoll-Abschnitt

**Files:**
- Modify: `src/renderer/components/SettingsModal.tsx`

- [ ] **Schritt 1: State und useEffect erweitern**

Bestehende Imports ergänzen — `FileText` zu den Lucide-Imports hinzufügen:

```typescript
import { X, Folder, Save, Trash2, FileText } from 'lucide-react';
```

Neuen State `logPath` direkt nach den bestehenden `useState`-Deklarationen einfügen:

```typescript
const [logPath, setLogPath] = useState('');
```

Im `useEffect` den `logPath` laden — direkt nach `setOllamaModel(...)`:

```typescript
(window.electronAPI as any).getLogPath().then((p: string) => setLogPath(p || ''));
```

- [ ] **Schritt 2: `handleSave` um Log-Pfad erweitern**

In `handleSave` direkt vor `onClose()`:

```typescript
if (logPath) {
  await (window.electronAPI as any).setLogPath(logPath);
}
```

- [ ] **Schritt 3: Neuen Abschnitt im JSX einfügen**

Direkt nach dem schließenden `</div>` des Ollama-Abschnitts (nach der `<p className="text-xs text-gray-500 mt-2">Die KI wird...` Zeile und deren umschließenden `</div>`) den neuen Abschnitt einfügen:

```tsx
<div className="border-t pt-4 mt-4">
  <h3 className="text-md font-bold text-gray-800 mb-4 flex items-center">
    <FileText className="w-4 h-4 mr-2 text-blue-600" />
    Protokoll & Logs
  </h3>
  <div>
    <label className="block text-sm font-semibold text-gray-700 mb-2">Log-Datei Pfad</label>
    <div className="flex space-x-2">
      <input
        type="text"
        value={logPath}
        onChange={e => setLogPath(e.target.value)}
        className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
        placeholder="Standardpfad wird automatisch verwendet"
      />
      <button
        onClick={() => handlePickPath(setLogPath)}
        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg border transition-colors flex items-center"
      >
        <Folder className="w-4 h-4" />
      </button>
    </div>
    <p className="text-xs text-gray-500 mt-1">Pfad zur Log-Datei (max. ~95 MB, wird danach rotiert).</p>
  </div>
  <button
    onClick={() => (window.electronAPI as any).openLogFile()}
    className="mt-3 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg border transition-colors flex items-center text-sm font-medium text-gray-700"
  >
    <FileText className="w-4 h-4 mr-2" />
    Log-Datei öffnen
  </button>
</div>
```

- [ ] **Schritt 4: Commit**

```bash
git add src/renderer/components/SettingsModal.tsx
git commit -m "feat: add log path config and open-log button to settings"
```

---

### Task 5: NavSidebar — Buttons umbauen

**Files:**
- Modify: `src/renderer/components/NavSidebar.tsx`

- [ ] **Schritt 1: Scan-Button von Icon-only zu vollem Button umbauen**

Den bestehenden Scan-Button-Block:

```tsx
<button
  onClick={onRunCrawler}
  disabled={crawlerRunning}
  title={crawlerRunning ? 'Archiv wird gescannt…' : 'Archiv scannen'}
  className="p-2 rounded-lg transition-colors text-text-subtle hover:text-accent-primary hover:bg-bg-surface disabled:opacity-40 disabled:cursor-not-allowed"
>
  <RefreshCw className={`w-5 h-5 ${crawlerRunning ? 'animate-spin' : ''}`} />
</button>
```

ersetzen durch:

```tsx
<button
  onClick={onRunCrawler}
  disabled={crawlerRunning}
  className="w-full flex items-center px-4 py-3 rounded-lg hover:bg-bg-app text-text-subtle hover:text-text-main transition-all group disabled:opacity-40 disabled:cursor-not-allowed"
>
  <RefreshCw className={`w-5 h-5 mr-3 ${crawlerRunning ? 'animate-spin text-accent-primary' : 'group-hover:text-accent-primary'}`} />
  <span className="font-medium">{crawlerRunning ? 'Läuft…' : 'Archiv scannen'}</span>
</button>
```

- [ ] **Schritt 2: Theme-Toggle-Text ändern**

Den bestehenden Text-Span im Theme-Toggle:

```tsx
<span className="font-medium">{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
```

ersetzen durch:

```tsx
<span className="font-medium">Design wechseln</span>
```

- [ ] **Schritt 3: Commit**

```bash
git add src/renderer/components/NavSidebar.tsx
git commit -m "feat: rename nav buttons, show active scan status"
```

---

## Spec-Abdeckung

| Anforderung | Task |
|---|---|
| File-Logging mit Größenrotation | Task 1 |
| Log-Pfad konfigurierbar | Task 1 + 2 + 3 + 4 |
| Log-Datei direkt öffnen | Task 2 + 3 + 4 |
| Aktiver Scan sichtbar (Badge/Text) | Task 5 |
| Scan-Button deaktiviert während Scan | Task 5 (disabled bleibt, jetzt visuell deutlich) |
| Scan-Button beschriftet „Archiv scannen" | Task 5 |
| Theme-Toggle → „Design wechseln" | Task 5 |
| Settings bleibt „Einstellungen" | — (keine Änderung nötig) |
