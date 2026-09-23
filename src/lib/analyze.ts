import type { AnalyzeRequest, AnalysisResult, BatchAnalysisResponse, ClaimAnalysis, InputKind } from '../types';
import { hasSupabaseConfig, supabase } from './supabase';

export class AnalyzeRequestError extends Error {
  status: number;
  retryAfterSeconds?: number;

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = 'AnalyzeRequestError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function detectInputKind(input: string, explicit?: InputKind): InputKind {
  if (explicit) return explicit;
  if (/^https?:\/\/\S+/i.test(input.trim()) || /^www\.\S+/i.test(input.trim())) return 'url';
  return 'text';
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!value || typeof value !== 'object') return false;
  const scan = value as Partial<AnalysisResult>;
  return typeof scan.id === 'string' && typeof scan.input === 'string' &&
    (scan.inputType === 'text' || scan.inputType === 'url') &&
    typeof scan.credibilityScore === 'number' && Number.isFinite(scan.credibilityScore) && scan.credibilityScore >= 0 && scan.credibilityScore <= 100 &&
    typeof scan.confidence === 'number' && Number.isFinite(scan.confidence) && scan.confidence >= 0 && scan.confidence <= 100 &&
    (scan.riskLevel === 'Low' || scan.riskLevel === 'Medium' || scan.riskLevel === 'High') &&
    (scan.engine === 'gemini' || scan.engine === 'heuristic') &&
    Array.isArray(scan.claims) && scan.claims.every((claim) => claim && typeof claim.claim === 'string' &&
      typeof claim.score === 'number' && Number.isFinite(claim.score) &&
      typeof claim.confidence === 'number' && Number.isFinite(claim.confidence) &&
      typeof claim.rationale === 'string' && typeof claim.verdict === 'string') &&
    Array.isArray(scan.warnings) && scan.warnings.every((warning) => typeof warning === 'string') &&
    Array.isArray(scan.manipulationTechniques) && scan.manipulationTechniques.every((item) => typeof item === 'string') &&
    typeof scan.summary === 'string' && typeof scan.explanation === 'string' &&
    typeof scan.createdAt === 'string';
}

function buildHeuristicClaims(input: string, score: number, confidence: number) {
  return input
    .split(/[.!?]\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((claim, index) => {
      const adjusted = clamp(score - index * 6, 5, 95);
      const verdict: ClaimAnalysis['verdict'] = adjusted >= 70 ? 'Likely true' : adjusted >= 45 ? 'Mixed' : 'Likely false';
      return {
        claim,
        score: adjusted,
        confidence: clamp(confidence - index * 5, 20, 95),
        verdict,
        rationale:
          adjusted >= 70
            ? 'This reads like a plausible statement, but it still benefits from source verification.'
            : adjusted >= 45
              ? 'The wording mixes confidence and uncertainty, so it deserves more evidence.'
              : 'The phrasing looks weakly supported or sensational, which lowers trustworthiness.',
      };
    });
}

function localAnalyzeOne(input: string, inputType: InputKind): AnalysisResult {
  const lower = input.toLowerCase();
  const penalties =
    (lower.includes('share immediately') ? 10 : 0) +
    (lower.includes('breaking') ? 6 : 0) +
    (lower.includes('shocking') ? 8 : 0) +
    (lower.includes('secret') ? 8 : 0) +
    (input.match(/!/g)?.length ?? 0) * 2 +
    (input.length > 220 ? 4 : 0) +
    (/[A-Z]{6,}/.test(input) ? 4 : 0);

  const credibilityScore = clamp(78 - penalties, 10, 95);
  const confidence = clamp(72 - Math.floor(penalties * 0.75), 25, 95);
  const riskLevel = credibilityScore >= 70 ? 'Low' : credibilityScore >= 45 ? 'Medium' : 'High';

  const manipulationTechniques = [
    ...(lower.includes('share immediately') || lower.includes('urgent') ? ['Urgency'] : []),
    ...(lower.includes('shocking') ? ['Sensationalism'] : []),
    ...(lower.includes('secret') ? ['Appeal to secrecy'] : []),
  ];

  return {
    id: crypto.randomUUID(),
    input,
    inputType,
    sourceUrl: inputType === 'url' ? input : null,
    sourceTitle: null,
    sourceDescription: null,
    sourceExcerpt: input,
    credibilityScore,
    confidence,
    riskLevel,
    manipulationTechniques,
    claims: buildHeuristicClaims(input, credibilityScore, confidence),
    summary:
      inputType === 'url'
        ? 'Demo mode analyzed the URL string because the live analysis API was unavailable.'
        : 'Demo mode analyzed the text locally because the live analysis API was unavailable.',
    explanation:
      'Connect Supabase and Gemini for the full analysis pipeline. This local fallback keeps the interface usable during setup.',
    warnings:
      inputType === 'url'
        ? ['URL previews require the live backend to fetch and summarize the page.']
        : ['This is a local fallback. Configure the analysis API for better results.'],
    engine: 'heuristic',
    createdAt: new Date().toISOString(),
    fromCache: false,
  };
}

async function postToEdgeFunction(payload: AnalyzeRequest) {
  if (!hasSupabaseConfig) {
    throw new Error('Supabase is not configured');
  }

  const { data } = await supabase!.auth.getSession();
  const token = data.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze`, {
    method: 'POST',
    signal: AbortSignal.timeout(payload.mode === 'batch' ? 300000 : 35000),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = errorText || 'Failed to analyze';
    let retryAfterSeconds: number | undefined;
    try {
      const body = JSON.parse(errorText) as { error?: string; retryAfterSeconds?: number };
      message = body.error || message;
      retryAfterSeconds = body.retryAfterSeconds;
    } catch {
      // Keep the raw response for non-JSON errors.
    }
    throw new AnalyzeRequestError(message, response.status, retryAfterSeconds);
  }

  return response.json() as Promise<AnalysisResult | BatchAnalysisResponse>;
}

export async function analyzeRequest(payload: AnalyzeRequest): Promise<AnalysisResult | BatchAnalysisResponse> {
  if (!hasSupabaseConfig) {
    if (payload.mode === 'batch' || Array.isArray(payload.items)) {
      const items = payload.items ?? [];
      return {
        mode: 'batch',
        results: items.map((item) => localAnalyzeOne(normalizeText(item.input), item.inputType)),
        errors: [],
      };
    }

    const text = normalizeText(payload.input ?? payload.message ?? payload.url ?? '');
    const kind = detectInputKind(text, payload.inputType);
    return localAnalyzeOne(text, kind);
  }
  const response = await postToEdgeFunction(payload);
  if ('results' in response) {
    if (!Array.isArray(response.results) || !response.results.every(isAnalysisResult) || !Array.isArray(response.errors)) {
      throw new AnalyzeRequestError('The analysis server returned an invalid batch response.', 502);
    }
  } else if (!isAnalysisResult(response)) {
    throw new AnalyzeRequestError('The analysis server returned an invalid scan.', 502);
  }
  return response;
}

export async function fetchPublicScan(scanId: string) {
  if (!hasSupabaseConfig || !supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('scan_pages')
    .select('payload')
    .eq('scan_id', scanId)
    .eq('is_public', true)
    .maybeSingle();

  if (error) throw new Error(`Shared scan could not be loaded: ${error.message}`);
  if (!data?.payload) return null;

  return isAnalysisResult(data.payload) ? data.payload : null;
}

export async function saveAnalysisForUser(result: AnalysisResult, userId: string) {
  if (!supabase) {
    return;
  }

  const historyRow = {
    scan_id: result.id,
    user_id: userId,
    input_kind: result.inputType,
    input_text: result.input,
    input_url: result.sourceUrl,
    payload: result,
    created_at: result.createdAt,
  };

  // Public scan pages are created by the Edge Function with the service role.
  // Keep the client-side write scoped to the user's private history row.
  const { error } = await supabase.from('analysis_history').upsert(historyRow, { onConflict: 'scan_id' });
  if (error) throw new Error(`History was not synced: ${error.message}`);
}

export async function publishScan(result: AnalysisResult): Promise<string> {
  if (!hasSupabaseConfig) {
    throw new AnalyzeRequestError('Supabase is not configured, so this scan cannot be shared yet.', 503);
  }

  const response = await postToEdgeFunction({ action: 'publish', scan: result }) as unknown as { ok?: boolean; scanId?: string };
  if (!response.ok || typeof response.scanId !== 'string') throw new Error('The server did not confirm publication.');
  return response.scanId;
}

export async function loadUserHistory(userId: string) {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('analysis_history')
    .select('payload')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data) {
    if (error) throw new Error(`History could not be loaded: ${error.message}`);
    return [];
  }

  return data
    .map((row) => row.payload as unknown)
    .filter(isAnalysisResult);
}
