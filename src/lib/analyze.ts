import type { AnalyzeRequest, AnalysisResult, BatchAnalysisResponse, InputKind, UsageStats } from '../types';
import { hasSupabaseConfig, supabase } from './supabase';

export function detectInputKind(input: string, explicit?: InputKind): InputKind {
  if (explicit) return explicit;
  return /^https?:\/\/\S+/i.test(input.trim()) || /^www\.\S+/i.test(input.trim()) ? 'url' : 'text';
}

async function authToken() {
  if (!supabase) return import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || (import.meta.env.VITE_SUPABASE_ANON_KEY as string);
}

async function apiFetch(path = '', init: RequestInit = {}) {
  if (!hasSupabaseConfig) throw new Error('TruthLens analysis is not configured. Add the Supabase environment variables and try again.');
  const token = await authToken();
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
}

async function responseError(response: Response) {
  const text = await response.text();
  let details: { error?: string; retryAt?: string | null; code?: string } = {};
  try { details = JSON.parse(text); } catch { details.error = text; }
  const error = new Error(details.error || 'Analysis is unavailable. Please try again.') as Error & {
    status?: number; retryAt?: string | null; code?: string;
  };
  error.status = response.status;
  error.retryAt = details.retryAt;
  error.code = details.code;
  return error;
}

export async function analyzeRequest(payload: AnalyzeRequest): Promise<AnalysisResult | BatchAnalysisResponse> {
  const response = await apiFetch('', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<AnalysisResult | BatchAnalysisResponse>;
}

export async function loadUsageCount(): Promise<number | null> {
  try {
    const response = await apiFetch();
    if (!response.ok) return null;
    const payload = (await response.json()) as UsageStats;
    return Number.isFinite(payload.count) ? payload.count : null;
  } catch { return null; }
}

export async function submitAnalysisFeedback(scanId: string, rating: 'up' | 'down') {
  const response = await apiFetch('', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feedback: { scanId, rating } }),
  });
  if (!response.ok) throw await responseError(response);
}

export async function fetchTrendingScans() {
  try {
    const response = await apiFetch('?feed=trending');
    if (!response.ok) return [];
    return ((await response.json()) as { results?: AnalysisResult[] }).results ?? [];
  } catch { return [] as AnalysisResult[]; }
}

export async function fetchPublicScan(scanId: string) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('scan_pages').select('payload,is_public').eq('scan_id', scanId).maybeSingle();
  if (error || !data?.payload) return null;
  return { ...(data.payload as AnalysisResult), isPublic: Boolean(data.is_public) };
}

export async function loadUserHistory(userId: string) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('scan_pages').select('payload,is_public').eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
  if (error || !data) return [];
  return data.flatMap((row) => row.payload ? [{ ...(row.payload as AnalysisResult), isPublic: Boolean(row.is_public) }] : []);
}

export async function setScanPublished(scanId: string, isPublic: boolean) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Sign in to publish scans');
  const { data: updated, error } = await supabase.rpc('set_scan_visibility', { p_scan_id: scanId, p_is_public: isPublic });
  if (error) throw new Error(error.message);
  if (!updated) throw new Error('This scan is not owned by your account. Rescan it while signed in to publish it.');
}
