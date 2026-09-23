importScripts("config.js");

const lastRequest = new Map();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll().then(() =>
    chrome.contextMenus.create({ id: "truthlens-check", title: 'Check with TruthLens AI: "%s"', contexts: ["selection"] }));
});

function config() {
  const value = globalThis.TRUTHLENS_CONFIG;
  if (!/^https:\/\/[^/]+\.supabase\.co$/.test(value.supabaseUrl) ||
      !value.supabaseAnonKey || value.supabaseAnonKey.startsWith("__")) {
    throw new Error("TruthLens is not connected yet. Install a configured release build.");
  }
  return value;
}

function validInput(input, inputType) {
  if (typeof input !== "string" || !input.trim() || input.length > 10000) {
    throw new Error("Enter 1 to 10,000 characters.");
  }
  if (inputType === "url") {
    const url = new URL(input);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("This page cannot be scanned. Open a public HTTP or HTTPS page.");
  }
}

async function analyze(input, inputType) {
  validInput(input, inputType);
  const { supabaseUrl, supabaseAnonKey } = config();
  const response = await fetch(`${supabaseUrl}/functions/v1/analyze`, {
    method: "POST",
    signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${supabaseAnonKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "single", input, inputType })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(typeof body.error === "string" ? body.error : `Scan failed (${response.status}).`);
    error.retryAfterSeconds = body.retryAfterSeconds;
    throw error;
  }
  const result = await response.json();
  if (!result || typeof result.id !== "string" || !Number.isFinite(result.credibilityScore) ||
      !Array.isArray(result.claims) || !Array.isArray(result.warnings)) {
    throw new Error("The analysis server returned an invalid result.");
  }
  try {
    const stored = await chrome.storage.local.get("recentScans");
    const history = Array.isArray(stored.recentScans) ? stored.recentScans : [];
    await chrome.storage.local.set({ recentScans: [result, ...history.filter(item => item.id !== result.id)].slice(0, 20) });
  } catch { /* Storage failure should not hide a successful scan. */ }
  return result;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "TRUTHLENS_ANALYZE") return;
  analyze(message.input, message.inputType)
    .then(result => sendResponse({ result }))
    .catch(error => sendResponse({ error: error.message, retryAfterSeconds: error.retryAfterSeconds }));
  return true;
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "truthlens-check" || !tab?.id || !info.selectionText) return;
  const requestId = crypto.randomUUID();
  lastRequest.set(tab.id, requestId);
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    await chrome.tabs.sendMessage(tab.id, { type: "TRUTHLENS_LOADING", requestId });
    const result = await analyze(info.selectionText, "text");
    if (lastRequest.get(tab.id) === requestId) {
      await chrome.tabs.sendMessage(tab.id, { type: "TRUTHLENS_RESULT", requestId, result });
    }
  } catch (error) {
    if (lastRequest.get(tab.id) === requestId) {
      try { await chrome.tabs.sendMessage(tab.id, { type: "TRUTHLENS_ERROR", requestId,
        message: error.message, retryAfterSeconds: error.retryAfterSeconds }); } catch { /* Restricted tab. */ }
    }
  } finally {
    if (lastRequest.get(tab.id) === requestId) lastRequest.delete(tab.id);
  }
});
