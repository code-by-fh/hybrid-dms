import { PDFDocument } from 'pdf-lib';
import fs from 'fs/promises';

const UUID_PREFIX = 'dms-uuid:';

export async function readDocumentUuid(filePath: string): Promise<string | null> {
  try {
    // TODO: perf — reads full file; acceptable for event-driven watcher, revisit for large-archive crawler
    const bytes = await fs.readFile(filePath);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const subject = doc.getSubject();
    if (subject && subject.startsWith(UUID_PREFIX)) {
      return subject.slice(UUID_PREFIX.length);
    }
    return null;
  } catch (e) {
    console.warn('[xmpService] readDocumentUuid failed for', filePath, e);
    return null;
  }
}

export async function writeXmpMetadata(
  filePath: string,
  uuid: string,
  tags: string[],
  textExcerpt: string = ''  // kept for API compatibility but not written to PDF
): Promise<void> {
  if (!uuid) throw new Error('uuid is required');
  const bytes = await fs.readFile(filePath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  doc.setSubject(`${UUID_PREFIX}${uuid}`);
  doc.setKeywords(tags);
  const savedBytes = await doc.save();
  // Atomic write: temp file → rename (crash-safe, avoids Windows file-lock on original)
  const tmpPath = filePath + '.dmstmp';
  try {
    await fs.writeFile(tmpPath, savedBytes);
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
  }
}
