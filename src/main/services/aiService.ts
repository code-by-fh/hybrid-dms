import { getConfig } from './syncEngine.js';

export async function checkOllamaStatus() {
  try {
    const config = getConfig();
    const response = await fetch(`${config.OLLAMA_URL}`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function checkOllamaConfig(url: string, model: string): Promise<{ connected: boolean; modelAvailable: boolean; availableModels: string[] }> {
  try {
    const rootResp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!rootResp.ok) return { connected: false, modelAvailable: false, availableModels: [] };

    const tagsResp = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!tagsResp.ok) return { connected: true, modelAvailable: false, availableModels: [] };

    const data = await tagsResp.json();
    const availableModels: string[] = (data.models ?? []).map((m: any) => String(m.name));
    const modelAvailable = availableModels.some(m => m === model || m.startsWith(model + ':'));
    return { connected: true, modelAvailable, availableModels };
  } catch {
    return { connected: false, modelAvailable: false, availableModels: [] };
  }
}

export async function analyzeDocumentWithAI(text: string) {
  const config = getConfig();

  const prompt = `Analyze the following German or English document and extract structured metadata.

Return ONLY a valid JSON object with exactly this structure (no extra text, no markdown):
{
  "sender": "Company or person name",
  "date": "YYYY-MM-DD",
  "docType": "Short document type in German (e.g. Rechnung, Vertrag, Kuendigung, Kontoauszug, Versicherung, Brief)",
  "tags": ["tag1", "tag2", "tag3"],
  "suggestedFilename": "YYMMDD_DocType_Sender",
  "archivePath": "Category/Subcategory"
}

Rules for suggestedFilename:
- Format: YYMMDD_DocType_Sender (no spaces, use underscores, ASCII only — no umlauts: ä→ae, ö→oe, ü→ue, ß→ss)
- YYMMDD: date from document (year without century, month, day)
- DocType: short German document type, no spaces
- Sender: short sender name, no spaces
- Example: "220211_Kuendigung_McFit"

Rules for archivePath:
- Suggest a relative archive subfolder path (use "/" as separator)
- Use broad category + specific subcategory, German names preferred
- ASCII only (no umlauts)
- Examples: "Vertraege/Fitness", "Rechnungen/Internet", "Versicherung/KFZ", "Bank/DKB", "Behoerden/Finanzamt"
- If unsure, use just one category like "Sonstiges"

Document Text:
${text.substring(0, 4000)}
`;

  try {
    const response = await fetch(`${config.OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.OLLAMA_MODEL,
        prompt,
        stream: false,
        format: 'json',
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    try {
      const parsed = JSON.parse(data.response);
      // Sanitize filename: strip anything that's not alphanumeric, underscore, or hyphen
      if (parsed.suggestedFilename) {
        parsed.suggestedFilename = parsed.suggestedFilename
          .replace(/[<>:"/\\|?*\s]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '');
      }
      // Sanitize archivePath: allow letters, digits, slashes, underscores, hyphens
      if (parsed.archivePath) {
        parsed.archivePath = parsed.archivePath
          .replace(/\\/g, '/')
          .replace(/[<>:"|?*]/g, '')
          .replace(/\/+/g, '/')
          .replace(/^\/|\/$/g, '');
      }
      return parsed;
    } catch {
      console.error('Failed to parse Ollama JSON response', data.response);
      return null;
    }
  } catch (error) {
    console.error('Error analyzing document with Ollama', error);
    return null;
  }
}

/** Build a fallback filename when the AI doesn't provide one. */
export function buildFilename(date: string, docType: string, sender: string): string {
  const sanitize = (s: string) =>
    s.replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue')
     .replace(/ß/g, 'ss').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

  const dateStr = date ? date.replace(/-/g, '').slice(2) : '000000'; // YYMMDD
  const typeStr = sanitize(docType || 'Dokument');
  const senderStr = sanitize(sender || '').slice(0, 20);
  return senderStr ? `${dateStr}_${typeStr}_${senderStr}` : `${dateStr}_${typeStr}`;
}
