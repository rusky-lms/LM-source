// src/popup.js
// LM-Source — Popup Script
//
// Handles the extension popup UI:
//   - Platform detection from the active tab URL
//   - "Extract Context" button → sends LMS_EXTRACT_CONTEXT to content script
//   - "Pinboard" and "Context Handoff" buttons (scaffolded for P2.3 / P2.7)

'use strict';

document.addEventListener('DOMContentLoaded', () => {
  console.log('[LM-Source] Popup script loaded.');

  // ── Elements ─────────────────────────────────────────────────────────────

  const platformIndicator = document.querySelector('.platform-indicator');
  const statusText        = document.querySelector('.status-text');
  const extractBtn        = document.getElementById('btn-extract');
  const pinboardBtn       = document.getElementById('btn-pinboard');
  const handoffBtn        = document.getElementById('btn-handoff');

  // ── Platform detection ────────────────────────────────────────────────────

  let activeTabId = null;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;

    const tab = tabs[0];
    activeTabId = tab.id;

    let url;
    try {
      url = new URL(tab.url);
    } catch (_) {
      setUnsupported();
      return;
    }

    const hostname = url.hostname;

    if (hostname.includes('claude.ai')) {
      setSupported('Claude.ai', '#7c3aed');
    } else if (hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com')) {
      setSupported('ChatGPT', '#10a37f');
    } else if (hostname.includes('gemini.google.com')) {
      setSupported('Google Gemini', '#4285f4');
    } else {
      setUnsupported();
    }
  });

  function setSupported(platformName, accentColor) {
    platformIndicator.textContent = `Platform: ${platformName}`;
    platformIndicator.style.color = accentColor;
    statusText.textContent = 'LM-Source Ready ✓';
    enableButtons();
  }

  function setUnsupported() {
    platformIndicator.textContent = 'Platform: Unsupported';
    platformIndicator.style.color = '#ef4444';
    statusText.textContent = 'Open Claude, ChatGPT or Gemini to get started.';
    statusText.style.color = '#94a3b8';
  }

  function enableButtons() {
    [extractBtn, pinboardBtn, handoffBtn].forEach(btn => {
      btn.disabled = false;
    });
  }

  // ── Button handlers ───────────────────────────────────────────────────────

  extractBtn.addEventListener('click', () => {
    if (activeTabId === null) return;

    extractBtn.disabled = true;
    extractBtn.querySelector('span').textContent = 'Extracting…';

    chrome.tabs.sendMessage(
      activeTabId,
      { type: 'LMS_EXTRACT_CONTEXT' },
      (response) => {
        extractBtn.disabled = false;
        extractBtn.querySelector('span').textContent = 'Extract Context';

        if (chrome.runtime.lastError) {
          console.warn('[LM-Source] Popup: sendMessage error:', chrome.runtime.lastError.message);
          showError('Could not reach content script. Reload the page and try again.');
          return;
        }

        if (response?.success) {
          // Panel is now open on the page — close the popup
          window.close();
        } else {
          showError(response?.error || 'Unknown error during extraction.');
        }
      }
    );
  });

  pinboardBtn.addEventListener('click', () => {
    console.log('[LM-Source] Pinboard clicked');
    // TODO: Implement in P2.3
  });

  handoffBtn.addEventListener('click', () => {
    if (activeTabId === null) return;
    // Toggle the panel on the page (useful when panel is already rendered)
    chrome.tabs.sendMessage(activeTabId, { type: 'LMS_TOGGLE_PANEL' });
    window.close();
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function showError(msg) {
    const existing = document.getElementById('lms-popup-error');
    if (existing) existing.remove();

    const err = document.createElement('p');
    err.id = 'lms-popup-error';
    err.style.cssText = [
      'color:#ef4444', 'font-size:11px', 'margin-top:8px',
      'padding:6px 10px', 'background:rgba(239,68,68,0.1)',
      'border:1px solid rgba(239,68,68,0.25)', 'border-radius:6px',
    ].join(';');
    err.textContent = msg;
    document.querySelector('.popup-content').appendChild(err);

    setTimeout(() => err.remove(), 5000);
  }
});
