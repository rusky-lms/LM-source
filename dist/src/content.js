(function() {
  "use strict";
  class PlatformAdapter {
    /**
     * Return a stable identifier string for this platform.
     * @returns {'claude' | 'chatgpt' | 'gemini' | 'unknown'}
     */
    getPlatformIdentifier() {
      throw new Error("[LM-Source] getPlatformIdentifier() must be implemented by the adapter.");
    }
    /**
     * Extract the conversation ID from the current page URL.
     * Returns 'unknown' if the URL does not contain one.
     * @returns {string}
     */
    getConversationId() {
      throw new Error("[LM-Source] getConversationId() must be implemented by the adapter.");
    }
    /**
     * Return the primary scrollable chat container element.
     * Used as the MutationObserver target for optimal performance.
     * @returns {Element | null}
     */
    getChatContainer() {
      throw new Error("[LM-Source] getChatContainer() must be implemented by the adapter.");
    }
    /**
     * Return all current message turn elements visible in the chat.
     * Each element should represent one full message turn (user or assistant).
     * @returns {Element[]}
     */
    getMessageElements() {
      throw new Error("[LM-Source] getMessageElements() must be implemented by the adapter.");
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
      throw new Error("[LM-Source] extractMessageData() must be implemented by the adapter.");
    }
    /**
     * Return true if the token/context-limit warning is currently visible.
     * @returns {boolean}
     */
    detectTokenLimitWarning() {
      throw new Error("[LM-Source] detectTokenLimitWarning() must be implemented by the adapter.");
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
      if (!el) return "";
      return (el.innerText || el.textContent || "").trim();
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
      var _a, _b;
      return ((_a = el.dataset) == null ? void 0 : _a.messageId) || ((_b = el.dataset) == null ? void 0 : _b.testid) || el.id || el.getAttribute("data-id") || el.getAttribute("data-message-id") || `lms-msg-${index}`;
    }
  }
  const CHAT_CONTAINER_SELECTORS$2 = [
    // Primary: semantic scrolling region
    '[role="log"]',
    // Fallback: known Claude scroll wrappers
    'main [class*="overflow-y-auto"]',
    'main [class*="scroll"]',
    // Last resort
    "main"
  ];
  const USER_TURN_SIGNALS = [
    '[data-testid="human-turn"]',
    '[data-testid="user-message"]',
    '[class*="human-turn"]',
    '[class*="HumanMessage"]'
  ];
  const TOKEN_LIMIT_SELECTORS$2 = [
    '[data-testid="token-limit-banner"]',
    '[class*="ContextLimitBanner"]',
    '[class*="context-limit"]',
    '[class*="limit-reached"]'
  ];
  const TOKEN_LIMIT_TEXT_PATTERNS$2 = [
    /context (window|limit) (is |has been )?reached/i,
    /conversation (is |has become )?too long/i,
    /maximum (context|token) length/i,
    /starting a new (chat|conversation)/i
  ];
  class ClaudeAdapter extends PlatformAdapter {
    constructor() {
      super();
      this._platform = "claude";
    }
    // ── Interface implementation ───────────────────────────────────────────────
    getPlatformIdentifier() {
      return this._platform;
    }
    getConversationId() {
      const match = window.location.pathname.match(/\/chat\/([a-zA-Z0-9_-]+)/);
      return match ? match[1] : "unknown";
    }
    getChatContainer() {
      const container = this._queryFirst(CHAT_CONTAINER_SELECTORS$2);
      if (!container) {
        console.warn("[LM-Source][ClaudeAdapter] Could not locate chat container.");
      }
      return container;
    }
    getMessageElements() {
      const combined = '[data-testid^="human-turn"], [data-testid^="ai-turn"], [data-testid="user-message"], [data-testid="assistant-message"]';
      const primary = Array.from(document.querySelectorAll(combined));
      if (primary.length > 0) return primary;
      const logContainer = document.querySelector('[role="log"]');
      if (logContainer) {
        const items = Array.from(logContainer.querySelectorAll('[role="listitem"]'));
        if (items.length > 0) return items;
        const children = Array.from(logContainer.children).filter(
          (el) => el.tagName !== "SCRIPT" && el.tagName !== "STYLE"
        );
        if (children.length > 0) return children;
      }
      return this._queryAll([
        '[class*="human-turn"]',
        '[class*="ai-turn"]',
        '[class*="ConversationItem"]'
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
      const textEl = this._queryFirst(
        [
          '[data-testid="message-content"]',
          '[class*="prose"]',
          '[class*="markdown"]',
          '[class*="message-content"]',
          "p"
        ],
        element
      ) || element;
      const text = this._getText(textEl);
      return { messageId, role, text, element };
    }
    detectTokenLimitWarning() {
      const bannerEl = this._queryFirst(TOKEN_LIMIT_SELECTORS$2);
      if (bannerEl) return true;
      const bodyText = document.body.innerText || "";
      return TOKEN_LIMIT_TEXT_PATTERNS$2.some((pattern) => pattern.test(bodyText));
    }
    // ── Private helpers ────────────────────────────────────────────────────────
    /**
     * Derive a stable message ID for a Claude turn element.
     * @private
     */
    _deriveClaudeMessageId(el, index) {
      var _a, _b;
      const explicit = ((_a = el.dataset) == null ? void 0 : _a.testid) || ((_b = el.dataset) == null ? void 0 : _b.messageId) || el.getAttribute("data-id") || el.id;
      if (explicit) return `claude::${explicit}`;
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
      var _a;
      const testid = (((_a = el.dataset) == null ? void 0 : _a.testid) || "").toLowerCase();
      if (testid.includes("human") || testid.includes("user")) return "user";
      if (testid.includes("ai") || testid.includes("assistant")) return "assistant";
      const cls = (el.className || "").toLowerCase();
      if (cls.includes("human")) return "user";
      if (cls.includes("ai") || cls.includes("assistant") || cls.includes("claude")) return "assistant";
      for (const sel of USER_TURN_SIGNALS) {
        if (el.matches(sel) || el.querySelector(sel)) return "user";
      }
      const hasClaudeAvatar = el.querySelector('[aria-label*="Claude"]') || el.querySelector('[alt*="Claude"]') || el.querySelector('[class*="claude-avatar"]');
      if (hasClaudeAvatar) return "assistant";
      const hasUserAvatar = el.querySelector('[aria-label*="You"]') || el.querySelector('[alt*="you"]') || el.querySelector('[class*="user-avatar"]');
      if (hasUserAvatar) return "user";
      return "unknown";
    }
  }
  const CHAT_CONTAINER_SELECTORS$1 = [
    // Primary: the <main> element houses the conversation thread
    "main",
    // Conversation-specific scroll containers (class names vary)
    '[class*="conversation-main"]',
    '[class*="chat-pg"]',
    '[class*="overflow-y-auto"]'
  ];
  const TOKEN_LIMIT_SELECTORS$1 = [
    '[data-testid="context-limit-banner"]',
    '[class*="context-limit"]',
    '[class*="contextLimit"]',
    '[class*="limit-reached"]',
    '[class*="limit-warning"]'
  ];
  const TOKEN_LIMIT_TEXT_PATTERNS$1 = [
    /context (window|limit) (is |has been )?reached/i,
    /conversation (is |has become )?too long/i,
    /maximum (context|token) length/i,
    /you've reached the (maximum|conversation) limit/i,
    /start a new (chat|conversation)/i
  ];
  class ChatGPTAdapter extends PlatformAdapter {
    constructor() {
      super();
      this._platform = "chatgpt";
    }
    // ── Interface implementation ───────────────────────────────────────────────
    getPlatformIdentifier() {
      return this._platform;
    }
    getConversationId() {
      const match = window.location.pathname.match(/\/c\/([a-zA-Z0-9_-]+)/);
      return match ? match[1] : "unknown";
    }
    getChatContainer() {
      const container = this._queryFirst(CHAT_CONTAINER_SELECTORS$1);
      if (!container) {
        console.warn("[LM-Source][ChatGPTAdapter] Could not locate chat container.");
      }
      return container;
    }
    getMessageElements() {
      const byRole = Array.from(
        document.querySelectorAll("[data-message-author-role]")
      );
      if (byRole.length > 0) return byRole;
      const byTestId = Array.from(
        document.querySelectorAll('[data-testid^="conversation-turn-"]')
      );
      if (byTestId.length > 0) return byTestId;
      const byArticle = Array.from(document.querySelectorAll("article"));
      if (byArticle.length > 0) return byArticle;
      return this._queryAll([
        'main [class*="group/conversation-turn"]',
        'main [class*="ConversationItem"]'
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
      const textEl = this._queryFirst(
        [
          "[data-message-author-role] .markdown",
          '[class*="prose"]',
          '[class*="markdown"]',
          ".whitespace-pre-wrap",
          "p"
        ],
        element
      ) || element;
      const text = this._getText(textEl);
      return { messageId, role, text, element };
    }
    detectTokenLimitWarning() {
      const bannerEl = this._queryFirst(TOKEN_LIMIT_SELECTORS$1);
      if (bannerEl) return true;
      const bodyText = document.body.innerText || "";
      return TOKEN_LIMIT_TEXT_PATTERNS$1.some((pattern) => pattern.test(bodyText));
    }
    // ── Private helpers ────────────────────────────────────────────────────────
    /**
     * Derive a stable message ID for a ChatGPT turn element.
     * @private
     */
    _deriveChatGPTMessageId(el, index) {
      var _a, _b;
      const explicit = el.getAttribute("data-message-id") || ((_a = el.dataset) == null ? void 0 : _a.messageId) || ((_b = el.dataset) == null ? void 0 : _b.testid) || el.id;
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
      var _a;
      const authorRole = el.getAttribute("data-message-author-role");
      if (authorRole === "user") return "user";
      if (authorRole === "assistant") return "assistant";
      const descendantRole = el.querySelector("[data-message-author-role]");
      if (descendantRole) {
        const r = descendantRole.getAttribute("data-message-author-role");
        if (r === "user") return "user";
        if (r === "assistant") return "assistant";
      }
      const testid = (((_a = el.dataset) == null ? void 0 : _a.testid) || "").toLowerCase();
      if (testid.includes("user")) return "user";
      if (testid.includes("assistant") || testid.includes("gpt")) return "assistant";
      const userAvatar = el.querySelector('[aria-label="You"]') || el.querySelector('[aria-label*="user"]') || el.querySelector('[alt="User"]');
      if (userAvatar) return "user";
      const assistantAvatar = el.querySelector('[aria-label="ChatGPT"]') || el.querySelector('[aria-label*="assistant"]') || el.querySelector('[alt="ChatGPT"]');
      if (assistantAvatar) return "assistant";
      return "unknown";
    }
  }
  const CHAT_CONTAINER_SELECTORS = [
    // Primary: Gemini-specific custom element
    "chat-window",
    "conversation",
    // Fallback: ARIA landmark
    '[role="main"]',
    // Angular app root, very broad — last resort
    "main"
  ];
  const RESPONSE_TEXT_SELECTORS = [
    "message-content",
    '[class*="message-content"]',
    ".markdown",
    '[class*="markdown"]',
    '[class*="prose"]',
    "p"
  ];
  const TOKEN_LIMIT_SELECTORS = [
    '[class*="context-limit"]',
    '[class*="contextLimit"]',
    '[class*="limit-banner"]',
    '[class*="limit-warning"]',
    '[class*="conversation-limit"]'
  ];
  const TOKEN_LIMIT_TEXT_PATTERNS = [
    /context (window|limit) (is |has been )?reached/i,
    /conversation (is |has become )?too long/i,
    /maximum (context|token) length/i,
    /this conversation is getting long/i,
    /start a new (chat|conversation)/i,
    /response was limited/i
  ];
  function queryShadow(host, selector) {
    if (host.shadowRoot) {
      const el = host.shadowRoot.querySelector(selector);
      if (el) return el;
    }
    return host.querySelector(selector);
  }
  class GeminiAdapter extends PlatformAdapter {
    constructor() {
      super();
      this._platform = "gemini";
    }
    // ── Interface implementation ───────────────────────────────────────────────
    getPlatformIdentifier() {
      return this._platform;
    }
    getConversationId() {
      const match = window.location.pathname.match(/\/(app|chat)\/([a-zA-Z0-9_-]+)/);
      return match ? match[2] : "unknown";
    }
    getChatContainer() {
      const chatWindow = document.querySelector("chat-window");
      if (chatWindow) return chatWindow;
      const conversation = document.querySelector("conversation");
      if (conversation) return conversation;
      const container = this._queryFirst(CHAT_CONTAINER_SELECTORS);
      if (!container) {
        console.warn("[LM-Source][GeminiAdapter] Could not locate chat container.");
      }
      return container;
    }
    getMessageElements() {
      const turns = Array.from(document.querySelectorAll("conversation-turn"));
      if (turns.length > 0) return turns;
      const listItems = Array.from(document.querySelectorAll('[role="listitem"]'));
      if (listItems.length > 0) return listItems;
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
      let text = "";
      if (role === "user") {
        text = this._extractUserText(element);
      } else if (role === "assistant") {
        text = this._extractAssistantText(element);
      } else {
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
      const bannerEl = this._queryFirst(TOKEN_LIMIT_SELECTORS);
      if (bannerEl) return true;
      const bodyText = document.body.innerText || "";
      return TOKEN_LIMIT_TEXT_PATTERNS.some((pattern) => pattern.test(bodyText));
    }
    // ── Private helpers ────────────────────────────────────────────────────────
    /**
     * Derive a stable message ID for a Gemini turn element.
     * @private
     */
    _deriveGeminiMessageId(el, index) {
      var _a;
      const explicit = el.getAttribute("data-id") || el.getAttribute("data-turn-id") || el.getAttribute("data-message-id") || ((_a = el.dataset) == null ? void 0 : _a.messageId) || el.id;
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
      var _a;
      const hasUserQuery = el.querySelector("user-query") || el.querySelector('[class*="user-query"]') || el.getAttribute("data-message-author-role") === "user";
      if (hasUserQuery) return "user";
      const hasModelResponse = el.querySelector("model-response") || el.querySelector('[class*="model-response"]') || el.getAttribute("data-message-author-role") === "assistant";
      if (hasModelResponse) return "assistant";
      const testid = (((_a = el.dataset) == null ? void 0 : _a.testid) || "").toLowerCase();
      if (testid.includes("user") || testid.includes("human")) return "user";
      if (testid.includes("model") || testid.includes("gemini") || testid.includes("assistant")) {
        return "assistant";
      }
      const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
      if (ariaLabel.includes("you") || ariaLabel.includes("user")) return "user";
      if (ariaLabel.includes("gemini") || ariaLabel.includes("model")) return "assistant";
      const cls = (el.className || "").toLowerCase();
      if (cls.includes("user") || cls.includes("human")) return "user";
      if (cls.includes("model") || cls.includes("gemini") || cls.includes("assistant")) {
        return "assistant";
      }
      return "unknown";
    }
    /**
     * Extract text from the user portion of a turn.
     * @private
     */
    _extractUserText(el) {
      const userQueryEl = el.querySelector("user-query") || el.querySelector('[class*="user-query"]');
      if (userQueryEl) {
        const shadowText = queryShadow(userQueryEl, 'p, [class*="query-text"], textarea');
        if (shadowText) return this._getText(shadowText);
        return this._getText(userQueryEl);
      }
      return "";
    }
    /**
     * Extract text from the model-response portion of a turn.
     * @private
     */
    _extractAssistantText(el) {
      const modelRespEl = el.querySelector("model-response") || el.querySelector('[class*="model-response"]');
      if (modelRespEl) {
        for (const sel of RESPONSE_TEXT_SELECTORS) {
          const textEl = queryShadow(modelRespEl, sel);
          if (textEl) return this._getText(textEl);
          const lightDom = modelRespEl.querySelector(sel);
          if (lightDom) return this._getText(lightDom);
        }
        return this._getText(modelRespEl);
      }
      const msgContent = el.querySelector("message-content") || el.querySelector('[class*="message-content"]');
      if (msgContent) return this._getText(msgContent);
      return "";
    }
  }
  const RECENT_VERBATIM_COUNT = 6;
  const TRUNCATE_LENGTH = 300;
  const MAX_CODE_BLOCK_CHARS = 1500;
  const DECISION_PATTERNS = [
    /\b(let'?s (go with|use|do)|we('ll| will) (use|build|implement))\b/i,
    /\b(final(ly)?|conclusion|decided|agreed|confirmed)\b/i,
    /\b(the (answer|solution|fix) is)\b/i,
    /\b(we('ve| have) (chosen|settled on|opted for))\b/i,
    /\b(best (approach|option|choice|practice) (is|would be))\b/i,
    /\b(recommend(ed)?|suggest(ed)?) (using|going with|to)\b/i,
    /\b(this (means|implies|confirms))\b/i,
    /\b(so (the plan is|we('ll| will)))\b/i
  ];
  const NEXT_STEP_PATTERNS = [
    /\b(next[,:]|now (let'?s|we)|step \d+|todo[:\s])\b/i,
    /\b(you (need|should|can) (now|next))\b/i,
    /\b(after (this|that)|then (we|you))\b/i,
    /\b(first[,\s]|second[,\s]|third[,\s]|finally[,\s])\b/i,
    /\b(the next (step|thing|task) (is|to))\b/i,
    /\b(go ahead and|proceed to|start (by|with))\b/i,
    /\b(run|execute|install|create|add|update|modify|deploy)\b/i
  ];
  const CODE_BLOCK_REGEX = /```[\s\S]*?```|`[^`\n]+`/g;
  const CODE_BLOCK_STRIP_REGEX = /```[\s\S]*?```|`[^`\n]+`/g;
  const DOMAIN_KEYWORDS = [
    "api",
    "database",
    "backend",
    "frontend",
    "server",
    "client",
    "authentication",
    "authorisation",
    "authorization",
    "deployment",
    "docker",
    "kubernetes",
    "lambda",
    "function",
    "endpoint",
    "schema",
    "migration",
    "refactor",
    "testing",
    "typescript",
    "javascript",
    "python",
    "rust",
    "react",
    "vue",
    "angular",
    "sql",
    "nosql",
    "graphql",
    "rest",
    "grpc",
    "oauth",
    "jwt",
    "redis",
    "postgres",
    "mongo",
    "webpack",
    "vite",
    "ci",
    "cd",
    "pipeline"
  ];
  function splitSentences(text) {
    const stripped = text.replace(CODE_BLOCK_STRIP_REGEX, "");
    return stripped.split(new RegExp("(?<=[.!?])\\s+")).map((s) => s.trim()).filter((s) => /\w/.test(s));
  }
  function truncate(text, maxChars = TRUNCATE_LENGTH) {
    if (text.length <= maxChars) return text;
    const sub = text.slice(0, maxChars);
    const lastPeriod = Math.max(sub.lastIndexOf(". "), sub.lastIndexOf(".\n"));
    return (lastPeriod > maxChars * 0.5 ? sub.slice(0, lastPeriod + 1) : sub) + "…";
  }
  function extractCodeBlocks(text) {
    const blocks = [];
    const re = new RegExp(CODE_BLOCK_REGEX.source, "g");
    let match;
    while ((match = re.exec(text)) !== null) {
      const raw = match[0];
      if (raw.startsWith("```")) {
        const inner = raw.slice(3, -3).trimStart();
        const firstNewline = inner.indexOf("\n");
        const language = firstNewline > 0 ? inner.slice(0, firstNewline).trim() : "";
        const code = firstNewline > 0 ? inner.slice(firstNewline + 1) : inner;
        blocks.push({ raw, language, code: code.trim() });
      } else {
        const code = raw.slice(1, -1);
        blocks.push({ raw, language: "inline", code });
      }
    }
    return blocks;
  }
  function mineTopics(texts) {
    const freq = /* @__PURE__ */ new Map();
    const bump = (token) => {
      const key = token.toLowerCase();
      freq.set(key, (freq.get(key) || 0) + 1);
    };
    for (const text of texts) {
      const stripped = text.replace(CODE_BLOCK_STRIP_REGEX, " ");
      for (const kw of DOMAIN_KEYWORDS) {
        const re = new RegExp(`\\b${kw}\\b`, "gi");
        const hits = (stripped.match(re) || []).length;
        if (hits > 0) {
          const existing = freq.get(kw) || 0;
          freq.set(kw, existing + hits);
        }
      }
      const sentences = splitSentences(stripped);
      for (const sentence of sentences) {
        const words = sentence.split(/\s+/);
        for (let i = 1; i < words.length; i++) {
          const w = words[i].replace(/[^a-zA-Z]/g, "");
          if (w.length < 2) continue;
          if (/^[A-Z][a-z]/.test(w)) {
            let phrase = w;
            for (let j = 1; j <= 2 && i + j < words.length; j++) {
              const next = words[i + j].replace(/[^a-zA-Z]/g, "");
              if (/^[A-Z][a-z]/.test(next) && next.length > 1) {
                phrase += " " + next;
              } else break;
            }
            bump(phrase);
          }
        }
      }
    }
    return Array.from(freq.entries()).filter(([, count]) => count >= 1).sort(([, a], [, b]) => b - a).slice(0, 15).map(([key]) => key);
  }
  function analyseMessages(messages) {
    const decisions = [];
    const nextSteps = [];
    const codeBlocks = [];
    for (const msg of messages) {
      const { messageId, role, text } = msg;
      const blocks = extractCodeBlocks(text);
      for (const block of blocks) {
        if (block.language !== "inline") {
          codeBlocks.push({ ...block, messageId });
        }
      }
      const sentences = splitSentences(text);
      for (const sentence of sentences) {
        const isDecision = DECISION_PATTERNS.some((p) => p.test(sentence));
        const isNextStep = NEXT_STEP_PATTERNS.some((p) => p.test(sentence));
        if (isDecision) {
          decisions.push({ sentence: sentence.trim(), messageId, role });
        }
        if (isNextStep) {
          nextSteps.push({ sentence: sentence.trim(), messageId, role });
        }
      }
    }
    const dedupe = (arr) => {
      const seen = /* @__PURE__ */ new Set();
      return arr.filter(({ sentence }) => {
        if (seen.has(sentence)) return false;
        seen.add(sentence);
        return true;
      });
    };
    return {
      decisions: dedupe(decisions),
      nextSteps: dedupe(nextSteps),
      codeBlocks
    };
  }
  function condenseMessages(messages) {
    const cutoff = Math.max(0, messages.length - RECENT_VERBATIM_COUNT);
    return messages.map((msg, idx) => {
      if (idx >= cutoff) {
        return { ...msg, verbatim: true };
      }
      return {
        ...msg,
        text: truncate(msg.text, TRUNCATE_LENGTH),
        verbatim: false
      };
    });
  }
  function buildHandoffPrompt(ctx) {
    const hr = "─".repeat(60);
    const lines = [];
    lines.push("You are continuing a conversation that was transferred from another AI assistant.");
    lines.push("Below is a structured summary. Read it carefully before responding.");
    lines.push("");
    lines.push(hr);
    lines.push("[CONTEXT SUMMARY]");
    lines.push(`Platform  : ${ctx.platform}`);
    lines.push(`Messages  : ${ctx.totalMessages} total (${ctx.assistantCount} assistant, ${ctx.userCount} user)`);
    if (ctx.topics.length > 0) {
      lines.push(`Topics    : ${ctx.topics.join(", ")}`);
    }
    lines.push("");
    if (ctx.decisions.length > 0) {
      lines.push(hr);
      lines.push("[KEY DECISIONS]");
      for (const d of ctx.decisions.slice(0, 10)) {
        lines.push(`• [${d.role.toUpperCase()}] ${d.sentence}`);
      }
      lines.push("");
    }
    if (ctx.codeBlocks.length > 0) {
      lines.push(hr);
      lines.push("[CODE]");
      for (const block of ctx.codeBlocks.slice(0, 5)) {
        const langTag = block.language ? block.language : "";
        const codeBody = block.code.length > MAX_CODE_BLOCK_CHARS ? block.code.slice(0, MAX_CODE_BLOCK_CHARS) + "\n… [truncated]" : block.code;
        lines.push("```" + langTag);
        lines.push(codeBody);
        lines.push("```");
        lines.push("");
      }
    }
    if (ctx.nextSteps.length > 0) {
      lines.push(hr);
      lines.push("[NEXT STEPS]");
      for (const s of ctx.nextSteps.slice(0, 8)) {
        lines.push(`→ [${s.role.toUpperCase()}] ${s.sentence}`);
      }
      lines.push("");
    }
    lines.push(hr);
    lines.push("[RECENT EXCHANGE]");
    const recent = ctx.condensed.filter((m) => m.verbatim);
    for (const msg of recent) {
      const label = msg.role === "user" ? "USER" : "ASSISTANT";
      lines.push(`
[${label}]`);
      lines.push(msg.text);
    }
    lines.push("");
    lines.push(hr);
    lines.push("[CONFIRMATION REQUEST]");
    lines.push("Please confirm you have understood the above context by briefly summarising:");
    lines.push("1. The main topic/goal of this conversation.");
    lines.push("2. Any key decisions already made.");
    lines.push("3. The next step you will help with.");
    lines.push("");
    lines.push("Then proceed with the continuation.");
    return lines.join("\n");
  }
  function extractContext(adapter2) {
    const elements = adapter2.getMessageElements();
    if (elements.length === 0) {
      console.warn("[LM-Source][ContextExtractor] No message elements found.");
      return null;
    }
    const messages = elements.map((el, idx) => adapter2.extractMessageData(el, idx)).filter(Boolean).filter((msg) => msg.text && msg.text.trim());
    if (messages.length === 0) {
      console.warn("[LM-Source][ContextExtractor] Messages found but text extraction yielded nothing.");
      return null;
    }
    const platform = adapter2.getPlatformIdentifier();
    const conversationId = adapter2.getConversationId();
    const userCount = messages.filter((m) => m.role === "user").length;
    const assistantCount = messages.filter((m) => m.role === "assistant").length;
    const { decisions, nextSteps, codeBlocks } = analyseMessages(messages);
    const condensed = condenseMessages(messages);
    const topics = mineTopics(messages.map((m) => m.text));
    const ctx = {
      platform,
      conversationId,
      totalMessages: messages.length,
      userCount,
      assistantCount,
      topics,
      decisions,
      nextSteps,
      codeBlocks,
      condensed,
      handoffPrompt: "",
      // filled below
      extractedAt: Date.now()
    };
    ctx.handoffPrompt = buildHandoffPrompt(ctx);
    console.log(
      `[LM-Source][ContextExtractor] Extracted context from ${messages.length} messages. Decisions: ${decisions.length}, Next steps: ${nextSteps.length}, Code blocks: ${codeBlocks.length}, Topics: ${topics.slice(0, 5).join(", ")}`
    );
    return ctx;
  }
  const PANEL_ID = "lms-context-panel";
  const TOGGLE_BTN_ID = "lms-context-toggle-btn";
  const STYLE_ID = "lms-context-styles";
  const PANEL_WIDTH = "400px";
  const Z_INDEX = "2147483640";
  const PLATFORM_LABELS = {
    claude: "🟣 Claude.ai",
    chatgpt: "🟢 ChatGPT",
    gemini: "🔵 Google Gemini",
    unknown: "❓ Unknown"
  };
  function buildStyles() {
    return `
/* ── LM-Source Context Panel — Injected Styles ── */

#${PANEL_ID} {
  position: fixed;
  top: 0;
  right: 0;
  width: ${PANEL_WIDTH};
  height: 100vh;
  background: linear-gradient(160deg, #0f1117 0%, #141824 100%);
  color: #e2e8f0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  line-height: 1.6;
  z-index: ${Z_INDEX};
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 32px rgba(0, 0, 0, 0.6);
  border-left: 1px solid rgba(99, 102, 241, 0.25);
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

#${PANEL_ID}.lms-panel-open {
  transform: translateX(0);
}

/* ── Header ── */
.lms-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
  background: rgba(99, 102, 241, 0.08);
  border-bottom: 1px solid rgba(99, 102, 241, 0.2);
  flex-shrink: 0;
}

.lms-panel-title {
  font-size: 14px;
  font-weight: 700;
  color: #a5b4fc;
  letter-spacing: 0.03em;
  display: flex;
  align-items: center;
  gap: 8px;
}

.lms-panel-title .lms-logo-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: linear-gradient(135deg, #818cf8, #34d399);
  box-shadow: 0 0 6px rgba(129, 140, 248, 0.6);
  animation: lms-pulse 2.5s ease-in-out infinite;
}

@keyframes lms-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.6; transform: scale(0.85); }
}

.lms-panel-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.lms-icon-btn {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1;
  transition: background 0.15s, color 0.15s;
  display: flex;
  align-items: center;
}
.lms-icon-btn:hover { background: rgba(99,102,241,0.15); color: #e2e8f0; }

/* ── Metadata row ── */
.lms-meta-row {
  padding: 8px 16px;
  background: rgba(15, 17, 23, 0.5);
  border-bottom: 1px solid rgba(255,255,255,0.05);
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 11px;
  color: #64748b;
  flex-shrink: 0;
}

.lms-meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(99,102,241,0.1);
  border: 1px solid rgba(99,102,241,0.2);
  border-radius: 999px;
  padding: 2px 9px;
  color: #818cf8;
  font-weight: 500;
  font-size: 10.5px;
}

/* ── Tab bar ── */
.lms-tab-bar {
  display: flex;
  background: rgba(15,17,23,0.7);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}

.lms-tab-btn {
  flex: 1;
  padding: 9px 4px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #64748b;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  text-align: center;
}
.lms-tab-btn:hover { color: #94a3b8; }
.lms-tab-btn.lms-active {
  color: #818cf8;
  border-bottom-color: #818cf8;
}

/* ── Scrollable body ── */
.lms-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(99,102,241,0.3) transparent;
}
.lms-panel-body::-webkit-scrollbar { width: 5px; }
.lms-panel-body::-webkit-scrollbar-thumb {
  background: rgba(99,102,241,0.35);
  border-radius: 999px;
}

/* ── Tab content panes ── */
.lms-tab-pane { display: none; padding: 14px 16px; }
.lms-tab-pane.lms-active { display: block; }

/* ── Section headings ── */
.lms-section-heading {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #4b5563;
  margin: 14px 0 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.lms-section-heading:first-child { margin-top: 0; }

/* ── Empty state ── */
.lms-empty {
  text-align: center;
  color: #374151;
  padding: 28px 16px;
  font-size: 12px;
}

/* ── Topics pills ── */
.lms-topics-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.lms-topic-pill {
  background: rgba(52, 211, 153, 0.1);
  border: 1px solid rgba(52, 211, 153, 0.2);
  color: #34d399;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 500;
  cursor: default;
}

/* ── Decision / Next-step cards ── */
.lms-card {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
  font-size: 12.5px;
  line-height: 1.55;
  position: relative;
  transition: border-color 0.15s;
}
.lms-card:hover { border-color: rgba(99,102,241,0.3); }

.lms-card-role {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  margin-bottom: 4px;
}
.lms-card-role.user { color: #60a5fa; }
.lms-card-role.assistant { color: #a78bfa; }
.lms-card-role.unknown { color: #94a3b8; }

.lms-decision-card { border-left: 3px solid rgba(251, 191, 36, 0.5); }
.lms-nextstep-card  { border-left: 3px solid rgba(52, 211, 153, 0.5); }

/* ── Code block cards ── */
.lms-code-card {
  background: rgba(15,17,23,0.9);
  border: 1px solid rgba(99,102,241,0.2);
  border-radius: 8px;
  margin-bottom: 10px;
  overflow: hidden;
}

.lms-code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: rgba(99,102,241,0.08);
  border-bottom: 1px solid rgba(99,102,241,0.15);
}

.lms-code-lang {
  font-size: 10.5px;
  font-weight: 600;
  color: #818cf8;
  text-transform: lowercase;
}

.lms-copy-btn {
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.15s, color 0.15s;
}
.lms-copy-btn:hover { background: rgba(99,102,241,0.15); color: #a5b4fc; }
.lms-copy-btn.lms-copied { color: #34d399; }

.lms-code-body {
  padding: 10px 12px;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 11.5px;
  line-height: 1.55;
  color: #cbd5e1;
  white-space: pre;
  overflow-x: auto;
  max-height: 240px;
  scrollbar-width: thin;
  scrollbar-color: rgba(99,102,241,0.3) transparent;
}

/* ── Handoff prompt textarea ── */
.lms-handoff-area {
  width: 100%;
  min-height: 220px;
  background: rgba(15,17,23,0.9);
  border: 1px solid rgba(99,102,241,0.2);
  border-radius: 8px;
  color: #cbd5e1;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  padding: 10px 12px;
  resize: vertical;
  line-height: 1.55;
  outline: none;
  transition: border-color 0.15s;
}
.lms-handoff-area:focus { border-color: rgba(99,102,241,0.5); }

.lms-handoff-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.lms-action-btn {
  flex: 1;
  min-width: 90px;
  padding: 8px 12px;
  border: 1px solid;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}
.lms-action-btn.primary {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border-color: transparent;
  color: #fff;
}
.lms-action-btn.primary:hover {
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  transform: translateY(-1px);
}
.lms-action-btn.secondary {
  background: transparent;
  border-color: rgba(99,102,241,0.35);
  color: #818cf8;
}
.lms-action-btn.secondary:hover {
  background: rgba(99,102,241,0.1);
  transform: translateY(-1px);
}
.lms-action-btn.success { background: rgba(52,211,153,0.15); border-color: rgba(52,211,153,0.35); color: #34d399; }

/* ── Condensed timeline ── */
.lms-timeline-msg {
  border-left: 2px solid rgba(255,255,255,0.06);
  margin-bottom: 10px;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #94a3b8;
  border-radius: 0 6px 6px 0;
  transition: border-color 0.15s;
}
.lms-timeline-msg.verbatim {
  border-left-color: rgba(99,102,241,0.4);
  color: #e2e8f0;
  background: rgba(99,102,241,0.04);
}
.lms-timeline-msg.user { border-left-color: rgba(96,165,250,0.4); }
.lms-timeline-msg.verbatim.user { background: rgba(96,165,250,0.04); }
.lms-timeline-msg.assistant { border-left-color: rgba(167,139,250,0.4); }
.lms-timeline-msg.verbatim.assistant { background: rgba(167,139,250,0.04); }

.lms-tl-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  margin-bottom: 3px;
}
.lms-timeline-msg.user .lms-tl-label { color: #60a5fa; }
.lms-timeline-msg.assistant .lms-tl-label { color: #a78bfa; }
.lms-timeline-msg.unknown .lms-tl-label { color: #64748b; }

.lms-verbatim-badge {
  font-size: 9px;
  background: rgba(99,102,241,0.2);
  color: #818cf8;
  border-radius: 4px;
  padding: 1px 5px;
  margin-left: 6px;
  font-weight: 600;
}

/* ── Floating toggle button ── */
#${TOGGLE_BTN_ID} {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: ${Number(Z_INDEX) - 1};
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  border: none;
  border-radius: 10px 0 0 10px;
  padding: 12px 8px;
  cursor: pointer;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  box-shadow: -2px 0 16px rgba(99,102,241,0.4);
  transition: padding 0.2s, background 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}
#${TOGGLE_BTN_ID}:hover {
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  padding-right: 12px;
}

/* ── Footer ── */
.lms-panel-footer {
  flex-shrink: 0;
  padding: 8px 14px;
  border-top: 1px solid rgba(255,255,255,0.05);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10.5px;
  color: #374151;
}

.lms-refresh-btn {
  background: none;
  border: 1px solid rgba(99,102,241,0.25);
  color: #6366f1;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.lms-refresh-btn:hover { background: rgba(99,102,241,0.1); }
`;
  }
  const getPanel = () => document.getElementById(PANEL_ID);
  function esc(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function activateTab(panel, tabId) {
    panel.querySelectorAll(".lms-tab-btn").forEach((btn) => {
      btn.classList.toggle("lms-active", btn.dataset.tab === tabId);
    });
    panel.querySelectorAll(".lms-tab-pane").forEach((pane) => {
      pane.classList.toggle("lms-active", pane.dataset.pane === tabId);
    });
  }
  function renderSummaryTab(ctx) {
    const timestamp = new Date(ctx.extractedAt).toLocaleTimeString();
    const topicPills = ctx.topics.length ? ctx.topics.map((t) => `<span class="lms-topic-pill">${esc(t)}</span>`).join("") : '<span class="lms-empty">No topics detected.</span>';
    return `
    <p class="lms-section-heading">Topics & Entities</p>
    <div class="lms-topics-wrap">${topicPills}</div>

    <p class="lms-section-heading">Stats</p>
    <div class="lms-meta-row" style="padding:0; border:none; background:none; gap:8px; flex-direction:column;">
      <div>💬 <strong>${ctx.totalMessages}</strong> total messages
        (<span style="color:#60a5fa">${ctx.userCount} user</span>,
         <span style="color:#a78bfa">${ctx.assistantCount} assistant</span>)
      </div>
      <div>🧠 <strong>${ctx.decisions.length}</strong> key decisions detected</div>
      <div>➡️ <strong>${ctx.nextSteps.length}</strong> next steps detected</div>
      <div>🖥️ <strong>${ctx.codeBlocks.length}</strong> code blocks extracted</div>
      <div style="color:#374151; font-size:11px; margin-top:4px;">Extracted at ${esc(timestamp)}</div>
    </div>
  `;
  }
  function renderDecisionsTab(ctx) {
    if (ctx.decisions.length === 0) {
      return `<div class="lms-empty">No decisions or conclusions detected in this conversation.</div>`;
    }
    const cards = ctx.decisions.map((d) => `
    <div class="lms-card lms-decision-card">
      <div class="lms-card-role ${esc(d.role)}">${esc(d.role)}</div>
      <div>${esc(d.sentence)}</div>
    </div>
  `).join("");
    const steps = ctx.nextSteps.length === 0 ? "" : `
    <p class="lms-section-heading">Next Steps</p>
    ${ctx.nextSteps.map((s) => `
      <div class="lms-card lms-nextstep-card">
        <div class="lms-card-role ${esc(s.role)}">${esc(s.role)}</div>
        <div>${esc(s.sentence)}</div>
      </div>
    `).join("")}
  `;
    return `
    <p class="lms-section-heading">Key Decisions (${ctx.decisions.length})</p>
    ${cards}
    ${steps}
  `;
  }
  function renderCodeTab(ctx) {
    if (ctx.codeBlocks.length === 0) {
      return `<div class="lms-empty">No fenced code blocks detected in this conversation.</div>`;
    }
    return ctx.codeBlocks.map((block, idx) => `
    <div class="lms-code-card" data-block-idx="${idx}">
      <div class="lms-code-header">
        <span class="lms-code-lang">${esc(block.language || "plaintext")}</span>
        <button class="lms-copy-btn" data-copy-idx="${idx}" title="Copy code">📋 Copy</button>
      </div>
      <pre class="lms-code-body">${esc(block.code)}</pre>
    </div>
  `).join("");
  }
  function renderTimelineTab(ctx) {
    if (ctx.condensed.length === 0) {
      return `<div class="lms-empty">No messages to display.</div>`;
    }
    return ctx.condensed.map((msg) => {
      const roleClass = msg.role === "user" ? "user" : msg.role === "assistant" ? "assistant" : "unknown";
      const badge = msg.verbatim ? `<span class="lms-verbatim-badge">VERBATIM</span>` : "";
      return `
      <div class="lms-timeline-msg ${roleClass} ${msg.verbatim ? "verbatim" : ""}">
        <div class="lms-tl-label">${esc(msg.role.toUpperCase())}${badge}</div>
        <div>${esc(msg.text)}</div>
      </div>
    `;
    }).join("");
  }
  function renderHandoffTab(ctx) {
    return `
    <p class="lms-section-heading">Structured Handoff Prompt</p>
    <p style="font-size:11.5px; color:#64748b; margin-bottom:10px;">
      This prompt packages your conversation context for seamless transfer to another LLM session.
      Copy it and paste it into a new chat to continue without losing context.
    </p>
    <textarea
      id="lms-handoff-textarea"
      class="lms-handoff-area"
      readonly
    >${esc(ctx.handoffPrompt)}</textarea>
    <div class="lms-handoff-actions">
      <button class="lms-action-btn primary" id="lms-copy-handoff">📋 Copy Prompt</button>
      <button class="lms-action-btn secondary" id="lms-open-claude">Open Claude</button>
      <button class="lms-action-btn secondary" id="lms-open-chatgpt">Open ChatGPT</button>
      <button class="lms-action-btn secondary" id="lms-open-gemini">Open Gemini</button>
    </div>
  `;
  }
  function buildPanelHTML(ctx) {
    const platformLabel = PLATFORM_LABELS[ctx.platform] || PLATFORM_LABELS.unknown;
    return `
    <div class="lms-panel-header">
      <div class="lms-panel-title">
        <span class="lms-logo-dot"></span>
        LM-Source Context
      </div>
      <div class="lms-panel-actions">
        <button class="lms-icon-btn" id="lms-close-btn" title="Close panel">✕</button>
      </div>
    </div>

    <div class="lms-meta-row">
      <span class="lms-meta-chip">${esc(platformLabel)}</span>
      <span class="lms-meta-chip">💬 ${ctx.totalMessages} msgs</span>
      <span class="lms-meta-chip">🧠 ${ctx.decisions.length} decisions</span>
    </div>

    <div class="lms-tab-bar">
      <button class="lms-tab-btn lms-active" data-tab="summary">Summary</button>
      <button class="lms-tab-btn" data-tab="decisions">Decisions</button>
      <button class="lms-tab-btn" data-tab="code">Code (${ctx.codeBlocks.length})</button>
      <button class="lms-tab-btn" data-tab="timeline">Timeline</button>
      <button class="lms-tab-btn" data-tab="handoff">Handoff</button>
    </div>

    <div class="lms-panel-body">
      <div class="lms-tab-pane lms-active" data-pane="summary">${renderSummaryTab(ctx)}</div>
      <div class="lms-tab-pane" data-pane="decisions">${renderDecisionsTab(ctx)}</div>
      <div class="lms-tab-pane" data-pane="code">${renderCodeTab(ctx)}</div>
      <div class="lms-tab-pane" data-pane="timeline">${renderTimelineTab(ctx)}</div>
      <div class="lms-tab-pane" data-pane="handoff">${renderHandoffTab(ctx)}</div>
    </div>

    <div class="lms-panel-footer">
      <span>LM-Source v1.1.0</span>
      <button class="lms-refresh-btn" id="lms-refresh-btn">↻ Refresh</button>
    </div>
  `;
  }
  let _onRefresh = null;
  function wireEvents(panel, ctx) {
    var _a, _b, _c, _d;
    panel.querySelectorAll(".lms-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => activateTab(panel, btn.dataset.tab));
    });
    (_a = panel.querySelector("#lms-close-btn")) == null ? void 0 : _a.addEventListener("click", () => ContextSidePanel.close());
    (_b = panel.querySelector("#lms-refresh-btn")) == null ? void 0 : _b.addEventListener("click", () => {
      if (typeof _onRefresh === "function") _onRefresh();
    });
    panel.querySelectorAll(".lms-copy-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.copyIdx);
        const block = ctx.codeBlocks[idx];
        if (!block) return;
        navigator.clipboard.writeText(block.code).then(() => {
          btn.textContent = "✅ Copied";
          btn.classList.add("lms-copied");
          setTimeout(() => {
            btn.textContent = "📋 Copy";
            btn.classList.remove("lms-copied");
          }, 1800);
        });
      });
    });
    (_c = panel.querySelector("#lms-copy-handoff")) == null ? void 0 : _c.addEventListener("click", () => {
      const btn = panel.querySelector("#lms-copy-handoff");
      navigator.clipboard.writeText(ctx.handoffPrompt).then(() => {
        if (btn) {
          btn.textContent = "✅ Copied!";
          btn.classList.add("success");
          setTimeout(() => {
            btn.textContent = "📋 Copy Prompt";
            btn.classList.remove("success");
          }, 2e3);
        }
      });
    });
    const platformUrls = {
      "#lms-open-claude": "https://claude.ai/new",
      "#lms-open-chatgpt": "https://chatgpt.com/",
      "#lms-open-gemini": "https://gemini.google.com/"
    };
    for (const [selector, url] of Object.entries(platformUrls)) {
      (_d = panel.querySelector(selector)) == null ? void 0 : _d.addEventListener("click", () => {
        chrome.runtime.sendMessage({
          type: "LMS_OPEN_URL",
          url
        });
      });
    }
  }
  const ContextSidePanel = {
    /**
     * Create or update the side panel with new extracted context.
     *
     * @param {import('../services/contextExtractor.js').ExtractedContext} ctx
     * @param {{ onRefresh?: Function }} [options]
     */
    render(ctx, { onRefresh } = {}) {
      _onRefresh = onRefresh || null;
      if (!document.getElementById(STYLE_ID)) {
        const styleEl = document.createElement("style");
        styleEl.id = STYLE_ID;
        styleEl.textContent = buildStyles();
        document.head.appendChild(styleEl);
      }
      let panel = getPanel();
      if (!panel) {
        panel = document.createElement("div");
        panel.id = PANEL_ID;
        panel.setAttribute("role", "complementary");
        panel.setAttribute("aria-label", "LM-Source Context Panel");
        document.body.appendChild(panel);
      }
      panel.innerHTML = buildPanelHTML(ctx);
      wireEvents(panel, ctx);
      if (!document.getElementById(TOGGLE_BTN_ID)) {
        const toggleBtn = document.createElement("button");
        toggleBtn.id = TOGGLE_BTN_ID;
        toggleBtn.title = "Toggle LM-Source Context Panel";
        toggleBtn.innerHTML = "✦ LM-Source";
        toggleBtn.addEventListener("click", () => ContextSidePanel.toggle());
        document.body.appendChild(toggleBtn);
      }
    },
    /** Show the panel. */
    open() {
      const panel = getPanel();
      if (panel) panel.classList.add("lms-panel-open");
    },
    /** Hide the panel. */
    close() {
      const panel = getPanel();
      if (panel) panel.classList.remove("lms-panel-open");
    },
    /** Toggle open/closed state. */
    toggle() {
      const panel = getPanel();
      if (panel) panel.classList.toggle("lms-panel-open");
    },
    /** Remove the panel and its toggle button from the DOM entirely. */
    destroy() {
      var _a, _b, _c;
      (_a = document.getElementById(PANEL_ID)) == null ? void 0 : _a.remove();
      (_b = document.getElementById(TOGGLE_BTN_ID)) == null ? void 0 : _b.remove();
      (_c = document.getElementById(STYLE_ID)) == null ? void 0 : _c.remove();
    },
    /** True if the panel currently exists in the DOM. */
    get isRendered() {
      return !!getPanel();
    },
    /** True if the panel is visible (open). */
    get isOpen() {
      var _a;
      return !!((_a = getPanel()) == null ? void 0 : _a.classList.contains("lms-panel-open"));
    }
  };
  const LOG_PREFIX = "[LM-Source]";
  const DEBOUNCE_MS = 400;
  const CONTAINER_POLL_INTERVAL_MS = 500;
  const CONTAINER_POLL_TIMEOUT_MS = 3e4;
  const hostname = window.location.hostname;
  let adapter = null;
  if (hostname.includes("claude.ai")) {
    adapter = new ClaudeAdapter();
  } else if (hostname.includes("chat.openai.com") || hostname.includes("chatgpt.com")) {
    adapter = new ChatGPTAdapter();
  } else if (hostname.includes("gemini.google.com")) {
    adapter = new GeminiAdapter();
  }
  if (!adapter) {
    console.warn(`${LOG_PREFIX} Unsupported platform: ${hostname}. Content script idle.`);
  } else {
    console.log(`${LOG_PREFIX} Adapter loaded for platform: ${adapter.getPlatformIdentifier()}`);
    init(adapter);
  }
  function emit(eventName, detail) {
    document.dispatchEvent(new CustomEvent(eventName, { detail }));
  }
  const seenMessageIds = /* @__PURE__ */ new Set();
  async function init(adapter2) {
    const platform = adapter2.getPlatformIdentifier();
    console.log(`${LOG_PREFIX} Waiting for chat container on ${platform}…`);
    const container = await waitForChatContainer(adapter2);
    if (!container) {
      console.warn(
        `${LOG_PREFIX} Chat container not found after ${CONTAINER_POLL_TIMEOUT_MS / 1e3}s. The adapter selectors may need updating.`
      );
      return;
    }
    const conversationId = adapter2.getConversationId();
    console.log(
      `${LOG_PREFIX} Chat container found. Platform: ${platform}, Conversation: ${conversationId}`
    );
    emit("lms:adapterReady", { adapter: adapter2, platform, conversationId });
    processCurrentMessages(adapter2);
    startMutationObserver(adapter2, container);
    watchForNavigation(adapter2);
  }
  function runContextExtraction(adapterRef) {
    const ctx = extractContext(adapterRef);
    if (!ctx) {
      console.warn(`${LOG_PREFIX} Context extraction returned nothing.`);
      return;
    }
    ContextSidePanel.render(ctx, {
      onRefresh: () => runContextExtraction(adapterRef)
    });
    ContextSidePanel.open();
  }
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if ((request == null ? void 0 : request.type) === "LMS_EXTRACT_CONTEXT") {
      if (!adapter) {
        sendResponse({ success: false, error: "No adapter active on this page." });
        return true;
      }
      try {
        runContextExtraction(adapter);
        sendResponse({ success: true });
      } catch (err) {
        console.error(`${LOG_PREFIX} Context extraction error:`, err);
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }
    if ((request == null ? void 0 : request.type) === "LMS_TOGGLE_PANEL") {
      ContextSidePanel.toggle();
      sendResponse({ success: true });
      return true;
    }
    return false;
  });
  document.addEventListener("lms:adapterReady", (e) => {
    const { adapter: readyAdapter } = e.detail;
    setTimeout(() => {
      const ctx = extractContext(readyAdapter);
      if (ctx) {
        ContextSidePanel.render(ctx, {
          onRefresh: () => runContextExtraction(readyAdapter)
        });
      }
    }, 1500);
  });
  function waitForChatContainer(adapter2) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const poll = () => {
        const container = adapter2.getChatContainer();
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
  function processCurrentMessages(adapter2) {
    const elements = adapter2.getMessageElements();
    console.log(`${LOG_PREFIX} Processing ${elements.length} existing message(s).`);
    elements.forEach((el, index) => {
      const data = adapter2.extractMessageData(el, index);
      if (!data) return;
      if (!seenMessageIds.has(data.messageId)) {
        seenMessageIds.add(data.messageId);
        console.log(
          `${LOG_PREFIX} [${data.role.toUpperCase()}] ${data.messageId}: "${data.text.slice(0, 80)}${data.text.length > 80 ? "…" : ""}"`
        );
        emit("lms:messageAdded", data);
      }
    });
  }
  function processNewMessage(adapter2, el, index) {
    const data = adapter2.extractMessageData(el, index);
    if (!data || seenMessageIds.has(data.messageId)) return;
    seenMessageIds.add(data.messageId);
    console.log(
      `${LOG_PREFIX} New message detected [${data.role.toUpperCase()}] ${data.messageId}: "${data.text.slice(0, 80)}${data.text.length > 80 ? "…" : ""}"`
    );
    emit("lms:messageAdded", data);
    checkTokenLimit(adapter2);
  }
  let _tokenLimitWarned = false;
  function checkTokenLimit(adapter2) {
    if (_tokenLimitWarned) return;
    if (adapter2.detectTokenLimitWarning()) {
      _tokenLimitWarned = true;
      const conversationId = adapter2.getConversationId();
      console.warn(`${LOG_PREFIX} ⚠ Token limit warning detected! Conversation: ${conversationId}`);
      emit("lms:tokenLimitWarning", {
        platform: adapter2.getPlatformIdentifier(),
        conversationId
      });
    }
  }
  let messageObserver = null;
  let debounceTimer = null;
  function startMutationObserver(adapter2, container) {
    if (messageObserver) {
      messageObserver.disconnect();
    }
    messageObserver = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const elements = adapter2.getMessageElements();
        elements.forEach((el, index) => processNewMessage(adapter2, el, index));
      }, DEBOUNCE_MS);
    });
    messageObserver.observe(container, {
      childList: true,
      // detect added/removed child nodes
      subtree: true,
      // watch the full subtree (streaming updates nested elements)
      characterData: false
      // ignore text mutations — we re-scan the full list
    });
    console.log(`${LOG_PREFIX} MutationObserver active on chat container.`);
  }
  function watchForNavigation(adapter2) {
    let lastPath = window.location.pathname;
    const originalPushState = history.pushState.bind(history);
    history.pushState = function(...args) {
      originalPushState(...args);
      onNavigate(adapter2, lastPath);
      lastPath = window.location.pathname;
    };
    window.addEventListener("popstate", () => {
      onNavigate(adapter2, lastPath);
      lastPath = window.location.pathname;
    });
  }
  function onNavigate(adapter2, previousPath) {
    const newPath = window.location.pathname;
    if (newPath === previousPath) return;
    console.log(`${LOG_PREFIX} SPA navigation detected: ${previousPath} → ${newPath}`);
    if (messageObserver) {
      messageObserver.disconnect();
      messageObserver = null;
    }
    seenMessageIds.clear();
    _tokenLimitWarned = false;
    setTimeout(() => init(adapter2), 500);
  }
  window.addEventListener("beforeunload", () => {
    if (messageObserver) {
      messageObserver.disconnect();
      console.log(`${LOG_PREFIX} MutationObserver disconnected.`);
    }
    clearTimeout(debounceTimer);
  });
})();
