(() => {
  if (globalThis.truthLensOverlayInstalled) return;
  globalThis.truthLensOverlayInstalled = true;
  let activeRequest = null;
  let timer = null;
  const host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;top:20px;right:20px;z-index:2147483647";
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `*{box-sizing:border-box} .card{width:min(340px,calc(100vw - 40px));max-height:80vh;overflow:auto;background:#0b1324;color:#e2e8f0;border:1px solid #334155;border-radius:16px;box-shadow:0 20px 60px #0008;font:13px/1.5 system-ui,sans-serif}header{display:flex;align-items:center;justify-content:space-between;padding:12px 15px;border-bottom:1px solid #334155;color:#22d3ee;font-weight:700}button{border:0;background:none;color:#cbd5e1;cursor:pointer;font-size:20px}main{padding:15px}h2{margin:0 0 8px;font-size:28px;color:white}p{margin:7px 0;overflow-wrap:anywhere}ul{padding-left:18px}li{margin:6px 0}.low{color:#6ee7b7}.medium{color:#fde68a}.high,.error{color:#fda4af}.note{color:#fcd34d}.muted{color:#94a3b8}`;
  shadow.appendChild(style);
  const card = document.createElement("div");
  card.className = "card";
  shadow.appendChild(card);

  function element(tag, content, className) {
    const node = document.createElement(tag);
    node.textContent = String(content ?? "");
    if (className) node.className = className;
    return node;
  }

  function frame() {
    host.style.display = "block";
    card.replaceChildren();
    const header = document.createElement("header");
    header.appendChild(element("span", "TruthLens AI"));
    const close = element("button", "×");
    close.type = "button";
    close.addEventListener("click", () => { host.style.display = "none"; clearInterval(timer); });
    header.appendChild(close);
    card.appendChild(header);
    const main = document.createElement("main");
    card.appendChild(main);
    return main;
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message.type === "TRUTHLENS_LOADING") {
      activeRequest = message.requestId;
      frame().appendChild(element("p", "Scanning selected text…", "muted"));
    } else if (message.requestId === activeRequest && message.type === "TRUTHLENS_RESULT") {
      const result = message.result;
      const main = frame();
      main.appendChild(element("h2", `${result.credibilityScore}/100`));
      main.appendChild(element("p", `${result.riskLevel} risk`, String(result.riskLevel).toLowerCase()));
      main.appendChild(element("p", result.summary));
      if (result.engine === "heuristic") main.appendChild(element("p", "Heuristic estimate", "note"));
      for (const warning of result.warnings ?? []) main.appendChild(element("p", warning, "note"));
      if (result.claims?.length) {
        const list = document.createElement("ul");
        for (const claim of result.claims) list.appendChild(element("li", `${claim.claim} — ${claim.score}/100. ${claim.rationale}`));
        main.appendChild(list);
      }
    } else if (message.requestId === activeRequest && message.type === "TRUTHLENS_ERROR") {
      const main = frame();
      const error = element("p", message.message, "error");
      main.appendChild(error);
      clearInterval(timer);
      if (message.retryAfterSeconds > 0) {
        let seconds = message.retryAfterSeconds;
        const countdown = element("p", `Try again in ${seconds}s.`);
        main.appendChild(countdown);
        timer = setInterval(() => {
          seconds -= 1;
          countdown.textContent = seconds > 0 ? `Try again in ${seconds}s.` : "You can try again now.";
          if (seconds <= 0) clearInterval(timer);
        }, 1000);
      }
    }
  });
})();
