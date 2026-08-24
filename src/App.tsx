import React, { FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Copy,
  History,
  Link2,
  Loader2,
  LogIn,
  LogOut,
  MoonStar,
  Plus,
  Search,
  Shield,
  Sparkles,
  SunMedium,
  TextCursorInput,
  Upload,
  User,
} from 'lucide-react';
import ResultCard from './components/ResultCard';
import Dashboard from './components/Dashboard';
import PolicyPage from './components/PolicyPage';
import CompareView from './components/CompareView';
import TrendingPage from './components/TrendingPage';
import type { AnalysisMode, AnalysisResult, InputKind, SessionSnapshot } from './types';
import { analyzeRequest, detectInputKind, fetchPublicScan, fetchTrendingScans, loadUsageCount, loadUserHistory, saveAnalysisForUser, submitAnalysisFeedback } from './lib/analyze';
import { getLocalScan, getThemePreference, loadLocalHistory, saveLocalHistory, saveLocalScan, saveThemePreference, type ThemeMode } from './lib/storage';
import { supabase, hasSupabaseConfig } from './lib/supabase';

void React;

type RouteState = { kind: 'home' } | { kind: 'scan'; id: string } | { kind: 'privacy' } | { kind: 'terms' } | { kind: 'trending' };

const loadingStages = ['Reading message', 'Checking sources', 'Scoring credibility'];

const examplePool: { single: string; batch: string }[] = [
  {
    single: 'Hot water cures all viruses. Share immediately!',
    batch: 'Hot water cures all viruses. Share immediately!\nISRO launches a new satellite to monitor climate change.',
  },
  {
    single: 'Scientists confirm coffee cures all diseases, share immediately!',
    batch: 'Scientists confirm coffee cures all diseases, share immediately!\nWHO releases updated guidance on seasonal flu vaccines.',
  },
  {
    single: 'They don\'t want you to know this one secret trick that cures diabetes overnight!',
    batch: 'They don\'t want you to know this one secret trick that cures diabetes overnight!\nLocal city council approves new public park budget for next year.',
  },
  {
    single: 'BREAKING: Government secretly adds mind-control chemicals to drinking water!!!',
    batch: 'BREAKING: Government secretly adds mind-control chemicals to drinking water!!!\nNew bridge construction project completes ahead of schedule.',
  },
  {
    single: 'Eating this common fruit seed kills cancer cells instantly, doctors are furious!',
    batch: 'Eating this common fruit seed kills cancer cells instantly, doctors are furious!\nUniversity researchers publish peer-reviewed study on sleep patterns.',
  },
];

function detectRoute(): RouteState {
  if (window.location.pathname === '/privacy') return { kind: 'privacy' };
  if (window.location.pathname === '/terms') return { kind: 'terms' };
  if (window.location.pathname === '/trending') return { kind: 'trending' };
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

function ModeButton({
  active,
  icon,
  label,
  onClick,
  }: {
    active: boolean;
    icon: ReactNode;
    label: string;
    onClick: () => void;
  }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-50 shadow-[0_10px_30px_rgba(34,211,238,0.2)]'
          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  );
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
  const [notFound, setNotFound] = useState(false);
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [email, setEmail] = useState('');
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const scanFormRef = useRef<HTMLFormElement>(null);
  const [footerVisible, setFooterVisible] = useState(false);
  const lastExampleIndex = useRef<number | null>(null);

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
    const local = getLocalScan(route.kind === 'scan' ? route.id : '');
    if (route.kind !== 'scan') {
      setHistory(loadLocalHistory());
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
        saveLocalScan(scan);
      } else {
        setNotFound(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [route]);

  useEffect(() => {
    if (route.kind !== 'trending') return;
    void fetchTrendingScans().then(setTrendingScans);
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
    void loadUsageCount().then((count) => setUsageCount(count ?? loadLocalHistory().length));
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
      setSession(activeSession ? { id: activeSession.user.id, email: activeSession.user.email ?? null } : null);

      const localHistory = loadLocalHistory();
      if (activeSession) {
        const remoteHistory = await loadUserHistory(activeSession.user.id);
        setHistory(mergeHistory(remoteHistory, localHistory));
      } else {
        setHistory(localHistory);
      }
    };

    void init();

    const { data: authListener } = client.auth.onAuthStateChange(async (_event, nextSession) => {
      const next = nextSession ? { id: nextSession.user.id, email: nextSession.user.email ?? null } : null;
      setSession(next);
      if (next) {
        const remoteHistory = await loadUserHistory(next.id);
        setHistory((current) => mergeHistory(remoteHistory, current));
      }
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

  useEffect(() => {
    const SCROLL_THRESHOLD = 120;

    const handleScroll = () => {
      setFooterVisible(window.scrollY > SCROLL_THRESHOLD);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const currentResult = route.kind === 'scan' ? sharedScan : result;

  const historyItems = useMemo(() => history.slice(0, 8), [history]);

  const persistScan = async (scan: AnalysisResult) => {
    const merged = saveLocalScan(scan);
    saveLocalHistory(merged);
    setHistory((current) => mergeHistory([scan], current));
    if (session) {
      await saveAnalysisForUser(scan, session.id);
    }
    void loadUsageCount().then((count) => setUsageCount(count ?? loadLocalHistory().length));
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
        analyzeRequest({ mode: 'single', input: singleValue, inputType: inputKind }),
        analyzeRequest({ mode: 'single', input: compareInput.trim(), inputType: compareInputKind }),
      ]) : await analyzeRequest(
        mode === 'batch'
          ? {
              mode: 'batch',
              items: batchValues.map((item) => ({
                input: item,
                inputType: item.match(/^https?:\/\//i) || item.match(/^www\./i) ? 'url' : 'text',
              })),
            }
          : {
              mode: 'single',
              input: inputKind === 'image' ? '[Image input]' : singleValue,
              inputType: inputKind,
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
  };

  const copyShareLink = async (scan: AnalysisResult) => {
    const shareUrl = `${window.location.origin}/scan/${scan.id}`;
    try {
      await copyText(shareUrl);
      setAuthMessage('Link copied. It opens on this browser unless the scan is explicitly published.');
    } catch {
      setError('Unable to copy the link. Check your browser clipboard permissions.');
    }
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
      const refreshed = await analyzeRequest({ mode: 'single', input: scan.input, inputType: scan.inputType, forceRefresh: true });
      if (!('results' in refreshed)) {
        setResult(refreshed);
        await persistScan(refreshed);
      }
    } catch (refreshError) {
      setRetryAt(refreshError instanceof Error ? (refreshError as Error & { retryAt?: string | null }).retryAt ?? null : null);
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh this scan.');
    } finally {
      setLoading(false);
    }
  };

  const submitFeedback = async (scan: AnalysisResult, rating: 'up' | 'down') => {
    try { await submitAnalysisFeedback(scan.id, rating); } catch { setError('Feedback could not be saved. Please try again.'); }
  };

  const setInternalRoute = (kind: 'home' | 'privacy' | 'terms' | 'trending') => {
    window.history.pushState({}, '', kind === 'home' ? '/' : `/${kind}`);
    setRoute({ kind });
  };

  const readImage = (file: File) => {
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
    <div className={`min-h-screen overflow-hidden text-slate-100 ${theme === 'dark' ? 'bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.2),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#081122_45%,_#0b1324_100%)]' : 'bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.28),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#e0f2fe_55%,_#eef2ff_100%)]'}`}>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:28px_28px] opacity-30" />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-blob-one absolute -left-24 top-10 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="animate-blob-two absolute right-[-6rem] top-1/3 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="animate-blob-three absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 pb-40 sm:px-6 sm:pb-24 lg:px-8">
        <header className="relative z-30 mb-6 flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-[0_20px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-indigo-500 text-slate-950 shadow-lg shadow-cyan-500/20">
              <Shield className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">TruthLens AI</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">
                Smarter misinformation scans that feel alive.
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Paste text, links, or batches of headlines. TruthLens breaks claims apart, scores credibility, and keeps a shareable record of every scan.
              </p>
              <p className="mt-3 text-sm font-semibold text-cyan-200">{usageCount === null ? 'Analysing claims worldwide' : `${usageCount.toLocaleString()} claims analysed so far`}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              {theme === 'dark' ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>

            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100">
              <Bot className="h-4 w-4" />
              {hasSupabaseConfig ? 'Supabase ready' : 'Demo mode'}
            </span>

            <div className="relative" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${
                  session
                    ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-50'
                    : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                }`}
                aria-label="Account"
              >
                <User className="h-4 w-4" />
              </button>

              {accountOpen && (
                <div className="absolute right-0 z-20 mt-2 w-80 rounded-[1.5rem] border border-white/10 bg-slate-950/95 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.4)] backdrop-blur-xl">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/70">Account</p>
                      <h2 className="mt-1 text-sm font-bold text-white">History and sync</h2>
                    </div>
                    <History className="h-5 w-5 text-cyan-200" />
                  </div>

                  {supabase ? (
                    <div className="mt-4 space-y-4">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        {session ? (
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-white">{session.email || session.id}</p>
                              <p className="text-xs text-slate-400">Signed in with Supabase Auth</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void signOut()}
                              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                            >
                              <LogOut className="h-4 w-4" />
                              Sign out
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <input
                              type="email"
                              value={email}
                              onChange={(event) => setEmail(event.target.value)}
                              placeholder="you@example.com"
                              className="w-full rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
                            />
                            <button
                              type="button"
                              onClick={() => void signIn()}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-bold text-slate-950 transition hover:-translate-y-0.5"
                            >
                              <LogIn className="h-4 w-4" />
                              Email me a sign-in link
                            </button>
                          </div>
                        )}

                        {authMessage && <p className="mt-3 text-sm text-slate-300">{authMessage}</p>}
                      </div>

                      <p className="text-sm leading-6 text-slate-400">
                        Signed-in users can sync their scan history to Supabase. Everyone else keeps a local history in the browser.
                      </p>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm leading-6 text-slate-400">
                      Add your Supabase environment variables to enable sign-in, synced history, and public scan pages.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-6">
          <section className="space-y-6">
            {route.kind === 'privacy' || route.kind === 'terms' ? (
              <PolicyPage title={route.kind === 'privacy' ? 'Privacy Policy' : 'Terms of Use'} onBack={() => setInternalRoute('home')} content={route.kind === 'privacy' ? ['TruthLens processes the text, URLs, and images you submit to provide an analysis. Signed-in users may also have an email address and scan history stored in Supabase.', 'We do not sell or share your personal information. Guest history stays in your browser; synced history is stored with Supabase. To request deletion, sign out and contact hello@truthlens.ai.'] : ['TruthLens is an AI-assisted information analysis tool. Results can be wrong and are not legal, medical, financial, or professional advice.', 'Use the service fairly and verify important claims with reliable sources. You are responsible for decisions made using the service.']} />
            ) : route.kind === 'trending' ? (
              <TrendingPage scans={trendingScans} onOpen={openScan} />
            ) : route.kind === 'scan' ? (
              <div className="glass-panel rounded-[2rem] p-5 sm:p-6">
                <button
                  type="button"
                  onClick={() => {
                    setInternalRoute('home');
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white/10 hover:text-white dark:text-slate-200"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to scanner
                </button>

                <div className="mt-5">
                  {currentResult ? (
                    <ResultCard result={currentResult} onCopyLink={copyShareLink} onNewScan={startNewScan} onRefresh={() => void refreshScan(currentResult)} onFeedback={(rating) => void submitFeedback(currentResult, rating)} />
                  ) : notFound ? (
                    <div className="rounded-[1.75rem] border border-dashed border-white/10 bg-white/5 p-8 text-center">
                      <p className="text-xl font-bold text-white">This scan link has no saved data yet.</p>
                      <p className="mt-2 text-sm text-slate-300">
                        The share page works best after a scan has been saved locally or synced to Supabase.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-8 text-center text-slate-300">
                      Loading scan...
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <form ref={scanFormRef} onSubmit={startAnalysis} className="glass-panel rounded-[2rem] p-5 sm:p-6">
                  <div className="flex flex-wrap gap-2">
                    <ModeButton active={mode === 'single'} icon={<TextCursorInput className="h-4 w-4" />} label="Single" onClick={() => changeMode('single')} />
                    <ModeButton active={mode === 'batch'} icon={<Plus className="h-4 w-4" />} label="Batch" onClick={() => changeMode('batch')} />
                    <ModeButton active={mode === 'compare'} icon={<Link2 className="h-4 w-4" />} label="Compare" onClick={() => changeMode('compare')} />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <ModeButton active={inputKind === 'text'} icon={<TextCursorInput className="h-4 w-4" />} label="Text input" onClick={() => setInputKind('text')} />
                    <ModeButton active={inputKind === 'url'} icon={<Link2 className="h-4 w-4" />} label="URL input" onClick={() => setInputKind('url')} />
                    {mode !== 'batch' && <ModeButton active={inputKind === 'image'} icon={<Upload className="h-4 w-4" />} label="Image" onClick={() => setInputKind('image')} />}
                  </div>

                  <div className="mt-5 space-y-3">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {mode === 'batch' ? 'Paste one headline or URL per line' : inputKind === 'url' ? 'Paste a link to scan' : inputKind === 'image' ? 'Upload or paste a screenshot' : 'Paste a message or headline'}
                    </label>

                    {mode === 'compare' ? <div className="grid gap-3 md:grid-cols-2"><div><div className="mb-2 flex gap-2"><ModeButton active={inputKind === 'text'} icon={<TextCursorInput className="h-4 w-4" />} label="Text" onClick={() => setInputKind('text')} /><ModeButton active={inputKind === 'url'} icon={<Link2 className="h-4 w-4" />} label="URL" onClick={() => setInputKind('url')} /></div><textarea value={singleInput} onChange={(event) => setSingleInput(event.target.value)} placeholder="First claim" className="min-h-44 w-full rounded-[1.5rem] border border-white/10 bg-slate-950/30 px-4 py-4 text-base leading-7 text-white outline-none" disabled={loading} /></div><div><div className="mb-2 flex gap-2"><ModeButton active={compareInputKind === 'text'} icon={<TextCursorInput className="h-4 w-4" />} label="Text" onClick={() => setCompareInputKind('text')} /><ModeButton active={compareInputKind === 'url'} icon={<Link2 className="h-4 w-4" />} label="URL" onClick={() => setCompareInputKind('url')} /></div><textarea value={compareInput} onChange={(event) => setCompareInput(event.target.value)} placeholder="Second claim" className="min-h-44 w-full rounded-[1.5rem] border border-white/10 bg-slate-950/30 px-4 py-4 text-base leading-7 text-white outline-none" disabled={loading} /></div></div> : mode === 'batch' ? (
                      <textarea
                        value={batchInput}
                        onChange={(event) => setBatchInput(event.target.value)}
                        placeholder={'Headline one\nHeadline two\nhttps://example.com/story'}
                        className="min-h-44 w-full rounded-[1.5rem] border border-white/10 bg-slate-950/30 px-4 py-4 text-base leading-7 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20"
                        disabled={loading}
                      />
                    ) : inputKind === 'image' ? (
                      <div className="rounded-[1.5rem] border border-dashed border-cyan-400/30 bg-slate-950/30 p-5 text-center">
                        <input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && readImage(event.target.files[0])} disabled={loading} className="block w-full text-sm text-slate-300" />
                        <button type="button" onClick={() => void pasteImage()} className="mt-3 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white"><Upload className="mr-2 inline h-4 w-4" />Paste from clipboard</button>
                        {imageData && <img src={imageData} alt="Selected preview" className="mx-auto mt-4 max-h-48 rounded-2xl" />}
                      </div>
                    ) : (
                      <textarea
                        value={singleInput}
                        onChange={(event) => setSingleInput(event.target.value)}
                        onPaste={(event) => { const pasted = event.clipboardData.getData('text'); if (detectInputKind(pasted) === 'url') setInputKind('url'); }}
                        placeholder={
                          inputKind === 'url'
                            ? 'https://news.example.com/story'
                            : 'Hot water cures all viruses. Share immediately!'
                        }
                        className="min-h-44 w-full rounded-[1.5rem] border border-white/10 bg-slate-950/30 px-4 py-4 text-base leading-7 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20"
                        disabled={loading}
                      />
                    )}
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      {loading ? loadingMessage : 'Analyze claim'}
                      {!loading && <span className="ml-1 hidden text-[11px] font-medium opacity-70 sm:inline">(Ctrl/Cmd+Enter)</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        let nextIndex = Math.floor(Math.random() * examplePool.length);
                        if (examplePool.length > 1 && nextIndex === lastExampleIndex.current) {
                          nextIndex = (nextIndex + 1) % examplePool.length;
                        }
                        lastExampleIndex.current = nextIndex;
                        const example = examplePool[nextIndex];
                        setSingleInput(example.single);
                        setBatchInput(example.batch);
                        setError(null);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                    >
                      <Sparkles className="h-4 w-4" />
                      Load examples
                    </button>
                  </div>

                  {error && (
                    <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                      {error}
                      {retrySeconds !== null && retrySeconds > 0 && <span className="mt-1 block font-semibold">You can try again in {retrySeconds}s.</span>}
                    </div>
                  )}
                </form>

                {currentResult && <ResultCard result={currentResult} onCopyLink={copyShareLink} onNewScan={startNewScan} onRefresh={() => void refreshScan(currentResult)} onFeedback={(rating) => void submitFeedback(currentResult, rating)} />}
                {compareResult && mode === 'compare' && currentResult && <CompareView left={currentResult} right={compareResult} />}

                {batchResults.length > 0 && mode === 'batch' && (
                  <div className="glass-panel rounded-[2rem] p-5 sm:p-6">
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/70">Batch results</p>
                        <h2 className="mt-1 text-xl font-bold text-white">{batchResults.length} items scanned</h2>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-semibold text-slate-300">
                        {batchResults.filter((scan) => scan.engine === 'gemini').length} AI backed
                      </span>
                    </div>
                    <div className="space-y-4">
                      {batchResults.map((scan) => (
                        <button
                          key={scan.id}
                          type="button"
                          onClick={() => openScan(scan.id)}
                          className="w-full rounded-[1.5rem] border border-white/10 bg-white/5 p-4 text-left transition hover:-translate-y-0.5 hover:bg-white/10"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="font-semibold text-white">{scan.sourceTitle || scan.input}</p>
                              <p className="mt-1 text-sm text-slate-400">{scan.summary}</p>
                            </div>
                            <span className="text-sm font-bold text-cyan-200">{scan.credibilityScore}/100</span>
                          </div>
                        </button>
                      ))}
                      {batchErrors.length > 0 && <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100"><p className="font-semibold">Skipped items</p><ul className="mt-2 space-y-1">{batchErrors.map((item) => <li key={item.input} className="truncate">{item.input}: {item.message}</li>)}</ul></div>}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="glass-panel rounded-[2rem] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/70">Recent</p>
                  <h2 className="mt-1 text-xl font-bold text-white">Saved scans</h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    saveLocalHistory([]);
                    setHistory([]);
                  }}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  Clear local
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {historyItems.length > 0 ? (
                  historyItems.map((scan) => (
                    <button
                      key={scan.id}
                      type="button"
                      onClick={() => openScan(scan.id)}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:-translate-y-0.5 hover:bg-white/10"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-white">{scan.sourceTitle || scan.input}</p>
                          <p className="mt-1 truncate text-sm text-slate-400">{scan.summary}</p>
                        </div>
                        <span className="text-sm font-bold text-cyan-200">{scan.credibilityScore}</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-slate-400">
                    No scans yet. Run one and we’ll keep it here.
                  </div>
                )}
              </div>
            </section>

            <section className="glass-panel rounded-[2rem] p-5 sm:p-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Upload className="h-4 w-4 text-cyan-200" />
                What’s new
              </div>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
                <li>URL mode fetches page metadata before scoring.</li>
                <li>Batch mode scans multiple lines in one go.</li>
                <li>Results show confidence, claim breakdowns, and shareable cards.</li>
                <li>History is saved locally, and Supabase sync kicks in when you sign in.</li>
                <li>Public scan pages use `/scan/:id` when a scan has been saved.</li>
              </ul>
            </section>

            <Dashboard history={history} onClear={() => { if (window.confirm('Clear all local scan history?')) { saveLocalHistory([]); setHistory([]); } }} />
        </main>

        <footer
          className={`fixed inset-x-0 bottom-0 z-30 transition-all duration-300 ${
            footerVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
          }`}
        >
          <div className="mx-auto flex max-h-[30vh] w-full max-w-7xl flex-col gap-3 overflow-y-auto border-t border-white/10 bg-slate-950/90 px-4 py-3 text-xs text-slate-400 backdrop-blur-xl sm:max-h-none sm:flex-row sm:items-center sm:justify-between sm:overflow-visible sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 font-semibold text-slate-300">
              <Shield className="h-3.5 w-3.5 text-cyan-200" />
              TruthLens AI
            </div>

            <nav className="flex flex-wrap items-center gap-4">
              <a href="/privacy" onClick={(event) => { event.preventDefault(); setInternalRoute('privacy'); }} className="transition hover:text-white">
                Privacy Policy
              </a>
              <a href="/terms" onClick={(event) => { event.preventDefault(); setInternalRoute('terms'); }} className="transition hover:text-white">
                Terms
              </a>
              <a href="/trending" onClick={(event) => { event.preventDefault(); setInternalRoute('trending'); }} className="transition hover:text-white">
                Recently debunked
              </a>
              <a href="mailto:hello@truthlens.ai" className="transition hover:text-white">
                Contact
              </a>
              <a
                href="https://github.com/Devx2107/TruthLens_AI"
                target="_blank"
                rel="noreferrer"
                className="transition hover:text-white"
              >
                GitHub
              </a>
              <button
                type="button"
                onClick={() => void copyText(window.location.origin)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <Copy className="h-3 w-3" />
                Copy app URL
              </button>
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
