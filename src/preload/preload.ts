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
});

