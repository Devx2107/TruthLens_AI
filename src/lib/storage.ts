import type { AnalysisResult } from '../types';

const HISTORY_KEY = 'truthlens.history.v1';
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

export function loadLocalHistory() {
  return readJson<AnalysisResult[]>(HISTORY_KEY, []);
}

export function saveLocalHistory(scans: AnalysisResult[]) {
  writeJson(HISTORY_KEY, scans.slice(0, 40));
}

export function saveLocalScan(scan: AnalysisResult) {
  const current = loadLocalHistory();
  const next = [scan, ...current.filter((item) => item.id !== scan.id)].slice(0, 40);
  saveLocalHistory(next);
  return next;
}

export function getLocalScan(scanId: string) {
  return loadLocalHistory().find((scan) => scan.id === scanId) ?? null;
}

export function getThemePreference(): ThemeMode {
  return readJson<ThemeMode>(THEME_KEY, 'dark');
}

export function saveThemePreference(theme: ThemeMode) {
  writeJson(THEME_KEY, theme);
}

