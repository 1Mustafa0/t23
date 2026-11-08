// server.ts
import express2 from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

// server/api.ts
import express from "express";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
var DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
var sdkPromise = null;
var aiClient = null;
function getApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
}
async function loadSdk() {
  if (!sdkPromise) sdkPromise = import("@google/genai");
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
function text(value, max = 400) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function parseResponseText(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
var rateBuckets = /* @__PURE__ */ new Map();
function allowRequest(ip, max, windowMs) {
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
function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) return forwarded.split(",")[0].trim();
  return req.ip || req.socket.remoteAddress || "unknown";
}
function dialoguePrompt(body) {
  const language = body.language === "en" ? "English" : "Arabic (Modern Standard Arabic, natural spoken tone)";
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
function gazettePrompt(body) {
  const language = body.language === "en" ? "English" : "Arabic (Modern Standard Arabic, journalistic style)";
  return `You are the editor-in-chief of "The AgentVille Gazette", a witty but factual daily newspaper for an autonomous 2D city simulation.

FACTS FROM THE LAST 24 SIMULATION HOURS:
${JSON.stringify(body, null, 2)}

TASK:
Write today's edition in ${language}. Use only the supplied facts; do not invent named citizens, crimes, disasters or statistics that are not present.
Produce exactly 3 stories:
1. social \u2014 the most sociable citizen / community life.
2. economy \u2014 wealth, wages, taxes, commerce or construction.
3. health or civic \u2014 wellness, public services, infrastructure or city hall.

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
function createApiRouter() {
  const router = express.Router();
  router.use(express.json({ limit: "256kb" }));
  router.get("/health", (_req, res) => {
    res.json({ ok: true, service: "agentville-api", model: DEFAULT_MODEL });
  });
  router.get("/ai/status", (_req, res) => {
    const key = getApiKey();
    res.json({
      configured: Boolean(key),
      provider: key ? "gemini" : "local",
      model: key ? DEFAULT_MODEL : null,
      reason: key ? void 0 : "GEMINI_API_KEY missing \u2014 using local templates"
    });
  });
  router.post("/dialogue", async (req, res) => {
    const body = req.body || {};
    const agentA = body.agentA;
    const agentB = body.agentB;
    if (!agentA || !agentB || !text(agentA.name, 80) || !text(agentB.name, 80)) {
      res.status(400).json({ error: "invalid_dialogue_payload" });
      return;
    }
    if (!getApiKey()) {
      res.status(503).json({ error: "not_configured", message: "GEMINI_API_KEY is not set" });
      return;
    }
    if (!allowRequest(clientIp(req), 30, 6e4)) {
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    try {
      const setup = await getClient();
      if (!setup) {
        res.status(503).json({ error: "not_configured" });
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
          language: body.language === "en" ? "en" : "ar"
        }),
        config: {
          temperature: 0.95,
          topP: 0.95,
          maxOutputTokens: 500,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              textA: { type: Type.STRING },
              textB: { type: Type.STRING },
              context: { type: Type.STRING }
            },
            required: ["textA", "textB", "context"]
          }
        }
      });
      const parsed = parseResponseText(response.text);
      const textA = text(parsed?.textA, 320);
      const textB = text(parsed?.textB, 320);
      if (!textA || !textB) {
        res.status(502).json({ error: "invalid_gemini_response" });
        return;
      }
      res.json({
        textA,
        textB,
        context: text(parsed?.context, 80) || "Gemini dialogue",
        source: "gemini",
        model: DEFAULT_MODEL
      });
    } catch (error) {
      console.error("[agentville-api] dialogue error:", error);
      res.status(502).json({ error: "gemini_failed" });
    }
  });
  router.post("/gazette", async (req, res) => {
    const body = req.body || {};
    if (!Array.isArray(body.citizens) || body.citizens.length === 0) {
      res.status(400).json({ error: "invalid_gazette_payload" });
      return;
    }
    if (!getApiKey()) {
      res.status(503).json({ error: "not_configured", message: "GEMINI_API_KEY is not set" });
      return;
    }
    if (!allowRequest(clientIp(req), 10, 6e4)) {
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    try {
      const setup = await getClient();
      if (!setup) {
        res.status(503).json({ error: "not_configured" });
        return;
      }
      const { client, Type } = setup;
      const response = await client.models.generateContent({
        model: DEFAULT_MODEL,
        contents: gazettePrompt({
          ...body,
          citizens: body.citizens.slice(0, 40),
          notifications: Array.isArray(body.notifications) ? body.notifications.slice(0, 20) : []
        }),
        config: {
          temperature: 0.9,
          topP: 0.95,
          maxOutputTokens: 1800,
          responseMimeType: "application/json",
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
                    category: { type: Type.STRING, enum: ["social", "economy", "health", "civic"] },
                    badge: { type: Type.STRING },
                    headline: { type: Type.STRING },
                    subheadline: { type: Type.STRING },
                    body: { type: Type.STRING },
                    highlightStat: { type: Type.STRING },
                    citizenName: { type: Type.STRING },
                    citizenEmoji: { type: Type.STRING },
                    citizenColor: { type: Type.STRING },
                    timestamp: { type: Type.STRING }
                  },
                  required: [
                    "category",
                    "badge",
                    "headline",
                    "subheadline",
                    "body",
                    "highlightStat",
                    "citizenName",
                    "citizenEmoji",
                    "citizenColor",
                    "timestamp"
                  ]
                }
              }
            },
            required: ["headlineOfTheDay", "weatherSummary", "stories"]
          }
        }
      });
      const parsed = parseResponseText(response.text);
      if (!parsed || !Array.isArray(parsed.stories) || parsed.stories.length === 0) {
        res.status(502).json({ error: "invalid_gemini_response" });
        return;
      }
      res.json({
        headlineOfTheDay: text(parsed.headlineOfTheDay, 220),
        weatherSummary: text(parsed.weatherSummary, 220),
        stories: parsed.stories,
        source: "gemini",
        model: DEFAULT_MODEL
      });
    } catch (error) {
      console.error("[agentville-api] gazette error:", error);
      res.status(502).json({ error: "gemini_failed" });
    }
  });
  return router;
}

// server.ts
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var app = express2();
var port = Number(process.env.PORT || 3e3);
app.use("/api", createApiRouter());
var distDir = path.join(__dirname, "dist");
app.use(express2.static(distDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});
app.listen(port, "0.0.0.0", () => {
  console.log(`AgentVille server running at http://localhost:${port}`);
  console.log(
    process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY ? "Gemini API key detected \u2014 live dialogue and gazette enabled." : "No Gemini API key found \u2014 local templates remain active."
  );
});
