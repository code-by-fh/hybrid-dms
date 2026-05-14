import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import crypto from 'crypto';

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
      uuid TEXT,
      hash TEXT NOT NULL,
      last_path TEXT NOT NULL,
      tags TEXT,
      metadata TEXT,
      full_text TEXT,
      status TEXT DEFAULT 'new',
      indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      uuid,
      full_text,
      tokenize='unicode61'
    );
  `);

  // Migration: add uuid column if it doesn't exist yet (for existing DBs)
  const cols = (db.prepare("PRAGMA table_info(documents)").all() as any[]).map(c => c.name);
  if (!cols.includes('uuid')) {
    db.exec("ALTER TABLE documents ADD COLUMN uuid TEXT");
  }
  if (!cols.includes('full_text')) {
    db.exec("ALTER TABLE documents ADD COLUMN full_text TEXT");
  }

  // Assign UUIDs to existing rows that have none (wrapped in transaction for atomicity + speed)
  const rowsWithoutUuid = db.prepare("SELECT id FROM documents WHERE uuid IS NULL OR uuid = ''").all() as any[];
  if (rowsWithoutUuid.length > 0) {
    const updateUuid = db.prepare("UPDATE documents SET uuid = ? WHERE id = ?");
    const insertFts = db.prepare("INSERT OR IGNORE INTO documents_fts (uuid, full_text) VALUES (?, '')");
    db.transaction(() => {
      for (const row of rowsWithoutUuid as any[]) {
        const newUuid = crypto.randomUUID();
        updateUuid.run(newUuid, row.id);
        insertFts.run(newUuid);
      }
    })();
  }

  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_uuid ON documents(uuid) WHERE uuid IS NOT NULL");
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
  // Look up uuid before deleting so we can clean FTS5
  const row = db.prepare('SELECT uuid FROM documents WHERE last_path = ?').get(filePath) as any;
  if (row?.uuid) {
    db.prepare('DELETE FROM documents_fts WHERE uuid = ?').run(row.uuid);
  }
  return db.prepare('DELETE FROM documents WHERE last_path = ?').run(filePath);
}

export function updateDocumentStatus(hash: string, status: string) {
    const stmt = db.prepare('UPDATE documents SET status = ? WHERE hash = ?');
    return stmt.run(status, hash);
}

export function getDocumentByUuid(uuid: string) {
  return db.prepare('SELECT * FROM documents WHERE uuid = ?').get(uuid) as any;
}

export function insertDocumentWithUuid(
  uuid: string, hash: string, lastPath: string,
  tags?: string, metadata?: string, status: string = 'new'
) {
  const stmt = db.prepare(
    'INSERT INTO documents (uuid, hash, last_path, tags, metadata, status) VALUES (?, ?, ?, ?, ?, ?)'
  );
  stmt.run(uuid, hash, lastPath, tags || '[]', metadata || '{}', status);
  db.prepare("INSERT OR IGNORE INTO documents_fts (uuid, full_text) VALUES (?, '')").run(uuid);
}

export function updateFullText(uuid: string, fullText: string) {
  db.prepare('UPDATE documents SET full_text = ? WHERE uuid = ?').run(fullText, uuid);
  db.prepare('DELETE FROM documents_fts WHERE uuid = ?').run(uuid);
  db.prepare('INSERT INTO documents_fts (uuid, full_text) VALUES (?, ?)').run(uuid, fullText);
}

export function searchDocuments(query: string): any[] {
  try {
    return db.prepare(`
      SELECT d.uuid, d.last_path, d.tags, d.metadata, d.status,
             snippet(documents_fts, 1, '<mark>', '</mark>', '...', 20) AS snippet
      FROM documents_fts f
      JOIN documents d ON d.uuid = f.uuid
      WHERE documents_fts MATCH ?
      ORDER BY rank
      LIMIT 50
    `).all(query) as any[];
  } catch {
    return [];
  }
}

export function deleteDocumentByUuid(uuid: string) {
  db.prepare('DELETE FROM documents_fts WHERE uuid = ?').run(uuid);
  db.prepare('DELETE FROM documents WHERE uuid = ?').run(uuid);
}

export function getUuidByHash(hash: string): string | null {
  const row = db.prepare('SELECT uuid FROM documents WHERE hash = ?').get(hash) as any;
  return row ? row.uuid : null;
}

export default db;
