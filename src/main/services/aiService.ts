import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { app } from 'electron';
import { getConfig } from './syncEngine.js';
import { log } from './logger.js';
import { getSetting } from '../db/index.js';

// Must match the MODEL_URLS map in main.ts — used to resolve legacy filenames.
const MODEL_URL_BASENAMES: Record<string, string> = {
  'gemma-3-4b-q4':   'gemma-3-4b-it-Q4_K_M.gguf',
  'qwen2.5-3b-q4':   'Qwen2.5-3B-Instruct-Q4_K_M.gguf',
  'qwen2.5-7b-q4':   'Qwen2.5-7B-Instruct-Q4_K_M.gguf',
  'phi-3.5-mini-q4': 'Phi-3.5-mini-instruct-Q4_K_M.gguf',
};

/**
 * Resolves the filesystem path for a managed model.
 * Checks the canonical key-based name first (e.g. qwen2.5-3b-q4.gguf),
 * then falls back to the legacy URL-basename (e.g. Qwen2.5-3B-Instruct-Q4_K_M.gguf)
 * and renames it to the canonical name so future lookups are fast.
 */
async function resolveModelPath(modelKey: string): Promise<string | null> {
  const modelsDir = path.join(app.getPath('userData'), 'dms-data', 'models');
  const keyPath = path.join(modelsDir, modelKey + '.gguf');

  try {
    await fs.stat(keyPath);
    return keyPath; // canonical file exists
  } catch { /* not found, try legacy */ }

  const legacyBasename = MODEL_URL_BASENAMES[modelKey];
  if (legacyBasename) {
    const legacyPath = path.join(modelsDir, legacyBasename);
    try {
      await fs.stat(legacyPath);
      // Migrate: rename to canonical name so this branch is only hit once
      try {
        await fs.rename(legacyPath, keyPath);
        log('info', `[AI] Migrated legacy model file: ${legacyBasename} → ${modelKey}.gguf`);
      } catch (renameErr) {
        log('warn', `[AI] Could not rename legacy model file (using as-is): ${renameErr}`);
        return legacyPath; // still usable at old path
      }
      return keyPath;
    } catch { /* legacy not found either */ }
  }

  return null; // model not on disk
}

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
    const resolved = await resolveModelPath(config.AI_MODEL_NAME);
    return resolved !== null;
  }

  return false;
}

function buildPrompt(text: string): string {
  return `Analysiere das folgende Dokument (Deutsch oder Englisch) und extrahiere strukturierte Metadaten als valides JSON.

Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt. Verwende KEIN Markdown-Code-Blocking (\`\`\`json ... \`\`\`), keinen Einleitungstext und keinen Abschlusstext.

Struktur:
{
  "sender": "Firmen- oder Personenname",
  "date": "YYYY-MM-DD",
  "docType": "Kurzer Dokumenttyp auf Deutsch (z.B. Rechnung, Vertrag, Kündigung, Kontoauszug, Versicherung, Brief)",
  "tags": ["tag1", "tag2"],
  "suggestedFilename": "JJMMTT_Absender_Thema.pdf",
  "archivePath": "Kategorie/Unterkategorie"
}

WICHTIGE REGELN FÜR DIE ELEMENTE:
- Der "sender" MUSS zwingend die Partei (Firma, Institution oder Person) sein, die das Dokument AUSGESTELLT oder VERSENDET hat (z.B. die Rechnungssteller-Firma, die Versicherung, die Behörde).
- Der "sender" darf NIEMALS der Empfänger des Dokuments (also der Kunde, der Adressat oder du selbst) sein!
- sender: Bereinige den Namen! Keine Sonderzeichen, keine Steuerzeichen, keine Pipes (|). Nur der reine Name (z.B. "Gomibo" statt "om | (4) MobielWerkt B.V."). Max. 30 Zeichen.
- docType: Kurz und in korrektem Deutsch. KEINE GROSSBUCHSTABEN-KETTEN.
- tags: Max. 3-4 relevante, kleingeschriebene Suchbegriffe. Keine Duplikate.

Regeln für suggestedFilename:
- Format: JJMMTT_Absender_Thema(optional).pdf — immer auf Deutsch, UTF-8-konform
- JJMMTT: Datum aus dem Dokument (zweistelliges Jahr, Monat, Tag), z.B. 260517
- Absender: Absendername, kurz, keine Leerzeichen (Leerzeichen durch Unterstrich ersetzen)
- Thema: optionaler Dokumenttyp/Betreff auf Deutsch, keine Leerzeichen
- Umlaute (ä ö ü Ä Ö Ü ß) sind erlaubt. Keine anderen Sonderzeichen. Keine Leerzeichen.
- Großschreibung NUR am Anfang jedes Wortes (z.B. "Steuerbescheid", "Rechnung", "Telekom"), KEINE GROSSBUCHSTABEN
- Maximale Länge: 60 Zeichen (ohne .pdf), kürze Absender und Thema falls nötig
- Beispiele: "260517_Finanzamt_Steuerbescheid.pdf", "260101_DHL_Paketankuendigung.pdf", "251203_Telekom_Rechnung.pdf"

Regeln für archivePath:
- Format: Kategorie/Unterkategorie (z.B. "Bank/DKB", "Rechnungen/Internet", "Behoerden/Finanzamt").
- Wähle den Pfad passend zum tatsächlichen Dokumenteninhalt! Nutze "Vertraege/Fitness" NUR, wenn es sich wirklich um ein Fitnessstudio handelt. Falls unklar, nutze "Sonstiges/Allgemein".
- Nur ASCII (Keine Umlaute! Ä->Ae, ö->oe, ü->ue, ß->ss).

Dokumenttext:
${text.substring(0, 1500)}
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
    // Strip .pdf suffix before sanitizing, re-add after
    const hasPdf = parsed.suggestedFilename.toLowerCase().endsWith('.pdf');
    const base = hasPdf ? parsed.suggestedFilename.slice(0, -4) : parsed.suggestedFilename;
    const sanitized = base
      .replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 60);
    // Convert ALL-CAPS segments (e.g. BESTÄTIGUNG → Bestätigung), keep date prefix untouched
    const parts = sanitized.split('_');
    const normalized = parts.map((p, i) => {
      if (i === 0 && /^\d{6}$/.test(p)) return p;
      if (/^[A-ZÄÖÜ]{2,}$/.test(p)) return p.charAt(0) + p.slice(1).toLowerCase();
      return p;
    }).join('_');
    parsed.suggestedFilename = normalized + '.pdf';
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
  // Try as-is, then attempt to fix truncated JSON by closing open braces
  for (const attempt of [raw, raw + '}', raw + '}}']) {
    try {
      const parsed = JSON.parse(attempt) as AiAnalysisResult;
      return sanitizeResult(parsed);
    } catch {
      // try next
    }
  }
  console.error(`Failed to parse ${backendName} JSON response`, raw);
  return null;
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

// GGUF singletons — model, context, and grammar are loaded once and kept alive.
// Concurrent model loading causes OOM (each 3B-Q4 model is ~2 GB), so we
// serialize every inference through a queue.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _llama: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _ggufModel: any = null;
let _ggufModelPath: string | null = null;
let _ggufCpuOnly = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _ggufContext: any = null;           // cached — KV-cache allocation is expensive
let _ggufContextModelPath: string | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _ggufJsonGrammar: any = null;       // JSON grammar — built once per llama instance
let _ggufQueue: Promise<unknown> = Promise.resolve();

async function disposeGgufContext() {
  if (_ggufContext) {
    try { await _ggufContext.dispose(); } catch { /* ignore */ }
    _ggufContext = null;
    _ggufContextModelPath = null;
  }
}

async function loadGgufModelOnce(modelPath: string, forceCpu = false) {
  const forceCpuSetting = getSetting('GGUF_FORCE_CPU', 'false') === 'true';
  const effectiveForceCpu = forceCpu || forceCpuSetting;

  log('info', `[GGUF] loadGgufModelOnce: path=${modelPath}, effectiveForceCpu=${effectiveForceCpu}`);

  const { getLlama, LlamaGrammar } = await import('node-llama-cpp');

  if (!_llama) {
    log('info', `[GGUF] Initializing llama instance (gpu=${!effectiveForceCpu})`);
    _llama = effectiveForceCpu ? await getLlama({ gpu: false }) : await getLlama();
    log('info', `[GGUF] Llama instance initialized`);
  }

  // Build JSON grammar once per llama instance
  if (!_ggufJsonGrammar) {
    try {
      _ggufJsonGrammar = await LlamaGrammar.getFor(_llama, 'json');
      log('info', `[GGUF] JSON grammar loaded`);
    } catch (grammarErr) {
      log('warn', `[GGUF] JSON grammar unavailable: ${grammarErr}`);
    }
  }

  // Return cached model when path matches and CPU requirement is satisfied
  if (_ggufModel && _ggufModelPath === modelPath && (!effectiveForceCpu || _ggufCpuOnly)) {
    return _ggufModel;
  }

  // Model is changing — context belongs to old model, must be disposed first
  await disposeGgufContext();

  if (_ggufModel) {
    log('info', `[GGUF] Disposing previous model`);
    try { await _ggufModel.dispose(); } catch { /* ignore */ }
    _ggufModel = null;
    _ggufModelPath = null;
  }

  if (effectiveForceCpu) {
    log('info', `[GGUF] Loading model CPU-only`);
    _ggufModel = await _llama.loadModel({ modelPath, gpuLayers: 0 });
    _ggufCpuOnly = true;
  } else {
    try {
      log('info', `[GGUF] Loading model (GPU, all layers)`);
      _ggufModel = await _llama.loadModel({ modelPath, gpuLayers: 999 });
      _ggufCpuOnly = false;
    } catch (gpuErr) {
      log('warn', `[GGUF] GPU load failed, retrying CPU-only: ${gpuErr}`);
      _ggufModel = await _llama.loadModel({ modelPath, gpuLayers: 0 });
      _ggufCpuOnly = true;
    }
  }

  log('info', `[GGUF] Model loaded. Path=${modelPath}`);
  _ggufModelPath = modelPath;
  return _ggufModel;
}

// Returns the shared context for the given model path.
// Creates it on first call; reuses it on subsequent calls.
// The KV cache buffer is pre-allocated here — creating it once amortises this cost.
async function getOrCreateGgufContext(model: unknown, modelPath: string, threads: number) {
  if (_ggufContext && _ggufContextModelPath === modelPath) {
    return _ggufContext;
  }
  // Stale context from a different model path
  await disposeGgufContext();

  try {
    log('info', `[GGUF] Creating context (size=${GGUF_CONTEXT_SIZE}, threads=${threads}, flashAttention=true)`);
    _ggufContext = await (model as any).createContext({ contextSize: GGUF_CONTEXT_SIZE, batchSize: 1024, sequences: 2, threads, flashAttention: true });
  } catch (flashErr) {
    log('warn', `[GGUF] Flash attention context failed, retrying without: ${flashErr}`);
    _ggufContext = await (model as any).createContext({ contextSize: GGUF_CONTEXT_SIZE, batchSize: 1024, sequences: 2, threads });
  }
  _ggufContextModelPath = modelPath;
  log('info', `[GGUF] Context ready`);
  return _ggufContext;
}

// 2048 tokens: ~800 tokens for instructions + ~375 tokens for 1500 chars of doc text + ~300 for JSON output = ~1100 actual max.
const GGUF_CONTEXT_SIZE = 2048;

// All logical cores minus one — leaves one free for Electron's renderer/IO processes.
// This is roughly double the previous floor(cpus/2) setting.
const GGUF_THREADS = Math.max(1, os.cpus().length - 1);

async function analyzeWithGguf(modelPath: string, text: string): Promise<AiAnalysisResult | null> {
  log('info', `[GGUF] analyzeWithGguf enqueued for: ${modelPath}`);
  const prompt = buildPrompt(text);

  // Serialize: only one GGUF inference runs at a time to prevent concurrent RAM exhaustion.
  // Each task appends via .finally() so errors in one task never break the chain.
  return new Promise<AiAnalysisResult | null>((resolve) => {
    _ggufQueue = _ggufQueue.finally(async () => {
      log('info', `[GGUF Queue] Task started`);
      try {
        const { LlamaChatSession } = await import('node-llama-cpp');
        let model = await loadGgufModelOnce(modelPath);

        // If context creation fails (VRAM exhausted), fall back to CPU-only model and retry
        let context;
        try {
          context = await getOrCreateGgufContext(model, modelPath, GGUF_THREADS);
        } catch (ctxErr) {
          log('warn', `[GGUF Queue] Context creation failed, switching to CPU-only: ${ctxErr}`);
          model = await loadGgufModelOnce(modelPath, true);
          context = await getOrCreateGgufContext(model, modelPath, GGUF_THREADS);
        }

        // Each inference gets a fresh sequence slot — avoids history contamination between
        // documents while reusing the expensive pre-allocated KV-cache buffer.
        const sequence = context.getSequence();
        const session = new LlamaChatSession({ contextSequence: sequence });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          log('warn', `[GGUF Queue] Timeout — aborting inference after 3 min`);
          controller.abort();
        }, 180_000);

        let tokenCount = 0;
        let responseText: string;
        try {
          log('info', `[GGUF Queue] Starting inference (threads=${GGUF_THREADS}, grammar=${_ggufJsonGrammar ? 'json' : 'none'}, temp=0)`);
          responseText = await session.prompt(prompt, {
            maxTokens: 300,
            temperature: 0,            // greedy decoding — faster + deterministic for JSON
            grammar: _ggufJsonGrammar ?? undefined,
            signal: controller.signal,
            onTextChunk: (chunk: string) => {
              tokenCount++;
              if (tokenCount === 1) log('info', `[GGUF Queue] First token received`);
              if (tokenCount % 20 === 0) log('info', `[GGUF Queue] Generating... tokens: ${tokenCount}`);
              void chunk;
            },
          });
        } finally {
          clearTimeout(timeoutId);
          try { await sequence.dispose(); } catch (disposeErr) {
            log('warn', `[GGUF Queue] sequence.dispose() failed: ${disposeErr}`);
          }
        }

        log('info', `[GGUF Queue] Inference complete. tokens=${tokenCount}, responseLength=${responseText.length}`);
        resolve(parseJsonResponse(responseText, 'gguf'));
      } catch (error) {
        log('error', `[GGUF] Error analyzing with model "${modelPath}": ${error}`);
        resolve(null);
      }
    });
  });
}

// Pre-warms the model and context so the first real inference doesn't pay the load cost.
// Call once at app startup after config is ready.
export async function warmupGguf(): Promise<void> {
  const config = getConfig();
  if (config.AI_BACKEND !== 'gguf' && config.AI_BACKEND !== 'managed') return;

  const modelPath = config.AI_BACKEND === 'managed'
    ? await resolveModelPath(config.AI_MODEL_NAME)
    : config.GGUF_MODEL_PATH;
  if (!modelPath) return;

  _ggufQueue = _ggufQueue.finally(async () => {
    try {
      log('info', '[GGUF] Pre-warming model and context...');
      const model = await loadGgufModelOnce(modelPath);
      await getOrCreateGgufContext(model, modelPath, GGUF_THREADS);
      log('info', '[GGUF] Pre-warm complete — first inference will be fast');
    } catch (err) {
      log('warn', `[GGUF] Pre-warm failed (non-fatal): ${err}`);
    }
  });
}

export async function analyzeDocumentWithAI(text: string): Promise<AiAnalysisResult | null> {
  const config = getConfig();

  if (config.AI_BACKEND === 'gguf') {
    return analyzeWithGguf(config.GGUF_MODEL_PATH, text);
  }

  if (config.AI_BACKEND === 'managed') {
    const modelPath = await resolveModelPath(config.AI_MODEL_NAME);
    if (!modelPath) {
      log('error', `[AI] Managed model not found on disk: ${config.AI_MODEL_NAME}`);
      return null;
    }
    return analyzeWithGguf(modelPath, text);
  }

  // Default: 'ollama'
  return analyzeWithOllama(text);
}

/** Build a fallback filename when the AI doesn't provide one. */
export function buildFilename(date: string, docType: string, sender: string): string {
  const sanitize = (s: string) =>
    s.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

  const dateStr = date ? date.replace(/-/g, '').slice(2) : '000000'; // JJMMTT
  const senderStr = sanitize(sender || '').slice(0, 25);
  const typeStr = sanitize(docType || 'Dokument');
  const base = senderStr ? `${dateStr}_${senderStr}_${typeStr}` : `${dateStr}_${typeStr}`;
  return `${base}.pdf`;
}
