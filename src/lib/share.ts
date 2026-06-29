import type { AnalysisResult } from '../types';

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapLines(text: string, max = 60, limit = 5) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      lines.push(current);
      current = word;
      if (lines.length >= limit - 1) break;
    } else {
      current = next;
    }
  }

  if (current && lines.length < limit) {
    lines.push(current);
  }

  return lines;
}

export function createShareSvg(result: AnalysisResult) {
  const scoreColor = result.riskLevel === 'Low' ? '#22c55e' : result.riskLevel === 'Medium' ? '#eab308' : '#ef4444';
  const sourceLabel = result.sourceTitle || result.sourceUrl || 'TruthLens AI';
  const summaryLines = wrapLines(result.summary || result.explanation || 'Analysis ready', 56, 4);
  const explanationLines = wrapLines(result.explanation || '', 60, 4);

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="#07111f" />
        <stop offset="100%" stop-color="#132239" />
      </linearGradient>
      <linearGradient id="accent" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stop-color="${scoreColor}" />
        <stop offset="100%" stop-color="#38bdf8" />
      </linearGradient>
    </defs>
    <rect width="1200" height="630" rx="40" fill="url(#bg)" />
    <circle cx="1020" cy="90" r="170" fill="${scoreColor}" fill-opacity="0.12" />
    <circle cx="130" cy="560" r="200" fill="#38bdf8" fill-opacity="0.08" />

    <text x="80" y="110" fill="#f8fafc" font-size="44" font-family="Inter, system-ui, sans-serif" font-weight="700">TruthLens AI</text>
    <text x="80" y="160" fill="#cbd5e1" font-size="24" font-family="Inter, system-ui, sans-serif">Credibility scan</text>

    <rect x="80" y="200" width="240" height="220" rx="28" fill="#0f172a" fill-opacity="0.88" stroke="#1f2a44" stroke-width="2" />
    <text x="120" y="255" fill="#94a3b8" font-size="22" font-family="Inter, system-ui, sans-serif">Credibility</text>
    <text x="120" y="332" fill="${scoreColor}" font-size="92" font-family="Inter, system-ui, sans-serif" font-weight="800">${result.credibilityScore}</text>
    <text x="120" y="374" fill="#f8fafc" font-size="26" font-family="Inter, system-ui, sans-serif" font-weight="600">/${100}</text>
    <text x="120" y="410" fill="#cbd5e1" font-size="22" font-family="Inter, system-ui, sans-serif">${result.riskLevel} risk</text>

    <rect x="360" y="200" width="760" height="220" rx="28" fill="#0f172a" fill-opacity="0.88" stroke="#1f2a44" stroke-width="2" />
    <text x="400" y="255" fill="#94a3b8" font-size="22" font-family="Inter, system-ui, sans-serif">Headline / source</text>
    <text x="400" y="302" fill="#f8fafc" font-size="34" font-family="Inter, system-ui, sans-serif" font-weight="700">${escapeXml(sourceLabel).slice(0, 78)}</text>
    ${summaryLines
      .map(
        (line, index) =>
          `<text x="400" y="${350 + index * 30}" fill="#cbd5e1" font-size="22" font-family="Inter, system-ui, sans-serif">${escapeXml(
            line,
          )}</text>`,
      )
      .join('')}

    <rect x="80" y="460" width="1040" height="110" rx="24" fill="#0f172a" fill-opacity="0.78" stroke="#1f2a44" stroke-width="2" />
    <text x="110" y="502" fill="#94a3b8" font-size="20" font-family="Inter, system-ui, sans-serif">Explanation</text>
    ${explanationLines
      .map(
        (line, index) =>
          `<text x="110" y="${532 + index * 24}" fill="#e2e8f0" font-size="20" font-family="Inter, system-ui, sans-serif">${escapeXml(
            line,
          )}</text>`,
      )
      .join('')}

    <rect x="860" y="76" width="190" height="56" rx="28" fill="url(#accent)" />
    <text x="955" y="112" text-anchor="middle" fill="#020617" font-size="22" font-family="Inter, system-ui, sans-serif" font-weight="700">TruthLens says</text>
  </svg>`;
}

export function downloadShareCard(result: AnalysisResult) {
  const svg = createShareSvg(result);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `truthlens-${result.id}.svg`;
  anchor.click();
  URL.revokeObjectURL(url);
}

