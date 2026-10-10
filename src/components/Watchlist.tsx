import { useEffect, useState } from 'react';
import { Bell, RefreshCw, Trash2 } from 'lucide-react';
import type { WatchlistItem } from '../types';
import { loadWatchlist, refreshWatchlistClaim, removeWatchlistClaim } from '../lib/features';

export default function Watchlist({ enabled, refreshToken = 0 }: { enabled: boolean; refreshToken?: number }) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) { setItems([]); return; }
    void loadWatchlist().then(setItems).catch((error: Error) => setMessage(error.message));
  }, [enabled, refreshToken]);

  const recheck = (item: WatchlistItem) => {
    const previous = item.latestResult;
    setBusy(item.id);
    setMessage(null);
    void refreshWatchlistClaim(item).then((updated) => {
      setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry));
      const changed = previous && updated.latestResult && (previous.riskLevel !== updated.latestResult.riskLevel || previous.credibilityScore !== updated.latestResult.credibilityScore);
      setMessage(changed ? `Update found: ${previous.credibilityScore}/100 ${previous.riskLevel} → ${updated.latestResult!.credibilityScore}/100 ${updated.latestResult!.riskLevel}.` : 'Recheck complete; no score or risk change found.');
    }).catch((error: Error) => setMessage(error.message)).finally(() => setBusy(null));
  };

  if (!enabled) return null;
  return <section className="glass-panel rounded-2xl p-5 sm:p-6"><div className="flex items-center gap-2"><Bell className="h-5 w-5 text-teal-700 dark:text-teal-300" /><h2 className="font-editorial text-2xl font-bold text-slate-900 dark:text-white">Claim watchlist</h2></div><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Recheck saved claims to see whether the verdict or evidence has changed.</p>{message && <p className="mt-3 text-sm text-amber-600 dark:text-amber-200">{message}</p>}<div className="mt-4 space-y-3">{items.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-white/10">No watched claims yet. Open a scan and choose Watch claim to add one.</p> : items.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><p className="font-medium text-slate-900 dark:text-white">{item.query}</p>{item.latestResult && <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">Latest: {item.latestResult.credibilityScore}/100 · {item.latestResult.riskLevel} risk</p>}<div className="mt-3 flex gap-2"><button disabled={busy === item.id} onClick={() => recheck(item)} className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 px-3 py-2 text-xs font-semibold text-teal-700 dark:text-teal-300"><RefreshCw className={`h-3.5 w-3.5 ${busy === item.id ? 'animate-spin' : ''}`} />Recheck</button><button onClick={() => void removeWatchlistClaim(item.id).then(() => setItems((current) => current.filter((entry) => entry.id !== item.id))).catch((error: Error) => setMessage(error.message))} className="inline-flex items-center gap-2 rounded-full border border-rose-400/30 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-200"><Trash2 className="h-3.5 w-3.5" />Remove</button></div></div>)}</div></section>;
}
