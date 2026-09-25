const status = document.querySelector('#status');
const result = document.querySelector('#result');
const checkButton = document.querySelector('#check');
const headlineButton = document.querySelector('#headline');
const articleButton = document.querySelector('#article');
let selectedText = '';

chrome.storage.sync.get(['pendingText'], ({ pendingText }) => {
  selectedText = typeof pendingText === 'string' ? pendingText.trim() : '';
  status.textContent = selectedText || 'Select text on a webpage, right-click it, and choose Check with TruthLens.';
  checkButton.disabled = !selectedText;
});

async function capturePage(mode) {
  result.textContent = '';
  status.textContent = mode === 'headline' ? 'Reading headline…' : 'Reading article…';
  const response = await chrome.runtime.sendMessage({ type: 'capture-page', mode });
  if (response?.error) { result.textContent = response.error; status.textContent = 'Unable to capture this page.'; return; }
  selectedText = String(response?.text || '').trim();
  status.textContent = selectedText;
  checkButton.disabled = !selectedText;
}

headlineButton.onclick = () => void capturePage('headline');
articleButton.onclick = () => void capturePage('article');

checkButton.onclick = async () => {
  if (!selectedText) return;
  checkButton.disabled = true;
  status.textContent = 'Analyzing…';
  result.textContent = '';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'analyze', text: selectedText });
    result.textContent = response?.error || `${response?.credibilityScore ?? '—'}/100 — ${response?.riskLevel || 'Unknown'}\n${response?.summary || ''}`;
  } catch (error) {
    result.textContent = error instanceof Error ? error.message : 'Unable to analyze the selected text.';
  } finally {
    status.textContent = selectedText;
    checkButton.disabled = false;
  }
};
