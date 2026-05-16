import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { getSetting, setSetting } from '../db/index.js';

let logFilePath = '';

function rotateIfNeeded(filePath: string) {
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > 95 * 1024 * 1024) {
      const oldPath = filePath + '.old';
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      fs.renameSync(filePath, oldPath);
    }
  } catch {
    // File doesn't exist yet — fine
  }
}

export function initLogger() {
  const stored = getSetting('LOG_PATH', '');
  logFilePath = stored || path.join(app.getPath('userData'), 'logs', 'dms.log');
  const dir = path.dirname(logFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  rotateIfNeeded(logFilePath);
}

export function getLogPath(): string {
  return logFilePath;
}

export function setLogPath(newPath: string) {
  setSetting('LOG_PATH', newPath);
  logFilePath = newPath;
  const dir = path.dirname(logFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  rotateIfNeeded(logFilePath);
}

export function log(level: 'info' | 'warn' | 'error', ...args: unknown[]) {
  const timestamp = new Date().toISOString();
  const message = args
    .map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
    .join(' ');
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;

  if (level === 'error') console.error(...args);
  else if (level === 'warn') console.warn(...args);
  else console.log(...args);

  if (!logFilePath) return;
  try {
    fs.appendFileSync(logFilePath, line, 'utf8');
  } catch {
    // Non-fatal
  }
}
