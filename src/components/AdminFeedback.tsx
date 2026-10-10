import { useEffect, useState } from 'react';
import type { FeedbackItem } from '../types';
import { loadFeedbackQueue, updateFeedbackStatus } from '../lib/features';

export default function AdminFeedback({ enabled }: { enabled: boolean }) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (enabled) void loadFeedbackQueue().then(setItems).catch((value: Error) => setError(value.message)); }, [enabled]);
  if (!enabled) return null;
  return <section className="glass-panel rounded-2xl p-5 sm:p-6"><h2 className="font-editorial text-2xl font-bold text-slate-900 dark:text-white">Admin feedback queue</h2><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Only users with <code>app_metadata.role = admin</code> can access this queue.</p>{error && <p className="mt-3 text-sm text-rose-600">{error}</p>}<div className="mt-4 space-y-3">{items.map((item) => <div key={item.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-900 dark:text-white">{item.rating === 'down' ? 'Disputed verdict' : 'Helpful verdict'} · {item.scanId}</p><select value={item.status} onChange={(event) => { const status = event.target.value as FeedbackItem['status']; void updateFeedbackStatus(item.id, status).then(() => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status } : entry))).catch((value: Error) => setError(value.message)); }} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="open">Open</option><option value="reviewed">Reviewed</option><option value="corrected">Corrected</option></select></div>{item.comment && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.comment}</p>}</div>)}</div></section>;
}
