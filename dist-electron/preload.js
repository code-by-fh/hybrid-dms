let electron = require("electron");
//#region src/preload/preload.ts
electron.contextBridge.exposeInMainWorld("electronAPI", {
	getDocuments: () => electron.ipcRenderer.invoke("get-documents"),
	saveAndMove: (data) => electron.ipcRenderer.invoke("save-and-move", data),
	onDocumentsChanged: (callback) => {
		electron.ipcRenderer.removeAllListeners("documents-changed");
		electron.ipcRenderer.on("documents-changed", () => callback());
	},
	openDirectoryDialog: () => electron.ipcRenderer.invoke("open-directory-dialog"),
	getSettings: () => electron.ipcRenderer.invoke("get-settings"),
	updateSettings: (settings) => electron.ipcRenderer.invoke("update-settings", settings),
	moveToProcessing: (hash) => electron.ipcRenderer.invoke("move-to-processing", hash),
	checkOllamaStatus: () => electron.ipcRenderer.invoke("check-ollama-status"),
	analyzeDocument: (hash) => electron.ipcRenderer.invoke("analyze-document", hash),
	performOCR: (hash) => electron.ipcRenderer.invoke("perform-ocr", hash),
	retryProcessing: (hash) => electron.ipcRenderer.invoke("retry-processing", hash),
	renameFile: (data) => electron.ipcRenderer.invoke("rename-file", data),
	moveFile: (data) => electron.ipcRenderer.invoke("move-file", data)
});
//#endregion
