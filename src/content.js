// src/content.js
// Content Script injected into Claude.ai and ChatGPT pages
// Manages DOM interaction, platform detection, and feature injection

(function() {
  'use strict';

  console.log('[LM-Source] Content script loaded on:', window.location.hostname);

  // Detect the current platform
  const hostname = window.location.hostname;
  let platform = 'unknown';
  
  if (hostname.includes('claude.ai')) {
    platform = 'claude';
  } else if (hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com')) {
    platform = 'chatgpt';
  }

  console.log('[LM-Source] Detected platform:', platform);

  // Initialize MutationObserver to watch for new messages
  let messageObserver = null;

  function initMessageObserver() {
    console.log('[LM-Source] Initializing MutationObserver for messages...');
    
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // TODO: Detect new message elements added to the DOM
            // This is a placeholder for P2.1 (DOM Injection Strategy)
          }
        });
      });
    });

    // Observe the document body for changes
    // In P2.1, this will be refined to target specific chat containers
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    messageObserver = observer;
    console.log('[LM-Source] MutationObserver active.');
  }

  // Initialize on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMessageObserver);
  } else {
    initMessageObserver();
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (messageObserver) {
      messageObserver.disconnect();
      console.log('[LM-Source] MutationObserver disconnected.');
    }
  });

})();
