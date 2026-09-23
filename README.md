# TruthLens AI

TruthLens is a full-stack misinformation analysis app. Paste a message, headline, or URL—or scan several inputs in batch mode—to get a credibility score, risk level, manipulation signals, claim-by-claim reasoning, and a shareable result page.

The app is decision support, not an authority: scores are model-assisted estimates and should be checked against the source and independent reporting.

## What it does

- Analyzes text and URLs with Google Gemini through a Supabase Edge Function.
- Fetches URL metadata and readable page excerpts before analysis.
- Adds a transparent domain reputation signal to URL results. This describes the publisher domain, not whether a specific article is true.
- Breaks longer inputs into individual claims with verdicts, confidence, rationale, and scores.
- Supports single scans and one-input-per-line batch scans.
- Saves scans locally, with optional Supabase Auth magic-link sign-in for synced history.
- Keeps scans private by default; `Share & copy link` explicitly publishes a `/scan/:id` page and copies its link.
- Uses a local heuristic fallback when Supabase/Gemini is not configured.
- Applies a server-side rate limit of 20 requests per five-minute scope window and shows a retry countdown in the UI.

## Stack

- React 18, TypeScript, Vite, Tailwind CSS, Lucide React
- Supabase Edge Functions, Postgres, Row Level Security, Supabase Auth
- Google Gemini API with structured JSON output

## Setup

```bash
npm install
```

Create a `.env` file with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Without these values, the app runs in local demo mode.

Then:

1. Apply `supabase/migrations/202606290001_truthlens.sql`.
2. Deploy `supabase/functions/analyze/index.ts` as the `analyze` Edge Function.
3. Add `GEMINI_API_KEY` as an Edge Function secret.
4. Optionally set `GEMINI_MODEL`; it defaults to `gemini-3.5-flash`.

Get a Gemini key from [Google AI Studio](https://aistudio.google.com/app/apikey). Keep it server-side; never put it in a `VITE_` variable.

Run the app and checks with:

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
```

The development server runs at `http://localhost:5173`.

## API

`POST /functions/v1/analyze`

Single input:

```json
{ "mode": "single", "input": "https://example.com/article", "inputType": "url" }
```

Batch input:

```json
{
  "mode": "batch",
  "items": [
    { "input": "A headline", "inputType": "text" },
    { "input": "https://example.com/article", "inputType": "url" }
  ]
}
```

Responses include `credibilityScore`, `confidence`, `riskLevel`, `claims`, `manipulationTechniques`, source metadata, and—when the input is a URL—`sourceCredibility`.

## Data and privacy

Local history stays in the browser. Signed-in history is stored per user in `analysis_history`. Scans are not written to public `scan_pages` during analysis; the explicit `Share & copy link` action publishes one result with `is_public = true`. Public share pages are readable only when `is_public = true`. The service role is used only for cache and explicit publication; client access is protected by RLS policies in the migrations.

## Project layout

```text
src/
  App.tsx                 Scanner, auth, history, batch mode, sharing
  components/             Result cards and credibility meter
  lib/analyze.ts          API client and local fallback
  lib/storage.ts          Browser persistence
  types.ts                Shared result/request types
supabase/
  functions/analyze/      URL fetching, reputation, Gemini, caching, rate limit
  migrations/             Tables, rate-limit RPC, and RLS policies
```

## Release preparation

TruthLens is distributed primarily as a Chromium extension with a companion web app. The toolbar popup scans pasted text or the current page; selected text can be scanned from the right-click menu. Extension results are stored only in the browser's local extension storage.

Apply both migrations in order: `202606290001_truthlens.sql`, then `202608230001_privacy_defaults.sql`. The second migration makes old public scan pages private, so existing public links stop resolving until shared again. Deploy the `analyze` Edge Function with `GEMINI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`; optionally set `GEMINI_MODEL`. Keep the Gemini and service-role keys server-side.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the web build. Deploy the static web build to Vercel; `vercel.json` rewrites direct `/scan/:id` visits to the app. Set the production site URL and allowed magic-link redirect origin in Supabase Auth.

Set the same public Supabase values and `TRUTHLENS_WEB_APP_URL=https://your-site.example` when running `npm run extension:build`. The script produces `dist/truthlens-extension.zip` and an unpacked directory. Install the latter locally through Chrome or Edge's **Load unpacked** to smoke-test popup, current-page, right-click, and web navigation flows. The configured ZIP can then be submitted through your own store account.

Batch requests accept 1–10 items and return `results` plus indexed `errors`; one failed item does not discard other results. Each input is limited to 10,000 characters. Sharing is explicit; `publish` returns a fresh public `scanId` only after the record is saved.

## License

MIT
