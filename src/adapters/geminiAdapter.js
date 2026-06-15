// src/adapters/geminiAdapter.js
// LM-Source — Google Gemini (gemini.google.com) Platform Adapter
//
// Selector strategy (in priority order):
//   1. Custom HTML elements   →  <conversation-turn>, <user-query>, <model-response>
//                                 Gemini uses Angular-style custom elements that are
//                                 the most stable identifiers on the page.
//   2. ARIA roles / labels    →  semantic fallback
//   3. Known class fragments  →  last resort; treat as hints, not guarantees
//
// Gemini is an Angular SPA with Shadow DOM components. Standard querySelector
// can reach the light DOM; Shadow DOM children require explicit piercing via
// el.shadowRoot. Where possible we avoid depending on Shadow DOM internals.

'use strict';

import { PlatformAdapter } from './baseAdapter.js';

// ── Selector banks ────────────────────────────────────────────────────────────
// Each array is tried in order; first match wins.

// The outer scrollable region that wraps all conversation turns
const CHAT_CONTAINER_SELECTORS = [
  // Primary: Gemini-specific custom element
  'chat-window',
  'conversation',
  // Fallback: ARIA landmark
  '[role="main"]',
  // Angular app root, very broad — last resort
  'main',
];

// Individual conversation turn wrappers
// Gemini renders each exchange as a <conversation-turn> custom element
const MESSAGE_TURN_SELECTORS = [
  // Primary: custom element tags used by Gemini
  'conversation-turn',
  // Fallback: ARIA list items
  '[role="listitem"]',
  // Class fragment hints (obfuscated but historically present)
  '[class*="conversation-turn"]',
];

// The element inside a turn that holds the user's text
const USER_QUERY_SELECTORS = [
  'user-query',
  '[class*="user-query"]',
  '[data-message-author-role="user"]',
];

// The element inside a turn that holds Gemini's response
const MODEL_RESPONSE_SELECTORS = [
  'model-response',
  '[class*="model-response"]',
  '[data-message-author-role="assistant"]',
];

// Text content containers within a model response
const RESPONSE_TEXT_SELECTORS = [
  'message-content',
  '[class*="message-content"]',
  '.markdown',
  '[class*="markdown"]',
  '[class*="prose"]',
  'p',
];

// Selectors / text patterns that indicate Gemini has hit its context limit
const TOKEN_LIMIT_SELECTORS = [
  '[class*="context-limit"]',
  '[class*="contextLimit"]',
  '[class*="limit-banner"]',
  '[class*="limit-warning"]',
  '[class*="conversation-limit"]',
];
const TOKEN_LIMIT_TEXT_PATTERNS = [
  /context (window|limit) (is |has been )?reached/i,
  /conversation (is |has become )?too long/i,
  /maximum (context|token) length/i,
  /this conversation is getting long/i,
  /start a new (chat|conversation)/i,
  /response was limited/i,
];

// ── Helper: pierce one level of Shadow DOM ────────────────────────────────────

/**
 * Try to reach a selector through a host element's shadow root, if present.
 * Falls back to regular querySelector on the host itself.
 *
 * @param {Element} host
 * @param {string} selector
 * @returns {Element | null}
 */
function queryShadow(host, selector) {
  if (host.shadowRoot) {
    const el = host.shadowRoot.querySelector(selector);
    if (el) return el;
  }
  return host.querySelector(selector);
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class GeminiAdapter extends PlatformAdapter {
  constructor() {
    super();
    this._platform = 'gemini';
  }

  // ── Interface implementation ───────────────────────────────────────────────

  getPlatformIdentifier() {
    return this._platform;
  }

  getConversationId() {
    // Gemini URL formats:
    //   https://gemini.google.com/app/<conversationId>
    //   https://gemini.google.com/chat/<conversationId>  (older format)
    const match = window.location.pathname.match(/\/(app|chat)\/([a-zA-Z0-9_-]+)/);
    return match ? match[2] : 'unknown';
  }

  getChatContainer() {
    // 1. Try custom element first
    const chatWindow = document.querySelector('chat-window');
    if (chatWindow) return chatWindow;

    // 2. Try conversation element (may be inside shadow root of app root)
    const conversation = document.querySelector('conversation');
    if (conversation) return conversation;

    // 3. Try other selectors
    const container = this._queryFirst(CHAT_CONTAINER_SELECTORS);
    if (!container) {
      console.warn('[LM-Source][GeminiAdapter] Could not locate chat container.');
    }
    return container;
  }

  getMessageElements() {
    // Primary: <conversation-turn> custom elements
    const turns = Array.from(document.querySelectorAll('conversation-turn'));
    if (turns.length > 0) return turns;

    // Secondary: ARIA listitem fallback
    const listItems = Array.from(document.querySelectorAll('[role="listitem"]'));
    if (listItems.length > 0) return listItems;

    // Tertiary: class-fragment approach
    return this._queryAll(['[class*="conversation-turn"]']);
  }

  /**
   * @param {Element} element - A <conversation-turn> or equivalent element
   * @param {number} [index]
   * @returns {{ messageId: string, role: 'user'|'assistant'|'unknown', text: string, element: Element } | null}
   */
  extractMessageData(element, index = 0) {
    if (!element) return null;

    const messageId = this._deriveGeminiMessageId(element, index);
    const role = this._detectRole(element);

    // Extract text depending on role
    let text = '';
    if (role === 'user') {
      text = this._extractUserText(element);
    } else if (role === 'assistant') {
      text = this._extractAssistantText(element);
    } else {
      // Unknown role: try both and take whichever is longer
      const userText = this._extractUserText(element);
      const assistantText = this._extractAssistantText(element);
      text = userText.length >= assistantText.length ? userText : assistantText;
      if (!text) text = this._getText(element);
    }

    if (!text) {
      text = this._getText(element);
    }

    return { messageId, role, text, element };
  }

  detectTokenLimitWarning() {
    // Check for dedicated banner/limit elements
    const bannerEl = this._queryFirst(TOKEN_LIMIT_SELECTORS);
    if (bannerEl) return true;

    // Check visible text for known patterns
    const bodyText = document.body.innerText || '';
    return TOKEN_LIMIT_TEXT_PATTERNS.some(pattern => pattern.test(bodyText));
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Derive a stable message ID for a Gemini turn element.
   * @private
   */
  _deriveGeminiMessageId(el, index) {
    const explicit =
      el.getAttribute('data-id') ||
      el.getAttribute('data-turn-id') ||
      el.getAttribute('data-message-id') ||
      el.dataset?.messageId ||
      el.id;
    if (explicit) return `gemini::${explicit}`;

    const convId = this.getConversationId();
    return `gemini::${convId}::${index}`;
  }

  /**
   * Determine the role of a conversation turn.
   * Gemini nests <user-query> or <model-response> inside <conversation-turn>.
   * @private
   * @param {Element} el
   * @returns {'user' | 'assistant' | 'unknown'}
   */
  _detectRole(el) {
    // 1. Check for user-query custom element (direct child or in shadow DOM)
    const hasUserQuery =
      el.querySelector('user-query') ||
      el.querySelector('[class*="user-query"]') ||
      el.getAttribute('data-message-author-role') === 'user';
    if (hasUserQuery) return 'user';

    // 2. Check for model-response custom element
    const hasModelResponse =
      el.querySelector('model-response') ||
      el.querySelector('[class*="model-response"]') ||
      el.getAttribute('data-message-author-role') === 'assistant';
    if (hasModelResponse) return 'assistant';

    // 3. data-testid clues
    const testid = (el.dataset?.testid || '').toLowerCase();
    if (testid.includes('user') || testid.includes('human')) return 'user';
    if (testid.includes('model') || testid.includes('gemini') || testid.includes('assistant')) {
      return 'assistant';
    }

    // 4. ARIA label clues
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    if (ariaLabel.includes('you') || ariaLabel.includes('user')) return 'user';
    if (ariaLabel.includes('gemini') || ariaLabel.includes('model')) return 'assistant';

    // 5. Class fragment clues
    const cls = (el.className || '').toLowerCase();
    if (cls.includes('user') || cls.includes('human')) return 'user';
    if (cls.includes('model') || cls.includes('gemini') || cls.includes('assistant')) {
      return 'assistant';
    }

    return 'unknown';
  }

  /**
   * Extract text from the user portion of a turn.
   * @private
   */
  _extractUserText(el) {
    // Look for <user-query> custom element
    const userQueryEl = el.querySelector('user-query') ||
      el.querySelector('[class*="user-query"]');
    if (userQueryEl) {
      // Try its shadow root first
      const shadowText = queryShadow(userQueryEl, 'p, [class*="query-text"], textarea');
      if (shadowText) return this._getText(shadowText);
      return this._getText(userQueryEl);
    }
    return '';
  }

  /**
   * Extract text from the model-response portion of a turn.
   * @private
   */
  _extractAssistantText(el) {
    // Look for <model-response> custom element
    const modelRespEl = el.querySelector('model-response') ||
      el.querySelector('[class*="model-response"]');
    if (modelRespEl) {
      // Look for <message-content> or prose containers
      for (const sel of RESPONSE_TEXT_SELECTORS) {
        const textEl = queryShadow(modelRespEl, sel);
        if (textEl) return this._getText(textEl);
        const lightDom = modelRespEl.querySelector(sel);
        if (lightDom) return this._getText(lightDom);
      }
      return this._getText(modelRespEl);
    }

    // Fallback: look for message-content directly inside turn
    const msgContent = el.querySelector('message-content') ||
      el.querySelector('[class*="message-content"]');
    if (msgContent) return this._getText(msgContent);

    return '';
  }
}
