import type { AnalysisResult } from '../types';

const HISTORY_KEY = 'truthlens.history.v2';
const LEGACY_HISTORY_KEY = 'truthlens.history.v1';
const THEME_KEY = 'truthlens.theme.v1';

export type ThemeMode = 'light' | 'dark';

function readJson<T>(key: string, fallback: T) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function historyKey(userId?: string | null) {
  return `${HISTORY_KEY}.${userId ? `user.${userId}` : 'guest'}`;
}

export function loadLocalHistory(userId?: string | null) {
  const key = historyKey(userId);
  if (!userId && localStorage.getItem(key) === null) {
    const legacy = readJson<AnalysisResult[]>(LEGACY_HISTORY_KEY, []);
    if (legacy.length) writeJson(key, legacy);
  }
  return readJson<AnalysisResult[]>(key, []);
}

export function saveLocalHistory(scans: AnalysisResult[], userId?: string | null) {
  writeJson(historyKey(userId), scans.slice(0, 40));
}

export function saveLocalScan(scan: AnalysisResult, userId?: string | null) {
  const current = loadLocalHistory(userId);
  const next = [scan, ...current.filter((item) => item.id !== scan.id)].slice(0, 40);
  saveLocalHistory(next, userId);
  return next;
}

export function getLocalScan(scanId: string, userId?: string | null) {
  return loadLocalHistory(userId).find((scan) => scan.id === scanId) ?? null;
}

export function getThemePreference(): ThemeMode {
  const saved = readJson<ThemeMode | null>(THEME_KEY, null);
  if (saved === 'light' || saved === 'dark') return saved;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function saveThemePreference(theme: ThemeMode) {
  writeJson(THEME_KEY, theme);
}

