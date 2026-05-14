//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esmMin = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
var __toCommonJS = (mod) => __hasOwnProp.call(mod, "module.exports") ? mod["module.exports"] : __copyProps(__defProp({}, "__esModule", { value: true }), mod);
//#endregion
let electron = require("electron");
let path = require("path");
path = __toESM(path);
let better_sqlite3 = require("better-sqlite3");
better_sqlite3 = __toESM(better_sqlite3);
let fs = require("fs");
fs = __toESM(fs);
//#region src/main/db/index.ts
var db_exports = /* @__PURE__ */ __exportAll({
	default: () => db,
	deleteDocumentByPath: () => deleteDocumentByPath,
	getAllDocuments: () => getAllDocuments,
	getDocumentByHash: () => getDocumentByHash,
	getSetting: () => getSetting,
	initDb: () => initDb,
	insertDocument: () => insertDocument,
	setSetting: () => setSetting,
	updateDocumentMetadata: () => updateDocumentMetadata,
	updateDocumentPath: () => updateDocumentPath
});
var dbDir = path.default.join(electron.app.getPath("userData"), "dms-data");
if (!fs.default.existsSync(dbDir)) fs.default.mkdirSync(dbDir, { recursive: true });
var db = new better_sqlite3.default(path.default.join(dbDir, "database.sqlite"));
function initDb() {
	db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      last_path TEXT NOT NULL,
      tags TEXT,
      metadata TEXT,
      status TEXT DEFAULT 'new',
      indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}
function getSetting(key, defaultValue = "") {
	const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
	return row ? row.value : defaultValue;
}
function setSetting(key, value) {
	return db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}
function insertDocument(hash, lastPath, tags, metadata, status = "new") {
	return db.prepare("INSERT INTO documents (hash, last_path, tags, metadata, status) VALUES (?, ?, ?, ?, ?)").run(hash, lastPath, tags || "[]", metadata || "{}", status);
}
function getDocumentByHash(hash) {
	return db.prepare("SELECT * FROM documents WHERE hash = ?").get(hash);
}
function updateDocumentPath(hash, newPath) {
	return db.prepare("UPDATE documents SET last_path = ? WHERE hash = ?").run(newPath, hash);
}
function getAllDocuments() {
	return db.prepare("SELECT * FROM documents").all();
}
function updateDocumentMetadata(hash, tags, metadata, status = "processed") {
	return db.prepare("UPDATE documents SET tags = ?, metadata = ?, status = ? WHERE hash = ?").run(tags, metadata, status, hash);
}
function deleteDocumentByPath(filePath) {
	return db.prepare("DELETE FROM documents WHERE last_path = ?").run(filePath);
}
//#endregion
Object.defineProperty(exports, "__commonJSMin", {
	enumerable: true,
	get: function() {
		return __commonJSMin;
	}
});
Object.defineProperty(exports, "__esmMin", {
	enumerable: true,
	get: function() {
		return __esmMin;
	}
});
Object.defineProperty(exports, "__exportAll", {
	enumerable: true,
	get: function() {
		return __exportAll;
	}
});
Object.defineProperty(exports, "__toCommonJS", {
	enumerable: true,
	get: function() {
		return __toCommonJS;
	}
});
Object.defineProperty(exports, "__toESM", {
	enumerable: true,
	get: function() {
		return __toESM;
	}
});
Object.defineProperty(exports, "db_exports", {
	enumerable: true,
	get: function() {
		return db_exports;
	}
});
Object.defineProperty(exports, "getAllDocuments", {
	enumerable: true,
	get: function() {
		return getAllDocuments;
	}
});
Object.defineProperty(exports, "getDocumentByHash", {
	enumerable: true,
	get: function() {
		return getDocumentByHash;
	}
});
Object.defineProperty(exports, "getSetting", {
	enumerable: true,
	get: function() {
		return getSetting;
	}
});
Object.defineProperty(exports, "initDb", {
	enumerable: true,
	get: function() {
		return initDb;
	}
});
Object.defineProperty(exports, "insertDocument", {
	enumerable: true,
	get: function() {
		return insertDocument;
	}
});
Object.defineProperty(exports, "setSetting", {
	enumerable: true,
	get: function() {
		return setSetting;
	}
});
Object.defineProperty(exports, "updateDocumentMetadata", {
	enumerable: true,
	get: function() {
		return updateDocumentMetadata;
	}
});
Object.defineProperty(exports, "updateDocumentPath", {
	enumerable: true,
	get: function() {
		return updateDocumentPath;
	}
});
