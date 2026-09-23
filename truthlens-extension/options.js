const urlInput = document.getElementById("url");
const keyInput = document.getElementById("key");
const status = document.getElementById("status");

chrome.storage.sync.get(["supabaseUrl", "supabaseAnonKey"], (stored) => {
  if (stored.supabaseUrl) urlInput.value = stored.supabaseUrl;
  if (stored.supabaseAnonKey) keyInput.value = stored.supabaseAnonKey;
});

document.getElementById("save").addEventListener("click", () => {
  chrome.storage.sync.set(
    {
      supabaseUrl: urlInput.value.trim(),
      supabaseAnonKey: keyInput.value.trim(),
    },
    () => {
      status.textContent = "Saved.";
      setTimeout(() => (status.textContent = ""), 1500);
    },
  );
});
