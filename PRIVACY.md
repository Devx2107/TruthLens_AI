# TruthLens AI privacy summary

TruthLens AI sends the text selected or captured for analysis and, when available, its
source URL to the configured Supabase analysis function. The function uses
Groq for text analysis and Google Gemini for backup and image analysis. The extension does not collect general
browsing history.

Signed-in users may save claim watchlists. Feedback comments and scan revisions
may be retained so administrators can review disputed results and show how a
rescanned verdict changed.

Analysis records are private by default. The configured Supabase project may
retain submitted text and analysis results according to its database retention
and access policies.

The extension stores only its configured Supabase anon key locally using the
browser's extension storage.
