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
import type { AnalysisMode, AnalysisResult, InputKind, SessionSnapshot } from './types';
import { analyzeRequest, fetchPublicScan, loadUserHistory, saveAnalysisForUser } from './lib/analyze';
import { getLocalScan, getThemePreference, loadLocalHistory, saveLocalHistory, saveLocalScan, saveThemePreference, type ThemeMode } from './lib/storage';
import { supabase, hasSupabaseConfig } from './lib/supabase';

void React;

type RouteState = { kind: 'home' } | { kind: 'scan'; id: string };

const loadingStages = ['Reading message', 'Checking sources', 'Scoring credibility'];

function detectRoute(): RouteState {
  const match = window.location.pathname.match(/^\/scan\/([^/]+)$/i);
  if (match?.[1]) {
    return { kind: 'scan', id: decodeURIComponent(match[1]) };
  }

  return { kind: 'home' };
}

function copyText(value: string) {
  return navigator.clipboard.writeText(value);
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
  const [batchInput, setBatchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [batchResults, setBatchResults] = useState<AnalysisResult[]>([]);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [sharedScan, setSharedScan] = useState<AnalysisResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [email, setEmail] = useState('');
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const [footerVisible, setFooterVisible] = useState(false);

  const loadingMessage = loadingStages[loadingStage % loadingStages.length];

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
    setHistory(loadLocalHistory());
  }, []);

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
  };

  const startAnalysis = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const singleValue = singleInput.trim();
    const batchValues = batchInput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (mode === 'batch' && batchValues.length === 0) {
      setError('Drop in at least one headline or link for batch mode.');
      return;
    }

    if (mode !== 'batch' && singleValue.length === 0) {
      setError(inputKind === 'url' ? 'Paste a link first.' : 'Paste a message or headline first.');
      return;
    }

    setLoading(true);
    setLoadingStage(0);
    setResult(null);
    setBatchResults([]);

    const interval = window.setInterval(() => {
      setLoadingStage((stage) => (stage + 1) % loadingStages.length);
    }, 1300);

    try {
      const response = await analyzeRequest(
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
              input: singleValue,
              inputType: inputKind,
            },
      );

      if ('results' in response) {
        setBatchResults(response.results);
        await Promise.all(response.results.map((scan) => persistScan(scan)));
        setResult(response.results[0] ?? null);
      } else {
        setResult(response);
        await persistScan(response);
        window.history.pushState({}, '', `/scan/${response.id}`);
        setRoute({ kind: 'scan', id: response.id });
      }
    } catch (analysisError) {
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
    await copyText(shareUrl);
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

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.2),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#081122_45%,_#0b1324_100%)] text-slate-100">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:28px_28px] opacity-30" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 pb-24 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-[0_20px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:p-5 lg:flex-row lg:items-center lg:justify-between">
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
            {route.kind === 'scan' ? (
              <div className="glass-panel rounded-[2rem] p-5 sm:p-6">
                <button
                  type="button"
                  onClick={() => {
                    window.history.pushState({}, '', '/');
                    setRoute({ kind: 'home' });
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white/10 hover:text-white dark:text-slate-200"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to scanner
                </button>

                <div className="mt-5">
                  {currentResult ? (
                    <ResultCard result={currentResult} onCopyLink={copyShareLink} />
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
                <form onSubmit={startAnalysis} className="glass-panel rounded-[2rem] p-5 sm:p-6">
                  <div className="flex flex-wrap gap-2">
                    <ModeButton active={mode === 'single'} icon={<TextCursorInput className="h-4 w-4" />} label="Single" onClick={() => setMode('single')} />
                    <ModeButton active={mode === 'batch'} icon={<Plus className="h-4 w-4" />} label="Batch" onClick={() => setMode('batch')} />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <ModeButton active={inputKind === 'text'} icon={<TextCursorInput className="h-4 w-4" />} label="Text input" onClick={() => setInputKind('text')} />
                    <ModeButton active={inputKind === 'url'} icon={<Link2 className="h-4 w-4" />} label="URL input" onClick={() => setInputKind('url')} />
                  </div>

                  <div className="mt-5 space-y-3">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {mode === 'batch' ? 'Paste one headline or URL per line' : inputKind === 'url' ? 'Paste a link to scan' : 'Paste a message or headline'}
                    </label>

                    {mode === 'batch' ? (
                      <textarea
                        value={batchInput}
                        onChange={(event) => setBatchInput(event.target.value)}
                        placeholder={'Headline one\nHeadline two\nhttps://example.com/story'}
                        className="min-h-44 w-full rounded-[1.5rem] border border-white/10 bg-slate-950/30 px-4 py-4 text-base leading-7 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20"
                        disabled={loading}
                      />
                    ) : (
                      <textarea
                        value={singleInput}
                        onChange={(event) => setSingleInput(event.target.value)}
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
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSingleInput('Hot water cures all viruses. Share immediately!');
                        setBatchInput('Hot water cures all viruses. Share immediately!\nISRO launches a new satellite to monitor climate change.');
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
                    </div>
                  )}
                </form>

                {currentResult && <ResultCard result={currentResult} onCopyLink={copyShareLink} />}

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
        </main>

        <footer
          className={`fixed inset-x-0 bottom-0 z-30 transition-all duration-300 ${
            footerVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
          }`}
        >
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 border-t border-white/10 bg-slate-950/90 px-4 py-3 text-xs text-slate-400 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 font-semibold text-slate-300">
              <Shield className="h-3.5 w-3.5 text-cyan-200" />
              TruthLens AI
            </div>

            <nav className="flex flex-wrap items-center gap-4">
              <a href="/privacy" className="transition hover:text-white">
                Privacy Policy
              </a>
              <a href="/terms" className="transition hover:text-white">
                Terms
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
