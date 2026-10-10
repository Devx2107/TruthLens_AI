import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  History,
  LogIn,
  LogOut,
  MoonStar,
  Menu,
  Shield,
  SunMedium,
  User,
} from 'lucide-react';
import ResultCard from './components/ResultCard';
import AppNavigation from './components/AppNavigation';
import ScannerForm from './components/ScannerForm';
import Dashboard from './components/Dashboard';
import PolicyPage from './components/PolicyPage';
import CompareView from './components/CompareView';
import TrendingPage from './components/TrendingPage';
import Watchlist from './components/Watchlist';
import AdminFeedback from './components/AdminFeedback';
import type { AnalysisMode, AnalysisResult, InputKind, SessionSnapshot } from './types';
import { analyzeRequest, fetchPublicScan, fetchTrendingScans, loadUsageCount, loadUserHistory, setScanPublished, submitAnalysisFeedback } from './lib/analyze';
import { getLocalScan, getThemePreference, loadLocalHistory, saveLocalHistory, saveLocalScan, saveThemePreference, type ThemeMode } from './lib/storage';
import { supabase } from './lib/supabase';
import { addWatchlistClaim, loadScanRevisions } from './lib/features';

void React;

type RouteState = { kind: 'home' } | { kind: 'history' } | { kind: 'watchlist' } | { kind: 'scan'; id: string } | { kind: 'privacy' } | { kind: 'terms' } | { kind: 'trending' };

const loadingStages = ['Reading input', 'Reviewing context', 'Preparing assessment'];

function detectRoute(): RouteState {
  if (window.location.pathname === '/privacy') return { kind: 'privacy' };
  if (window.location.pathname === '/terms') return { kind: 'terms' };
  if (window.location.pathname === '/trending') return { kind: 'trending' };
  if (window.location.pathname === '/history') return { kind: 'history' };
  if (window.location.pathname === '/watchlist') return { kind: 'watchlist' };
  const match = window.location.pathname.match(/^\/scan\/([^/]+)$/i);
  if (match?.[1]) {
    return { kind: 'scan', id: decodeURIComponent(match[1]) };
  }

  return { kind: 'home' };
}

async function copyText(value: string) {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard access is unavailable');
  }
  await navigator.clipboard.writeText(value);
}

function mergeHistory(primary: AnalysisResult[], secondary: AnalysisResult[]) {
  const map = new Map<string, AnalysisResult>();
  [...secondary, ...primary].forEach((item) => map.set(item.id, item));
  return [...map.values()].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 20);
}

function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => getThemePreference());
  const [route, setRoute] = useState<RouteState>(() => detectRoute());
  const [mode, setMode] = useState<AnalysisMode>('single');
  const [inputKind, setInputKind] = useState<InputKind>('text');
  const [singleInput, setSingleInput] = useState('');
  const [compareInput, setCompareInput] = useState('');
  const [compareInputKind, setCompareInputKind] = useState<InputKind>('text');
  const [compareResult, setCompareResult] = useState<AnalysisResult | null>(null);
  const [batchInput, setBatchInput] = useState('');
  const [imageData, setImageData] = useState('');
  const [imageMimeType, setImageMimeType] = useState('image/jpeg');
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState<string | null>(null);
  const [retrySeconds, setRetrySeconds] = useState<number | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [batchResults, setBatchResults] = useState<AnalysisResult[]>([]);
  const [batchErrors, setBatchErrors] = useState<{ input: string; message: string }[]>([]);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [usageCount, setUsageCount] = useState<number | null>(null);
  const [sharedScan, setSharedScan] = useState<AnalysisResult | null>(null);
  const [trendingScans, setTrendingScans] = useState<AnalysisResult[]>([]);
  const [trendingStatus, setTrendingStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [notFound, setNotFound] = useState(false);
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [email, setEmail] = useState('');
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const scanFormRef = useRef<HTMLFormElement>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [outputLanguage, setOutputLanguage] = useState<'auto' | 'en' | 'hi'>('auto');
  const [revisions, setRevisions] = useState<AnalysisResult[]>([]);
  const [watchlistRefresh, setWatchlistRefresh] = useState(0);

  const loadingMessage = loadingStages[loadingStage % loadingStages.length];

  const changeMode = (nextMode: AnalysisMode) => {
    setMode(nextMode);
    if (nextMode !== 'single' && inputKind === 'image') setInputKind('text');
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    saveThemePreference(theme);
  }, [theme]);

  useEffect(() => {
    const syncRoute = () => setRoute(detectRoute());
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  useEffect(() => {
    const local = getLocalScan(route.kind === 'scan' ? route.id : '', session?.id);
    if (route.kind !== 'scan') {
      setHistory(loadLocalHistory(session?.id));
      setSharedScan(null);
      setNotFound(false);
      return;
    }

    if (local) {
      setSharedScan(local);
      setNotFound(false);
      return;
    }

    let cancelled = false;
    setSharedScan(null);
    setNotFound(false);

    fetchPublicScan(route.id).then((scan) => {
      if (cancelled) return;
      if (scan) {
        setSharedScan(scan);
      } else {
        setNotFound(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [route, session?.id]);

  useEffect(() => {
    if (route.kind !== 'trending') return;
    let cancelled = false;
    setTrendingStatus('loading');
    void fetchTrendingScans().then((scans) => {
      if (cancelled) return;
      setTrendingScans(scans);
      setTrendingStatus('ready');
    }).catch(() => { if (!cancelled) setTrendingStatus('error'); });
    return () => { cancelled = true; };
  }, [route.kind]);

  useEffect(() => {
    if (!retryAt) { setRetrySeconds(null); return; }
    const update = () => setRetrySeconds(Math.max(0, Math.ceil((Date.parse(retryAt) - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  useEffect(() => {
    setHistory(loadLocalHistory());
    void loadUsageCount().then((count) => setUsageCount(count));
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && route.kind === 'home') {
        event.preventDefault();
        scanFormRef.current?.requestSubmit();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [route.kind]);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      return;
    }

    const init = async () => {
      const { data } = await client.auth.getSession();
      const activeSession = data.session;
      setSession(activeSession ? { id: activeSession.user.id, email: activeSession.user.email ?? null, isAdmin: activeSession.user.app_metadata?.role === 'admin' } : null);

      if (activeSession) {
        const remoteHistory = await loadUserHistory(activeSession.user.id);
        setHistory(mergeHistory(remoteHistory, loadLocalHistory(activeSession.user.id)));
      } else {
        setHistory(loadLocalHistory());
      }
    };

    void init();

    const { data: authListener } = client.auth.onAuthStateChange(async (_event, nextSession) => {
      const next = nextSession ? { id: nextSession.user.id, email: nextSession.user.email ?? null, isAdmin: nextSession.user.app_metadata?.role === 'admin' } : null;
      setSession(next);
      if (next) {
        const remoteHistory = await loadUserHistory(next.id);
        setHistory(mergeHistory(remoteHistory, loadLocalHistory(next.id)));
      } else setHistory(loadLocalHistory());
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!accountOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [accountOpen]);

  const currentResult = route.kind === 'scan' ? sharedScan : result;

  useEffect(() => {
    if (!currentResult || !session) { setRevisions([]); return; }
    void loadScanRevisions(currentResult.id).then(setRevisions);
  }, [currentResult, session]);

  const historyItems = useMemo(() => history.slice(0, route.kind === 'history' ? 20 : 3), [history, route.kind]);

  const persistScan = async (scan: AnalysisResult) => {
    saveLocalScan(scan, session?.id);
    setHistory((current) => mergeHistory([scan], current));
    void loadUsageCount().then((count) => setUsageCount(count));
  };

  const startAnalysis = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setRetryAt(null);

    const singleValue = singleInput.trim();
    const batchValues = batchInput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (mode === 'batch' && batchValues.length === 0) {
      setError('Drop in at least one headline or link for batch mode.');
      return;
    }
    if (batchValues.length > 10) {
      setError('Batch mode accepts at most 10 items.');
      return;
    }
    if ([singleValue, compareInput.trim(), ...batchValues].some((value) => value.length > 20_000)) {
      setError('Each text or URL must be 20,000 characters or fewer.');
      return;
    }

    if (mode === 'compare' && compareInput.trim().length === 0) {
      setError('Add a second claim to compare.');
      return;
    }
    if (inputKind === 'image' && !imageData) {
      setError('Choose or paste an image first.');
      return;
    }
    if (mode !== 'batch' && inputKind !== 'image' && singleValue.length === 0) {
      setError(inputKind === 'url' ? 'Paste a link first.' : 'Paste a message or headline first.');
      return;
    }

    setLoading(true);
    setLoadingStage(0);
    setResult(null);
    setCompareResult(null);
    setBatchResults([]);
    setBatchErrors([]);

    const interval = window.setInterval(() => {
      setLoadingStage((stage) => (stage + 1) % loadingStages.length);
    }, 1300);

    try {
      const response = mode === 'compare' ? await Promise.all([
        analyzeRequest({ mode: 'single', input: singleValue, inputType: inputKind, outputLanguage }),
        analyzeRequest({ mode: 'single', input: compareInput.trim(), inputType: compareInputKind, outputLanguage }),
      ]) : await analyzeRequest(
        mode === 'batch'
          ? {
              mode: 'batch',
              items: batchValues.map((item) => ({
                input: item,
                inputType: item.match(/^https?:\/\//i) || item.match(/^www\./i) ? 'url' : 'text',
              })),
              outputLanguage,
            }
          : {
              mode: 'single',
              input: inputKind === 'image' ? '[Image input]' : singleValue,
              inputType: inputKind,
              outputLanguage,
              ...(inputKind === 'image' ? { imageData, mimeType: imageMimeType } : {}),
            },
      );

      if (Array.isArray(response)) {
        const left = 'results' in response[0] ? response[0].results[0] : response[0];
        const right = 'results' in response[1] ? response[1].results[0] : response[1];
        if (left && right) { setResult(left); setCompareResult(right); await Promise.all([persistScan(left), persistScan(right)]); }
      } else if ('results' in response) {
        setBatchResults(response.results);
        if (response.errors?.length) setError(`${response.errors.length} batch item${response.errors.length === 1 ? '' : 's'} failed. ${response.errors[0].message}`);
        setBatchErrors(response.errors ?? []);
        await Promise.all(response.results.map((scan) => persistScan(scan)));
        setResult(response.results[0] ?? null);
      } else {
        setResult(response);
        await persistScan(response);
        window.history.pushState({}, '', `/scan/${response.id}`);
        setRoute({ kind: 'scan', id: response.id });
      }
    } catch (analysisError) {
      setRetryAt(analysisError instanceof Error ? (analysisError as Error & { retryAt?: string | null }).retryAt ?? null : null);
      setError(analysisError instanceof Error ? analysisError.message : 'Unable to analyze the message. Please try again.');
    } finally {
      window.clearInterval(interval);
      setLoading(false);
    }
  };

  const openScan = (scanId: string) => {
    window.history.pushState({}, '', `/scan/${scanId}`);
    setRoute({ kind: 'scan', id: scanId });
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const copyShareLink = async (scan: AnalysisResult) => {
    const shareUrl = `${window.location.origin}/scan/${scan.id}`;
    try {
      if (!session) throw new Error('Sign in to publish and share a scan.');
      if (!scan.isPublic) {
        const approved = window.confirm('Publish this scan? Its submitted content and analysis will become public and may appear in Trending.');
        if (!approved) return;
        await setScanPublished(scan.id, true);
        const published = { ...scan, isPublic: true };
        setResult((current) => current?.id === scan.id ? published : current);
        setSharedScan((current) => current?.id === scan.id ? published : current);
        setHistory((current) => current.map((item) => item.id === scan.id ? published : item));
        saveLocalScan(published, session.id);
      }
      await copyText(shareUrl);
      setAuthMessage('Public link copied.');
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Unable to publish or copy the link.');
    }
  };

  const unpublishScan = async (scan: AnalysisResult) => {
    try {
      await setScanPublished(scan.id, false);
      const privateScan = { ...scan, isPublic: false };
      setResult((current) => current?.id === scan.id ? privateScan : current);
      setSharedScan((current) => current?.id === scan.id ? privateScan : current);
      setHistory((current) => current.map((item) => item.id === scan.id ? privateScan : item));
      saveLocalScan(privateScan, session?.id);
      setAuthMessage('Scan is private again.');
    } catch (publishError) { setError(publishError instanceof Error ? publishError.message : 'Unable to unpublish scan.'); }
  };

  const signIn = async () => {
    if (!supabase || !email.trim()) {
      setAuthMessage('Add an email address first.');
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (signInError) {
      setAuthMessage(signInError.message);
      return;
    }

    setAuthMessage('Magic link sent. Check your inbox.');
  };

  const signOut = async () => {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setSession(null);
    setHistory(loadLocalHistory());
  };

  const startNewScan = () => {
    setResult(null);
    setCompareResult(null);
    setBatchResults([]);
    setBatchErrors([]);
    setSingleInput('');
    setCompareInput('');
    setImageData('');
    setError(null);
    setRetryAt(null);
    setInternalRoute('home');
  };

  const refreshScan = async (scan: AnalysisResult) => {
    setError(null);
    setLoading(true);
    try {
      if (scan.inputType === 'image' && !imageData) throw new Error('Choose the image again before rescanning it.');
      const refreshed = await analyzeRequest({ mode: 'single', input: scan.input, inputType: scan.inputType, forceRefresh: true, outputLanguage, previousScanId: scan.id, ...(scan.inputType === 'image' ? { imageData, mimeType: imageMimeType } : {}) });
      if (!('results' in refreshed)) {
        setResult(refreshed);
        setSharedScan(refreshed);
        await persistScan(refreshed);
        window.history.pushState({}, '', `/scan/${refreshed.id}`);
        setRoute({ kind: 'scan', id: refreshed.id });
      }
    } catch (refreshError) {
      setRetryAt(refreshError instanceof Error ? (refreshError as Error & { retryAt?: string | null }).retryAt ?? null : null);
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh this scan.');
    } finally {
      setLoading(false);
    }
  };

  const submitFeedback = async (scan: AnalysisResult, rating: 'up' | 'down', comment?: string) => {
    try { await submitAnalysisFeedback(scan.id, rating, comment); } catch { setError('Feedback could not be saved. Please try again.'); }
  };

  const watchClaim = async (scan: AnalysisResult) => {
    if (!session) { setError('Sign in to save claim watches.'); return; }
    try {
      await addWatchlistClaim(scan.claims[0]?.claim || scan.input);
      setWatchlistRefresh((value) => value + 1);
      setAuthMessage('Claim added to your watchlist.');
    } catch (watchError) { setError(watchError instanceof Error ? watchError.message : 'Unable to watch this claim.'); }
  };

  const setInternalRoute = (kind: 'home' | 'history' | 'watchlist' | 'privacy' | 'terms' | 'trending') => {
    window.history.pushState({}, '', kind === 'home' ? '/' : `/${kind}`);
    setRoute({ kind });
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const readImage = (file: File) => {
    if (file.size > 5 * 1024 * 1024) { setError('Image must be 5 MiB or smaller.'); return; }
    if (!file.type.startsWith('image/')) { setError('Choose a supported image file.'); return; }
    setError(null);
    setImageMimeType(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = () => setImageData(String(reader.result));
    reader.readAsDataURL(file);
  };

  const pasteImage = async () => {
    try {
      const items = await navigator.clipboard.read();
      const item = items.find((entry) => entry.types.some((type) => type.startsWith('image/')));
      const type = item?.types.find((value) => value.startsWith('image/'));
      if (item && type) readImage(new File([await item.getType(type)], 'clipboard.png', { type }));
    } catch { setError('Clipboard image access is unavailable. Choose an image file instead.'); }
  };

  return (
    <div className="app-canvas min-h-screen">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 focus:text-teal-800">Skip to content</a>
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="app-header relative z-30 mb-6 flex items-center justify-between gap-4 rounded-2xl px-5 py-4">
          <div className="flex items-start gap-4">
            <div className="brand-mark flex h-12 w-12 shrink-0 items-center justify-center rounded-xl">
              <Shield className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">Evidence, made clear</p>
              <p className="font-editorial text-2xl font-bold text-slate-950 dark:text-white">TruthLens <span className="text-teal-700 dark:text-teal-300">AI</span></p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              {theme === 'dark' ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>

            <button type="button" onClick={() => setMobileNavOpen((open) => !open)} aria-label="Toggle navigation" aria-expanded={mobileNavOpen} className="nav-toggle rounded-xl border border-slate-300 p-2 text-slate-700 dark:border-slate-700 dark:text-slate-200 lg:hidden"><Menu className="h-5 w-5" /></button>

            <div className="relative" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${
                  session
                    ? 'border-cyan-500/40 bg-cyan-100 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-50'
                    : 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10'
                }`}
                aria-label="Account"
                aria-expanded={accountOpen}
              >
                <User className="h-4 w-4" />
              </button>

              {accountOpen && (
                <div className="absolute right-0 z-20 mt-2 w-80 rounded-[1.5rem] border border-slate-200 bg-white/95 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.15)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95 dark:shadow-[0_20px_60px_rgba(15,23,42,0.4)]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.35em] text-cyan-600 dark:text-cyan-200/70">Account</p>
                      <h2 className="mt-1 text-sm font-bold text-slate-900 dark:text-white">History and sync</h2>
                    </div>
                    <History className="h-5 w-5 text-cyan-200" />
                  </div>

                  {supabase ? (
                    <div className="mt-4 space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                        {session ? (
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{session.email || session.id}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">Signed in with Supabase Auth</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void signOut()}
                              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                            >
                              <LogOut className="h-4 w-4" />
                              Sign out
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <label htmlFor="account-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">Email address</label>
                            <input
                              id="account-email"
                              type="email"
                              value={email}
                              onChange={(event) => setEmail(event.target.value)}
                              placeholder="you@example.com"
                              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-500/60 dark:border-white/10 dark:bg-slate-950/30 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-cyan-400/40"
                            />
                            <button
                              type="button"
                              onClick={() => void signIn()}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 dark:bg-white dark:text-slate-950"
                            >
                              <LogIn className="h-4 w-4" />
                              Email me a sign-in link
                            </button>
                          </div>
                        )}

                        {authMessage && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{authMessage}</p>}
                      </div>

                      <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                        Signed-in users can sync their scan history to Supabase. Everyone else keeps a local history in the browser.
                      </p>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      Add your Supabase environment variables to enable sign-in, synced history, and public scan pages.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="grid flex-1 gap-7 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <AppNavigation active={route.kind === 'scan' || route.kind === 'privacy' || route.kind === 'terms' ? 'home' : route.kind} mobileOpen={mobileNavOpen} onNavigate={setInternalRoute} />
        <main id="main-content" className="flex min-w-0 flex-col gap-6">
          {authMessage && route.kind !== 'home' && <p role="status" className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-100">{authMessage}</p>}
          <section className="space-y-6">
            {route.kind === 'privacy' || route.kind === 'terms' ? (
              <PolicyPage title={route.kind === 'privacy' ? 'Privacy Policy' : 'Terms of Use'} onBack={() => setInternalRoute('home')} content={route.kind === 'privacy' ? ['TruthLens processes the text, URLs, and images you submit to provide an analysis. Signed-in users may also have an email address and scan history stored in Supabase.', 'We do not sell or share your personal information. Guest history stays in your browser; synced history is stored with Supabase. To request deletion, sign out and contact hello@truthlens.ai.'] : ['TruthLens is an AI-assisted information analysis tool. Results can be wrong and are not legal, medical, financial, or professional advice.', 'Use the service fairly and verify important claims with reliable sources. You are responsible for decisions made using the service.']} />
            ) : route.kind === 'watchlist' ? (
              session ? <Watchlist enabled refreshToken={watchlistRefresh} /> : <section className="glass-panel rounded-2xl p-8"><h1 className="font-editorial text-3xl font-bold">Your watchlist</h1><p className="mt-3 text-slate-600 dark:text-slate-300">Sign in from the account menu to save and revisit claims.</p></section>
            ) : route.kind === 'trending' ? (
              <TrendingPage scans={trendingScans} status={trendingStatus} onOpen={openScan} />
            ) : route.kind === 'history' ? (
              <div className="space-y-6"><div><p className="eyebrow">Your research</p><h1 className="font-editorial mt-2 text-4xl font-bold">Scan history</h1><p className="mt-2 text-slate-600 dark:text-slate-300">Review previous claims and see how your checks add up.</p></div><Dashboard history={history} onClear={() => { if (window.confirm('Clear all local scan history?')) { saveLocalHistory([], session?.id); setHistory([]); } }} /></div>
            ) : route.kind === 'scan' ? (
              <div className="glass-panel rounded-[2rem] p-5 sm:p-6">
                <button
                  type="button"
                  onClick={() => {
                    setInternalRoute('home');
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to scanner
                </button>

                <div className="mt-5">
                  {error && <p role="alert" className="mb-4 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-100">{error}</p>}
                  {currentResult ? (
                    <ResultCard key={currentResult.id} result={currentResult} revisions={revisions} onCopyLink={copyShareLink} onUnpublish={currentResult.isPublic && session ? unpublishScan : undefined} onNewScan={startNewScan} onRefresh={() => void refreshScan(currentResult)} onWatch={(scan) => void watchClaim(scan)} onFeedback={(rating, comment) => void submitFeedback(currentResult, rating, comment)} />
                  ) : notFound ? (
                    <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-white/10 dark:bg-white/5">
                      <p className="text-xl font-bold text-slate-900 dark:text-white">This scan link has no saved data yet.</p>
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                        The share page works best after a scan has been saved locally or synced to Supabase.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-[1.75rem] border border-slate-300 bg-slate-50 p-8 text-center text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                      Loading scan...
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="scanner-intro"><p className="eyebrow">A clearer view of the facts</p><h1 className="font-editorial mt-2 max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">Check a claim. <span className="text-teal-700 dark:text-teal-300">Understand the evidence.</span></h1><p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">Paste a headline, link, or image. TruthLens breaks down the claim and shows what the available sources support.</p>{usageCount !== null && <p className="mt-4 text-sm font-semibold text-teal-700 dark:text-teal-300">{usageCount.toLocaleString()} claims analyzed</p>}</div>
                <ScannerForm formRef={scanFormRef} onSubmit={startAnalysis} mode={mode} changeMode={changeMode} inputKind={inputKind} setInputKind={setInputKind} singleInput={singleInput} setSingleInput={setSingleInput} compareInput={compareInput} setCompareInput={setCompareInput} compareInputKind={compareInputKind} setCompareInputKind={setCompareInputKind} batchInput={batchInput} setBatchInput={setBatchInput} imageData={imageData} readImage={readImage} pasteImage={pasteImage} loading={loading} loadingMessage={loadingMessage} error={error} retrySeconds={retrySeconds} outputLanguage={outputLanguage} setOutputLanguage={setOutputLanguage} setError={setError} />

                {currentResult && <ResultCard key={currentResult.id} result={currentResult} revisions={revisions} onCopyLink={copyShareLink} onUnpublish={currentResult.isPublic && session ? unpublishScan : undefined} onNewScan={startNewScan} onRefresh={() => void refreshScan(currentResult)} onWatch={(scan) => void watchClaim(scan)} onFeedback={(rating, comment) => void submitFeedback(currentResult, rating, comment)} />}
                {compareResult && mode === 'compare' && currentResult && <CompareView left={currentResult} right={compareResult} />}

                {batchResults.length > 0 && mode === 'batch' && (
                  <div className="glass-panel rounded-[2rem] p-5 sm:p-6">
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.35em] text-cyan-600 dark:text-cyan-200/70">Batch results</p>
                        <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{batchResults.length} items scanned</h2>
                      </div>
                      <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                        {batchResults.filter((scan) => scan.engine === 'gemini' || scan.engine === 'groq').length} AI backed
                      </span>
                    </div>
                    <div className="space-y-4">
                      {batchResults.map((scan) => (
                        <button
                          key={scan.id}
                          type="button"
                          onClick={() => openScan(scan.id)}
                          className="w-full rounded-[1.5rem] border border-slate-200 bg-white/80 p-4 text-left transition hover:-translate-y-0.5 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white">{scan.sourceTitle || scan.input}</p>
                              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{scan.summary}</p>
                            </div>
                            <span className="text-sm font-bold text-cyan-700 dark:text-cyan-200">{scan.credibilityScore}/100</span>
                          </div>
                        </button>
                      ))}
                      {batchErrors.length > 0 && <div className="rounded-2xl border border-amber-400/20 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-400/10 dark:text-amber-100"><p className="font-semibold">Skipped items</p><ul className="mt-2 space-y-1">{batchErrors.map((item) => <li key={item.input} className="truncate">{item.input}: {item.message}</li>)}</ul></div>}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {(route.kind === 'home' || route.kind === 'history') && <section className="glass-panel rounded-[2rem] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-cyan-600 dark:text-cyan-200/70">Recent</p>
                  <h2 className="font-editorial mt-1 text-2xl font-bold text-slate-900 dark:text-white">{route.kind === 'history' ? 'All saved scans' : 'Latest scans'}</h2>
                </div>
                {route.kind === 'home' && <button type="button" onClick={() => setInternalRoute('history')} className="text-sm font-semibold text-teal-700 hover:underline dark:text-teal-300">View history ?</button>}
              </div>

              <div className="mt-4 space-y-3">
                {historyItems.length > 0 ? (
                  historyItems.map((scan) => (
                    <button
                      key={scan.id}
                      type="button"
                      onClick={() => openScan(scan.id)}
                      className="w-full rounded-2xl border border-slate-200 bg-white/80 p-4 text-left transition hover:-translate-y-0.5 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900 dark:text-white">{scan.sourceTitle || scan.input}</p>
                          <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">{scan.summary}</p>
                        </div>
                        <span className="text-sm font-bold text-cyan-700 dark:text-cyan-200">{scan.credibilityScore}</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                    No scans yet. Run one and we’ll keep it here.
                  </div>
                )}
              </div>
            </section>}

            {route.kind === 'home' && <section className="glass-panel rounded-2xl p-5 sm:p-6">
              <p className="eyebrow">Read with care</p>
              <h2 className="font-editorial mt-2 text-2xl font-bold">How to use an assessment</h2>
              <div className="mt-4 grid gap-4 text-sm leading-6 text-slate-600 dark:text-slate-300 sm:grid-cols-3">
                <p><strong className="block text-slate-900 dark:text-white">1. Read the summary</strong>See the main conclusion and any limits.</p>
                <p><strong className="block text-slate-900 dark:text-white">2. Check each claim</strong>Review the explanation for individual statements.</p>
                <p><strong className="block text-slate-900 dark:text-white">3. Open the sources</strong>Verify the context before sharing or acting.</p>
              </div>
            </section>}

            {route.kind === 'history' && <AdminFeedback enabled={Boolean(session?.isAdmin)} />}
        </main>

        </div>
        <footer className="app-footer mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          <span>© {new Date().getFullYear()} TruthLens AI · Read with care.</span>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-2">
            <a href="/privacy" onClick={(event) => { event.preventDefault(); setInternalRoute('privacy'); }}>Privacy</a>
            <a href="/terms" onClick={(event) => { event.preventDefault(); setInternalRoute('terms'); }}>Terms</a>
            <a href="mailto:hello@truthlens.ai">Contact</a>
            <a href="https://github.com/Devx2107/TruthLens_AI" target="_blank" rel="noreferrer">GitHub</a>
          </nav>
        </footer>
      </div>
    </div>
  );
}

export default App;
