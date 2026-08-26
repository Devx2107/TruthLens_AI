import { ArrowLeft, Shield } from 'lucide-react';

export default function PolicyPage({ title, content, onBack }: { title: string; content: string[]; onBack: () => void }) {
  return <section className="glass-panel rounded-[2rem] p-6 sm:p-10">
    <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"><ArrowLeft className="h-4 w-4" /> Back to scanner</button>
    <div className="mt-8 flex items-center gap-3"><Shield className="h-8 w-8 text-cyan-400" /><h2 className="text-3xl font-black text-slate-950 dark:text-white">{title}</h2></div>
    <div className="mt-6 max-w-3xl space-y-5 text-sm leading-7 text-slate-600 dark:text-slate-300">{content.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
  </section>;
}
