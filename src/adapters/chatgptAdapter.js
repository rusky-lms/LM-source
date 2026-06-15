// src/adapters/chatgptAdapter.js
// LM-Source — ChatGPT (chatgpt.com / chat.openai.com) Platform Adapter
//
// Selector strategy (in priority order):
//   1. data-message-author-role   →  most semantically stable attribute
//   2. data-testid attributes     →  stable in OpenAI test-tagged builds
//   3. ARIA roles / article tags  →  semantic HTML fallback
//   4. Known class fragments      →  last resort, treat as hints
//
// ChatGPT is a Next.js SPA. The DOM is fully dynamic.

'use strict';

import { PlatformAdapter } from './baseAdapter.js';

// ── Selector banks ────────────────────────────────────────────────────────────

const CHAT_CONTAINER_SELECTORS = [
  // Primary: the <main> element houses the conversation thread
  'main',
  // Conversation-specific scroll containers (class names vary)
  '[class*="conversation-main"]',
  '[class*="chat-pg"]',
  '[class*="overflow-y-auto"]',
];

// ChatGPT message turns can be identified by article or data attributes
const MESSAGE_TURN_SELECTORS = [
  // Most stable: data-message-author-role is consistently applied
  '[data-message-author-role]',
  // data-testid pattern used in OpenAI's test suite
  '[data-testid^="conversation-turn-"]',
  // Semantic HTML fallback
  'article[class*="group"]',
  'article',
  // ARIA / role fallback
  '[role="row"]',
];

// Token limit warning selectors and text patterns
const TOKEN_LIMIT_SELECTORS = [
  '[data-testid="context-limit-banner"]',
  '[class*="context-limit"]',
  '[class*="contextLimit"]',
  '[class*="limit-reached"]',
  '[class*="limit-warning"]',
];
const TOKEN_LIMIT_TEXT_PATTERNS = [
  /context (window|limit) (is |has been )?reached/i,
  /conversation (is |has become )?too long/i,
  /maximum (context|token) length/i,
  /you've reached the (maximum|conversation) limit/i,
  /start a new (chat|conversation)/i,
];

export class ChatGPTAdapter extends PlatformAdapter {
  constructor() {
    super();
    this._platform = 'chatgpt';
  }

  // ── Interface implementation ───────────────────────────────────────────────

  getPlatformIdentifier() {
    return this._platform;
  }

  getConversationId() {
    // ChatGPT URL formats:
    //   https://chatgpt.com/c/<uuid>
    //   https://chat.openai.com/c/<uuid>
    const match = window.location.pathname.match(/\/c\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : 'unknown';
  }

  getChatContainer() {
    const container = this._queryFirst(CHAT_CONTAINER_SELECTORS);
    if (!container) {
      console.warn('[LM-Source][ChatGPTAdapter] Could not locate chat container.');
    }
    return container;
  }

  getMessageElements() {
    // Primary: data-message-author-role is the most reliable attribute
    const byRole = Array.from(
      document.querySelectorAll('[data-message-author-role]')
    );
    if (byRole.length > 0) return byRole;

    // Secondary: data-testid conversation-turn pattern
    const byTestId = Array.from(
      document.querySelectorAll('[data-testid^="conversation-turn-"]')
    );
    if (byTestId.length > 0) return byTestId;

    // Tertiary: article elements (semantic HTML)
    const byArticle = Array.from(document.querySelectorAll('article'));
    if (byArticle.length > 0) return byArticle;

    // Fallback: class-fragment approach inside main
    return this._queryAll([
      'main [class*="group/conversation-turn"]',
      'main [class*="ConversationItem"]',
    ]);
  }

  /**
   * @param {Element} element
   * @param {number} [index]
   * @returns {{ messageId: string, role: 'user'|'assistant'|'unknown', text: string, element: Element } | null}
   */
  extractMessageData(element, index = 0) {
    if (!element) return null;

    const messageId = this._deriveChatGPTMessageId(element, index);
    const role = this._detectRole(element);

    // Text extraction: ChatGPT wraps response content in markdown/prose divs
    const textEl = this._queryFirst(
      [
        '[data-message-author-role] .markdown',
        '[class*="prose"]',
        '[class*="markdown"]',
        '.whitespace-pre-wrap',
        'p',
      ],
      element
    ) || element;

    const text = this._getText(textEl);

    return { messageId, role, text, element };
  }

  detectTokenLimitWarning() {
    // Check for dedicated banner elements
    const bannerEl = this._queryFirst(TOKEN_LIMIT_SELECTORS);
    if (bannerEl) return true;

    // Check visible text for warning patterns
    const bodyText = document.body.innerText || '';
    return TOKEN_LIMIT_TEXT_PATTERNS.some(pattern => pattern.test(bodyText));
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Derive a stable message ID for a ChatGPT turn element.
   * @private
   */
  _deriveChatGPTMessageId(el, index) {
    // Prefer the data-message-id attribute set by OpenAI
    const explicit =
      el.getAttribute('data-message-id') ||
      el.dataset?.messageId ||
      el.dataset?.testid ||
      el.id;
    if (explicit) return `chatgpt::${explicit}`;

    const convId = this.getConversationId();
    return `chatgpt::${convId}::${index}`;
  }

  /**
   * Determine role from a ChatGPT turn element.
   * @private
   * @param {Element} el
   * @returns {'user' | 'assistant' | 'unknown'}
   */
  _detectRole(el) {
    // 1. Most reliable: explicit attribute on the element itself
    const authorRole = el.getAttribute('data-message-author-role');
    if (authorRole === 'user') return 'user';
    if (authorRole === 'assistant') return 'assistant';

    // 2. Check descendant elements for the attribute (when the turn wrapper
    //    doesn't have it directly but its message child does)
    const descendantRole = el.querySelector('[data-message-author-role]');
    if (descendantRole) {
      const r = descendantRole.getAttribute('data-message-author-role');
      if (r === 'user') return 'user';
      if (r === 'assistant') return 'assistant';
    }

    // 3. data-testid pattern
    const testid = (el.dataset?.testid || '').toLowerCase();
    if (testid.includes('user')) return 'user';
    if (testid.includes('assistant') || testid.includes('gpt')) return 'assistant';

    // 4. Aria label on avatar elements inside the turn
    const userAvatar =
      el.querySelector('[aria-label="You"]') ||
      el.querySelector('[aria-label*="user"]') ||
      el.querySelector('[alt="User"]');
    if (userAvatar) return 'user';

    const assistantAvatar =
      el.querySelector('[aria-label="ChatGPT"]') ||
      el.querySelector('[aria-label*="assistant"]') ||
      el.querySelector('[alt="ChatGPT"]');
    if (assistantAvatar) return 'assistant';

    return 'unknown';
  }
}
