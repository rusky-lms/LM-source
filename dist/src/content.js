(function() {
  "use strict";
  class PlatformAdapter {
    /**
     * Return a stable identifier string for this platform.
     * @returns {'claude' | 'chatgpt' | 'unknown'}
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
  const CHAT_CONTAINER_SELECTORS$1 = [
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
  const TOKEN_LIMIT_SELECTORS$1 = [
    '[data-testid="token-limit-banner"]',
    '[class*="ContextLimitBanner"]',
    '[class*="context-limit"]',
    '[class*="limit-reached"]'
  ];
  const TOKEN_LIMIT_TEXT_PATTERNS$1 = [
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
      const container = this._queryFirst(CHAT_CONTAINER_SELECTORS$1);
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
      const bannerEl = this._queryFirst(TOKEN_LIMIT_SELECTORS$1);
      if (bannerEl) return true;
      const bodyText = document.body.innerText || "";
      return TOKEN_LIMIT_TEXT_PATTERNS$1.some((pattern) => pattern.test(bodyText));
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
  const CHAT_CONTAINER_SELECTORS = [
    // Primary: the <main> element houses the conversation thread
    "main",
    // Conversation-specific scroll containers (class names vary)
    '[class*="conversation-main"]',
    '[class*="chat-pg"]',
    '[class*="overflow-y-auto"]'
  ];
  const TOKEN_LIMIT_SELECTORS = [
    '[data-testid="context-limit-banner"]',
    '[class*="context-limit"]',
    '[class*="contextLimit"]',
    '[class*="limit-reached"]',
    '[class*="limit-warning"]'
  ];
  const TOKEN_LIMIT_TEXT_PATTERNS = [
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
      const container = this._queryFirst(CHAT_CONTAINER_SELECTORS);
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
      const bannerEl = this._queryFirst(TOKEN_LIMIT_SELECTORS);
      if (bannerEl) return true;
      const bodyText = document.body.innerText || "";
      return TOKEN_LIMIT_TEXT_PATTERNS.some((pattern) => pattern.test(bodyText));
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
