# TruthLens AI privacy summary

TruthLens AI sends the text selected for analysis and, when available, its
source URL to the configured Supabase analysis function. The function uses
Groq for text analysis and Google Gemini for backup and image analysis. The extension does not collect general
browsing history.

Analysis records are private by default. The configured Supabase project may
retain submitted text and analysis results according to its database retention
and access policies.

The extension stores only its configured Supabase anon key locally using the
browser's extension storage.
