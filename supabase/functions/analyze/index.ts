import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type InputKind = "text" | "url" | "image";
type RiskLevel = "Low" | "Medium" | "High";
type SourceCredibilityTier = "Official" | "Established" | "Recognized" | "Unknown" | "Low-signal";

interface SourceCredibility {
  score: number;
  tier: SourceCredibilityTier;
  domain: string;
  signals: string[];
}

interface AnalyzeItem {
  input: string;
  inputType?: InputKind;
}

interface AnalyzeRequest {
  mode?: "single" | "batch";
  input?: string;
  inputType?: InputKind;
  message?: string;
  url?: string;
  items?: AnalyzeItem[];
  imageData?: string;
  mimeType?: string;
  forceRefresh?: boolean;
  feedback?: { scanId: string; rating: "up" | "down" };
}

interface ClaimAnalysis {
  claim: string;
  score: number;
  confidence: number;
  verdict: "Likely true" | "Mixed" | "Likely false";
  rationale: string;
  evidence?: EvidenceLink[];
}

interface EvidenceLink {
  title: string;
  url: string;
  publisher: string | null;
}

interface GeminiResponse {
  credibilityScore: number;
  confidence: number;
  riskLevel: RiskLevel;
  manipulationTechniques: string[];
  claims: ClaimAnalysis[];
  summary: string;
  explanation: string;
  warnings: string[];
}

interface AnalysisEnvelope extends GeminiResponse {
  id: string;
  input: string;
  inputType: InputKind;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceDescription: string | null;
  sourceExcerpt: string;
  sourceCredibility: SourceCredibility | null;
  engine: "gemini" | "groq" | "heuristic";
  createdAt: string;
  analyzedAt?: string;
  fromCache: boolean;
}

interface BatchResponse {
  mode: "batch";
  results: AnalysisEnvelope[];
  errors?: { input: string; message: string }[];
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_INPUT_LENGTH = 20_000;
const MAX_BATCH_SIZE = 10;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const CACHE_VERSION = "groq-primary-v2";

class AnalysisUnavailableError extends Error {}
class ValidationError extends Error {}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    credibilityScore: { type: "NUMBER" },
    confidence: { type: "NUMBER" },
    riskLevel: { type: "STRING", enum: ["Low", "Medium", "High"] },
    manipulationTechniques: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
    claims: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          claim: { type: "STRING" },
          score: { type: "NUMBER" },
          confidence: { type: "NUMBER" },
          verdict: { type: "STRING", enum: ["Likely true", "Mixed", "Likely false"] },
          rationale: { type: "STRING" },
        },
        required: ["claim", "score", "confidence", "verdict", "rationale"],
      },
    },
    summary: { type: "STRING" },
    explanation: { type: "STRING" },
    warnings: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
  },
  required: [
    "credibilityScore",
    "confidence",
    "riskLevel",
    "manipulationTechniques",
    "claims",
    "summary",
    "explanation",
    "warnings",
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeInput(input: string) {
  return input.trim().replace(/\s+/g, " ");
}

function hashValue(value: string) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)).then((buffer) => {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  });
}

function inferInputKind(raw: string, explicit?: InputKind): InputKind {
  if (explicit) return explicit;
  if (/^https?:\/\/\S+/i.test(raw) || /^www\.\S+/i.test(raw)) return "url";
  return "text";
}

function toUrl(raw: string) {
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^www\./i.test(value)) return `https://${value}`;
  return value;
}

class RateLimitError extends Error {
  constructor(public resetAt: string | null) {
    super('Rate limit exceeded');
  }
}

function scoreSourceCredibility(raw: string): SourceCredibility | null {
  const value = raw.trim();
  if (!/^https?:\/\/\S+/i.test(value) && !/^www\.\S+/i.test(value)) return null;
  try {
    const url = new URL(/^www\./i.test(value) ? `https://${value}` : value);
    const domain = url.hostname.toLowerCase().replace(/^www\./, '');
    const official = ['gov.in', 'gov.uk', 'gov', 'who.int', 'nasa.gov', 'isro.gov.in', 'nih.gov'];
    const established = ['reuters.com', 'apnews.com', 'bbc.com', 'theguardian.com', 'nytimes.com', 'washingtonpost.com'];
    const recognized = ['thehindu.com', 'indianexpress.com', 'ndtv.com', 'hindustantimes.com', 'timesofindia.indiatimes.com'];
    const signals = url.protocol === 'https:' ? ['HTTPS transport'] : [];
    let tier: SourceCredibilityTier = 'Unknown';
    let score = 50;
    if (official.some((item) => domain === item || domain.endsWith(`.${item}`)) || domain.endsWith('.edu') || domain.endsWith('.ac.in')) {
      tier = 'Official'; score = 85; signals.push('Official, government, health, or academic domain');
    } else if (established.some((item) => domain === item || domain.endsWith(`.${item}`))) {
      tier = 'Established'; score = 78; signals.push('Established editorial publisher');
    } else if (recognized.some((item) => domain === item || domain.endsWith(`.${item}`))) {
      tier = 'Recognized'; score = 68; signals.push('Recognized regional or national publisher');
    } else if (domain.split('.').length < 2 || /(^|[.-])(viral|forward|truth|dailyalerts|breaking)[.-]/i.test(domain)) {
      tier = 'Low-signal'; score = 35; signals.push('Domain has limited publisher-identification signals');
    } else {
      signals.push('Publisher is not in the current reference set');
    }
    if (url.protocol === 'https:') score = Math.min(100, score + 5);
    return { score, tier, domain, signals };
  } catch {
    return null;
  }
}

function removeNoiseSections(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, " ");
}

function extractMainContent(html: string) {
  const cleaned = removeNoiseSections(html);

  const articleMatch = cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch?.[1]) {
    return articleMatch[1];
  }

  const mainMatch = cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch?.[1]) {
    return mainMatch[1];
  }

  return cleaned;
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMeta(html: string, name: string) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

function extractTitle(html: string) {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return titleMatch?.[1]?.trim() ?? null;
}

function isPrivateAddress(address: string) {
  const value = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (value.startsWith("::ffff:")) return true;
  const ipv4 = value.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)?.slice(1).map(Number);
  if (ipv4) {
    const [a, b] = ipv4;
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19));
  }
  return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") ||
    value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb") ||
    value.startsWith("::ffff:0:") || value.startsWith("::ffff:127.") || value.startsWith("::ffff:10.") ||
    value.startsWith("::ffff:192.168.");
}

async function validateRemoteUrl(url: URL) {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      (url.port && !["80", "443"].includes(url.port)) || hostname === "localhost" ||
      hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname === "metadata.google.internal" ||
      isPrivateAddress(hostname)) throw new Error("Local and private network URLs are not supported");

  const allowedHosts = (Deno.env.get("URL_FETCH_HOSTS") ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!allowedHosts.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`))) {
    throw new Error("This host is not enabled for server-side URL retrieval");
  }

  if (!hostname.match(/^\d+\.\d+\.\d+\.\d+$/) && !hostname.includes(":")) {
    const resolved = await Promise.allSettled([Deno.resolveDns(hostname, "A"), Deno.resolveDns(hostname, "AAAA")]);
    const addresses = resolved.flatMap((item) => item.status === "fulfilled" ? item.value : []);
    if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error("URL destination is not public");
  }
}

async function fetchUrlContext(url: string) {
  let current = new URL(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      await validateRemoteUrl(current);
      const response = await fetch(current, {
        redirect: "manual",
        headers: { "user-agent": "TruthLensAI/1.0", accept: "text/html,application/xhtml+xml,text/plain;q=0.9" },
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects === 3) throw new Error("URL has too many redirects");
        current = new URL(location, current);
        continue;
      }
      if (!response.ok) throw new Error(`Failed to fetch URL (${response.status})`);
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/xhtml+xml")) throw new Error("URL did not return a readable page");
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > 2 * 1024 * 1024) throw new Error("URL response is too large");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 2 * 1024 * 1024) throw new Error("URL response is too large");
      const html = new TextDecoder().decode(bytes);
      return {
        sourceTitle: extractTitle(html) ?? extractMeta(html, "og:title"),
        sourceDescription: extractMeta(html, "description") ?? extractMeta(html, "og:description"),
        sourceExcerpt: stripHtml(extractMainContent(html)).slice(0, 6000),
      };
    }
    throw new Error("URL could not be fetched");
  } finally { clearTimeout(timeout); }
}

function buildPrompt(payload: {
  input: string;
  inputKind: InputKind;
  sourceTitle: string | null;
  sourceDescription: string | null;
  sourceExcerpt: string;
}) {
  const context = [
    `Input type: ${payload.inputKind}`,
    payload.sourceTitle ? `Page title: ${payload.sourceTitle}` : null,
    payload.sourceDescription ? `Meta description: ${payload.sourceDescription}` : null,
    payload.sourceExcerpt ? `Readable excerpt: ${payload.sourceExcerpt}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `You are TruthLens AI, a careful misinformation analysis assistant.

Evaluate the input below and return a structured JSON object only.

Rules:
- If the input is a long paragraph or article, break it into 3-7 discrete factual claims.
- Score each claim separately and also produce an overall credibility score.
- Confidence should reflect how certain you are in the assessment.
- Use "Low" for high credibility, "Medium" for mixed/uncertain, and "High" for low credibility or manipulation risk.
- Focus on verifiable language, sensationalism, emotional manipulation, unsupported certainty, and missing evidence.
- If this is a URL, prefer the page title, description, and excerpt; do not pretend you fully crawled the web.
- Return JSON only and match the provided schema exactly.

Input:
${payload.input}

Context:
${context}`;
}

function safeParseJson(text: string) {
  const trimmed = text.trim();
  const cleaned = trimmed.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

async function providerFetch(url: string, init: RequestInit, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}

async function callGemini(prompt: string, geminiApiKey: string) {
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash";
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await providerFetch(geminiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": geminiApiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 1200,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!generatedText) {
    throw new Error("No response from Gemini");
  }

  return safeParseJson(generatedText) as GeminiResponse;
}

function decodeXml(value: string) {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

async function searchClaimEvidence(claim: string): Promise<EvidenceLink[]> {
  try {
    const searchUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(claim)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const response = await fetch(searchUrl, { headers: { accept: 'application/rss+xml, application/xml' } });
    if (!response.ok) return [];
    const xml = await response.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 2).map((match) => {
      const item = match[1];
      const title = item.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
      const url = item.match(/<link>([\s\S]*?)<\/link>/i)?.[1];
      const publisher = item.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1];
      return title && url ? { title: decodeXml(title).trim(), url: decodeXml(url).trim(), publisher: publisher ? decodeXml(publisher).trim() : null } : null;
    }).filter((item): item is EvidenceLink => Boolean(item));
  } catch {
    return [];
  }
}

async function enrichClaimsWithEvidence(claims: ClaimAnalysis[]) {
  const selected = claims.slice(0, 4);
  const evidence = await Promise.all(selected.map((claim) => searchClaimEvidence(claim.claim)));
  return claims.map((claim, index) => ({ ...claim, evidence: evidence[index] ?? [] }));
}

async function countAnalyses() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return 0;
  const response = await fetch(`${supabaseUrl}/rest/v1/analysis_history?select=id&limit=1`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, Prefer: "count=exact" },
  });
  const range = response.headers.get("content-range");
  return Number(range?.split("/")[1] ?? 0) || 0;
}

async function loadTrendingScans() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return [];
  const response = await fetch(`${supabaseUrl}/rest/v1/scan_pages?select=payload&is_public=eq.true&order=created_at.desc&limit=40`, { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } });
  if (!response.ok) return [];
  const rows = await response.json();
  return rows.map((row: { payload?: AnalysisEnvelope }) => row.payload).filter((item: AnalysisEnvelope | undefined): item is AnalysisEnvelope => Boolean(item) && item?.engine !== "heuristic").sort((a: AnalysisEnvelope, b: AnalysisEnvelope) => a.credibilityScore - b.credibilityScore).slice(0, 12);
}

async function storeFeedback(feedback: { scanId: string; rating: "up" | "down" }) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Feedback storage is not configured");
  const response = await fetch(`${supabaseUrl}/rest/v1/analysis_feedback`, {
    method: "POST",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ scan_id: feedback.scanId, rating: feedback.rating }),
  });
  if (!response.ok) throw new Error("Unable to save feedback");
}

async function callGeminiVision(prompt: string, imageData: string, mimeType: string, geminiApiKey: string) {
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash";
  const response = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": geminiApiKey },
    body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: imageData.replace(/^data:[^;]+;base64,/, "") } }, { text: prompt }] }], generationConfig: { maxOutputTokens: 1200, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA } }),
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!generatedText) throw new Error("No response from Gemini Vision");
  return safeParseJson(generatedText) as GeminiResponse;
}

async function callGeminiVisionWithRetry(prompt: string, imageData: string, mimeType: string, geminiApiKey: string, retries = 1) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callGeminiVision(prompt, imageData, mimeType, geminiApiKey);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isRateLimit = message.includes("429") || message.toLowerCase().includes("resource_exhausted");
      if (isRateLimit || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function callGeminiWithRetry(prompt: string, geminiApiKey: string, retries = 1) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callGemini(prompt, geminiApiKey);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isRateLimit = message.includes("429") || message.toLowerCase().includes("resource_exhausted");
      if (isRateLimit || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function callGroq(prompt: string, groqApiKey: string) {
  const model = Deno.env.get("GROQ_MODEL") ?? "llama-3.3-70b-versatile";
  const response = await providerFetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqApiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are a misinformation-analysis engine. Return only JSON with these required fields: credibilityScore and confidence as 0-100 numbers; riskLevel as Low, Medium, or High; manipulationTechniques as a string array; claims as objects containing claim, score, confidence, verdict, and rationale; summary and explanation as strings; warnings as a string array. Verdict must be Likely true, Mixed, or Likely false. No markdown." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  const generatedText = data.choices?.[0]?.message?.content;
  if (!generatedText) throw new Error("No response from Groq");
  return safeParseJson(generatedText) as GeminiResponse;
}

async function callGroqWithRetry(prompt: string, key: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await callGroq(prompt, key); }
    catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
  throw lastError;
}

function normalizeGeminiResult(value: GeminiResponse): GeminiResponse {
  if (!value || typeof value !== "object") throw new Error("Provider returned an invalid response");
  if (!Number.isFinite(value.credibilityScore) || !Number.isFinite(value.confidence)) throw new Error("Provider response is missing scores");
  if (!["Low", "Medium", "High"].includes(value.riskLevel)) throw new Error("Provider response has an invalid risk level");
  if (!Array.isArray(value.claims) || !Array.isArray(value.manipulationTechniques) || !Array.isArray(value.warnings)) throw new Error("Provider response does not match the analysis schema");
  if (!String(value.summary ?? "").trim() || !String(value.explanation ?? "").trim()) throw new Error("Provider response is incomplete");
  const claims = value.claims;
  for (const claim of claims) {
    if (!String(claim.claim ?? "").trim() || !String(claim.rationale ?? "").trim() || !Number.isFinite(claim.score) || !Number.isFinite(claim.confidence) || !["Likely true", "Mixed", "Likely false"].includes(claim.verdict)) throw new Error("Provider returned an invalid claim");
  }

  return {
    credibilityScore: clamp(Math.round(value.credibilityScore), 0, 100),
    confidence: clamp(Math.round(value.confidence), 0, 100),
    riskLevel: value.riskLevel,
    manipulationTechniques: value.manipulationTechniques.map((item) => String(item)).filter(Boolean),
    claims: claims.map((claim) => ({
      claim: String(claim.claim ?? "").trim(),
      score: clamp(Math.round(claim.score), 0, 100),
      confidence: clamp(Math.round(claim.confidence), 0, 100),
      verdict: claim.verdict,
      rationale: String(claim.rationale ?? "").trim(),
    })),
    summary: String(value.summary ?? "").trim(),
    explanation: String(value.explanation ?? "").trim(),
    warnings: value.warnings.map((item) => String(item)).filter(Boolean),
  };
}

async function persistAnalysis(
  payload: AnalysisEnvelope & { cacheKey: string },
  userId: string | null,
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return;
  }

  const { cacheKey, ...result } = payload;
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/persist_analysis`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_scan_id: result.id,
      p_user_id: userId,
      p_cache_key: cacheKey,
      p_input_kind: result.inputType,
      p_input_text: result.input,
      p_input_url: result.sourceUrl,
      p_payload: result,
      p_created_at: result.createdAt,
    }),
  });
  if (!response.ok) throw new Error("Unable to persist analysis");
}

async function readCachedAnalysis(cacheKey: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  const url = new URL(`${supabaseUrl}/rest/v1/analysis_cache`);
  url.searchParams.set("select", "payload,expires_at");
  url.searchParams.set("cache_key", `eq.${cacheKey}`);
  url.searchParams.set("expires_at", `gt.${new Date().toISOString()}`);
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const rows = await response.json();
  const row = rows?.[0];
  return row?.payload ? (row.payload as AnalysisEnvelope) : null;
}

async function writeCache(cacheKey: string, payload: AnalysisEnvelope) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return;
  }

  await fetch(`${supabaseUrl}/rest/v1/analysis_cache`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      cache_key: cacheKey,
      input_kind: payload.inputType,
      input_text: payload.input,
      input_url: payload.sourceUrl,
      payload,
      created_at: payload.createdAt,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
    }),
  });
}

async function rateLimitScope(scopeKey: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) throw new Error("Rate limiting is not configured");

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/check_analysis_rate_limit`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_scope_key: scopeKey,
      p_limit: 20,
      p_window_seconds: 300,
    }),
  });

  if (!response.ok) throw new Error("Rate limiting is temporarily unavailable");

  const payload = await response.json();
  const row = Array.isArray(payload) ? payload[0] : payload;
  return { allowed: row?.allowed === true, resetAt: row?.reset_at ?? null };
}

async function analyzeSingle(rawInput: string, explicitKind: InputKind | undefined, imageData: string | undefined, mimeType: string | undefined, forceRefresh: boolean, scopeKey: string, userId: string | null) {
  const input = normalizeInput(rawInput);
  if (input.length > MAX_INPUT_LENGTH) throw new ValidationError(`Input must be ${MAX_INPUT_LENGTH.toLocaleString()} characters or fewer`);
  const inputType = inferInputKind(input, explicitKind);
  if (inputType === "image") {
    const base64 = imageData?.replace(/^data:[^;]+;base64,/, "") ?? "";
    if (!base64) throw new ValidationError("Choose an image first");
    if (Math.ceil(base64.length * 0.75) > MAX_IMAGE_BYTES) throw new ValidationError("Image must be 5 MiB or smaller");
  }
  const rateLimit = await rateLimitScope(scopeKey);
  if (!rateLimit.allowed) throw new RateLimitError(rateLimit.resetAt);
  const sourceUrl = inputType === "url" ? toUrl(input) : null;

  const prepared = {
    input,
    inputKind: inputType,
    sourceTitle: null as string | null,
    sourceDescription: null as string | null,
    sourceExcerpt: inputType === "image" ? "[Image input — content extracted by Gemini Vision]" : input,
    sourceCredibility: scoreSourceCredibility(input),
  };

  if (sourceUrl) {
    try {
      const context = await fetchUrlContext(sourceUrl);
      prepared.sourceTitle = context.sourceTitle;
      prepared.sourceDescription = context.sourceDescription;
      prepared.sourceExcerpt = context.sourceExcerpt || input;
    } catch (error) {
      prepared.sourceDescription = error instanceof Error && error.message.includes('private network')
        ? 'The URL was not fetched because it points to a local or private network address.'
        : 'The URL could not be fetched; analysis is based on the submitted link.';
    }
  }

  const cacheKey = await hashValue(`${CACHE_VERSION}:${inputType}:${sourceUrl ?? ""}:${input}:${imageData ?? ""}`);
  const cached = forceRefresh ? null : await readCachedAnalysis(cacheKey);
  if (cached) {
    const envelope = { ...cached, id: crypto.randomUUID(), createdAt: new Date().toISOString(), analyzedAt: cached.analyzedAt ?? cached.createdAt, fromCache: true, isPublic: false };
    await persistAnalysis({ ...envelope, cacheKey }, userId);
    return envelope;
  }

  const prompt = buildPrompt({
    input,
    inputKind: inputType,
    sourceTitle: prepared.sourceTitle,
    sourceDescription: prepared.sourceDescription,
    sourceExcerpt: prepared.sourceExcerpt,
  });

  let engine: AnalysisEnvelope["engine"] = inputType === "image" ? "gemini" : "groq";
  let analysis: GeminiResponse;

  if (inputType === "image") {
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey || !imageData) throw new AnalysisUnavailableError("Image analysis is unavailable. Please try again later.");
    try {
      analysis = normalizeGeminiResult(await callGeminiVisionWithRetry(prompt, imageData, mimeType ?? "image/jpeg", geminiApiKey));
    } catch (error) {
      console.error("Gemini image analysis failed", error);
      throw new AnalysisUnavailableError("Image analysis is unavailable. Please try again later.");
    }
  } else {
    try {
      const groqApiKey = Deno.env.get("GROQ_API_KEY");
      if (!groqApiKey) throw new Error("Groq API key not configured");
      analysis = normalizeGeminiResult(await callGroqWithRetry(prompt, groqApiKey));
    } catch (groqError) {
      console.warn("Groq unavailable, trying Gemini backup", groqError);
      try {
        const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
        if (!geminiApiKey) throw new Error("Gemini API key not configured");
        analysis = normalizeGeminiResult(await callGeminiWithRetry(prompt, geminiApiKey));
        engine = "gemini";
      } catch (geminiError) {
        console.error("All analysis providers failed", geminiError);
        throw new AnalysisUnavailableError("Analysis providers are unavailable. Please try again later.");
      }
    }
  }

  analysis = { ...analysis, claims: await enrichClaimsWithEvidence(analysis.claims) };

  if (prepared.sourceCredibility && inputType === "url") {
    const blended = Math.round(analysis.credibilityScore * 0.75 + prepared.sourceCredibility.score * 0.25);
    analysis = { ...analysis, credibilityScore: blended, riskLevel: blended >= 70 ? "Low" : blended >= 45 ? "Medium" : "High" };
    if (prepared.sourceCredibility.tier === "Unknown" || prepared.sourceCredibility.tier === "Low-signal") {
      analysis.warnings = [...analysis.warnings, "Publisher credibility is uncertain; the domain score is a signal, not proof that the claims are true."];
    }
  }

  const envelope: AnalysisEnvelope = {
    id: crypto.randomUUID(),
    input,
    inputType,
    sourceUrl,
    sourceTitle: prepared.sourceTitle,
    sourceDescription: prepared.sourceDescription,
    sourceExcerpt: prepared.sourceExcerpt,
    sourceCredibility: prepared.sourceCredibility,
    engine,
    fromCache: false,
    createdAt: new Date().toISOString(),
    analyzedAt: new Date().toISOString(),
    ...analysis,
  };

  await writeCache(cacheKey, envelope);
  await persistAnalysis({ ...envelope, cacheKey }, userId);

  return envelope;
}

async function getRequestIdentity(req: Request) {
  const authorization = req.headers.get("authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  let userId: string | null = null;
  if (supabaseUrl && anonKey && authorization.startsWith("Bearer ") && authorization !== `Bearer ${anonKey}`) {
    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: authorization } });
      if (response.ok) userId = String((await response.json()).id ?? "") || null;
    } catch { userId = null; }
  }
  const rawIp = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
  const identity = userId ? `user:${userId}` : `guest:${rawIp}`;
  return { userId, scopeKey: await hashValue(`truthlens:${identity}`) };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method === "GET") {
    try {
      if (new URL(req.url).searchParams.get("feed") === "trending") return jsonResponse({ results: await loadTrendingScans() });
      return jsonResponse({ count: await countAnalyses() });
    } catch (error) {
      console.error("Unable to count analyses", error);
      return jsonResponse({ count: 0 });
    }
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const payload = (await req.json()) as AnalyzeRequest;
    const identity = await getRequestIdentity(req);

    if (payload.feedback) {
      if (!payload.feedback.scanId || !["up", "down"].includes(payload.feedback.rating)) return jsonResponse({ error: "Invalid feedback" }, 400);
      await storeFeedback(payload.feedback);
      return jsonResponse({ ok: true });
    }

    if (payload.mode === "batch" || Array.isArray(payload.items)) {
      if ((payload.items?.length ?? 0) > MAX_BATCH_SIZE) return jsonResponse({ error: `Batch mode accepts at most ${MAX_BATCH_SIZE} items`, code: "INVALID_INPUT" }, 400);
      const items = (payload.items ?? [])
        .map((item) => ({ input: normalizeInput(item.input), inputType: inferInputKind(item.input, item.inputType) }))
        .filter((item) => item.input.length > 0);

      if (items.length === 0) {
        return jsonResponse({ error: "At least one input is required" }, 400);
      }

      const results: AnalysisEnvelope[] = [];
      const errors: { input: string; message: string }[] = [];
      for (const item of items) {
        try {
          results.push(await analyzeSingle(item.input, item.inputType, undefined, undefined, false, identity.scopeKey, identity.userId));
        } catch (error) {
          errors.push({ input: item.input, message: error instanceof Error ? error.message : "Unable to analyze this item" });
        }
      }

      return jsonResponse({ mode: "batch", results, ...(errors.length ? { errors } : {}) } satisfies BatchResponse);
    }

    const rawInput = normalizeInput(payload.input ?? payload.message ?? payload.url ?? (payload.inputType === "image" ? "[Image input]" : ""));
    if (!rawInput || (payload.inputType === "image" && !payload.imageData)) {
      return jsonResponse({ error: "Message or URL is required" }, 400);
    }

    const result = await analyzeSingle(rawInput, payload.inputType ?? inferInputKind(rawInput), payload.imageData, payload.mimeType, Boolean(payload.forceRefresh), identity.scopeKey, identity.userId);
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Error in analyze function:", error);
    if (error instanceof RateLimitError) return jsonResponse({ error: `${message}. Please wait before trying again.`, retryAt: error.resetAt }, 429);
    if (error instanceof ValidationError) return jsonResponse({ error: message, code: "INVALID_INPUT" }, 400);
    if (error instanceof AnalysisUnavailableError) return jsonResponse({ error: message, code: "PROVIDERS_UNAVAILABLE" }, 503);
    return jsonResponse({ error: "Analysis is temporarily unavailable. Please try again.", code: "INTERNAL_ERROR" }, 500);
  }
});
