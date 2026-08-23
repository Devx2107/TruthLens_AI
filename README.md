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
- Publishes shareable `/scan/:id` pages and downloadable result cards.
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

Local history stays in the browser. Signed-in history is stored per user in `analysis_history`. Public share pages are readable only when `is_public = true`. The service role is used by the Edge Function for cache and server-created records; client access is protected by RLS policies in the migration.

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

## License

MIT
