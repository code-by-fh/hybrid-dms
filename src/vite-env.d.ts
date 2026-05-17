/// <reference types="vite/client" />

export {};

interface ElectronAPI {
  getDocuments: () => Promise<any[]>;
  saveAndMove: (data: any) => Promise<any>;
  onDocumentsChanged: (callback: () => void) => void;
  openDirectoryDialog: () => Promise<string | null>;
  getSettings: () => Promise<any>;
  updateSettings: (settings: any) => Promise<any>;
  moveToProcessing: (hash: string) => Promise<any>;
  checkOllamaStatus: () => Promise<boolean>;
  analyzeDocument: (hash: string) => Promise<any>;
  performOCR: (hash: string) => Promise<any>;
  retryProcessing: (hash: string) => Promise<any>;
  renameFile: (data: { hash: string; newName: string }) => Promise<any>;
  moveFile: (data: { hash: string; targetDir: string }) => Promise<any>;
  runCrawler: () => Promise<any>;
  getCrawlerStatus: () => Promise<any>;
  onCrawlerStatusChanged: (callback: (status: 'running' | 'idle') => void) => void;
  searchDocuments: (query: string) => Promise<any[]>;
  openDocumentFromTray: (uuid: string) => void;
  onOpenDocumentByUuid: (callback: (uuid: string) => void) => void;
  hideSearchWindow: () => void;
  checkOllamaConfig: (url: string, model: string) => Promise<{ connected: boolean; modelAvailable: boolean; availableModels: string[] }>;
  getLogPath: () => Promise<string>;
  setLogPath: (p: string) => Promise<any>;
  openLogFile: () => Promise<any>;
  openFileDialog: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  checkAiBackend: () => Promise<boolean>;
  downloadModel: (modelKey: string) => Promise<any>;
  onDownloadProgress: (callback: (progress: {
    modelKey: string;
    downloadedBytes: number;
    totalBytes: number;
    speedBytesPerSec: number;
    done?: boolean;
  }) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
