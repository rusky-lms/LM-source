// src/adapters/claudeAdapter.js
// LM-Source — Claude.ai Platform Adapter
//
// Selector strategy (in priority order):
//   1. ARIA roles / semantic HTML  →  most stable across redesigns
//   2. data-testid attributes      →  stable in test-tagged builds
//   3. Known class fragments       →  less stable; used as last resort
//
// Claude.ai is a React SPA. The DOM is fully dynamic; we use MutationObserver
// (managed by content.js) rather than querying once at load time.

'use strict';

import { PlatformAdapter } from './baseAdapter.js';

// ── Selector banks ────────────────────────────────────────────────────────────
// Each array is tried in order; the first match wins.

const CHAT_CONTAINER_SELECTORS = [
  // Primary: semantic scrolling region
  '[role="log"]',
  // Fallback: known Claude scroll wrappers
  'main [class*="overflow-y-auto"]',
  'main [class*="scroll"]',
  // Last resort
  'main',
];

const MESSAGE_TURN_SELECTORS = [
  // Primary: data-testid used in Claude's test suite
  '[data-testid^="human-turn"]',
  '[data-testid^="ai-turn"]',
  '[data-testid="user-message"]',
  '[data-testid="assistant-message"]',
  // Fallback: ARIA list items inside a log region
  '[role="log"] [role="listitem"]',
  '[role="log"] > div',
  // Known class fragments (treat as hints, not guarantees)
  '[class*="human-turn"]',
  '[class*="ai-turn"]',
  '[class*="ConversationItem"]',
];

// Selectors that, when present inside a turn, indicate it was authored by the user
const USER_TURN_SIGNALS = [
  '[data-testid="human-turn"]',
  '[data-testid="user-message"]',
  '[class*="human-turn"]',
  '[class*="HumanMessage"]',
];

// Selectors that appear when Claude hits the context window limit
const TOKEN_LIMIT_SELECTORS = [
  '[data-testid="token-limit-banner"]',
  '[class*="ContextLimitBanner"]',
  '[class*="context-limit"]',
  '[class*="limit-reached"]',
];
const TOKEN_LIMIT_TEXT_PATTERNS = [
  /context (window|limit) (is |has been )?reached/i,
  /conversation (is |has become )?too long/i,
  /maximum (context|token) length/i,
  /starting a new (chat|conversation)/i,
];

export class ClaudeAdapter extends PlatformAdapter {
  constructor() {
    super();
    this._platform = 'claude';
  }

  // ── Interface implementation ───────────────────────────────────────────────

  getPlatformIdentifier() {
    return this._platform;
  }

  getConversationId() {
    // Claude URL format: https://claude.ai/chat/<uuid>
    const match = window.location.pathname.match(/\/chat\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : 'unknown';
  }

  getChatContainer() {
    const container = this._queryFirst(CHAT_CONTAINER_SELECTORS);
    if (!container) {
      console.warn('[LM-Source][ClaudeAdapter] Could not locate chat container.');
    }
    return container;
  }

  getMessageElements() {
    // Try a combined selector first for efficiency
    const combined = '[data-testid^="human-turn"], [data-testid^="ai-turn"], ' +
      '[data-testid="user-message"], [data-testid="assistant-message"]';
    const primary = Array.from(document.querySelectorAll(combined));
    if (primary.length > 0) return primary;

    // Fallback: role-based list items inside a log region
    const logContainer = document.querySelector('[role="log"]');
    if (logContainer) {
      const items = Array.from(logContainer.querySelectorAll('[role="listitem"]'));
      if (items.length > 0) return items;
      // Try direct children as a last resort
      const children = Array.from(logContainer.children).filter(el =>
        el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE'
      );
      if (children.length > 0) return children;
    }

    // Class-fragment fallbacks
    return this._queryAll([
      '[class*="human-turn"]',
      '[class*="ai-turn"]',
      '[class*="ConversationItem"]',
    ]);
  }

  /**
   * @param {Element} element
   * @param {number} [index]
   * @returns {{ messageId: string, role: 'user'|'assistant'|'unknown', text: string, element: Element } | null}
   */
  extractMessageData(element, index = 0) {
    if (!element) return null;

    const messageId = this._deriveClaudeMessageId(element, index);
    const role = this._detectRole(element);

    // Extract text: prefer the prose content container inside the turn
    const textEl = this._queryFirst(
      [
        '[data-testid="message-content"]',
        '[class*="prose"]',
        '[class*="markdown"]',
        '[class*="message-content"]',
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

    // Check visible text content for known warning patterns
    const bodyText = document.body.innerText || '';
    return TOKEN_LIMIT_TEXT_PATTERNS.some(pattern => pattern.test(bodyText));
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Derive a stable message ID for a Claude turn element.
   * @private
   */
  _deriveClaudeMessageId(el, index) {
    // Prefer explicit data attributes
    const explicit =
      el.dataset?.testid ||
      el.dataset?.messageId ||
      el.getAttribute('data-id') ||
      el.id;
    if (explicit) return `claude::${explicit}`;

    // Use conversation ID + index as fallback
    const convId = this.getConversationId();
    return `claude::${convId}::${index}`;
  }

  /**
   * Determine whether a turn element was authored by the user or the assistant.
   * @private
   * @param {Element} el
   * @returns {'user' | 'assistant' | 'unknown'}
   */
  _detectRole(el) {
    // 1. data-testid clue
    const testid = (el.dataset?.testid || '').toLowerCase();
    if (testid.includes('human') || testid.includes('user')) return 'user';
    if (testid.includes('ai') || testid.includes('assistant')) return 'assistant';

    // 2. Class fragment clue
    const cls = (el.className || '').toLowerCase();
    if (cls.includes('human')) return 'user';
    if (cls.includes('ai') || cls.includes('assistant') || cls.includes('claude')) return 'assistant';

    // 3. Check for a user-signal child element
    for (const sel of USER_TURN_SIGNALS) {
      if (el.matches(sel) || el.querySelector(sel)) return 'user';
    }

    // 4. Heuristic: Claude logo / avatar SVG inside the turn → assistant
    const hasClaudeAvatar =
      el.querySelector('[aria-label*="Claude"]') ||
      el.querySelector('[alt*="Claude"]') ||
      el.querySelector('[class*="claude-avatar"]');
    if (hasClaudeAvatar) return 'assistant';

    // 5. Heuristic: user avatar → user
    const hasUserAvatar =
      el.querySelector('[aria-label*="You"]') ||
      el.querySelector('[alt*="you"]') ||
      el.querySelector('[class*="user-avatar"]');
    if (hasUserAvatar) return 'user';

    return 'unknown';
  }
}
