let electron = require("electron");
//#region src/preload/preload.ts
electron.contextBridge.exposeInMainWorld("electronAPI", {
	getDocuments: () => electron.ipcRenderer.invoke("get-documents"),
	saveAndMove: (data) => electron.ipcRenderer.invoke("save-and-move", data),
	onNewDocument: (callback) => {
		electron.ipcRenderer.on("new-document", (_event, doc) => callback(doc));
	}
});
//#endregion
