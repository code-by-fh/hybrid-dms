import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

// Speichere die SQLite-Datei standardmäßig im AppData Verzeichnis des Users
const dbDir = path.join(app.getPath('userData'), 'dms-data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const dbPath = path.join(dbDir, 'database.sqlite');

const db = new Database(dbPath);

export function initDb() {
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

export function getSetting(key: string, defaultValue: string = ''): string {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const row = stmt.get(key) as any;
  return row ? row.value : defaultValue;
}

export function setSetting(key: string, value: string) {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  return stmt.run(key, value);
}

export function insertDocument(hash: string, lastPath: string, tags?: string, metadata?: string, status: string = 'new') {
  const stmt = db.prepare('INSERT INTO documents (hash, last_path, tags, metadata, status) VALUES (?, ?, ?, ?, ?)');
  return stmt.run(hash, lastPath, tags || '[]', metadata || '{}', status);
}

export function getDocumentByHash(hash: string) {
  const stmt = db.prepare('SELECT * FROM documents WHERE hash = ?');
  return stmt.get(hash) as any;
}

export function updateDocumentPath(hash: string, newPath: string) {
  const stmt = db.prepare('UPDATE documents SET last_path = ? WHERE hash = ?');
  return stmt.run(newPath, hash);
}

export function getAllDocuments() {
  const stmt = db.prepare('SELECT * FROM documents');
  return stmt.all() as any[];
}

export function updateDocumentMetadata(hash: string, tags: string, metadata: string, status: string = 'processed') {
    const stmt = db.prepare('UPDATE documents SET tags = ?, metadata = ?, status = ? WHERE hash = ?');
    return stmt.run(tags, metadata, status, hash);
}

export function deleteDocumentByPath(filePath: string) {
    const stmt = db.prepare('DELETE FROM documents WHERE last_path = ?');
    return stmt.run(filePath);
}

export function updateDocumentStatus(hash: string, status: string) {
    const stmt = db.prepare('UPDATE documents SET status = ? WHERE hash = ?');
    return stmt.run(status, hash);
}

export default db;
