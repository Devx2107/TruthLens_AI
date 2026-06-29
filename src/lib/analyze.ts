import type { AnalyzeRequest, AnalysisResult, BatchAnalysisResponse, ClaimAnalysis, InputKind } from '../types';
import { hasSupabaseConfig, supabase } from './supabase';

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

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to analyze');
  }

  return response.json() as Promise<AnalysisResult | BatchAnalysisResponse>;
}

export async function analyzeRequest(payload: AnalyzeRequest): Promise<AnalysisResult | BatchAnalysisResponse> {
  try {
    return await postToEdgeFunction(payload);
  } catch {
    if (payload.mode === 'batch' || Array.isArray(payload.items)) {
      const items = payload.items ?? [];
      return {
        mode: 'batch',
        results: items.map((item) => localAnalyzeOne(normalizeText(item.input), item.inputType)),
      };
    }

    const text = normalizeText(payload.input ?? payload.message ?? payload.url ?? '');
    const kind = detectInputKind(text, payload.inputType);
    return localAnalyzeOne(text, kind);
  }
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

  if (error || !data?.payload) {
    return null;
  }

  return data.payload as AnalysisResult;
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

  const scanRow = {
    scan_id: result.id,
    user_id: userId,
    input_kind: result.inputType,
    input_text: result.input,
    input_url: result.sourceUrl,
    payload: result,
    is_public: true,
    created_at: result.createdAt,
  };

  await Promise.allSettled([
    supabase.from('analysis_history').upsert(historyRow, { onConflict: 'scan_id' }),
    supabase.from('scan_pages').upsert(scanRow, { onConflict: 'scan_id' }),
  ]);
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
    return [];
  }

  return data
    .map((row) => row.payload as AnalysisResult)
    .filter(Boolean);
}
