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
**Status:** ⏳ Pending | **Difficulty:** High | **Blocker for:** None (but depends on P2.1)

Analyze the current chat and extract topics, key entities, and a brief summary.

**Deliverables:**
- `src/services/contextExtractor.js`
- `src/components/ContextSidePanel.jsx` (or similar)
- Triggered via extension icon (reads from adapter) or `chrome.action.onClicked` if no popup is currently open (as a basic entry point).

**Action Steps:**
1. Implement `extractContext(adapter)` that iterates messages using the adapter.
2. For the MVP, use a simple heuristic (e.g., keyword extraction, looking for code blocks, specific leading phrases like "In summary...") to identify topics and entities.
3. Generate a condensed summary of the conversation thread.
4. Create a side panel HTML structure (injecting it into the LLM's page DOM or as a separate popup).
5. Render the extracted context in the side panel.
6. Trigger via the extension icon and verify the correct summary appears.

---

### Task P2.3 — Feature F-02: Pin Messages
**Status:** ⏳ Pending | **Difficulty:** Medium | **Blocker for:** None (but depends on P1.3, P2.1)

Allow users to pin key messages to a Pinboard. Data persists via the Storage Service (P1.3).

**Deliverables:**
- Pin icon injected on message hover.
- `src/services/pinService.js`
- `src/components/PinboardPanel.jsx`
- Drag-and-drop reordering.

**Action Steps:**
1. In `src/content.js` (using the MutationObserver from P2.1), add a "Pin" SVG icon on hover for each message element provided by the adapter.
2. `pinService.js`: define `pinMessage(messageData)` (message text, timestamp, platform, conversationId).
3. Save pins using the storage service (P1.3).
4. Render a "Pinboard" tab in the popup (or as a side panel) listing all pinned messages.
5. Implement drag-and-drop for reordering pins in `PinboardPanel.jsx`.
6. Implement unpinning (removes from storage and UI).

---

### Task P2.4 — Feature F-03: Delete Non-Required Messages
**Status:** ⏳ Pending | **Difficulty:** Low | **Blocker for:** None (but depends on P2.1)

Implement a soft-delete mechanism for messages (view-layer only). Data persists via the Storage Service (P1.3).

**Deliverables:**
- Delete icon on message hover.
- `src/services/deleteService.js`
- Bulk delete mode.
- Toggle to show/hide deleted messages.

**Action Steps:**
1. In `src/content.js`, add a "Delete" icon on hover for messages.
2. `deleteService.js`: define `softDeleteMessage(messageId)`. Store the ID in `chrome.storage.local`.
3. When a message is soft-deleted, apply a CSS class (e.g., `lm-source-hidden`) to it in the DOM to hide it.
4. Add a "Show/Hide Deleted" toggle button (perhaps in the popup or a floating toolbar) that removes/adds the CSS class.
5. Implement bulk delete mode: allow the user to select multiple messages (checkboxes) and click a "Delete Selected" button.
6. Verify that refreshing the page hides the messages correctly based on stored IDs (using the adapter to match messages).

---

### Task P2.5 — Feature F-04: Edit AI Responses
**Status:** ⏳ Pending | **Difficulty:** Medium | **Blocker for:** None (but depends on P2.1)

Allow users to edit AI responses locally. Data persists via the Storage Service (P1.3).

**Deliverables:**
- Edit icon on AI message hover.
- `src/services/editService.js`
- Editable text area.
- `[Edited]` tag with a timestamp.
- Original text recovery.

**Action Steps:**
1. In `src/content.js`, add an "Edit" icon specifically on AI message elements (distinguish user vs. AI messages via the adapter).
2. `editService.js`: define `saveEdit(messageId, newText)`. Store the original text and the edited text in `chrome.storage.local`.
3. On click, swap the message text in the DOM for a `contenteditable` block or a `<textarea>`.
4. On save, replace the text in the DOM with the new version, append a small `<span>` with `[Edited YYYY-MM-DD HH:mm]`.
5. Provide a mechanism to view the original (e.g., a "Revert" or "Show Original" button).
6. Ensure edits are purely local and do not interact with the LLM session.

---

### Task P2.6 — Feature F-05: Highlight Text
**Status:** ⏳ Pending | **Difficulty:** Medium | **Blocker for:** None (but depends on P2.1)

Allow users to select and highlight text within messages. Data persists via the Storage Service (P1.3).

**Deliverables:**
- Text selection trigger (context menu or inline button).
- `src/services/highlightService.js`
- Three colors: Yellow, Green, Red.
- `src/components/HighlightsPanel.jsx`

**Action Steps:**
1. In `src/content.js`, add a listener for text selection (e.g., on mouseup). If text is selected inside a message, show a small floating toolbar with 3 color swatches.
2. `highlightService.js`: define `saveHighlight(selection, color, messageId)`. Store the text snippet, the color, and the position (XPath or text offset) to enable re-anchoring after page refresh.
3. Wrap the selected text in a `<span>` with the appropriate background color (Yellow: #ffff00, Green: #00ff00, Red: #ff0000).
4. Store the highlight data in `chrome.storage.local`.
5. Create a "Highlights Summary" tab/panel that groups snippets by color.
6. On page load (or MutationObserver firing for new content), iterate through stored highlights and re-apply the `<span>` wrappers using anchor registration.
7. Verify highlights persist across page refreshes.

---

### Task P2.7 — Feature F-06: Context Handoff (New in v1.1)
**Status:** ⏳ Pending | **Difficulty:** Very High | **Blocker for:** None (but depends on P2.1, P2.2)

Package the entire conversation into a structured prompt for zero-loss transfer.

**Deliverables:**
- `src/services/handoffService.js`
- Token limit detection (automatic trigger).
- `src/components/HandoffBanner.jsx`
- Three delivery options: New Tab, Clipboard, Pinboard.
- Cross-platform support (Claude <=> ChatGPT).

**Action Steps:**
1. **Token Limit Detection:** Implement `detectTokenLimit()` in the content script using the adapter. Use `MutationObserver` to check for the specific error/warning text or CSS classes.
2. **Context Aggregation:** Implement `generateHandoffPrompt(adapter, currentUrl)` in `handoffService.js`. This must iterate through messages and generate the structured prompt.
3. **Prompt Template:** Build a template string with these sections: System preamble, `[CONTEXT SUMMARY]`, `[KEY DECISIONS]`, `[CODE]`, `[NEXT STEPS]`, and the confirmation request line.
4. **Summary Condensation:** Implement a `condenseMessages(messages)` function. For old messages, strip to the last sentence. For very long messages, truncate or summarize (use a simple heuristic for MVP: code blocks kept verbatim, text trailed by "...").
5. **Handoff Banner UI:** When a token limit is detected, inject a floating `HandoffBanner.jsx` at the top of the chat window.
6. **Delivery Logic:**
   - **New Tab:** `chrome.tabs.create({ url })`, then use `chrome.scripting.executeScript` to inject the prompt into the input field.
   - **Clipboard:** Use the `navigator.clipboard` API (with `clipboardWrite` permission).
   - **Pinboard:** Save to Pinboard using `pinService` (from P2.3).
7. **Cross-Platform:** Allow the user to select the target platform (Claude, ChatGPT, **or Gemini**) in the banner UI.

---

## PHASE 3: Quality, Polish, and Deployment

### Task P3.1 — UI/UX Polish & Styling
**Status:** ⏳ Pending | **Difficulty:** Medium | **Blocker for:** P3.2

Ensure a non-intrusive and polished look.

**Deliverables:**
- Consistent styling for all injected UI elements (icons, panels, banners).
- Non-blocking layout (e.g., `position: absolute`, `z-index`, no margin interference).
- Smooth animations for showing/hiding elements (CSS transitions).
- Responsive for standard screen sizes.

**Action Steps:**
1. Style the extension popup to match LLM dark/light modes (CSS variables and media queries).
2. Style injected chat toolbars to feel native to the host platform.
3. Review all CSS to ensure `!important` is used correctly or that specificity is high enough not to be overridden.
4. Test visually on Claude.ai, ChatGPT, **and Gemini** sites.

---

### Task P3.2 — Cross-Browser Testing & Compatibility
**Status:** ⏳ Pending | **Difficulty:** Medium | **Blocker for:** P3.3

Verify functionality in Chrome and Edge.

**Deliverables:**
- Bugs fixed for both browsers.
- Performance checks: Page load time < 50ms, message render overhead < 5ms.

**Action Steps:**
1. Load the extension in Chrome. Go through each feature (P2.2 to P2.7) on Claude.ai, ChatGPT, **and Gemini**. Log bugs.
2. Load the extension in Edge. Repeat tests.
3. Use Chrome DevTools Performance tab to measure impact on page load and message rendering.
4. Fix any browser-specific issues.

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
