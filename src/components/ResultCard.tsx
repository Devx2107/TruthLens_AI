import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Copy, ExternalLink, Info, Link2, ShieldCheck, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { AnalysisResult } from '../types';
import CredibilityMeter from './CredibilityMeter';
import { copyShareCardImage, downloadShareCardPng } from '../lib/share';

void React;

interface ResultCardProps {
  result: AnalysisResult;
  onCopyLink?: (result: AnalysisResult) => void;
  onNewScan?: () => void;
  onRefresh?: () => void;
  onFeedback?: (rating: 'up' | 'down') => void;
}

function scoreTone(riskLevel: AnalysisResult['riskLevel']) {
  if (riskLevel === 'Low') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (riskLevel === 'Medium') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
}

function verdictTone(verdict: AnalysisResult['claims'][number]['verdict']) {
  if (verdict === 'Likely true') return 'text-emerald-400';
  if (verdict === 'Mixed') return 'text-amber-400';
  return 'text-rose-400';
}

function riskIcon(riskLevel: AnalysisResult['riskLevel']) {
  if (riskLevel === 'Low') return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
  if (riskLevel === 'Medium') return <AlertTriangle className="h-5 w-5 text-amber-400" />;
  return <AlertCircle className="h-5 w-5 text-rose-400" />;
}

export default function ResultCard({ result, onCopyLink, onNewScan, onRefresh, onFeedback }: ResultCardProps) {
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  return (
    <article className="glass-panel overflow-hidden rounded-[2rem] p-5 sm:p-6 shadow-[0_20px_80px_rgba(15,23,42,0.18)] animate-reveal-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${scoreTone(result.riskLevel)}`}>
              {riskIcon(result.riskLevel)}
              {result.riskLevel} risk
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/5 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-white/5 dark:text-slate-300">
              <Sparkles className="h-3.5 w-3.5" />
              {result.engine === 'gemini' ? 'Gemini analysis' : result.engine === 'groq' ? 'Groq backup model' : 'Limited local analysis'}
            </span>
            {result.fromCache && (
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                Cached result from {Math.max(0, Math.floor((Date.now() - +new Date(result.createdAt)) / 86400000))} days ago
              </span>
            )}
          </div>

          <h3 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            {result.sourceTitle || result.input}
          </h3>
          <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {result.sourceDescription || result.summary}
          </p>
          {result.engine === 'groq' && <p className="rounded-2xl border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-xs font-semibold text-violet-100">Backup model used because Gemini was unavailable. Verify important claims independently.</p>}
          {result.engine === 'heuristic' && <p className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-100">Limited local analysis — AI services were unavailable. This result is lower confidence; verify the claims independently.</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void downloadShareCardPng(result)}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:-translate-y-0.5 hover:bg-white/15 dark:text-white"
          >
            <ShieldCheck className="h-4 w-4" />
            Download PNG
          </button>
          <button type="button" onClick={() => void copyShareCardImage(result)} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Copy className="h-4 w-4" /> Copy share image
          </button>
          {result.fromCache && onRefresh && <button type="button" onClick={onRefresh} className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100">Rescan fresh</button>}
          {onNewScan && <button type="button" onClick={onNewScan} className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-900 dark:text-white">New scan</button>}
          {onCopyLink && (
            <button
              type="button"
              onClick={() => onCopyLink(result)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:-translate-y-0.5 hover:bg-white/15 dark:text-white"
            >
              <Link2 className="h-4 w-4" />
              Copy link
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <CredibilityMeter score={result.credibilityScore} confidence={result.confidence} riskLevel={result.riskLevel} />

          <section className="rounded-3xl border border-white/10 bg-slate-950/5 p-4 dark:bg-white/5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <Info className="h-4 w-4" />
              Summary
            </div>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{result.summary}</p>
          </section>

          {result.sourceCredibility && (
            <section className="rounded-3xl border border-cyan-400/20 bg-cyan-400/5 p-4 dark:bg-cyan-400/10">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Publisher signal</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{result.sourceCredibility.domain}</p></div>
                <span className="text-xl font-black text-cyan-200">{result.sourceCredibility.score}/100</span>
              </div>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{result.sourceCredibility.tier ?? result.sourceCredibility.label ?? 'Limited signal'} source tier. This describes publisher signals, not whether every claim is true.</p>
              {result.sourceCredibility.signals?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">{result.sourceCredibility.signals.map((signal) => <span key={signal} className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-500 dark:text-slate-300">{signal}</span>)}</div>
              ) : null}
            </section>
          )}

          <section className="rounded-3xl border border-white/10 bg-slate-950/5 p-4 dark:bg-white/5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <Sparkles className="h-4 w-4" />
              Manipulation techniques
            </div>
            <div className="flex flex-wrap gap-2">
              {result.manipulationTechniques.length > 0 ? (
                result.manipulationTechniques.map((technique, index) => (
                  <span
                    key={`${technique}-${index}`}
                    className="animate-pop-in rounded-full border border-white/10 bg-slate-950/5 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-white/5 dark:text-slate-200"
                    style={{ animationDelay: `${index * 90}ms` }}
                  >
                    {technique}
                  </span>
                ))
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">No obvious manipulation signals showed up in this scan.</p>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-3xl border border-white/10 bg-slate-950/5 p-4 dark:bg-white/5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <ShieldCheck className="h-4 w-4" />
              Source details
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">Input type</dt>
                <dd className="font-medium text-slate-700 dark:text-slate-200">{result.inputType === 'url' ? 'URL' : result.inputType === 'image' ? 'Image' : 'Text'}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">Source</dt>
                <dd className="max-w-[14rem] truncate font-medium text-slate-700 dark:text-slate-200">
                  {result.sourceTitle || result.sourceUrl || 'Local demo'}
                </dd>
              </div>
              {result.sourceCredibility && (
                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">Publisher signal</dt>
                    <dd className="font-semibold text-cyan-700 dark:text-cyan-200">{result.sourceCredibility.label ?? result.sourceCredibility.tier ?? 'Limited signal'}</dd>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {result.sourceCredibility.domain} · {result.sourceCredibility.score}/100. {result.sourceCredibility.rationale ?? result.sourceCredibility.signals?.join(', ') ?? 'No additional publisher context available.'}
                  </p>
                </div>
              )}
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">Scanned</dt>
                <dd className="font-medium text-slate-700 dark:text-slate-200">
                  {new Date(result.createdAt).toLocaleString()}
                </dd>
              </div>
            </dl>
          </section>

          {result.claims.length > 0 && (
            <section className="rounded-3xl border border-white/10 bg-slate-950/5 p-4 dark:bg-white/5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <Sparkles className="h-4 w-4" />
                Claim breakdown
              </div>
              <div className="space-y-3">
                {result.claims.map((claim, index) => (
                  <div
                    key={`${claim.claim}-${index}`}
                    className="animate-pop-in rounded-2xl border border-white/10 bg-white/40 p-3 dark:bg-slate-900/60"
                    style={{ animationDelay: `${index * 110}ms` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{claim.claim}</p>
                      <span className={`text-xs font-semibold ${verdictTone(claim.verdict)}`}>{claim.verdict}</span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{claim.rationale}</p>
                    {claim.evidence && claim.evidence.length > 0 && <div className="mt-3 space-y-1.5"><p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300">Related reporting</p>{claim.evidence.map((item) => <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="flex items-start gap-1.5 text-xs text-cyan-300 hover:text-cyan-100"><ExternalLink className="mt-0.5 h-3 w-3 shrink-0" /><span>{item.title}{item.publisher ? ` · ${item.publisher}` : ''}</span></a>)}</div>}
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-400 transition-all duration-700"
                        style={{ width: `${claim.score}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-slate-400">
                      <span>{claim.score}/100</span>
                      <span>{claim.confidence}% confidence</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {result.warnings.length > 0 && (
            <section className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-50">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4" />
                Notes
              </div>
              <ul className="space-y-2 text-sm text-amber-50/90">
                {result.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`} className="flex gap-2">
                    <span className="mt-1 text-amber-300">•</span>
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-3xl border border-white/10 bg-slate-950/5 p-4 dark:bg-white/5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <Info className="h-4 w-4" />
              Full explanation
            </div>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{result.explanation}</p>
          </section>
          {onFeedback && <section className="flex items-center justify-between rounded-3xl border border-white/10 bg-slate-950/5 p-4 dark:bg-white/5"><p className="text-sm text-slate-600 dark:text-slate-300">Was this verdict useful?</p><div className="flex gap-2"><button type="button" disabled={Boolean(feedback)} onClick={() => { setFeedback('up'); onFeedback('up'); }} className={`rounded-full border p-2 ${feedback === 'up' ? 'border-emerald-400 text-emerald-300' : 'border-white/10 text-slate-400'}`} aria-label="Agree with verdict"><ThumbsUp className="h-4 w-4" /></button><button type="button" disabled={Boolean(feedback)} onClick={() => { setFeedback('down'); onFeedback('down'); }} className={`rounded-full border p-2 ${feedback === 'down' ? 'border-rose-400 text-rose-300' : 'border-white/10 text-slate-400'}`} aria-label="Disagree with verdict"><ThumbsDown className="h-4 w-4" /></button></div></section>}
        </div>
      </div>
    </article>
  );
}
