import { PDFDocument } from 'pdf-lib';
import fs from 'fs/promises';

const UUID_PREFIX = 'dms-uuid:';

export async function readDocumentUuid(filePath: string): Promise<string | null> {
  try {
    const bytes = await fs.readFile(filePath);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const subject = doc.getSubject();
    if (subject && subject.startsWith(UUID_PREFIX)) {
      return subject.slice(UUID_PREFIX.length);
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeXmpMetadata(
  filePath: string,
  uuid: string,
  tags: string[],
  textExcerpt: string = ''
): Promise<void> {
  const bytes = await fs.readFile(filePath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  doc.setSubject(`${UUID_PREFIX}${uuid}`);
  doc.setKeywords(tags);
  if (textExcerpt) {
    // Store first 500 chars of text as the PDF description for Windows Search
    doc.setProducer(textExcerpt.slice(0, 500));
  }
  const savedBytes = await doc.save();
  await fs.writeFile(filePath, savedBytes);
}
