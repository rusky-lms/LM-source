// src/adapters/baseAdapter.js
// LM-Source — PlatformAdapter base class
//
// Defines the interface every platform adapter must implement.
// Extend this class — do NOT use it directly.

'use strict';

export class PlatformAdapter {
  /**
   * Return a stable identifier string for this platform.
   * @returns {'claude' | 'chatgpt' | 'gemini' | 'unknown'}
   */
  getPlatformIdentifier() {
    throw new Error('[LM-Source] getPlatformIdentifier() must be implemented by the adapter.');
  }

  /**
   * Extract the conversation ID from the current page URL.
   * Returns 'unknown' if the URL does not contain one.
   * @returns {string}
   */
  getConversationId() {
    throw new Error('[LM-Source] getConversationId() must be implemented by the adapter.');
  }

  /**
   * Return the primary scrollable chat container element.
   * Used as the MutationObserver target for optimal performance.
   * @returns {Element | null}
   */
  getChatContainer() {
    throw new Error('[LM-Source] getChatContainer() must be implemented by the adapter.');
  }

  /**
   * Return all current message turn elements visible in the chat.
   * Each element should represent one full message turn (user or assistant).
   * @returns {Element[]}
   */
  getMessageElements() {
    throw new Error('[LM-Source] getMessageElements() must be implemented by the adapter.');
  }

  /**
   * Given a message element returned by getMessageElements(), extract
   * its structured data.
   *
   * @param {Element} element
   * @returns {{
   *   messageId: string,
   *   role: 'user' | 'assistant' | 'unknown',
   *   text: string,
   *   element: Element
   * } | null}
   */
  extractMessageData(element) {
    throw new Error('[LM-Source] extractMessageData() must be implemented by the adapter.');
  }

  /**
   * Return true if the token/context-limit warning is currently visible.
   * @returns {boolean}
   */
  detectTokenLimitWarning() {
    throw new Error('[LM-Source] detectTokenLimitWarning() must be implemented by the adapter.');
  }

  // ── Shared utility helpers available to all adapters ──────────────────────

  /**
   * Try a list of CSS selectors in order and return the first matching element.
   * Returns null if none match.
   *
   * @protected
   * @param {string[]} selectors
   * @param {Element | Document} [root=document]
   * @returns {Element | null}
   */
  _queryFirst(selectors, root = document) {
    for (const sel of selectors) {
      try {
        const el = root.querySelector(sel);
        if (el) return el;
      } catch (_) {
        // Invalid selector — skip silently
      }
    }
    return null;
  }

  /**
   * Try a list of CSS selectors in order and return all matching elements
   * from the first selector that yields results.
   *
   * @protected
   * @param {string[]} selectors
   * @param {Element | Document} [root=document]
   * @returns {Element[]}
   */
  _queryAll(selectors, root = document) {
    for (const sel of selectors) {
      try {
        const els = Array.from(root.querySelectorAll(sel));
        if (els.length > 0) return els;
      } catch (_) {
        // Invalid selector — skip silently
      }
    }
    return [];
  }

  /**
   * Extract the innerText of an element, with graceful fallback.
   *
   * @protected
   * @param {Element | null} el
   * @returns {string}
   */
  _getText(el) {
    if (!el) return '';
    return (el.innerText || el.textContent || '').trim();
  }

  /**
   * Generate a stable message ID from an element.
   * Prefers data attributes; falls back to a positional index string.
   *
   * @protected
   * @param {Element} el
   * @param {number} [index]
   * @returns {string}
   */
  _deriveMessageId(el, index = 0) {
    return (
      el.dataset?.messageId ||
      el.dataset?.testid ||
      el.id ||
      el.getAttribute('data-id') ||
      el.getAttribute('data-message-id') ||
      `lms-msg-${index}`
    );
  }
}
