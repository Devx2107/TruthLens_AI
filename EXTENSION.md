# Testing the TruthLens browser extension

## Chrome or Edge

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the dedicated `TruthLens_AI\extension` folder. Do not select the repository root; keeping the extension isolated prevents local project files such as `.env` from becoming part of the extension.
5. Open the extension settings and save the Supabase anon/publishable key.
6. Highlight text on a webpage, right-click it, and choose **Check with TruthLens**. You can also open the popup and choose **Use headline** or **Use readable article**.

The extension calls the hosted `analyze` Edge Function. The current backend migration, secrets, and function must be deployed before the new Groq-first behavior is available.

## Troubleshooting

- After changing the manifest or background worker, click **Reload** on the extension card.
- Use the **service worker** link on `chrome://extensions` to inspect backend logs.
- Right-click the popup and select **Inspect** to view popup errors.
- Browser-internal pages such as `chrome://extensions` cannot be captured; test on a normal `http` or `https` page.
- A “manifest missing” error means the selected directory has no readable `manifest.json`; select `C:\Users\Vanda\OneDrive\Desktop\TruthLens_AI\extension`.
