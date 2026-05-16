import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await tagsResp.json() as { models?: any[] };
    // data.models entries are untyped Ollama API objects
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const availableModels: string[] = (data.models ?? []).map((m: any) => String(m.name));
    const modelAvailable = availableModels.some(m => m === model || m.startsWith(model + ':'));
    return { connected: true, modelAvailable, availableModels };
  } catch {
    return { connected: false, modelAvailable: false, availableModels: [] };
  }
}

export async function checkAiBackend(): Promise<boolean> {
  const config = getConfig();

  if (config.AI_BACKEND === 'ollama') {
    return checkOllamaStatus();
  }

  if (config.AI_BACKEND === 'gguf') {
    try {
      await fs.stat(config.GGUF_MODEL_PATH);
      return true;
    } catch {
      return false;
    }
  }

  if (config.AI_BACKEND === 'managed') {
    const modelPath = path.join(app.getPath('userData'), 'dms-data', 'models', config.AI_MODEL_NAME + '.gguf');
    try {
      await fs.stat(modelPath);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

function buildPrompt(text: string): string {
  return `Analyze the following German or English document and extract structured metadata.

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
}

// Parsed AI result type
interface AiAnalysisResult {
  sender?: string;
  date?: string;
  docType?: string;
  tags?: string[];
  suggestedFilename?: string;
  archivePath?: string;
}

function sanitizeResult(parsed: AiAnalysisResult): AiAnalysisResult {
  if (parsed.suggestedFilename) {
    parsed.suggestedFilename = parsed.suggestedFilename
      .replace(/[<>:"/\\|?*\s]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }
  if (parsed.archivePath) {
    parsed.archivePath = parsed.archivePath
      .replace(/\\/g, '/')
      .replace(/[<>:"|?*]/g, '')
      .replace(/\/+/g, '/')
      .replace(/^\/|\/$/g, '');
  }
  return parsed;
}

function parseJsonResponse(raw: string, backendName: string): AiAnalysisResult | null {
  try {
    const parsed = JSON.parse(raw) as AiAnalysisResult;
    return sanitizeResult(parsed);
  } catch {
    console.error(`Failed to parse ${backendName} JSON response`, raw);
    return null;
  }
}

async function analyzeWithOllama(text: string): Promise<AiAnalysisResult | null> {
  const config = getConfig();
  const prompt = buildPrompt(text);

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

    // Ollama API response is an untyped JSON object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await response.json() as { response: string };
    return parseJsonResponse(data.response, 'Ollama');
  } catch (error) {
    console.error('Error analyzing document with Ollama', error);
    return null;
  }
}

async function analyzeWithGguf(modelPath: string, text: string): Promise<AiAnalysisResult | null> {
  const prompt = buildPrompt(text);

  try {
    // node-llama-cpp v3 API — dynamic import to avoid loading native bindings at startup
    const { getLlama, LlamaChatSession } = await import('node-llama-cpp');

    const llama = await getLlama();
    const model = await llama.loadModel({ modelPath });
    const context = await model.createContext();
    const session = new LlamaChatSession({ contextSequence: context.getSequence() });

    const responseText = await session.prompt(prompt);
    await model.dispose();

    return parseJsonResponse(responseText, 'gguf');
  } catch (error) {
    console.error('Error analyzing document with gguf model', error);
    return null;
  }
}

export async function analyzeDocumentWithAI(text: string): Promise<AiAnalysisResult | null> {
  const config = getConfig();

  if (config.AI_BACKEND === 'gguf') {
    return analyzeWithGguf(config.GGUF_MODEL_PATH, text);
  }

  if (config.AI_BACKEND === 'managed') {
    const modelPath = path.join(app.getPath('userData'), 'dms-data', 'models', config.AI_MODEL_NAME + '.gguf');
    return analyzeWithGguf(modelPath, text);
  }

  // Default: 'ollama'
  return analyzeWithOllama(text);
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
