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
  const PANEL_ID$2 = "lms-context-panel";
  const TOGGLE_BTN_ID$1 = "lms-context-toggle-btn";
  const STYLE_ID$7 = "lms-context-styles";
  const PANEL_WIDTH = "400px";
  const Z_INDEX$2 = "2147483640";
  const PLATFORM_LABELS = {
    claude: "🟣 Claude.ai",
    chatgpt: "🟢 ChatGPT",
    gemini: "🔵 Google Gemini",
    unknown: "❓ Unknown"
  };
  function buildStyles$4() {
    return `
/* ── LM-Source Context Panel — Injected Styles ── */

#${PANEL_ID$2} {
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
  z-index: ${Z_INDEX$2};
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 32px rgba(0, 0, 0, 0.6);
  border-left: 1px solid rgba(99, 102, 241, 0.25);
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

#${PANEL_ID$2}.lms-panel-open {
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
#${TOGGLE_BTN_ID$1} {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: ${Number(Z_INDEX$2) - 1};
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
#${TOGGLE_BTN_ID$1}:hover {
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
  const getPanel$1 = () => document.getElementById(PANEL_ID$2);
  function esc$1(str) {
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
    const topicPills = ctx.topics.length ? ctx.topics.map((t) => `<span class="lms-topic-pill">${esc$1(t)}</span>`).join("") : '<span class="lms-empty">No topics detected.</span>';
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
      <div style="color:#374151; font-size:11px; margin-top:4px;">Extracted at ${esc$1(timestamp)}</div>
    </div>
  `;
  }
  function renderDecisionsTab(ctx) {
    if (ctx.decisions.length === 0) {
      return `<div class="lms-empty">No decisions or conclusions detected in this conversation.</div>`;
    }
    const cards = ctx.decisions.map((d) => `
    <div class="lms-card lms-decision-card">
      <div class="lms-card-role ${esc$1(d.role)}">${esc$1(d.role)}</div>
      <div>${esc$1(d.sentence)}</div>
    </div>
  `).join("");
    const steps = ctx.nextSteps.length === 0 ? "" : `
    <p class="lms-section-heading">Next Steps</p>
    ${ctx.nextSteps.map((s) => `
      <div class="lms-card lms-nextstep-card">
        <div class="lms-card-role ${esc$1(s.role)}">${esc$1(s.role)}</div>
        <div>${esc$1(s.sentence)}</div>
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
        <span class="lms-code-lang">${esc$1(block.language || "plaintext")}</span>
        <button class="lms-copy-btn" data-copy-idx="${idx}" title="Copy code">📋 Copy</button>
      </div>
      <pre class="lms-code-body">${esc$1(block.code)}</pre>
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
        <div class="lms-tl-label">${esc$1(msg.role.toUpperCase())}${badge}</div>
        <div>${esc$1(msg.text)}</div>
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
    >${esc$1(ctx.handoffPrompt)}</textarea>
    <div class="lms-handoff-actions">
      <button class="lms-action-btn primary" id="lms-copy-handoff">📋 Copy Prompt</button>
      <button class="lms-action-btn secondary" id="lms-open-claude">Open Claude</button>
      <button class="lms-action-btn secondary" id="lms-open-chatgpt">Open ChatGPT</button>
      <button class="lms-action-btn secondary" id="lms-open-gemini">Open Gemini</button>
    </div>
  `;
  }
  function buildPanelHTML$1(ctx) {
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
      <span class="lms-meta-chip">${esc$1(platformLabel)}</span>
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
  function wireEvents$1(panel, ctx) {
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
      if (!document.getElementById(STYLE_ID$7)) {
        const styleEl = document.createElement("style");
        styleEl.id = STYLE_ID$7;
        styleEl.textContent = buildStyles$4();
        document.head.appendChild(styleEl);
      }
      let panel = getPanel$1();
      if (!panel) {
        panel = document.createElement("div");
        panel.id = PANEL_ID$2;
        panel.setAttribute("role", "complementary");
        panel.setAttribute("aria-label", "LM-Source Context Panel");
        document.body.appendChild(panel);
      }
      panel.innerHTML = buildPanelHTML$1(ctx);
      wireEvents$1(panel, ctx);
      if (!document.getElementById(TOGGLE_BTN_ID$1)) {
        const toggleBtn = document.createElement("button");
        toggleBtn.id = TOGGLE_BTN_ID$1;
        toggleBtn.title = "Toggle LM-Source Context Panel";
        toggleBtn.innerHTML = "✦ LM-Source";
        toggleBtn.addEventListener("click", () => ContextSidePanel.toggle());
        document.body.appendChild(toggleBtn);
      }
    },
    /** Show the panel. */
    open() {
      const panel = getPanel$1();
      if (panel) panel.classList.add("lms-panel-open");
    },
    /** Hide the panel. */
    close() {
      const panel = getPanel$1();
      if (panel) panel.classList.remove("lms-panel-open");
    },
    /** Toggle open/closed state. */
    toggle() {
      const panel = getPanel$1();
      if (panel) panel.classList.toggle("lms-panel-open");
    },
    /** Remove the panel and its toggle button from the DOM entirely. */
    destroy() {
      var _a, _b, _c;
      (_a = document.getElementById(PANEL_ID$2)) == null ? void 0 : _a.remove();
      (_b = document.getElementById(TOGGLE_BTN_ID$1)) == null ? void 0 : _b.remove();
      (_c = document.getElementById(STYLE_ID$7)) == null ? void 0 : _c.remove();
    },
    /** True if the panel currently exists in the DOM. */
    get isRendered() {
      return !!getPanel$1();
    },
    /** True if the panel is visible (open). */
    get isOpen() {
      var _a;
      return !!((_a = getPanel$1()) == null ? void 0 : _a.classList.contains("lms-panel-open"));
    }
  };
  const QUOTA_BYTES = 2 * 1024 * 1024;
  const QUOTA_WARN_THRESHOLD = 0.8;
  const QUOTA_EVICT_THRESHOLD = 0.9;
  const DATA_TYPES = Object.freeze({
    PIN: "pin",
    HIGHLIGHT: "highlight",
    EDIT: "edit",
    DELETED: "deleted",
    HANDOFF: "handoff",
    META: "meta"
  });
  function getNamespaceKey(platform, conversationId, type) {
    if (!platform || !conversationId || !type) {
      throw new Error(
        `[LM-Source][Storage] getNamespaceKey: all arguments are required. Received: platform="${platform}", conversationId="${conversationId}", type="${type}"`
      );
    }
    return `lms::${platform}::${conversationId}::${type}`;
  }
  async function get(key) {
    try {
      const result = await chrome.storage.local.get(key);
      return result[key];
    } catch (err) {
      console.error("[LM-Source][Storage] get() failed for key:", key, err);
      return void 0;
    }
  }
  async function set(key, value) {
    try {
      const stored = value !== null && typeof value === "object" && !Array.isArray(value) ? { ...value, _updatedAt: Date.now() } : value;
      await chrome.storage.local.set({ [key]: stored });
      return true;
    } catch (err) {
      console.error("[LM-Source][Storage] set() failed for key:", key, err);
      return false;
    }
  }
  async function remove(keys) {
    try {
      await chrome.storage.local.remove(keys);
      return true;
    } catch (err) {
      console.error("[LM-Source][Storage] remove() failed for keys:", keys, err);
      return false;
    }
  }
  async function getAll() {
    try {
      return await chrome.storage.local.get(null);
    } catch (err) {
      console.error("[LM-Source][Storage] getAll() failed:", err);
      return {};
    }
  }
  async function checkStorageQuota() {
    try {
      const usedBytes = await chrome.storage.local.getBytesInUse(null);
      const usedPercent = usedBytes / QUOTA_BYTES;
      if (usedPercent >= QUOTA_EVICT_THRESHOLD) {
        console.warn(
          `[LM-Source][Storage] ⚠ Storage at ${(usedPercent * 100).toFixed(1)}% of ${QUOTA_BYTES / 1024} KB budget. Evicting LRU entries…`
        );
        await _evictLRU();
      } else if (usedPercent >= QUOTA_WARN_THRESHOLD) {
        console.warn(
          `[LM-Source][Storage] ⚠ Storage at ${(usedPercent * 100).toFixed(1)}% of ${QUOTA_BYTES / 1024} KB budget.`
        );
      } else {
        console.log(
          `[LM-Source][Storage] Storage OK: ${(usedBytes / 1024).toFixed(1)} KB / ${QUOTA_BYTES / 1024} KB (${(usedPercent * 100).toFixed(1)}% used).`
        );
      }
      return { usedBytes, quotaBytes: QUOTA_BYTES, usedPercent };
    } catch (err) {
      console.error("[LM-Source][Storage] checkStorageQuota() failed:", err);
      return { usedBytes: 0, quotaBytes: QUOTA_BYTES, usedPercent: 0 };
    }
  }
  async function _evictLRU() {
    try {
      const all = await getAll();
      const candidates = Object.entries(all).filter(
        ([key, val]) => key.startsWith("lms::") && val !== null && typeof val === "object" && typeof val._updatedAt === "number"
      ).sort(([, a], [, b]) => a._updatedAt - b._updatedAt);
      let removed = 0;
      for (const [key] of candidates) {
        await remove(key);
        removed++;
        const usedBytes = await chrome.storage.local.getBytesInUse(null);
        if (usedBytes / QUOTA_BYTES < QUOTA_EVICT_THRESHOLD) break;
      }
      console.log(`[LM-Source][Storage] Evicted ${removed} LRU entries.`);
    } catch (err) {
      console.error("[LM-Source][Storage] _evictLRU() failed:", err);
    }
  }
  function createPin({ platform, conversationId, messageId, role, text, order = 0 }) {
    return {
      id: _generateId(),
      platform,
      conversationId,
      messageId,
      role,
      text,
      pinnedAt: Date.now(),
      order
    };
  }
  function createHighlight({
    platform,
    conversationId,
    messageId,
    text,
    color,
    startPath = "",
    startOffset = 0,
    endPath = "",
    endOffset = 0
  }) {
    return {
      id: _generateId(),
      platform,
      conversationId,
      messageId,
      text,
      color,
      startPath,
      startOffset,
      endPath,
      endOffset,
      createdAt: Date.now()
    };
  }
  function createEdit({ platform, conversationId, messageId, originalText, editedText }) {
    return {
      id: _generateId(),
      platform,
      conversationId,
      messageId,
      originalText,
      editedText,
      editedAt: Date.now()
    };
  }
  function createDeletedMessage({ platform, conversationId, messageId }) {
    return {
      id: _generateId(),
      platform,
      conversationId,
      messageId,
      deletedAt: Date.now()
    };
  }
  async function appendToCollection(platform, conversationId, type, item) {
    const key = getNamespaceKey(platform, conversationId, type);
    const existing = await get(key) || [];
    existing.push(item);
    const ok = await set(key, existing);
    if (ok) await checkStorageQuota();
    return ok;
  }
  async function getCollection(platform, conversationId, type) {
    const key = getNamespaceKey(platform, conversationId, type);
    return await get(key) || [];
  }
  async function removeFromCollection(platform, conversationId, type, itemId) {
    const key = getNamespaceKey(platform, conversationId, type);
    const collection = await get(key) || [];
    const filtered = collection.filter((item) => item.id !== itemId);
    if (filtered.length === collection.length) {
      console.warn(`[LM-Source][Storage] Item ${itemId} not found in ${key}`);
      return false;
    }
    return set(key, filtered);
  }
  async function setCollection(platform, conversationId, type, collection) {
    const key = getNamespaceKey(platform, conversationId, type);
    return set(key, collection);
  }
  function _generateId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  const _listeners$3 = /* @__PURE__ */ new Set();
  function _notify$3(event, detail) {
    _listeners$3.forEach((cb) => {
      try {
        cb(event, detail);
      } catch (e) {
        console.error("[LM-Source][PinService] Listener error:", e);
      }
    });
  }
  function onPinsChanged(cb) {
    _listeners$3.add(cb);
  }
  function offPinsChanged(cb) {
    _listeners$3.delete(cb);
  }
  async function pinMessage(messageData) {
    const { messageId, platform, conversationId, role, text } = messageData;
    const existing = await getCollection(platform, conversationId, DATA_TYPES.PIN);
    const order = existing.length;
    const pin = createPin({ platform, conversationId, messageId, role, text, order });
    const ok = await appendToCollection(platform, conversationId, DATA_TYPES.PIN, pin);
    if (!ok) {
      throw new Error(`[LM-Source][PinService] Failed to save pin for message ${messageId}`);
    }
    console.log(`[LM-Source][PinService] Pinned message ${messageId} (order ${order})`);
    _notify$3("pinned", { pin });
    return pin;
  }
  async function unpinMessage(pinId, platform, conversationId) {
    const ok = await removeFromCollection(platform, conversationId, DATA_TYPES.PIN, pinId);
    if (ok) {
      console.log(`[LM-Source][PinService] Unpinned pin ${pinId}`);
      _notify$3("unpinned", { pinId, platform, conversationId });
    }
    return ok;
  }
  async function getPins(platform, conversationId) {
    const pins = await getCollection(platform, conversationId, DATA_TYPES.PIN);
    return [...pins].sort((a, b) => a.order - b.order);
  }
  async function getAllPins() {
    const all = await getAll();
    const pins = [];
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith("lms::") || !key.endsWith(`::${DATA_TYPES.PIN}`)) continue;
      if (Array.isArray(value)) {
        pins.push(...value);
      }
    }
    return pins.sort((a, b) => a.order - b.order);
  }
  async function isPinned(messageId, platform, conversationId) {
    const pins = await getCollection(platform, conversationId, DATA_TYPES.PIN);
    return pins.find((p) => p.messageId === messageId) || null;
  }
  async function reorderPins(platform, conversationId, orderedPinIds) {
    const pins = await getCollection(platform, conversationId, DATA_TYPES.PIN);
    const pinMap = new Map(pins.map((p) => [p.id, p]));
    const reordered = orderedPinIds.map((id, idx) => {
      const pin = pinMap.get(id);
      if (!pin) return null;
      return { ...pin, order: idx };
    }).filter(Boolean);
    const ok = await setCollection(platform, conversationId, DATA_TYPES.PIN, reordered);
    if (ok) {
      _notify$3("reordered", { platform, conversationId, orderedPinIds });
    }
    return ok;
  }
  const PinService = Object.freeze({
    pinMessage,
    unpinMessage,
    getPins,
    getAllPins,
    isPinned,
    reorderPins,
    onPinsChanged,
    offPinsChanged
  });
  const TOOLBAR_ID$1 = "lms-msg-toolbar";
  const STYLE_ID$6 = "lms-toolbar-styles";
  const DATA_MSG_ID = "data-lms-msg-id";
  const DATA_ROLE = "data-lms-role";
  const TOOLBAR_OFFSET_Y = 6;
  const TOOLBAR_OFFSET_X = 8;
  function buildStyles$3() {
    return `
#${TOOLBAR_ID$1} {
  position: fixed;
  z-index: 2147483630;
  display: none;
  align-items: center;
  gap: 4px;
  background: rgba(15, 17, 27, 0.92);
  border: 1px solid rgba(99, 102, 241, 0.28);
  border-radius: 10px;
  padding: 4px 6px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: opacity 0.15s ease;
  pointer-events: auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

#${TOOLBAR_ID$1}.lms-tb-visible {
  display: flex;
}

.lms-tb-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 5px 6px;
  border-radius: 7px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.lms-tb-btn:hover {
  background: rgba(99, 102, 241, 0.15);
  color: #c7d2fe;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

.lms-tb-btn:active {
  transform: translateY(0);
}
.lms-tb-btn.lms-tb-active {
  color: #818cf8;
  background: rgba(99,102,241,0.18);
}
.lms-tb-btn.lms-tb-pinned {
  color: #f59e0b;
}
.lms-tb-btn.lms-tb-pinned:hover {
  color: #fbbf24;
  background: rgba(245,158,11,0.15);
}

/* Tooltip */
.lms-tb-btn::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(15,17,27,0.95);
  color: #e2e8f0;
  font-size: 10.5px;
  font-weight: 500;
  white-space: nowrap;
  padding: 3px 8px;
  border-radius: 5px;
  border: 1px solid rgba(99,102,241,0.2);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
}
.lms-tb-btn:hover::after { opacity: 1; }

/* Divider between button groups */
.lms-tb-divider {
  width: 1px;
  height: 16px;
  background: rgba(255,255,255,0.08);
  margin: 0 2px;
}

/* Pinned-message highlight ring on the message itself */
[data-lms-pinned="true"] {
  outline: 2px solid rgba(245, 158, 11, 0.3) !important;
  outline-offset: 2px !important;
  border-radius: 4px;
}
`;
  }
  const _actions = /* @__PURE__ */ new Map();
  let _currentEl = null;
  let _hideTimer = null;
  function getToolbar() {
    return document.getElementById(TOOLBAR_ID$1);
  }
  function createToolbar$1() {
    if (document.getElementById(STYLE_ID$6)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID$6;
    style.textContent = buildStyles$3();
    document.head.appendChild(style);
    const toolbar = document.createElement("div");
    toolbar.id = TOOLBAR_ID$1;
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "LM-Source message actions");
    document.body.appendChild(toolbar);
    toolbar.addEventListener("mouseenter", () => {
      clearTimeout(_hideTimer);
    });
    toolbar.addEventListener("mouseleave", () => {
      scheduleHide();
    });
  }
  function positionOver(el) {
    const toolbar = getToolbar();
    if (!toolbar) return;
    const rect = el.getBoundingClientRect();
    const tbRect = toolbar.getBoundingClientRect();
    let top = rect.top - tbRect.height - TOOLBAR_OFFSET_Y;
    let left = rect.right - tbRect.width - TOOLBAR_OFFSET_X;
    if (top < 8) top = rect.bottom + TOOLBAR_OFFSET_Y;
    if (left < 8) left = 8;
    toolbar.style.top = `${top}px`;
    toolbar.style.left = `${left}px`;
  }
  function renderToolbar(role, messageId, pinnedSet = /* @__PURE__ */ new Map()) {
    const toolbar = getToolbar();
    if (!toolbar) return;
    toolbar.innerHTML = "";
    let first = true;
    for (const [actionId, cfg] of _actions) {
      if (cfg.showFor && !cfg.showFor.includes(role) && !cfg.showFor.includes("all")) {
        continue;
      }
      if (!first) {
        if (cfg.groupBefore) {
          const div = document.createElement("span");
          div.className = "lms-tb-divider";
          toolbar.appendChild(div);
        }
      }
      first = false;
      const btn = document.createElement("button");
      btn.className = "lms-tb-btn";
      btn.dataset.action = actionId;
      btn.setAttribute("data-tooltip", cfg.tooltip);
      btn.setAttribute("aria-label", cfg.tooltip);
      btn.innerHTML = cfg.icon;
      if (actionId === "pin" && pinnedSet.has(messageId)) {
        btn.classList.add("lms-tb-pinned");
        btn.setAttribute("data-tooltip", "Unpin message");
        btn.setAttribute("aria-label", "Unpin message");
      }
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        cfg.onClick({ messageId, role, element: _currentEl, button: btn });
      });
      toolbar.appendChild(btn);
    }
  }
  function showToolbar$1() {
    var _a;
    clearTimeout(_hideTimer);
    (_a = getToolbar()) == null ? void 0 : _a.classList.add("lms-tb-visible");
  }
  function scheduleHide(delay = 250) {
    clearTimeout(_hideTimer);
    _hideTimer = setTimeout(() => {
      var _a;
      (_a = getToolbar()) == null ? void 0 : _a.classList.remove("lms-tb-visible");
      _currentEl = null;
    }, delay);
  }
  function attachToMessage(el, messageId, role, getPinnedSet) {
    if (el.dataset.lmsBound === "1") return;
    el.dataset.lmsBound = "1";
    el.setAttribute(DATA_MSG_ID, messageId);
    el.setAttribute(DATA_ROLE, role);
    el.addEventListener("mouseenter", async () => {
      clearTimeout(_hideTimer);
      _currentEl = el;
      const pinnedSet = typeof getPinnedSet === "function" ? await getPinnedSet() : /* @__PURE__ */ new Map();
      renderToolbar(role, messageId, pinnedSet);
      showToolbar$1();
      positionOver(el);
    });
    el.addEventListener("mousemove", () => {
      if (_currentEl === el) positionOver(el);
    });
    el.addEventListener("mouseleave", () => {
      scheduleHide();
    });
  }
  function setMessagePinnedState(messageId, isPinned2) {
    const el = document.querySelector(`[${DATA_MSG_ID}="${messageId}"]`);
    if (!el) return;
    if (isPinned2) {
      el.setAttribute("data-lms-pinned", "true");
    } else {
      el.removeAttribute("data-lms-pinned");
    }
  }
  function registerAction(id, config) {
    _actions.set(id, config);
  }
  function unregisterAction(id) {
    _actions.delete(id);
  }
  function init$3() {
    createToolbar$1();
  }
  function destroy$2() {
    var _a, _b;
    (_a = document.getElementById(TOOLBAR_ID$1)) == null ? void 0 : _a.remove();
    (_b = document.getElementById(STYLE_ID$6)) == null ? void 0 : _b.remove();
    _actions.clear();
    clearTimeout(_hideTimer);
  }
  const MessageToolbar = {
    init: init$3,
    destroy: destroy$2,
    registerAction,
    unregisterAction,
    attachToMessage,
    setMessagePinnedState
  };
  const PANEL_ID$1 = "lms-pinboard-panel";
  const TOGGLE_BTN_ID = "lms-pinboard-toggle";
  const STYLE_ID$5 = "lms-pinboard-styles";
  const Z_INDEX$1 = "2147483635";
  const ROLE_COLORS = {
    user: "#60a5fa",
    assistant: "#a78bfa",
    unknown: "#94a3b8"
  };
  function buildStyles$2() {
    return `
/* ── LM-Source Pinboard Panel ── */

#${PANEL_ID$1} {
  position: fixed;
  top: 0;
  left: 0;
  width: 380px;
  height: 100vh;
  background: linear-gradient(160deg, #0d1117 0%, #131b2e 100%);
  color: #e2e8f0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  line-height: 1.55;
  z-index: ${Z_INDEX$1};
  display: flex;
  flex-direction: column;
  box-shadow: 4px 0 32px rgba(0, 0, 0, 0.55);
  border-right: 1px solid rgba(245, 158, 11, 0.2);
  transform: translateX(-100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}
#${PANEL_ID$1}.lms-pb-open {
  transform: translateX(0);
}

/* Header */
.lms-pb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
  background: rgba(245, 158, 11, 0.07);
  border-bottom: 1px solid rgba(245, 158, 11, 0.18);
  flex-shrink: 0;
}
.lms-pb-title {
  font-size: 14px;
  font-weight: 700;
  color: #fbbf24;
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: 0.03em;
}
.lms-pb-pin-icon {
  font-size: 16px;
  animation: lms-pb-sway 3s ease-in-out infinite;
}
@keyframes lms-pb-sway {
  0%, 100% { transform: rotate(-8deg); }
  50%       { transform: rotate(8deg); }
}
.lms-pb-close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  font-size: 14px;
  transition: background 0.15s, color 0.15s;
}
.lms-pb-close-btn:hover { background: rgba(245,158,11,0.12); color: #fbbf24; }

/* Subtitle / meta */
.lms-pb-meta {
  padding: 8px 16px;
  font-size: 11px;
  color: #64748b;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.lms-pb-count {
  background: rgba(245,158,11,0.12);
  color: #f59e0b;
  border-radius: 999px;
  padding: 2px 9px;
  font-size: 10.5px;
  font-weight: 600;
}

/* Scrollable body */
.lms-pb-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  scrollbar-width: thin;
  scrollbar-color: rgba(245,158,11,0.25) transparent;
}
.lms-pb-body::-webkit-scrollbar { width: 4px; }
.lms-pb-body::-webkit-scrollbar-thumb {
  background: rgba(245,158,11,0.3);
  border-radius: 999px;
}

/* Empty state */
.lms-pb-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #374151;
  font-size: 12.5px;
  text-align: center;
  gap: 10px;
}
.lms-pb-empty-icon { font-size: 36px; opacity: 0.4; }

/* Pin card */
.lms-pb-card {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 10px;
  cursor: grab;
  position: relative;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
  user-select: none;
  border-left: 3px solid rgba(245, 158, 11, 0.5);
}
.lms-pb-card:hover {
  border-color: rgba(245,158,11,0.35);
  box-shadow: 0 2px 12px rgba(0,0,0,0.3);
}
.lms-pb-card.lms-pb-dragging {
  opacity: 0.45;
  cursor: grabbing;
}
.lms-pb-card.lms-pb-drag-over {
  border-color: rgba(245,158,11,0.7);
  box-shadow: 0 0 0 2px rgba(245,158,11,0.25);
  transform: scale(1.01);
}

/* Card header row */
.lms-pb-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 7px;
  gap: 8px;
}
.lms-pb-card-role {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}
.lms-pb-card-meta {
  font-size: 10px;
  color: #374151;
  white-space: nowrap;
}
.lms-pb-card-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}
.lms-pb-card:hover .lms-pb-card-actions { opacity: 1; }

.lms-pb-action-btn {
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 3px 6px;
  border-radius: 5px;
  font-size: 12px;
  transition: background 0.13s, color 0.13s;
}
.lms-pb-action-btn:hover { background: rgba(245,158,11,0.12); color: #fbbf24; }
.lms-pb-action-btn.unpin:hover { background: rgba(239,68,68,0.12); color: #f87171; }

/* Card body — truncated text */
.lms-pb-card-text {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.lms-pb-card-text.expanded {
  -webkit-line-clamp: unset;
}

/* Expand / collapse toggle */
.lms-pb-expand-btn {
  background: none;
  border: none;
  color: #6366f1;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 0;
  display: block;
  margin-top: 4px;
  transition: color 0.15s;
}
.lms-pb-expand-btn:hover { color: #818cf8; }

/* Drag handle */
.lms-pb-drag-handle {
  position: absolute;
  top: 50%;
  left: 6px;
  transform: translateY(-50%);
  color: rgba(255,255,255,0.12);
  font-size: 13px;
  cursor: grab;
  line-height: 1;
  user-select: none;
}

/* Footer */
.lms-pb-footer {
  flex-shrink: 0;
  padding: 8px 14px;
  border-top: 1px solid rgba(255,255,255,0.05);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10.5px;
  color: #374151;
}
.lms-pb-clear-btn {
  background: none;
  border: 1px solid rgba(239,68,68,0.25);
  color: #ef4444;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.lms-pb-clear-btn:hover { background: rgba(239,68,68,0.1); }

/* Floating toggle button (left edge, above ContextPanel's right-edge toggle) */
#${TOGGLE_BTN_ID} {
  position: fixed;
  left: 0;
  top: calc(50% + 40px);
  transform: translateY(-50%);
  z-index: ${Number(Z_INDEX$1) - 1};
  background: linear-gradient(135deg, #b45309, #d97706);
  color: #fff;
  border: none;
  border-radius: 0 10px 10px 0;
  padding: 12px 8px;
  cursor: pointer;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  box-shadow: 2px 0 16px rgba(180,83,9,0.4);
  transition: padding 0.2s, background 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}
#${TOGGLE_BTN_ID}:hover {
  background: linear-gradient(135deg, #92400e, #b45309);
  padding-left: 12px;
}
`;
  }
  const getPanel = () => document.getElementById(PANEL_ID$1);
  function esc(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fmtDate(ts) {
    return new Date(ts).toLocaleString(void 0, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  function buildCardHTML(pin) {
    const roleColor = ROLE_COLORS[pin.role] || ROLE_COLORS.unknown;
    const preview = pin.text.length > 350 ? pin.text.slice(0, 350) + "…" : pin.text;
    const hasMore = pin.text.length > 350;
    return `
    <div class="lms-pb-card"
         draggable="true"
         data-pin-id="${esc(pin.id)}"
         data-message-id="${esc(pin.messageId)}">
      <span class="lms-pb-drag-handle" aria-hidden="true">⋮⋮</span>
      <div class="lms-pb-card-header">
        <span class="lms-pb-card-role" style="color:${roleColor}">
          ${esc(pin.role)}
        </span>
        <span class="lms-pb-card-meta">${esc(fmtDate(pin.pinnedAt))}</span>
        <div class="lms-pb-card-actions">
          <button class="lms-pb-action-btn copy-pin"
                  data-pin-id="${esc(pin.id)}"
                  title="Copy text">📋</button>
          <button class="lms-pb-action-btn unpin"
                  data-pin-id="${esc(pin.id)}"
                  title="Unpin">✕</button>
        </div>
      </div>
      <div class="lms-pb-card-text" data-pin-id="${esc(pin.id)}">${esc(preview)}</div>
      ${hasMore ? `
        <button class="lms-pb-expand-btn" data-pin-id="${esc(pin.id)}"
                data-full-text="${esc(pin.text)}">Show more ▾</button>
      ` : ""}
    </div>
  `;
  }
  let _dragId = null;
  let _onReorder = null;
  function wireDragDrop(panel) {
    const body = panel.querySelector(".lms-pb-body");
    if (!body) return;
    body.addEventListener("dragstart", (e) => {
      const card = e.target.closest(".lms-pb-card");
      if (!card) return;
      _dragId = card.dataset.pinId;
      card.classList.add("lms-pb-dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", _dragId);
    });
    body.addEventListener("dragend", (e) => {
      const card = e.target.closest(".lms-pb-card");
      if (card) card.classList.remove("lms-pb-dragging");
      body.querySelectorAll(".lms-pb-drag-over").forEach((el) => el.classList.remove("lms-pb-drag-over"));
    });
    body.addEventListener("dragover", (e) => {
      e.preventDefault();
      const card = e.target.closest(".lms-pb-card");
      body.querySelectorAll(".lms-pb-drag-over").forEach((el) => el.classList.remove("lms-pb-drag-over"));
      if (card && card.dataset.pinId !== _dragId) {
        card.classList.add("lms-pb-drag-over");
      }
    });
    body.addEventListener("drop", (e) => {
      e.preventDefault();
      const targetCard = e.target.closest(".lms-pb-card");
      if (!targetCard || !_dragId) return;
      const targetId = targetCard.dataset.pinId;
      if (targetId === _dragId) return;
      const dragCard = body.querySelector(`[data-pin-id="${_dragId}"]`);
      if (!dragCard) return;
      const cards = [...body.querySelectorAll(".lms-pb-card")];
      const dragIdx = cards.findIndex((c) => c.dataset.pinId === _dragId);
      const targetIdx = cards.findIndex((c) => c.dataset.pinId === targetId);
      if (dragIdx < targetIdx) {
        targetCard.after(dragCard);
      } else {
        targetCard.before(dragCard);
      }
      const newOrder = [...body.querySelectorAll(".lms-pb-card")].map((c) => c.dataset.pinId);
      if (typeof _onReorder === "function") {
        _onReorder(newOrder);
      }
      targetCard.classList.remove("lms-pb-drag-over");
      _dragId = null;
    });
  }
  let _onUnpin = null;
  function wireEvents(panel) {
    var _a, _b, _c;
    (_a = panel.querySelector(".lms-pb-close-btn")) == null ? void 0 : _a.addEventListener("click", () => PinboardPanel.close());
    (_b = panel.querySelector(".lms-pb-clear-btn")) == null ? void 0 : _b.addEventListener("click", () => {
      if (confirm("Remove all pinned messages? This cannot be undone.")) {
        if (typeof _onUnpin === "function") {
          const cards = panel.querySelectorAll(".lms-pb-card");
          cards.forEach((c) => _onUnpin(c.dataset.pinId, true));
        }
      }
    });
    (_c = panel.querySelector(".lms-pb-body")) == null ? void 0 : _c.addEventListener("click", (e) => {
      var _a2, _b2;
      const copyBtn = e.target.closest(".copy-pin");
      if (copyBtn) {
        const pinId = copyBtn.dataset.pinId;
        const card = panel.querySelector(`.lms-pb-card[data-pin-id="${pinId}"]`);
        const fullText = ((_a2 = card == null ? void 0 : card.querySelector(".lms-pb-expand-btn")) == null ? void 0 : _a2.dataset.fullText) || ((_b2 = card == null ? void 0 : card.querySelector(".lms-pb-card-text")) == null ? void 0 : _b2.textContent) || "";
        navigator.clipboard.writeText(fullText.trim()).then(() => {
          copyBtn.textContent = "✅";
          setTimeout(() => {
            copyBtn.textContent = "📋";
          }, 1600);
        });
        return;
      }
      const unpinBtn = e.target.closest(".unpin");
      if (unpinBtn) {
        const pinId = unpinBtn.dataset.pinId;
        if (typeof _onUnpin === "function") _onUnpin(pinId, false);
        return;
      }
      const expandBtn = e.target.closest(".lms-pb-expand-btn");
      if (expandBtn) {
        const pinId = expandBtn.dataset.pinId;
        const textEl = panel.querySelector(`.lms-pb-card-text[data-pin-id="${pinId}"]`);
        const isExp = textEl == null ? void 0 : textEl.classList.contains("expanded");
        if (textEl) {
          textEl.classList.toggle("expanded");
          if (!isExp) {
            textEl.textContent = expandBtn.dataset.fullText || textEl.textContent;
          } else {
            const full = expandBtn.dataset.fullText || textEl.textContent;
            textEl.textContent = full.slice(0, 350) + (full.length > 350 ? "…" : "");
          }
          expandBtn.textContent = isExp ? "Show more ▾" : "Show less ▴";
        }
      }
    });
    wireDragDrop(panel);
  }
  function buildPanelHTML(pins, platform, conversationId) {
    const count = pins.length;
    const cardsHTML = count === 0 ? `<div class="lms-pb-empty">
         <span class="lms-pb-empty-icon">📌</span>
         <span>No pins yet.<br>Hover a message and click 📌 to pin it.</span>
       </div>` : pins.map(buildCardHTML).join("");
    return `
    <div class="lms-pb-header">
      <div class="lms-pb-title">
        <span class="lms-pb-pin-icon">📌</span>
        Pinboard
      </div>
      <button class="lms-pb-close-btn" aria-label="Close pinboard">✕</button>
    </div>

    <div class="lms-pb-meta">
      <span>${esc(platform)} · ${esc(conversationId)}</span>
      <span class="lms-pb-count">${count} pin${count !== 1 ? "s" : ""}</span>
    </div>

    <div class="lms-pb-body">${cardsHTML}</div>

    <div class="lms-pb-footer">
      <span>Drag cards to reorder</span>
      ${count > 0 ? '<button class="lms-pb-clear-btn">Clear all</button>' : ""}
    </div>
  `;
  }
  let _pins = [];
  const PinboardPanel = {
    /**
     * Create or refresh the panel.
     *
     * @param {import('../services/types.js').Pin[]} pins
     * @param {{
     *   platform:       string,
     *   conversationId: string,
     *   onUnpin:        (pinId: string, clearAll: boolean) => void,
     *   onReorder:      (orderedPinIds: string[]) => void,
     * }} options
     */
    render(pins, { platform = "unknown", conversationId = "", onUnpin, onReorder } = {}) {
      _pins = pins;
      _onUnpin = onUnpin || null;
      _onReorder = onReorder || null;
      if (!document.getElementById(STYLE_ID$5)) {
        const style = document.createElement("style");
        style.id = STYLE_ID$5;
        style.textContent = buildStyles$2();
        document.head.appendChild(style);
      }
      let panel = getPanel();
      if (!panel) {
        panel = document.createElement("div");
        panel.id = PANEL_ID$1;
        panel.setAttribute("role", "complementary");
        panel.setAttribute("aria-label", "LM-Source Pinboard");
        document.body.appendChild(panel);
      }
      panel.innerHTML = buildPanelHTML(pins, platform, conversationId);
      wireEvents(panel);
      if (!document.getElementById(TOGGLE_BTN_ID)) {
        const toggleBtn = document.createElement("button");
        toggleBtn.id = TOGGLE_BTN_ID;
        toggleBtn.title = "Toggle Pinboard";
        toggleBtn.innerHTML = "📌 Pins";
        toggleBtn.addEventListener("click", () => PinboardPanel.toggle());
        document.body.appendChild(toggleBtn);
      }
    },
    /** Open the panel. */
    open() {
      var _a;
      (_a = getPanel()) == null ? void 0 : _a.classList.add("lms-pb-open");
    },
    /** Close the panel. */
    close() {
      var _a;
      (_a = getPanel()) == null ? void 0 : _a.classList.remove("lms-pb-open");
    },
    /** Toggle open/closed. */
    toggle() {
      var _a;
      (_a = getPanel()) == null ? void 0 : _a.classList.toggle("lms-pb-open");
    },
    /**
     * Optimistically add a pin card to the panel without a full re-render.
     * @param {import('../services/types.js').Pin} pin
     */
    addPin(pin) {
      const panel = getPanel();
      if (!panel) return;
      const empty = panel.querySelector(".lms-pb-empty");
      if (empty) empty.remove();
      const body = panel.querySelector(".lms-pb-body");
      if (body) {
        const tmp = document.createElement("div");
        tmp.innerHTML = buildCardHTML(pin);
        const card = tmp.firstElementChild;
        if (card) {
          body.appendChild(card);
          _pins = [..._pins, pin];
          const chip = panel.querySelector(".lms-pb-count");
          if (chip) chip.textContent = `${_pins.length} pin${_pins.length !== 1 ? "s" : ""}`;
          const footer = panel.querySelector(".lms-pb-footer");
          if (footer && !footer.querySelector(".lms-pb-clear-btn")) {
            const btn = document.createElement("button");
            btn.className = "lms-pb-clear-btn";
            btn.textContent = "Clear all";
            btn.addEventListener("click", () => {
              if (confirm("Remove all pinned messages?")) {
                _pins.forEach((p) => typeof _onUnpin === "function" && _onUnpin(p.id, true));
              }
            });
            footer.appendChild(btn);
          }
          wireDragDrop(panel);
        }
      }
    },
    /**
     * Optimistically remove a pin card.
     * @param {string} pinId
     */
    removePin(pinId) {
      var _a, _b;
      const panel = getPanel();
      if (!panel) return;
      (_a = panel.querySelector(`.lms-pb-card[data-pin-id="${pinId}"]`)) == null ? void 0 : _a.remove();
      _pins = _pins.filter((p) => p.id !== pinId);
      const chip = panel.querySelector(".lms-pb-count");
      if (chip) chip.textContent = `${_pins.length} pin${_pins.length !== 1 ? "s" : ""}`;
      const body = panel.querySelector(".lms-pb-body");
      if (body && _pins.length === 0) {
        body.innerHTML = `<div class="lms-pb-empty">
        <span class="lms-pb-empty-icon">📌</span>
        <span>No pins yet.<br>Hover a message and click 📌 to pin it.</span>
      </div>`;
        (_b = panel.querySelector(".lms-pb-clear-btn")) == null ? void 0 : _b.remove();
      }
    },
    /** Remove panel + toggle from DOM. */
    destroy() {
      var _a, _b, _c;
      (_a = document.getElementById(PANEL_ID$1)) == null ? void 0 : _a.remove();
      (_b = document.getElementById(TOGGLE_BTN_ID)) == null ? void 0 : _b.remove();
      (_c = document.getElementById(STYLE_ID$5)) == null ? void 0 : _c.remove();
      _pins = [];
    },
    get isOpen() {
      var _a;
      return !!((_a = getPanel()) == null ? void 0 : _a.classList.contains("lms-pb-open"));
    },
    get isRendered() {
      return !!getPanel();
    }
  };
  const HIDDEN_CLASS = "lms-deleted-hidden";
  const REVEALED_CLASS = "lms-deleted-revealed";
  const STYLE_ID$4 = "lms-delete-styles";
  function ensureStyles$5() {
    if (document.getElementById(STYLE_ID$4)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID$4;
    style.textContent = `
/* LM-Source — soft-deleted message state */

/* Hidden: collapse with a fade-out and a subtle placeholder */
.${HIDDEN_CLASS} {
  position: relative;
  overflow: hidden;
  max-height: 0 !important;
  opacity: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  pointer-events: none;
  transition: max-height 0.25s ease, opacity 0.2s ease;
}

/* Revealed: show with a dimmed, faded look so it's clearly not "real" */
.${HIDDEN_CLASS}.${REVEALED_CLASS} {
  max-height: 2000px !important;
  opacity: 0.35 !important;
  pointer-events: auto;
  outline: 2px dashed rgba(239, 68, 68, 0.35) !important;
  outline-offset: 2px !important;
  border-radius: 4px;
  filter: grayscale(40%);
  transition: max-height 0.25s ease, opacity 0.2s ease;
}

/* "Deleted" badge shown when message is in revealed state */
.${HIDDEN_CLASS}.${REVEALED_CLASS}::before {
  content: '🗑 Deleted (local view only)';
  position: absolute;
  top: 4px;
  right: 8px;
  font-size: 10px;
  font-weight: 600;
  color: rgba(239, 68, 68, 0.7);
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 4px;
  padding: 2px 7px;
  z-index: 10;
  pointer-events: none;
}

/* Bulk-select checkbox overlay on message hover */
.lms-bulk-checkbox {
  position: absolute;
  top: 10px;
  left: -28px;
  width: 18px;
  height: 18px;
  accent-color: #ef4444;
  cursor: pointer;
  z-index: 20;
  opacity: 0;
  transition: opacity 0.15s;
}
.lms-bulk-mode [data-lms-msg-id] {
  position: relative;
}
.lms-bulk-mode .lms-bulk-checkbox {
  opacity: 1;
}

/* Bulk-mode banner */
#lms-bulk-banner {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483638;
  background: rgba(15, 17, 27, 0.96);
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: 14px;
  padding: 10px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  color: #e2e8f0;
  backdrop-filter: blur(10px);
}
#lms-bulk-banner-count {
  color: #f87171;
  font-weight: 700;
}
.lms-bulk-action-btn {
  padding: 6px 16px;
  border-radius: 8px;
  border: none;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.lms-bulk-action-btn.delete {
  background: linear-gradient(135deg, #dc2626, #ef4444);
  color: #fff;
}
.lms-bulk-action-btn.delete:hover { background: linear-gradient(135deg, #b91c1c, #dc2626); }
.lms-bulk-action-btn.cancel {
  background: rgba(255,255,255,0.06);
  color: #94a3b8;
  border: 1px solid rgba(255,255,255,0.1);
}
.lms-bulk-action-btn.cancel:hover { background: rgba(255,255,255,0.1); }
`;
    document.head.appendChild(style);
  }
  const _listeners$2 = /* @__PURE__ */ new Set();
  function _notify$2(event, detail) {
    _listeners$2.forEach((cb) => {
      try {
        cb(event, detail);
      } catch (e) {
        console.error("[LM-Source][DeleteService] Listener error:", e);
      }
    });
  }
  function onDeletedChanged(cb) {
    _listeners$2.add(cb);
  }
  function offDeletedChanged(cb) {
    _listeners$2.delete(cb);
  }
  let _showDeleted = false;
  function setDeletedVisible(visible) {
    _showDeleted = visible;
    document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach((el) => {
      el.classList.toggle(REVEALED_CLASS, visible);
    });
    _notify$2("visibilityChanged", { visible });
  }
  function getDeletedVisible() {
    return _showDeleted;
  }
  async function _loadRecords$2(platform, conversationId) {
    return getCollection(platform, conversationId, DATA_TYPES.DELETED);
  }
  async function _saveRecords$2(platform, conversationId, records) {
    return setCollection(platform, conversationId, DATA_TYPES.DELETED, records);
  }
  function _findElement(messageId) {
    return document.querySelector(`[data-lms-msg-id="${messageId}"]`);
  }
  function _hideElement(el) {
    el.classList.add(HIDDEN_CLASS);
    if (_showDeleted) el.classList.add(REVEALED_CLASS);
  }
  function _showElement(el) {
    el.classList.remove(HIDDEN_CLASS, REVEALED_CLASS);
  }
  async function softDeleteMessage(messageId, platform, conversationId) {
    ensureStyles$5();
    const records = await _loadRecords$2(platform, conversationId);
    if (records.find((r) => r.messageId === messageId)) {
      return records.find((r) => r.messageId === messageId);
    }
    const record = createDeletedMessage({ platform, conversationId, messageId });
    records.push(record);
    await _saveRecords$2(platform, conversationId, records);
    const el = _findElement(messageId);
    if (el) _hideElement(el);
    console.log(`[LM-Source][DeleteService] Soft-deleted message ${messageId}`);
    _notify$2("deleted", { messageId, platform, conversationId });
    return record;
  }
  async function restoreMessage(messageId, platform, conversationId) {
    const records = await _loadRecords$2(platform, conversationId);
    const updated = records.filter((r) => r.messageId !== messageId);
    if (updated.length === records.length) return false;
    await _saveRecords$2(platform, conversationId, updated);
    const el = _findElement(messageId);
    if (el) _showElement(el);
    console.log(`[LM-Source][DeleteService] Restored message ${messageId}`);
    _notify$2("restored", { messageId, platform, conversationId });
    return true;
  }
  async function isDeleted(messageId, platform, conversationId) {
    const records = await _loadRecords$2(platform, conversationId);
    return records.some((r) => r.messageId === messageId);
  }
  async function getDeletedIds(platform, conversationId) {
    const records = await _loadRecords$2(platform, conversationId);
    return new Set(records.map((r) => r.messageId));
  }
  async function softDeleteBulk(messageIds, platform, conversationId) {
    ensureStyles$5();
    const records = await _loadRecords$2(platform, conversationId);
    const existingIds = new Set(records.map((r) => r.messageId));
    const newRecords = messageIds.filter((id) => !existingIds.has(id)).map((id) => createDeletedMessage({ platform, conversationId, messageId: id }));
    await _saveRecords$2(platform, conversationId, [...records, ...newRecords]);
    for (const id of messageIds) {
      const el = _findElement(id);
      if (el) _hideElement(el);
    }
    console.log(`[LM-Source][DeleteService] Bulk-deleted ${newRecords.length} message(s)`);
    _notify$2("bulkDeleted", { messageIds, platform, conversationId });
  }
  async function restoreAll(platform, conversationId) {
    const records = await _loadRecords$2(platform, conversationId);
    for (const r of records) {
      const el = _findElement(r.messageId);
      if (el) _showElement(el);
    }
    await _saveRecords$2(platform, conversationId, []);
    console.log(`[LM-Source][DeleteService] Restored all ${records.length} deleted message(s)`);
    _notify$2("restoredAll", { platform, conversationId });
  }
  async function applyDeletedState(adapterRef, platform, conversationId) {
    ensureStyles$5();
    const deletedIds = await getDeletedIds(platform, conversationId);
    if (deletedIds.size === 0) return 0;
    let count = 0;
    const elements = adapterRef.getMessageElements();
    elements.forEach((el, idx) => {
      const data = adapterRef.extractMessageData(el, idx);
      if (!data) return;
      if (deletedIds.has(data.messageId)) {
        el.setAttribute("data-lms-msg-id", data.messageId);
        _hideElement(el);
        count++;
      }
    });
    console.log(`[LM-Source][DeleteService] Re-applied hidden state to ${count} message(s) after load`);
    return count;
  }
  let _bulkSelection = /* @__PURE__ */ new Set();
  let _bulkMode = false;
  let _onBulkCommit = null;
  function enterBulkMode(messageElements, onCommit) {
    if (_bulkMode) return;
    _bulkMode = true;
    _bulkSelection = /* @__PURE__ */ new Set();
    _onBulkCommit = onCommit;
    ensureStyles$5();
    document.body.classList.add("lms-bulk-mode");
    messageElements.forEach((el) => {
      const msgId = el.getAttribute("data-lms-msg-id");
      if (!msgId) return;
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "lms-bulk-checkbox";
      cb.dataset.msgId = msgId;
      cb.addEventListener("change", () => {
        if (cb.checked) {
          _bulkSelection.add(msgId);
        } else {
          _bulkSelection.delete(msgId);
        }
        _updateBulkBanner();
      });
      el.appendChild(cb);
    });
    _showBulkBanner();
  }
  function _showBulkBanner() {
    if (document.getElementById("lms-bulk-banner")) return;
    const banner = document.createElement("div");
    banner.id = "lms-bulk-banner";
    banner.innerHTML = `
    <span>Selected: <strong id="lms-bulk-banner-count">0</strong> message(s)</span>
    <button class="lms-bulk-action-btn delete" id="lms-bulk-delete-btn">🗑 Delete Selected</button>
    <button class="lms-bulk-action-btn cancel" id="lms-bulk-cancel-btn">Cancel</button>
  `;
    document.body.appendChild(banner);
    document.getElementById("lms-bulk-delete-btn").addEventListener("click", () => {
      const ids = [..._bulkSelection];
      if (ids.length === 0) return;
      if (typeof _onBulkCommit === "function") _onBulkCommit(ids);
      exitBulkMode();
    });
    document.getElementById("lms-bulk-cancel-btn").addEventListener("click", exitBulkMode);
  }
  function _updateBulkBanner() {
    const countEl = document.getElementById("lms-bulk-banner-count");
    if (countEl) countEl.textContent = String(_bulkSelection.size);
  }
  function exitBulkMode() {
    var _a;
    _bulkMode = false;
    _bulkSelection = /* @__PURE__ */ new Set();
    _onBulkCommit = null;
    document.body.classList.remove("lms-bulk-mode");
    document.querySelectorAll(".lms-bulk-checkbox").forEach((el) => el.remove());
    (_a = document.getElementById("lms-bulk-banner")) == null ? void 0 : _a.remove();
  }
  function isBulkMode() {
    return _bulkMode;
  }
  const DeleteService = Object.freeze({
    softDeleteMessage,
    restoreMessage,
    isDeleted,
    getDeletedIds,
    softDeleteBulk,
    restoreAll,
    applyDeletedState,
    enterBulkMode,
    exitBulkMode,
    isBulkMode,
    setDeletedVisible,
    getDeletedVisible,
    onDeletedChanged,
    offDeletedChanged,
    HIDDEN_CLASS,
    REVEALED_CLASS
  });
  const MAX_HISTORY = 10;
  const EDITED_CLASS = "lms-edited-msg";
  const EDITING_CLASS = "lms-editing-active";
  const STYLE_ID$3 = "lms-edit-styles";
  function ensureStyles$4() {
    if (document.getElementById(STYLE_ID$3)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID$3;
    style.textContent = `
/* LM-Source — edit service injected styles */

/* Edited-message indicator chip */
.lms-edit-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: 8px;
  font-size: 10.5px;
  font-weight: 600;
  color: #818cf8;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.22);
  border-radius: 5px;
  padding: 1px 7px;
  vertical-align: middle;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s;
  user-select: none;
}
.lms-edit-badge:hover {
  background: rgba(99, 102, 241, 0.18);
}
.lms-edit-badge .lms-revert-icon {
  font-size: 11px;
  opacity: 0.7;
}

/* Edited message: subtle left border */
.${EDITED_CLASS} {
  border-left: 2px solid rgba(99, 102, 241, 0.4) !important;
  padding-left: 6px !important;
  border-radius: 3px;
}

/* Inline edit widget overlay */
.lms-edit-overlay {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 4px 0;
  z-index: 10;
}

.lms-edit-textarea {
  width: 100%;
  min-height: 80px;
  max-height: 60vh;
  background: rgba(10, 12, 20, 0.95);
  border: 1.5px solid rgba(99, 102, 241, 0.5);
  border-radius: 8px;
  color: #e2e8f0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13.5px;
  line-height: 1.6;
  padding: 10px 12px;
  resize: vertical;
  outline: none;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.lms-edit-textarea:focus {
  border-color: rgba(99, 102, 241, 0.75);
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15);
}

.lms-edit-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.lms-edit-btn {
  padding: 6px 14px;
  border-radius: 7px;
  border: none;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.lms-edit-btn.save {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
}
.lms-edit-btn.save:hover { background: linear-gradient(135deg, #4f46e5, #7c3aed); transform: translateY(-1px); }
.lms-edit-btn.cancel {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  color: #94a3b8;
}
.lms-edit-btn.cancel:hover { background: rgba(255,255,255,0.1); }
.lms-edit-btn.revert {
  background: rgba(239,68,68,0.08);
  border: 1px solid rgba(239,68,68,0.2);
  color: #f87171;
}
.lms-edit-btn.revert:hover { background: rgba(239,68,68,0.14); }

.lms-edit-charcount {
  margin-left: auto;
  font-size: 10.5px;
  color: #4b5563;
}

/* History dropdown */
.lms-edit-history-btn {
  background: rgba(99,102,241,0.08);
  border: 1px solid rgba(99,102,241,0.2);
  border-radius: 7px;
  color: #818cf8;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  padding: 5px 10px;
  transition: background 0.15s;
}
.lms-edit-history-btn:hover { background: rgba(99,102,241,0.15); }

.lms-edit-history-list {
  background: rgba(15,17,27,0.97);
  border: 1px solid rgba(99,102,241,0.22);
  border-radius: 8px;
  padding: 6px;
  max-height: 200px;
  overflow-y: auto;
}
.lms-edit-history-item {
  padding: 6px 8px;
  border-radius: 5px;
  font-size: 11.5px;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background 0.12s;
}
.lms-edit-history-item:hover { background: rgba(99,102,241,0.1); color: #e2e8f0; }
.lms-edit-history-ts {
  font-size: 10px;
  color: #4b5563;
  white-space: nowrap;
  flex-shrink: 0;
}
.lms-edit-history-preview {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  flex: 1;
}
`;
    document.head.appendChild(style);
  }
  const _listeners$1 = /* @__PURE__ */ new Set();
  function _notify$1(event, detail) {
    _listeners$1.forEach((cb) => {
      try {
        cb(event, detail);
      } catch (e) {
      }
    });
  }
  function onEditChanged(cb) {
    _listeners$1.add(cb);
  }
  function offEditChanged(cb) {
    _listeners$1.delete(cb);
  }
  async function _loadRecords$1(platform, conversationId) {
    return getCollection(platform, conversationId, DATA_TYPES.EDIT);
  }
  async function _saveRecords$1(platform, conversationId, records) {
    return setCollection(platform, conversationId, DATA_TYPES.EDIT, records);
  }
  function _getContentNode(el) {
    return el.querySelector('.markdown-content, .message-content, [class*="prose"], .model-response-text, [class*="content"]') || el;
  }
  function _getDisplayText(el) {
    const node = _getContentNode(el);
    const clone = node.cloneNode(true);
    clone.querySelectorAll(".lms-edit-badge, .lms-edit-overlay, [data-lms-injected]").forEach((n) => n.remove());
    return (clone.innerText || clone.textContent || "").trim();
  }
  function _fmtDate(ts) {
    return new Date(ts).toLocaleString(void 0, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  function _applyBadge(el, record, onRevertClick, onHistoryClick) {
    var _a;
    (_a = el.querySelector(".lms-edit-badge")) == null ? void 0 : _a.remove();
    const badge = document.createElement("span");
    badge.className = "lms-edit-badge";
    badge.dataset.lmsInjected = "1";
    badge.setAttribute("title", `Edited ${_fmtDate(record.editedAt)} — click for options`);
    badge.innerHTML = `<span class="lms-revert-icon">✎</span> Edited ${_fmtDate(record.editedAt)}`;
    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      _showBadgeMenu(badge, record, onRevertClick, onHistoryClick);
    });
    const node = _getContentNode(el);
    node.appendChild(badge);
  }
  function _showBadgeMenu(badge, record, onRevertClick, onHistoryClick) {
    document.querySelectorAll(".lms-badge-menu").forEach((m) => m.remove());
    const menu = document.createElement("div");
    menu.className = "lms-badge-menu";
    menu.dataset.lmsInjected = "1";
    Object.assign(menu.style, {
      position: "absolute",
      zIndex: "2147483632",
      background: "rgba(15,17,27,0.97)",
      border: "1px solid rgba(99,102,241,0.25)",
      borderRadius: "8px",
      padding: "4px",
      minWidth: "160px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif"
    });
    const items = [
      { icon: "↩", label: "Revert to original", action: onRevertClick },
      { icon: "📋", label: "Copy current text", action: () => navigator.clipboard.writeText(record.editedText) },
      { icon: "🕓", label: "Edit history", action: onHistoryClick }
    ];
    for (const item of items) {
      const btn = document.createElement("button");
      Object.assign(btn.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        width: "100%",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "6px 10px",
        borderRadius: "5px",
        fontSize: "12px",
        color: "#94a3b8",
        textAlign: "left",
        transition: "background 0.12s"
      });
      btn.innerHTML = `<span>${item.icon}</span><span>${item.label}</span>`;
      btn.addEventListener("mouseover", () => {
        btn.style.background = "rgba(99,102,241,0.12)";
        btn.style.color = "#e2e8f0";
      });
      btn.addEventListener("mouseout", () => {
        btn.style.background = "none";
        btn.style.color = "#94a3b8";
      });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.remove();
        item.action();
      });
      menu.appendChild(btn);
    }
    const bRect = badge.getBoundingClientRect();
    menu.style.top = `${bRect.bottom + 4 + window.scrollY}px`;
    menu.style.left = `${bRect.left + window.scrollX}px`;
    document.body.appendChild(menu);
    const onOutside = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener("click", onOutside);
      }
    };
    setTimeout(() => document.addEventListener("click", onOutside), 0);
  }
  function _showEditor(el, messageId, platform, conversationId, initialText, originalText, history2, onSave, onCancel) {
    ensureStyles$4();
    if (el.querySelector(".lms-edit-overlay")) return;
    el.classList.add(EDITING_CLASS);
    const node = _getContentNode(el);
    const overlay = document.createElement("div");
    overlay.className = "lms-edit-overlay";
    overlay.dataset.lmsInjected = "1";
    const textarea = document.createElement("textarea");
    textarea.className = "lms-edit-textarea";
    textarea.value = initialText;
    textarea.setAttribute("aria-label", "Edit message text");
    textarea.setAttribute("spellcheck", "true");
    const charCount = document.createElement("span");
    charCount.className = "lms-edit-charcount";
    charCount.textContent = `${initialText.length} chars`;
    textarea.addEventListener("input", () => {
      charCount.textContent = `${textarea.value.length} chars`;
    });
    const toolbarRow = document.createElement("div");
    toolbarRow.className = "lms-edit-toolbar";
    const saveBtn = _makeEditBtn("✓ Save", "save");
    const cancelBtn = _makeEditBtn("✕ Cancel", "cancel");
    saveBtn.addEventListener("click", () => {
      const newText = textarea.value.trim();
      if (!newText) return;
      _destroyEditor(el, overlay);
      onSave(newText);
    });
    cancelBtn.addEventListener("click", () => {
      _destroyEditor(el, overlay);
      onCancel();
    });
    textarea.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        saveBtn.click();
      }
      if (e.key === "Escape") {
        cancelBtn.click();
      }
    });
    if (history2 && history2.length > 0) {
      const histBtn = document.createElement("button");
      histBtn.className = "lms-edit-history-btn";
      histBtn.textContent = `🕓 History (${history2.length})`;
      histBtn.addEventListener("click", () => _showHistoryDropdown(histBtn, history2, (text) => {
        textarea.value = text;
        textarea.dispatchEvent(new Event("input"));
      }));
      toolbarRow.append(saveBtn, cancelBtn, histBtn, charCount);
    } else {
      toolbarRow.append(saveBtn, cancelBtn, charCount);
    }
    if (originalText !== null) {
      const revertBtn = _makeEditBtn("↩ Revert to Original", "revert");
      revertBtn.addEventListener("click", () => {
        _destroyEditor(el, overlay);
        onSave("__REVERT__");
      });
      toolbarRow.appendChild(revertBtn);
    }
    overlay.append(textarea, toolbarRow);
    node.prepend(overlay);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.select();
    });
  }
  function _makeEditBtn(label, variant) {
    const btn = document.createElement("button");
    btn.className = `lms-edit-btn ${variant}`;
    btn.textContent = label;
    return btn;
  }
  function _destroyEditor(el, overlay) {
    overlay == null ? void 0 : overlay.remove();
    el.classList.remove(EDITING_CLASS);
  }
  function _showHistoryDropdown(anchor, history2, onSelect) {
    document.querySelectorAll(".lms-edit-history-list").forEach((l) => l.remove());
    const list = document.createElement("div");
    list.className = "lms-edit-history-list";
    list.dataset.lmsInjected = "1";
    Object.assign(list.style, {
      position: "absolute",
      zIndex: "2147483631"
    });
    [...history2].reverse().forEach((entry) => {
      const item = document.createElement("div");
      item.className = "lms-edit-history-item";
      item.innerHTML = `
      <span class="lms-edit-history-ts">${_fmtDate(entry.savedAt)}</span>
      <span class="lms-edit-history-preview">${entry.text.slice(0, 80).replace(/</g, "&lt;")}</span>
    `;
      item.addEventListener("click", () => {
        list.remove();
        onSelect(entry.text);
      });
      list.appendChild(item);
    });
    const aRect = anchor.getBoundingClientRect();
    list.style.top = `${aRect.bottom + 4 + window.scrollY}px`;
    list.style.left = `${aRect.left + window.scrollX}px`;
    document.body.appendChild(list);
    const onOutside = (e) => {
      if (!list.contains(e.target)) {
        list.remove();
        document.removeEventListener("click", onOutside);
      }
    };
    setTimeout(() => document.addEventListener("click", onOutside), 0);
  }
  async function saveEdit(messageId, newText, originalText, platform, conversationId, el) {
    var _a;
    const records = await _loadRecords$1(platform, conversationId);
    const idx = records.findIndex((r) => r.messageId === messageId);
    if (newText === "__REVERT__") {
      if (idx !== -1) {
        const record = records[idx];
        records.splice(idx, 1);
        await _saveRecords$1(platform, conversationId, records);
        if (el) {
          const node = _getContentNode(el);
          (_a = node.querySelector(".lms-edit-badge")) == null ? void 0 : _a.remove();
          el.classList.remove(EDITED_CLASS);
          const existingContent = node.querySelector("[data-lms-edited-text]");
          if (existingContent) {
            existingContent.removeAttribute("data-lms-edited-text");
            existingContent.textContent = record.originalText;
          }
        }
        _notify$1("reverted", { messageId, platform, conversationId });
      }
      return null;
    }
    const now = Date.now();
    if (idx !== -1) {
      const record = records[idx];
      const histEntry = { text: record.editedText, savedAt: record.editedAt };
      const history2 = record.history || [];
      history2.push(histEntry);
      if (history2.length > MAX_HISTORY) history2.shift();
      records[idx] = { ...record, editedText: newText, editedAt: now, history: history2 };
      await _saveRecords$1(platform, conversationId, records);
      _applyEditToDOM(el, records[idx]);
      _notify$1("updated", { record: records[idx] });
      return records[idx];
    } else {
      const record = createEdit({
        platform,
        conversationId,
        messageId,
        originalText,
        editedText: newText
      });
      record.history = [];
      records.push(record);
      await _saveRecords$1(platform, conversationId, records);
      _applyEditToDOM(el, record);
      _notify$1("created", { record });
      return record;
    }
  }
  async function revertEdit(messageId, platform, conversationId, el) {
    return !!await saveEdit(messageId, "__REVERT__", null, platform, conversationId, el);
  }
  async function getEdit(messageId, platform, conversationId) {
    const records = await _loadRecords$1(platform, conversationId);
    return records.find((r) => r.messageId === messageId) || null;
  }
  async function hasEdit(messageId, platform, conversationId) {
    return !!await getEdit(messageId, platform, conversationId);
  }
  function _applyEditToDOM(el, record) {
    if (!el) return;
    ensureStyles$4();
    el.classList.add(EDITED_CLASS);
    const node = _getContentNode(el);
    let textNode = node.querySelector("[data-lms-edited-text]");
    if (!textNode) {
      textNode = document.createElement("div");
      textNode.dataset.lmsEditedText = "1";
      while (node.firstChild && node.firstChild !== textNode) {
        textNode.appendChild(node.firstChild);
      }
      node.insertBefore(textNode, node.firstChild);
    }
    textNode.textContent = record.editedText;
    _applyBadge(
      el,
      record,
      () => {
        revertEdit(record.messageId, record.platform, record.conversationId, el).then(() => console.log(`[LM-Source][EditService] Reverted ${record.messageId}`));
      },
      () => {
        var _a;
        const badge = el.querySelector(".lms-edit-badge");
        if (badge && ((_a = record.history) == null ? void 0 : _a.length)) {
          _showHistoryDropdown(badge, record.history, (text) => {
            openEditor(el, record.messageId, record.platform, record.conversationId);
          });
        }
      }
    );
  }
  async function applyEditsToDOM(adapterRef, platform, conversationId) {
    ensureStyles$4();
    const records = await _loadRecords$1(platform, conversationId);
    if (records.length === 0) return 0;
    const idMap = new Map(records.map((r) => [r.messageId, r]));
    const elements = adapterRef.getMessageElements();
    let count = 0;
    elements.forEach((el, idx) => {
      const data = adapterRef.extractMessageData(el, idx);
      if (!data) return;
      const record = idMap.get(data.messageId);
      if (record) {
        _applyEditToDOM(el, record);
        count++;
      }
    });
    console.log(`[LM-Source][EditService] Re-applied ${count} edit(s) after page load`);
    return count;
  }
  async function openEditor(el, messageId, platform, conversationId) {
    ensureStyles$4();
    const existingRecord = await getEdit(messageId, platform, conversationId);
    const originalText = existingRecord ? existingRecord.originalText : _getDisplayText(el);
    const currentText = existingRecord ? existingRecord.editedText : originalText;
    const history2 = (existingRecord == null ? void 0 : existingRecord.history) || [];
    _showEditor(
      el,
      messageId,
      platform,
      conversationId,
      currentText,
      existingRecord ? originalText : null,
      // null = no prior edit → no revert btn
      history2,
      async (newText) => {
        await saveEdit(messageId, newText, originalText, platform, conversationId, el);
        console.log(`[LM-Source][EditService] Saved edit for ${messageId}`);
      },
      () => {
        console.log(`[LM-Source][EditService] Edit cancelled for ${messageId}`);
      }
    );
  }
  const EditService = Object.freeze({
    saveEdit,
    revertEdit,
    getEdit,
    hasEdit,
    openEditor,
    applyEditsToDOM,
    onEditChanged,
    offEditChanged,
    EDITED_CLASS
  });
  const STYLE_ID$2 = "lms-highlight-styles";
  function ensureStyles$3() {
    if (document.getElementById(STYLE_ID$2)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID$2;
    style.textContent = `
    .lms-highlight {
      position: relative;
      border-radius: 3px;
      padding: 0 2px;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .lms-highlight:hover {
      opacity: 0.8;
    }
    .lms-highlight-yellow { background-color: rgba(250, 204, 21, 0.4); border-bottom: 2px solid rgba(250, 204, 21, 0.8); }
    .lms-highlight-green  { background-color: rgba(74, 222, 128, 0.4); border-bottom: 2px solid rgba(74, 222, 128, 0.8); }
    .lms-highlight-red    { background-color: rgba(248, 113, 113, 0.4); border-bottom: 2px solid rgba(248, 113, 113, 0.8); }
  `;
    document.head.appendChild(style);
  }
  const _listeners = /* @__PURE__ */ new Set();
  function _notify(event, detail) {
    _listeners.forEach((cb) => {
      try {
        cb(event, detail);
      } catch (e) {
      }
    });
  }
  function onHighlightChanged(cb) {
    _listeners.add(cb);
  }
  function offHighlightChanged(cb) {
    _listeners.delete(cb);
  }
  async function _loadRecords(platform, conversationId) {
    return getCollection(platform, conversationId, DATA_TYPES.HIGHLIGHT);
  }
  async function _saveRecords(platform, conversationId, records) {
    return setCollection(platform, conversationId, DATA_TYPES.HIGHLIGHT, records);
  }
  function _getRelativeXPath(node, root) {
    if (node === root) return "";
    if (!node || !node.parentNode) return "";
    let idx = 1;
    let sibling = node.previousSibling;
    while (sibling) {
      if (sibling.nodeType === node.nodeType && sibling.nodeName === node.nodeName) {
        idx++;
      }
      sibling = sibling.previousSibling;
    }
    const nodeName = node.nodeType === Node.TEXT_NODE ? "text()" : node.nodeName.toLowerCase();
    const pathIndex = `[${idx}]`;
    const step = nodeName + pathIndex;
    if (node.parentNode === root) {
      return step;
    }
    return _getRelativeXPath(node.parentNode, root) + "/" + step;
  }
  function _resolveRelativeXPath(path, root) {
    if (!path) return root;
    try {
      const evaluator = new XPathEvaluator();
      const result = evaluator.evaluate("." + (path.startsWith("/") ? "" : "/") + path, root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return result.singleNodeValue;
    } catch (e) {
      console.error("[LM-Source][HighlightService] Failed to resolve XPath:", path, e);
      return null;
    }
  }
  function _applyHighlightDOM(range, record) {
    ensureStyles$3();
    const span = document.createElement("span");
    span.className = `lms-highlight lms-highlight-${record.color}`;
    span.dataset.lmsHighlightId = record.id;
    span.title = "Click to remove highlight";
    try {
      span.appendChild(range.extractContents());
      range.insertNode(span);
    } catch (e) {
      console.error("[LM-Source][HighlightService] Failed to wrap range", e);
      return null;
    }
    span.addEventListener("click", (e) => {
      e.stopPropagation();
      _removeHighlight(record);
    });
    return span;
  }
  function _restoreHighlightDOM(msgRoot, record) {
    var _a, _b;
    const startNode = _resolveRelativeXPath(record.startPath, msgRoot);
    const endNode = _resolveRelativeXPath(record.endPath, msgRoot);
    if (!startNode || !endNode) {
      console.warn(`[LM-Source][HighlightService] Could not resolve nodes for highlight ${record.id}`);
      return false;
    }
    try {
      const range = document.createRange();
      const startOffset = Math.min(record.startOffset, ((_a = startNode.textContent) == null ? void 0 : _a.length) || 0);
      const endOffset = Math.min(record.endOffset, ((_b = endNode.textContent) == null ? void 0 : _b.length) || 0);
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      const rangeText = range.toString().trim();
      if (rangeText && !record.text.includes(rangeText) && !rangeText.includes(record.text)) {
        console.warn(`[LM-Source][HighlightService] Text mismatch for highlight ${record.id}. Expected: "${record.text.slice(0, 20)}", Got: "${rangeText.slice(0, 20)}"`);
      }
      _applyHighlightDOM(range, record);
      return true;
    } catch (e) {
      console.warn(`[LM-Source][HighlightService] Failed to restore highlight ${record.id}`, e);
      return false;
    }
  }
  async function saveHighlight(selection, color, messageId, platform, conversationId, msgRoot) {
    const range = selection.getRangeAt(0);
    if (range.collapsed) return null;
    const startPath = _getRelativeXPath(range.startContainer, msgRoot);
    const endPath = _getRelativeXPath(range.endContainer, msgRoot);
    const text = selection.toString();
    const record = createHighlight({
      platform,
      conversationId,
      messageId,
      text,
      color,
      startPath,
      startOffset: range.startOffset,
      endPath,
      endOffset: range.endOffset
    });
    const records = await _loadRecords(platform, conversationId);
    records.push(record);
    await _saveRecords(platform, conversationId, records);
    _applyHighlightDOM(range, record);
    _notify("created", { record });
    return record;
  }
  async function removeHighlight(record) {
    const records = await _loadRecords(record.platform, record.conversationId);
    const filtered = records.filter((r) => r.id !== record.id);
    await _saveRecords(record.platform, record.conversationId, filtered);
    const span = document.querySelector(`[data-lms-highlight-id="${record.id}"]`);
    if (span) {
      const parent = span.parentNode;
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
      parent.normalize();
    }
    _notify("removed", { recordId: record.id, platform: record.platform, conversationId: record.conversationId });
  }
  async function getHighlights(platform, conversationId) {
    return _loadRecords(platform, conversationId);
  }
  async function clearHighlights(platform, conversationId) {
    const records = await _loadRecords(platform, conversationId);
    for (const r of records) {
      const span = document.querySelector(`[data-lms-highlight-id="${r.id}"]`);
      if (span) {
        const parent = span.parentNode;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
        parent.normalize();
      }
    }
    await _saveRecords(platform, conversationId, []);
    _notify("cleared", { platform, conversationId });
  }
  async function applyHighlightsToDOM(adapterRef, platform, conversationId) {
    ensureStyles$3();
    const records = await _loadRecords(platform, conversationId);
    if (records.length === 0) return 0;
    let count = 0;
    const elements = adapterRef.getMessageElements();
    const elementsMap = /* @__PURE__ */ new Map();
    elements.forEach((el, idx) => {
      const data = adapterRef.extractMessageData(el, idx);
      if (data) elementsMap.set(data.messageId, el);
    });
    for (const record of records) {
      const msgRoot = elementsMap.get(record.messageId);
      if (msgRoot) {
        if (!msgRoot.querySelector(`[data-lms-highlight-id="${record.id}"]`)) {
          if (_restoreHighlightDOM(msgRoot, record)) count++;
        }
      }
    }
    console.log(`[LM-Source][HighlightService] Re-applied ${count} highlight(s) after page load`);
    return count;
  }
  const HighlightService = Object.freeze({
    saveHighlight,
    removeHighlight,
    getHighlights,
    clearHighlights,
    applyHighlightsToDOM,
    onHighlightChanged,
    offHighlightChanged
  });
  const TOOLBAR_ID = "lms-highlight-toolbar";
  let _platform$1 = null;
  let _conversationId$1 = null;
  function ensureStyles$2() {
    if (document.getElementById(TOOLBAR_ID + "-styles")) return;
    const style = document.createElement("style");
    style.id = TOOLBAR_ID + "-styles";
    style.textContent = `
    #${TOOLBAR_ID} {
      position: absolute;
      z-index: 2147483640;
      display: none;
      background: rgba(15, 17, 27, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      padding: 4px 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      gap: 6px;
      align-items: center;
      transition: opacity 0.15s ease, transform 0.15s ease;
      transform: translateY(5px);
      opacity: 0;
    }
    #${TOOLBAR_ID}.lms-visible {
      display: flex;
      transform: translateY(0);
      opacity: 1;
    }
    .lms-swatch {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      cursor: pointer;
      border: 2px solid transparent;
      transition: transform 0.1s ease, border-color 0.1s ease;
    }
    .lms-swatch:hover {
      transform: scale(1.15);
      border-color: rgba(255, 255, 255, 0.6);
    }
    .lms-swatch[data-color="yellow"] { background-color: #facc15; }
    .lms-swatch[data-color="green"]  { background-color: #4ade80; }
    .lms-swatch[data-color="red"]    { background-color: #f87171; }
  `;
    document.head.appendChild(style);
  }
  function createToolbar() {
    ensureStyles$2();
    let toolbar = document.getElementById(TOOLBAR_ID);
    if (toolbar) return toolbar;
    toolbar = document.createElement("div");
    toolbar.id = TOOLBAR_ID;
    const colors = ["yellow", "green", "red"];
    for (const c of colors) {
      const swatch = document.createElement("div");
      swatch.className = "lms-swatch";
      swatch.dataset.color = c;
      swatch.title = `Highlight ${c}`;
      swatch.addEventListener("mousedown", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await handleSwatchClick(c);
        hideToolbar();
      });
      toolbar.appendChild(swatch);
    }
    document.body.appendChild(toolbar);
    return toolbar;
  }
  let activeSelectionRange = null;
  let activeMessageRoot = null;
  let activeMessageId = null;
  async function handleSwatchClick(color) {
    if (!activeSelectionRange || !activeMessageRoot || !activeMessageId) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(activeSelectionRange);
    await HighlightService.saveHighlight(
      sel,
      color,
      activeMessageId,
      _platform$1,
      _conversationId$1,
      activeMessageRoot
    );
    sel.removeAllRanges();
  }
  function hideToolbar() {
    const toolbar = document.getElementById(TOOLBAR_ID);
    if (toolbar) {
      toolbar.classList.remove("lms-visible");
      setTimeout(() => {
        if (!toolbar.classList.contains("lms-visible")) {
          toolbar.style.display = "none";
        }
      }, 150);
    }
  }
  function showToolbar(rect) {
    const toolbar = createToolbar();
    toolbar.style.display = "flex";
    const top = rect.top + window.scrollY - 35;
    const left = rect.left + window.scrollX + rect.width / 2 - toolbar.offsetWidth / 2;
    toolbar.style.top = `${top}px`;
    toolbar.style.left = `${Math.max(10, left)}px`;
    toolbar.offsetHeight;
    toolbar.classList.add("lms-visible");
  }
  function onMouseUp(e) {
    if (e.target.closest(`#${TOOLBAR_ID}`)) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      hideToolbar();
      return;
    }
    const range = sel.getRangeAt(0);
    const text = range.toString().trim();
    if (!text) {
      hideToolbar();
      return;
    }
    let msgRoot = range.commonAncestorContainer;
    if (msgRoot.nodeType === Node.TEXT_NODE) msgRoot = msgRoot.parentNode;
    const container = msgRoot.closest("[data-lms-msg-id]");
    if (!container) {
      hideToolbar();
      return;
    }
    activeSelectionRange = range.cloneRange();
    activeMessageRoot = container;
    activeMessageId = container.getAttribute("data-lms-msg-id");
    const rect = range.getBoundingClientRect();
    showToolbar(rect);
  }
  function init$2(adapterRef, platform, conversationId) {
    _platform$1 = platform;
    _conversationId$1 = conversationId;
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("mousedown", (e) => {
      if (!e.target.closest(`#${TOOLBAR_ID}`)) {
        hideToolbar();
      }
    });
  }
  function destroy$1() {
    document.removeEventListener("mouseup", onMouseUp);
    const t = document.getElementById(TOOLBAR_ID);
    if (t) t.remove();
  }
  const HighlightToolbar = {
    init: init$2,
    destroy: destroy$1
  };
  const PANEL_ID = "lms-highlights-panel";
  const STYLE_ID$1 = "lms-highlights-styles";
  const Z_INDEX = "2147483636";
  const COLOR_MAP = {
    yellow: { label: "Yellow", bg: "rgba(250, 204, 21, 0.1)", border: "rgba(250, 204, 21, 0.4)" },
    green: { label: "Green", bg: "rgba(74, 222, 128, 0.1)", border: "rgba(74, 222, 128, 0.4)" },
    red: { label: "Red", bg: "rgba(248, 113, 113, 0.1)", border: "rgba(248, 113, 113, 0.4)" }
  };
  function buildStyles$1() {
    return `
/* ── LM-Source Highlights Panel ── */

#${PANEL_ID} {
  position: fixed;
  top: 0;
  right: 0;
  width: 380px;
  height: 100vh;
  background: linear-gradient(160deg, #0f172a 0%, #1e1b4b 100%);
  color: #e2e8f0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  line-height: 1.55;
  z-index: ${Z_INDEX};
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 32px rgba(0, 0, 0, 0.55);
  border-left: 1px solid rgba(167, 139, 250, 0.2);
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}
#${PANEL_ID}.lms-hl-open {
  transform: translateX(0);
}

/* Header */
.lms-hl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
  background: rgba(167, 139, 250, 0.07);
  border-bottom: 1px solid rgba(167, 139, 250, 0.18);
  flex-shrink: 0;
}
.lms-hl-title {
  font-size: 14px;
  font-weight: 700;
  color: #c4b5fd;
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: 0.03em;
}
.lms-hl-close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  font-size: 14px;
  transition: background 0.15s, color 0.15s;
}
.lms-hl-close-btn:hover { background: rgba(167,139,250,0.12); color: #c4b5fd; }

/* Body */
.lms-hl-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.lms-hl-body::-webkit-scrollbar { width: 6px; }
.lms-hl-body::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); }
.lms-hl-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
.lms-hl-body::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }

/* Empty state */
.lms-hl-empty {
  text-align: center;
  padding: 40px 20px;
  color: #64748b;
}

/* Color Group */
.lms-hl-group-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  gap: 6px;
}
.lms-hl-group-swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

/* Highlight Card */
.lms-hl-card {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
  position: relative;
  transition: border-color 0.15s, transform 0.15s;
}
.lms-hl-card:hover {
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.15);
}
.lms-hl-text {
  font-size: 13px;
  color: #e2e8f0;
  word-break: break-word;
  margin-bottom: 8px;
  line-height: 1.5;
}

/* Card Actions */
.lms-hl-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 8px;
  border-top: 1px solid rgba(255,255,255,0.06);
  padding-top: 8px;
}
.lms-hl-action-btn {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.05);
  color: #cbd5e1;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 4px;
}
.lms-hl-action-btn:hover {
  background: rgba(255,255,255,0.1);
  color: #fff;
}
.lms-hl-action-btn.delete:hover {
  background: rgba(248,113,113,0.15);
  color: #fca5a5;
  border-color: rgba(248,113,113,0.2);
}
`;
  }
  function ensureStyles$1() {
    if (document.getElementById(STYLE_ID$1)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID$1;
    style.textContent = buildStyles$1();
    document.head.appendChild(style);
  }
  let _options = null;
  function _createPanel() {
    ensureStyles$1();
    const existing = document.getElementById(PANEL_ID);
    if (existing) return existing;
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.dataset.lmsInjected = "1";
    const header = document.createElement("div");
    header.className = "lms-hl-header";
    const title = document.createElement("div");
    title.className = "lms-hl-title";
    title.innerHTML = "<span>🖍 Highlights</span>";
    const closeBtn = document.createElement("button");
    closeBtn.className = "lms-hl-close-btn";
    closeBtn.innerHTML = "✕";
    closeBtn.title = "Close panel";
    closeBtn.addEventListener("click", close);
    header.append(title, closeBtn);
    const body = document.createElement("div");
    body.className = "lms-hl-body";
    body.id = `${PANEL_ID}-body`;
    panel.append(header, body);
    document.body.appendChild(panel);
    return panel;
  }
  function _renderGroup(color, highlights) {
    if (!highlights || highlights.length === 0) return null;
    const group = document.createElement("div");
    group.className = "lms-hl-group";
    group.dataset.color = color;
    const conf = COLOR_MAP[color] || COLOR_MAP.yellow;
    const title = document.createElement("div");
    title.className = "lms-hl-group-title";
    title.innerHTML = `<div class="lms-hl-group-swatch" style="background: ${conf.border}"></div>${conf.label} (${highlights.length})`;
    group.appendChild(title);
    for (const hl of highlights) {
      const card = document.createElement("div");
      card.className = "lms-hl-card";
      card.dataset.id = hl.id;
      card.style.borderLeft = `3px solid ${conf.border}`;
      card.style.background = `linear-gradient(90deg, ${conf.bg} 0%, rgba(15, 23, 42, 0.6) 100%)`;
      const text = document.createElement("div");
      text.className = "lms-hl-text";
      text.textContent = hl.text;
      const actions = document.createElement("div");
      actions.className = "lms-hl-actions";
      const copyBtn = document.createElement("button");
      copyBtn.className = "lms-hl-action-btn";
      copyBtn.innerHTML = "📋 Copy";
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(hl.text);
        copyBtn.innerHTML = "✓ Copied";
        setTimeout(() => copyBtn.innerHTML = "📋 Copy", 1500);
      });
      const delBtn = document.createElement("button");
      delBtn.className = "lms-hl-action-btn delete";
      delBtn.innerHTML = "✕ Remove";
      delBtn.addEventListener("click", () => {
        if (_options && _options.onRemove) _options.onRemove(hl.id);
      });
      actions.append(copyBtn, delBtn);
      card.append(text, actions);
      group.appendChild(card);
    }
    return group;
  }
  function _renderContent(highlights) {
    const body = document.getElementById(`${PANEL_ID}-body`);
    if (!body) return;
    body.innerHTML = "";
    if (!highlights || highlights.length === 0) {
      body.innerHTML = `<div class="lms-hl-empty">
      <div style="font-size: 24px; margin-bottom: 10px;">🖍</div>
      No highlights yet.<br>Select text in any message to highlight it.
    </div>`;
      return;
    }
    const colors = ["yellow", "green", "red"];
    for (const c of colors) {
      const group = highlights.filter((h) => h.color === c);
      const node = _renderGroup(c, group);
      if (node) body.appendChild(node);
    }
  }
  function render(highlights, options = {}) {
    _options = options;
    _createPanel();
    _renderContent(highlights);
  }
  function open() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.classList.add("lms-hl-open");
  }
  function close() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.classList.remove("lms-hl-open");
  }
  function toggle() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.classList.toggle("lms-hl-open");
    else console.warn("[LM-Source] HighlightsPanel not rendered yet.");
  }
  function destroy() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.remove();
    const style = document.getElementById(STYLE_ID$1);
    if (style) style.remove();
  }
  function addHighlight(hl) {
  }
  const HighlightsPanel = Object.freeze({
    render,
    open,
    close,
    toggle,
    destroy,
    addHighlight
  });
  function generateHandoffPrompt(adapterRef) {
    const context = extractContext(adapterRef);
    return context.handoffPrompt;
  }
  async function deliverToClipboard(prompt) {
    try {
      await navigator.clipboard.writeText(prompt);
      return true;
    } catch (e) {
      console.error("[LM-Source][HandoffService] Failed to write clipboard:", e);
      return false;
    }
  }
  async function deliverToPinboard(prompt, platform, conversationId) {
    await pinMessage({
      platform,
      conversationId,
      messageId: "handoff-" + Date.now(),
      role: "user",
      text: prompt
    });
  }
  function deliverToNewTab(targetPlatform, prompt) {
    chrome.runtime.sendMessage({
      type: "LMS_DELIVER_HANDOFF_NEW_TAB",
      targetPlatform,
      prompt
    });
  }
  const HandoffService = {
    generateHandoffPrompt,
    deliverToClipboard,
    deliverToPinboard,
    deliverToNewTab
  };
  const BANNER_ID = "lms-handoff-banner";
  const STYLE_ID = "lms-handoff-banner-styles";
  let _adapterRef = null;
  let _platform = null;
  let _conversationId = null;
  function buildStyles() {
    return `
    #${BANNER_ID} {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%) translateY(-100%);
      z-index: 2147483645;
      background: linear-gradient(135deg, rgba(30, 27, 75, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%);
      border: 1px solid rgba(139, 92, 246, 0.4);
      border-radius: 12px;
      padding: 16px 20px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5), 0 0 15px rgba(139, 92, 246, 0.2);
      color: #e2e8f0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 320px;
      opacity: 0;
      transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease;
      backdrop-filter: blur(8px);
    }
    #${BANNER_ID}.lms-banner-visible {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
    .lms-banner-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 600;
      color: #c4b5fd;
    }
    .lms-banner-close {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 16px;
    }
    .lms-banner-close:hover { color: #fff; }
    .lms-banner-text {
      font-size: 13px;
      color: #cbd5e1;
      line-height: 1.4;
    }
    .lms-banner-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 4px;
    }
    .lms-banner-btn {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      color: #f1f5f9;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }
    .lms-banner-btn:hover { background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.25); }
    .lms-banner-btn.primary {
      background: rgba(139, 92, 246, 0.2);
      border-color: rgba(139, 92, 246, 0.5);
      color: #e0e7ff;
    }
    .lms-banner-btn.primary:hover {
      background: rgba(139, 92, 246, 0.4);
    }
  `;
  }
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = buildStyles();
    document.head.appendChild(style);
  }
  function showBanner() {
    ensureStyles();
    let banner = document.getElementById(BANNER_ID);
    if (banner) {
      banner.classList.add("lms-banner-visible");
      return;
    }
    banner = document.createElement("div");
    banner.id = BANNER_ID;
    const header = document.createElement("div");
    header.className = "lms-banner-header";
    header.innerHTML = `<span>⚠️ Token Limit Detected</span>`;
    const closeBtn = document.createElement("button");
    closeBtn.className = "lms-banner-close";
    closeBtn.innerHTML = "✕";
    closeBtn.onclick = hideBanner;
    header.appendChild(closeBtn);
    const text = document.createElement("div");
    text.className = "lms-banner-text";
    text.innerHTML = "You are approaching the context length limit. Would you like to extract the context and handoff to another platform?";
    const actions = document.createElement("div");
    actions.className = "lms-banner-actions";
    const copyBtn = _createBtn("📋 Copy Context", async (btn) => {
      btn.innerHTML = "⏳ Extracting...";
      const prompt = HandoffService.generateHandoffPrompt(_adapterRef);
      await HandoffService.deliverToClipboard(prompt);
      btn.innerHTML = "✓ Copied";
      setTimeout(() => btn.innerHTML = "📋 Copy Context", 2e3);
    });
    const pinBtn = _createBtn("📌 Pin Context", async (btn) => {
      btn.innerHTML = "⏳ Extracting...";
      const prompt = HandoffService.generateHandoffPrompt(_adapterRef);
      await HandoffService.deliverToPinboard(prompt, _platform, _conversationId);
      btn.innerHTML = "✓ Pinned";
      setTimeout(() => btn.innerHTML = "📌 Pin Context", 2e3);
    });
    const targetPlatforms = ["chatgpt", "claude", "gemini"].filter((p) => p !== _platform);
    actions.append(copyBtn, pinBtn);
    for (const t of targetPlatforms) {
      const name = t.charAt(0).toUpperCase() + t.slice(1);
      const btn = _createBtn(`🚀 Send to ${name}`, async (b) => {
        b.innerHTML = "⏳ Extracting...";
        const prompt = HandoffService.generateHandoffPrompt(_adapterRef);
        HandoffService.deliverToNewTab(t, prompt);
        b.innerHTML = "✓ Sent";
        setTimeout(() => hideBanner(), 1e3);
      });
      btn.classList.add("primary");
      actions.appendChild(btn);
    }
    banner.append(header, text, actions);
    document.body.appendChild(banner);
    requestAnimationFrame(() => {
      banner.classList.add("lms-banner-visible");
    });
  }
  function _createBtn(label, onClickAsync) {
    const btn = document.createElement("button");
    btn.className = "lms-banner-btn";
    btn.innerHTML = label;
    btn.onclick = () => onClickAsync(btn);
    return btn;
  }
  function hideBanner() {
    const banner = document.getElementById(BANNER_ID);
    if (banner) {
      banner.classList.remove("lms-banner-visible");
    }
  }
  function init$1(adapterRef, platform, conversationId) {
    _adapterRef = adapterRef;
    _platform = platform;
    _conversationId = conversationId;
  }
  const HandoffBanner = { init: init$1, showBanner, hideBanner };
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
    if ((request == null ? void 0 : request.type) === "LMS_OPEN_PINBOARD") {
      PinboardPanel.toggle();
      sendResponse({ success: true });
      return true;
    }
    if ((request == null ? void 0 : request.type) === "LMS_TOGGLE_DELETED") {
      const nowVisible = !DeleteService.getDeletedVisible();
      DeleteService.setDeletedVisible(nowVisible);
      sendResponse({ success: true, visible: nowVisible });
      return true;
    }
    if ((request == null ? void 0 : request.type) === "LMS_BULK_DELETE_MODE") {
      if (!adapter) {
        sendResponse({ success: false });
        return true;
      }
      if (DeleteService.isBulkMode()) {
        DeleteService.exitBulkMode();
        sendResponse({ success: true, mode: "off" });
      } else {
        const platform = adapter.getPlatformIdentifier();
        const conversationId = adapter.getConversationId();
        const elements = adapter.getMessageElements();
        DeleteService.enterBulkMode(elements, async (selectedIds) => {
          await DeleteService.softDeleteBulk(selectedIds, platform, conversationId);
        });
        sendResponse({ success: true, mode: "on" });
      }
      return true;
    }
    if ((request == null ? void 0 : request.type) === "LMS_REVERT_EDIT") {
      if (!adapter) {
        sendResponse({ success: false });
        return true;
      }
      const { messageId } = request;
      const platform = adapter.getPlatformIdentifier();
      const conversationId = adapter.getConversationId();
      const el = document.querySelector(`[data-lms-msg-id="${messageId}"]`);
      EditService.revertEdit(messageId, platform, conversationId, el).then(() => sendResponse({ success: true })).catch((e) => {
        console.error(`${LOG_PREFIX} Failed to revert edit:`, e);
        sendResponse({ success: false });
      });
      return true;
    }
    if ((request == null ? void 0 : request.type) === "LMS_OPEN_HIGHLIGHTS") {
      HighlightsPanel.toggle();
      sendResponse({ success: true });
      return true;
    }
    return false;
  });
  document.addEventListener("lms:adapterReady", (e) => {
    const { adapter: readyAdapter, platform, conversationId } = e.detail;
    setTimeout(() => {
      const ctx = extractContext(readyAdapter);
      if (ctx) {
        ContextSidePanel.render(ctx, {
          onRefresh: () => runContextExtraction(readyAdapter)
        });
      }
    }, 1500);
    initPinFeature(readyAdapter, platform, conversationId);
    initDeleteFeature(readyAdapter, platform, conversationId);
    initEditFeature(readyAdapter, platform, conversationId);
    initHighlightFeature(readyAdapter, platform, conversationId);
    initHandoffFeature(readyAdapter, platform, conversationId);
  });
  document.addEventListener("lms:messageAdded", (e) => {
    const { messageId, role, element } = e.detail;
    if (!element || !adapter) return;
    const platform = adapter.getPlatformIdentifier();
    const conversationId = adapter.getConversationId();
    MessageToolbar.attachToMessage(
      element,
      messageId,
      role,
      () => buildPinnedSet(platform, conversationId)
    );
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
  async function buildPinnedSet(platform, conversationId) {
    const pins = await PinService.getPins(platform, conversationId);
    return new Map(pins.map((p) => [p.messageId, true]));
  }
  async function initPinFeature(adapterRef, platform, conversationId) {
    MessageToolbar.init();
    MessageToolbar.registerAction("pin", {
      icon: "📌",
      tooltip: "Pin message",
      showFor: ["all"],
      onClick: async ({ messageId, role, element, button }) => {
        const existing = await PinService.isPinned(messageId, platform, conversationId);
        if (existing) {
          await PinService.unpinMessage(existing.id, platform, conversationId);
          MessageToolbar.setMessagePinnedState(messageId, false);
          button.classList.remove("lms-tb-pinned");
          button.setAttribute("data-tooltip", "Pin message");
          PinboardPanel.removePin(existing.id);
          console.log(`${LOG_PREFIX} Unpinned message ${messageId}`);
        } else {
          const msgData = adapter ? adapter.extractMessageData(element) : null;
          const text = (msgData == null ? void 0 : msgData.text) || (element == null ? void 0 : element.innerText) || "";
          const pin = await PinService.pinMessage({
            messageId,
            platform,
            conversationId,
            role,
            text
          });
          MessageToolbar.setMessagePinnedState(messageId, true);
          button.classList.add("lms-tb-pinned");
          button.setAttribute("data-tooltip", "Unpin message");
          PinboardPanel.addPin(pin);
          console.log(`${LOG_PREFIX} Pinned message ${messageId}`);
        }
      }
    });
    const pins = await PinService.getPins(platform, conversationId);
    PinboardPanel.render(pins, {
      platform,
      conversationId,
      onUnpin: async (pinId, clearAll) => {
        if (clearAll) {
          const all = await PinService.getPins(platform, conversationId);
          for (const p of all) {
            await PinService.unpinMessage(p.id, platform, conversationId);
            MessageToolbar.setMessagePinnedState(p.messageId, false);
          }
          PinboardPanel.render([], {
            platform,
            conversationId,
            onUnpin: arguments.callee,
            onReorder: async (ids) => {
              await PinService.reorderPins(platform, conversationId, ids);
            }
          });
          return;
        }
        const pin = pins.find((p) => p.id === pinId);
        await PinService.unpinMessage(pinId, platform, conversationId);
        if (pin) MessageToolbar.setMessagePinnedState(pin.messageId, false);
        PinboardPanel.removePin(pinId);
      },
      onReorder: async (orderedIds) => {
        await PinService.reorderPins(platform, conversationId, orderedIds);
      }
    });
    for (const pin of pins) {
      MessageToolbar.setMessagePinnedState(pin.messageId, true);
    }
    const elements = adapterRef.getMessageElements();
    elements.forEach((el, idx) => {
      const data = adapterRef.extractMessageData(el, idx);
      if (data) {
        MessageToolbar.attachToMessage(
          el,
          data.messageId,
          data.role,
          () => buildPinnedSet(platform, conversationId)
        );
      }
    });
    console.log(`${LOG_PREFIX} Pin feature initialised. ${pins.length} existing pin(s) loaded.`);
  }
  async function initDeleteFeature(adapterRef, platform, conversationId) {
    MessageToolbar.registerAction("delete", {
      icon: "🗑",
      tooltip: "Delete message (local only)",
      showFor: ["all"],
      groupBefore: true,
      // adds a visual divider after the pin button
      onClick: async ({ messageId, element, button }) => {
        const alreadyDeleted = await DeleteService.isDeleted(messageId, platform, conversationId);
        if (alreadyDeleted) {
          await DeleteService.restoreMessage(messageId, platform, conversationId);
          button.setAttribute("data-tooltip", "Delete message (local only)");
          button.classList.remove("lms-tb-active");
          console.log(`${LOG_PREFIX} Restored message ${messageId}`);
        } else {
          await DeleteService.softDeleteMessage(messageId, platform, conversationId);
          button.setAttribute("data-tooltip", "Restore message");
          button.classList.add("lms-tb-active");
          console.log(`${LOG_PREFIX} Soft-deleted message ${messageId}`);
        }
      }
    });
    setTimeout(async () => {
      const count = await DeleteService.applyDeletedState(adapterRef, platform, conversationId);
      if (count > 0) {
        console.log(`${LOG_PREFIX} Restored hidden state for ${count} deleted message(s).`);
      }
    }, 2e3);
  }
  async function initEditFeature(adapterRef, platform, conversationId) {
    MessageToolbar.registerAction("edit", {
      icon: "✎️",
      tooltip: "Edit message (local only)",
      showFor: ["all"],
      groupBefore: false,
      onClick: async ({ messageId, element }) => {
        await EditService.openEditor(element, messageId, platform, conversationId);
      }
    });
    setTimeout(async () => {
      const count = await EditService.applyEditsToDOM(adapterRef, platform, conversationId);
      if (count > 0) {
        console.log(`${LOG_PREFIX} Re-applied ${count} local edit(s) after page load.`);
      }
    }, 2500);
    console.log(`${LOG_PREFIX} Edit feature (P2.5) initialised.`);
  }
  async function initHighlightFeature(adapterRef, platform, conversationId) {
    HighlightToolbar.init(adapterRef, platform, conversationId);
    const highlights = await HighlightService.getHighlights(platform, conversationId);
    HighlightsPanel.render(highlights, {
      onRemove: async (id) => {
        const hls = await HighlightService.getHighlights(platform, conversationId);
        const hl = hls.find((h) => h.id === id);
        if (hl) {
          await HighlightService.removeHighlight(hl);
          HighlightsPanel.render(await HighlightService.getHighlights(platform, conversationId), _optionsCache);
        }
      }
    });
    const _optionsCache = {
      onRemove: async (id) => {
        const hls = await HighlightService.getHighlights(platform, conversationId);
        const hl = hls.find((h) => h.id === id);
        if (hl) {
          await HighlightService.removeHighlight(hl);
          HighlightsPanel.render(await HighlightService.getHighlights(platform, conversationId), _optionsCache);
        }
      }
    };
    setTimeout(async () => {
      const count = await HighlightService.applyHighlightsToDOM(adapterRef, platform, conversationId);
      if (count > 0) {
        console.log(`${LOG_PREFIX} Re-applied ${count} local highlight(s) after page load.`);
      }
    }, 3e3);
    HighlightService.onHighlightChanged(async () => {
      HighlightsPanel.render(await HighlightService.getHighlights(platform, conversationId), _optionsCache);
    });
    console.log(`${LOG_PREFIX} Highlight feature (P2.6) initialised.`);
  }
  function initHandoffFeature(adapterRef, platform, conversationId) {
    HandoffBanner.init(adapterRef, platform, conversationId);
    chrome.storage.local.get(["lms_pending_handoff"], (res) => {
      if (res.lms_pending_handoff) {
        console.log(`${LOG_PREFIX} Pending handoff detected. Injecting...`);
        const prompt = res.lms_pending_handoff;
        chrome.storage.local.remove(["lms_pending_handoff"]);
        setTimeout(() => {
          const textareas = Array.from(document.querySelectorAll('textarea, [contenteditable="true"]'));
          const editor = textareas.sort((a, b) => b.offsetHeight - a.offsetHeight)[0];
          if (editor) {
            editor.focus();
            if (editor.tagName.toLowerCase() === "textarea") {
              editor.value = prompt;
              editor.dispatchEvent(new Event("input", { bubbles: true }));
            } else {
              document.execCommand("insertText", false, prompt);
            }
          }
        }, 2e3);
      }
    });
    window.addEventListener("lms:tokenLimitWarning", () => {
      console.log(`${LOG_PREFIX} Token limit warning emitted. Showing HandoffBanner.`);
      HandoffBanner.showBanner();
    });
    console.log(`${LOG_PREFIX} Handoff feature (P2.7) initialised.`);
  }
  window.addEventListener("beforeunload", () => {
    if (messageObserver) {
      messageObserver.disconnect();
      console.log(`${LOG_PREFIX} MutationObserver disconnected.`);
    }
    clearTimeout(debounceTimer);
  });
})();
