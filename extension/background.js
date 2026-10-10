const FUNCTION_URL = 'https://mwmjlaaiqogvjjgqlnwd.supabase.co/functions/v1/analyze';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'truthlens-check', title: 'Check with TruthLens', contexts: ['selection'] });
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== 'truthlens-check') return;
  const selectedText = String(info.selectionText || '').trim().slice(0, 20_000);
  await chrome.storage.sync.set({ pendingText: selectedText });
  try { await chrome.action.openPopup(); } catch { /* The user can open the toolbar popup manually. */ }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'capture-page') {
    chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
      if (!tab?.id) { sendResponse({ error: 'No active webpage found.' }); return; }
      try {
        const [capture] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          args: [message.mode],
          func: (mode) => {
            const headline = document.querySelector('h1')?.textContent?.trim() || document.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() || document.title;
            if (mode === 'headline') return headline.slice(0, 20_000);
            const root = document.querySelector('article') || document.querySelector('main') || document.body;
            return [headline, root?.innerText || ''].filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 20_000);
          },
        });
        const text = String(capture?.result || '').trim();
        if (!text) throw new Error('No readable text was found on this page.');
        await chrome.storage.sync.set({ pendingText: text });
        sendResponse({ text });
      } catch (error) { sendResponse({ error: error instanceof Error ? error.message : 'This browser page cannot be scanned.' }); }
    });
    return true;
  }

  if (message?.type !== 'analyze') return false;

  chrome.storage.sync.get(['anonKey'], async ({ anonKey }) => {
    if (!anonKey) {
      sendResponse({ error: 'Open extension settings and add your Supabase anon key first.' });
      return;
    }

    try {
      const response = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ input: String(message.text || '').trim().slice(0, 20_000), inputType: 'text' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Analysis failed (${response.status})`);
      sendResponse(payload);
    } catch (error) {
      sendResponse({ error: error instanceof Error ? error.message : 'Unable to reach TruthLens.' });
    }
  });

  return true;
});
