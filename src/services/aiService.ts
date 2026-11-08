/**
 * ============================================================================
 *  AI SERVICE — the browser side of real Gemini (server-proxied)
 * ============================================================================
 *
 *  The Gemini API key never reaches the client bundle. This module calls the
 *  same-origin Express endpoints:
 *      GET  /api/ai/status   → { configured, provider, model, reason }
 *      POST /api/dialogue    → { textA, textB } enhanced conversation
 *      POST /api/gazette     → AI-written newspaper edition
 *  All helpers fail SILENTLY (return null) so the simulation keeps running on
 *  its deterministic local templates when the server has no key / no network.
 */
import type { GazetteStory } from '../simulation/gazetteAnalyzer';

export interface AiStatus {
  configured: boolean;
  provider: 'gemini' | 'local';
  model: string | null;
  reason?: string;
}

export interface DialogueAgentProfile {
  name: string;
  profession: string;
  personality: string;
  moralAlignment: string;
  mood: number;
  energy: number;
}

export interface DialogueEnhancementInput {
  agentA: DialogueAgentProfile;
  agentB: DialogueAgentProfile;
  locationType: string;
  locationName: string;
  event: string | null;
  weather: string;
  timeOfDay: string;
  language: 'ar' | 'en';
}

export interface DialogueEnhancement {
  textA: string;
  textB: string;
  context: string;
  source: 'gemini';
}

export interface GazetteRequestInput {
  editionNumber: number;
  day: number;
  dateString: string;
  timeString: string;
  weather: string;
  timeOfDay: string;
  language: 'ar' | 'en';
  population: number;
  treasury: number;
  taxRate: number;
  metrics: Record<string, number>;
  quickStats: {
    totalConversations: number;
    moneyCirculated: number;
    clinicVisits: number;
  };
  citizens: Array<{
    name: string;
    profession: string;
    mood: number;
    money: number;
    memories: Array<{ category: string; text: string }>;
  }>;
  notifications: Array<{ type: string; message: string; icon: string; timeString: string }>;
}

export interface GazetteAiResult {
  headlineOfTheDay?: string;
  weatherSummary?: string;
  stories?: Array<Partial<GazetteStory>>;
}

const LOCAL_STATUS: AiStatus = {
  configured: false,
  provider: 'local',
  model: null,
  reason: 'using_local_templates',
};

let cachedStatus: AiStatus | null = null;
let statusInFlight: Promise<AiStatus> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise(resolve => {
    const timer = window.setTimeout(() => resolve(null), ms);
    promise
      .then(value => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        window.clearTimeout(timer);
        resolve(null);
      });
  });
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Ask the Express/Vite API whether a real Gemini key is available.
 * The key itself never reaches the browser.
 */
export async function getAiStatus(force: boolean = false): Promise<AiStatus> {
  if (!force && cachedStatus) return cachedStatus;
  if (!force && statusInFlight) return statusInFlight;

  statusInFlight = withTimeout(
    fetch('/api/ai/status', { headers: { Accept: 'application/json' } }).then(async response => {
      if (!response.ok) return LOCAL_STATUS;
      const data = (await readJson(response)) as Partial<AiStatus> | null;
      if (!data || data.configured !== true) return LOCAL_STATUS;
      return {
        configured: true,
        provider: 'gemini' as const,
        model: typeof data.model === 'string' ? data.model : null,
      };
    }),
    2500
  ).then(status => {
    cachedStatus = status ?? LOCAL_STATUS;
    statusInFlight = null;
    return cachedStatus;
  });

  return statusInFlight;
}

async function postJson<T>(path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return (await readJson(response)) as T | null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Gemini dialogue. Returns null when no key is configured or the request
 * fails, allowing callers to keep the local Arabic/English template.
 */
export async function requestDialogueEnhancement(
  input: DialogueEnhancementInput
): Promise<DialogueEnhancement | null> {
  const status = await getAiStatus();
  if (!status.configured) return null;

  const data = await postJson<Partial<DialogueEnhancement>>('/api/dialogue', input, 9000);
  if (!data || typeof data.textA !== 'string' || typeof data.textB !== 'string') return null;
  const textA = data.textA.trim();
  const textB = data.textB.trim();
  if (!textA || !textB) return null;

  return {
    textA,
    textB,
    context: typeof data.context === 'string' ? data.context : 'Gemini dialogue',
    source: 'gemini',
  };
}

/**
 * Gemini city gazette. Returns null when unavailable so the local analyzer can
 * render a deterministic edition instead.
 */
export async function requestGazette(input: GazetteRequestInput): Promise<GazetteAiResult | null> {
  const status = await getAiStatus();
  if (!status.configured) return null;

  const data = await postJson<GazetteAiResult>('/api/gazette', input, 20000);
  if (!data) return null;
  if (!Array.isArray(data.stories) || data.stories.length === 0) {
    if (!data.headlineOfTheDay) return null;
  }
  return data;
}
