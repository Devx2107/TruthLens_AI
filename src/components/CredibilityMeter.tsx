import React from 'react';

interface CredibilityMeterProps {
  score: number;
  confidence: number;
  riskLevel: 'Low' | 'Medium' | 'High';
}

export default function CredibilityMeter({ score, confidence, riskLevel }: CredibilityMeterProps) {
  void React;
  const scoreColor =
    riskLevel === 'Low' ? 'from-emerald-400 to-emerald-500' : riskLevel === 'Medium' ? 'from-amber-400 to-amber-500' : 'from-rose-400 to-rose-500';

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Credibility score</p>
          <p className="mt-1 text-4xl font-black text-slate-950 dark:text-white">{score}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Confidence</p>
          <p className="mt-1 text-xl font-semibold text-slate-700 dark:text-slate-200">{confidence}%</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="h-4 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${scoreColor} transition-all duration-700 ease-out`}
            style={{ width: `${score}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Low trust</span>
          <span>High trust</span>
        </div>
      </div>
    </div>
  );
}
