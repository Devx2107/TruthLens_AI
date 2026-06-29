import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Link2, ShieldCheck, Sparkles } from 'lucide-react';
import type { AnalysisResult } from '../types';
import CredibilityMeter from './CredibilityMeter';
import { downloadShareCard } from '../lib/share';

void React;

interface ResultCardProps {
  result: AnalysisResult;
  onCopyLink?: (result: AnalysisResult) => void;
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

export default function ResultCard({ result, onCopyLink }: ResultCardProps) {
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
              {result.engine === 'gemini' ? 'Gemini analysis' : 'Demo fallback'}
            </span>
            {result.fromCache && (
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                Cached
              </span>
            )}
          </div>

          <h3 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            {result.sourceTitle || result.input}
          </h3>
          <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {result.sourceDescription || result.summary}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadShareCard(result)}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:-translate-y-0.5 hover:bg-white/15 dark:text-white"
          >
            <ShieldCheck className="h-4 w-4" />
            Download card
          </button>
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
                <dd className="font-medium text-slate-700 dark:text-slate-200">{result.inputType === 'url' ? 'URL' : 'Text'}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">Source</dt>
                <dd className="max-w-[14rem] truncate font-medium text-slate-700 dark:text-slate-200">
                  {result.sourceTitle || result.sourceUrl || 'Local demo'}
                </dd>
              </div>
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
        </div>
      </div>
    </article>
  );
}
