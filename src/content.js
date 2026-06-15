// src/content.js
// LM-Source — Content Script
//
// Entry point injected into Claude.ai, ChatGPT, and Google Gemini pages.
// Responsibilities:
//  1. Detect the current platform and instantiate the correct adapter.
//  2. Wait for the chat container to appear in the DOM (SPAs load it async).
//  3. Process any messages already in the DOM on first load.
//  4. Run a debounced MutationObserver on the chat container to detect new messages.
//  5. Expose a lightweight internal event bus so feature modules (P2.2–P2.7)
//     can subscribe to 'lms:messageAdded' and 'lms:tokenLimitWarning' events.
//  6. (P2.2) Listen for LMS_EXTRACT_CONTEXT messages and trigger context extraction.

'use strict';

import { ClaudeAdapter }    from './adapters/claudeAdapter.js';
import { ChatGPTAdapter }   from './adapters/chatgptAdapter.js';
import { GeminiAdapter }    from './adapters/geminiAdapter.js';
import { extractContext }   from './services/contextExtractor.js';
import { ContextSidePanel } from './components/ContextSidePanel.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const LOG_PREFIX = '[LM-Source]';

/**
 * How long (ms) to wait after the last DOM mutation before processing.
 * Prevents hammering the CPU while ChatGPT/Claude is streaming a response.
 */
const DEBOUNCE_MS = 400;

/**
 * How long (ms) to wait between polls when looking for the chat container
 * to appear (SPAs may take several seconds to mount it).
 */
const CONTAINER_POLL_INTERVAL_MS = 500;
const CONTAINER_POLL_TIMEOUT_MS = 30_000; // Give up after 30 s

// ── Platform detection & adapter instantiation ────────────────────────────────

const hostname = window.location.hostname;

/** @type {import('./adapters/baseAdapter.js').PlatformAdapter | null} */
let adapter = null;

if (hostname.includes('claude.ai')) {
  adapter = new ClaudeAdapter();
} else if (hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com')) {
  adapter = new ChatGPTAdapter();
} else if (hostname.includes('gemini.google.com')) {
  adapter = new GeminiAdapter();
}

if (!adapter) {
  console.warn(`${LOG_PREFIX} Unsupported platform: ${hostname}. Content script idle.`);
} else {
  console.log(`${LOG_PREFIX} Adapter loaded for platform: ${adapter.getPlatformIdentifier()}`);
  init(adapter);
}

// ── Internal event bus ────────────────────────────────────────────────────────
// Feature modules subscribe to these custom events on the document.
// Events are fired from within this content script.
//
// Available events:
//   'lms:messageAdded'       — detail: { messageId, role, text, element }
//   'lms:tokenLimitWarning'  — detail: { platform, conversationId }
//   'lms:adapterReady'       — detail: { adapter, platform, conversationId }

/**
 * Fire an LM-Source custom event on the document.
 *
 * @param {string} eventName
 * @param {object} detail
 */
function emit(eventName, detail) {
  document.dispatchEvent(new CustomEvent(eventName, { detail }));
}

// ── Seen-message tracking ─────────────────────────────────────────────────────
// We track message IDs already processed to avoid duplicating events when
// the MutationObserver fires on streaming updates of existing messages.

/** @type {Set<string>} */
const seenMessageIds = new Set();

// ── Main initialisation ───────────────────────────────────────────────────────

/**
 * Initialise the content script for a detected platform.
 *
 * @param {import('./adapters/baseAdapter.js').PlatformAdapter} adapter
 */
async function init(adapter) {
  const platform = adapter.getPlatformIdentifier();
  console.log(`${LOG_PREFIX} Waiting for chat container on ${platform}…`);

  const container = await waitForChatContainer(adapter);

  if (!container) {
    console.warn(
      `${LOG_PREFIX} Chat container not found after ${CONTAINER_POLL_TIMEOUT_MS / 1000}s. ` +
      `The adapter selectors may need updating.`
    );
    return;
  }

  const conversationId = adapter.getConversationId();
  console.log(
    `${LOG_PREFIX} Chat container found. Platform: ${platform}, ` +
    `Conversation: ${conversationId}`
  );

  // Let feature modules know we're ready
  emit('lms:adapterReady', { adapter, platform, conversationId });

  // Process messages already in the DOM
  processCurrentMessages(adapter);

  // Watch for new / updated messages
  startMutationObserver(adapter, container);

  // Handle SPA navigations: Claude and ChatGPT navigate without a full page
  // reload, so we listen for URL changes and re-initialise when the path changes.
  watchForNavigation(adapter);
}

// ── P2.2 — Context Extraction wiring ─────────────────────────────────────────

/**
 * Run context extraction against the current adapter and render the side panel.
 * Called from the popup via chrome.runtime.sendMessage or on demand.
 *
 * @param {import('./adapters/baseAdapter.js').PlatformAdapter} adapterRef
 */
function runContextExtraction(adapterRef) {
  const ctx = extractContext(adapterRef);
  if (!ctx) {
    console.warn(`${LOG_PREFIX} Context extraction returned nothing.`);
    return;
  }

  ContextSidePanel.render(ctx, {
    onRefresh: () => runContextExtraction(adapterRef),
  });
  ContextSidePanel.open();
}

// Listen for messages from the popup / background
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request?.type === 'LMS_EXTRACT_CONTEXT') {
    if (!adapter) {
      sendResponse({ success: false, error: 'No adapter active on this page.' });
      return true;
    }
    try {
      runContextExtraction(adapter);
      sendResponse({ success: true });
    } catch (err) {
      console.error(`${LOG_PREFIX} Context extraction error:`, err);
      sendResponse({ success: false, error: err.message });
    }
    return true; // keep channel open for async
  }

  if (request?.type === 'LMS_TOGGLE_PANEL') {
    ContextSidePanel.toggle();
    sendResponse({ success: true });
    return true;
  }

  return false;
});

// Auto-render the side panel (without opening it) once the adapter is ready,
// so the floating toggle button appears as soon as the page loads.
document.addEventListener('lms:adapterReady', (e) => {
  const { adapter: readyAdapter } = e.detail;
  // Small delay to let the host page settle before we scan messages
  setTimeout(() => {
    const ctx = extractContext(readyAdapter);
    if (ctx) {
      ContextSidePanel.render(ctx, {
        onRefresh: () => runContextExtraction(readyAdapter),
      });
      // Panel starts closed; user opens via toggle button or popup
    }
  }, 1500);
});

// ── Chat container polling ────────────────────────────────────────────────────

/**
 * Poll until the chat container appears or the timeout expires.
 * Returns null on timeout.
 *
 * @param {import('./adapters/baseAdapter.js').PlatformAdapter} adapter
 * @returns {Promise<Element | null>}
 */
function waitForChatContainer(adapter) {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const poll = () => {
      const container = adapter.getChatContainer();
      if (container) {
        resolve(container);
        return;
      }
      if (Date.now() - startTime >= CONTAINER_POLL_TIMEOUT_MS) {
        resolve(null);
        return;
      }
      setTimeout(poll, CONTAINER_POLL_INTERVAL_MS);
    };

    poll();
  });
}

// ── Message processing ────────────────────────────────────────────────────────

/**
 * Scan all current message elements and emit 'lms:messageAdded' for any
 * not yet seen.
 *
 * @param {import('./adapters/baseAdapter.js').PlatformAdapter} adapter
 */
function processCurrentMessages(adapter) {
  const elements = adapter.getMessageElements();
  console.log(`${LOG_PREFIX} Processing ${elements.length} existing message(s).`);

  elements.forEach((el, index) => {
    const data = adapter.extractMessageData(el, index);
    if (!data) return;

    if (!seenMessageIds.has(data.messageId)) {
      seenMessageIds.add(data.messageId);
      console.log(
        `${LOG_PREFIX} [${data.role.toUpperCase()}] ${data.messageId}: ` +
        `"${data.text.slice(0, 80)}${data.text.length > 80 ? '…' : ''}"`
      );
      emit('lms:messageAdded', data);
    }
  });
}

/**
 * Process a single newly-detected message element.
 *
 * @param {import('./adapters/baseAdapter.js').PlatformAdapter} adapter
 * @param {Element} el
 * @param {number} index
 */
function processNewMessage(adapter, el, index) {
  const data = adapter.extractMessageData(el, index);
  if (!data || seenMessageIds.has(data.messageId)) return;

  seenMessageIds.add(data.messageId);
  console.log(
    `${LOG_PREFIX} New message detected [${data.role.toUpperCase()}] ${data.messageId}: ` +
    `"${data.text.slice(0, 80)}${data.text.length > 80 ? '…' : ''}"`
  );

  emit('lms:messageAdded', data);
  checkTokenLimit(adapter);
}

// ── Token limit monitoring ────────────────────────────────────────────────────

/**
 * Check for a token limit warning and emit the event once if found.
 * @param {import('./adapters/baseAdapter.js').PlatformAdapter} adapter
 */
let _tokenLimitWarned = false;
function checkTokenLimit(adapter) {
  if (_tokenLimitWarned) return;
  if (adapter.detectTokenLimitWarning()) {
    _tokenLimitWarned = true;
    const conversationId = adapter.getConversationId();
    console.warn(`${LOG_PREFIX} ⚠ Token limit warning detected! Conversation: ${conversationId}`);
    emit('lms:tokenLimitWarning', {
      platform: adapter.getPlatformIdentifier(),
      conversationId,
    });
  }
}

// ── MutationObserver ──────────────────────────────────────────────────────────

/** @type {MutationObserver | null} */
let messageObserver = null;

/** @type {ReturnType<typeof setTimeout> | null} */
let debounceTimer = null;

/**
 * Start the MutationObserver on the chat container.
 * Uses a debounce so streaming updates (dozens of mutations per second)
 * are collapsed into a single processing pass.
 *
 * @param {import('./adapters/baseAdapter.js').PlatformAdapter} adapter
 * @param {Element} container
 */
function startMutationObserver(adapter, container) {
  if (messageObserver) {
    messageObserver.disconnect();
  }

  messageObserver = new MutationObserver(() => {
    // Debounce: wait until mutations stop before processing
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const elements = adapter.getMessageElements();
      elements.forEach((el, index) => processNewMessage(adapter, el, index));
    }, DEBOUNCE_MS);
  });

  messageObserver.observe(container, {
    childList: true,  // detect added/removed child nodes
    subtree: true,    // watch the full subtree (streaming updates nested elements)
    characterData: false, // ignore text mutations — we re-scan the full list
  });

  console.log(`${LOG_PREFIX} MutationObserver active on chat container.`);
}

// ── SPA Navigation detection ──────────────────────────────────────────────────
// Claude and ChatGPT are SPAs — navigating to a new conversation does NOT
// trigger a page reload, so we must detect URL changes and re-initialise.

/**
 * Watch for URL changes via history.pushState / popstate.
 * When a navigation is detected, reset state and re-initialise.
 *
 * @param {import('./adapters/baseAdapter.js').PlatformAdapter} adapter
 */
function watchForNavigation(adapter) {
  let lastPath = window.location.pathname;

  // Intercept history.pushState (used by both Claude and ChatGPT)
  const originalPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    originalPushState(...args);
    onNavigate(adapter, lastPath);
    lastPath = window.location.pathname;
  };

  // Also handle browser back/forward
  window.addEventListener('popstate', () => {
    onNavigate(adapter, lastPath);
    lastPath = window.location.pathname;
  });
}

/**
 * Handle a detected SPA navigation.
 * @param {import('./adapters/baseAdapter.js').PlatformAdapter} adapter
 * @param {string} previousPath
 */
function onNavigate(adapter, previousPath) {
  const newPath = window.location.pathname;
  if (newPath === previousPath) return;

  console.log(`${LOG_PREFIX} SPA navigation detected: ${previousPath} → ${newPath}`);

  // Disconnect the old observer and reset tracking state
  if (messageObserver) {
    messageObserver.disconnect();
    messageObserver = null;
  }
  seenMessageIds.clear();
  _tokenLimitWarned = false;

  // Re-initialise for the new conversation
  setTimeout(() => init(adapter), 500); // Brief delay for the SPA to mount the new view
}

// ── Cleanup on page unload ────────────────────────────────────────────────────

window.addEventListener('beforeunload', () => {
  if (messageObserver) {
    messageObserver.disconnect();
    console.log(`${LOG_PREFIX} MutationObserver disconnected.`);
  }
  clearTimeout(debounceTimer);
});
