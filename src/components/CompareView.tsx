import type { AnalysisResult } from '../types';
import CredibilityMeter from './CredibilityMeter';

function evidenceStats(result: AnalysisResult) {
  const evidence = result.claims.flatMap((claim) => claim.evidence ?? []);
  return { total: evidence.length, factChecks: evidence.filter((item) => item.kind === 'fact-check').length, publishers: new Set(evidence.map((item) => item.publisher).filter(Boolean)).size };
}

export default function CompareView({ left, right }: { left: AnalysisResult; right: AnalysisResult }) {
  const claims = Array.from(new Set([...left.claims.map((item) => item.claim), ...right.claims.map((item) => item.claim)])).slice(0, 8);
  const leftStats = evidenceStats(left);
  const rightStats = evidenceStats(right);
  const card = (result: AnalysisResult, stats: ReturnType<typeof evidenceStats>) => (
    <div className={`rounded-3xl border p-4 ${result.credibilityScore >= Math.max(left.credibilityScore, right.credibilityScore) ? 'border-emerald-400/50' : 'border-slate-200 dark:border-white/10'} bg-slate-50 dark:bg-white/5`}>
      <h3 className="line-clamp-2 font-editorial text-xl font-bold text-slate-900 dark:text-white">{result.sourceTitle || result.input}</h3>
      <p className="mt-1 truncate text-xs text-slate-500">{result.sourceCredibility?.domain || result.sourceUrl || 'Submitted text'}</p>
      <div className="mt-4"><CredibilityMeter score={result.credibilityScore} confidence={result.confidence} riskLevel={result.riskLevel} /></div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-teal-50 dark:bg-teal-900/30 p-2"><strong className="block text-base">{stats.factChecks}</strong>Fact checks</div><div className="rounded-xl bg-teal-50 dark:bg-teal-900/30 p-2"><strong className="block text-base">{stats.total}</strong>Evidence</div><div className="rounded-xl bg-teal-50 dark:bg-teal-900/30 p-2"><strong className="block text-base">{stats.publishers}</strong>Publishers</div></div>
      <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">{result.summary}</p>
    </div>
  );
  return <section className="glass-panel rounded-2xl p-5 sm:p-6"><div className="mb-4 rounded-2xl border border-teal-300 bg-teal-50 dark:border-teal-800 dark:bg-teal-900/30 p-3 text-sm text-slate-600 dark:text-slate-300">Score difference: <strong>{Math.abs(left.credibilityScore - right.credibilityScore)} points</strong>. Evidence counts show coverage, not proof by themselves.</div><div className="grid gap-4 md:grid-cols-2">{card(left, leftStats)}{card(right, rightStats)}</div><div className="mt-5 overflow-x-auto rounded-3xl border border-slate-200 dark:border-white/10"><div className="min-w-[36rem]"><div className="grid grid-cols-[1fr_7rem_7rem] bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:bg-white/10 dark:text-slate-400"><span>Claim</span><span>Left</span><span>Right</span></div>{claims.map((claim) => <div key={claim} className="grid grid-cols-[1fr_7rem_7rem] border-t border-slate-200 px-4 py-3 text-sm text-slate-700 dark:border-white/10 dark:text-slate-300"><span>{claim}</span><span>{left.claims.find((item) => item.claim === claim)?.verdict ?? '—'}</span><span>{right.claims.find((item) => item.claim === claim)?.verdict ?? '—'}</span></div>)}</div></div></section>;
}
