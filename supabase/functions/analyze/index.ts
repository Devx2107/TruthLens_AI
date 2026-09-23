import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type InputKind = "text" | "url";
type RiskLevel = "Low" | "Medium" | "High";
type SourceCredibilityLabel = "Established publisher" | "Limited signal" | "Caution signal";

interface AnalyzeItem {
  input: string;
  inputType?: InputKind;
}

interface AnalyzeRequest {
  action?: "analyze" | "publish";
  mode?: "single" | "batch";
  input?: string;
  inputType?: InputKind;
  message?: string;
  url?: string;
  items?: AnalyzeItem[];
  scan?: AnalysisEnvelope;
}

interface ClaimAnalysis {
  claim: string;
  score: number;
  confidence: number;
  verdict: "Likely true" | "Mixed" | "Likely false";
  rationale: string;
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
  sourceCredibility?: {
    domain: string;
    score: number;
    label: SourceCredibilityLabel;
    rationale: string;
  };
  engine: "gemini" | "heuristic";
  createdAt: string;
  fromCache: boolean;
}

interface BatchResponse {
  mode: "batch";
  results: AnalysisEnvelope[];
  errors: { index: number; input: string; error: string; retryAfterSeconds?: number }[];
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

class RequestFailure extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterSeconds?: number) {
    super(message);
  }
}

function validateInput(input: unknown, kind: unknown): asserts input is string {
  if (typeof input !== "string" || !input.trim() || input.length > 10000) {
    throw new RequestFailure("Input must contain 1 to 10,000 characters.", 400);
  }
  if (kind !== undefined && kind !== "text" && kind !== "url") {
    throw new RequestFailure("Input type must be text or url.", 400);
  }
  if (kind === "url" || (kind === undefined && /^(https?:\/\/|www\.)/i.test(input))) {
    let candidate: URL;
    try { candidate = new URL(toUrl(input)); }
    catch { throw new RequestFailure("Enter a valid HTTP or HTTPS URL.", 400); }
    if (!["http:", "https:"].includes(candidate.protocol) || !candidate.hostname) {
      throw new RequestFailure("Only HTTP and HTTPS URLs are supported.", 400);
    }
  }
}

function assertPublicUrl(value: string) {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new RequestFailure("Enter a valid HTTP or HTTPS URL.", 400); }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host.includes(":") ||
      /^(0|10|127|169\.254|192\.168)\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    throw new RequestFailure("URL must point to a public website.", 400);
  }
  return url;
}

function publicIp(address: string) {
  if (address.includes(":")) return /^[23][0-9a-f]*:/i.test(address) && !/^2001:db8:/i.test(address);
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 && c <= 2)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) ||
    (a === 203 && b === 0 && c === 113));
}

async function assertPublicDns(hostname: string) {
  const lookups = await Promise.allSettled([
    Deno.resolveDns(hostname, "A", { signal: AbortSignal.timeout(5000) }),
    Deno.resolveDns(hostname, "AAAA", { signal: AbortSignal.timeout(5000) }),
  ]);
  const addresses = lookups.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!addresses.length || addresses.some((address) => !publicIp(address))) {
    throw new RequestFailure("URL must resolve only to public network addresses.", 400);
  }
}

async function fetchPublicPage(value: string) {
  let url = assertPublicUrl(value);
  for (let redirects = 0; redirects < 4; redirects++) {
    await assertPublicDns(url.hostname);
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new RequestFailure("Page redirect has no destination.", 502);
      url = assertPublicUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) throw new RequestFailure(`Page fetch failed (${response.status}).`, 502);
    if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") ?? "")) {
      throw new RequestFailure("URL does not contain an HTML page.", 400);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new RequestFailure("Page has no content.", 502);
    const parts: Uint8Array[] = [];
    let size = 0;
    while (size < 1024 * 1024) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      parts.push(part.value);
    }
    await reader.cancel();
    const bytes = new Uint8Array(Math.min(size, 1024 * 1024));
    let offset = 0;
    for (const part of parts) {
      bytes.set(part.subarray(0, bytes.length - offset), offset);
      offset += Math.min(part.length, bytes.length - offset);
      if (offset >= bytes.length) break;
    }
    return new TextDecoder().decode(bytes);
  }
  throw new RequestFailure("Too many page redirects.", 502);
}

const DOMAIN_SIGNALS: Record<string, { score: number; label: SourceCredibilityLabel; rationale: string }> = {
  "apnews.com": { score: 92, label: "Established publisher", rationale: "Associated with an established wire-service newsroom." },
  "bbc.com": { score: 90, label: "Established publisher", rationale: "Associated with an established public-service newsroom." },
  "npr.org": { score: 90, label: "Established publisher", rationale: "Associated with an established public-media newsroom." },
  "pbs.org": { score: 90, label: "Established publisher", rationale: "Associated with an established public-media newsroom." },
  "reuters.com": { score: 94, label: "Established publisher", rationale: "Associated with an established international wire service." },
  "theguardian.com": { score: 84, label: "Established publisher", rationale: "Associated with an established newspaper newsroom." },
  "nytimes.com": { score: 86, label: "Established publisher", rationale: "Associated with an established newspaper newsroom." },
  "washingtonpost.com": { score: 86, label: "Established publisher", rationale: "Associated with an established newspaper newsroom." },
  "infowars.com": { score: 12, label: "Caution signal", rationale: "This domain has a strong history of publishing unreliable or sensational claims." },
  "naturalnews.com": { score: 15, label: "Caution signal", rationale: "This domain has a strong history of publishing unsupported health claims." },
  "beforeitsnews.com": { score: 15, label: "Caution signal", rationale: "This domain is associated with user-published and frequently unreliable claims." },
};

function domainSignal(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const exact = DOMAIN_SIGNALS[hostname];
    const signal = exact ?? { score: 50, label: "Limited signal" as const, rationale: "No configured reputation signal exists for this domain." };
    return { domain: hostname, ...signal };
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

async function fetchUrlContext(url: string) {
    const html = await fetchPublicPage(url);
    const sourceTitle = extractTitle(html) ?? extractMeta(html, "og:title");
    const sourceDescription = extractMeta(html, "description") ?? extractMeta(html, "og:description");
    const mainContent = extractMainContent(html);
    const text = stripHtml(mainContent).slice(0, 6000);

    return {
      sourceTitle,
      sourceDescription,
      sourceExcerpt: text,
    };
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

function validGeminiResponse(value: unknown): value is GeminiResponse {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<GeminiResponse>;
  return typeof result.credibilityScore === "number" && Number.isFinite(result.credibilityScore) &&
    typeof result.confidence === "number" && Number.isFinite(result.confidence) &&
    ["Low", "Medium", "High"].includes(result.riskLevel ?? "") &&
    Array.isArray(result.manipulationTechniques) && result.manipulationTechniques.every((item) => typeof item === "string") &&
    Array.isArray(result.claims) && result.claims.every((claim) => claim &&
      typeof claim.claim === "string" && typeof claim.score === "number" && Number.isFinite(claim.score) &&
      typeof claim.confidence === "number" && Number.isFinite(claim.confidence) &&
      ["Likely true", "Mixed", "Likely false"].includes(claim.verdict) && typeof claim.rationale === "string") &&
    typeof result.summary === "string" && typeof result.explanation === "string" &&
    Array.isArray(result.warnings) && result.warnings.every((item) => typeof item === "string");
}

function scoreTextHeuristically(text: string, reason?: string) {
  const lower = text.toLowerCase();
  const sensationalPhrases = [
    "share immediately",
    "you won't believe",
    "breaking",
    "shocking",
    "urgent",
    "miracle",
    "cure all",
    "secret",
    "they don't want you to know",
  ];

  const penalties =
    sensationalPhrases.reduce((count, phrase) => count + (lower.includes(phrase) ? 1 : 0), 0) * 8 +
    (text.match(/!/g)?.length ?? 0) * 2 +
    (text.length > 240 ? 4 : 0) +
    (/[A-Z]{6,}/.test(text) ? 4 : 0);

  const score = clamp(78 - penalties, 8, 96);
  const confidence = clamp(72 - Math.floor(penalties * 0.75), 28, 90);
  const riskLevel: RiskLevel = score >= 70 ? "Low" : score >= 45 ? "Medium" : "High";
  const claims = text
    .split(/[.!?]\s+/)
    .filter((piece) => piece.trim().length > 0)
    .slice(0, 4)
    .map((claim, index) => {
      const claimScore = clamp(score - index * 6, 5, 95);
      return {
        claim: claim.trim(),
        score: claimScore,
        confidence: clamp(confidence - index * 5, 20, 90),
        verdict: claimScore >= 70 ? "Likely true" : claimScore >= 45 ? "Mixed" : "Likely false",
        rationale:
          claimScore >= 70
            ? "The statement reads as plausible but still deserves source verification."
            : claimScore >= 45
              ? "The statement mixes claims that would need additional evidence."
              : "The wording leans sensational or unsupported, which lowers trustworthiness.",
      };
    });

  return {
    credibilityScore: score,
    confidence,
    riskLevel,
    manipulationTechniques: [
      ...(lower.includes("share immediately") ? ["Urgency"] : []),
      ...(lower.includes("shocking") ? ["Sensationalism"] : []),
      ...(lower.includes("secret") ? ["Appeal to secrecy"] : []),
    ],
    claims,
    summary: "Heuristic fallback analysis was used because the live Gemini path was unavailable.",
    explanation:
      "This local fallback keeps the app usable during setup, but the best results come from the Supabase Edge Function calling Gemini.",
    warnings: [reason ? "Live AI analysis was unavailable. This is a heuristic estimate, not fact verification." : "Configure Supabase and Gemini secrets to enable the full AI analysis path."],
  } satisfies GeminiResponse;
}

async function callGemini(prompt: string, geminiApiKey: string) {
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash";
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await fetch(geminiUrl, {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": geminiApiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 4096,
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

  const parsed: unknown = safeParseJson(generatedText);
  if (!validGeminiResponse(parsed)) throw new Error("Model returned an invalid analysis.");
  return parsed;
}

function normalizeGeminiResult(value: GeminiResponse): GeminiResponse {
  const claims = Array.isArray(value.claims) ? value.claims : [];

  return {
    credibilityScore: clamp(Math.round(Number(value.credibilityScore) || 0), 0, 100),
    confidence: clamp(Math.round(Number(value.confidence) || 0), 0, 100),
    riskLevel:
      value.riskLevel === "Low" || value.riskLevel === "Medium" || value.riskLevel === "High"
        ? value.riskLevel
        : "Medium",
    manipulationTechniques: Array.isArray(value.manipulationTechniques)
      ? value.manipulationTechniques.map((item) => String(item)).filter(Boolean)
      : [],
    claims: claims.map((claim) => ({
      claim: String(claim.claim ?? "").trim(),
      score: clamp(Math.round(Number(claim.score) || 0), 0, 100),
      confidence: clamp(Math.round(Number(claim.confidence) || 0), 0, 100),
      verdict:
        claim.verdict === "Likely true" || claim.verdict === "Mixed" || claim.verdict === "Likely false"
          ? claim.verdict
          : "Mixed",
      rationale: String(claim.rationale ?? "").trim(),
    })),
    summary: String(value.summary ?? "").trim(),
    explanation: String(value.explanation ?? "").trim(),
    warnings: Array.isArray(value.warnings) ? value.warnings.map((item) => String(item)).filter(Boolean) : [],
  };
}

async function storePublicScanPage(payload: AnalysisEnvelope) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new RequestFailure("Sharing is not configured.", 503);
  }

  const publicId = crypto.randomUUID();
  const response = await fetch(`${supabaseUrl}/rest/v1/scan_pages`, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      scan_id: publicId,
      user_id: null,
      input_kind: payload.inputType,
      input_text: payload.input,
      input_url: payload.sourceUrl,
      payload,
      is_public: true,
      created_at: payload.createdAt,
    }),
  });
  if (!response.ok) throw new RequestFailure("Unable to publish this scan.", 503);
  return publicId;
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
    signal: AbortSignal.timeout(10000),
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
    signal: AbortSignal.timeout(10000),
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

  if (!supabaseUrl || !serviceRoleKey) {
    throw new RequestFailure("Rate limiting is not configured.", 503);
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/check_analysis_rate_limit`, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
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

  if (!response.ok) {
    throw new RequestFailure("Rate limiting is unavailable.", 503);
  }

  const payload = await response.json();
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (typeof row?.allowed !== "boolean") throw new RequestFailure("Rate limiting is unavailable.", 503);
  return { allowed: row.allowed, resetAt: row?.reset_at ?? null };
}

async function analyzeSingle(rawInput: string, explicitKind?: InputKind, callerScope = "unknown") {
  const input = normalizeInput(rawInput);
  const inputType = inferInputKind(input, explicitKind);
  const sourceUrl = inputType === "url" ? toUrl(input) : null;
  if (sourceUrl) assertPublicUrl(sourceUrl);
  const sourceCredibility = sourceUrl ? domainSignal(sourceUrl) : null;

  const rateLimit = await rateLimitScope(callerScope);
  if (!rateLimit.allowed) {
    const resetAt = rateLimit.resetAt ? Date.parse(rateLimit.resetAt) : Date.now() + 300000;
    throw new RequestFailure("Rate limit exceeded. Please try again when the window resets.", 429,
      Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)));
  }

  const cacheKey = await hashValue(`${inputType}:${sourceUrl ?? ""}:${input}`);
  const cached = await readCachedAnalysis(cacheKey).catch(() => null);
  if (cached && cached.engine === "gemini") {
    return { ...cached, id: crypto.randomUUID(), createdAt: new Date().toISOString(), fromCache: true };
  }

  const prepared = {
    input,
    inputKind: inputType,
    sourceTitle: null as string | null,
    sourceDescription: null as string | null,
    sourceExcerpt: input,
  };

  if (sourceUrl) {
    const context = await fetchUrlContext(sourceUrl);
    prepared.sourceTitle = context.sourceTitle;
    prepared.sourceDescription = context.sourceDescription;
    prepared.sourceExcerpt = context.sourceExcerpt || input;
  }

  const prompt = buildPrompt({
    input,
    inputKind: inputType,
    sourceTitle: prepared.sourceTitle,
    sourceDescription: prepared.sourceDescription,
    sourceExcerpt: prepared.sourceExcerpt,
  });

  let engine: AnalysisEnvelope["engine"] = "gemini";
  let analysis: GeminiResponse;

  try {
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      throw new Error("Gemini API key not configured");
    }

    analysis = normalizeGeminiResult(await callGemini(prompt, geminiApiKey));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn("Gemini unavailable, using heuristic fallback:", reason);
    engine = "heuristic";
    analysis = scoreTextHeuristically(prepared.sourceExcerpt, reason);
  }

  if (sourceCredibility) {
    const blendedScore = clamp(Math.round(analysis.credibilityScore * 0.8 + sourceCredibility.score * 0.2), 0, 100);
    analysis = {
      ...analysis,
      credibilityScore: blendedScore,
      riskLevel: blendedScore >= 70 ? "Low" : blendedScore >= 45 ? "Medium" : "High",
      warnings: [
        ...analysis.warnings,
        `Publisher signal: ${sourceCredibility.label}. This is a domain-level heuristic, not proof that the article is true or false.`,
      ],
    };
  }

  const envelope: AnalysisEnvelope = {
    id: crypto.randomUUID(),
    input,
    inputType,
    sourceUrl,
    sourceTitle: prepared.sourceTitle,
    sourceDescription: prepared.sourceDescription,
    sourceExcerpt: prepared.sourceExcerpt,
    ...(sourceCredibility ? { sourceCredibility } : {}),
    engine,
    fromCache: false,
    createdAt: new Date().toISOString(),
    ...analysis,
  };

  if (engine === "gemini") await writeCache(cacheKey, envelope).catch(() => undefined);
  return envelope;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const payload = (await req.json()) as AnalyzeRequest;
    if (!payload || typeof payload !== "object") throw new RequestFailure("A JSON object is required.", 400);
    const caller = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const callerScope = await hashValue(`caller:${caller}`);

    if (payload.action === "publish") {
      const publicationLimit = await rateLimitScope(callerScope);
      if (!publicationLimit.allowed) throw new RequestFailure("Rate limit exceeded.", 429);
      const scan = payload.scan;
      if (!scan || typeof scan !== "object" || typeof scan.id !== "string" ||
          typeof scan.input !== "string" || scan.input.length > 10000 ||
          !["text", "url"].includes(scan.inputType) ||
          !Number.isFinite(scan.credibilityScore) || scan.credibilityScore < 0 || scan.credibilityScore > 100 ||
          !["Low", "Medium", "High"].includes(scan.riskLevel) ||
          !["gemini", "heuristic"].includes(scan.engine) ||
          !Array.isArray(scan.claims) || !Array.isArray(scan.warnings) ||
          typeof scan.summary !== "string" || typeof scan.explanation !== "string" ||
          !Number.isFinite(Date.parse(scan.createdAt))) {
        throw new RequestFailure("A valid scan is required to publish it.", 400);
      }
      const scanId = await storePublicScanPage(scan);
      return jsonResponse({ ok: true, scanId });
    }

    if (payload.mode === "batch" || Array.isArray(payload.items)) {
      if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 10) {
        throw new RequestFailure("Batch must contain 1 to 10 items.", 400);
      }

      const results: AnalysisEnvelope[] = [];
      const errors: BatchResponse["errors"] = [];
      for (const [index, item] of payload.items.entries()) {
        try {
          validateInput(item?.input, item?.inputType);
          results.push(await analyzeSingle(item.input, item.inputType, callerScope));
        } catch (error) {
          errors.push({ index, input: typeof item?.input === "string" ? item.input.slice(0, 100) : "",
            error: error instanceof RequestFailure ? error.message : "Unable to analyze this item.",
            ...(error instanceof RequestFailure && error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}) });
        }
      }

      return jsonResponse({ mode: "batch", results, errors } satisfies BatchResponse);
    }

    const rawInput = payload.input ?? payload.message ?? payload.url ?? "";
    validateInput(rawInput, payload.inputType);

    const result = await analyzeSingle(rawInput, payload.inputType ?? inferInputKind(rawInput), callerScope);
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof RequestFailure ? error.message : "Unable to complete this request.";
    console.error("Error in analyze function:", error);
    const retryAfterSeconds = error instanceof RequestFailure ? error.retryAfterSeconds : undefined;
    return jsonResponse({ error: message, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) },
      error instanceof RequestFailure ? error.status : error instanceof SyntaxError ? 400 : 500);
  }
});
