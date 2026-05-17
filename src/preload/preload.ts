import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getDocuments: () => ipcRenderer.invoke('get-documents'),
  saveAndMove: (data: any) => ipcRenderer.invoke('save-and-move', data),
  onDocumentsChanged: (callback: () => void) => {
    ipcRenderer.removeAllListeners('documents-changed');
    ipcRenderer.on('documents-changed', () => callback());
  },
  openDirectoryDialog: () => ipcRenderer.invoke('open-directory-dialog'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings: any) => ipcRenderer.invoke('update-settings', settings),
  moveToProcessing: (hash: string) => ipcRenderer.invoke('move-to-processing', hash),
  checkOllamaStatus: () => ipcRenderer.invoke('check-ollama-status'),
  analyzeDocument: (hash: string) => ipcRenderer.invoke('analyze-document', hash),
  performOCR: (hash: string) => ipcRenderer.invoke('perform-ocr', hash),
  retryProcessing: (hash: string) => ipcRenderer.invoke('retry-processing', hash),
  renameFile: (data: { hash: string; newName: string }) => ipcRenderer.invoke('rename-file', data),
  moveFile: (data: { hash: string; targetDir: string }) => ipcRenderer.invoke('move-file', data),
  runCrawler: () => ipcRenderer.invoke('run-crawler'),
  getCrawlerStatus: () => ipcRenderer.invoke('get-crawler-status'),
  onCrawlerStatusChanged: (callback: (status: 'running' | 'idle') => void) => {
    ipcRenderer.removeAllListeners('crawler-status-changed');
    ipcRenderer.on('crawler-status-changed', (_event, status) => callback(status));
  },
  searchDocuments: (query: string) => ipcRenderer.invoke('search-documents', query),
  openDocumentFromTray: (uuid: string) => ipcRenderer.send('open-document-from-tray', uuid),
  onOpenDocumentByUuid: (callback: (uuid: string) => void) => {
    ipcRenderer.removeAllListeners('open-document-by-uuid');
    ipcRenderer.on('open-document-by-uuid', (_event, uuid) => callback(uuid));
  },
  hideSearchWindow: () => ipcRenderer.send('hide-search-window'),
  checkOllamaConfig: (url: string, model: string) => ipcRenderer.invoke('check-ollama-config', { url, model }),
  getLogPath: () => ipcRenderer.invoke('get-log-path'),
  setLogPath: (p: string) => ipcRenderer.invoke('set-log-path', p),
  openLogFile: () => ipcRenderer.invoke('open-log-file'),
  openFileDialog: (options?: { filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('open-file-dialog', options),
  checkAiBackend: () => ipcRenderer.invoke('check-ai-backend'),
  downloadModel: (modelKey: string) => ipcRenderer.invoke('download-model', modelKey),
  checkModelDownloaded: (modelKey: string) => ipcRenderer.invoke('check-model-downloaded', modelKey),
  deleteModel: (modelKey: string) => ipcRenderer.invoke('delete-model', modelKey),
  openModelsFolder: () => ipcRenderer.invoke('open-models-folder'),
  onDownloadProgress: (callback: (progress: {
    modelKey: string;
    downloadedBytes: number;
    totalBytes: number;
    speedBytesPerSec: number;
    done?: boolean;
  }) => void) => {
    ipcRenderer.removeAllListeners('download-progress');
    ipcRenderer.on('download-progress', (_event, progress) => callback(progress));
  },
});

