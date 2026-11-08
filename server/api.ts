/**
 * Server-side API: Gemini endpoints (dialogue + gazette).
 *
 * The API key lives ONLY here (never in the browser bundle). Exports:
 *   • createApiRouter — bare /api router used by server.ts in production.
 *   • createApiApp    — a full express app wrapping the router; Vite's dev
 *     server mounts it via configureServer so /api/* works in development.
 * All endpoints degrade gracefully (<status>.configured=false) when no
 * GEMINI_API_KEY / GOOGLE_API_KEY is set.
 */
import express, { Request, Response } from 'express';
import dotenv from 'dotenv';

// Server-side only: never expose the key to the browser bundle.
dotenv.config({ path: '.env.local' });
dotenv.config();

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

let sdkPromise: Promise<typeof import('@google/genai')> | null = null;
let aiClient: InstanceType<typeof import('@google/genai').GoogleGenAI> | null = null;

function getApiKey(): string {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

async function loadSdk() {
  if (!sdkPromise) sdkPromise = import('@google/genai');
  return sdkPromise;
}

async function getClient() {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  const sdk = await loadSdk();
  if (!aiClient) {
    aiClient = new sdk.GoogleGenAI({ apiKey });
  }
  return { client: aiClient, Type: sdk.Type };
}

function text(value: unknown, max = 400): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function parseResponseText(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// Simple per-IP limiter. Protects the API key from runaway loops.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function allowRequest(ip: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim();
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function dialoguePrompt(body: Record<string, unknown>): string {
  const language = body.language === 'en' ? 'English' : 'Arabic (Modern Standard Arabic, natural spoken tone)';
  return `You are the autonomous dialogue engine for "AgentVille", a cozy 2D AI city simulation.

Write one short in-character exchange between two citizens who just met.

CONTEXT (use it naturally, never dump it verbatim):
${JSON.stringify(body, null, 2)}

RULES:
- Write in ${language}.
- Agent A speaks first (textA), Agent B replies (textB).
- Each line is 1-2 sentences, under 220 characters.
- Stay in character: personality, profession, moral alignment, mood and energy matter.
- Mention the location / city event / weather only when it feels natural.
- No stage directions, no speaker-name prefixes, no quotation marks around the whole line.
- Keep it warm, playful and suitable for a family-friendly city simulation.

Return JSON with exactly these fields: textA, textB, context (a 2-5 word topic label).`;
}

function gazettePrompt(body: Record<string, unknown>): string {
  const language = body.language === 'en' ? 'English' : 'Arabic (Modern Standard Arabic, journalistic style)';
  return `You are the editor-in-chief of "The AgentVille Gazette", a witty but factual daily newspaper for an autonomous 2D city simulation.

FACTS FROM THE LAST 24 SIMULATION HOURS:
${JSON.stringify(body, null, 2)}

TASK:
Write today's edition in ${language}. Use only the supplied facts; do not invent named citizens, crimes, disasters or statistics that are not present.
Produce exactly 3 stories:
1. social — the most sociable citizen / community life.
2. economy — wealth, wages, taxes, commerce or construction.
3. health or civic — wellness, public services, infrastructure or city hall.

RULES:
- Headlines are punchy and specific, never generic.
- body is 2-3 sentences, journalistic and lively.
- highlightStat must be a short factual stat, e.g. "12 conversations" or "$1,240 treasury".
- citizenName / citizenEmoji / citizenColor must come from the supplied citizens when possible.
- category must be one of: social, economy, health, civic.
- badge is a short section label.
- timestamp is a short time label.

Return JSON:
{
  "headlineOfTheDay": "...",
  "weatherSummary": "...",
  "stories": [
    {"category":"social","badge":"...","headline":"...","subheadline":"...","body":"...","highlightStat":"...","citizenName":"...","citizenEmoji":"...","citizenColor":"#RRGGBB","timestamp":"..."}
  ]
}`;
}

export function createApiRouter(): express.Router {
  const router = express.Router();
  router.use(express.json({ limit: '256kb' }));

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'agentville-api', model: DEFAULT_MODEL });
  });

  router.get('/ai/status', (_req, res) => {
    const key = getApiKey();
    res.json({
      configured: Boolean(key),
      provider: key ? 'gemini' : 'local',
      model: key ? DEFAULT_MODEL : null,
      reason: key ? undefined : 'GEMINI_API_KEY missing — using local templates',
    });
  });

  router.post('/dialogue', async (req: Request, res: Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const agentA = body.agentA as Record<string, unknown> | undefined;
    const agentB = body.agentB as Record<string, unknown> | undefined;

    if (!agentA || !agentB || !text(agentA.name, 80) || !text(agentB.name, 80)) {
      res.status(400).json({ error: 'invalid_dialogue_payload' });
      return;
    }
    if (!getApiKey()) {
      res.status(503).json({ error: 'not_configured', message: 'GEMINI_API_KEY is not set' });
      return;
    }
    if (!allowRequest(clientIp(req), 30, 60_000)) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }

    try {
      const setup = await getClient();
      if (!setup) {
        res.status(503).json({ error: 'not_configured' });
        return;
      }
      const { client, Type } = setup;

      const response = await client.models.generateContent({
        model: DEFAULT_MODEL,
        contents: dialoguePrompt({
          agentA,
          agentB,
          locationType: text(body.locationType, 60),
          locationName: text(body.locationName, 100),
          event: text(body.event, 100) || null,
          weather: text(body.weather, 40),
          timeOfDay: text(body.timeOfDay, 40),
          language: body.language === 'en' ? 'en' : 'ar',
        }),
        config: {
          temperature: 0.95,
          topP: 0.95,
          maxOutputTokens: 500,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              textA: { type: Type.STRING },
              textB: { type: Type.STRING },
              context: { type: Type.STRING },
            },
            required: ['textA', 'textB', 'context'],
          },
        },
      });

      const parsed = parseResponseText(response.text);
      const textA = text(parsed?.textA, 320);
      const textB = text(parsed?.textB, 320);
      if (!textA || !textB) {
        res.status(502).json({ error: 'invalid_gemini_response' });
        return;
      }

      res.json({
        textA,
        textB,
        context: text(parsed?.context, 80) || 'Gemini dialogue',
        source: 'gemini',
        model: DEFAULT_MODEL,
      });
    } catch (error) {
      console.error('[agentville-api] dialogue error:', error);
      res.status(502).json({ error: 'gemini_failed' });
    }
  });

  router.post('/gazette', async (req: Request, res: Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    if (!Array.isArray(body.citizens) || body.citizens.length === 0) {
      res.status(400).json({ error: 'invalid_gazette_payload' });
      return;
    }
    if (!getApiKey()) {
      res.status(503).json({ error: 'not_configured', message: 'GEMINI_API_KEY is not set' });
      return;
    }
    if (!allowRequest(clientIp(req), 10, 60_000)) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }

    try {
      const setup = await getClient();
      if (!setup) {
        res.status(503).json({ error: 'not_configured' });
        return;
      }
      const { client, Type } = setup;

      const response = await client.models.generateContent({
        model: DEFAULT_MODEL,
        contents: gazettePrompt({
          ...body,
          citizens: (body.citizens as unknown[]).slice(0, 40),
          notifications: Array.isArray(body.notifications)
            ? (body.notifications as unknown[]).slice(0, 20)
            : [],
        }),
        config: {
          temperature: 0.9,
          topP: 0.95,
          maxOutputTokens: 1800,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headlineOfTheDay: { type: Type.STRING },
              weatherSummary: { type: Type.STRING },
              stories: {
                type: Type.ARRAY,
                minItems: 3,
                maxItems: 3,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING, enum: ['social', 'economy', 'health', 'civic'] },
                    badge: { type: Type.STRING },
                    headline: { type: Type.STRING },
                    subheadline: { type: Type.STRING },
                    body: { type: Type.STRING },
                    highlightStat: { type: Type.STRING },
                    citizenName: { type: Type.STRING },
                    citizenEmoji: { type: Type.STRING },
                    citizenColor: { type: Type.STRING },
                    timestamp: { type: Type.STRING },
                  },
                  required: [
                    'category',
                    'badge',
                    'headline',
                    'subheadline',
                    'body',
                    'highlightStat',
                    'citizenName',
                    'citizenEmoji',
                    'citizenColor',
                    'timestamp',
                  ],
                },
              },
            },
            required: ['headlineOfTheDay', 'weatherSummary', 'stories'],
          },
        },
      });

      const parsed = parseResponseText(response.text);
      if (!parsed || !Array.isArray(parsed.stories) || parsed.stories.length === 0) {
        res.status(502).json({ error: 'invalid_gemini_response' });
        return;
      }

      res.json({
        headlineOfTheDay: text(parsed.headlineOfTheDay, 220),
        weatherSummary: text(parsed.weatherSummary, 220),
        stories: parsed.stories,
        source: 'gemini',
        model: DEFAULT_MODEL,
      });
    } catch (error) {
      console.error('[agentville-api] gazette error:', error);
      res.status(502).json({ error: 'gemini_failed' });
    }
  });

  return router;
}

/**
 * Full Express app wrapper used by the Vite dev server. Mounting a bare Router
 * inside Vite's Connect middleware does not run Express' response helpers
 * (res.json/send), so the dev server needs a real app instance.
 */
export function createApiApp(): express.Express {
  const app = express();
  app.use(createApiRouter());
  return app;
}
