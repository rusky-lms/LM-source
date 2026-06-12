// src/popup.js
// Popup script for the LM-Source extension
// Handles user interactions in the popup window

document.addEventListener('DOMContentLoaded', () => {
  console.log('[LM-Source] Popup script loaded.');

  // Elements
  const platformIndicator = document.querySelector('.platform-indicator');
  const extractBtn = document.getElementById('btn-extract');
  const pinboardBtn = document.getElementById('btn-pinboard');
  const handoffBtn = document.getElementById('btn-handoff');

  // Detect current platform from the active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = new URL(tabs[0].url);
    const hostname = url.hostname;

    if (hostname.includes('claude.ai')) {
      platformIndicator.textContent = 'Platform: Claude.ai';
      enableButtons();
    } else if (hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com')) {
      platformIndicator.textContent = 'Platform: ChatGPT';
      enableButtons();
    } else {
      platformIndicator.textContent = 'Platform: Unsupported';
    }
  });

  function enableButtons() {
    [extractBtn, pinboardBtn, handoffBtn].forEach(btn => {
      btn.disabled = false;
    });
  }

  // Button click handlers (scaffolded for later implementation)
  extractBtn.addEventListener('click', () => {
    console.log('[LM-Source] Extract Context clicked');
    // TODO: Implement in P2.2
  });

  pinboardBtn.addEventListener('click', () => {
    console.log('[LM-Source] Pinboard clicked');
    // TODO: Implement in P2.3
  });

  handoffBtn.addEventListener('click', () => {
    console.log('[LM-Source] Context Handoff clicked');
    // TODO: Implement in P2.7
  });
});
