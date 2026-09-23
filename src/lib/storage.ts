import type { AnalysisResult } from '../types';
import { isAnalysisResult } from './analyze';

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
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Browsers may disable local storage. */ }
}

export function loadLocalHistory() {
  const value = readJson<unknown>(HISTORY_KEY, []);
  return Array.isArray(value) ? value.filter(isAnalysisResult) : [];
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
  return readJson<ThemeMode>(THEME_KEY, 'dark') === 'light' ? 'light' : 'dark';
}

export function saveThemePreference(theme: ThemeMode) {
  writeJson(THEME_KEY, theme);
}

