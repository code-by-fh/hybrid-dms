import React, { useState, useEffect, useCallback } from 'react';
import { Bot, HardDrive, Download, CheckCircle, AlertCircle, Loader, Trash2, FolderOpen } from 'lucide-react';

type BackendType = 'ollama' | 'gguf' | 'managed';

interface StepAiBackendProps {
  initialBackend: BackendType;
  initialOllamaUrl: string;
  initialOllamaModel: string;
  initialGgufPath: string;
  initialManagedModel: string;
  onChange: (data: {
    backend: BackendType;
    ollamaUrl: string;
    ollamaModel: string;
    ggufPath: string;
    managedModel: string;
  }) => void;
  onValidChange: (valid: boolean) => void;
}

interface OllamaCheckResult {
  connected: boolean;
  modelAvailable: boolean;
}

type OllamaStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok'; result: OllamaCheckResult }
  | { state: 'error'; message: string };

interface DownloadProgress {
  percent: number;
  downloaded: number;
  total: number;
  speed: number;
  done: boolean;
}

type DownloadState =
  | { phase: 'idle' }
  | { phase: 'downloading'; progress: DownloadProgress }
  | { phase: 'done' }
  | { phase: 'error'; message: string };

const MANAGED_MODELS = [
  { key: 'gemma-3-4b-q4', label: 'Gemma 3 4B', detail: 'Q4_K_M — ca. 2,5 GB', gated: false },
  { key: 'qwen2.5-3b-q4', label: 'Qwen 2.5 3B', detail: 'Q4_K_M — ca. 2,0 GB', gated: false },
  { key: 'qwen2.5-7b-q4', label: 'Qwen 2.5 7B', detail: 'Q4_K_M — ca. 4,7 GB', gated: false },
  { key: 'phi-3.5-mini-q4', label: 'Phi-3.5 Mini', detail: 'Q4_K_M — ca. 2,2 GB', gated: false },
] as const;

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function formatSpeed(bytesPerSecond: number): string {
  const mb = bytesPerSecond / (1024 * 1024);
  return `${mb.toFixed(1)} MB/s`;
}

function buildProgressBar(percent: number): string {
  const total = 10;
  const filled = Math.round((percent / 100) * total);
  const empty = total - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- window.electronAPI is partially untyped; new IPC methods not yet declared in the global type
const electronAny = window.electronAPI as any;

export const StepAiBackend: React.FC<StepAiBackendProps> = ({
  initialBackend,
  initialOllamaUrl,
  initialOllamaModel,
  initialGgufPath,
  initialManagedModel,
  onChange,
  onValidChange,
}) => {
  const [backend, setBackend] = useState<BackendType>(initialBackend);
  const [ollamaUrl, setOllamaUrl] = useState(initialOllamaUrl);
  const [ollamaModel, setOllamaModel] = useState(initialOllamaModel);
  const [ggufPath, setGgufPath] = useState(initialGgufPath);
  const [managedModel, setManagedModel] = useState(initialManagedModel);

  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>({ state: 'idle' });
  const [downloadState, setDownloadState] = useState<DownloadState>({ phase: 'idle' });
  const [downloadedModels, setDownloadedModels] = useState<Set<string>>(new Set());

  // Compute validity and notify parent
  const computeValid = useCallback(
    (b: BackendType, gPath: string, dl: DownloadState, mModel: string, downloaded: Set<string>): boolean => {
      if (b === 'ollama') return true;
      if (b === 'gguf') return gPath.trim().length > 0;
      if (b === 'managed') return dl.phase === 'done' || downloaded.has(mModel);
      return false;
    },
    [],
  );

  // Notify parent of changes
  const notifyChange = useCallback(
    (
      b: BackendType,
      url: string,
      model: string,
      gPath: string,
      mModel: string,
      dl: DownloadState,
      downloaded: Set<string>,
    ) => {
      onChange({ backend: b, ollamaUrl: url, ollamaModel: model, ggufPath: gPath, managedModel: mModel });
      onValidChange(computeValid(b, gPath, dl, mModel, downloaded));
    },
    [onChange, onValidChange, computeValid],
  );

  // Initial validity signal + check which models are already on disk
  useEffect(() => {
    onValidChange(computeValid(initialBackend, initialGgufPath, downloadState, initialManagedModel, downloadedModels));

    const checkDownloaded = async () => {
      const downloaded = new Set<string>();
      for (const m of MANAGED_MODELS) {
        const ok: boolean = await electronAny.checkModelDownloaded(m.key);
        if (ok) downloaded.add(m.key);
      }
      setDownloadedModels(downloaded);
      if (initialManagedModel && downloaded.has(initialManagedModel)) {
        setDownloadState({ phase: 'done' });
      }
      onValidChange(computeValid(initialBackend, initialGgufPath, { phase: initialManagedModel && downloaded.has(initialManagedModel) ? 'done' : 'idle' }, initialManagedModel, downloaded));
    };
    if (typeof electronAny.checkModelDownloaded === 'function') {
      checkDownloaded();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Register download progress listener
  useEffect(() => {
    if (typeof electronAny.onDownloadProgress !== 'function') return;

    const cleanup = electronAny.onDownloadProgress((raw: {
      modelKey: string;
      downloadedBytes: number;
      totalBytes: number;
      speedBytesPerSec: number;
      done?: boolean;
    }) => {
      if (raw.done) {
        setDownloadedModels(prev => new Set([...prev, raw.modelKey]));
        setDownloadState({ phase: 'done' });
        setManagedModel(prev => {
          notifyChange(backend, ollamaUrl, ollamaModel, ggufPath, prev, { phase: 'done' }, new Set([...downloadedModels, raw.modelKey]));
          return prev;
        });
      } else {
        const percent = raw.totalBytes > 0 ? Math.round((raw.downloadedBytes / raw.totalBytes) * 100) : 0;
        setDownloadState({
          phase: 'downloading',
          progress: { percent, downloaded: raw.downloadedBytes, total: raw.totalBytes, speed: raw.speedBytesPerSec, done: false },
        });
      }
    });

    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Backend selection ---
  const selectBackend = (b: BackendType) => {
    setBackend(b);
    notifyChange(b, ollamaUrl, ollamaModel, ggufPath, managedModel, downloadState, downloadedModels);
  };

  // --- Ollama config handlers ---
  const handleOllamaUrlChange = (url: string) => {
    setOllamaUrl(url);
    setOllamaStatus({ state: 'idle' });
    notifyChange(backend, url, ollamaModel, ggufPath, managedModel, downloadState, downloadedModels);
  };

  const handleOllamaModelChange = (model: string) => {
    setOllamaModel(model);
    setOllamaStatus({ state: 'idle' });
    notifyChange(backend, ollamaUrl, model, ggufPath, managedModel, downloadState, downloadedModels);
  };

  const handleCheckOllama = async () => {
    setOllamaStatus({ state: 'checking' });
    try {
      const result: OllamaCheckResult = await window.electronAPI.checkOllamaConfig(ollamaUrl, ollamaModel);
      if (result && typeof result.connected === 'boolean') {
        setOllamaStatus({ state: 'ok', result });
      } else {
        setOllamaStatus({ state: 'error', message: 'Unerwartete Antwort vom Server' });
      }
    } catch {
      setOllamaStatus({ state: 'error', message: 'Verbindung fehlgeschlagen' });
    }
  };

  // --- GGUF file picker ---
  const handlePickGguf = async () => {
    try {
      const result: string | null = await electronAny.openFileDialog({
        filters: [{ name: 'GGUF Models', extensions: ['gguf'] }],
      });
      if (result) {
        setGgufPath(result);
        notifyChange(backend, ollamaUrl, ollamaModel, result, managedModel, downloadState, downloadedModels);
      }
    } catch {
      // Silently ignore — user cancelled or dialog failed
    }
  };

  const ggufBasename = ggufPath ? ggufPath.split(/[\\/]/).pop() ?? ggufPath : '';

  // --- Managed model handlers ---
  const handleSelectManagedModel = (key: string) => {
    setManagedModel(key);
    const alreadyDone = downloadedModels.has(key);
    const dl: DownloadState = alreadyDone ? { phase: 'done' } : { phase: 'idle' };
    setDownloadState(dl);
    notifyChange(backend, ollamaUrl, ollamaModel, ggufPath, key, dl, downloadedModels);
  };

  const handleDownload = async () => {
    if (!managedModel || downloadState.phase === 'downloading') return;
    setDownloadState({ phase: 'downloading', progress: { percent: 0, downloaded: 0, total: 0, speed: 0, done: false } });
    const result = await electronAny.downloadModel(managedModel);
    if (result && !result.success) {
      setDownloadState({ phase: 'error', message: result.error ?? 'Download fehlgeschlagen' });
    }
    // success is driven by onDownloadProgress 'done' event
  };


  const handleDelete = async () => {
    if (!managedModel) return;
    const result = await electronAny.deleteModel(managedModel);
    if (result?.success) {
      setDownloadedModels(prev => {
        const next = new Set(prev);
        next.delete(managedModel);
        return next;
      });
      const dl: DownloadState = { phase: 'idle' };
      setDownloadState(dl);
      notifyChange(backend, ollamaUrl, ollamaModel, ggufPath, managedModel, dl, new Set([...downloadedModels].filter(k => k !== managedModel)));
    }
  };

  // --- Shared class builders ---
  const cardClass = (active: boolean) =>
    [
      'rounded-xl border-2 cursor-pointer p-5 transition-colors flex flex-col gap-2',
      active
        ? 'border-accent-primary bg-accent-primary/10'
        : 'border-border-base bg-bg-surface hover:border-accent-primary/50',
    ].join(' ');

  const inputClass =
    'w-full px-4 py-2 border border-border-base rounded-lg bg-bg-surface text-text-main outline-none focus:ring-2 focus:ring-accent-primary/30 text-sm font-mono';

  const labelClass = 'block text-sm font-semibold text-text-main mb-1';

  return (
    <div className="flex flex-col gap-4">
      {/* Card row */}
      <div className="grid grid-cols-3 gap-3">
        {/* Card 1: Ollama */}
        <div className={cardClass(backend === 'ollama')} onClick={() => selectBackend('ollama')} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && selectBackend('ollama')}>
          <Bot className="w-5 h-5 text-accent-primary" />
          <span className="font-semibold text-sm text-text-main">Ollama</span>
          <span className="text-xs text-text-subtle">Verbindet sich mit einem laufenden Ollama-Dienst</span>
        </div>

        {/* Card 2: Lokale Datei */}
        <div className={cardClass(backend === 'gguf')} onClick={() => selectBackend('gguf')} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && selectBackend('gguf')}>
          <HardDrive className="w-5 h-5 text-accent-primary" />
          <span className="font-semibold text-sm text-text-main">Lokale GGUF-Datei</span>
          <span className="text-xs text-text-subtle">Referenziert eine vorhandene .gguf-Datei auf der Festplatte</span>
        </div>

        {/* Card 3: Download */}
        <div className={cardClass(backend === 'managed')} onClick={() => selectBackend('managed')} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && selectBackend('managed')}>
          <Download className="w-5 h-5 text-accent-primary" />
          <span className="font-semibold text-sm text-text-main">Modell herunterladen</span>
          <span className="text-xs text-text-subtle">Lädt ein vordefiniertes Modell automatisch herunter</span>
        </div>
      </div>

      {/* Config block */}
      <div className="mt-4 p-4 rounded-xl border border-border-base bg-bg-app">
        {/* Ollama config */}
        {backend === 'ollama' && (
          <div className="flex flex-col gap-4">
            <div>
              <label className={labelClass}>Ollama URL</label>
              <input
                type="text"
                value={ollamaUrl}
                onChange={e => handleOllamaUrlChange(e.target.value)}
                className={inputClass}
                placeholder="http://localhost:11434"
              />
            </div>
            <div>
              <label className={labelClass}>Modell</label>
              <input
                type="text"
                value={ollamaModel}
                onChange={e => handleOllamaModelChange(e.target.value)}
                className={inputClass}
                placeholder="llama3.2"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleCheckOllama}
                disabled={ollamaStatus.state === 'checking'}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-border-base bg-bg-surface text-text-main hover:border-accent-primary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {ollamaStatus.state === 'checking' && <Loader className="w-4 h-4 animate-spin" />}
                Verbindung testen
              </button>

              {/* Inline feedback badge */}
              {ollamaStatus.state === 'checking' && (
                <span className="flex items-center gap-1.5 text-sm text-text-subtle">
                  <Loader className="w-4 h-4 animate-spin" />
                  Prüfe Verbindung…
                </span>
              )}
              {ollamaStatus.state === 'ok' && ollamaStatus.result.connected && ollamaStatus.result.modelAvailable && (
                <span className="flex items-center gap-1.5 text-sm text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  Verbunden — Modell verfügbar
                </span>
              )}
              {ollamaStatus.state === 'ok' && ollamaStatus.result.connected && !ollamaStatus.result.modelAvailable && (
                <span className="flex items-center gap-1.5 text-sm text-yellow-600">
                  <AlertCircle className="w-4 h-4" />
                  Verbunden — Modell nicht gefunden
                </span>
              )}
              {ollamaStatus.state === 'ok' && !ollamaStatus.result.connected && (
                <span className="flex items-center gap-1.5 text-sm text-red-500">
                  <AlertCircle className="w-4 h-4" />
                  Ollama nicht erreichbar
                </span>
              )}
              {ollamaStatus.state === 'error' && (
                <span className="flex items-center gap-1.5 text-sm text-red-500">
                  <AlertCircle className="w-4 h-4" />
                  {ollamaStatus.message}
                </span>
              )}
            </div>
          </div>
        )}

        {/* GGUF file config */}
        {backend === 'gguf' && (
          <div className="flex flex-col gap-3">
            <button
              onClick={handlePickGguf}
              className="self-start px-4 py-2 rounded-lg text-sm font-medium border border-border-base bg-bg-surface text-text-main hover:border-accent-primary/50 transition-colors"
            >
              Datei wählen
            </button>
            {ggufBasename && (
              <div className="flex items-center gap-2 text-sm">
                <HardDrive className="w-4 h-4 text-text-subtle shrink-0" />
                <span className="font-mono text-text-main break-all">{ggufBasename}</span>
              </div>
            )}
            {!ggufBasename && (
              <p className="text-xs text-text-subtle">Keine Datei ausgewählt</p>
            )}
          </div>
        )}

        {/* Managed model config */}
        {backend === 'managed' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              {MANAGED_MODELS.map(m => (
                <label
                  key={m.key}
                  className={[
                    'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                    managedModel === m.key
                      ? 'border-accent-primary bg-accent-primary/10'
                      : 'border-border-base bg-bg-surface hover:border-accent-primary/50',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="managed-model"
                    value={m.key}
                    checked={managedModel === m.key}
                    onChange={() => handleSelectManagedModel(m.key)}
                    className="accent-[var(--accent)]"
                  />
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-main">{m.label}</span>
                      {downloadedModels.has(m.key) && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-800 font-medium">Vorhanden</span>
                      )}
                    </div>
                    <span className="text-xs text-text-subtle font-mono">{m.detail}</span>
                  </div>
                </label>
              ))}
            </div>

            {/* Action row: download or delete */}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => electronAny.openModelsFolder()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-border-base bg-bg-surface text-text-main hover:border-accent-primary/50 transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                Ordner öffnen
              </button>
              {downloadState.phase !== 'done' && (
                <button
                  onClick={handleDownload}
                  disabled={!managedModel || downloadState.phase === 'downloading'}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-accent-primary text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {downloadState.phase === 'downloading' && <Loader className="w-4 h-4 animate-spin" />}
                  Herunterladen
                </button>
              )}

              {downloadState.phase === 'done' && (
                <>
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold text-green-800 bg-green-50">
                    <CheckCircle className="w-4 h-4" />
                    Bereit
                  </span>
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Modell löschen
                  </button>
                </>
              )}
            </div>

            {/* Progress bar */}
            {downloadState.phase === 'downloading' && (
              <div className="flex flex-col gap-2">
                <div className="bg-bg-app h-2 rounded-full w-full border border-border-base overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-accent-primary transition-all"
                    style={{ width: `${downloadState.progress.percent}%` }}
                  />
                </div>
                <p className="text-xs font-mono text-text-subtle">
                  {buildProgressBar(downloadState.progress.percent)}{'  '}
                  {downloadState.progress.percent}%
                  {downloadState.progress.total > 0 && (
                    <> — {formatBytes(downloadState.progress.downloaded)} / {formatBytes(downloadState.progress.total)}{'   '}{formatSpeed(downloadState.progress.speed)}</>
                  )}
                </p>
              </div>
            )}

            {/* Error badge */}
            {downloadState.phase === 'error' && (
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Download fehlgeschlagen: {downloadState.message}
                </span>
                <button
                  onClick={() => setDownloadState({ phase: 'idle' })}
                  className="self-start text-xs text-text-subtle underline"
                >
                  Erneut versuchen
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
