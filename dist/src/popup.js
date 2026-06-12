(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
document.addEventListener("DOMContentLoaded", () => {
  console.log("[LM-Source] Popup script loaded.");
  const platformIndicator = document.querySelector(".platform-indicator");
  const extractBtn = document.getElementById("btn-extract");
  const pinboardBtn = document.getElementById("btn-pinboard");
  const handoffBtn = document.getElementById("btn-handoff");
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = new URL(tabs[0].url);
    const hostname = url.hostname;
    if (hostname.includes("claude.ai")) {
      platformIndicator.textContent = "Platform: Claude.ai";
      enableButtons();
    } else if (hostname.includes("chat.openai.com") || hostname.includes("chatgpt.com")) {
      platformIndicator.textContent = "Platform: ChatGPT";
      enableButtons();
    } else {
      platformIndicator.textContent = "Platform: Unsupported";
    }
  });
  function enableButtons() {
    [extractBtn, pinboardBtn, handoffBtn].forEach((btn) => {
      btn.disabled = false;
    });
  }
  extractBtn.addEventListener("click", () => {
    console.log("[LM-Source] Extract Context clicked");
  });
  pinboardBtn.addEventListener("click", () => {
    console.log("[LM-Source] Pinboard clicked");
  });
  handoffBtn.addEventListener("click", () => {
    console.log("[LM-Source] Context Handoff clicked");
  });
});
