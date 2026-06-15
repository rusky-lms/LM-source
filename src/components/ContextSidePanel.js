// src/components/ContextSidePanel.js
// LM-Source — Context Side Panel (P2.2)
//
// Injects a collapsible side panel into the host LLM page (Claude / ChatGPT /
// Gemini) to display the extracted context. Renders without any framework — pure
// DOM manipulation so it works in any content-script environment.
//
// Public API:
//   ContextSidePanel.render(extractedContext)  — create / update the panel
//   ContextSidePanel.open()                    — show the panel
//   ContextSidePanel.close()                   — hide the panel
//   ContextSidePanel.toggle()                  — toggle visibility
//   ContextSidePanel.destroy()                 — remove from DOM entirely

'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────

const PANEL_ID        = 'lms-context-panel';
const TOGGLE_BTN_ID   = 'lms-context-toggle-btn';
const OVERLAY_ID      = 'lms-context-overlay';
const STYLE_ID        = 'lms-context-styles';

const PANEL_WIDTH     = '400px';
const Z_INDEX         = '2147483640'; // Near-max; above most host-page elements

// Platform display names
const PLATFORM_LABELS = {
  claude:   '🟣 Claude.ai',
  chatgpt:  '🟢 ChatGPT',
  gemini:   '🔵 Google Gemini',
  unknown:  '❓ Unknown',
};

// ── Styles ────────────────────────────────────────────────────────────────────

/**
 * Build the CSS string for all injected elements.
 * Uses a unique prefix `lms-` on every class / ID to avoid conflicts with the
 * host page's stylesheet.
 *
 * @returns {string}
 */
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

// ── DOM helpers ───────────────────────────────────────────────────────────────

/** @returns {HTMLElement | null} */
const getPanel = () => document.getElementById(PANEL_ID);

/** Escape HTML special characters to prevent XSS from message content */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Tab switching ─────────────────────────────────────────────────────────────

function activateTab(panel, tabId) {
  panel.querySelectorAll('.lms-tab-btn').forEach(btn => {
    btn.classList.toggle('lms-active', btn.dataset.tab === tabId);
  });
  panel.querySelectorAll('.lms-tab-pane').forEach(pane => {
    pane.classList.toggle('lms-active', pane.dataset.pane === tabId);
  });
}

// ── Content renderers ─────────────────────────────────────────────────────────

/**
 * Render the "Summary" tab pane.
 * @param {import('../services/contextExtractor.js').ExtractedContext} ctx
 * @returns {string}
 */
function renderSummaryTab(ctx) {
  const timestamp = new Date(ctx.extractedAt).toLocaleTimeString();
  const topicPills = ctx.topics.length
    ? ctx.topics.map(t => `<span class="lms-topic-pill">${esc(t)}</span>`).join('')
    : '<span class="lms-empty">No topics detected.</span>';

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

/**
 * Render the "Decisions" tab pane.
 * @param {import('../services/contextExtractor.js').ExtractedContext} ctx
 * @returns {string}
 */
function renderDecisionsTab(ctx) {
  if (ctx.decisions.length === 0) {
    return `<div class="lms-empty">No decisions or conclusions detected in this conversation.</div>`;
  }

  const cards = ctx.decisions.map(d => `
    <div class="lms-card lms-decision-card">
      <div class="lms-card-role ${esc(d.role)}">${esc(d.role)}</div>
      <div>${esc(d.sentence)}</div>
    </div>
  `).join('');

  const steps = ctx.nextSteps.length === 0 ? '' : `
    <p class="lms-section-heading">Next Steps</p>
    ${ctx.nextSteps.map(s => `
      <div class="lms-card lms-nextstep-card">
        <div class="lms-card-role ${esc(s.role)}">${esc(s.role)}</div>
        <div>${esc(s.sentence)}</div>
      </div>
    `).join('')}
  `;

  return `
    <p class="lms-section-heading">Key Decisions (${ctx.decisions.length})</p>
    ${cards}
    ${steps}
  `;
}

/**
 * Render the "Code" tab pane.
 * @param {import('../services/contextExtractor.js').ExtractedContext} ctx
 * @returns {string}
 */
function renderCodeTab(ctx) {
  if (ctx.codeBlocks.length === 0) {
    return `<div class="lms-empty">No fenced code blocks detected in this conversation.</div>`;
  }

  return ctx.codeBlocks.map((block, idx) => `
    <div class="lms-code-card" data-block-idx="${idx}">
      <div class="lms-code-header">
        <span class="lms-code-lang">${esc(block.language || 'plaintext')}</span>
        <button class="lms-copy-btn" data-copy-idx="${idx}" title="Copy code">📋 Copy</button>
      </div>
      <pre class="lms-code-body">${esc(block.code)}</pre>
    </div>
  `).join('');
}

/**
 * Render the "Timeline" tab pane.
 * @param {import('../services/contextExtractor.js').ExtractedContext} ctx
 * @returns {string}
 */
function renderTimelineTab(ctx) {
  if (ctx.condensed.length === 0) {
    return `<div class="lms-empty">No messages to display.</div>`;
  }

  return ctx.condensed.map(msg => {
    const roleClass = msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'assistant' : 'unknown';
    const badge = msg.verbatim
      ? `<span class="lms-verbatim-badge">VERBATIM</span>`
      : '';
    return `
      <div class="lms-timeline-msg ${roleClass} ${msg.verbatim ? 'verbatim' : ''}">
        <div class="lms-tl-label">${esc(msg.role.toUpperCase())}${badge}</div>
        <div>${esc(msg.text)}</div>
      </div>
    `;
  }).join('');
}

/**
 * Render the "Handoff" tab pane.
 * @param {import('../services/contextExtractor.js').ExtractedContext} ctx
 * @returns {string}
 */
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

// ── Panel builder ─────────────────────────────────────────────────────────────

/**
 * Build the full panel HTML string.
 * @param {import('../services/contextExtractor.js').ExtractedContext} ctx
 * @returns {string}
 */
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

// ── Event wiring ──────────────────────────────────────────────────────────────

/** @type {import('../services/contextExtractor.js').ExtractedContext | null} */
let _lastContext = null;

/** @type {Function | null} callback invoked when Refresh is clicked */
let _onRefresh = null;

/**
 * Wire all interactive elements inside the panel.
 * @param {HTMLElement} panel
 * @param {import('../services/contextExtractor.js').ExtractedContext} ctx
 */
function wireEvents(panel, ctx) {
  // Tab switching
  panel.querySelectorAll('.lms-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => activateTab(panel, btn.dataset.tab));
  });

  // Close button
  panel.querySelector('#lms-close-btn')?.addEventListener('click', () => ContextSidePanel.close());

  // Refresh button
  panel.querySelector('#lms-refresh-btn')?.addEventListener('click', () => {
    if (typeof _onRefresh === 'function') _onRefresh();
  });

  // Copy individual code blocks
  panel.querySelectorAll('.lms-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.copyIdx);
      const block = ctx.codeBlocks[idx];
      if (!block) return;
      navigator.clipboard.writeText(block.code).then(() => {
        btn.textContent = '✅ Copied';
        btn.classList.add('lms-copied');
        setTimeout(() => {
          btn.textContent = '📋 Copy';
          btn.classList.remove('lms-copied');
        }, 1800);
      });
    });
  });

  // Copy handoff prompt
  panel.querySelector('#lms-copy-handoff')?.addEventListener('click', () => {
    const btn = panel.querySelector('#lms-copy-handoff');
    navigator.clipboard.writeText(ctx.handoffPrompt).then(() => {
      if (btn) {
        btn.textContent = '✅ Copied!';
        btn.classList.add('success');
        setTimeout(() => {
          btn.textContent = '📋 Copy Prompt';
          btn.classList.remove('success');
        }, 2000);
      }
    });
  });

  // Open target platform
  const platformUrls = {
    '#lms-open-claude':   'https://claude.ai/new',
    '#lms-open-chatgpt':  'https://chatgpt.com/',
    '#lms-open-gemini':   'https://gemini.google.com/',
  };
  for (const [selector, url] of Object.entries(platformUrls)) {
    panel.querySelector(selector)?.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'LMS_OPEN_URL',
        url,
      });
    });
  }
}

// ── Public API object ─────────────────────────────────────────────────────────

const ContextSidePanel = {
  /**
   * Create or update the side panel with new extracted context.
   *
   * @param {import('../services/contextExtractor.js').ExtractedContext} ctx
   * @param {{ onRefresh?: Function }} [options]
   */
  render(ctx, { onRefresh } = {}) {
    _lastContext = ctx;
    _onRefresh = onRefresh || null;

    // Inject styles (once)
    if (!document.getElementById(STYLE_ID)) {
      const styleEl = document.createElement('style');
      styleEl.id = STYLE_ID;
      styleEl.textContent = buildStyles();
      document.head.appendChild(styleEl);
    }

    // Create or reuse panel element
    let panel = getPanel();
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      panel.setAttribute('role', 'complementary');
      panel.setAttribute('aria-label', 'LM-Source Context Panel');
      document.body.appendChild(panel);
    }

    panel.innerHTML = buildPanelHTML(ctx);
    wireEvents(panel, ctx);

    // Create floating toggle button (once)
    if (!document.getElementById(TOGGLE_BTN_ID)) {
      const toggleBtn = document.createElement('button');
      toggleBtn.id = TOGGLE_BTN_ID;
      toggleBtn.title = 'Toggle LM-Source Context Panel';
      toggleBtn.innerHTML = '✦ LM-Source';
      toggleBtn.addEventListener('click', () => ContextSidePanel.toggle());
      document.body.appendChild(toggleBtn);
    }
  },

  /** Show the panel. */
  open() {
    const panel = getPanel();
    if (panel) panel.classList.add('lms-panel-open');
  },

  /** Hide the panel. */
  close() {
    const panel = getPanel();
    if (panel) panel.classList.remove('lms-panel-open');
  },

  /** Toggle open/closed state. */
  toggle() {
    const panel = getPanel();
    if (panel) panel.classList.toggle('lms-panel-open');
  },

  /** Remove the panel and its toggle button from the DOM entirely. */
  destroy() {
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(TOGGLE_BTN_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    _lastContext = null;
  },

  /** True if the panel currently exists in the DOM. */
  get isRendered() {
    return !!getPanel();
  },

  /** True if the panel is visible (open). */
  get isOpen() {
    return !!getPanel()?.classList.contains('lms-panel-open');
  },
};

export default ContextSidePanel;
export { ContextSidePanel };
