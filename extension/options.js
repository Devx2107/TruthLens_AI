const keyInput = document.querySelector('#key');
const status = document.querySelector('#status');
const saveButton = document.querySelector('#save');

chrome.storage.sync.get(['anonKey'], ({ anonKey }) => {
  keyInput.value = anonKey || '';
});

saveButton.onclick = () => {
  const anonKey = keyInput.value.trim();
  if (!anonKey) {
    status.textContent = 'Enter the Supabase anon key first.';
    return;
  }
  chrome.storage.sync.set({ anonKey }, () => {
    status.textContent = chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Saved. The extension is ready to test.';
  });
};
