import type { AnalysisResult, FeedbackItem, WatchlistItem } from '../types';
import { analyzeRequest } from './analyze';
import { supabase } from './supabase';

async function requireUser() {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Sign in to use this feature');
  return data.session.user;
}

export async function loadWatchlist(): Promise<WatchlistItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('claim_watchlist').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id, query: row.query, createdAt: row.created_at, lastCheckedAt: row.last_checked_at,
    latestResult: row.latest_payload as AnalysisResult | null,
  }));
}

export async function addWatchlistClaim(query: string) {
  const user = await requireUser();
  const { error } = await supabase!.from('claim_watchlist').upsert({ user_id: user.id, query: query.trim() }, { onConflict: 'user_id,query' });
  if (error) throw new Error(error.message);
}

export async function removeWatchlistClaim(id: string) {
  if (!supabase) return;
  const { error } = await supabase.from('claim_watchlist').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function refreshWatchlistClaim(item: WatchlistItem) {
  if (!supabase) throw new Error('Supabase is not configured');
  const response = await analyzeRequest({ mode: 'single', input: item.query, inputType: 'text', forceRefresh: true });
  if ('results' in response) throw new Error('Unexpected batch response');
  const checkedAt = new Date().toISOString();
  const { error } = await supabase.from('claim_watchlist').update({ latest_payload: response, last_checked_at: checkedAt }).eq('id', item.id);
  if (error) throw new Error(error.message);
  return { ...item, latestResult: response, lastCheckedAt: checkedAt };
}

export async function loadScanRevisions(scanId: string) {
  if (!supabase) return [] as AnalysisResult[];
  const { data, error } = await supabase.from('scan_revisions').select('previous_payload,current_payload,created_at').eq('scan_id', scanId).order('created_at', { ascending: false });
  if (error) return [] as AnalysisResult[];
  return (data ?? []).flatMap((row) => [row.current_payload, row.previous_payload] as AnalysisResult[]);
}

export async function loadFeedbackQueue(): Promise<FeedbackItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('analysis_feedback').select('id,scan_id,rating,comment,status,created_at').order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ id: row.id, scanId: row.scan_id, rating: row.rating, comment: row.comment, status: row.status, createdAt: row.created_at }));
}

export async function updateFeedbackStatus(id: string, status: FeedbackItem['status']) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.from('analysis_feedback').update({ status, reviewed_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}
