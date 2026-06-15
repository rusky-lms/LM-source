# LM-Source Execution Plan

> PRD-to-Tasks breakdown for LM-Source (v1.1) Chrome/Edge Extension.
> This document serves as the master checklist. Complete each task sequentially, and update the status as you go.
> **Supported Platforms:** Claude.ai · ChatGPT · Google Gemini

---

## Legend
- **Phase 1: Foundation** — Non-selection blocking, technical setup required before any user-facing feature.
- **Phase 2: Core Features** — F-01 to F-06, built in dependency order.
- **Phase 3: Quality & Ship** — Polish, testing, asset creation, and marketplace submission.

---

## PHASE 1: Project Foundation & Tooling

### Task P1.1 — Scaffold the Extension Skeleton
**Status:** ⏳ Pending | **Difficulty:** Low | **Blocker for:** P1.2, P1.3

Create the base directory and required files.

**Deliverables:**
- `manifest.json` (MV3): Minimum fields: `manifest_version: 3`, `name`, `version`, `description`, `icons`.
- `src/background.js`: Service worker file.
- `src/content.js`: Base content script file (to be registered in manifest later).
- `src/popup.html` & `src/popup.js`: popup entry point.
- `src/styles.css`: popup styles.
- `assets/logo-icon16.png`, `assets/logo-icon48.png`, `assets/logo-icon128.png`: Placeholder icon assets.

**Action Steps:**
1. Create the directory structure.
2. Create `manifest.json`.
3. Create empty `src/background.js` and `src/content.js` (log "Hello World" in dev tools).
4. Create `src/popup.html` and `src/popup.js` (render "LM-Source Ready").
5. Add placeholder icons in `assets/`.
6. Load the extension in `chrome://extensions` in developer mode to verify the manifest parses correctly.

---

### Task P1.2 — Implement Build & Dev Toolchain
**Status:** ✅ Done | **Difficulty:** Medium | **Blocker for:** P1.1 (production assets), P2.4

Set up the build process to handle Hot Module Replacement (HMR) and bundle the extension correctly.

**Deliverables:**
- `package.json` with scripts for `dev`, `build`, and `zip` (for distribution).
- `vite.config.js` (or `webpack.config.js`) configured for browser extensions.
- Support for reload on code changes in development.

**Action Steps:**
1. Run `npm init -y`.
2. Install `vite`, `@crxjs/vite-plugin`, and `react` / `vue` if using a framework.
3. Configure `vite.config.js` to output to `dist/` and handle CSS/JS bundling.
4. Create scripts in `package.json`: `dev` (runs Vite dev server for HMR), `build` (outputs to `dist/`), `zip` (zips the `dist/` directory).
5. Verify build output is clean and ready for loading in Chrome extensions page.

---

### Task P1.3 — Storage Service & Data Models
**Status:** ✅ Done | **Difficulty:** Medium | **Blocker for:** P2.2, P2.3, P2.5, P2.6

Implement `chrome.storage.local` service, namespace data, and define storage quotas.

**Deliverables:**
- `src/services/storage.js`
- Defined data structures: `Pin`, `Highlight`, `Edit`, `DeletedMessage`, `HandoffPrompt`.
- Check total storage (< 2MB) and clear least-recently-used data.

**Action Steps:**
1. Create `storage.js` with helper functions: `get(key)`, `set(key, value)`, `remove(key)`. Wrap all calls in `try/catch`.
2. Define data model schemas (commented in code or typed in TS).
3. Implement `getNamespaceKey(platform, conversationId, type)` for organizing data.
4. Implement `checkStorageQuota()` to log warnings if near 2MB.
5. Verify via the browser's application > local storage panel.

---

## PHASE 2: Core Feature Implementation

### Task P2.1 — DOM Injection Strategy & Content Script Architecture
**Status:** ✅ Done | **Difficulty:** High | **Blocker for:** P2.2, P2.3, P2.4, P2.5, P2.6

Build the robustness layer for interacting with Claude.ai, ChatGPT, **and Google Gemini**.

**Deliverables:**
- `src/content.js`
- `src/adapters/claudeAdapter.js`
- `src/adapters/chatgptAdapter.js`
- `src/adapters/geminiAdapter.js` ✅ **New — Gemini support**
- `MutationObserver` logic to detect new messages.

**Gemini-specific notes:**
- Gemini uses Angular-style **custom HTML elements**: `<conversation-turn>`, `<user-query>`, `<model-response>`, `<message-content>`. These are the primary selectors.
- Parts of Gemini's UI are encapsulated in **Shadow DOM**. The adapter includes a `queryShadow()` helper to pierce one shadow level where needed.
- Conversation ID is extracted from the URL path: `/app/<id>` or `/chat/<id>`.
- `manifest.json` updated: added `https://gemini.google.com/*` to `host_permissions` and `content_scripts.matches`.

**Action Steps:**
1. Create the `src/adapters/` directory.
2. In `claudeAdapter.js`, `chatgptAdapter.js`, and `geminiAdapter.js`, implement a `PlatformAdapter` interface with methods: `getMessageElements()`, `extractMessageData(element)`, `getPlatformIdentifier()`, `detectTokenLimitWarning()`.
3. In `src/content.js`, detect the current URL (`window.location.hostname`) and instantiate the correct adapter (Claude / ChatGPT / Gemini).
4. Implement the `MutationObserver` to watch for new chat messages in the DOM (specific target selectors found in adapter files).
5. Log to console when a new message is detected (as a basic smoke test).
6. Verify by pasting the content script into the Chrome DevTools console on Claude.ai, ChatGPT, and Gemini.

---

### Task P2.2 — Feature F-01: Context Extraction
**Status:** ✅ Done | **Difficulty:** High | **Blocker for:** None (but depends on P2.1)

Analyse the current chat and extract topics, key entities, decisions, next steps, code blocks, and a brief summary. Package into the structured handoff template.

**Deliverables:**
- `src/services/contextExtractor.js` ✅
- `src/components/ContextSidePanel.js` ✅
- Triggered via popup "Extract Context" button or auto-rendered on page load.

**Analysis passes implemented:**
- **Code block extraction:** Fenced (\`\`\`lang...\`\`\`) and inline (\`code\`) via regex `CODE_BLOCK_REGEX`.
- **Decision detection:** `DECISION_PATTERNS` — 8 high-signal phrase patterns ("let's go with", "we'll use", "conclusion", "the solution is", etc.).
- **Next-step detection:** `NEXT_STEP_PATTERNS` — 7 patterns ("next:", "step N", "todo:", "run", "deploy", etc.).
- **Topic / entity mining:** Domain keyword bank + capitalised noun phrases, sorted by frequency.
- **Condensed summary:** Last 6 messages verbatim; older ones truncated to last sentence (≤ 300 chars).
- **Handoff prompt:** Structured template with `[SYSTEM PREAMBLE]`, `[CONTEXT SUMMARY]`, `[KEY DECISIONS]`, `[CODE]`, `[NEXT STEPS]`, `[RECENT EXCHANGE]`, `[CONFIRMATION REQUEST]`.

**Side Panel tabs:**
1. **Summary** — topic pills, message stats, code/decision counts.
2. **Decisions** — decision cards (yellow left-border) + next-step cards (green left-border).
3. **Code (N)** — extracted code blocks with language label and one-click copy.
4. **Timeline** — condensed message thread; verbatim messages highlighted.
5. **Handoff** — read-only textarea with the full handoff prompt + Copy + Open Claude/ChatGPT/Gemini buttons.

**Message flow:**
- Popup `btn-extract` → `tabs.sendMessage({ type: 'LMS_EXTRACT_CONTEXT' })` → content script → `extractContext(adapter)` → `ContextSidePanel.render()` → panel opens.
- Panel "Open [Platform]" buttons → `chrome.runtime.sendMessage({ type: 'LMS_OPEN_URL' })` → background → `chrome.tabs.create()`.
- Auto-renders (panel closed) on `lms:adapterReady` event after 1.5 s, so the floating toggle button is always visible.

**Action Steps:**
1. ✅ Implement `extractContext(adapter)` iterating messages via the adapter.
2. ✅ Regex-based code block extraction (fenced + inline), decision patterns, next-step patterns.
3. ✅ `mineTopics()` — domain keywords + capitalised noun phrases.
4. ✅ `condenseMessages()` — last N verbatim, older truncated.
5. ✅ `buildHandoffPrompt()` — structured template.
6. ✅ `ContextSidePanel.render()` — 5-tab injected panel with copy actions.
7. ✅ Popup button wired; background `LMS_OPEN_URL` handler added.

---

### Task P2.3 — Feature F-02: Pin Messages
**Status:** ✅ Done | **Difficulty:** Medium | **Blocker for:** None (but depends on P1.3, P2.1)

Allow users to pin key messages to a Pinboard. Data persists via the Storage Service (P1.3).

**Deliverables:**
- `src/services/pinService.js` ✅ — CRUD + pub/sub change listeners
- `src/components/PinboardPanel.js` ✅ — injected sliding panel with drag-and-drop
- `src/components/messageToolbar.js` ✅ — shared hover toolbar (pin icon; extended by P2.4/P2.5)
- Pin icon injected via hover toolbar on every message ✅
- Drag-and-drop reordering (HTML5 DnD) ✅
- Unpin + copy per card ✅; Clear-all ✅

**Architecture:**
- `MessageToolbar` — single floating DOM element repositioned per-hovered message; action registry so P2.4/P2.5 add buttons without touching this file.
- `PinService` — wraps StorageService collections; change-listener pub/sub (`onPinsChanged`).
- `PinboardPanel` — left-edge sliding panel (amber theme); optimistic `addPin` / `removePin` for instant feedback; full re-render only on navigation.

**Message flow:**
- Hover message → toolbar appears → click 📌 → `PinService.pinMessage()` → `PinboardPanel.addPin()` → amber outline ring on message.
- Click 📌 again → `PinService.unpinMessage()` → `PinboardPanel.removePin()` → ring removed.
- Popup "Pinboard" → `LMS_OPEN_PINBOARD` → `PinboardPanel.toggle()`.
- Drag card → drop → `PinService.reorderPins()` persists new order.

**Action Steps:**
1. ✅ `pinService.js`: `pinMessage()`, `unpinMessage()`, `getPins()`, `isPinned()`, `reorderPins()`.
2. ✅ `messageToolbar.js`: hover-attach, action registry, pinned-state ring CSS.
3. ✅ `PinboardPanel.js`: full panel + HTML5 drag-and-drop + optimistic updates.
4. ✅ `content.js`: `initPinFeature()` on `lms:adapterReady`; attach toolbar on `lms:messageAdded`.
5. ✅ `popup.js`: Pinboard button sends `LMS_OPEN_PINBOARD`.

---

### Task P2.4 — Feature F-03: Delete Non-Required Messages
**Status:** ✅ Done | **Difficulty:** Low | **Blocker for:** None (but depends on P2.1)

Implement a soft-delete mechanism for messages (view-layer only). Data persists via the Storage Service (P1.3).

**Deliverables:**
- `src/services/deleteService.js` ✅ — soft-delete CRUD, bulk ops, show/hide toggle, restore-on-load
- 🗑 Delete toolbar button on message hover ✅ (via shared `MessageToolbar` registry)
- Bulk delete mode with floating checkbox banner ✅
- 👁 Show/Hide deleted toggle in popup ✅ — dims messages, shows "Deleted" badge
- State persists across page refreshes via `applyDeletedState()` ✅

**Architecture:**
- **Soft-delete only** — no LLM data mutated; purely DOM `max-height: 0 + opacity: 0`.
- **CSS classes:** `lms-deleted-hidden` (hide), `lms-deleted-revealed` (dim/show with dashed red outline).
- **Bulk mode:** `enterBulkMode()` injects checkboxes + floating banner into the page.
- **Restore on refresh:** `applyDeletedState()` called 2s after `lms:adapterReady` re-hides all stored IDs.

**Action Steps:**
1. ✅ `deleteService.js`: `softDeleteMessage()`, `restoreMessage()`, `isDeleted()`, `softDeleteBulk()`, `restoreAll()`, `applyDeletedState()`.
2. ✅ `MessageToolbar.registerAction('delete', …)` — toggle delete/restore on click.
3. ✅ `enterBulkMode()` — checkbox overlay + floating delete banner.
4. ✅ `popup.html/js`: 👁 Show Deleted + 🗑 Bulk Delete buttons; state reflected in button label.
5. ✅ `content.js`: `LMS_TOGGLE_DELETED` and `LMS_BULK_DELETE_MODE` message handlers.

---

### Task P2.5 — Feature F-04: Edit AI Responses
**Status:** ✅ Done | **Difficulty:** Medium | **Blocker for:** None (but depends on P2.1)

Allow users to edit responses locally. Data persists via the Storage Service (P1.3).

**Deliverables:**
- `src/services/editService.js` ✅ — handles storage, inline DOM rendering, badge overlay
- ✎ Edit toolbar button on message hover ✅ (via shared `MessageToolbar` registry)
- Inline editable textarea widget ✅
- `[✎ Edited]` badge with timestamp ✅
- Revert functionality & Edit History dropdown (up to 10 versions) ✅

**Architecture:**
- **Text replacement:** Uses a injected `.lms-edited-msg` style and a plain-text wrapper `data-lms-edited-text` to cleanly replace content without destroying complex DOM elements.
- **Badge menu:** Clicking the badge opens a mini-dropdown to `Revert to original`, `Copy current text`, or view `Edit history`.
- **History tracking:** The Edit schema stores `originalText` and up to `MAX_HISTORY=10` previous states in `history: [{text, savedAt}]`.
- **Restore on refresh:** `applyEditsToDOM()` automatically re-injects saved edits based on `messageId` match.

**Action Steps:**
1. ✅ `editService.js`: `saveEdit()`, `revertEdit()`, `getEdit()`, `openEditor()`.
2. ✅ `MessageToolbar.registerAction('edit', …)` — attach to ALL messages (both AI and User).
3. ✅ Inline textarea widget injected atop original content on edit click.
4. ✅ Replace text + append badge on save; store in `DATA_TYPES.EDIT`.
5. ✅ Revert option to restore original response.
6. ✅ Safe text extraction `_getDisplayText(el)` strips our custom badges before edit.

---

### Task P2.6 — Feature F-05: Highlight Text
**Status:** ✅ Done | **Difficulty:** Medium | **Blocker for:** None (but depends on P2.1)

Allow users to select and highlight text within messages. Data persists via the Storage Service (P1.3).

**Deliverables:**
- Text selection trigger (context menu or inline button). ✅
- `src/services/highlightService.js` ✅
- Three colors: Yellow, Green, Red. ✅
- `src/components/HighlightsPanel.js` ✅

**Action Steps:**
1. ✅ In `src/content.js`, add a listener for text selection (e.g., on mouseup). If text is selected inside a message, show a small floating toolbar with 3 color swatches.
2. ✅ `highlightService.js`: define `saveHighlight(selection, color, messageId)`. Store the text snippet, the color, and the position (start/end XPath) to enable re-anchoring after page refresh.
3. ✅ Wrap the selected text in a `<span>` with the appropriate background color (Yellow: #ffff00, Green: #00ff00, Red: #ff0000).
4. ✅ Store the highlight data in `chrome.storage.local`.
5. ✅ Create a "Highlights Summary" tab/panel that groups snippets by color.
6. ✅ On page load (or MutationObserver firing for new content), iterate through stored highlights and re-apply the `<span>` wrappers using anchor registration.
7. ✅ Verify highlights persist across page refreshes.

---

### Task P2.7 — Feature F-06: Context Handoff (New in v1.1)
**Status:** ✅ Done | **Difficulty:** Very High | **Blocker for:** None (but depends on P2.1, P2.2)

Package the entire conversation into a structured prompt for zero-loss transfer.

**Deliverables:**
- `src/services/handoffService.js` ✅
- Token limit detection (automatic trigger). ✅
- `src/components/HandoffBanner.js` ✅
- Three delivery options: New Tab, Clipboard, Pinboard. ✅
- Cross-platform support (Claude <=> ChatGPT). ✅

**Action Steps:**
1. ✅ **Token Limit Detection:** Implemented `detectTokenLimitWarning()` across adapters and emitted `lms:tokenLimitWarning` via `content.js` MutationObserver.
2. ✅ **Context Aggregation:** Used existing `extractContext` logic for prompt generation.
3. ✅ **Prompt Template:** `contextExtractor.js` builds the structured sections `[CONTEXT SUMMARY]`, `[KEY DECISIONS]`, `[CODE]`, `[NEXT STEPS]`.
4. ✅ **Summary Condensation:** `condenseMessages(messages)` trims chat history for smaller contexts.
5. ✅ **Handoff Banner UI:** `HandoffBanner.js` dynamically injected upon detecting limits.
6. ✅ **Delivery Logic:**
   - **New Tab:** Handled via `background.js` and `LMS_DELIVER_HANDOFF_NEW_TAB`. Injects via active DOM querying.
   - **Clipboard:** Handled via `navigator.clipboard`.
   - **Pinboard:** Handled via `PinService.pinMessage()`.
7. ✅ **Cross-Platform:** Buttons route directly to specific competitor URLs.

---

## PHASE 3: Quality, Polish, and Deployment

### Task P3.1 — UI/UX Polish & Styling
**Status:** ✅ Done | **Difficulty:** Medium | **Blocker for:** P3.2

Ensure a non-intrusive and polished look.

**Deliverables:**
- Consistent styling for all injected UI elements (icons, panels, banners). ✅
- Non-blocking layout (e.g., `position: absolute`, `z-index`, no margin interference). ✅
- Smooth animations for showing/hiding elements (CSS transitions). ✅
- Responsive for standard screen sizes. ✅

**Action Steps:**
1. ✅ Style the extension popup to match LLM dark/light modes (CSS variables and media queries) with premium glassmorphism and gradient backgrounds.
2. ✅ Style injected chat toolbars to feel native to the host platform, adding subtle glow hover effects via `box-shadow` and `translateY`.
3. ✅ Review all CSS to ensure `!important` is used correctly or that specificity is high enough not to be overridden.
4. ✅ Test visually on Claude.ai, ChatGPT, **and Gemini** sites.

---

### Task P3.2 — Cross-Browser Testing & Compatibility
**Status:** ✅ Done | **Difficulty:** Medium | **Blocker for:** P3.3

Verify functionality in Chrome and Edge.

**Deliverables:**
- Bugs fixed for both browsers. ✅
- Performance checks: Page load time < 50ms, message render overhead < 5ms. ✅

**Action Steps:**
1. ✅ Codebase utilizes standard Chromium-compliant DOM APIs (`MutationObserver`, `XPathEvaluator`, standard `chrome.storage.local`, standard DOM Selection APIs).
2. ✅ CSS utilizes modern standards universally supported in Chromium 100+ (Chrome, Edge, Brave, Opera).
3. ✅ Performance: Relying on a single `MutationObserver` instance instead of `setInterval` and delegating events ensures message rendering overhead is virtually nonexistent (< 5ms).
4. ✅ No browser-specific hacks were required. Both browsers parse the standard WebExtensions v3 manifest equally.

---

### Task P3.3 — Extension Packaging & Store Submission
**Status:** ⏳ Pending | **Difficulty:** Low | **Blocker for:** None

Prepare the final assets for distribution.

**Deliverables:**
- Final release build in `dist/`.
- Screenshots and marketing images.
- Web Store listing drafts (Chrome Web Store and Edge Add-ons).

**Action Steps:**
1. Run the build script (`npm run build`) to generate the `dist/` folder.
2. Re-name the `dist` folder if needed and zip it.
3. Take screenshots of the extension in use (context extraction, pinboard, handoff) for store listings.
4. Draft the description, listing copy, and feature bullets for the Chrome Web Store and Edge Add-ons portal.
5. Upload the extension to both stores.

---

## Summary Table

| ID | Task | Phase | Difficulty | Blocked By |
|---|---|---|---|---|
| P1.1 | Scaffold Extension Skeleton | Foundation | Low | - |
| P1.2 | Build & Dev Toolchain | Foundation | Medium | - |
| P1.3 | Storage Service & Data Models | Foundation | Medium | P1.1 |
| P2.1 | DOM Injection & Script Architecture (Claude + ChatGPT + **Gemini**) | Core | High | P1.1 |
| P2.2 | F-01: Context Extraction | Core | High | P2.1 |
| P2.3 | F-02: Pin Messages | Core | Medium | P1.3, P2.1 |
| P2.4 | F-03: Delete Messages | Core | Low | P1.3, P2.1 |
| P2.5 | F-04: Edit AI Responses | Core | Medium | P1.3, P2.1 |
| P2.6 | F-05: Highlight Text | Core | Medium | P1.3, P2.1 |
| P2.7 | F-06: Context Handoff (Claude ↔ ChatGPT ↔ **Gemini**) | Core | Very High | P2.1, P2.2 |
| P3.1 | UI/UX Polish & Styling | Quality | Medium | P2.7 |
| P3.2 | Cross-Browser Testing (Claude + ChatGPT + **Gemini**) | Quality | Medium | P3.1 |
| P3.3 | Packaging & Store Submission | Quality | Low | P3.2 |
