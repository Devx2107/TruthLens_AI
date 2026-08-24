const status = document.querySelector('#status');
const result = document.querySelector('#result');
let selectedText = '';

chrome.storage.sync.get(['pendingText'], ({ pendingText }) => {
  selectedText = typeof pendingText === 'string' ? pendingText.trim() : '';
  if (selectedText) status.textContent = selectedText;
});

document.querySelector('#check').onclick = async () => {
  if (!selectedText) return;
  status.textContent = 'Analyzing...';
  result.textContent = '';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'analyze', text: selectedText });
    result.textContent = response?.error || `${response?.credibilityScore ?? '—'}/100 — ${response?.riskLevel || 'Unknown'}\n${response?.summary || ''}`;
  } catch (error) {
    result.textContent = error instanceof Error ? error.message : 'Unable to analyze the selected text.';
  } finally {
    status.textContent = selectedText;
  }
};
