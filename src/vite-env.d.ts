/// <reference types="vite/client" />

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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
