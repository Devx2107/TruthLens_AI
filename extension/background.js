const FUNCTION_URL = 'https://mwmjlaaiqogvjjgqlnwd.supabase.co/functions/v1/analyze';
chrome.runtime.onInstalled.addListener(() => chrome.contextMenus.create({ id: 'truthlens-check', title: 'Check with TruthLens', contexts: ['selection'] }));
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== 'truthlens-check') return;
  await chrome.storage.sync.set({ pendingText: info.selectionText || '' });
  chrome.action.openPopup().catch(() => undefined);
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'analyze') return;
  chrome.storage.sync.get(['anonKey'], async ({ anonKey }) => {
    try {
      const response = await fetch(FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey || ''}` }, body: JSON.stringify({ input: message.text, inputType: 'text' }) });
      sendResponse(await response.json());
    } catch (error) { sendResponse({ error: String(error) }); }
  });
  return true;
});
