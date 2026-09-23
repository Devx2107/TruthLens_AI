const input = document.getElementById("input");
const status = document.getElementById("status");
const resultNode = document.getElementById("result");
const scanButton = document.getElementById("scan");
const pageButton = document.getElementById("page");
let generation = 0;
let countdownTimer;

function item(tag, value, className) {
  const node = document.createElement(tag);
  node.textContent = String(value ?? "");
  if (className) node.className = className;
  return node;
}

function render(result) {
  resultNode.replaceChildren();
  resultNode.hidden = false;
  resultNode.appendChild(item("h2", `${result.credibilityScore}/100`));
  resultNode.appendChild(item("p", `${result.riskLevel} risk`, String(result.riskLevel).toLowerCase()));
  resultNode.appendChild(item("p", result.summary));
  if (result.engine === "heuristic") resultNode.appendChild(item("p", "Heuristic estimate", "note"));
  for (const warning of result.warnings ?? []) resultNode.appendChild(item("p", warning, "note"));
  if (result.claims?.length) {
    const list = document.createElement("ul");
    for (const claim of result.claims) list.appendChild(item("li", `${claim.claim} — ${claim.score}/100. ${claim.rationale}`));
    resultNode.appendChild(list);
  }
}

async function scan(value, inputType) {
  const current = ++generation;
  clearInterval(countdownTimer);
  scanButton.disabled = pageButton.disabled = true;
  status.textContent = "Scanning…";
  resultNode.hidden = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "TRUTHLENS_ANALYZE", input: value, inputType });
    if (current !== generation) return;
    if (!response || response.error) {
      status.textContent = response?.error || "The extension could not reach its background worker.";
      if (response?.retryAfterSeconds > 0) {
        let seconds = response.retryAfterSeconds;
        countdownTimer = setInterval(() => {
          status.textContent = seconds > 0 ? `${response.error} Try again in ${seconds--}s.` : "You can try again now.";
          if (seconds < 0) clearInterval(countdownTimer);
        }, 1000);
      }
    } else {
      status.textContent = "";
      render(response.result);
    }
  } catch (error) {
    if (current === generation) status.textContent = error.message;
  } finally {
    if (current === generation) scanButton.disabled = pageButton.disabled = false;
  }
}

scanButton.addEventListener("click", () => {
  const value = input.value.trim();
  scan(/^www\./i.test(value) ? `https://${value}` : value,
    /^(https?:\/\/|www\.)/i.test(value) ? "url" : "text");
});
pageButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:\/\//i.test(tab.url)) {
    status.textContent = "This page cannot be scanned. Open a public HTTP or HTTPS webpage.";
    return;
  }
  scan(tab.url, "url");
});
document.getElementById("web").addEventListener("click", () => {
  const url = globalThis.TRUTHLENS_CONFIG.webAppUrl;
  if (!/^https:\/\//i.test(url)) { status.textContent = "The companion website is not configured yet."; return; }
  chrome.tabs.create({ url });
});
