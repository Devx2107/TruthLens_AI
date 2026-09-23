const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('supabase/functions/analyze/index.ts', 'utf8')
  .replace(/^import "jsr:[^\n]+\n/, '');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;

function server(fetchMock, secrets = {}, resolveDns = async (_host, type) => type === 'A' ? ['93.184.216.34'] : []) {
  let handler;
  const context = {
    Deno: { env: { get: key => secrets[key] }, serve: fn => { handler = fn; }, resolveDns },
    fetch: fetchMock, crypto: globalThis.crypto, Request, Response, URL,
    TextEncoder, TextDecoder, AbortController, AbortSignal, setTimeout, clearTimeout,
    console: { warn() {}, error() {} }
  };
  vm.runInNewContext(compiled, context);
  return payload => handler(new Request('https://project.supabase.co/functions/v1/analyze', {
    method: 'POST', headers: { 'x-real-ip': '203.0.113.4' }, body: JSON.stringify(payload)
  }));
}

const secrets = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'private-test-key' };
const okJson = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

test('cache hits receive fresh private scan identities without refetching', async () => {
  const cached = { id: 'old', input: 'A claim', inputType: 'text', sourceUrl: null,
    sourceTitle: null, sourceDescription: null, sourceExcerpt: 'A claim', credibilityScore: 60,
    confidence: 60, riskLevel: 'Medium', manipulationTechniques: [], claims: [],
    summary: 'Cached', explanation: 'Cached', warnings: [], engine: 'gemini',
    createdAt: '2020-01-01T00:00:00Z', fromCache: false };
  const calls = [];
  const handle = server(async url => {
    calls.push(String(url));
    if (String(url).includes('check_analysis_rate_limit')) return okJson({ allowed: true });
    if (String(url).includes('analysis_cache')) return okJson([{ payload: cached }]);
    throw new Error('Unexpected network call');
  }, secrets);
  const first = await (await handle({ input: 'A claim', inputType: 'text' })).json();
  const second = await (await handle({ input: 'A claim', inputType: 'text' })).json();
  assert.notEqual(first.id, cached.id);
  assert.notEqual(second.id, first.id);
  assert.equal(first.fromCache, true);
  assert.equal(calls.length, 4);
});

test('publication reports database failure and cannot claim success', async () => {
  const handle = server(async url => {
    if (String(url).includes('check_analysis_rate_limit')) return okJson({ allowed: true });
    return new Response('storage unavailable', { status: 503 });
  }, secrets);
  const response = await handle({ action: 'publish', scan: {
    id: 'private', input: 'A claim', inputType: 'text', credibilityScore: 50,
    riskLevel: 'Medium', engine: 'gemini', claims: [], warnings: [], summary: 'Summary',
    explanation: 'Explanation', createdAt: new Date().toISOString()
  } });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).ok, undefined);
});

test('publication inserts with a fresh public ID', async () => {
  const inserted = [];
  const handle = server(async (url, options) => {
    if (String(url).includes('check_analysis_rate_limit')) return okJson({ allowed: true });
    if (String(url).includes('scan_pages')) {
      inserted.push({ row: JSON.parse(options.body), prefer: options.headers.Prefer });
      return new Response(null, { status: 201 });
    }
    throw new Error('Unexpected network call');
  }, secrets);
  const scan = { id: 'private', input: 'A claim', inputType: 'text', credibilityScore: 50,
    riskLevel: 'Medium', engine: 'gemini', claims: [], warnings: [], summary: 'Summary',
    explanation: 'Explanation', createdAt: new Date().toISOString() };
  const first = await (await handle({ action: 'publish', scan })).json();
  const second = await (await handle({ action: 'publish', scan })).json();
  assert.equal(first.ok, true);
  assert.notEqual(first.scanId, scan.id);
  assert.notEqual(first.scanId, second.scanId);
  assert.equal(inserted[0].row.scan_id, first.scanId);
  assert.equal(inserted[0].prefer, 'return=minimal');
});

test('batch returns successes alongside indexed invalid URL failures', async () => {
  const handle = server(async url => {
    if (String(url).includes('check_analysis_rate_limit')) return okJson({ allowed: true });
    if (String(url).includes('analysis_cache')) return okJson([]);
    throw new Error('Unexpected network call');
  }, secrets);
  const response = await handle({ mode: 'batch', items: [
    { input: 'A claim', inputType: 'text' },
    { input: 'http://127.0.0.1/private', inputType: 'url' }
  ] });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.results.length, 1);
  assert.equal(body.errors[0].index, 1);
  assert.equal(body.results[0].engine, 'heuristic');
  assert.ok(body.results[0].warnings[0].includes('heuristic'));
});

test('rate limit rejects before cache or model work', async () => {
  const calls = [];
  const handle = server(async url => {
    calls.push(String(url));
    return okJson({ allowed: false, reset_at: new Date(Date.now() + 60000).toISOString() });
  }, secrets);
  const response = await handle({ input: 'A claim', inputType: 'text' });
  assert.equal(response.status, 429);
  assert.equal(calls.length, 1);
  assert.ok((await response.json()).retryAfterSeconds > 0);
});

test('URL scan rejects hostnames resolving to private addresses', async () => {
  const calls = [];
  const handle = server(async url => {
    calls.push(String(url));
    if (String(url).includes('check_analysis_rate_limit')) return okJson({ allowed: true });
    if (String(url).includes('analysis_cache')) return okJson([]);
    throw new Error('Private page must not be fetched');
  }, secrets, async (_host, type) => type === 'A' ? ['127.0.0.1'] : []);
  const response = await handle({ input: 'https://example.com/story', inputType: 'url' });
  assert.equal(response.status, 400);
  assert.equal(calls.length, 2);
});

test('invalid model output becomes a labeled fallback and is not cached', async () => {
  const calls = [];
  const handle = server(async url => {
    calls.push(String(url));
    if (String(url).includes('check_analysis_rate_limit')) return okJson({ allowed: true });
    if (String(url).includes('analysis_cache')) return okJson([]);
    if (String(url).includes('generativelanguage.googleapis.com')) {
      return okJson({ candidates: [{ content: { parts: [{ text: '{"summary":"incomplete"}' }] } }] });
    }
    throw new Error('Unexpected network call');
  }, { ...secrets, GEMINI_API_KEY: 'test-model-key' });
  const response = await handle({ input: 'A claim', inputType: 'text' });
  const result = await response.json();
  assert.equal(result.engine, 'heuristic');
  assert.ok(result.warnings[0].includes('heuristic'));
  assert.equal(calls.filter(url => url.includes('analysis_cache')).length, 1);
});
