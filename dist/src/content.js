(function() {
  "use strict";
  (function() {
    console.log("[LM-Source] Content script loaded on:", window.location.hostname);
    const hostname = window.location.hostname;
    let platform = "unknown";
    if (hostname.includes("claude.ai")) {
      platform = "claude";
    } else if (hostname.includes("chat.openai.com") || hostname.includes("chatgpt.com")) {
      platform = "chatgpt";
    }
    console.log("[LM-Source] Detected platform:", platform);
    let messageObserver = null;
    function initMessageObserver() {
      console.log("[LM-Source] Initializing MutationObserver for messages...");
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) ;
          });
        });
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      messageObserver = observer;
      console.log("[LM-Source] MutationObserver active.");
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initMessageObserver);
    } else {
      initMessageObserver();
    }
    window.addEventListener("beforeunload", () => {
      if (messageObserver) {
        messageObserver.disconnect();
        console.log("[LM-Source] MutationObserver disconnected.");
      }
    });
  })();
})();
