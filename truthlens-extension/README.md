# TruthLens browser extension

The toolbar popup scans pasted text, links, and the current HTTP(S) webpage. Select text on a page and use **Check with TruthLens AI** in the right-click menu for an in-page result. The popup links to the companion web app.

Production users install the configured ZIP created by `npm run extension:build`. The source folder contains configuration placeholders and cannot contact a backend directly. Recent extension results stay in `chrome.storage.local`; web account history is separate.

The build accepts `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `TRUTHLENS_WEB_APP_URL`. These are public release settings. Never package a service-role key or Gemini key. The URL must use `https://<project>.supabase.co` to match the extension host permission.

For local testing, set those environment variables, run the build, then load `dist/truthlens-extension` through Chrome or Edge's **Load unpacked** option. Restricted browser pages cannot be scanned. The popup explains this when **Scan current page** is selected.
