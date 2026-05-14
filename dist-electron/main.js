const require_db = require("./db-DMB1T_0E.js");
let electron = require("electron");
let path = require("path");
path = require_db.__toESM(path);
let fs_promises = require("fs/promises");
fs_promises = require_db.__toESM(fs_promises);
require("url");
let fs = require("fs");
fs = require_db.__toESM(fs);
let chokidar = require("chokidar");
chokidar = require_db.__toESM(chokidar);
let crypto = require("crypto");
crypto = require_db.__toESM(crypto);
let tesseract_js = require("tesseract.js");
let pdf_parse = require("pdf-parse");
pdf_parse = require_db.__toESM(pdf_parse);
//#region src/main/services/hashService.ts
async function calculateHash(filePath) {
	return new Promise((resolve, reject) => {
		const hash = crypto.default.createHash("sha256");
		const stream = fs.default.createReadStream(filePath);
		stream.on("error", (err) => reject(err));
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("end", () => resolve(hash.digest("hex")));
	});
}
//#endregion
//#region src/main/services/aiService.ts
async function checkOllamaStatus() {
	try {
		const config = getConfig();
		if ((await fetch(`${config.OLLAMA_URL}`)).ok) return true;
		return false;
	} catch (error) {
		return false;
	}
}
async function analyzeDocumentWithAI(text) {
	const config = getConfig();
	const prompt = `Analyze the following document text and extract the sender, date (in YYYY-MM-DD format), document type (e.g. Invoice, Contract, Receipt, Letter), and 3-5 relevant tags.
Return ONLY a valid JSON object with the following structure:
{
  "sender": "string",
  "date": "YYYY-MM-DD",
  "docType": "string",
  "tags": ["tag1", "tag2"]
}

Document Text:
${text.substring(0, 4e3)} // Limit text to avoid token limits
`;
	try {
		const response = await fetch(`${config.OLLAMA_URL}/api/generate`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: config.OLLAMA_MODEL,
				prompt,
				stream: false,
				format: "json"
			})
		});
		if (!response.ok) throw new Error(`Ollama HTTP error! status: ${response.status}`);
		const resultText = (await response.json()).response;
		try {
			return JSON.parse(resultText);
		} catch (e) {
			console.error("Failed to parse Ollama JSON response", resultText);
			return null;
		}
	} catch (error) {
		console.error("Error analyzing document with Ollama", error);
		return null;
	}
}
//#endregion
//#region src/main/services/ocrService.ts
/**
* Perform OCR or text extraction on a file.
*
* Strategy (in order):
* 1. For PDFs: try pdfjs text extraction (covers text-based PDFs)
* 2. For PDFs with no embedded text: render each page to an image via canvas, run Tesseract
* 3. For image files: run Tesseract directly
*/
async function performOCR(filePath) {
	if (path.default.extname(filePath).toLowerCase() === ".pdf") return await processPdf(filePath);
	return await ocrImage(filePath);
}
/**
* Run Tesseract OCR on an image (path or buffer).
*/
async function ocrImage(imageInput) {
	console.log(`[OCR] Running Tesseract on image...`);
	const worker = await (0, tesseract_js.createWorker)("deu+eng");
	const { data: { text } } = await worker.recognize(imageInput);
	await worker.terminate();
	console.log(`[OCR] Tesseract extracted ${text.trim().length} chars`);
	return text;
}
/**
* Process a PDF file:
* 1. Try pdfjs text extraction first (fast, no rendering needed)
* 2. Fall back to rendering each page via canvas + Tesseract
*/
async function processPdf(filePath) {
	console.log(`[OCR] Processing PDF: ${filePath}`);
	const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
	const data = new Uint8Array(await fs_promises.default.readFile(filePath));
	const pdf = await pdfjsLib.getDocument({ data }).promise;
	console.log(`[OCR] PDF loaded: ${pdf.numPages} page(s)`);
	let fullText = "";
	for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
		console.log(`[OCR] Processing page ${pageNum}/${pdf.numPages}...`);
		const page = await pdf.getPage(pageNum);
		try {
			const pageText = (await page.getTextContent()).items.map((item) => item.str).join(" ").trim();
			if (pageText.length > 20) {
				console.log(`[OCR] Page ${pageNum}: text extraction OK (${pageText.length} chars)`);
				fullText += pageText + "\n\n";
				continue;
			}
			console.log(`[OCR] Page ${pageNum}: text too short (${pageText.length} chars), will render for OCR`);
		} catch (textErr) {
			console.warn(`[OCR] Page ${pageNum}: text extraction failed, will render for OCR`, textErr);
		}
		try {
			const ocrText = await ocrImage(await renderPageToBuffer(page));
			if (ocrText.trim().length > 0) {
				console.log(`[OCR] Page ${pageNum}: Tesseract OCR extracted ${ocrText.trim().length} chars`);
				fullText += ocrText + "\n\n";
			} else console.warn(`[OCR] Page ${pageNum}: Tesseract found no text`);
		} catch (renderErr) {
			console.error(`[OCR] Page ${pageNum}: render + OCR failed`, renderErr);
		}
	}
	const trimmed = fullText.trim();
	if (trimmed.length === 0) throw new Error("No text could be extracted from the PDF (neither text layer nor image OCR).");
	console.log(`[OCR] PDF total extracted: ${trimmed.length} chars`);
	return trimmed;
}
/**
* Render a single PDF page to a PNG buffer using canvas.
* Scale 2.0 for better OCR quality.
*/
async function renderPageToBuffer(page) {
	const { createCanvas } = await import("canvas");
	const scale = 2;
	const viewport = page.getViewport({ scale });
	const canvasEl = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
	const ctx = canvasEl.getContext("2d");
	console.log(`[OCR] Rendering page at ${Math.ceil(viewport.width)}x${Math.ceil(viewport.height)} (scale ${scale})...`);
	await page.render({
		canvasContext: ctx,
		viewport
	}).promise;
	return canvasEl.toBuffer("image/png");
}
//#endregion
//#region src/main/services/syncEngine.ts
var pdfParse = pdf_parse.default.default || pdf_parse.default;
function getConfig() {
	return {
		INBOX_PATH: require_db.getSetting("INBOX_PATH", path.default.join(electron.app.getPath("userData"), "Inbox")),
		PROCESSING_PATH: require_db.getSetting("PROCESSING_PATH", path.default.join(electron.app.getPath("userData"), "Processing")),
		ARCHIVE_PATH: require_db.getSetting("ARCHIVE_PATH", path.default.join(electron.app.getPath("userData"), "Archive")),
		EXCLUDE_FOLDERS: require_db.getSetting("EXCLUDE_FOLDERS", "").split(",").map((s) => s.trim()).filter(Boolean),
		OLLAMA_URL: require_db.getSetting("OLLAMA_URL", "http://localhost:11434"),
		OLLAMA_MODEL: require_db.getSetting("OLLAMA_MODEL", "llama3.2")
	};
}
function ensureDirs() {
	const config = getConfig();
	[
		config.INBOX_PATH,
		config.PROCESSING_PATH,
		config.ARCHIVE_PATH
	].forEach((dir) => {
		if (!fs.default.existsSync(dir)) fs.default.mkdirSync(dir, { recursive: true });
	});
}
var currentWatcher = null;
function startWatcher(onDbChange) {
	if (currentWatcher) currentWatcher.close();
	ensureDirs();
	const config = getConfig();
	const watchPaths = [
		config.INBOX_PATH,
		config.PROCESSING_PATH,
		config.ARCHIVE_PATH
	];
	console.log(`[Sync] Starting watcher for paths:`, watchPaths);
	currentWatcher = chokidar.default.watch(watchPaths, {
		ignored: /(^|[\/\\])\../,
		persistent: true,
		awaitWriteFinish: true
	});
	currentWatcher.on("add", async (filePath) => {
		const normalizedPath = path.default.normalize(filePath);
		console.log(`\n[DEBUG][Watcher] ========================================`);
		console.log(`[DEBUG][Watcher] File detected: ${normalizedPath}`);
		console.log(`[DEBUG][Watcher] Time: ${(/* @__PURE__ */ new Date()).toISOString()}`);
		try {
			const hash = await calculateHash(normalizedPath);
			console.log(`[DEBUG][Watcher] Hash: ${hash}`);
			const config = getConfig();
			const normalizedInbox = path.default.normalize(config.INBOX_PATH);
			const normalizedProcessing = path.default.normalize(config.PROCESSING_PATH);
			const filePathLower = normalizedPath.toLowerCase();
			const inboxPathLower = normalizedInbox.toLowerCase();
			const isInInboxDir = filePathLower.startsWith(inboxPathLower);
			console.log(`[DEBUG][Watcher] INBOX_PATH      = ${normalizedInbox}`);
			console.log(`[DEBUG][Watcher] PROCESSING_PATH = ${normalizedProcessing}`);
			console.log(`[DEBUG][Watcher] Datei liegt im Inbox-Ordner? ${isInInboxDir}`);
			if (!isInInboxDir) {
				console.log(`[DEBUG][Watcher] MISMATCH DETAIL:`);
				console.log(`[DEBUG][Watcher]   Datei-Pfad (lower): ${filePathLower}`);
				console.log(`[DEBUG][Watcher]   Inbox-Pfad (lower): ${inboxPathLower}`);
			}
			const existing = require_db.getDocumentByHash(hash);
			if (existing) if (path.default.normalize(existing.last_path).toLowerCase() === filePathLower) if (isInInboxDir && (existing.status === "new" || existing.status === "error")) {
				console.log(`[DEBUG][Watcher] Datei bereits in Inbox mit Status '${existing.status}' — DB-Eintrag löschen und neu verarbeiten`);
				require_db.deleteDocumentByPath(existing.last_path);
			} else {
				console.log(`[DEBUG][Watcher] Gleicher Pfad und kein Handlungsbedarf — überspringe.`);
				console.log(`[DEBUG][Watcher] ========================================\n`);
				return;
			}
			else if (isInInboxDir) {
				console.log(`[DEBUG][Watcher] Bekannte Datei jetzt in Inbox (${normalizedPath}) — alter Eintrag gelöscht, wird neu verarbeitet`);
				require_db.deleteDocumentByPath(existing.last_path);
			} else {
				console.log(`[DEBUG][Watcher] Pfad geändert (außerhalb Inbox): ${existing.last_path} -> ${normalizedPath}`);
				require_db.updateDocumentPath(hash, normalizedPath);
				if (onDbChange) onDbChange();
				console.log(`[DEBUG][Watcher] ========================================\n`);
				return;
			}
			const isInbox = isInInboxDir;
			console.log(`[DEBUG][Watcher] Neue Datei. isInbox=${isInbox}`);
			if (!isInbox) {
				console.log(`[DEBUG][Watcher] Außerhalb Inbox — als 'processed' indexieren.`);
				require_db.insertDocument(hash, normalizedPath, "[]", "{}", "processed");
				if (onDbChange) onDbChange();
				console.log(`[DEBUG][Watcher] ========================================\n`);
				return;
			}
			console.log(`[DEBUG][Step 1] Reading file...`);
			const dataBuffer = await fs_promises.default.readFile(normalizedPath);
			console.log(`[DEBUG][Step 1] File size: ${dataBuffer.length} bytes`);
			let hasText = false;
			let extractedText = "";
			try {
				console.log(`[DEBUG][Step 1] Running pdf-parse...`);
				extractedText = (await pdfParse(dataBuffer)).text || "";
				hasText = extractedText.trim().length > 50;
				console.log(`[DEBUG][Step 1] pdf-parse result: ${extractedText.trim().length} chars, hasText=${hasText}`);
			} catch (e) {
				console.error(`[DEBUG][Step 1] pdf-parse FAILED:`, e);
			}
			require_db.insertDocument(hash, normalizedPath, "[]", JSON.stringify({ needsOcr: !hasText }));
			console.log(`[DEBUG][Step 2] Inserted into DB (needsOcr=${!hasText})`);
			if (onDbChange) onDbChange();
			if (!hasText) {
				console.log(`[DEBUG][Step 3] No text found — starting OCR...`);
				require_db.updateDocumentStatus(hash, "ocr_processing");
				if (onDbChange) onDbChange();
				try {
					extractedText = await performOCR(normalizedPath);
					if (extractedText && extractedText.trim().length > 50) {
						hasText = true;
						console.log(`[DEBUG][Step 3] OCR SUCCESS: ${extractedText.trim().length} chars`);
						require_db.updateDocumentMetadata(hash, "[]", JSON.stringify({ needsOcr: false }), "new");
						if (onDbChange) onDbChange();
					} else {
						console.warn(`[DEBUG][Step 3] OCR result too short (${extractedText?.trim().length ?? 0} chars) — REAL FAILURE`);
						require_db.updateDocumentStatus(hash, "error");
						if (onDbChange) onDbChange();
						console.log(`[DEBUG][Watcher] ========================================\n`);
						return;
					}
				} catch (ocrError) {
					console.error(`[DEBUG][Step 3] OCR THREW exception:`, ocrError);
					require_db.updateDocumentStatus(hash, "error");
					if (onDbChange) onDbChange();
					console.log(`[DEBUG][Watcher] ========================================\n`);
					return;
				}
			}
			console.log(`[DEBUG][Step 4] Starting AI analysis...`);
			require_db.updateDocumentStatus(hash, "ai_processing");
			if (onDbChange) onDbChange();
			let tags = "[]";
			let aiMetadata = JSON.stringify({
				needsOcr: false,
				aiSkipped: true
			});
			try {
				const aiResult = await analyzeDocumentWithAI(extractedText);
				if (aiResult) {
					tags = Array.isArray(aiResult.tags) ? JSON.stringify(aiResult.tags) : "[]";
					aiMetadata = JSON.stringify({
						sender: aiResult.sender || "",
						date: aiResult.date || "",
						docType: aiResult.docType || "",
						needsOcr: false
					});
					console.log(`[DEBUG][Step 4] AI SUCCESS: sender="${aiResult.sender}", date="${aiResult.date}", type="${aiResult.docType}", tags=${tags}`);
				} else console.warn(`[DEBUG][Step 4] AI returned null (Ollama offline?) — will move to Sortieren for manual review`);
			} catch (aiError) {
				console.error(`[DEBUG][Step 4] AI THREW exception:`, aiError);
			}
			require_db.updateDocumentMetadata(hash, tags, aiMetadata, "new");
			console.log(`[DEBUG][Step 5] Metadata saved. Moving to Sortieren...`);
			const fileName = path.default.basename(normalizedPath);
			const processingPath = path.default.join(config.PROCESSING_PATH, fileName);
			console.log(`[DEBUG][Step 5] Target: ${processingPath}`);
			try {
				await fs_promises.default.rename(normalizedPath, processingPath);
				require_db.updateDocumentPath(hash, processingPath);
				console.log(`[DEBUG][Step 5] ✓ Moved to Sortieren: ${processingPath}`);
			} catch (moveErr) {
				console.error(`[DEBUG][Step 5] Move FAILED:`, moveErr);
			}
			if (onDbChange) onDbChange();
			console.log(`[DEBUG][Watcher] ✓ Pipeline complete for ${hash}`);
		} catch (err) {
			console.error(`[DEBUG][Watcher] UNHANDLED ERROR for ${normalizedPath}:`, err);
		}
		console.log(`[DEBUG][Watcher] ========================================\n`);
	});
	currentWatcher.on("unlink", (filePath) => {
		console.log(`File deleted: ${filePath}`);
		setTimeout(() => {
			Promise.resolve().then(() => require("./db-DMB1T_0E.js")).then((n) => n.db_exports).then((db) => {
				db.deleteDocumentByPath(filePath);
				if (onDbChange) onDbChange();
			});
		}, 2e3);
	});
	return currentWatcher;
}
async function runHashCrawler() {
	console.log("Starting Hash Crawler...");
	const config = getConfig();
	const files = await walkDir(config.ARCHIVE_PATH, config.EXCLUDE_FOLDERS);
	for (const filePath of files) try {
		const hash = await calculateHash(filePath);
		const existing = require_db.getDocumentByHash(hash);
		if (existing) {
			if (existing.last_path !== filePath) {
				console.log(`Path change detected for ${hash}: ${existing.last_path} -> ${filePath}`);
				require_db.updateDocumentPath(hash, filePath);
			}
		} else {
			console.log(`New file found in archive, indexing: ${filePath}`);
			require_db.insertDocument(hash, filePath, "[]", "{}", "processed");
		}
	} catch (e) {
		console.error(`Error hashing file ${filePath}:`, e);
	}
}
/**
* Scans the database for documents that need OCR or AI analysis and processes them.
* Also resets stuck processing states for docs in Sortieren.
*/
async function processPendingDocuments(onDbChange) {
	console.log("Checking for pending OCR or AI tasks...");
	const docs = require_db.getAllDocuments();
	const config = getConfig();
	for (const doc of docs) {
		let metadata;
		try {
			metadata = JSON.parse(doc.metadata || "{}");
		} catch (e) {
			metadata = {};
		}
		const isInBox = doc.last_path.startsWith(config.INBOX_PATH);
		if (doc.last_path.startsWith(config.PROCESSING_PATH) && (doc.status === "ocr_processing" || doc.status === "ai_processing")) {
			console.log(`[Sync] Resetting stuck status '${doc.status}' for ${doc.hash} in Sortieren`);
			require_db.updateDocumentStatus(doc.hash, "new");
			if (onDbChange) onDbChange();
			continue;
		}
		if (isInBox && (metadata.needsOcr || doc.status === "error")) {
			console.log(`Auto-starting OCR for pending document: ${doc.hash}`);
			try {
				require_db.updateDocumentStatus(doc.hash, "ocr_processing");
				if (onDbChange) onDbChange();
				const extractedText = await performOCR(doc.last_path);
				if (extractedText && extractedText.trim().length > 50) {
					console.log(`Auto-OCR successful for ${doc.hash}`);
					require_db.updateDocumentMetadata(doc.hash, doc.tags, JSON.stringify({
						...metadata,
						needsOcr: false
					}), "new");
					if (onDbChange) onDbChange();
					console.log(`Triggering AI analysis for ${doc.hash} after Auto-OCR`);
					require_db.updateDocumentStatus(doc.hash, "ai_processing");
					if (onDbChange) onDbChange();
					const aiResult = await analyzeDocumentWithAI(extractedText);
					if (aiResult) {
						const tags = Array.isArray(aiResult.tags) ? JSON.stringify(aiResult.tags) : "[]";
						const newMetadata = JSON.stringify({
							sender: aiResult.sender || "",
							date: aiResult.date || "",
							docType: aiResult.docType || "",
							needsOcr: false
						});
						require_db.updateDocumentMetadata(doc.hash, tags, newMetadata, "new");
						const fileName = path.default.basename(doc.last_path);
						const processingPath = path.default.join(config.PROCESSING_PATH, fileName);
						try {
							await fs_promises.default.rename(doc.last_path, processingPath);
							require_db.updateDocumentPath(doc.hash, processingPath);
							console.log(`[Sync] Pending doc processed and moved to Sortieren: ${processingPath}`);
						} catch (moveErr) {
							console.error(`[Sync] Failed to move processed doc to Sortieren`, moveErr);
						}
						if (onDbChange) onDbChange();
					} else {
						require_db.updateDocumentStatus(doc.hash, "error");
						if (onDbChange) onDbChange();
					}
				} else {
					require_db.updateDocumentStatus(doc.hash, "error");
					if (onDbChange) onDbChange();
				}
			} catch (e) {
				console.error(`Auto-OCR failed for ${doc.hash}`, e);
				require_db.updateDocumentStatus(doc.hash, "error");
				if (onDbChange) onDbChange();
			}
		}
	}
}
async function walkDir(dir, excludeFolders) {
	let results = [];
	try {
		const list = await fs_promises.default.readdir(dir);
		for (const file of list) {
			const filePath = path.default.resolve(dir, file);
			const stat = await fs_promises.default.stat(filePath);
			if (stat && stat.isDirectory()) {
				const folderName = path.default.basename(filePath);
				if (excludeFolders.includes(folderName) || excludeFolders.includes(filePath)) {
					console.log(`Excluding folder: ${filePath}`);
					continue;
				}
				results = results.concat(await walkDir(filePath, excludeFolders));
			} else results.push(filePath);
		}
	} catch (e) {
		console.error(e);
	}
	return results;
}
//#endregion
//#region src/main/main.ts
var __dirname$1 = path.default.resolve();
var mainWindow = null;
function createWindow() {
	mainWindow = new electron.BrowserWindow({
		width: 1200,
		height: 800,
		webPreferences: {
			preload: path.default.join(__dirname$1, "dist-electron", "preload.js"),
			nodeIntegration: false,
			contextIsolation: true,
			webSecurity: false
		}
	});
	if (process.env.VITE_DEV_SERVER_URL) {
		mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
		mainWindow.webContents.openDevTools();
	} else mainWindow.loadFile(path.default.join(__dirname$1, "dist", "index.html"));
}
electron.app.whenReady().then(() => {
	require_db.initDb();
	startWatcher(() => {
		if (mainWindow) mainWindow.webContents.send("documents-changed");
	});
	setInterval(runHashCrawler, 60 * 1e3);
	runHashCrawler().then(() => {
		processPendingDocuments(() => {
			if (mainWindow) mainWindow.webContents.send("documents-changed");
		});
	});
	createWindow();
	electron.app.on("activate", function() {
		if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});
electron.app.on("window-all-closed", function() {
	if (process.platform !== "darwin") electron.app.quit();
});
electron.ipcMain.handle("get-documents", async () => {
	return require_db.getAllDocuments();
});
electron.ipcMain.handle("save-and-move", async (event, { hash, tags, metadata }) => {
	try {
		const doc = require_db.getDocumentByHash(hash);
		if (!doc) throw new Error("Document not found");
		const config = getConfig();
		let fileName = path.default.basename(doc.last_path);
		if (metadata) {
			const ext = path.default.extname(doc.last_path);
			const dateStr = metadata.date ? metadata.date.replace(/[^0-9-]/g, "") : "";
			const senderStr = metadata.sender ? metadata.sender.replace(/[^a-zA-Z0-9_ -]/g, "_").trim() : "";
			const typeStr = metadata.docType ? metadata.docType.replace(/[^a-zA-Z0-9_ -]/g, "_").trim() : "";
			let newNameParts = [];
			if (dateStr) newNameParts.push(dateStr);
			if (senderStr) newNameParts.push(senderStr);
			if (typeStr) newNameParts.push(typeStr);
			if (newNameParts.length > 0) fileName = newNameParts.join("_").replace(/\s+/g, "_") + ext;
		}
		let targetPath = path.default.join(config.ARCHIVE_PATH, fileName);
		let counter = 1;
		while (await fs_promises.default.stat(targetPath).then(() => true).catch(() => false) && doc.last_path !== targetPath) {
			const nameWithoutExt = path.default.basename(fileName, path.default.extname(fileName));
			targetPath = path.default.join(config.ARCHIVE_PATH, `${nameWithoutExt}_${counter}${path.default.extname(fileName)}`);
			counter++;
		}
		if (doc.last_path !== targetPath) await fs_promises.default.rename(doc.last_path, targetPath);
		require_db.updateDocumentMetadata(hash, JSON.stringify(tags), JSON.stringify(metadata), "processed");
		require_db.updateDocumentPath(hash, targetPath);
		console.log(`Document moved to archive: ${targetPath}`);
		return { success: true };
	} catch (err) {
		console.error("Save & Move failed:", err);
		return {
			success: false,
			error: err.message
		};
	}
});
electron.ipcMain.handle("move-to-processing", async (event, hash) => {
	try {
		const doc = require_db.getDocumentByHash(hash);
		if (!doc) throw new Error("Document not found");
		const config = getConfig();
		const fileName = path.default.basename(doc.last_path);
		const targetPath = path.default.join(config.PROCESSING_PATH, fileName);
		await fs_promises.default.rename(doc.last_path, targetPath);
		require_db.updateDocumentPath(hash, targetPath);
		require_db.updateDocumentStatus(hash, "new");
		return { success: true };
	} catch (err) {
		console.error("Move to processing failed:", err);
		return {
			success: false,
			error: err.message
		};
	}
});
electron.ipcMain.handle("open-directory-dialog", async () => {
	if (!mainWindow) return null;
	const result = await electron.dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
	if (result.canceled) return null;
	return result.filePaths[0];
});
electron.ipcMain.handle("get-settings", async () => {
	return getConfig();
});
electron.ipcMain.handle("update-settings", async (event, newSettings) => {
	Object.entries(newSettings).forEach(([key, value]) => {
		require_db.setSetting(key, value);
	});
	startWatcher(() => {
		if (mainWindow) mainWindow.webContents.send("documents-changed");
	});
	return { success: true };
});
electron.ipcMain.handle("check-ollama-status", async () => {
	return checkOllamaStatus();
});
electron.ipcMain.handle("perform-ocr", async (event, hash) => {
	try {
		const doc = require_db.getDocumentByHash(hash);
		if (!doc) throw new Error("Document not found");
		console.log(`Manual OCR requested for ${hash}`);
		const text = await performOCR(doc.last_path);
		if (!text || text.trim().length < 50) return {
			success: false,
			error: "OCR results too short or empty"
		};
		const currentMeta = doc.metadata ? JSON.parse(doc.metadata) : {};
		require_db.updateDocumentMetadata(hash, doc.tags, JSON.stringify({
			...currentMeta,
			needsOcr: false
		}), doc.status);
		return {
			success: true,
			text
		};
	} catch (e) {
		console.error("OCR IPC Error", e);
		return {
			success: false,
			error: e.message
		};
	}
});
electron.ipcMain.handle("analyze-document", async (event, hash) => {
	try {
		const doc = require_db.getDocumentByHash(hash);
		if (!doc) throw new Error("Document not found");
		const parser = new pdf_parse.PDFParse({ data: await fs_promises.default.readFile(doc.last_path) });
		const pdfData = await parser.getText();
		await parser.destroy();
		const text = pdfData.text;
		if (!text || text.trim().length < 50) return {
			success: false,
			error: "Not enough text found in document (OCR needed)"
		};
		const aiResult = await analyzeDocumentWithAI(text);
		if (!aiResult) return {
			success: false,
			error: "AI analysis failed"
		};
		return {
			success: true,
			data: aiResult
		};
	} catch (e) {
		console.error("Analysis error", e);
		return {
			success: false,
			error: e.message
		};
	}
});
electron.ipcMain.handle("retry-processing", async (event, hash) => {
	try {
		if (!require_db.getDocumentByHash(hash)) throw new Error("Document not found");
		require_db.updateDocumentStatus(hash, "new");
		processPendingDocuments(() => {
			if (mainWindow) mainWindow.webContents.send("documents-changed");
		});
		return { success: true };
	} catch (err) {
		console.error("Retry processing failed:", err);
		return {
			success: false,
			error: err.message
		};
	}
});
electron.ipcMain.handle("rename-file", async (event, { hash, newName }) => {
	try {
		const doc = require_db.getDocumentByHash(hash);
		if (!doc) throw new Error("Document not found");
		const dir = path.default.dirname(doc.last_path);
		const ext = path.default.extname(doc.last_path);
		const safeName = newName.replace(/[<>:"/\\|?*]/g, "_").trim();
		const nameWithExt = safeName.endsWith(ext) ? safeName : safeName + ext;
		const newPath = path.default.join(dir, nameWithExt);
		await fs_promises.default.rename(doc.last_path, newPath);
		require_db.updateDocumentPath(hash, newPath);
		return {
			success: true,
			newPath
		};
	} catch (err) {
		console.error("Rename file failed:", err);
		return {
			success: false,
			error: err.message
		};
	}
});
electron.ipcMain.handle("move-file", async (event, { hash, targetDir }) => {
	try {
		const doc = require_db.getDocumentByHash(hash);
		if (!doc) throw new Error("Document not found");
		const config = getConfig();
		if (!targetDir.startsWith(config.ARCHIVE_PATH)) throw new Error("Target directory must be within the archive");
		await fs_promises.default.mkdir(targetDir, { recursive: true });
		const fileName = path.default.basename(doc.last_path);
		const newPath = path.default.join(targetDir, fileName);
		if (doc.last_path !== newPath) {
			await fs_promises.default.rename(doc.last_path, newPath);
			require_db.updateDocumentPath(hash, newPath);
		}
		return {
			success: true,
			newPath
		};
	} catch (err) {
		console.error("Move file failed:", err);
		return {
			success: false,
			error: err.message
		};
	}
});
//#endregion
