// src/services/types.js
// LM-Source — Shared JSDoc type definitions
// Import with: import './types.js' or reference via @typedef in consuming files.
// These are documentation-only; no runtime code is exported.

/**
 * @typedef {object} Pin
 * @property {string} id             - Unique identifier (UUID or timestamp-based)
 * @property {string} platform       - 'claude' | 'chatgpt'
 * @property {string} conversationId - Parent conversation thread ID
 * @property {string} messageId      - DOM-derived ID of the pinned message element
 * @property {'user'|'assistant'} role - Who authored the message
 * @property {string} text           - Full plain-text content of the message
 * @property {number} pinnedAt       - Unix ms timestamp of when the pin was created
 * @property {number} order          - Display order index (0 = top); supports drag-drop
 * @property {number} [_updatedAt]   - Auto-set by StorageService.set(); used for LRU eviction
 */

/**
 * @typedef {object} Highlight
 * @property {string} id             - Unique identifier
 * @property {string} platform
 * @property {string} conversationId
 * @property {string} messageId
 * @property {string} text           - The highlighted text snippet
 * @property {'yellow'|'green'|'red'} color - Highlight colour
 * @property {string} xpath          - XPath to the text node for re-anchoring after page reload
 * @property {number} textOffset     - Character offset within the text node
 * @property {number} createdAt      - Unix ms
 * @property {number} [_updatedAt]
 */

/**
 * @typedef {object} Edit
 * @property {string} id             - Unique identifier
 * @property {string} platform
 * @property {string} conversationId
 * @property {string} messageId
 * @property {string} originalText   - Verbatim original AI response
 * @property {string} editedText     - User's local replacement text
 * @property {number} editedAt       - Unix ms
 * @property {number} [_updatedAt]
 */

/**
 * @typedef {object} DeletedMessage
 * @property {string} id             - Unique identifier
 * @property {string} platform
 * @property {string} conversationId
 * @property {string} messageId      - DOM-derived ID used to match the message on reload
 * @property {number} deletedAt      - Unix ms
 * @property {number} [_updatedAt]
 */

/**
 * @typedef {object} HandoffPrompt
 * @property {string} id               - Unique identifier
 * @property {string} sourcePlatform   - Platform the handoff was initiated from
 * @property {string} targetPlatform   - Intended destination platform
 * @property {string} conversationId
 * @property {string} promptText       - Full structured handoff prompt string
 * @property {number} createdAt        - Unix ms
 * @property {'new_tab'|'clipboard'|'pinboard'|'pending'} deliveredVia
 * @property {number} [_updatedAt]
 */

/**
 * @typedef {object} StorageQuotaInfo
 * @property {number} usedBytes    - Current usage in bytes
 * @property {number} quotaBytes   - Self-imposed budget (2 MB)
 * @property {number} usedPercent  - Ratio 0–1
 */

export {};
