# LM-Source

> **Supercharge Claude, ChatGPT & Gemini** — extract context, pin messages, edit AI responses, highlight text, and hand off conversations seamlessly across platforms.

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-green)
![Platforms](https://img.shields.io/badge/platforms-Claude%20%7C%20ChatGPT%20%7C%20Gemini-purple)

---

## Overview

**LM-Source** is a Chrome/Edge extension (Manifest V3) that enhances your experience on the three major AI chat platforms. It injects a non-intrusive UI layer directly into Claude, ChatGPT, and Gemini — giving you powerful tools to manage, annotate, and migrate your conversations without ever leaving the page.

---

## Features

| Feature | Description |
|---|---|
| **✦ Context Extraction** | Analyses the full conversation and extracts topics, key decisions, next steps, code blocks, and a condensed summary into a structured 5-tab side panel. |
| **📌 Pinboard** | Pin important messages to a persistent, draggable pinboard panel. Supports drag-and-drop reordering. |
| **✎ Edit AI Responses** | Locally edit any message (user or AI). Saves edit history (up to 10 versions) with a revert option. |
| **🗑 Delete Messages** | Soft-delete messages from view. Supports bulk delete mode and show/hide toggle. No data is mutated. |
| **🖍 Highlight Text** | Select and highlight text in three colours (Yellow, Green, Red) with XPath-based re-anchoring on page reload. |
| **🚀 Context Handoff** | Package the entire conversation into a structured prompt and transfer it to any supported platform — via new tab, clipboard, or pinboard. Auto-triggers on token limit detection. |

---

## Supported Platforms

- **Claude.ai** (`claude.ai/*`)
- **ChatGPT** (`chat.openai.com/*`, `chatgpt.com/*`)
- **Google Gemini** (`gemini.google.com/*`)

---

## Architecture

```
LM-Source/
├── manifest.json               # MV3 extension manifest
├── src/
│   ├── background.js           # Service worker: lifecycle, URL opening, handoff delivery
│   ├── content.js              # Main content script: MutationObserver, adapter selection, feature init
│   ├── popup.html / popup.js   # Extension popup UI
│   ├── popup.css               # Popup styles (glassmorphism, dark mode)
│   │
│   ├── adapters/               # Platform-specific DOM adapters
│   │   ├── baseAdapter.js
│   │   ├── claudeAdapter.js
│   │   ├── chatgptAdapter.js
│   │   └── geminiAdapter.js    # Handles Angular custom elements & Shadow DOM
│   │
│   ├── services/               # Core logic layer
│   │   ├── storage.js          # chrome.storage.local wrapper with LRU quota management
│   │   ├── contextExtractor.js # Regex-based analysis: topics, decisions, code, summary
│   │   ├── pinService.js       # Pin CRUD + pub/sub change listeners
│   │   ├── editService.js      # Edit/revert/history management
│   │   ├── deleteService.js    # Soft-delete, bulk ops, state restoration
│   │   ├── highlightService.js # Text selection, colour wrapping, XPath anchoring
│   │   ├── handoffService.js   # Handoff prompt assembly & delivery
│   │   └── types.js            # JSDoc type definitions (Pin, Edit, Highlight, etc.)
│   │
│   └── components/             # Injected UI components
│       ├── ContextSidePanel.js # 5-tab sliding panel (Summary, Decisions, Code, Timeline, Handoff)
│       ├── PinboardPanel.js    # Left-edge amber panel with drag-and-drop
│       ├── HighlightsPanel.js  # Colour-grouped highlights summary panel
│       ├── HandoffBanner.js    # Auto-injected banner on token limit detection
│       ├── messageToolbar.js   # Shared hover toolbar with action registry
│       └── highlightToolbar.js # Floating colour-picker toolbar on text selection
│
├── vite.config.js              # Vite build config for extension output
└── package.json
```

### Key Design Decisions

- **Adapter Pattern** — Each platform has its own adapter implementing a common `PlatformAdapter` interface (`getMessageElements`, `extractMessageData`, `getPlatformIdentifier`, `detectTokenLimitWarning`). The content script detects the hostname and instantiates the correct adapter at runtime.
- **Single MutationObserver** — One observer per page watches for new messages, keeping rendering overhead under 5ms.
- **Soft-delete only** — No LLM data is ever mutated. Deletions are purely DOM-level (`max-height: 0; opacity: 0`), restored on every page reload via stored message IDs.
- **Storage quota management** — All data is namespaced by `(platform, conversationId, type)` in `chrome.storage.local` with a 2MB self-imposed quota and LRU eviction.
- **Action registry** — `MessageToolbar` exposes a registry so features (pin, edit, delete) add their buttons independently without modifying the shared toolbar code.
- **Gemini Shadow DOM** — The Gemini adapter includes a `queryShadow()` helper to pierce one level of Shadow DOM for elements encapsulated by Angular custom elements (`<conversation-turn>`, `<model-response>`, etc.).

---

## Data Models

| Type | Key Fields |
|---|---|
| `Pin` | `id`, `platform`, `conversationId`, `messageId`, `role`, `text`, `pinnedAt`, `order` |
| `Highlight` | `id`, `messageId`, `text`, `color`, `startPath`, `startOffset`, `endPath`, `endOffset` |
| `Edit` | `id`, `messageId`, `originalText`, `editedText`, `editedAt`, `history[]` |
| `DeletedMessage` | `id`, `messageId`, `deletedAt` |
| `HandoffPrompt` | `id`, `sourcePlatform`, `targetPlatform`, `promptText`, `deliveredVia` |

---

## Development Setup

### Prerequisites

- Node.js >= 18
- Chrome or Edge (Chromium 100+)

### Install & Build

```bash
# Install dependencies
npm install

# Watch mode (rebuild on file changes)
npm run dev

# Production build
npm run build

# Build + zip for distribution
npm run zip
```

Build output goes to `dist/`.

### Load as Unpacked Extension

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `dist/` folder.
4. Navigate to Claude, ChatGPT, or Gemini to activate.

---

## Permissions

| Permission | Reason |
|---|---|
| `activeTab` | Read the active tab's URL to detect the platform |
| `storage` | Persist pins, edits, highlights, and deleted messages |
| `scripting` | Inject content scripts programmatically |
| `clipboardWrite` | Copy handoff prompts and code blocks to clipboard |
| `tabs` | Open new tabs for cross-platform handoff |

---

## Browser Compatibility

| Browser | Status |
|---|---|
| Chrome | ✅ Supported |
| Edge | ✅ Supported |
| Brave / Opera | ✅ Compatible (Chromium 100+) |
| Firefox | ❌ Not supported (MV3 API differences) |

---

## Roadmap

- [ ] Chrome Web Store submission
- [ ] Edge Add-ons portal submission
- [ ] Store screenshots and marketing assets
- [ ] Firefox / Safari port

---

## License

Private — all rights reserved. Distribution pending marketplace submission.
