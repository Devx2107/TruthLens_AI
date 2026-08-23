import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type InputKind = "text" | "url";
type RiskLevel = "Low" | "Medium" | "High";
type SourceCredibilityLabel = "Established publisher" | "Limited signal" | "Caution signal";

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "TruthLensAI/1.0",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL (${response.status})`);
    }

    const html = await response.text();
    const sourceTitle = extractTitle(html) ?? extractMeta(html, "og:title");
    const sourceDescription = extractMeta(html, "description") ?? extractMeta(html, "og:description");
    const mainContent = extractMainContent(html);
    const text = stripHtml(mainContent).slice(0, 6000);

    return {
      sourceTitle,
      sourceDescription,
      sourceExcerpt: text,
    };
  } finally {
    clearTimeout(timeout);
  }
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
    warnings: [reason ? `Gemini analysis failed: ${reason}` : "Configure Supabase and Gemini secrets to enable the full AI analysis path."],
  } satisfies GeminiResponse;
}

async function callGemini(prompt: string, geminiApiKey: string) {
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash";
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await fetch(geminiUrl, {
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

async function storeAnalysisRecord(
  payload: Omit<AnalysisEnvelope, "fromCache" | "engine"> & { cacheKey: string },
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return;
  }

  await fetch(`${supabaseUrl}/rest/v1/analysis_history`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      scan_id: payload.id,
      cache_key: payload.cacheKey,
      input_kind: payload.inputType,
      input_text: payload.input,
      input_url: payload.sourceUrl,
      payload,
      created_at: payload.createdAt,
    }),
  });
}

async function storePublicScanPage(
  payload: Omit<AnalysisEnvelope, "fromCache" | "engine"> & { cacheKey: string },
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return;
  }

  await fetch(`${supabaseUrl}/rest/v1/scan_pages`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      scan_id: payload.id,
      user_id: null,
      input_kind: payload.inputType,
      input_text: payload.input,
      input_url: payload.sourceUrl,
      payload,
      is_public: true,
      created_at: payload.createdAt,
    }),
  });
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

  if (!supabaseUrl || !serviceRoleKey) {
    return { allowed: true, resetAt: null as string | null };
  }

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

  if (!response.ok) {
    return { allowed: true, resetAt: null as string | null };
  }

  const payload = await response.json();
  const row = Array.isArray(payload) ? payload[0] : payload;
  return { allowed: Boolean(row?.allowed ?? true), resetAt: row?.reset_at ?? null };
}

async function analyzeSingle(rawInput: string, explicitKind?: InputKind) {
  const input = normalizeInput(rawInput);
  const inputType = inferInputKind(input, explicitKind);
  const sourceUrl = inputType === "url" ? toUrl(input) : null;
  const sourceCredibility = sourceUrl ? domainSignal(sourceUrl) : null;

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

  const cacheKey = await hashValue(`${inputType}:${sourceUrl ?? ""}:${input}`);
  const cached = await readCachedAnalysis(cacheKey);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  const scopeKey = await hashValue(`truthlens:${inputType}:${sourceUrl ?? input}`);
  const rateLimit = await rateLimitScope(scopeKey);
  if (!rateLimit.allowed) {
    const resetAt = rateLimit.resetAt ? Date.parse(rateLimit.resetAt) : Date.now() + 300000;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    const error = new Error("Rate limit exceeded. Please try again when the window resets.");
    Object.assign(error, { retryAfterSeconds });
    throw error;
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

  await writeCache(cacheKey, envelope);
  await storeAnalysisRecord({ ...envelope, cacheKey });
  await storePublicScanPage({ ...envelope, cacheKey });

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

    if (payload.mode === "batch" || Array.isArray(payload.items)) {
      const items = (payload.items ?? [])
        .map((item) => ({ input: normalizeInput(item.input), inputType: inferInputKind(item.input, item.inputType) }))
        .filter((item) => item.input.length > 0);

      if (items.length === 0) {
        return jsonResponse({ error: "At least one input is required" }, 400);
      }

      const results: AnalysisEnvelope[] = [];
      for (const item of items) {
        results.push(await analyzeSingle(item.input, item.inputType));
      }

      return jsonResponse({ mode: "batch", results } satisfies BatchResponse);
    }

    const rawInput = normalizeInput(payload.input ?? payload.message ?? payload.url ?? "");
    if (!rawInput) {
      return jsonResponse({ error: "Message or URL is required" }, 400);
    }

    const result = await analyzeSingle(rawInput, payload.inputType ?? inferInputKind(rawInput));
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Error in analyze function:", error);
    const retryAfterSeconds = typeof error === "object" && error !== null && "retryAfterSeconds" in error
      ? Number((error as { retryAfterSeconds: number }).retryAfterSeconds)
      : undefined;
    return jsonResponse({ error: message, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) }, message.includes("Rate limit") ? 429 : 500);
  }
});
