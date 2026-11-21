/*
 * dsh-manager — browser half.
 *
 * One sidebar entry opens one management page with five tabs:
 * 技能 (hierarchical categories under ~/.agents/skills), MCP (stdio servers),
 * 联网搜索 (the Host web seam), 模式 (agent presets), 局域网访问 (the LAN
 * listener) and 工具 (the catalog of every tool the manager hands the agent,
 * grouped by the module that owns it).
 *
 * The panel only talks to `/api/manager`, served by the Host half. Skill
 * bodies are read on demand; the catalog stays a list of summaries until a
 * category or skill is enabled and a loaded body is requested.
 */
window.__ModuleLoader__.load({
	id: 'dsh-manager',
	factory: function (require) {
		var react = require('react');

		var h = react.createElement;
		var useState = react.useState;
		var useEffect = react.useEffect;
		var useCallback = react.useCallback;
		var useRef = react.useRef;

		var NS = 'dsh-manager';
		var PANEL_ID = 'manager';
		var PANEL_ORDER = 20;
		// After 插件市场 (dshmarket registers its settings row at 40).
		var SETTINGS_ORDER = 50;
		var API_PREFIX = '/api/manager';

		/* rewind-client:start — vendored from dsh-rewind-plugin 0.22.2 (MIT, see rewind/NOTICE) */
		function createRewindClient(require) {

    var module = { exports: {} };
    var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// src/client/candidates.ts
var PREVIEW_CHARS = 80;
var DEFAULT_CANDIDATE_LIMIT = 100;
function messagePreviewOf(message) {
  const text = message.content.map((block) => block.type === "text" && typeof block.text === "string" ? block.text : "").join("").replace(/\s+/g, " ").trim();
  return text.length <= PREVIEW_CHARS ? text : `${text.slice(0, PREVIEW_CHARS - 1)}\u2026`;
}
function formatCandidateTime(time) {
  const d = new Date(time);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
function rewindCandidatesOf(snap, limit = DEFAULT_CANDIDATE_LIMIT) {
  const candidates = [];
  for (let i = snap.order.length - 1; i >= 0 && candidates.length < limit; i--) {
    const key = snap.order[i];
    if (key === void 0) continue;
    const node = snap.nodes.get(key);
    if (node === void 0 || node.kind !== "user" && node.kind !== "steering") continue;
    candidates.push({
      seq: node.data.seq,
      time: node.data.time,
      preview: messagePreviewOf(node.data)
    });
  }
  return candidates;
}
function rewindCandidatesOfChat(snap) {
  return rewindCandidatesOf(snap);
}
function rewindOptionsFromCandidates(candidates, t) {
  return candidates.map((candidate) => ({
    id: String(candidate.seq),
    label: candidate.preview || t("popover.noText"),
    detail: formatCandidateTime(candidate.time)
  }));
}

// src/client/hidden.ts
var ENGINE_COMMAND = "rewind-plugin";
var LEGACY_ENGINE_COMMAND = "rewind";
var ENGINE_COMMANDS = /* @__PURE__ */ new Set([ENGINE_COMMAND, LEGACY_ENGINE_COMMAND]);
function chatNodesOf(chat) {
  if (chat === void 0) return EMPTY_NODES;
  const values = chat.nodes.values;
  if (typeof values === "function") return [...values.call(chat.nodes)];
  const nodes = [];
  for (const key of chat.order) {
    const node = chat.nodes.get(key);
    if (node !== void 0) nodes.push(node);
  }
  return nodes;
}
var EMPTY_NODES = [];
function resolveChatWatch(resolveView, sessionId, cb) {
  const view = resolveView(sessionId);
  return view?.subscribe?.(cb) ?? (() => {
  });
}
function chatSnapshotOf(chatView) {
  return chatView?.getSnapshot() ?? void 0;
}
function messageTextAt(chat, seq) {
  if (chat === void 0) return void 0;
  for (const node of chatNodesOf(chat)) {
    if (node.kind !== "user" && node.kind !== "steering") continue;
    const data = node.data;
    if (data.seq === seq) {
      return data.content?.map((block) => block.type === "text" && typeof block.text === "string" ? block.text : "").join("");
    }
  }
  return void 0;
}
function imageRefsOf(content) {
  const images = [];
  for (const block of content ?? []) {
    if (block.type !== "image") continue;
    const attachment = block.attachment;
    if (typeof attachment?.attachmentId !== "string" || typeof attachment.mediaType !== "string") continue;
    images.push({
      attachmentId: attachment.attachmentId,
      mediaType: attachment.mediaType,
      bytes: typeof attachment.bytes === "number" ? attachment.bytes : void 0,
      width: typeof attachment.width === "number" ? attachment.width : void 0,
      height: typeof attachment.height === "number" ? attachment.height : void 0,
      name: typeof attachment.name === "string" ? attachment.name : void 0
    });
  }
  return images;
}
function messageAttachmentsAt(chat, seq) {
  if (chat === void 0) return void 0;
  for (const node of chatNodesOf(chat)) {
    if (node.kind !== "user" && node.kind !== "steering") continue;
    const data = node.data;
    if (data.seq !== seq) continue;
    return imageRefsOf(data.content);
  }
  return void 0;
}
function targetSeqOfArgs(args) {
  if (args === void 0 || args === null) return void 0;
  const match = args.match(/@(\d+)/);
  return match !== null ? Number(match[1]) : void 0;
}
function isExecutedRewindCommand(node, seq) {
  if (node.name === null || !ENGINE_COMMANDS.has(node.name) || node.outcome?.kind !== "success") return false;
  if (node.outcome.sourceEventSeq === void 0) return false;
  const args = node.args ?? "";
  return new RegExp(`(?:^|\\s)@${seq}(?:\\s|$)`).test(args);
}
function isPreviewCommand(command) {
  return (command.args ?? "").includes("preview");
}
function isCandidateCommand(command) {
  return (command.args ?? "").includes("__candidates");
}
function rewindCutsOf(nodes) {
  const cuts = [];
  for (const node of nodes) {
    if (node.kind !== "command") continue;
    const command = node.data;
    if (command.name === null || !ENGINE_COMMANDS.has(command.name)) continue;
    if (isPreviewCommand(command) || isCandidateCommand(command)) continue;
    if (command.outcome?.kind !== "success") continue;
    const marker = command.outcome.sourceEventSeq;
    if (marker === void 0) continue;
    const target = targetSeqOfArgs(command.args);
    if (target === void 0 || target > marker) continue;
    cuts.push({ target, marker });
  }
  return cuts;
}

// src/client/placement-guard.ts
var SIDE_INSET = 12;
var GAP = 4;
var EPSILON = 0.5;
var IS_GECKO = typeof navigator !== "undefined" && /\bFirefox\//.test(navigator.userAgent);
function pinnedPosition(anchor, size, viewport, placement, topInset) {
  const maxLeft = Math.max(SIDE_INSET, viewport.width - size.width - SIDE_INSET);
  const left = Math.min(Math.max(anchor.left, SIDE_INSET), maxLeft);
  const above = anchor.top - size.height - GAP;
  const below = anchor.bottom + GAP;
  const preferred = placement === "above" ? above : below;
  const opposite = placement === "above" ? below : above;
  const maxTop = Math.max(topInset, viewport.height - size.height - SIDE_INSET);
  const fits = (top) => top >= topInset && top <= maxTop;
  const chosen = !fits(preferred) && fits(opposite) ? opposite : preferred;
  return { left, top: Math.min(Math.max(chosen, topInset), maxTop) };
}
function readTopInset(panel) {
  const raw = Number.parseFloat(getComputedStyle(panel).getPropertyValue("--dsh-frame-overlay-top"));
  return Number.isFinite(raw) ? Math.max(SIDE_INSET, raw) : SIDE_INSET;
}
function guardPlacement(panel, anchor, placement) {
  if (!IS_GECKO) return () => {
  };
  let pinned = false;
  let topInset = SIDE_INSET;
  let insetResolved = false;
  return () => {
    if (!panel.isConnected || !anchor.isConnected) return;
    const rect = panel.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const viewport = {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight
    };
    const inside = rect.left >= -EPSILON && rect.top >= -EPSILON && rect.right <= viewport.width + EPSILON && rect.bottom <= viewport.height + EPSILON;
    if (!pinned && inside) return;
    if (!insetResolved) {
      insetResolved = true;
      topInset = readTopInset(panel);
    }
    const position = pinnedPosition(anchor.getBoundingClientRect(), rect, viewport, placement, topInset);
    pinned = true;
    panel.style.setProperty("position-anchor", "none");
    panel.style.setProperty("position-try-fallbacks", "none");
    panel.style.setProperty("right", "auto");
    panel.style.setProperty("bottom", "auto");
    panel.style.setProperty("left", `${Math.round(position.left)}px`);
    panel.style.setProperty("top", `${Math.round(position.top)}px`);
  };
}

// src/client/styles.ts
var CLASS = {
  action: "dsh-rewind-action",
  popover: "dsh-rewind-popover",
  popoverBelow: "dsh-rewind-popover-below",
  popoverTitle: "dsh-rewind-popover-title",
  popoverTarget: "dsh-rewind-popover-target",
  popoverOption: "dsh-rewind-popover-option",
  popoverOptionLabel: "dsh-rewind-popover-option-label",
  popoverOptionHint: "dsh-rewind-popover-option-hint",
  popoverImpact: "dsh-rewind-popover-impact",
  popoverNote: "dsh-rewind-popover-note",
  popoverActions: "dsh-rewind-popover-actions",
  popoverPrimary: "dsh-rewind-popover-primary",
  popoverGhost: "dsh-rewind-popover-ghost",
  guardHint: "dsh-rewind-guard-hint"
};
var STYLE = `
/* The official action chrome, value for value: the action is Copy's peer in the
   same 28px row, so a different box, glyph scale, or resting tier would read as
   a different kind of control. */
.dsh-rewind-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(28px + var(--dsh-content-font-delta, 0px));
  height: calc(28px + var(--dsh-content-font-delta, 0px));
  padding: 6px;
  border: none;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.dsh-rewind-action svg {
  width: calc(15px + var(--dsh-content-font-delta, 0px));
  height: calc(15px + var(--dsh-content-font-delta, 0px));
}
@media (hover: hover) {
  .dsh-rewind-action:hover {
    background: var(--dsw-alias-interactive-bg-hover);
    color: var(--dsw-alias-label-secondary);
  }
}

.dsh-rewind-popover {
  position: fixed;
  z-index: 1100;
  box-sizing: border-box;
  /* Keep the plugin's 300px panel width while using the official anchor
     sizing model; max-content lets long impact paths size up to that cap. */
  width: max-content;
  min-width: min(300px, calc(100vw - 24px));
  max-width: min(300px, calc(100vw - 24px));
  padding: 16px;
  border: 0;
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-3));
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  isolation: isolate;
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  /* Elevated surface: match the menu cards' l2 scrollbar tokens. */
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
  box-shadow: var(--dsw-elevation-prominent);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-primary);
  max-height: calc(100dvh - 12px - max(12px, var(--dsh-frame-overlay-top, 12px)));
  overflow-x: hidden;
  overflow-y: auto;
  position-area: none;
  top: max(12px, var(--dsh-frame-overlay-top, 12px));
  bottom: max(12px, calc(anchor(top) + 4px));
  left: max(12px, anchor(left));
  right: 12px;
  position-try-fallbacks: --dsh-rewind-window, --dsh-rewind-opposite, --dsh-rewind-wide-opposite, --dsh-rewind-tall, --dsh-rewind-viewport;
  align-self: end;
  justify-self: start;
  height: fit-content;
  min-height: 0;
  margin: 0;
}
/* Below-first mirror of the official fallback order: same-side wide, opposite
   anchored, opposite wide (the official window rule), tall, viewport. */
.dsh-rewind-popover.dsh-rewind-popover-below {
  top: max(12px, calc(anchor(bottom) + 4px));
  bottom: 12px;
  align-self: start;
  position-try-fallbacks: --dsh-rewind-below-window, --dsh-rewind-below-opposite, --dsh-rewind-window, --dsh-rewind-tall, --dsh-rewind-viewport;
}
@position-try --dsh-rewind-below-window {
  position-area: none;
  top: max(12px, calc(anchor(bottom) + 4px));
  bottom: 12px;
  left: 12px;
  right: 12px;
  margin: 0;
  align-self: start;
  justify-self: safe end;
}
@position-try --dsh-rewind-below-opposite {
  top: max(12px, var(--dsh-frame-overlay-top, 12px));
  bottom: max(12px, calc(anchor(top) + 4px));
  align-self: end;
}
@position-try --dsh-rewind-window {
  position-area: none;
  top: max(12px, var(--dsh-frame-overlay-top, 12px));
  bottom: max(12px, calc(anchor(top) + 4px));
  left: 12px;
  right: 12px;
  margin: 0;
  align-self: safe end;
  justify-self: safe end;
}
@position-try --dsh-rewind-opposite {
  top: max(12px, calc(anchor(bottom) + 4px));
  bottom: 12px;
  align-self: start;
}
@position-try --dsh-rewind-wide-opposite {
  top: max(12px, calc(anchor(bottom) + 4px));
  bottom: 12px;
  left: 12px;
  right: 12px;
  align-self: start;
  justify-self: safe end;
}
@position-try --dsh-rewind-tall {
  position-area: none;
  top: max(12px, var(--dsh-frame-overlay-top, 12px));
  bottom: 12px;
  left: max(12px, anchor(left));
  right: 12px;
  margin: 0;
  align-self: safe start;
  justify-self: start;
}
@position-try --dsh-rewind-viewport {
  position-area: none;
  inset: max(12px, var(--dsh-frame-overlay-top, 12px)) 12px 12px;
  margin: 0;
  align-self: safe start;
  justify-self: safe end;
}
.dsh-rewind-popover-title {
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
}
.dsh-rewind-popover-target {
  margin: 2px 0 10px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
  word-break: break-all;
  /* The full message sits above the popover; two lines are enough context. */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.dsh-rewind-popover-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  margin: 0 0 2px;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dsh-rewind-popover-option:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
/* Arrow navigation moves real focus, so the focused row carries the pointer's
   fill and the browser ring is suppressed: in dark mode the UA two-tone ring
   draws its dark half against the filled row and reads as a residue edge (the
   harness Menu suppresses it the same way). */
.dsh-rewind-popover-option:focus-visible:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  outline: none;
}
.dsh-rewind-popover-option:disabled {
  opacity: 0.4;
  cursor: default;
}
.dsh-rewind-popover-option-label {
  font-weight: 500;
}
.dsh-rewind-popover-option-hint {
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-rewind-popover-impact {
  margin: 4px 0 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover);
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
  white-space: pre-wrap;
  max-height: 160px;
  overflow: auto;
}
.dsh-rewind-popover-note {
  margin-top: 6px;
  font-size: 11px;
  line-height: 15px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-rewind-popover-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.dsh-rewind-popover-primary,
.dsh-rewind-popover-ghost {
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  font: inherit;
  cursor: pointer;
}
.dsh-rewind-popover-primary {
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.dsh-rewind-popover-primary:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover);
}
.dsh-rewind-popover-primary:disabled {
  opacity: 0.4;
  cursor: default;
}
.dsh-rewind-popover-ghost {
  background: transparent;
  color: var(--dsw-alias-label-secondary);
}
.dsh-rewind-popover-ghost:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-rewind-popover-ghost:active {
  background: var(--dsw-alias-interactive-bg-active);
}

.dsh-rewind-guard-hint {
  position: fixed;
  z-index: 1000;
  max-width: min(440px, calc(100vw - 24px));
  padding: 8px 12px;
  border: 0;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-3));
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  isolation: isolate;
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-panel);
  font-size: 13px;
  line-height: 18px;
  color: var(--dsw-alias-label-primary);
  pointer-events: none;
}

/* ---- Plugin configuration form ---- */
/* Only the card's own controls: the two switch rows, their hints, and the divider. */
.dsh-rewind-settings-divider {
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.dsh-rewind-settings-section {
  display: grid;
  gap: 6px;
  padding: 12px 0;
}
.dsh-rewind-settings-toggle-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary);
}
.dsh-rewind-settings-toggle-label {
  flex: 1;
  min-width: 0;
}
.dsh-rewind-settings-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}
`;

// src/client/popover.ts
var popoverEl = null;
var popoverAnchor = null;
var disposeOutside = null;
var liveSessionId = null;
var composerFocuser = null;
var anchorSequence = 0;
function registerComposerFocuser(focus) {
  composerFocuser = focus;
}
function markOpen(anchor) {
  popoverAnchor = anchor;
  anchor.setAttribute("aria-expanded", "true");
}
function markClosed() {
  popoverAnchor?.setAttribute("aria-expanded", "false");
  popoverAnchor = null;
}
function closePopover() {
  if (popoverEl !== null) {
    popoverEl.remove();
    popoverEl = null;
  }
  if (disposeOutside !== null) {
    disposeOutside();
    disposeOutside = null;
  }
  markClosed();
  const sessionId = liveSessionId;
  liveSessionId = null;
  if (sessionId !== null) {
    try {
      composerFocuser?.(sessionId);
    } catch {
    }
  }
}
function findCommand(chat, match) {
  if (chat === void 0) return void 0;
  let found;
  for (const node of chatNodesOf(chat)) {
    if (node.kind !== "command") continue;
    const command = node.data;
    if (!match(command)) continue;
    if (found === void 0 || command.seq >= found.seq) found = command;
  }
  return found;
}
function knownCommandSeqs(session, chatOf, match) {
  const known = /* @__PURE__ */ new Set();
  const chat = chatOf(session);
  if (chat === void 0) return known;
  for (const node of chatNodesOf(chat)) {
    if (node.kind !== "command") continue;
    const command = node.data;
    if (match(command)) known.add(command.seq);
  }
  return known;
}
function waitForCommand(session, chatOf, match, timeoutMs = 8e3, watch) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(value);
    };
    const check = () => {
      const node = findCommand(chatOf(session), match);
      if (node?.outcome !== null && node?.outcome !== void 0) {
        settle({ kind: node.outcome.kind, text: node.outcome.text });
      }
    };
    const unsubscribe = watch(check);
    const timer = setTimeout(() => settle(null), timeoutMs);
    check();
  });
}
var UNAVAILABLE = () => Promise.resolve({ kind: "error", text: "host query is unavailable" });
var previewCall = UNAVAILABLE;
function registerPreviewCall(call) {
  previewCall = call ?? UNAVAILABLE;
}
function previewImpact(sessionId, seq) {
  return previewCall(sessionId, seq);
}
function el(tag2, className, text) {
  const node = document.createElement(tag2);
  node.className = className;
  if (text !== void 0) node.textContent = text;
  return node;
}
function modeOption(label, hint, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = CLASS.popoverOption;
  const labelEl = el("span", CLASS.popoverOptionLabel, label);
  const hintEl = el("span", CLASS.popoverOptionHint, hint);
  button.append(labelEl, hintEl);
  button.addEventListener("click", onClick);
  return button;
}
function focusableButtons(root) {
  return Array.from(root.querySelectorAll("button")).filter((button) => !button.disabled && !button.classList.contains(CLASS.popoverGhost));
}
function focusFirst(root) {
  focusableButtons(root)[0]?.focus();
}
function moveFocus(root, dir) {
  const buttons = focusableButtons(root);
  if (buttons.length === 0) return;
  const active = document.activeElement;
  const index = active instanceof HTMLButtonElement ? buttons.indexOf(active) : -1;
  const next = index === -1 ? dir === 1 ? 0 : buttons.length - 1 : (index + dir + buttons.length) % buttons.length;
  buttons[next]?.focus();
}
function moveFocusByKey(root, event) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return false;
  event.preventDefault();
  event.stopPropagation();
  moveFocus(root, event.key === "ArrowDown" ? 1 : -1);
  return true;
}
function renderImpactStep(root, opts, back, recheck, cached) {
  const { session, seq, t } = opts;
  const impact = el("div", CLASS.popoverImpact, t("popover.impact.loading"));
  const actions = el("div", CLASS.popoverActions);
  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = CLASS.popoverGhost;
  backButton.textContent = t("popover.back");
  backButton.addEventListener("click", back);
  actions.append(backButton);
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = CLASS.popoverPrimary;
  confirm.textContent = t("popover.confirm");
  confirm.disabled = true;
  actions.append(confirm);
  root.replaceChildren(impact, actions);
  focusFirst(root);
  recheck();
  void (async () => {
    const outcome = cached ?? await previewImpact(session.sessionId, seq);
    if (outcome === null) {
      impact.textContent = t("popover.impact.failed", { message: "preview request timed out" });
      return;
    }
    if (outcome.kind === "error") {
      impact.textContent = t("popover.impact.failed", { message: outcome.text });
      return;
    }
    const restores = outcome.files.filter((file) => file.action === "restore").map((file) => file.path);
    const deletes = outcome.files.filter((file) => file.action === "delete").map((file) => file.path);
    if (restores.length === 0 && deletes.length === 0) {
      impact.textContent = t("popover.impact.none");
    } else {
      const lines = [
        ...restores.map((path) => t("popover.impact.restore", { path })),
        ...deletes.map((path) => t("popover.impact.delete", { path }))
      ];
      if (outcome.backupOff) {
        const list = document.createElement("div");
        list.textContent = lines.join("\n");
        impact.replaceChildren(list, el("div", CLASS.popoverNote, t("popover.backupDisabled")));
      } else {
        impact.textContent = lines.join("\n");
      }
    }
    confirm.disabled = false;
    confirm.focus();
    confirm.addEventListener("click", () => {
      closePopover();
      opts.onRewind("both");
    });
  })().catch(() => {
    impact.textContent = t("popover.impact.failed", { message: "unexpected error" });
  }).finally(() => {
    recheck();
  });
}
function mountShell(root, anchor, onKeyDown, placement = "above") {
  if (placement === "below") root.classList.add(CLASS.popoverBelow);
  const anchorName = `--dsh-rewind-popover-${++anchorSequence}`;
  const previousAnchorName = anchor.style.getPropertyValue("anchor-name");
  const previousPriority = anchor.style.getPropertyPriority("anchor-name");
  const previousList = previousAnchorName.trim();
  const ownAnchorName = previousList === "" || previousList === "none" ? anchorName : `${previousList} ${anchorName}`;
  anchor.style.setProperty("anchor-name", ownAnchorName);
  root.style.setProperty("position-anchor", anchorName);
  const recheckPlacement = guardPlacement(root, anchor, placement);
  const recheck = () => {
    if (!root.isConnected) return;
    if (!anchor.isConnected && popoverEl === root) closePopover();
    recheckPlacement();
  };
  const onPointerDown = (event) => {
    const target = event.target;
    if (root.contains(target) || anchor.contains(target)) return;
    closePopover();
  };
  const deferred = setTimeout(() => {
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
  }, 0);
  document.body.append(root);
  recheck();
  const dispose = () => {
    clearTimeout(deferred);
    document.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("keydown", onKeyDown, true);
    if (anchor.style.getPropertyValue("anchor-name") === ownAnchorName) {
      anchor.style.setProperty("anchor-name", previousAnchorName, previousPriority);
    }
  };
  return { recheck, dispose };
}
function openRetractPopover(opts) {
  const { preview, anchor, t, retract, onRetract } = opts;
  if (retract === void 0 || onRetract === void 0) return;
  markOpen(anchor);
  const root = el("div", CLASS.popover);
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", t("popover.retract.title"));
  const onKeyDown = (event) => {
    if (moveFocusByKey(root, event)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closePopover();
    }
  };
  const previewText = preview.length > 0 ? preview : t("popover.noText");
  const actions = el("div", CLASS.popoverActions);
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = CLASS.popoverPrimary;
  confirm.textContent = t("popover.confirm");
  confirm.addEventListener("click", () => {
    closePopover();
    onRetract();
  });
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = CLASS.popoverGhost;
  cancel.textContent = t("popover.cancel");
  cancel.addEventListener("click", closePopover);
  actions.append(confirm, cancel);
  root.replaceChildren(
    el("div", CLASS.popoverTitle, t("popover.retract.title")),
    el("div", CLASS.popoverTarget, t("popover.retract.target", { preview: previewText })),
    el("div", CLASS.popoverImpact, t("popover.retract.hint")),
    actions
  );
  const shell = mountShell(root, anchor, onKeyDown, opts.placement ?? "above");
  popoverEl = root;
  disposeOutside = shell.dispose;
  focusFirst(root);
}
function openPopover(opts) {
  closePopover();
  liveSessionId = opts.session.sessionId;
  if (opts.retract !== void 0) {
    openRetractPopover(opts);
    return;
  }
  const { session, seq, time, preview, anchor, t } = opts;
  const onRewind = opts.onRewind;
  if (seq === void 0 || time === void 0 || onRewind === void 0) return;
  markOpen(anchor);
  const durableOpts = { session, seq, time, preview, anchor, t, onRewind };
  const root = el("div", CLASS.popover);
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", t("popover.title"));
  let bothState = { state: "loading" };
  let impactOutcome = null;
  let step = "modes";
  let recheck = () => {
  };
  const renderModes = () => {
    step = "modes";
    const previewText = preview.length > 0 ? preview : t("popover.noText");
    const children = [
      el("div", CLASS.popoverTitle, t("popover.title")),
      el("div", CLASS.popoverTarget, previewText),
      modeOption(t("popover.chat"), t("popover.chat.hint"), () => {
        closePopover();
        durableOpts.onRewind("chat");
      })
    ];
    if (bothState.state === "noChanges") {
      children.push(el("div", CLASS.popoverImpact, t("popover.noChanges")));
    } else if (bothState.state === "error") {
      children.push(el("div", CLASS.popoverImpact, t("popover.impact.failed", { message: bothState.message })));
    } else {
      const option = modeOption(
        t("popover.both"),
        bothState.state === "loading" ? t("popover.checking") : t("popover.both.hint"),
        renderImpact
      );
      if (bothState.state === "loading") option.disabled = true;
      children.push(option);
    }
    root.replaceChildren(...children);
    focusFirst(root);
    recheck();
  };
  const renderImpact = () => {
    step = "impact";
    renderImpactStep(root, durableOpts, renderModes, recheck, impactOutcome);
  };
  const onKeyDown = (event) => {
    if (moveFocusByKey(root, event)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (step === "impact") renderModes();
      else closePopover();
    }
  };
  renderModes();
  const shell = mountShell(root, anchor, onKeyDown, opts.placement ?? "above");
  recheck = shell.recheck;
  popoverEl = root;
  disposeOutside = shell.dispose;
  void (async () => {
    const outcome = await previewImpact(session.sessionId, seq);
    impactOutcome = outcome;
    if (outcome !== null && outcome.kind === "success") {
      bothState = { state: outcome.files.length > 0 ? "hasChanges" : "noChanges" };
    } else {
      bothState = { state: "error", message: outcome?.kind === "error" ? outcome.text : "preview request timed out" };
    }
    renderModes();
  })().catch(() => {
    bothState = { state: "error", message: "unexpected error" };
    renderModes();
  });
}

// src/client/log.ts
var NS = "dsh-rewind";
var DEBUG_KEY = "dsh-rewind.debug";
var ALWAYS_ON = /* @__PURE__ */ new Set(["error", "warn"]);
function switchValue() {
  try {
    return window.localStorage.getItem(DEBUG_KEY) ?? "";
  } catch {
    return "";
  }
}
function matches(value, ns) {
  for (const entry of value.split(",")) {
    const part = entry.trim();
    if (part === "") continue;
    if (part === "*" || part === `${NS}*`) return true;
    if (part.endsWith("*")) {
      if (ns.startsWith(part.slice(0, -1))) return true;
    } else if (ns === part) {
      return true;
    }
  }
  return false;
}
function tag(scope) {
  return `[${NS}:${scope}]`;
}
function log(level, scope, message, data) {
  if (ALWAYS_ON.has(level)) {
    console[level](tag(scope), message, data);
    return;
  }
  if (!matches(switchValue(), `${NS}:${scope}`)) return;
  console.info(tag(scope), message, data);
}
var rewindLog = {
  error: (scope, message, data) => log("error", scope, message, data),
  warn: (scope, message, data) => log("warn", scope, message, data),
  info: (scope, message, data) => log("info", scope, message, data),
  debug: (scope, message, data) => log("debug", scope, message, data)
};

// src/client/visibility.ts
var patches = /* @__PURE__ */ new Map();
var currentCleanup;
function installChatViewVisibility(ctx) {
  let stopped = false;
  const start = () => {
    const scope = ctx.inject?.(["uiConversation"], (child) => {
      if (!stopped) installOn(child.get("uiConversation"), ctx.sessions);
    });
    if (ctx.inject === void 0) {
      installOn(ctx.get("uiConversation"), ctx.sessions);
    }
    return () => {
      stopped = true;
      currentCleanup?.();
      currentCleanup = void 0;
      if (typeof scope === "function") scope();
    };
  };
  if (ctx.effect === void 0) {
    start();
    return;
  }
  ctx.effect(start, "dsh-rewind chat visibility");
}
function installOn(ui, sessions) {
  currentCleanup?.();
  currentCleanup = void 0;
  if (ui?.views === void 0) return;
  const views = ui.views;
  const ensure = () => {
    try {
      const definition = views.entries().find((candidate) => candidate.target === "chat");
      if (definition === void 0 || typeof definition.create !== "function") return;
      const current = patches.get(definition);
      const create = definition.create;
      if (current !== void 0 && create === current.wrapper) return;
      const wrapper = function wrappedChatBuilder() {
        return new RewindVisibilityBuilder(create.call(definition));
      };
      const mutable = definition;
      mutable.create = wrapper;
      patches.set(definition, { original: create, wrapper });
      rewindLog.info("visibility", "installed Chat snapshot visibility wrapper");
      rebuildOpenSessions(ui, sessions);
    } catch (error) {
      rewindLog.error("visibility", "Chat visibility install probe failed", error);
    }
  };
  let unsubscribe;
  try {
    unsubscribe = views.subscribe?.(ensure);
  } catch (error) {
    rewindLog.warn("visibility", "Chat view subscription failed", error);
  }
  ensure();
  currentCleanup = () => {
    unsubscribe?.();
    restorePatches();
    rebuildOpenSessions(ui, sessions);
  };
}
function restorePatches() {
  for (const [definition, record] of patches) {
    const mutable = definition;
    if (mutable.create === record.wrapper) mutable.create = record.original;
  }
  patches = /* @__PURE__ */ new Map();
}
function rebuildOpenSessions(ui, sessions) {
  const state = sessions?.list?.getSnapshot();
  if (state === void 0) return;
  const ids = /* @__PURE__ */ new Set([...state.ids ?? [], ...Object.keys(state.byId ?? {})]);
  for (const id of ids) {
    const row = state.byId?.[id];
    const retained = row?.retainedBy;
    if (retained === void 0 || !Object.values(retained).some((count) => (count ?? 0) > 0)) continue;
    try {
      ui.binding?.(id)?.rebuild?.();
    } catch (error) {
      rewindLog.warn("visibility", `chat rebuild failed for ${id}`, error);
    }
  }
}
var RewindVisibilityBuilder = class {
  /** @param inner - the real Chat builder. */
  constructor(inner) {
    __publicField(this, "inner", inner);
    __publicField(this, "originals", /* @__PURE__ */ new Map());
    __publicField(this, "commands", /* @__PURE__ */ new Map());
    __publicField(this, "byTurn", /* @__PURE__ */ new Map());
    __publicField(this, "turnProcess", /* @__PURE__ */ new Map());
    __publicField(this, "derived", /* @__PURE__ */ new Map());
    __publicField(this, "cuts", []);
    __publicField(this, "cutSignature", "[]");
    __publicField(this, "lastSignature", "[]");
  }
  get empty() {
    return this.inner.empty;
  }
  replace(input) {
    this.setAll(input.nodes);
    this.lastSignature = this.cutSignature;
    return this.inner.replace({ nodes: this.deriveAll(), timeline: input.timeline, ...changed(input) });
  }
  apply(input) {
    const affected = /* @__PURE__ */ new Set();
    let commandsChanged = false;
    for (const node of input.upserts) {
      const previous = this.originals.get(node.key);
      const previousTurn = previous === void 0 ? void 0 : turnOf(previous);
      const nextTurn = turnOf(node);
      if (previousTurn !== void 0) affected.add(previousTurn);
      if (nextTurn !== void 0) affected.add(nextTurn);
      if (previous?.kind === "command" || node.kind === "command") commandsChanged = true;
      this.setOriginal(node);
    }
    if (commandsChanged) this.refreshCuts();
    if (this.cutSignature !== this.lastSignature) {
      this.lastSignature = this.cutSignature;
      return this.inner.replace({ nodes: this.deriveAll(), timeline: input.timeline, ...changed(input) });
    }
    const cuts = this.cuts;
    const upserts = /* @__PURE__ */ new Map();
    for (const node of input.upserts) upserts.set(node.key, this.deriveOne(node, cuts));
    for (const turn of affected) {
      const processKey = this.turnProcess.get(turn);
      const base = processKey === void 0 ? void 0 : this.originals.get(processKey);
      if (base === void 0) continue;
      const next = this.deriveTurnProcess(base, cuts, turn, this.deriveOne(base, cuts));
      if (this.derived.get(processKey) !== next) upserts.set(processKey, next);
    }
    const list = [...upserts.values()];
    for (const node of list) this.derived.set(node.key, node);
    return this.inner.apply({ upserts: list, timeline: input.timeline, ...changed(input) });
  }
  groupInput() {
    return this.inner.groupInput?.();
  }
  publish() {
    this.inner.publish?.();
  }
  setAll(nodes) {
    this.originals.clear();
    this.commands.clear();
    this.byTurn.clear();
    this.turnProcess.clear();
    this.derived.clear();
    for (const node of nodes) this.setOriginal(node);
    this.refreshCuts();
  }
  setOriginal(node) {
    const previous = this.originals.get(node.key);
    if (previous !== void 0) this.unindex(previous);
    this.originals.set(node.key, node);
    if (node.kind === "command") this.commands.set(node.key, node);
    const turn = turnOf(node);
    if (turn === void 0) return;
    const members = this.byTurn.get(turn) ?? /* @__PURE__ */ new Map();
    members.set(node.key, node);
    this.byTurn.set(turn, members);
    if (node.kind === "turn-process") this.turnProcess.set(turn, node.key);
  }
  unindex(node) {
    if (node.kind === "command") this.commands.delete(node.key);
    const turn = turnOf(node);
    if (turn === void 0) return;
    const members = this.byTurn.get(turn);
    if (members === void 0) return;
    members.delete(node.key);
    if (members.size === 0) this.byTurn.delete(turn);
    if (node.kind === "turn-process" && this.turnProcess.get(turn) === node.key) {
      this.turnProcess.delete(turn);
      for (const member of members.values()) {
        if (member.kind === "turn-process") {
          this.turnProcess.set(turn, member.key);
          break;
        }
      }
    }
  }
  refreshCuts() {
    this.cuts = rewindCutsOf(this.commands.values());
    this.cutSignature = JSON.stringify(
      this.cuts.map((cut) => `${cut.target}:${cut.marker}`).sort()
    );
  }
  deriveAll() {
    const cuts = this.cuts;
    const derived = /* @__PURE__ */ new Map();
    for (const node of this.originals.values()) derived.set(node.key, this.deriveOne(node, cuts));
    for (const [turn, key] of this.turnProcess) {
      const base = this.originals.get(key);
      if (base === void 0) continue;
      const current = derived.get(key) ?? this.deriveOne(base, cuts);
      derived.set(key, this.deriveTurnProcess(base, cuts, turn, current));
    }
    const result = [...derived.values()];
    this.derived = derived;
    return result;
  }
  deriveOne(node, cuts) {
    const base = this.originals.get(node.key) ?? node;
    if (base.kind === "command") {
      const command = base.data;
      if (command.name !== void 0 && command.name !== null && ENGINE_COMMANDS.has(command.name)) {
        const args = command.args ?? "";
        const probe = args.includes("preview") || args.includes("__candidates");
        const executed = command.outcome?.kind === "success" && command.outcome.sourceEventSeq !== void 0;
        if (probe || executed) return hidden(base);
      }
      return base;
    }
    const contained = cuts.some((cut) => cut.target <= base.anchorSeq && base.anchorSeq <= cut.marker);
    return contained ? hidden(base) : base;
  }
  deriveTurnProcess(base, cuts, turn = turnOf(base), current = this.deriveOne(base, cuts)) {
    if (turn === void 0 || current.visibility === "hidden") return current;
    const members = this.byTurn.get(turn);
    if (members === void 0) return current;
    let count = 0;
    let allHidden = true;
    for (const member of members.values()) {
      if (member.key === base.key) continue;
      count += 1;
      if (this.deriveOne(member, cuts).visibility !== "hidden") {
        allHidden = false;
        break;
      }
    }
    if (count === 0) return current;
    return allHidden ? hidden(base) : current;
  }
};
function hidden(node) {
  return node.visibility === "hidden" ? node : { ...node, visibility: "hidden" };
}
function turnOf(node) {
  const turn = node.location?.turn?.turn;
  return typeof turn === "number" ? turn : void 0;
}
function changed(input) {
  return input.changedTurns === void 0 ? {} : { changedTurns: input.changedTurns };
}

// src/client/mount.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var CHAT_NODE_SLOT = "conversation.chat.node";
var ROW_KEYS = /* @__PURE__ */ new Set(["user", "steering"]);
var SHIPPED_ROW_PRIORITY = 0;
var NO_SLOT_CHAIN = () => null;
var TICK_KEY = "dsh-rewind:mount";
function rendererOf(component) {
  if (typeof component === "function") return component;
  if (component === null || typeof component !== "object") return void 0;
  const type = component.type;
  return typeof type === "function" ? type : void 0;
}
function targetOf(props) {
  // dsh-manager: this DSH renders a chat row without a `sessionId`, so the row
  // takeover below returned early and the upstream button never appeared. The
  // manager publishes the session it is showing (and its own switch) on
  // `globalThis.__dshManagerRewind`; without that bridge the original guard
  // still applies.
  const bridge = typeof globalThis === "undefined" ? void 0 : globalThis.__dshManagerRewind;
  if (bridge !== void 0 && typeof bridge.enabled === "function" && bridge.enabled() !== true) return void 0;
  const declared = props["sessionId"];
  const sessionId = typeof declared === "string" && declared !== ""
    ? declared
    : bridge !== void 0 && typeof bridge.session === "function" ? bridge.session() : declared;
  const data = props["node"]?.data;
  if (typeof sessionId !== "string" || typeof data?.seq !== "number" || typeof data.time !== "number") return void 0;
  // dsh-manager: one report per rendered action, so the panel can say whether
  // the button reached the action row (the manager dedupes it).
  if (bridge !== void 0 && typeof bridge.report === "function") bridge.report();
  return { sessionId, seq: data.seq, time: data.time };
}
function rowWithAction(official, render) {
  return function RowWithAction(props) {
    const row = official(typeof props["renderSlotChain"] === "function" ? props : { ...props, renderSlotChain: NO_SLOT_CHAIN });
    const target = targetOf(props);
    if (target === void 0 || !(0, import_react.isValidElement)(row)) return row;
    const actions = row.props.actions;
    if (typeof actions !== "function") return row;
    const buildActions = actions;
    const withAction = (text) => {
      const actionsRow = buildActions(text);
      if (!(0, import_react.isValidElement)(actionsRow)) return actionsRow;
      try {
        const element = render({ ...target, text });
        if (element === null || element === void 0) return actionsRow;
        const existing = actionsRow.props.extraActions;
        return (0, import_react.cloneElement)(actionsRow, {
          extraActions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.Fragment, { children: [
            existing,
            element
          ] })
        });
      } catch {
        return actionsRow;
      }
    };
    return (0, import_react.cloneElement)(row, { actions: withAction });
  };
}
function installRowAction({ slots, render }) {
  if (typeof slots.entries !== "function") return () => {
  };
  const readEntries = (key) => slots.entries(key);
  const taken = /* @__PURE__ */ new Map();
  const takeOver = (entry) => {
    if (taken.has(entry)) return false;
    const official = rendererOf(entry.component);
    if (official === void 0) return false;
    const replacement = rowWithAction(official, render);
    // dsh-manager: tagged so the manager can verify the takeover stuck
    // instead of guessing from the panel.
    replacement.__dshManagerRewindRow = true;
    taken.set(entry, { original: entry.component, replacement });
    entry.component = replacement;
    return true;
  };
  const tick = () => {
    if (typeof slots.register !== "function") return;
    try {
      slots.register({ name: CHAT_NODE_SLOT, key: TICK_KEY }, () => null)();
    } catch {
    }
  };
  const sync = () => {
    let changed2 = false;
    for (const entry of readEntries(CHAT_NODE_SLOT)) {
      const key = entry.options.key;
      if (key === void 0 || !ROW_KEYS.has(key)) continue;
      if ((entry.options.priority ?? SHIPPED_ROW_PRIORITY) !== SHIPPED_ROW_PRIORITY) continue;
      changed2 = takeOver(entry) || changed2;
    }
    if (changed2) tick();
  };
  sync();
  const unsubscribe = slots.subscribe?.(CHAT_NODE_SLOT, sync);
  return () => {
    unsubscribe?.();
    for (const [entry, record] of taken) {
      if (entry.component === record.replacement) entry.component = record.original;
    }
    taken.clear();
  };
}

// src/client/action.tsx
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime2 = require("react/jsx-runtime");
var ICON = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { width: "15", height: "15", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: [
  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M6.5 2.5 2.5 6.5l4 4", stroke: "currentColor", strokeWidth: "1.25", strokeLinecap: "round", strokeLinejoin: "round" }),
  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M2.5 6.5h7a4 4 0 0 1 4 4v1.5", stroke: "currentColor", strokeWidth: "1.25", strokeLinecap: "round" })
] });
function RewindActionButton({ t, titleKey, ariaKey, pending = false, onOpen }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.Tooltip, { label: t(titleKey), side: "bottom", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "button",
    {
      type: "button",
      className: CLASS.action,
      "aria-label": t(ariaKey),
      "aria-haspopup": "dialog",
      "data-pending-retract": pending || void 0,
      onClick: (event) => {
        event.stopPropagation();
        onOpen(event.currentTarget);
      },
      children: ICON
    }
  ) });
}
function rewindActionRenderer(t, eligible, open) {
  return (row) => eligible(row.sessionId) ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    RewindActionButton,
    {
      t,
      titleKey: "button.title",
      ariaKey: "button.aria",
      onOpen: (anchor) => open(row, anchor)
    }
  ) : null;
}

// src/client/pending-mount.tsx
var import_react2 = require("react");
var import_react_dom = require("react-dom");

// src/client/pending.ts
var INBOX_PROJECTION = "inbox";
function inboxOf(session) {
  try {
    return session.projections.faceOf(INBOX_PROJECTION).getSnapshot();
  } catch {
    return void 0;
  }
}
function textOf(content) {
  const texts = content.filter((block) => block.type === "text");
  if (texts.length === 0) return null;
  return texts.map((block) => block.text ?? "").join("");
}
function attachmentsCountOf(content) {
  return content.filter((block) => block.type !== "text").length;
}
function steeringItemsOf(nextStep) {
  return (nextStep ?? []).filter((item) => item.source?.kind === "user").map((item) => {
    const text = textOf(item.content);
    return {
      id: item.id,
      text,
      attachments: attachmentsCountOf(item.content),
      images: imageRefsOf(item.content)
    };
  });
}
function matchPendingRows(rows, steering) {
  return rows.map((row, index) => {
    const item = steering[index];
    return item !== void 0 && matches2(item, row) ? item.id : null;
  });
}
function matches2(item, row) {
  return item.attachments > 0 ? row.attachments === item.attachments : row.text === (item.text ?? "");
}
function retractSpan(steering, targetId) {
  const index = steering.findIndex((item) => item.id === targetId);
  if (index === -1) return [];
  return steering.slice(index).map((item) => item.id);
}

// src/client/rewind-flow.ts
var COMPOSER_EDITABLE_SELECTOR = "[data-composer-input]";
function fillComposerEditable(text) {
  const editable = document.querySelector(COMPOSER_EDITABLE_SELECTOR);
  if (editable === null) return false;
  editable.focus();
  const selection = document.getSelection();
  if (selection !== null) {
    const range = document.createRange();
    range.selectNodeContents(editable);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  let ok = false;
  try {
    ok = document.execCommand("insertText", false, text);
  } catch {
    ok = false;
  }
  if (ok) return true;
  editable.textContent = text;
  editable.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}
function fillComposer(text) {
  return fillComposerEditable(text);
}
function writeComposer(text, facade) {
  if (facade !== void 0) {
    try {
      facade.setDraft(text);
      try {
        facade.focus?.();
      } catch {
      }
      return true;
    } catch {
    }
  }
  return fillComposer(text);
}
async function runRewindAndFill(session, seq, mode, isMainViewSession, chatOf, watchChat, setComposerText, restoreImages) {
  const known = knownCommandSeqs(session, chatOf, (node) => isExecutedRewindCommand(node, seq));
  let result;
  try {
    result = await session.command(`/${ENGINE_COMMAND} @${seq} ${mode}`);
  } catch (error) {
    rewindLog.warn("refill", `rewind command threw, skipping refill @${seq}`, error);
    return;
  }
  if (!result.ok) {
    rewindLog.warn("refill", `rewind command rejected for @${seq}`, result.error);
    return;
  }
  if (result.value?.matched !== true) {
    rewindLog.warn("refill", `rewind command was not matched for @${seq}`);
    return;
  }
  let outcome;
  try {
    outcome = await waitForCommand(session, chatOf, (node) => isExecutedRewindCommand(node, seq) && !known.has(node.seq), 2e4, (cb) => watchChat(session.sessionId, cb));
  } catch (error) {
    rewindLog.warn("refill", `waiting for rewind @${seq} outcome threw`, error);
    return;
  }
  if (outcome === null) {
    rewindLog.warn("refill", `rewind @${seq} never settled within timeout, no refill`);
    return;
  }
  if (outcome.kind !== "success") {
    showHint(outcome.text ?? "rewind failed");
    return;
  }
  if (!isMainViewSession(session.sessionId)) {
    return;
  }
  let text;
  let images;
  try {
    const chat = chatOf(session);
    text = messageTextAt(chat, seq);
    images = messageAttachmentsAt(chat, seq);
  } catch (error) {
    rewindLog.warn("refill", `reading target content for @${seq} threw`, error);
    return;
  }
  if (restoreImages !== void 0 && images !== void 0 && images.length > 0) {
    try {
      await restoreImages(session.sessionId, images);
    } catch (error) {
      rewindLog.warn("refill", `image restore for @${seq} threw`, error);
    }
  }
  if (text === void 0 || text === "") {
    return;
  }
  if (composerText().trim() !== "") {
    return;
  }
  try {
    setComposerText(session.sessionId, text);
  } catch (error) {
    rewindLog.warn("refill", `composer refill @${seq} threw`, error);
    return;
  }
}
function composerSurface() {
  return document.querySelector(COMPOSER_EDITABLE_SELECTOR);
}
function showHint(text) {
  const surface = composerSurface();
  const hint = document.createElement("div");
  hint.className = CLASS.guardHint;
  hint.setAttribute("role", "status");
  hint.textContent = text;
  document.body.appendChild(hint);
  if (surface !== null) {
    const card = surface.closest("[data-composer-card]");
    const rect = card instanceof HTMLElement ? card.getBoundingClientRect() : surface.getBoundingClientRect();
    hint.style.left = `${Math.round(rect.left)}px`;
    hint.style.bottom = `${Math.round(window.innerHeight - rect.top + 8)}px`;
  }
  window.setTimeout(() => hint.remove(), 3200);
}
function composerText() {
  const surface = composerSurface();
  if (surface === null) return "";
  return surface.textContent ?? "";
}
function isRewindInertSession(snapshot) {
  return snapshot.subagent !== null && snapshot.subagent !== void 0;
}

// src/client/retract.ts
async function retractPending(session, itemId, text, setComposerText, restoreImages) {
  const steering = steeringItemsOf(inboxOf(session)?.["next-step"]);
  const images = steering.find((item) => item.id === itemId)?.images ?? [];
  let removedTarget = false;
  for (const id of retractSpan(steering, itemId)) {
    let accepted = false;
    try {
      const result = await session.updateQueue(id, { kind: "remove" });
      accepted = result.ok;
      if (!result.ok) rewindLog.info("retract", `pending retract lost the race for ${id}`, result.error);
    } catch (error) {
      rewindLog.warn("retract", `pending retract remove threw for ${id}`, error);
    }
    if (!accepted) break;
    if (id === itemId) removedTarget = true;
  }
  if (!removedTarget) return;
  if (images.length > 0 && restoreImages !== void 0) {
    try {
      await restoreImages(session.sessionId, images);
    } catch (error) {
      rewindLog.warn("retract", `image restore for ${itemId} threw`, error);
    }
  }
  if (text !== null && text !== "" && composerText().trim() === "") {
    setComposerText(session.sessionId, text);
  }
}

// src/client/pending-mount.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var PENDING_SEAT_SELECTOR = "[data-pending-steering]";
var MESSAGE_ATTACHMENT_SELECTOR = "[data-message-attachments]";
var SESSION_CONTENT_SELECTOR = "[data-conversation-session]";
var NO_TARGETS = [];
function bubbleTextOf(row) {
  const clone = row.cloneNode(true);
  clone.lastElementChild?.remove();
  const attachments = row.querySelectorAll(MESSAGE_ATTACHMENT_SELECTOR).length;
  for (const block of clone.querySelectorAll(MESSAGE_ATTACHMENT_SELECTOR)) block.remove();
  return { text: clone.textContent ?? "", attachments };
}
function actionsContainerOf(row) {
  const buttons = [...row.querySelectorAll("button")].filter((button) => button.dataset["pendingRetract"] === void 0);
  const structural = buttons.at(-1)?.parentElement;
  return structural instanceof HTMLElement && structural.querySelector("button") !== null ? structural : void 0;
}
function collectTargets(roots, steering) {
  const targets = [];
  for (const root of roots) {
    const rows = [...root.querySelectorAll(PENDING_SEAT_SELECTOR)];
    const matched = matchPendingRows(rows.map(bubbleTextOf), steering);
    for (const [index, row] of rows.entries()) {
      const itemId = matched[index];
      const item = steering[index];
      const container = actionsContainerOf(row);
      if (itemId === null || itemId === void 0 || item === void 0 || container === void 0) continue;
      targets.push({ container, itemId, text: item.text });
    }
  }
  return targets;
}
function sameTargets(left, right) {
  return left.length === right.length && left.every((target, index) => {
    const other = right[index];
    return other !== void 0 && target.container === other.container && target.itemId === other.itemId;
  });
}
function contentRootsOf(sessionId) {
  return [...document.querySelectorAll(SESSION_CONTENT_SELECTOR)].filter((element) => element.dataset["conversationSession"] === sessionId);
}
function involvesPending(record) {
  const target = record.target;
  if (target instanceof Element && target.closest(PENDING_SEAT_SELECTOR) !== null) return true;
  for (const node of [...record.addedNodes, ...record.removedNodes]) {
    if (node instanceof Element && (node.matches(PENDING_SEAT_SELECTOR) || node.querySelector(PENDING_SEAT_SELECTOR) !== null)) {
      return true;
    }
  }
  return false;
}
function resolveSession(deps, sessionId) {
  try {
    return deps.sessionOf(sessionId);
  } catch {
    return void 0;
  }
}
function inboxFaceOf(session) {
  try {
    return session.projections.faceOf("inbox");
  } catch {
    return void 0;
  }
}
function RetractButton({ target, sessionId, deps }) {
  const onOpen = (anchor) => {
    const session = resolveSession(deps, sessionId);
    if (session === void 0) {
      rewindLog.warn("retract", "pending retract clicked with no session binding");
      return;
    }
    openPopover({
      session,
      preview: target.text ?? "",
      anchor,
      placement: "below",
      t: deps.t,
      retract: { itemId: target.itemId, text: target.text },
      onRetract: () => {
        void retractPending(session, target.itemId, target.text, deps.setComposerText, deps.restoreImages);
      }
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    RewindActionButton,
    {
      t: deps.t,
      titleKey: "button.title",
      ariaKey: "button.retract.aria",
      pending: true,
      onOpen
    }
  );
}
function PendingRetractLayer({ sessionId, deps }) {
  const [targets, setTargets] = (0, import_react2.useState)(NO_TARGETS);
  const [, forceRender] = (0, import_react2.useReducer)((count) => count + 1, 0);
  (0, import_react2.useLayoutEffect)(() => deps.subscribeLocale(() => {
    forceRender();
  }), [deps]);
  (0, import_react2.useLayoutEffect)(() => {
    let stopped = false;
    let queued = false;
    let observer = null;
    let observed = [];
    const stopObserver = () => {
      observer?.disconnect();
      observer = null;
      observed = [];
    };
    const observe = (roots) => {
      if (observer !== null && observed.length === roots.length && observed.every((root, index) => root === roots[index])) return;
      stopObserver();
      observed = roots;
      observer = new MutationObserver((records) => {
        if (stopped) return;
        if (observed.some((root) => !root.isConnected)) {
          refresh();
          return;
        }
        if (records.some(involvesPending)) schedule();
      });
      for (const root of observed) observer.observe(root, { childList: true, subtree: true });
    };
    const refresh = () => {
      if (stopped) return;
      const session2 = resolveSession(deps, sessionId);
      const steering = session2 === void 0 ? [] : steeringItemsOf(inboxOf(session2)?.["next-step"]);
      if (session2 === void 0 || steering.length === 0 || isRewindInertSession(session2.getSnapshot())) {
        setTargets(NO_TARGETS);
        stopObserver();
        return;
      }
      const roots = contentRootsOf(sessionId);
      if (roots.length === 0) {
        setTargets(NO_TARGETS);
        stopObserver();
        return;
      }
      observe(roots);
      const next = collectTargets(roots, steering);
      setTargets((current) => sameTargets(current, next) ? current : next);
    };
    const schedule = () => {
      if (queued || stopped) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        refresh();
      });
    };
    refresh();
    const session = resolveSession(deps, sessionId);
    const unsubscribe = session === void 0 ? void 0 : inboxFaceOf(session)?.subscribe?.(schedule);
    return () => {
      stopped = true;
      unsubscribe?.();
      stopObserver();
    };
  }, [sessionId, deps]);
  return targets.map((target) => (0, import_react_dom.createPortal)(
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(RetractButton, { target, sessionId, deps }, target.itemId),
    target.container,
    target.itemId
  ));
}
function createPendingBridge(deps) {
  return function PendingBridge({ sessionId }) {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(PendingRetractLayer, { sessionId, deps });
  };
}

// src/client/host-api.ts
var TIMEOUT_MS = 8e3;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isResult(value) {
  if (!isRecord(value)) return false;
  if (value["ok"] === true) return true;
  if (value["ok"] !== false || !isRecord(value["error"])) return false;
  const error = value["error"];
  return typeof error["code"] === "string" && typeof error["message"] === "string" && isRecord(error["details"]);
}
function isImpact(value) {
  return isRecord(value) && typeof value["path"] === "string" && (value["action"] === "restore" || value["action"] === "delete");
}
function isCandidate(value) {
  return isRecord(value) && Number.isSafeInteger(value["seq"]) && typeof value["time"] === "number" && Number.isFinite(value["time"]) && typeof value["preview"] === "string";
}
function isAbort(error) {
  const name2 = error?.name;
  return name2 === "AbortError" || name2 === "TimeoutError";
}
function init(payload, signal) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal
  };
}
async function settleQuery(response, route) {
  if (!response.ok) throw new Error(`transport failure for ${route}: HTTP ${response.status}`);
  const result = await response.json();
  if (!isResult(result)) throw new Error(`invalid response for ${route}`);
  return result;
}
async function previewOverApi(sessionId, seq) {
  try {
    const response = await fetch("./api/dsh-rewind/preview", init({ sessionId, seq }, AbortSignal.timeout(TIMEOUT_MS)));
    const result = await settleQuery(response, "preview");
    if (!result.ok) {
      rewindLog.warn("preview", `preview request failed for @${seq}`, result.error);
      return { kind: "error", text: result.error.message };
    }
    const value = result.value;
    if (!isRecord(value) || typeof value["backupOff"] !== "boolean" || !Array.isArray(value["files"]) || !value["files"].every(isImpact)) {
      rewindLog.warn("preview", `preview request returned an invalid result for @${seq}`);
      return { kind: "error", text: "invalid preview response" };
    }
    return { kind: "success", files: value["files"], backupOff: value["backupOff"] };
  } catch (error) {
    if (isAbort(error)) {
      rewindLog.warn("preview", `preview request timed out for @${seq}`);
      return null;
    }
    rewindLog.warn("preview", `preview request threw for @${seq}`, error);
    return { kind: "error", text: error instanceof Error ? error.message : String(error) };
  }
}
async function candidatesOverApi(sessionId) {
  try {
    const response = await fetch("./api/dsh-rewind/candidates", init({ sessionId }, AbortSignal.timeout(TIMEOUT_MS)));
    const result = await settleQuery(response, "candidates");
    if (!result.ok) {
      rewindLog.warn("preview", "candidate request failed", result.error);
      return void 0;
    }
    const value = result.value;
    if (!isRecord(value) || !Array.isArray(value["candidates"]) || !value["candidates"].every(isCandidate)) {
      rewindLog.warn("preview", "candidate request returned an invalid result");
      return void 0;
    }
    return value["candidates"];
  } catch (error) {
    rewindLog.warn("preview", "candidate request threw", error);
    return void 0;
  }
}

// src/client/build-info.ts
var PLUGIN_VERSION = true ? "0.22.2" : "dev";
var PLUGIN_PACKAGE = "dsh-rewind-plugin";
var BUILD_HASH = true ? "ca084234" : "dev";

// src/client/locales.ts
var en = {
  "button.title": "Rewind",
  "button.aria": "Rewind to this message",
  "button.retract.aria": "Rewind to this pending message",
  "popover.title": "Rewind to this message",
  "popover.noText": "(no text)",
  "popover.chat": "Rewind conversation only",
  "popover.chat.hint": "Context only; workspace untouched",
  "popover.both": "Rewind conversation and files",
  "popover.both.hint": "Context and restore workspace files",
  "popover.checking": "Checking for file changes\u2026",
  "popover.noChanges": "No restorable file changes",
  "popover.backupDisabled": "Snapshots off; the restore may be incomplete",
  "popover.impact.loading": "Fetching impact list\u2026",
  "popover.impact.failed": "Could not fetch the impact list: {message}",
  "popover.impact.none": "No tracked file changes after the target; nothing to restore.",
  "popover.impact.restore": "Restore {path}",
  "popover.impact.delete": "Delete {path}",
  "popover.confirm": "Confirm rewind",
  "popover.back": "Back",
  "popover.retract.title": "Rewind to this pending message",
  "popover.retract.target": "Pending \xB7 {preview}",
  "popover.retract.hint": "Retracts this pending message and the ones after it, without interrupting the run",
  "popover.cancel": "Cancel",
  "backup.title": "Snapshot backups",
  "backup.on": "When on, file snapshots are created automatically for file restore.",
  "backup.off": "When off, no file snapshots are created; file changes made while off cannot be restored.",
  "cleanup.auto": "Auto cleanup",
  "cleanup.auto.on": "When enabled, session snapshots idle past the cutoff are cleaned automatically.",
  "cleanup.auto.off": "When off, snapshots are not cleaned automatically.",
  "cleanup.maxAge": "Idle time (days)",
  "cleanup.maxAge.hint": "Snapshot backups of sessions idle longer than this many days are cleaned.",
  "cleanup.invalid": "Enter a positive integer, or leave blank to use the default",
  "cleanup.overridden": "Overridden",
  "cleanup.reset": "Reset to default",
  "cleanup.save": "Save",
  "cleanup.saving": "Saving\u2026",
  "cleanup.saveFailed": "The deployment did not accept these values; they were left for you to correct",
  "cleanup.readonly": "This deployment stores settings read-only",
  "cleanup.unavailable": "This plugin is not loaded, so it cannot be configured right now"
};
var zh = {
  "button.title": "\u56DE\u9000",
  "button.aria": "\u56DE\u9000\u5230\u6B64\u6D88\u606F",
  "button.retract.aria": "\u56DE\u9000\u5230\u6B64\u63D2\u8BDD\u6D88\u606F",
  "popover.title": "\u56DE\u9000\u5230\u8FD9\u6761\u6D88\u606F",
  "popover.noText": "\uFF08\u65E0\u6587\u672C\uFF09",
  "popover.chat": "\u4EC5\u56DE\u9000\u5BF9\u8BDD",
  "popover.chat.hint": "\u4EC5\u56DE\u9000\u4E0A\u4E0B\u6587\uFF0C\u4E0D\u52A8\u5DE5\u4F5C\u533A\u6587\u4EF6",
  "popover.both": "\u56DE\u9000\u5BF9\u8BDD\u548C\u6587\u4EF6",
  "popover.both.hint": "\u56DE\u9000\u4E0A\u4E0B\u6587\u5E76\u8FD8\u539F\u5DE5\u4F5C\u533A\u6587\u4EF6",
  "popover.checking": "\u6B63\u5728\u68C0\u67E5\u6587\u4EF6\u53D8\u66F4\u2026",
  "popover.noChanges": "\u65E0\u53EF\u8FD8\u539F\u7684\u6587\u4EF6\u53D8\u66F4",
  "popover.backupDisabled": "\u5FEB\u7167\u5907\u4EFD\u5DF2\u5173\u95ED\uFF0C\u8FD8\u539F\u53EF\u80FD\u4E0D\u5145\u5206",
  "popover.impact.loading": "\u6B63\u5728\u83B7\u53D6\u5F71\u54CD\u6E05\u5355\u2026",
  "popover.impact.failed": "\u65E0\u6CD5\u83B7\u53D6\u5F71\u54CD\u6E05\u5355\uFF1A{message}",
  "popover.impact.none": "\u76EE\u6807\u4E4B\u540E\u6CA1\u6709\u8DDF\u8E2A\u5230\u7684\u5199\u7C7B\u53D8\u66F4\uFF0C\u65E0\u9700\u8FD8\u539F\u6587\u4EF6\u3002",
  "popover.impact.restore": "\u8FD8\u539F {path}",
  "popover.impact.delete": "\u5220\u9664 {path}",
  "popover.confirm": "\u786E\u8BA4\u56DE\u9000",
  "popover.back": "\u8FD4\u56DE",
  "popover.retract.title": "\u56DE\u9000\u5230\u8FD9\u6761\u63D2\u8BDD\u6D88\u606F",
  "popover.retract.target": "\u63D2\u8BDD\u4E2D \xB7 {preview}",
  "popover.retract.hint": "\u64A4\u56DE\u8FD9\u6761\u53CA\u4E4B\u540E\u7684\u63D2\u8BDD\u6D88\u606F\uFF0C\u4E0D\u6253\u65AD\u5F53\u524D\u751F\u6210",
  "popover.cancel": "\u53D6\u6D88",
  "backup.title": "\u5FEB\u7167\u5907\u4EFD",
  "backup.on": "\u5F00\u542F\u540E\u81EA\u52A8\u521B\u5EFA\u6587\u4EF6\u5FEB\u7167\uFF0C\u7528\u4E8E\u6587\u4EF6\u8FD8\u539F\u3002",
  "backup.off": "\u5173\u95ED\u540E\u4E0D\u518D\u521B\u5EFA\u6587\u4EF6\u5FEB\u7167\uFF1B\u5173\u95ED\u671F\u95F4\u7684\u6587\u4EF6\u6539\u52A8\u65E0\u6CD5\u8FD8\u539F\u3002",
  "cleanup.auto": "\u81EA\u52A8\u6E05\u7406",
  "cleanup.auto.on": "\u5F00\u542F\u540E\u6309\u4E0D\u6D3B\u8DC3\u5929\u6570\u81EA\u52A8\u6E05\u7406\u8FC7\u671F\u4F1A\u8BDD\u5FEB\u7167\u3002",
  "cleanup.auto.off": "\u5173\u95ED\u540E\u4E0D\u4F1A\u81EA\u52A8\u6E05\u7406\u5FEB\u7167\u3002",
  "cleanup.maxAge": "\u4E0D\u6D3B\u8DC3\u65F6\u95F4\uFF08\u5929\uFF09",
  "cleanup.maxAge.hint": "\u8D85\u8FC7\u8BE5\u5929\u6570\u672A\u6D3B\u52A8\u7684\u4F1A\u8BDD\u5FEB\u7167\u4F1A\u88AB\u6E05\u7406\u3002",
  "cleanup.invalid": "\u8BF7\u586B\u6B63\u6574\u6570\uFF1B\u7559\u7A7A\u8868\u793A\u4F7F\u7528\u9ED8\u8BA4\u503C",
  "cleanup.overridden": "\u5DF2\u8986\u76D6",
  "cleanup.reset": "\u6062\u590D\u9ED8\u8BA4",
  "cleanup.save": "\u4FDD\u5B58",
  "cleanup.saving": "\u4FDD\u5B58\u4E2D\u2026",
  "cleanup.saveFailed": "\u672C\u90E8\u7F72\u6CA1\u6709\u63A5\u53D7\u8FD9\u4E9B\u503C\uFF0C\u5DF2\u4FDD\u7559\u4F9B\u4F60\u4FEE\u6539",
  "cleanup.readonly": "\u672C\u90E8\u7F72\u7684\u8BBE\u7F6E\u4E3A\u53EA\u8BFB",
  "cleanup.unavailable": "\u8BE5\u63D2\u4EF6\u5F53\u524D\u672A\u52A0\u8F7D\uFF0C\u6682\u65F6\u65E0\u6CD5\u914D\u7F6E"
};
var ja = {
  "button.title": "\u5DFB\u304D\u623B\u3057",
  "button.aria": "\u3053\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u307E\u3067\u5DFB\u304D\u623B\u3059",
  "button.retract.aria": "\u3053\u306E\u4FDD\u7559\u4E2D\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u307E\u3067\u5DFB\u304D\u623B\u3059",
  "popover.title": "\u3053\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u307E\u3067\u5DFB\u304D\u623B\u3059",
  "popover.noText": "\uFF08\u30C6\u30AD\u30B9\u30C8\u306A\u3057\uFF09",
  "popover.chat": "\u4F1A\u8A71\u306E\u307F\u5DFB\u304D\u623B\u3059",
  "popover.chat.hint": "\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u306E\u307F\u5BFE\u8C61\u3067\u3001\u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9\u306F\u5909\u66F4\u3057\u307E\u305B\u3093",
  "popover.both": "\u4F1A\u8A71\u3068\u30D5\u30A1\u30A4\u30EB\u3092\u5DFB\u304D\u623B\u3059",
  "popover.both.hint": "\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u3092\u5DFB\u304D\u623B\u3057\u3001\u30EF\u30FC\u30AF\u30B9\u30DA\u30FC\u30B9\u306E\u30D5\u30A1\u30A4\u30EB\u3092\u5FA9\u5143\u3057\u307E\u3059",
  "popover.checking": "\u30D5\u30A1\u30A4\u30EB\u306E\u5909\u66F4\u3092\u78BA\u8A8D\u4E2D\u2026",
  "popover.noChanges": "\u5FA9\u5143\u3067\u304D\u308B\u30D5\u30A1\u30A4\u30EB\u306E\u5909\u66F4\u306F\u3042\u308A\u307E\u305B\u3093",
  "popover.backupDisabled": "\u30B9\u30CA\u30C3\u30D7\u30B7\u30E7\u30C3\u30C8\u304C\u7121\u52B9\u306A\u305F\u3081\u3001\u5FA9\u5143\u304C\u4E0D\u5B8C\u5168\u306B\u306A\u308B\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059",
  "popover.impact.loading": "\u5F71\u97FF\u30EA\u30B9\u30C8\u3092\u53D6\u5F97\u4E2D\u2026",
  "popover.impact.failed": "\u5F71\u97FF\u30EA\u30B9\u30C8\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\uFF1A{message}",
  "popover.impact.none": "\u5BFE\u8C61\u3088\u308A\u5F8C\u306B\u8FFD\u8DE1\u3055\u308C\u305F\u30D5\u30A1\u30A4\u30EB\u5909\u66F4\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u5FA9\u5143\u3059\u308B\u3082\u306E\u306F\u3042\u308A\u307E\u305B\u3093\u3002",
  "popover.impact.restore": "{path} \u3092\u5FA9\u5143",
  "popover.impact.delete": "{path} \u3092\u524A\u9664",
  "popover.confirm": "\u5DFB\u304D\u623B\u3057\u3092\u5B9F\u884C",
  "popover.back": "\u623B\u308B",
  "popover.retract.title": "\u3053\u306E\u4FDD\u7559\u4E2D\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u307E\u3067\u5DFB\u304D\u623B\u3059",
  "popover.retract.target": "\u4FDD\u7559\u4E2D \xB7 {preview}",
  "popover.retract.hint": "\u3053\u306E\u4FDD\u7559\u4E2D\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u3068\u305D\u308C\u4EE5\u964D\u3092\u64A4\u56DE\u3057\u307E\u3059\u3002\u73FE\u5728\u306E\u751F\u6210\u306F\u4E2D\u65AD\u3057\u307E\u305B\u3093",
  "popover.cancel": "\u30AD\u30E3\u30F3\u30BB\u30EB",
  "backup.title": "\u30B9\u30CA\u30C3\u30D7\u30B7\u30E7\u30C3\u30C8\u306E\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7",
  "backup.on": "\u6709\u52B9\u306B\u3059\u308B\u3068\u3001\u30D5\u30A1\u30A4\u30EB\u5FA9\u5143\u7528\u306E\u30B9\u30CA\u30C3\u30D7\u30B7\u30E7\u30C3\u30C8\u304C\u81EA\u52D5\u3067\u4F5C\u6210\u3055\u308C\u307E\u3059\u3002",
  "backup.off": "\u7121\u52B9\u306B\u3059\u308B\u3068\u3001\u30D5\u30A1\u30A4\u30EB\u306E\u30B9\u30CA\u30C3\u30D7\u30B7\u30E7\u30C3\u30C8\u306F\u4F5C\u6210\u3055\u308C\u307E\u305B\u3093\u3002\u7121\u52B9\u306A\u9593\u306E\u30D5\u30A1\u30A4\u30EB\u5909\u66F4\u306F\u5FA9\u5143\u3067\u304D\u307E\u305B\u3093\u3002",
  "cleanup.auto": "\u81EA\u52D5\u30AF\u30EA\u30FC\u30F3\u30A2\u30C3\u30D7",
  "cleanup.auto.on": "\u6709\u52B9\u306B\u3059\u308B\u3068\u3001\u3057\u304D\u3044\u5024\u3092\u8D85\u3048\u3066\u30A2\u30A4\u30C9\u30EB\u72B6\u614B\u306E\u30BB\u30C3\u30B7\u30E7\u30F3\u306E\u30B9\u30CA\u30C3\u30D7\u30B7\u30E7\u30C3\u30C8\u304C\u81EA\u52D5\u3067\u524A\u9664\u3055\u308C\u307E\u3059\u3002",
  "cleanup.auto.off": "\u7121\u52B9\u306B\u3059\u308B\u3068\u3001\u30B9\u30CA\u30C3\u30D7\u30B7\u30E7\u30C3\u30C8\u306F\u81EA\u52D5\u3067\u524A\u9664\u3055\u308C\u307E\u305B\u3093\u3002",
  "cleanup.maxAge": "\u30A2\u30A4\u30C9\u30EB\u6642\u9593\uFF08\u65E5\uFF09",
  "cleanup.maxAge.hint": "\u3053\u306E\u65E5\u6570\u3092\u8D85\u3048\u3066\u30A2\u30A4\u30C9\u30EB\u72B6\u614B\u306E\u30BB\u30C3\u30B7\u30E7\u30F3\u306E\u30B9\u30CA\u30C3\u30D7\u30B7\u30E7\u30C3\u30C8\u30D0\u30C3\u30AF\u30A2\u30C3\u30D7\u304C\u524A\u9664\u3055\u308C\u307E\u3059\u3002",
  "cleanup.invalid": "\u6B63\u306E\u6574\u6570\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u7A7A\u6B04\u306E\u5834\u5408\u306F\u65E2\u5B9A\u5024\u3092\u4F7F\u3044\u307E\u3059",
  "cleanup.overridden": "\u4E0A\u66F8\u304D\u6E08\u307F",
  "cleanup.reset": "\u65E2\u5B9A\u5024\u306B\u623B\u3059",
  "cleanup.save": "\u4FDD\u5B58",
  "cleanup.saving": "\u4FDD\u5B58\u4E2D\u2026",
  "cleanup.saveFailed": "\u3053\u306E\u30C7\u30D7\u30ED\u30A4\u30E1\u30F3\u30C8\u3067\u306F\u5024\u304C\u53D7\u3051\u4ED8\u3051\u3089\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u4FEE\u6B63\u3067\u304D\u308B\u3088\u3046\u5165\u529B\u306F\u4FDD\u6301\u3055\u308C\u3066\u3044\u307E\u3059",
  "cleanup.readonly": "\u3053\u306E\u30C7\u30D7\u30ED\u30A4\u30E1\u30F3\u30C8\u3067\u306F\u8A2D\u5B9A\u304C\u8AAD\u307F\u53D6\u308A\u5C02\u7528\u3067\u3059",
  "cleanup.unavailable": "\u3053\u306E\u30D7\u30E9\u30B0\u30A4\u30F3\u306F\u73FE\u5728\u8AAD\u307F\u8FBC\u307E\u308C\u3066\u3044\u306A\u3044\u305F\u3081\u3001\u8A2D\u5B9A\u3067\u304D\u307E\u305B\u3093"
};
var es = {
  "button.title": "Rebobinar",
  "button.aria": "Rebobinar hasta este mensaje",
  "button.retract.aria": "Rebobinar hasta este mensaje pendiente",
  "popover.title": "Rebobinar hasta este mensaje",
  "popover.noText": "(sin texto)",
  "popover.chat": "Rebobinar solo la conversaci\xF3n",
  "popover.chat.hint": "Solo el contexto; el espacio de trabajo no se modifica",
  "popover.both": "Rebobinar conversaci\xF3n y archivos",
  "popover.both.hint": "Contexto y restauraci\xF3n de los archivos del espacio de trabajo",
  "popover.checking": "Comprobando cambios en los archivos\u2026",
  "popover.noChanges": "No hay cambios de archivo restaurables",
  "popover.backupDisabled": "Instant\xE1neas desactivadas; la restauraci\xF3n puede ser incompleta",
  "popover.impact.loading": "Obteniendo la lista de impacto\u2026",
  "popover.impact.failed": "No se pudo obtener la lista de impacto: {message}",
  "popover.impact.none": "No hay cambios de archivo rastreados despu\xE9s del destino; no hay nada que restaurar.",
  "popover.impact.restore": "Restaurar {path}",
  "popover.impact.delete": "Eliminar {path}",
  "popover.confirm": "Confirmar rebobinado",
  "popover.back": "Atr\xE1s",
  "popover.retract.title": "Rebobinar hasta este mensaje pendiente",
  "popover.retract.target": "Pendiente \xB7 {preview}",
  "popover.retract.hint": "Retira este mensaje pendiente y los siguientes, sin interrumpir la ejecuci\xF3n",
  "popover.cancel": "Cancelar",
  "backup.title": "Copias de seguridad de instant\xE1neas",
  "backup.on": "Si est\xE1 activado, se crean instant\xE1neas de archivos autom\xE1ticamente para la restauraci\xF3n.",
  "backup.off": "Si est\xE1 desactivado, no se crean instant\xE1neas de archivos; los cambios hechos mientras est\xE1 desactivado no se pueden restaurar.",
  "cleanup.auto": "Limpieza autom\xE1tica",
  "cleanup.auto.on": "Si est\xE1 activada, las instant\xE1neas de sesiones inactivas m\xE1s all\xE1 del umbral se limpian autom\xE1ticamente.",
  "cleanup.auto.off": "Si est\xE1 desactivada, las instant\xE1neas no se limpian autom\xE1ticamente.",
  "cleanup.maxAge": "Tiempo de inactividad (d\xEDas)",
  "cleanup.maxAge.hint": "Se limpian las copias de seguridad de instant\xE1neas de las sesiones inactivas durante m\xE1s de este n\xFAmero de d\xEDas.",
  "cleanup.invalid": "Introduzca un entero positivo o d\xE9jelo vac\xEDo para usar el valor predeterminado",
  "cleanup.overridden": "Sobrescrito",
  "cleanup.reset": "Restablecer al valor predeterminado",
  "cleanup.save": "Guardar",
  "cleanup.saving": "Guardando\u2026",
  "cleanup.saveFailed": "La implementaci\xF3n no acept\xF3 estos valores; se conservaron para que pueda corregirlos",
  "cleanup.readonly": "Esta implementaci\xF3n guarda la configuraci\xF3n en modo de solo lectura",
  "cleanup.unavailable": "Este plugin no est\xE1 cargado, por lo que no se puede configurar ahora"
};
var fr = {
  "button.title": "Rembobiner",
  "button.aria": "Rembobiner jusqu\u2019\xE0 ce message",
  "button.retract.aria": "Rembobiner jusqu\u2019\xE0 ce message en attente",
  "popover.title": "Rembobiner jusqu\u2019\xE0 ce message",
  "popover.noText": "(sans texte)",
  "popover.chat": "Rembobiner la conversation uniquement",
  "popover.chat.hint": "Contexte uniquement ; l\u2019espace de travail reste intact",
  "popover.both": "Rembobiner la conversation et les fichiers",
  "popover.both.hint": "Contexte et restauration des fichiers de l\u2019espace de travail",
  "popover.checking": "V\xE9rification des modifications de fichiers\u2026",
  "popover.noChanges": "Aucune modification de fichier restaurable",
  "popover.backupDisabled": "Instantan\xE9s d\xE9sactiv\xE9s ; la restauration peut \xEAtre incompl\xE8te",
  "popover.impact.loading": "R\xE9cup\xE9ration de la liste d\u2019impact\u2026",
  "popover.impact.failed": "Impossible de r\xE9cup\xE9rer la liste d\u2019impact : {message}",
  "popover.impact.none": "Aucune modification de fichier suivie apr\xE8s la cible ; rien \xE0 restaurer.",
  "popover.impact.restore": "Restaurer {path}",
  "popover.impact.delete": "Supprimer {path}",
  "popover.confirm": "Confirmer le rembobinage",
  "popover.back": "Retour",
  "popover.retract.title": "Rembobiner jusqu\u2019\xE0 ce message en attente",
  "popover.retract.target": "En attente \xB7 {preview}",
  "popover.retract.hint": "Retire ce message en attente et les suivants, sans interrompre l\u2019ex\xE9cution",
  "popover.cancel": "Annuler",
  "backup.title": "Sauvegardes d\u2019instantan\xE9s",
  "backup.on": "Lorsque cette option est activ\xE9e, des instantan\xE9s de fichiers sont cr\xE9\xE9s automatiquement pour la restauration.",
  "backup.off": "Lorsque cette option est d\xE9sactiv\xE9e, aucun instantan\xE9 de fichier n\u2019est cr\xE9\xE9 ; les modifications effectu\xE9es pendant cette p\xE9riode ne peuvent pas \xEAtre restaur\xE9es.",
  "cleanup.auto": "Nettoyage automatique",
  "cleanup.auto.on": "Si activ\xE9, les instantan\xE9s des sessions inactives au-del\xE0 du seuil sont nettoy\xE9s automatiquement.",
  "cleanup.auto.off": "Si d\xE9sactiv\xE9, les instantan\xE9s ne sont pas nettoy\xE9s automatiquement.",
  "cleanup.maxAge": "Dur\xE9e d\u2019inactivit\xE9 (jours)",
  "cleanup.maxAge.hint": "Les sauvegardes d\u2019instantan\xE9s des sessions inactives depuis plus de ce nombre de jours sont nettoy\xE9es.",
  "cleanup.invalid": "Saisissez un entier positif, ou laissez vide pour utiliser la valeur par d\xE9faut",
  "cleanup.overridden": "Remplac\xE9",
  "cleanup.reset": "R\xE9initialiser par d\xE9faut",
  "cleanup.save": "Enregistrer",
  "cleanup.saving": "Enregistrement\u2026",
  "cleanup.saveFailed": "Le d\xE9ploiement n\u2019a pas accept\xE9 ces valeurs ; elles ont \xE9t\xE9 conserv\xE9es pour que vous puissiez les corriger",
  "cleanup.readonly": "Ce d\xE9ploiement enregistre les param\xE8tres en lecture seule",
  "cleanup.unavailable": "Ce plugin n\u2019est pas charg\xE9, il ne peut donc pas \xEAtre configur\xE9 pour le moment"
};
var de = {
  "button.title": "Zur\xFCckspulen",
  "button.aria": "Bis zu dieser Nachricht zur\xFCckspulen",
  "button.retract.aria": "Bis zu dieser ausstehenden Nachricht zur\xFCckspulen",
  "popover.title": "Bis zu dieser Nachricht zur\xFCckspulen",
  "popover.noText": "(kein Text)",
  "popover.chat": "Nur Unterhaltung zur\xFCckspulen",
  "popover.chat.hint": "Nur Kontext; Arbeitsbereich bleibt unver\xE4ndert",
  "popover.both": "Unterhaltung und Dateien zur\xFCckspulen",
  "popover.both.hint": "Kontext und Wiederherstellung der Arbeitsbereichsdateien",
  "popover.checking": "Datei\xE4nderungen werden gepr\xFCft\u2026",
  "popover.noChanges": "Keine wiederherstellbaren Datei\xE4nderungen",
  "popover.backupDisabled": "Snapshots deaktiviert; die Wiederherstellung kann unvollst\xE4ndig sein",
  "popover.impact.loading": "Auswirkungsliste wird abgerufen\u2026",
  "popover.impact.failed": "Auswirkungsliste konnte nicht abgerufen werden: {message}",
  "popover.impact.none": "Keine erfassten Datei\xE4nderungen nach dem Ziel; nichts wiederherzustellen.",
  "popover.impact.restore": "{path} wiederherstellen",
  "popover.impact.delete": "{path} l\xF6schen",
  "popover.confirm": "Zur\xFCckspulen best\xE4tigen",
  "popover.back": "Zur\xFCck",
  "popover.retract.title": "Bis zu dieser ausstehenden Nachricht zur\xFCckspulen",
  "popover.retract.target": "Ausstehend \xB7 {preview}",
  "popover.retract.hint": "Zieht diese ausstehende Nachricht und alle folgenden zur\xFCck, ohne den Lauf zu unterbrechen",
  "popover.cancel": "Abbrechen",
  "backup.title": "Snapshot-Sicherungen",
  "backup.on": "Wenn aktiviert, werden automatisch Datei-Snapshots f\xFCr die Wiederherstellung erstellt.",
  "backup.off": "Wenn deaktiviert, werden keine Datei-Snapshots erstellt; \xC4nderungen aus dieser Zeit k\xF6nnen nicht wiederhergestellt werden.",
  "cleanup.auto": "Automatische Bereinigung",
  "cleanup.auto.on": "Wenn aktiviert, werden Snapshots von Sitzungen, deren Inaktivit\xE4t den Grenzwert \xFCberschreitet, automatisch bereinigt.",
  "cleanup.auto.off": "Wenn deaktiviert, werden Snapshots nicht automatisch bereinigt.",
  "cleanup.maxAge": "Inaktivit\xE4tsdauer (Tage)",
  "cleanup.maxAge.hint": "Snapshot-Sicherungen von Sitzungen, die l\xE4nger als diese Anzahl Tage inaktiv sind, werden bereinigt.",
  "cleanup.invalid": "Geben Sie eine positive Ganzzahl ein oder lassen Sie das Feld leer, um den Standard zu verwenden",
  "cleanup.overridden": "\xDCberschrieben",
  "cleanup.reset": "Auf Standard zur\xFCcksetzen",
  "cleanup.save": "Speichern",
  "cleanup.saving": "Speichern\u2026",
  "cleanup.saveFailed": "Die Bereitstellung hat diese Werte nicht \xFCbernommen; sie wurden zur Korrektur beibehalten",
  "cleanup.readonly": "Diese Bereitstellung speichert Einstellungen schreibgesch\xFCtzt",
  "cleanup.unavailable": "Dieses Plugin ist nicht geladen und kann daher gerade nicht konfiguriert werden"
};
var ru = {
  "button.title": "\u041E\u0442\u043A\u0430\u0442\u0438\u0442\u044C",
  "button.aria": "\u041E\u0442\u043A\u0430\u0442\u0438\u0442\u044C \u043A \u044D\u0442\u043E\u043C\u0443 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044E",
  "button.retract.aria": "\u041E\u0442\u043A\u0430\u0442\u0438\u0442\u044C \u043A \u044D\u0442\u043E\u043C\u0443 \u043E\u0436\u0438\u0434\u0430\u044E\u0449\u0435\u043C\u0443 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044E",
  "popover.title": "\u041E\u0442\u043A\u0430\u0442\u0438\u0442\u044C \u043A \u044D\u0442\u043E\u043C\u0443 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044E",
  "popover.noText": "(\u043D\u0435\u0442 \u0442\u0435\u043A\u0441\u0442\u0430)",
  "popover.chat": "\u041E\u0442\u043A\u0430\u0442\u0438\u0442\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u0431\u0435\u0441\u0435\u0434\u0443",
  "popover.chat.hint": "\u0422\u043E\u043B\u044C\u043A\u043E \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442; \u0440\u0430\u0431\u043E\u0447\u0430\u044F \u043E\u0431\u043B\u0430\u0441\u0442\u044C \u043D\u0435 \u0438\u0437\u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F",
  "popover.both": "\u041E\u0442\u043A\u0430\u0442\u0438\u0442\u044C \u0431\u0435\u0441\u0435\u0434\u0443 \u0438 \u0444\u0430\u0439\u043B\u044B",
  "popover.both.hint": "\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442 \u0438 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0444\u0430\u0439\u043B\u043E\u0432 \u0440\u0430\u0431\u043E\u0447\u0435\u0439 \u043E\u0431\u043B\u0430\u0441\u0442\u0438",
  "popover.checking": "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u0444\u0430\u0439\u043B\u043E\u0432\u2026",
  "popover.noChanges": "\u041D\u0435\u0442 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u043C\u044B\u0445 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u0444\u0430\u0439\u043B\u043E\u0432",
  "popover.backupDisabled": "\u0421\u043D\u0438\u043C\u043A\u0438 \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u044B; \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u043D\u0435\u043F\u043E\u043B\u043D\u044B\u043C",
  "popover.impact.loading": "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435 \u0441\u043F\u0438\u0441\u043A\u0430 \u0432\u043B\u0438\u044F\u043D\u0438\u044F\u2026",
  "popover.impact.failed": "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0441\u043F\u0438\u0441\u043E\u043A \u0432\u043B\u0438\u044F\u043D\u0438\u044F: {message}",
  "popover.impact.none": "\u041F\u043E\u0441\u043B\u0435 \u0446\u0435\u043B\u0438 \u043D\u0435\u0442 \u043E\u0442\u0441\u043B\u0435\u0436\u0438\u0432\u0430\u0435\u043C\u044B\u0445 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u0444\u0430\u0439\u043B\u043E\u0432; \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u0442\u044C \u043D\u0435\u0447\u0435\u0433\u043E.",
  "popover.impact.restore": "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C {path}",
  "popover.impact.delete": "\u0423\u0434\u0430\u043B\u0438\u0442\u044C {path}",
  "popover.confirm": "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u043E\u0442\u043A\u0430\u0442",
  "popover.back": "\u041D\u0430\u0437\u0430\u0434",
  "popover.retract.title": "\u041E\u0442\u043A\u0430\u0442\u0438\u0442\u044C \u043A \u044D\u0442\u043E\u043C\u0443 \u043E\u0436\u0438\u0434\u0430\u044E\u0449\u0435\u043C\u0443 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044E",
  "popover.retract.target": "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \xB7 {preview}",
  "popover.retract.hint": "\u041E\u0442\u0437\u044B\u0432\u0430\u0435\u0442 \u044D\u0442\u043E \u043E\u0436\u0438\u0434\u0430\u044E\u0449\u0435\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0438 \u043F\u043E\u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0435, \u043D\u0435 \u043F\u0440\u0435\u0440\u044B\u0432\u0430\u044F \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435",
  "popover.cancel": "\u041E\u0442\u043C\u0435\u043D\u0430",
  "backup.title": "\u0420\u0435\u0437\u0435\u0440\u0432\u043D\u044B\u0435 \u043A\u043E\u043F\u0438\u0438 \u0441\u043D\u0438\u043C\u043A\u043E\u0432",
  "backup.on": "\u0415\u0441\u043B\u0438 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u043E, \u0441\u043D\u0438\u043C\u043A\u0438 \u0444\u0430\u0439\u043B\u043E\u0432 \u0441\u043E\u0437\u0434\u0430\u044E\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0434\u043B\u044F \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F.",
  "backup.off": "\u0415\u0441\u043B\u0438 \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u043E, \u0441\u043D\u0438\u043C\u043A\u0438 \u0444\u0430\u0439\u043B\u043E\u0432 \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u044E\u0442\u0441\u044F; \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F, \u0441\u0434\u0435\u043B\u0430\u043D\u043D\u044B\u0435 \u0432 \u044D\u0442\u043E \u0432\u0440\u0435\u043C\u044F, \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043D\u0435\u043B\u044C\u0437\u044F.",
  "cleanup.auto": "\u0410\u0432\u0442\u043E\u043E\u0447\u0438\u0441\u0442\u043A\u0430",
  "cleanup.auto.on": "\u0415\u0441\u043B\u0438 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0430, \u0441\u043D\u0438\u043C\u043A\u0438 \u0441\u0435\u0430\u043D\u0441\u043E\u0432, \u043F\u0440\u043E\u0441\u0442\u0430\u0438\u0432\u0430\u044E\u0449\u0438\u0445 \u0434\u043E\u043B\u044C\u0448\u0435 \u043F\u043E\u0440\u043E\u0433\u0430, \u043E\u0447\u0438\u0449\u0430\u044E\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438.",
  "cleanup.auto.off": "\u0415\u0441\u043B\u0438 \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u0430, \u0441\u043D\u0438\u043C\u043A\u0438 \u043D\u0435 \u043E\u0447\u0438\u0449\u0430\u044E\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438.",
  "cleanup.maxAge": "\u0412\u0440\u0435\u043C\u044F \u043F\u0440\u043E\u0441\u0442\u043E\u044F (\u0434\u043D\u0435\u0439)",
  "cleanup.maxAge.hint": "\u0420\u0435\u0437\u0435\u0440\u0432\u043D\u044B\u0435 \u043A\u043E\u043F\u0438\u0438 \u0441\u043D\u0438\u043C\u043A\u043E\u0432 \u0441\u0435\u0430\u043D\u0441\u043E\u0432, \u043F\u0440\u043E\u0441\u0442\u0430\u0438\u0432\u0430\u044E\u0449\u0438\u0445 \u0434\u043E\u043B\u044C\u0448\u0435 \u044D\u0442\u043E\u0433\u043E \u0447\u0438\u0441\u043B\u0430 \u0434\u043D\u0435\u0439, \u043E\u0447\u0438\u0449\u0430\u044E\u0442\u0441\u044F.",
  "cleanup.invalid": "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u0446\u0435\u043B\u043E\u0435 \u0447\u0438\u0441\u043B\u043E \u0438\u043B\u0438 \u043E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u043E\u043B\u0435 \u043F\u0443\u0441\u0442\u044B\u043C \u0434\u043B\u044F \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E",
  "cleanup.overridden": "\u041F\u0435\u0440\u0435\u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u043E",
  "cleanup.reset": "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u043A \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044E \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E",
  "cleanup.save": "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C",
  "cleanup.saving": "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435\u2026",
  "cleanup.saveFailed": "\u0420\u0430\u0437\u0432\u0451\u0440\u0442\u044B\u0432\u0430\u043D\u0438\u0435 \u043D\u0435 \u043F\u0440\u0438\u043D\u044F\u043B\u043E \u044D\u0442\u0438 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F; \u043E\u043D\u0438 \u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u044B \u0434\u043B\u044F \u0438\u0441\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F",
  "cleanup.readonly": "\u0412 \u044D\u0442\u043E\u043C \u0440\u0430\u0437\u0432\u0451\u0440\u0442\u044B\u0432\u0430\u043D\u0438\u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0447\u0442\u0435\u043D\u0438\u044F",
  "cleanup.unavailable": "\u042D\u0442\u043E\u0442 \u043F\u043B\u0430\u0433\u0438\u043D \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D, \u043F\u043E\u044D\u0442\u043E\u043C\u0443 \u0441\u0435\u0439\u0447\u0430\u0441 \u0435\u0433\u043E \u043D\u0435\u043B\u044C\u0437\u044F \u043D\u0430\u0441\u0442\u0440\u043E\u0438\u0442\u044C"
};
var pt = {
  "button.title": "Rebobinar",
  "button.aria": "Rebobinar at\xE9 esta mensagem",
  "button.retract.aria": "Rebobinar at\xE9 esta mensagem pendente",
  "popover.title": "Rebobinar at\xE9 esta mensagem",
  "popover.noText": "(sem texto)",
  "popover.chat": "Rebobinar apenas a conversa",
  "popover.chat.hint": "Apenas o contexto; o espa\xE7o de trabalho n\xE3o \xE9 alterado",
  "popover.both": "Rebobinar conversa e arquivos",
  "popover.both.hint": "Contexto e restaura\xE7\xE3o dos arquivos do espa\xE7o de trabalho",
  "popover.checking": "Verificando altera\xE7\xF5es nos arquivos\u2026",
  "popover.noChanges": "Nenhuma altera\xE7\xE3o de arquivo restaur\xE1vel",
  "popover.backupDisabled": "Snapshots desativados; a restaura\xE7\xE3o pode ficar incompleta",
  "popover.impact.loading": "Obtendo a lista de impacto\u2026",
  "popover.impact.failed": "N\xE3o foi poss\xEDvel obter a lista de impacto: {message}",
  "popover.impact.none": "Nenhuma altera\xE7\xE3o de arquivo rastreada ap\xF3s o destino; nada a restaurar.",
  "popover.impact.restore": "Restaurar {path}",
  "popover.impact.delete": "Excluir {path}",
  "popover.confirm": "Confirmar rebobinamento",
  "popover.back": "Voltar",
  "popover.retract.title": "Rebobinar at\xE9 esta mensagem pendente",
  "popover.retract.target": "Pendente \xB7 {preview}",
  "popover.retract.hint": "Retira esta mensagem pendente e as seguintes, sem interromper a execu\xE7\xE3o",
  "popover.cancel": "Cancelar",
  "backup.title": "Backups de snapshots",
  "backup.on": "Quando ativado, snapshots de arquivos s\xE3o criados automaticamente para a restaura\xE7\xE3o.",
  "backup.off": "Quando desativado, nenhum snapshot de arquivo \xE9 criado; altera\xE7\xF5es feitas enquanto desativado n\xE3o podem ser restauradas.",
  "cleanup.auto": "Limpeza autom\xE1tica",
  "cleanup.auto.on": "Quando ativada, snapshots de sess\xF5es ociosas al\xE9m do limite s\xE3o limpos automaticamente.",
  "cleanup.auto.off": "Quando desativada, os snapshots n\xE3o s\xE3o limpos automaticamente.",
  "cleanup.maxAge": "Tempo ocioso (dias)",
  "cleanup.maxAge.hint": "Backups de snapshots de sess\xF5es ociosas h\xE1 mais deste n\xFAmero de dias s\xE3o limpos.",
  "cleanup.invalid": "Insira um inteiro positivo ou deixe em branco para usar o padr\xE3o",
  "cleanup.overridden": "Substitu\xEDdo",
  "cleanup.reset": "Redefinir para o padr\xE3o",
  "cleanup.save": "Salvar",
  "cleanup.saving": "Salvando\u2026",
  "cleanup.saveFailed": "A implanta\xE7\xE3o n\xE3o aceitou estes valores; eles foram mantidos para voc\xEA corrigir",
  "cleanup.readonly": "Esta implanta\xE7\xE3o armazena as configura\xE7\xF5es como somente leitura",
  "cleanup.unavailable": "Este plugin n\xE3o est\xE1 carregado, ent\xE3o n\xE3o pode ser configurado agora"
};
var CLIENT_DICTS = { en, zh, ja, es, fr, de, ru, pt };

// src/client/settings-card.tsx
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime4 = require("react/jsx-runtime");
var SETTINGS_ENTRY_ID = "dsh-rewind-plugin";
var DEFAULT_MAX_AGE_DAYS = 30;
function autoCleanupEnabledField() {
  return {
    field: "autoCleanupEnabled",
    format: (value) => String(value === true),
    parse: (text) => ({ kind: "set", value: text === "true" })
  };
}
function fileCheckpointingEnabledField() {
  return {
    field: "fileCheckpointingEnabled",
    format: (value) => String(value !== false),
    parse: (text) => text === "true" ? { kind: "clear" } : { kind: "set", value: false }
  };
}
function formLabels(t) {
  return {
    unavailable: t("cleanup.unavailable"),
    readOnly: t("cleanup.readonly"),
    saveFailed: t("cleanup.saveFailed"),
    save: t("cleanup.save"),
    saving: t("cleanup.saving")
  };
}
function settingsForm(scope) {
  const form = new import_dsh_client_ui_primitives2.SettingsFormModel(scope, [
    fileCheckpointingEnabledField(),
    autoCleanupEnabledField(),
    (0, import_dsh_client_ui_primitives2.settingsNumberField)("autoCleanupMaxAgeDays")
  ]);
  return {
    form,
    store: form.bind(() => ({
      ...form.shell(),
      checkpointingEnabled: form.field("fileCheckpointingEnabled"),
      enabled: form.field("autoCleanupEnabled"),
      maxAgeDays: form.field("autoCleanupMaxAgeDays")
    }))
  };
}
function SettingsCard(props) {
  const { t, useSettingsCard } = props;
  const state = useSettingsCard((snapshot) => snapshot);
  if (props.view === "summary") return null;
  const disabled = !state.writable || state.saving;
  const checkpointing = state.checkpointingEnabled.text === "true";
  const cleanupEnabled = state.enabled.text === "true";
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
    import_dsh_client_ui_primitives2.SettingsForm,
    {
      labels: formLabels(t),
      state,
      onSave: props.save,
      onDiscard: props.discard,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-rewind-settings-section", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-rewind-settings-toggle-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-rewind-settings-toggle-label", children: t("backup.title") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              import_dsh_client_ui_primitives2.Switch,
              {
                checked: checkpointing,
                label: t("backup.title"),
                disabled,
                onChange: (next) => {
                  props.edit("fileCheckpointingEnabled", String(next));
                }
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsh-rewind-settings-hint", children: t(checkpointing ? "backup.on" : "backup.off") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dsh-rewind-settings-divider" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-rewind-settings-section", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dsh-rewind-settings-toggle-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-rewind-settings-toggle-label", children: t("cleanup.auto") }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              import_dsh_client_ui_primitives2.Switch,
              {
                checked: cleanupEnabled,
                label: t("cleanup.auto"),
                disabled,
                onChange: (next) => {
                  props.edit("autoCleanupEnabled", String(next));
                }
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "dsh-rewind-settings-hint", children: t(cleanupEnabled ? "cleanup.auto.on" : "cleanup.auto.off") })
        ] }),
        cleanupEnabled ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          import_dsh_client_ui_primitives2.SettingsValueField,
          {
            id: "dsh-rewind-cleanup-maxage",
            label: t("cleanup.maxAge"),
            hint: t("cleanup.maxAge.hint"),
            overriddenLabel: t("cleanup.overridden"),
            resetLabel: t("cleanup.reset"),
            invalidLabel: t("cleanup.invalid"),
            placeholder: String(DEFAULT_MAX_AGE_DAYS),
            numeric: true,
            disabled,
            ...state.maxAgeDays,
            onEdit: (text) => {
              props.edit("autoCleanupMaxAgeDays", text);
            },
            onReset: () => {
              props.resetField("autoCleanupMaxAgeDays");
            }
          }
        ) : null
      ]
    }
  );
}

// src/client/index.ts
var name = "dsh-rewind";
var inject = ["slots", "sessions", "locale", "commandUi", "configForms"];
var NS2 = "rewind";
var HEADER_ACTIONS_SLOT = "conversation.session.header.actions";
var COMPOSER_EDITABLE_SELECTOR2 = "[data-composer-input]";
function apply(ctx) {
  rewindLog.info("boot", `loaded v${PLUGIN_VERSION} (build ${BUILD_HASH})`);
  ctx.effect(function* () {
    yield ctx.locale.register(NS2, CLIENT_DICTS);
    const t = ctx.locale.bind(NS2);
    registerPreviewCall(previewOverApi);
    const style = document.createElement("style");
    style.dataset.plugin = PLUGIN_PACKAGE;
    style.textContent = STYLE;
    document.head.appendChild(style);
    installChatViewVisibility(ctx);
    const sessionOf = (sessionId) => ctx.sessions.binding(sessionId)?.session;
    const isMainViewSession = (sessionId) => (ctx.sessions.list.getSnapshot().byId[sessionId]?.retainedBy.mainView ?? 0) > 0;
    const subscribeLocale = (cb) => ctx.locale.subscribe(cb);
    const uiConversation = () => ctx.get("uiConversation");
    const CHAT_VIEW = "chat";
    const chatOf = (session) => {
      if (session === void 0) return void 0;
      try {
        const view = uiConversation()?.binding(session.sessionId).target(CHAT_VIEW);
        return chatSnapshotOf(view);
      } catch {
        return void 0;
      }
    };
    const composerFacade = (sessionId) => {
      const conversation = ctx.get("conversation");
      const input = conversation?.input;
      const scope = ctx.sessions.scope?.(sessionId);
      if (input === void 0 || scope === void 0) return void 0;
      return {
        setDraft: (draft) => {
          input.for(scope).setDraft(draft);
        },
        focus: () => {
          input.for(scope).focus();
        }
      };
    };
    const IMAGE_MEDIA_EXTENSION = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif"
    };
    const restoreImages = async (sessionId, images) => {
      if (images.length === 0) return;
      const session = sessionOf(sessionId);
      const conversation = ctx.get("conversation");
      const scope = ctx.sessions.scope?.(sessionId);
      if (session === void 0 || conversation?.input === void 0 || conversation.createDrafts === void 0 || scope === void 0) {
        rewindLog.warn("refill", "image restore unavailable (conversation services not ready)");
        return;
      }
      const files = [];
      for (const [index, ref] of images.entries()) {
        const extension = IMAGE_MEDIA_EXTENSION[ref.mediaType];
        if (extension === void 0) {
          rewindLog.warn("refill", `skipping image with unsupported type ${ref.mediaType}`);
          continue;
        }
        if (typeof ref.bytes !== "number" || typeof ref.width !== "number" || typeof ref.height !== "number") {
          rewindLog.warn("refill", `skipping image ${ref.attachmentId}: incomplete durable reference`);
          continue;
        }
        try {
          const result = await session.readAttachment({
            attachmentId: ref.attachmentId,
            mediaType: ref.mediaType,
            bytes: ref.bytes,
            width: ref.width,
            height: ref.height,
            ...ref.name === void 0 ? {} : { name: ref.name }
          });
          if (!result.ok) throw result.error;
          const bytes = result.value.data;
          files.push(new File([bytes], ref.name ?? `image-${index + 1}.${extension}`, { type: ref.mediaType }));
        } catch (error) {
          rewindLog.warn("refill", `image read threw for ${ref.attachmentId}`, error);
        }
      }
      if (files.length === 0) return;
      try {
        const drafts = conversation.createDrafts(sessionId, files, session.getSnapshot().subagent === null);
        const admitted = conversation.input.for(scope).addAttachments(drafts.map((draft) => draft.id));
        if (!admitted) {
          rewindLog.warn("refill", `composer refused ${drafts.length} restored image(s) (busy)`);
          conversation.releaseDraftAttachments?.(drafts);
        }
      } catch (error) {
        rewindLog.warn("refill", "image restore threw", error);
      }
    };
    const setComposerText = (sessionId, text) => {
      try {
        return writeComposer(text, composerFacade(sessionId));
      } catch (error) {
        rewindLog.warn("refill", "composer write threw", error);
        return false;
      }
    };
    registerComposerFocuser((sessionId) => {
      try {
        composerFacade(sessionId)?.focus();
      } catch (error) {
        rewindLog.warn("refill", "composer focus threw", error);
      }
    });
    const watchChat = (sessionId, cb) => resolveChatWatch(
      (id) => {
        try {
          return uiConversation()?.binding(id).target(CHAT_VIEW);
        } catch {
          return void 0;
        }
      },
      sessionId,
      cb
    );
    const slots = ctx.slots;
    try {
      const { store, form } = settingsForm(
        ctx.configForms.get(SETTINGS_ENTRY_ID)
      );
      ctx.effect(() => () => {
        form.dispose();
      }, "dsh-rewind settings form");
      yield slots.inject("plugins.bundle.config", () => slots.register(
        {
          name: "plugins.bundle.config",
          key: PLUGIN_PACKAGE,
          locale: NS2,
          inject: () => ({ hooks: { settingsCard: store }, ...form.actions() })
        },
        SettingsCard
      ));
    } catch (error) {
      rewindLog.error("settings", "settings card register failed", error);
    }
    const commandUi = ctx.get("commandUi");
    const hasCandidates = (sessionId) => {
      const face = sessionId === void 0 ? void 0 : sessionOf(sessionId);
      if (face === void 0 || isRewindInertSession(face.getSnapshot())) return false;
      const chat = chatOf(face);
      return chat !== void 0 && rewindCandidatesOfChat(chat).length > 0;
    };
    const fetchHostCandidates = async (face) => candidatesOverApi(face.sessionId);
    const hostCandidatesCache = /* @__PURE__ */ new Map();
    const composerAnchor = () => {
      const surface = composerSurface2();
      const card = surface?.closest("[data-composer-card]");
      return card ?? surface ?? document.body;
    };
    const rewindPopupSpec = {
      // The picker exists exactly while the surface has a reachable user
      // message: a fresh session (no candidates) falls through to the host
      // command, which fails with "no user messages" — matching the harness's
      // own decoration convention (see ui-permission-presets).
      available: (session) => hasCandidates(session.sessionId),
      ui: {
        kind: "popupSelect",
        options: async (session) => {
          const face = sessionOf(session.sessionId);
          if (face === void 0) return [];
          const candidates = await fetchHostCandidates(face);
          if (candidates !== void 0) hostCandidatesCache.set(session.sessionId, candidates);
          return candidates === void 0 ? [] : rewindOptionsFromCandidates(candidates, t);
        },
        onSelect: (option, session) => {
          const face = sessionOf(session.sessionId);
          if (face === void 0) return;
          const candidate = hostCandidatesCache.get(session.sessionId)?.find(
            (candidate2) => candidate2.seq === Number(option.id)
          );
          if (candidate === void 0) return;
          openPopover({
            session: face,
            seq: candidate.seq,
            time: candidate.time,
            preview: candidate.preview,
            anchor: composerAnchor(),
            t,
            onRewind: (mode) => {
              void runRewindAndFill(face, candidate.seq, mode, isMainViewSession, chatOf, watchChat, setComposerText, restoreImages);
            }
          });
        }
      }
    };
    for (const name2 of ["rewind", "undo"]) {
      yield commandUi.decorate({ name: name2, ...rewindPopupSpec });
    }
    const canRewindIn = (sessionId) => {
      const face = sessionOf(sessionId);
      return face !== void 0 && !isRewindInertSession(face.getSnapshot());
    };
    const openRewindFor = (row, anchor) => {
      const face = sessionOf(row.sessionId);
      if (face === void 0) {
        rewindLog.warn("action", "rewind action clicked with no session binding");
        return;
      }
      openPopover({
        session: face,
        seq: row.seq,
        time: row.time,
        preview: row.text,
        anchor,
        placement: "below",
        t,
        onRewind: (mode) => {
          void runRewindAndFill(face, row.seq, mode, isMainViewSession, chatOf, watchChat, setComposerText, restoreImages);
        }
      });
    };
    try {
      yield installRowAction({
        slots: ctx.slots,
        render: rewindActionRenderer(t, canRewindIn, openRewindFor)
      });
    } catch (error) {
      rewindLog.error("action", "rewind action mount failed", error);
    }
    try {
      yield slots.inject(HEADER_ACTIONS_SLOT, () => slots.register(
        { name: HEADER_ACTIONS_SLOT, id: "dsh-rewind-pending", order: 1e3 },
        createPendingBridge({ sessionOf, setComposerText, restoreImages, t, subscribeLocale })
      ));
    } catch (error) {
      rewindLog.error("retract", "pending retract mount failed", error);
    }
    const composerSurface2 = () => document.querySelector(COMPOSER_EDITABLE_SELECTOR2);
    yield () => {
      closePopover();
    };
  }, "dsh-rewind client lifecycle");
}

			return module.exports;
		}
		/* rewind-client:end */

		//#region locale

		var zh = {
			'panel': '管理中枢',
			'settings.failed': '设置页入口没能打开管理中枢面板，请刷新页面后再试。',
			'subtitle': '技能分类、MCP 服务、联网搜索、偏好与局域网访问',
			'tab.skills': '技能',
			'tab.mcp': 'MCP',
			'tab.search': '联网搜索',
			'skx.subtabs': '技能分区',
			'skx.countsLabel': '启用',
			'skx.countsOf': '/ 共 {total}',
			'skx.countsHint': '已启用的技能数 / 技能总数（异常技能不计在内）',
			'skx.tab.installed': '已安装',
			'skx.tab.project': '项目技能',
			'skx.tab.discover': '发现技能',
			'skx.tab.trash': '回收站',
			'skx.noSources': '没有检测到任何技能目录。',
			'skx.noWorkspaces': '还没有登记的工作区。先在侧栏添加一个工作区。',
			'skx.workspaceNoSkills': '这个工作区里还没有技能。',
			'skx.workspaceUnavailable': '目录不可用',
			'skx.projectHint': '按工作区查看项目级技能，只读。',
			'skx.search': '搜索全部来源的技能名、简介或备注',
			'skx.searchAction': '搜索',
			'skx.brokenButton': '异常',
			'skx.brokenTitle': '无法加载的技能',
			'skx.brokenHint': '这些 SKILL.md 不满足宿主要求，宿主不会加载、也不能启用；改好对应文件后点右上角的「重新扫描」。',
			'skx.brokenNone': '没有无法加载的技能。',
			'skx.diag.frontmatter': '文件开头没有 frontmatter（--- 段）',
			'skx.diag.nameMissing': 'frontmatter 里没有 name',
			'skx.diag.nameInvalid': 'name 不合法（要能转成 kebab-case，如 my-skill）',
			'skx.diag.description': 'frontmatter 里 description 为空',
			'skx.diag.invocation': 'disable-model-invocation / user-invocable 的取值不合法',
			'skx.diag.other': '内核没有给出具体原因',
			'skx.toggleSource': '开启或关闭整个来源',
			'skx.toggleSkill': '开启或关闭这个技能',
			'skx.noSkills': '这个来源里还没有技能。',
			'skx.noMatch': '没有匹配的技能。',
			'skx.sourcesButton': '来源',
			'skx.sourcesTitle': '技能来源',
			'skx.sourcesHint': '关掉一个来源，它下面的技能就不再提供给 Agent；单个技能仍可在这里单独开关。',
			'skx.sourceSkillCount': '{n} 个技能',
			'skx.sourceOffTip': '这个来源已停用，下面的技能不会提供给 Agent',
			'skx.copiesTip': '同名技能在另外 {n} 个来源里也存在，这里只列出生效的那一份',
			'skx.manualOnly': '仅手动',
			'skx.manualOnlyTip': '模型不会自动调用它，只有你点名时才用',
			'skx.broken': '解析失败',
			'skx.noDescription': '未提供简介',
			'skx.description': '简介',
			'skx.tokenDesc': '简介 token',
			'skx.tokenBody': '正文 token',
			'skx.descTokensTip': '简介常驻系统提示词，按估算值显示',
			'skx.bodyTokensTip': '正文只在调用技能时加载，按估算值显示',
			'skx.note': '自定义备注',
			'skx.editNote': '编辑',
			'skx.notePlaceholder': '记录这个技能是做什么的、什么时候用…',
			'skx.noNote': '还没有备注。备注只存在本插件里，不会写回 SKILL.md。',
			'skx.save': '保存',
			'skx.body': 'SKILL.md 正文',
			'skx.copyBody': '复制正文',
			'skx.copied': '已复制',
			'skx.path': '源文件',
			'skx.discoverHint': '从 ClawHub 榜单或搜索安装技能。',
			'skx.sortDownloads': '按下载',
			'skx.sortInstalls': '按安装',
			'skx.sortStars': '按星标',
			'skx.backToChart': '回到榜单',
			'skx.trash': '移到回收站',
			'skx.trashConfirm': '确认移入',
			'skx.confirmTrashTitle': '把「{name}」移到回收站？',
			'skx.confirmTrashDesc': '技能会从当前来源移入回收站，之后可以在回收站里恢复到原位。源文件不会被直接删除。',
			'skx.deleteUnavailable': '这个来源是只读的，不能删除里面的技能。',
			'skx.discoverSearch': '搜索技能名、关键词…',
			'skx.discoverEmpty': '还没有结果。换一个关键词，或在上方搜索。',
			'skx.discoverNone': '没有搜索到匹配的技能。',
			'skx.discoverPick': '选择一个技能查看它的简介和正文，然后安装。',
			'skx.install': '安装',
			'skx.installTo': '安装到',
			'skx.installed': '已安装：{name}',
			'skx.preview': '预览',
			'skx.downloads': '{n} 次下载',
			'skx.purgeConfirmTitle': '永久删除「{name}」？',
			'skx.purgeConfirmDesc': '这一步不可恢复，技能目录会被直接删除。',
			'skx.kernelError': '技能内核未就绪：{detail}',
			'skx.kernelNotWired': '未接线',
			'skx.kernelDetail': '已挂载={mounted}，路由数={routes}，错误：{error}',
			'skx.kernelNoError': '无',
			'skx.trashHint': '删除的技能先进回收站，可以恢复。',
			'skx.trashEmpty': '回收站是空的。',
			'skx.trashFrom': '来自 {root}',
			'skx.restore': '恢复',
			'skx.purge': '永久删除',
			'action.refresh': '重新扫描',
			'action.close': '关闭',
			'action.cancel': '取消',
			'action.edit': '编辑',
			'action.delete': '删除',
			'action.reconnect': '重新连接',
			'action.retry': '重试',
			'state.loading': '读取中…',
			'state.saved': '已保存',
			'state.deleted': '已删除',
			'state.refreshed': '已重新扫描',
			'mcp.note': 'stdio 启动；工具以 mcp__<服务>__<工具> 注入 Agent。环境变量的值保存在本机凭证库，面板不回显。',
			'mcp.add': '添加 MCP 服务',
			'mcp.empty': '还没有 MCP 服务。添加一个本地 stdio 服务，它的工具会出现在 Agent 的工具列表里。',
			'mcp.unavailable': 'Host 没有提供 tools 服务，MCP 工具无法注册。',
			'mcp.noCredentials': 'Host 没有提供凭证服务，环境变量无法保存；不填环境变量仍可使用。',
			'mcp.state.connecting': '连接中',
			'mcp.state.ready': '已连接',
			'mcp.state.error': '连接错误',
			'mcp.state.stopped': '未启用',
			'mcp.toolsCount': '{n} 个工具',
			'mcp.showTools': '查看工具',
			'mcp.hideTools': '收起工具',
			'mcp.toolsEmpty': '这个服务没有提供工具。',
			'mcp.envKeys': '环境变量',
			'mcp.noEnv': '无',
			'mcp.stderr': '最近输出',
			'mcp.deleteConfirm': '确认删除',
			'mcp.form.addTitle': '添加 MCP 服务',
			'mcp.form.editTitle': '编辑 MCP 服务',
			'mcp.form.name': '服务名',
			'mcp.form.nameHint': '工具命名空间：字母、数字、下划线或横线，最长 32。',
			'mcp.form.command': '启动命令',
			'mcp.form.commandHint': '例如 npx、uvx 或绝对路径。',
			'mcp.form.args': '参数',
			'mcp.form.argsHint': '每行一个参数，例如 -y 和包名。',
			'mcp.form.cwd': '工作目录',
			'mcp.form.cwdHint': '可选，必须是绝对路径。',
			'mcp.form.env': '环境变量',
			'mcp.form.envHint': '每行一个 KEY=VALUE。',
			'mcp.form.envSaved': '已保存 {n} 个变量：{keys}',
			'mcp.form.envKeep': '留空表示保持不变；填写则整体替换。',
			'mcp.form.clearEnv': '清空已保存的环境变量',
			'mcp.form.enabled': '保存后立即启用',
			'mcp.form.invalidEnv': '环境变量格式不对：每行 KEY=VALUE，名称只能包含字母、数字、下划线',
			'mcp.form.required': '请填写服务名和启动命令',
			'mcp.form.submit': '保存',
			'search.mode': '搜索模式',
			'search.time': '时间',
			'search.timeAny': '不限',
			'search.timeDay': '一天',
			'search.timeWeek': '一周',
			'search.timeMonth': '一月',
			'search.timeYear': '一年',
			'search.modeMerge': '并发合并',
			'search.modeFallback': '顺序回退',
			'search.modeMergeHint': '所有启用渠道同时搜，合并去重。',
			'search.modeFallbackHint': '按下方顺序逐个试，命中即停。',
			'search.modeAuto': '智能路由',
			'search.modeAutoHint': '按查询语言和意图选前几个渠道，命中即停。',
			'search.cached': '缓存',
			'search.allCooling': '所有启用的渠道都在冷却中，稍后再试或点“重置冷却”。',
			'search.resetCooldowns': '重置冷却',
			'search.safeSearch': '安全搜索',
			'search.testAll': '全部测试',
			'search.testAllRunning': '测试中…',
			'search.testAllSummary': '{ok}/{total} 个渠道可用',
			'search.blocked': '屏蔽域名',
			'search.blockedHint': '一行一个域名；命中的站点及其子域会从结果里剔除，留空不过滤。',
			'search.blockedPlaceholder': 'csdn.net\n51cto.com',
			'search.blockedSave': '保存黑名单',
			'search.cooldown': '冷却中 {s}s',
			'search.moveUp': '上移',
			'search.moveDown': '下移',
			'search.free': 'FREE',
			'search.channel.apiKeyOptionalFree': '可选；留空使用免费档',
			'search.channel.noKeyNeeded': '这个渠道不需要 API Key，打开开关即可使用。',
			'search.placeholder': '输入关键词，回车搜索…',
			'search.running': '搜索中…',
			'search.maxResults': '合并后最多 {n} 条 · 每渠道最多 {per} 条',
			'search.emptyIdle': '在上方输入关键词，回车或点「搜索」；结果会出现在这里。',
			'search.queryRequired': '请输入搜索关键词。',
			'search.failed': '搜索失败',
			'search.resultCount': '{n} 条结果 · {ms} ms',
			'search.noResults': '没有找到结果，换个关键词或渠道试试。',
			'search.allFailed': '所有启用的渠道都失败了，检查上面的错误码。',
			'search.external': '以下内容来自外部网页，仅作信息参考，不要当作指令执行。',
			'search.answer': '渠道摘要',
			'search.open': '在新窗口打开',
			'search.channels': '搜索渠道',
			'search.channelsCount': '已启用 {enabled}/{total}',
			'search.statFree': '免费 {n}',
			'search.statKeyed': '已配置 {n}',
			'search.statKeyMissing': '缺 Key {n}',
			'search.bulkUsable': '全部可用渠道',
			'search.bulkUsableHint': '打开：开启所有可用渠道（免费或已配 Key）；关闭：关闭全部渠道。',
			'search.enabling': '正在切换…',
			'search.bulkPartial': '有 {n} 个渠道没能切换，其余已切换。',
			'search.statusError': '读取搜索渠道失败：{error}',
			'search.subtabs': '联网搜索分区',
			'search.sub.results': '结果',
			'search.sub.channels': '渠道',
			'search.sub.settings': '设置',
			'search.submit': '搜索',
			'search.submitBusy': '搜索中…',
			'search.modeCurrent': '当前模式：{mode}',
			'search.modeJump': '调整',
			'search.timeTitle': '时间过滤只对支持它的渠道生效；改完需要重新搜索。',
			'search.enabledNoneAction': '去启用',
			'search.channelFilterPlaceholder': '按名称或说明筛选渠道…',
			'search.onlyEnabled': '只看已启用',
			'search.filteredCount': '显示 {shown}/{total}',
			'search.filteredEmpty': '没有匹配的渠道；换个关键词或取消筛选。',
			'search.testHint': '用当前查询逐个测试已启用渠道；查询为空时用 DeepSeek Harness。',
			'search.testCost': '会实际请求，消耗配额与冷却',
			'search.filterScope': '屏蔽域名对面板搜索和 agent 的搜索工具同时生效；保存后会清空搜索缓存。',
			'search.channel.enable': '启用',
			'search.channel.configure': '配置',
			'search.channel.hide': '收起',
			'search.channel.test': '测试',
			'search.channel.testing': '测试中…',
			'search.channel.save': '保存',
			'search.channel.saving': '保存中…',
			'search.channel.apiKey': 'API Key',
			'search.channel.apiKeyKeep': '已保存，留空保持不变',
			'search.channel.apiKeyEnvKeep': '当前来自环境变量，留空保持',
			'search.channel.apiKeyNew': '输入 API Key',
			'search.channel.apiKeyOptional': '可选；填 user:password 走 Basic Auth',
			'search.channel.baseUrl': '服务地址',
			'search.channel.baseUrlHint': '留空使用默认：{url}；自定义地址会收到该渠道的 API Key。',
			'search.channel.envHint': '也可以用环境变量 {env}',
			'search.channel.clearKey': '清除 Key',
			'search.channel.keyConfigured': '已配置',
			'search.channel.keyEnv': '环境变量',
			'search.channel.keyHost': '宿主凭据',
			'search.channel.apiKeyHostKeep': '当前来自宿主凭据，留空保持',
			'search.channel.keyMissing': '缺 Key',
			'search.channel.apiKeyMulti': '多个 Key 用逗号或换行分隔，额度用尽自动轮换',
			'search.channel.keyless': '无需 Key',
			'search.channel.noCredentials': 'Host 没有凭证服务，只能用环境变量配置 Key。',
			'search.channel.testHint': '测试使用当前查询；为空时用 DeepSeek Harness。',
			'search.channel.testOk': '测试成功：{n} 条 · {ms} ms',
			'search.channel.testFail': '测试失败',
			'search.channel.testQuery': '查询：{query}',
			'search.chipOk': '{label} {n} 条',
			'search.chipFail': '{label} {code}',
			'search.enabledNone': '还没有启用任何搜索渠道，先在「渠道」页打开一个。',
			'search.channel.exa.desc': '语义搜索与 highlights，适合资料和论文；不填 Key 走匿名 MCP。',
			'search.channel.tavily.desc': 'AI 优化搜索，正文摘要密度高；不填 Key 走 keyless 档。',
			'search.channel.firecrawl.desc': '带正文片段的搜索引擎，适合资料聚合；不填 Key 走免 Key 档。',
			'search.channel.parallel.desc': 'Agent 优化的搜索与摘录；不填 Key 走匿名 MCP。',
			'search.channel.brave.desc': '独立搜索索引，优先使用 LLM Context。',
			'search.channel.you.desc': 'AI 搜索，支持 highlights 与新闻结果；不填 Key 走每日免费档。',
			'search.channel.jina.desc': 'Reader 体系里的搜索接口，按 token 计费。',
			'search.channel.keenable.desc': '通用 Web 搜索 API，description 优先；不填 Key 走匿名 MCP。',
			'search.channel.searxng.desc': '自建元搜索；填实例地址即可，无需 API Key（需开启 JSON 输出）。',
			'search.channel.deepseek.desc': 'DeepSeek 原生联网搜索（Messages + web_search，按对话调用计费）。',
			'search.channel.minimax.desc': 'MiniMax Token Plan 网页搜索，单次最多 10 条；默认 global，CN Key 自动回退 api.minimaxi.com。',
			'search.channel.bing.desc': 'Bing 网页搜索，无需 Key；HTML 抓取，可能被反爬限流。',
			'search.channel.ddg.desc': 'DuckDuckGo HTML/Lite，无需 Key；反爬时自动切换 Lite。',
			'search.channel.anysearch.desc': 'AnySearch 匿名搜索，无需 Key；可选 Key 提高额度。',
			'error.banner': '操作失败',
			'tab.preferences': '偏好',
			'preferences.hint': '这里编辑的是 DSH 全局 AGENTS.md 全文：数据存在管理器的数据目录，DSH 读的 AGENTS.md 链接到它；改这里就是改每个会话开始时注入的规则。',
			'preferences.file': '数据文件',
			'preferences.link': 'DSH 读取：{agents}',
			'preferences.mode.link': '已软链到数据文件，改这里等于改 DSH 读到的内容。',
			'preferences.mode.copy': '不能建软链，已退化为两边同步写：数据文件与 DSH 的 AGENTS.md 保持同一份内容。',
			'preferences.unreadable': '偏好文件读取失败，为避免覆盖原文件，保存已禁用；请检查文件权限后刷新。',
			'preferences.dirty': '未保存',
			'preferences.size': '约 {tokens} tok · 字节 {bytes} / {cap}',
			'preferences.reset': '撤销修改',
			'preferences.save': '保存',
			'preferences.saved': '偏好已保存',
			'preferences.loading': '正在读取偏好…',
			'tab.lan': '局域网访问',
			'lan.title': '局域网访问',
			'lan.hint': '打开后，本机会在局域网地址上开一个加密入口。手机或平板扫码即可在浏览器里打开这个 DSH，操作与本机一致。',
			'lan.switch': '启用局域网访问',
			'lan.switchHint': '关闭时端口立即收回，不会再对局域网提供服务。',
			'lan.off': '当前未开启。开启后这里会显示二维码和访问链接。',
			'lan.starting': '正在开启…',
			'lan.running': '已开启',
			'lan.stopped': '已关闭',
			'lan.qr': '扫码打开',
			'lan.qrHint': '用手机相机或浏览器扫码打开；首次访问需要手动信任自签证书。',
			'lan.url': '访问链接',
			'lan.copy': '复制链接',
			'lan.copied': '已复制',
			'lan.address': '局域网地址',
			'lan.upstream': '转发到',
			'lan.certificate': '证书指纹',
			'lan.certificateValid': '证书有效期',
			'lan.tokenWarning': '链接里带着本机的启动令牌，等同于管理员权限，不要分享给别人。关闭开关后链接立即失效。',
			'lan.certWarning': '证书由本机根证书签发，不是公开 CA 签的；手机信任上面那个根证书之后，浏览器就不会再提示不安全。',
			'lan.noAddress': '没有检测到局域网 IPv4 地址，请先连上局域网。',
			'lan.secure': '加密连接（HTTPS）',
			'lan.secureHint': '默认关闭：明文 HTTP，但链接里的令牌就是口令，扫码即用。打开后走 HTTPS，代价是要在手机上装一次根证书，否则浏览器会拒绝该主机的 WebSocket。',
			'lan.trust': '手机信任证书',
			'lan.trustHint': '浏览器可以点"继续访问"打开页面，但 WebSocket 会被直接拒绝，所以要先把根证书装到手机上并信任它。装一次即可，之后扫码即用。',
			'lan.downloadCa': '下载根证书',
			'lan.caDownloaded': '根证书已下载',
			'lan.ios': 'iPhone / iPad：先下载根证书，再用「设置 → 通用 → VPN 与设备管理」安装描述文件，再到「设置 → 通用 → 关于本机 → 证书信任设置」里打开对这个根证书的完全信任。',
			'lan.android': 'Android：先下载根证书，再到「设置 → 安全 → 加密与凭据 → 安装证书 → CA 证书」里选中它。',
			'lan.error': '开启失败',
			'lan.addresses': '检测到的地址',
			'tab.tools': '工具',
			'tab.ui': 'UI 增强',
			'ui.hint': '这些开关决定管理器自带的功能开不开：有的会把功能挂进对话界面，有的只在浏览器里生效。',
			'ui.defaultOn': '默认开启',
			'ui.defaultOff': '默认关闭',
			'ui.missing': '这个插件没有装在当前 profile 里，装好之后这里可以开关。到「插件」页安装或启用。',
			'ui.unavailable': '当前 Host 没有插件管理服务，这个标签不可用。',
			'ui.applying': '正在应用，面板会随 profile 重新加载…',
			'ui.failed': '切换失败：{reason}',
			'ui.clientState': '对话里的界面：{state}（{reason}）',
			'ui.clientMounted': '已挂载',
			'ui.clientNotMounted': '未挂载',
			'ui.featureClient': '客户端：{state}（{reason}）',
			'ui.rowState': '消息动作栏的按钮：{state}（{reason}）',
			'tools.subtabs': '工具分区',
			'tools.note': '管理器每个板块交给 Agent 的工具都在这里，按板块分组，附上工具描述与参数。',
			'tools.group.skills': '技能',
			'tools.group.mcp': 'MCP',
			'tools.group.search': '联网搜索',
			'tools.group.lan': '局域网访问',
			'tools.source.skills': '技能内核',
			'tools.source.search': '联网搜索',
			'tools.params': '参数',
			'tools.required': '必填',
			'tools.noParams': '没有参数',
			'tools.modeOff': '未启用',
			'tools.hint.skills': '技能内核注册的工具。',
			'tools.hint.mcp': '每个已连接的 MCP 服务贡献的工具，名称形如 mcp__<服务>__<工具>。',
			'tools.hint.search': '联网搜索桥注册给 Agent 的检索类工具。',
			'tools.hint.lan': '局域网访问不提供工具，它只把面板开放给同一局域网的其他设备。',
			'tools.empty.skills': '技能内核没有注册工具。',
			'tools.empty.mcp': '还没有 MCP 服务提供工具。',
			'tools.empty.search': '联网搜索没有注册工具。',
			'tools.empty.lan': '局域网访问不提供工具。',
			'tools.empty': '没有可列出的工具。',
			'tools.loading': '正在读取工具目录…',
			'tools.failed': '读取工具目录失败',
		};

		var en = {
			'panel': 'Control Hub',
			'settings.failed': 'The settings entry could not open the Control Hub panel. Reload the page and try again.',
			'subtitle': 'Skill categories, MCP servers, web search, preferences and LAN access',
			'tab.skills': 'Skills',
			'tab.mcp': 'MCP',
			'tab.search': 'Web search',
			'skx.subtabs': 'Skill sections',
			'skx.countsLabel': 'Started',
			'skx.countsOf': '/ {total}',
			'skx.countsHint': 'Skills the agent starts with / skills found (broken ones excluded)',
			'skx.tab.installed': 'Installed',
			'skx.tab.project': 'Project skills',
			'skx.tab.discover': 'Discover',
			'skx.tab.trash': 'Trash',
			'skx.noSources': 'No skill directory was found.',
			'skx.noWorkspaces': 'No workspace is registered yet. Add one in the sidebar first.',
			'skx.workspaceNoSkills': 'This workspace has no skills yet.',
			'skx.workspaceUnavailable': 'Directory unavailable',
			'skx.projectHint': 'Browse project-scoped skills per workspace. Read-only.',
			'skx.search': 'Search every source by name, description or note',
			'skx.searchAction': 'Search',
			'skx.brokenButton': 'Broken',
			'skx.brokenTitle': 'Skills the host will not load',
			'skx.brokenHint': 'These SKILL.md files fail the host requirements, so they are never loaded and cannot be enabled. Fix the file, then use Rescan above.',
			'skx.brokenNone': 'No skill is broken.',
			'skx.diag.frontmatter': 'no frontmatter at the top of the file',
			'skx.diag.nameMissing': 'frontmatter has no name',
			'skx.diag.nameInvalid': 'name is not usable kebab-case (for example my-skill)',
			'skx.diag.description': 'frontmatter has an empty description',
			'skx.diag.invocation': 'disable-model-invocation / user-invocable holds an invalid value',
			'skx.diag.other': 'the kernel gave no reason',
			'skx.toggleSource': 'Turn the whole source on or off',
			'skx.toggleSkill': 'Turn this skill on or off',
			'skx.noSkills': 'This source has no skills yet.',
			'skx.noMatch': 'No matching skills.',
			'skx.sourcesButton': 'Sources',
			'skx.sourcesTitle': 'Skill sources',
			'skx.sourcesHint': 'Turning a source off stops offering its skills to the agent; each skill still has its own switch below.',
			'skx.sourceSkillCount': '{n} skills',
			'skx.sourceOffTip': 'This source is off, so its skills are not offered to the agent',
			'skx.copiesTip': 'The same skill exists in {n} other sources; only the effective one is listed',
			'skx.manualOnly': 'Manual only',
			'skx.manualOnlyTip': 'The model will not call it by itself; it runs when you name it',
			'skx.broken': 'Unparseable',
			'skx.noDescription': 'No description',
			'skx.description': 'Description',
			'skx.tokenDesc': 'description tokens',
			'skx.tokenBody': 'body tokens',
			'skx.descTokensTip': 'The description stays in the system prompt; shown as an estimate',
			'skx.bodyTokensTip': 'The body loads only when the skill is invoked; shown as an estimate',
			'skx.note': 'Custom note',
			'skx.editNote': 'Edit',
			'skx.notePlaceholder': 'Record what this skill does and when to use it…',
			'skx.noNote': 'No note yet. Notes stay in this plugin and never touch SKILL.md.',
			'skx.save': 'Save',
			'skx.body': 'SKILL.md body',
			'skx.copyBody': 'Copy body',
			'skx.copied': 'Copied',
			'skx.path': 'Source file',
			'skx.discoverHint': 'Install skills from the ClawHub chart or a search.',
			'skx.sortDownloads': 'Downloads',
			'skx.sortInstalls': 'Installs',
			'skx.sortStars': 'Stars',
			'skx.backToChart': 'Back to chart',
			'skx.trash': 'Move to trash',
			'skx.trashConfirm': 'Move to trash',
			'skx.confirmTrashTitle': 'Move “{name}” to the trash?',
			'skx.confirmTrashDesc': 'The skill moves from its source into the trash and can be restored to the same place later. The source file is not deleted outright.',
			'skx.deleteUnavailable': 'This source is read-only, so its skills cannot be deleted.',
			'skx.discoverSearch': 'Search skill name or keyword…',
			'skx.discoverEmpty': 'No results yet. Try another keyword or search above.',
			'skx.discoverNone': 'No matching skill was found.',
			'skx.discoverPick': 'Pick a skill to preview its description and body, then install it.',
			'skx.install': 'Install',
			'skx.installTo': 'Install to',
			'skx.installed': 'Installed: {name}',
			'skx.preview': 'Preview',
			'skx.downloads': '{n} downloads',
			'skx.purgeConfirmTitle': 'Delete “{name}” forever?',
			'skx.purgeConfirmDesc': 'This cannot be undone. The skill folder is removed outright.',
			'skx.kernelError': 'The skill kernel is not ready: {detail}',
			'skx.kernelNotWired': 'not wired',
			'skx.kernelDetail': 'mounted={mounted}, routes={routes}, error: {error}',
			'skx.kernelNoError': 'none',
			'skx.trashHint': 'A deleted skill goes to the trash first and can be restored.',
			'skx.trashEmpty': 'The trash is empty.',
			'skx.trashFrom': 'From {root}',
			'skx.restore': 'Restore',
			'skx.purge': 'Delete forever',
			'action.refresh': 'Rescan',
			'action.close': 'Close',
			'action.cancel': 'Cancel',
			'action.edit': 'Edit',
			'action.delete': 'Delete',
			'action.reconnect': 'Reconnect',
			'action.retry': 'Retry',
			'state.loading': 'Loading…',
			'state.saved': 'Saved',
			'state.deleted': 'Deleted',
			'state.refreshed': 'Rescanned',
			'mcp.note': 'Started over stdio; tools reach the agent as mcp__<server>__<tool>. Environment values live in the Host credential store and are never shown here.',
			'mcp.add': 'Add MCP server',
			'mcp.empty': 'No MCP servers yet. Add a local stdio server and its tools join the agent tool list.',
			'mcp.unavailable': 'The Host has no tools service, so MCP tools cannot register.',
			'mcp.noCredentials': 'The Host has no credential service, so environment values cannot be saved; the server still works without them.',
			'mcp.state.connecting': 'Connecting',
			'mcp.state.ready': 'Connected',
			'mcp.state.error': 'Error',
			'mcp.state.stopped': 'Disabled',
			'mcp.toolsCount': '{n} tools',
			'mcp.showTools': 'Show tools',
			'mcp.hideTools': 'Hide tools',
			'mcp.toolsEmpty': 'This server exposes no tools.',
			'mcp.envKeys': 'Environment',
			'mcp.noEnv': 'None',
			'mcp.stderr': 'Recent output',
			'mcp.deleteConfirm': 'Delete now',
			'mcp.form.addTitle': 'Add MCP server',
			'mcp.form.editTitle': 'Edit MCP server',
			'mcp.form.name': 'Server name',
			'mcp.form.nameHint': 'Tool namespace: letters, numbers, underscores or dashes, up to 32.',
			'mcp.form.command': 'Command',
			'mcp.form.commandHint': 'For example npx, uvx, or an absolute path.',
			'mcp.form.args': 'Arguments',
			'mcp.form.argsHint': 'One argument per line, for example -y and the package name.',
			'mcp.form.cwd': 'Working directory',
			'mcp.form.cwdHint': 'Optional; must be absolute.',
			'mcp.form.env': 'Environment',
			'mcp.form.envHint': 'One KEY=VALUE per line.',
			'mcp.form.envSaved': '{n} stored variables: {keys}',
			'mcp.form.envKeep': 'Leave empty to keep them; entries replace the whole set.',
			'mcp.form.clearEnv': 'Clear the stored environment',
			'mcp.form.enabled': 'Start it after saving',
			'mcp.form.invalidEnv': 'Invalid environment lines: use KEY=VALUE with letters, numbers and underscores in the name',
			'mcp.form.required': 'A server name and a command are required',
			'mcp.form.submit': 'Save',
			'search.mode': 'Search mode',
			'search.time': 'Time',
			'search.timeAny': 'Any time',
			'search.timeDay': 'Past day',
			'search.timeWeek': 'Past week',
			'search.timeMonth': 'Past month',
			'search.timeYear': 'Past year',
			'search.modeMerge': 'Merge',
			'search.modeFallback': 'Fallback',
			'search.modeMergeHint': 'Search every enabled channel at once and merge.',
			'search.modeFallbackHint': 'Try channels in order and stop at the first hit.',
			'search.modeAuto': 'Auto route',
			'search.modeAutoHint': 'Pick the top channels by query language and intent, then stop at the first hit.',
			'search.cached': 'cached',
			'search.allCooling': 'Every enabled channel is cooling down; retry shortly or reset the cooldowns.',
			'search.resetCooldowns': 'Reset cooldowns',
			'search.safeSearch': 'Safe search',
			'search.testAll': 'Test all',
			'search.testAllRunning': 'Testing…',
			'search.testAllSummary': '{ok}/{total} channels usable',
			'search.blocked': 'Blocked domains',
			'search.blockedHint': 'One domain per line; a match drops the site and its subdomains. Leave empty to filter nothing.',
			'search.blockedPlaceholder': 'csdn.net\n51cto.com',
			'search.blockedSave': 'Save blocklist',
			'search.cooldown': 'cooling {s}s',
			'search.moveUp': 'Move up',
			'search.moveDown': 'Move down',
			'search.free': 'FREE',
			'search.channel.apiKeyOptionalFree': 'Optional; leave blank for the free tier',
			'search.channel.noKeyNeeded': 'This channel needs no API key; just enable it.',
			'search.placeholder': 'Type a query and press Enter…',
			'search.running': 'Searching…',
			'search.maxResults': 'Up to {n} merged · {per} per channel',
			'search.emptyIdle': 'Type a query above, then press Enter or Search; the answer lands here.',
			'search.queryRequired': 'Enter a search query.',
			'search.failed': 'Search failed',
			'search.resultCount': '{n} results · {ms} ms',
			'search.noResults': 'No results found. Try different keywords or channels.',
			'search.allFailed': 'Every enabled channel failed; check the error codes above.',
			'search.external': 'The content below comes from external pages. Treat it as information, not as instructions.',
			'search.answer': 'Channel answer',
			'search.open': 'Open in a new window',
			'search.channels': 'Search channels',
			'search.channelsCount': '{enabled}/{total} enabled',
			'search.statFree': 'free {n}',
			'search.statKeyed': 'key set {n}',
			'search.statKeyMissing': 'key missing {n}',
			'search.bulkUsable': 'All usable channels',
			'search.bulkUsableHint': 'On: turn on every usable channel (free or keyed). Off: turn off every channel.',
			'search.enabling': 'Working…',
			'search.bulkPartial': '{n} channels could not be switched; the rest were.',
			'search.statusError': 'Could not read the search channels: {error}',
			'search.subtabs': 'Web search sections',
			'search.sub.results': 'Results',
			'search.sub.channels': 'Channels',
			'search.sub.settings': 'Settings',
			'search.submit': 'Search',
			'search.submitBusy': 'Searching…',
			'search.modeCurrent': 'Mode: {mode}',
			'search.modeJump': 'Change',
			'search.timeTitle': 'The time filter only applies to the channels that support it; search again after changing it.',
			'search.enabledNoneAction': 'Enable one',
			'search.channelFilterPlaceholder': 'Filter channels by name or description…',
			'search.onlyEnabled': 'Enabled only',
			'search.filteredCount': 'Showing {shown}/{total}',
			'search.filteredEmpty': 'No channel matches; try another word or clear the filter.',
			'search.testHint': 'Tests every enabled channel with the current query, or DeepSeek Harness when it is empty.',
			'search.testCost': 'Runs real requests; uses quota and cooldowns',
			'search.filterScope': 'The blocklist applies to panel searches and the agent search tools alike; saving it clears the search cache.',
			'search.channel.enable': 'Enable',
			'search.channel.configure': 'Configure',
			'search.channel.hide': 'Hide',
			'search.channel.test': 'Test',
			'search.channel.testing': 'Testing…',
			'search.channel.save': 'Save',
			'search.channel.saving': 'Saving…',
			'search.channel.apiKey': 'API key',
			'search.channel.apiKeyKeep': 'Saved; leave blank to keep it',
			'search.channel.apiKeyEnvKeep': 'Currently from the environment; leave blank to keep it',
			'search.channel.apiKeyNew': 'Enter the API key',
			'search.channel.apiKeyOptional': 'Optional; user:password uses Basic auth',
			'search.channel.baseUrl': 'Base URL',
			'search.channel.baseUrlHint': 'Leave blank for the default: {url}; a custom address receives this channel\'s API key.',
			'search.channel.envHint': 'The {env} environment variable also works',
			'search.channel.clearKey': 'Clear key',
			'search.channel.keyConfigured': 'Configured',
			'search.channel.keyEnv': 'Environment',
			'search.channel.keyHost': 'Host credentials',
			'search.channel.apiKeyHostKeep': 'Currently from Host credentials; leave blank to keep it',
			'search.channel.keyMissing': 'Key missing',
			'search.channel.apiKeyMulti': 'Separate keys with commas or new lines; a spent key rotates to the next',
			'search.channel.keyless': 'No key needed',
			'search.channel.noCredentials': 'This Host has no credential service; configure the key through its environment variable.',
			'search.channel.testHint': 'Tests with the current query, or DeepSeek Harness when the box is empty.',
			'search.channel.testOk': 'Test passed: {n} results · {ms} ms',
			'search.channel.testFail': 'Test failed',
			'search.channel.testQuery': 'Test query: {query}',
			'search.chipOk': '{label} {n}',
			'search.chipFail': '{label} {code}',
			'search.enabledNone': 'No search channel is enabled yet; turn one on under Channels.',
			'search.channel.exa.desc': 'Semantic search with highlights; good for papers and references. Leave the key blank for anonymous MCP.',
			'search.channel.tavily.desc': 'AI-optimized search with dense page summaries. Leave the key blank for the keyless tier.',
			'search.channel.firecrawl.desc': 'Search with page excerpts; good for gathering references. Leave the key blank for the free tier.',
			'search.channel.parallel.desc': 'Agent-optimized search and excerpts. Leave the key blank for anonymous MCP.',
			'search.channel.brave.desc': 'Independent index; uses LLM Context when available.',
			'search.channel.you.desc': 'AI search with highlights and news results. Leave the key blank for the daily free tier.',
			'search.channel.jina.desc': 'Search API from the Reader family, billed by tokens.',
			'search.channel.keenable.desc': 'General web search API with description-first snippets. Leave the key blank for anonymous MCP.',
			'search.channel.searxng.desc': 'Self-hosted metasearch; point it at an instance, no API key needed (JSON output must be enabled).',
			'search.channel.deepseek.desc': 'DeepSeek native web search (Messages + web_search; billed as a model call).',
			'search.channel.minimax.desc': 'MiniMax Token Plan web search, up to 10 results; global by default, CN keys fall back to api.minimaxi.com.',
			'search.channel.bing.desc': 'Bing HTML search, no key required; may hit anti-bot limits.',
			'search.channel.ddg.desc': 'DuckDuckGo HTML/Lite, no key required; falls back to Lite when challenged.',
			'search.channel.anysearch.desc': 'Anonymous AnySearch; no key required, an optional key raises limits.',
			'error.banner': 'Action failed',
			'tab.preferences': 'Preferences',
			'preferences.hint': 'This edits the whole DSH global AGENTS.md. The data lives in the manager data directory and the AGENTS.md DSH reads links to it, so changes here are what every session is injected with.',
			'preferences.file': 'Data file',
			'preferences.link': 'Read by DSH: {agents}',
			'preferences.mode.link': 'It is symlinked to the data file, so editing here edits what DSH reads.',
			'preferences.mode.copy': 'Symlinks are unavailable, so the data file and the DSH AGENTS.md are kept in sync as two copies.',
			'preferences.unreadable': 'The preferences file could not be read. Saving is disabled so the original is not overwritten; check the file permissions and refresh.',
			'preferences.dirty': 'unsaved',
			'preferences.size': '≈ {tokens} tok · {bytes} / {cap} bytes',
			'preferences.reset': 'Discard changes',
			'preferences.save': 'Save',
			'preferences.saved': 'Preferences saved',
			'preferences.loading': 'Reading preferences…',
			'tab.lan': 'LAN access',
			'lan.title': 'LAN access',
			'lan.hint': 'When on, this machine opens an encrypted door on its LAN address. A phone or tablet can scan the code and open this Harness in a browser with the same powers.',
			'lan.switch': 'Enable LAN access',
			'lan.switchHint': 'Turning it off closes the port at once and the LAN sees nothing.',
			'lan.off': 'Currently off. Turn it on and the code and the link appear here.',
			'lan.starting': 'Starting…',
			'lan.running': 'On',
			'lan.stopped': 'Off',
			'lan.qr': 'Scan to open',
			'lan.qrHint': 'Scan with a phone camera or browser; the first visit asks you to trust the self-signed certificate.',
			'lan.url': 'Access link',
			'lan.copy': 'Copy link',
			'lan.copied': 'Copied',
			'lan.address': 'LAN address',
			'lan.upstream': 'Forwarded to',
			'lan.certificate': 'Certificate fingerprint',
			'lan.certificateValid': 'Certificate validity',
			'lan.tokenWarning': 'The link carries this machine\'s launch token and therefore administrator rights. Do not share it; turning the switch off invalidates it.',
			'lan.certWarning': 'The certificate is signed by the local root certificate, not by a public authority; once the phone trusts that root, the browser stops calling the page unsafe.',
			'lan.noAddress': 'No LAN IPv4 address was found; connect to a network first.',
			'lan.secure': 'Encrypted connection (HTTPS)',
			'lan.secureHint': 'Off by default: plain HTTP, with the token in the link acting as the password, so scanning is enough. Turning it on uses HTTPS, at the price of installing a root certificate on the phone once, because a browser refuses the WebSocket of an untrusted host.',
			'lan.trust': 'Trust the certificate on the phone',
			'lan.trustHint': 'A browser can let the page through its warning, but it refuses the WebSocket outright, so the root certificate has to be installed and trusted on the phone. Once, and scanning works.',
			'lan.downloadCa': 'Download root certificate',
			'lan.caDownloaded': 'Root certificate downloaded',
			'lan.ios': 'iPhone / iPad: download the root certificate, install the profile from Settings → General → VPN & Device Management, then enable full trust for it under Settings → General → About → Certificate Trust Settings.',
			'lan.android': 'Android: download the root certificate, then pick it under Settings → Security → Encryption & credentials → Install a certificate → CA certificate.',
			'lan.error': 'Could not start',
			'lan.addresses': 'Detected addresses',
			'tab.tools': 'Tools',
			'tab.ui': 'UI enhancements',
			'ui.hint': 'These switches drive plugin bundles in the profile; what a feature does is exactly what that plugin does.',
			'ui.defaultOn': 'On by default',
			'ui.defaultOff': 'Off by default',
			'ui.missing': 'This plugin is not in the current profile; install or enable it and its switch appears here.',
			'ui.unavailable': 'This Host has no plugin manager service, so the tab is unavailable.',
			'ui.applying': 'Applying; the panel reloads with the profile…',
			'ui.failed': 'Could not switch it: {reason}',
			'ui.clientState': 'In-conversation surface: {state} ({reason})',
			'ui.clientMounted': 'mounted',
			'ui.clientNotMounted': 'not mounted',
			'ui.featureClient': 'Browser half: {state} ({reason})',
			'ui.rowState': 'Button in the message action row: {state} ({reason})',
			'tools.subtabs': 'Tool sections',
			'tools.note': 'Every tool the manager hands to the agent is listed here, grouped by the section that owns it, with its description and parameters.',
			'tools.group.skills': 'Skills',
			'tools.group.mcp': 'MCP',
			'tools.group.search': 'Web search',
			'tools.group.lan': 'LAN access',
			'tools.source.skills': 'Skill kernel',
			'tools.source.search': 'Web search',
			'tools.params': 'Parameters',
			'tools.required': 'required',
			'tools.noParams': 'No parameters',
			'tools.modeOff': 'not enabled',
			'tools.hint.skills': 'The tools the skill kernel registers.',
			'tools.hint.mcp': 'What every connected MCP server contributes; the names look like mcp__<server>__<tool>.',
			'tools.hint.search': 'The retrieval tools the search bridge registers for the agent.',
			'tools.hint.lan': 'LAN access provides no tools; it only opens the panel to other devices on the same network.',
			'tools.empty.skills': 'The skill kernel registered no tools.',
			'tools.empty.mcp': 'No MCP server provides tools yet.',
			'tools.empty.search': 'The search bridge registered no tools.',
			'tools.empty.lan': 'LAN access provides no tools.',
			'tools.empty': 'No tools to list.',
			'tools.loading': 'Reading the tool catalog…',
			'tools.failed': 'Could not read the tool catalog',
		};

		//#endregion

		//#region styles

		var css = [
			'.mgrRoot{position:relative;height:100%;display:flex;flex-direction:column;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;caret-color:var(--dsw-alias-state-business-primary)}',
			'.mgrRoot::selection,.mgrRoot ::selection{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 28%,transparent);color:var(--dsw-alias-label-primary)}',
			'.mgrRoot input[type=checkbox]{accent-color:var(--dsw-alias-state-business-primary)}',
			'.mgrHead{display:flex;align-items:flex-start;gap:16px;padding:24px max(28px,calc((100% - 1120px)/2)) 0;flex:none}',
			'.mgrHeadMain{flex:1;min-width:0}',
			'.mgrTitle{margin:0;font-size:18px;font-weight:600;line-height:26px;letter-spacing:-.01em}',
			'.mgrVersion{margin-left:8px;font-size:11.5px;font-weight:500;letter-spacing:0;color:var(--dsw-alias-label-secondary);vertical-align:2px}',
			'.mgrSubtitle{margin-top:3px;font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
			'.mgrHeadActions{display:flex;align-items:center;gap:8px;flex:none;padding-top:3px}',
			'.mgrTabs{display:flex;gap:4px;padding:16px max(28px,calc((100% - 1120px)/2)) 0;flex:none;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 16px),transparent);mask-image:linear-gradient(to right,#000 calc(100% - 16px),transparent)}',
			'.mgrTabs .mgrTab:last-child{margin-right:12px}',
			'.mgrTabs::-webkit-scrollbar{display:none}',
			'.mgrTab{display:inline-flex;align-items:center;gap:6px;flex:none;height:30px;padding:0 12px;border:1px solid transparent;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;white-space:nowrap;cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease}',
			'.mgrTab:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
			'.mgrTab:active{background:var(--dsw-alias-interactive-bg-active)}',
			'.mgrTab:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}',
			'.mgrTabActive{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary);font-weight:500;border-color:transparent}',
			'.mgrTabCount{font-size:11.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
			/* The active tab already carries a 10% tint; secondary text on it lands at 5.21,
			   so the count follows the active label colour instead of opening a second tier. */
			'.mgrTabActive .mgrTabCount{color:inherit}',
			'.mgrBody{flex:1;min-height:0;overflow:auto;padding:16px max(28px,calc((100% - 1120px)/2)) 24px;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-scrollbar-bg-l2) transparent}',
			'.mgrBody::-webkit-scrollbar{width:10px;height:10px}',
			'.mgrBody::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l2);border:3px solid transparent;border-radius:6px;background-clip:content-box}',
			'.mgrToolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}',
			'.mgrToolbarSpacer{flex:1}',
			'.mgrHint{font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.55;max-width:640px}',
			'.mgrBtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer;transition:background .15s ease,border-color .15s ease}',
			'.mgrBtn:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}',
			'.mgrBtn:active{background:var(--dsw-alias-interactive-bg-active)}',
			'.mgrBtn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}',
			'.mgrBtn[disabled]{opacity:.5;cursor:default}',
			'.mgrBtnPrimary{background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-foreground)}',
			'.mgrBtnPrimary:hover{background:var(--dsw-alias-state-business-primary);filter:brightness(1.05)}',
			'.mgrBtnPrimary:active{background:var(--dsw-alias-state-business-primary);filter:brightness(.95)}',
			'.mgrBtnDanger{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-state-error-primary)}',
			'.mgrBtnDanger:hover{border-color:var(--dsw-alias-state-error-primary);background:transparent}',
			'.mgrBtnDanger:active{background:transparent;border-color:var(--dsw-alias-state-error-primary)}',
			'.mgrIconBtn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:1px solid transparent;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:16px;line-height:1;cursor:pointer}',
			'.mgrIconBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
			'.mgrIconBtn:active{background:var(--dsw-alias-interactive-bg-active)}',
			'.mgrInput,.mgrTextarea,.mgrSelect{width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;line-height:1.5}',
			'.mgrInput{height:30px}',
			'.mgrInput:focus,.mgrTextarea:focus,.mgrSelect:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}',
			'.mgrTextarea{min-height:76px;resize:vertical}',
			'.mgrToolbar .mgrInput{width:240px;flex:none}',
			'.mgrField{display:flex;flex-direction:column;gap:4px;margin-bottom:12px}',
			'.mgrLabel{font-size:12.5px;font-weight:500;color:var(--dsw-alias-label-secondary)}',
			'.mgrFieldHint{font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.55}',
			'.mgrStats{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:12px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}',
			'.mgrStats b{font-weight:600;color:var(--dsw-alias-label-secondary)}',
			'.mgrCatalog{margin:-4px 0 12px}',
			'.mgrRootPath{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;color:var(--dsw-alias-label-secondary)}',
			'.mgrWarn{display:flex;align-items:flex-start;gap:8px;padding:9px 12px;margin-bottom:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 8%,var(--dsw-alias-bg-layer-1));font-size:13px;color:var(--dsw-alias-label-secondary);line-height:1.6}',
			'.mgrErrorBox{display:flex;align-items:flex-start;gap:8px;padding:9px 12px;margin-bottom:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,var(--dsw-alias-bg-layer-1));font-size:13px;color:var(--dsw-alias-label-primary);line-height:1.6;word-break:break-word}',
			'.mgrCat{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);margin-bottom:10px;overflow:hidden}',
			'.mgrCatHead{display:flex;align-items:center;gap:8px;padding:9px 12px;min-height:40px;box-sizing:border-box}',
			'.mgrCatHead:hover{background:var(--dsw-alias-bg-layer-2)}',
			'.mgrChevron{flex:none;width:20px;height:20px;padding:0;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1;cursor:pointer}',
			'.mgrChevron:hover{color:var(--dsw-alias-label-primary)}',
			'.mgrCatName{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
			'.mgrCount{flex:none;font-size:11.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
			'.mgrSpacer{flex:1}',
			'.mgrCatBody{border-top:1px solid var(--dsw-alias-border-l2)}',
			'.mgrSkill{display:flex;align-items:center;gap:10px;padding:9px 12px;border-top:1px solid var(--dsw-alias-border-l1);cursor:pointer;transition:background .15s ease}',
			'.mgrSkill:first-child{border-top:none}',
			'.mgrSkill:hover{background:var(--dsw-alias-bg-layer-2)}',
			'.mgrSkill:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}',
			'.mgrSkillMain{flex:1;min-width:0}',
			'.mgrSkillName{display:flex;align-items:center;gap:6px;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:13px;color:var(--dsw-alias-label-primary)}',
			'.mgrSkillDesc{margin-top:2px;font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}',
			'.mgrBadge{display:inline-flex;align-items:center;flex:none;padding:0 6px;border-radius:99px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);font-size:10.5px;font-weight:500;line-height:1.7;letter-spacing:0;white-space:nowrap}',
			'.mgrBadgeOk{background:var(--dsw-alias-state-success-tertiary);color:var(--dsw-alias-label-primary)}',
			'.mgrBadgeWarn{background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-label-primary)}',
			'.mgrBadgeError{color:var(--dsw-alias-state-error-primary)}',
			'.mgrBadgeFree{background:transparent;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}',
			'.mgrSwitch{position:relative;flex:none;width:34px;height:20px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:99px;background:var(--dsw-alias-bg-layer-3);cursor:pointer;transition:background .15s ease,border-color .15s ease}',
			'.mgrSwitch:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
			/* Pressed feedback is tone-only: a transform here would fight the
			   knob translateX and make the switch jump. */
			'.mgrSwitch:active{filter:brightness(.97)}',
			'.mgrSwitchOn{background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}',
			/* Off state only: the idling track plus a hairline ring, so the off switch
			   reads on both themes. `.mgrSwitchOn` keeps its own paint untouched. */
			'.mgrSwitch:not(.mgrSwitchOn){background:var(--dsw-alias-state-idle-primary);box-shadow:var(--dsw-elevation-soft,0 1px 2px rgba(0,0,0,.18)),0 0 0 1px var(--dsw-alias-border-l2)}',
			'.mgrSwitch:not(.mgrSwitchOn) .mgrSwitchKnob{background:var(--dsw-alias-bg-base)}',
			'.mgrSwitch:disabled{opacity:.65;cursor:default}',
			'.mgrSwitchKnob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground);box-shadow:var(--dsw-elevation-soft);transition:transform .15s ease}',
			'.mgrSwitchOn .mgrSwitchKnob{transform:translateX(14px)}',
			'.mgrServer{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);padding:12px 14px;margin-bottom:10px}',
			'.mgrServer:hover{border-color:var(--dsw-alias-border-l3)}',
			'.mgrServerHead{display:flex;align-items:center;gap:8px}',
			'.mgrServerName{font-size:13px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.mgrDot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}',
			'.mgrDot-ready{background:var(--dsw-alias-state-success-primary)}',
			'.mgrDot-connecting{background:var(--dsw-alias-state-warn-primary)}',
			'.mgrDot-error{background:var(--dsw-alias-state-error-primary)}',
			'.mgrCommand{margin-top:6px;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;color:var(--dsw-alias-label-secondary);word-break:break-all}',
			'.mgrMeta{margin-top:4px;font-size:11.5px;color:var(--dsw-alias-label-secondary);word-break:break-word}',
			'.mgrServerError{margin-top:6px;padding:4px 8px;border-radius:var(--dsw-radius-md);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,var(--dsw-alias-bg-layer-1));font-size:11.5px;color:var(--dsw-alias-label-primary);line-height:1.5;word-break:break-word}',
			'.mgrServerActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1)}',
			'.mgrToolList{margin-top:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);padding:6px 10px}',
			'.mgrToolRow{padding:5px 0;border-top:1px solid var(--dsw-alias-border-l1)}',
			'.mgrToolRow:first-child{border-top:none}',
			'.mgrToolName{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;color:var(--dsw-alias-label-primary);word-break:break-all}',
			'.mgrToolDesc{margin-top:1px;font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.5;word-break:break-word}',
			'.mgrUiFeature{display:flex;align-items:flex-start;gap:14px;padding:12px 0;border-top:1px solid var(--dsw-alias-border-l1)}',
			'.mgrUiFeature:first-child{border-top:none;padding-top:2px}',
			'.mgrUiFeatureMain{flex:1;min-width:0}',
			'.mgrUiFeatureTitle{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}',
			'.mgrUiFeatureDesc{margin-top:4px;font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.6}',
			'.mgrToolCard{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);padding:12px 14px;margin-bottom:10px}',
			'.mgrToolCardHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
			'.mgrToolCardName{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);word-break:break-all}',
			'.mgrToolCardDesc{margin-top:6px;font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.6;word-break:break-word}',
			'.mgrToolParams{margin-top:10px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1)}',
			'.mgrToolParamsHead{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary);margin-bottom:6px}',
			'.mgrToolParam{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;padding:3px 0}',
			'.mgrToolParamName{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;color:var(--dsw-alias-label-primary)}',
			'.mgrToolParamType{flex:none;padding:0 6px;border-radius:99px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:1.7}',
			'.mgrToolParamReq{flex:none;font-size:10.5px;font-weight:500;color:var(--dsw-alias-label-secondary)}',
			'.mgrToolParamDesc{flex:1;min-width:0;font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.5;word-break:break-word}',
			'.mgrCode{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;color:var(--dsw-alias-label-secondary);word-break:break-all}',
			'.mgrPrefsText{min-height:320px;max-width:720px;resize:vertical;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;line-height:18px}',
			'.mgrPrefsPath{display:flex;align-items:center;gap:8px;margin-bottom:10px}',
			'.mgrPre{white-space:pre-wrap;word-break:break-word;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;line-height:1.65;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:10px 12px;margin:0;max-height:320px;overflow:auto}',
			'.mgrEmpty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:44px 16px;text-align:center;color:var(--dsw-alias-label-secondary);line-height:1.7}',
			'.mgrLoading{display:flex;align-items:center;justify-content:center;gap:10px;padding:36px 0;color:var(--dsw-alias-label-secondary)}',
			'.mgrSpinner{width:13px;height:13px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-state-business-primary);border-radius:50%;animation:mgrSpin .8s linear infinite}',
			'@keyframes mgrSpin{to{transform:rotate(360deg)}}',
			'@media (prefers-reduced-motion:reduce){.mgrSpinner{animation:none}}',
			'.mgrModalBackdrop{position:absolute;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent)}',
			'.mgrModal{display:flex;flex-direction:column;width:min(680px,100%);max-height:min(82vh,760px);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-overlay);box-shadow:var(--dsw-elevation-soft);overflow:hidden}',
			'.mgrModalHead{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l2);flex:none}',
			'.mgrModalTitle{margin:0;font-size:14px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.mgrModalBody{flex:1;min-height:0;overflow:auto;padding:16px}',
			'.mgrModalFoot{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--dsw-alias-border-l2);flex:none}',
			'.mgrFormError{margin:0 0 10px;padding:6px 8px;border-radius:var(--dsw-radius-md);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}',
			'.mgrDetailRow{display:flex;gap:12px;padding:5px 0;font-size:13px;line-height:1.6}',
			'.mgrDetailKey{flex:none;width:76px;color:var(--dsw-alias-label-secondary)}',
			'.mgrDetailValue{flex:1;min-width:0;color:var(--dsw-alias-label-secondary);word-break:break-word}',
			'.mgrToast{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:10px;max-width:min(620px,84%);padding:9px 11px 9px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-soft);font-size:12.5px;line-height:1.5;color:var(--dsw-alias-label-primary)}',
			'.mgrToastError{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-state-error-primary)}',
			'.mgrToastText{white-space:pre-wrap;word-break:break-word}',
			'.mgrToastClose{flex:none;border:0;background:transparent;color:inherit;cursor:pointer;font-size:16px;line-height:1;padding:0 2px}',
			'.mgrLanCard{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);padding:14px 16px;margin-bottom:12px}',
			'.mgrLanRow{display:flex;align-items:center;gap:14px}',
			'.mgrLanRowMain{flex:1;min-width:0}',
			'.mgrLanTitle{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}',
			'.mgrLanHint{margin-top:3px;font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.6}',
			'.mgrLanGrid{display:flex;gap:20px;flex-wrap:wrap;margin-top:14px}',
			'.mgrQrBox{flex:none;display:flex;flex-direction:column;align-items:center;gap:8px}',
			'.mgrQr{width:184px;height:184px;padding:10px;background:#fff;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md)}',
			'.mgrQrCaption{font-size:11.5px;color:var(--dsw-alias-label-secondary)}',
			'.mgrLanMain{flex:1;min-width:260px}',
			'.mgrLanUrl{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);padding:8px 10px;word-break:break-all;line-height:1.6}',
			'.mgrLanMeta{margin-top:12px;display:flex;flex-direction:column;gap:6px}',
			'.mgrLanMetaRow{display:flex;gap:12px;font-size:11.5px;line-height:1.6}',
			'.mgrLanMetaKey{flex:none;width:96px;color:var(--dsw-alias-label-secondary)}',
			'.mgrLanMetaValue{flex:1;min-width:0;color:var(--dsw-alias-label-secondary);word-break:break-all}',
			'.mgrLanActions{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap}',
			'.mgrLanRowSub{margin-top:12px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}',
			'.mgrLanTrust{margin-top:14px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}',
			'.mgrLanSteps{margin-top:6px;line-height:1.7}',
			'.mgrSearchControls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0 12px}',
			'.mgrSearchControls .mgrHint{flex:1;min-width:180px}',
			'.mgrSearchTimeWrap{display:flex;align-items:center;gap:5px}',
			'.mgrSearchTime{width:auto;min-width:96px;height:30px;padding:2px 6px;font-size:11.5px}',
			'.mgrSearchSafeWrap{display:flex;align-items:center;gap:5px}',
			'.mgrSearchBlocked{margin:0 0 14px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1)}',
			'.mgrSearchBlockedHead{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:6px}',
			'.mgrSearchBlockedInput{width:100%;min-height:54px;resize:vertical;font-family:inherit;font-size:12.5px;line-height:1.55}',
			'.mgrSearchBlockedFoot{display:flex;justify-content:flex-end;margin-top:8px}',
			'.mgrSearchOrder{display:flex;align-items:center;gap:4px}',
			'.mgrSearchBar{display:flex;align-items:center;gap:8px;margin-bottom:12px}',
			'.mgrSearchBar .mgrInput{flex:1;width:auto;min-width:0;max-width:480px;height:30px;font-size:12.5px}',
			'.mgrSearchGo{flex:none;height:30px;padding:0 16px}',
			'.mgrSearchMeta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}',
			'.mgrSearchMeta .mgrHint{max-width:none}',
			'.mgrSubMetaGroup{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}',
			'.mgrLinkBtn{flex:none;padding:0;border:0;background:transparent;color:var(--dsw-alias-state-business-primary);font:inherit;font-size:11.5px;text-decoration:underline;text-underline-offset:3px;cursor:pointer}',
			'.mgrLinkBtn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
			/* Text action: a secondary command that must not add a fourth framed
			   button to a screen. The cost hint sits on its own line underneath. */
			'.mgrTextAction{flex:none;display:inline-flex;align-items:center;height:26px;padding:0 4px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;line-height:1.5;cursor:pointer;text-decoration:underline;text-underline-offset:3px}',
			'.mgrTextAction:hover{color:var(--dsw-alias-label-primary)}',
			'.mgrTextAction:active{color:var(--dsw-alias-label-primary);text-decoration-thickness:2px}',
			'.mgrTextAction[disabled]{opacity:.5;cursor:default;text-decoration:none}',
			'.mgrTextAction:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
			'.mgrSubTabsBar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 4px}',
			'.mgrSubTabs{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin:0}',
			/* The grow belongs to the row layout, not to the strip: the skills page puts
			   the same class into a column flex, where flex:1 would stretch its height. */
			'.mgrSubTabsBar > .mgrSubTabs{flex:1 1 auto;min-width:0}',
			'.mgrSubTabs .mgrTab{height:26px;padding:0 10px;border:0;border-radius:0;background:transparent;box-shadow:none;font-size:12px;border-bottom:2px solid transparent}',
			'.mgrSubTabs .mgrTab:hover:not(.mgrTabActive){background:transparent;color:var(--dsw-alias-label-primary);border-bottom-color:transparent}',
			'.mgrSubTabs .mgrTab:active:not(.mgrTabActive){background:transparent}',
			'.mgrSubTabs .mgrTabActive{background:transparent;border:0;border-bottom:2px solid var(--dsw-alias-state-business-primary);border-radius:0;color:var(--dsw-alias-label-primary);font-weight:500}',
			'.mgrSubTabs .mgrTabCount{font-size:10.5px}',
			'.mgrSubActions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-left:auto}',
			'.mgrSubHint{margin:0 0 8px;text-align:right}',
			'.mgrSearchCard{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:12px 14px;margin-bottom:12px}',
			'.mgrSearchCardHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
			'.mgrSearchCardTitle{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}',
			'.mgrSearchCard .mgrSearchControls{margin:9px 0 0}',
			'.mgrSearchChannelFilter{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 8px}',
			'.mgrSearchChannelFilter .mgrInput{flex:1;min-width:180px;max-width:320px;height:30px;font-size:12.5px}',
			/* The bulk switch keeps its own line when the filter bar runs out of
			   room: the label stays on one line instead of being clipped, and the
			   switch keeps the size the channel rows use. */
			'.mgrSearchBulk{display:flex;align-items:center;gap:6px;flex-wrap:nowrap;min-width:0;margin-left:auto}',
			'.mgrSearchBulk .mgrHint{max-width:none;white-space:nowrap}',
			'.mgrSearchBulk .mgrSwitch{flex:0 0 auto}',
			'.mgrSearchFilterCount{margin-bottom:8px}',
			'.mgrSearchResults{margin-bottom:18px}',
			'.mgrSearchList{display:flex;flex-direction:column;gap:10px}',
			'.mgrSearchChannels{margin-top:12px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1)}',
			'.mgrSearchChannelsHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}',
			'.mgrSearchChannelsTitle{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}',
			'.mgrSearchChannelStats{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0}',
			'.mgrSearchStatWarn{color:var(--dsw-alias-label-secondary)}',
			'.mgrSearchStatLead{font-weight:600}',
			'.mgrSearchChannel{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);margin-bottom:8px;overflow:hidden}',
			'.mgrSearchChannelHead{display:flex;align-items:flex-start;gap:0;flex-wrap:wrap;padding:12px 14px}',
			'.mgrSearchChannelMain{flex:1 1 100%;min-width:0}',
			'.mgrSearchChannelNameRow{display:flex;align-items:center;gap:8px}',
			'.mgrSearchChannelName{flex:1 1 auto;min-width:64px;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
			/* State first: an off row recedes before the switch is even read. */
			'.mgrSearchChannelOff .mgrSearchChannelName{color:var(--dsw-alias-label-secondary)}',
			'.mgrSearchChannelDesc{margin-top:4px;font-size:11.5px;line-height:1.55;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:35.6px}',
			'.mgrSearchChannelBadges{display:flex;align-items:center;gap:4px;flex-wrap:wrap;flex:0 1 auto;min-width:0}',
			'.mgrSearchChannelActions{display:flex;align-items:center;gap:8px;flex:1 1 100%;flex-wrap:wrap;justify-content:flex-end;margin-top:8px}',
			/* Secondary row actions carry no frame until pointed at, so the list
			   reads as rows instead of a column of outlined buttons. */
			'.mgrSearchChannelActions .mgrBtn{height:30px;padding:0 8px;border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}',
			'.mgrSearchChannelActions .mgrBtn:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:transparent;color:var(--dsw-alias-label-primary)}',
			'.mgrSearchChannelActions .mgrBtn:active{background:var(--dsw-alias-interactive-bg-active);border-color:transparent}',
			'.mgrSearchChannelBody{padding:12px 14px;border-top:1px solid var(--dsw-alias-border-l1)}',
			'.mgrSearchChannelGrid{display:flex;gap:12px;flex-wrap:wrap}',
			'.mgrSearchChannelField{flex:1;min-width:220px;margin-bottom:0}',
			'.mgrSearchChannelFoot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}',
			'.mgrSearchChannelResult{padding:0 14px 12px}',
			'.mgrSearchTest{margin-top:10px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-left:3px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);font-size:11.5px;line-height:1.6}',
			'.mgrSearchTestOk{border-left-color:var(--dsw-alias-state-success-primary)}',
			'.mgrSearchTestError{border-left-color:var(--dsw-alias-state-error-primary)}',
			'.mgrSearchTestTitle{font-weight:600;color:var(--dsw-alias-label-secondary)}',
			'.mgrSearchTestItem{margin-top:3px;color:var(--dsw-alias-label-secondary);word-break:break-word}',
			'.mgrSearchChips{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin:8px 0 12px}',
			'.mgrSearchChip{display:inline-flex;align-items:center;padding:1px 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:10.5px;color:var(--dsw-alias-label-secondary)}',
			'.mgrSearchChipError{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-state-error-primary)}',
			'.mgrSearchChannelTag{flex:none;max-width:30%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;color:var(--dsw-alias-label-secondary)}',
			'.mgrSearchSummary{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
			'.mgrSearchResult{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);padding:11px 13px;transition:border-color .15s ease}',
			'.mgrSearchResult:hover{border-color:var(--dsw-alias-border-l3)}',
			'.mgrSearchResultHead{display:flex;align-items:baseline;gap:8px;min-width:0}',
			'.mgrSearchRank{flex:none;font-size:11.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;min-width:14px}',
			'.mgrSearchLink{flex:1;min-width:0;font-size:13px;font-weight:600;color:var(--dsw-alias-state-business-primary);text-decoration:none;word-break:break-word}',
			'.mgrSearchLink:hover{text-decoration:underline}',
			'.mgrSearchHost{flex:none;max-width:38%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:10.5px;color:var(--dsw-alias-label-secondary)}',
			'.mgrSearchSnippet{margin-top:4px;font-size:13px;line-height:1.65;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}',
			'.mgrSearchDate{margin-top:4px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}',
			'.mgrSearchAnswer{margin-bottom:14px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-left:3px solid var(--dsw-alias-state-business-primary);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1)}',
			'.mgrSearchAnswerTitle{margin-bottom:4px;font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
			'.mgrSearchAnswerBody{max-height:220px;overflow:auto;font-size:13px;line-height:1.65;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}',

			/* ---- skill workspace: GitHub-flavoured, larger type ---------- */
			'.skxRoot{--skx-line:var(--dsw-alias-border-l2);--skx-line-soft:var(--dsw-alias-border-l1);--skx-canvas:var(--dsw-alias-bg-base);--skx-surface:var(--dsw-alias-bg-layer-1);--skx-raised:var(--dsw-alias-bg-layer-2);--skx-fg:var(--dsw-alias-label-primary);--skx-fg-muted:var(--dsw-alias-label-secondary);--skx-fg-subtle:var(--dsw-alias-label-secondary);--skx-accent:var(--dsw-alias-state-business-primary);--skx-accent-soft:color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent);--skx-green:var(--dsw-alias-state-success-primary);--skx-red:var(--dsw-alias-state-error-primary);--skx-amber:var(--dsw-alias-state-warn-primary);--skx-shadow:var(--dsw-shadow-lv2);--skx-shadow-sm:var(--dsw-shadow-lv1);display:flex;flex-direction:column;gap:14px;height:100%;min-height:0;color:var(--skx-fg);font-size:13px;line-height:1.6;font-family:var(--dsw-font-family);-webkit-font-smoothing:antialiased}',
			'.skxSubTabs{margin:0}',
			'.skxSourceCount{font-size:12px;color:var(--skx-fg-subtle);flex:none}',
			'.skxMain{display:flex;flex-direction:column;flex:1;min-height:0;border:1px solid var(--skx-line);border-radius:var(--dsw-radius-lg);background:var(--skx-surface);box-shadow:var(--skx-shadow);overflow:hidden}',
			'.skxSubViews{display:flex;flex-direction:column;flex:1;min-height:0}',
			'.skxSubView{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}',
			'.skxPage{display:flex;flex-direction:column;height:100%;min-height:0}',
			'.skxToolbarTop{border-bottom:1px solid var(--skx-line-soft);padding:12px 16px}',
			'.skxToolbarTop .skxInput{flex:1;min-width:220px;max-width:400px}',
			'.skxTabCount{font-size:11px;color:var(--skx-fg-subtle);font-variant-numeric:tabular-nums}',
			'.skxStatBadge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border:1px solid color-mix(in srgb,var(--skx-accent) 38%,transparent);border-radius:999px;background:var(--skx-accent-soft);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}',
			'.skxStatLabel{font-size:11.5px;color:var(--skx-fg)}',
			'.skxStatOn{font-size:13px;font-weight:600;color:var(--skx-fg);line-height:1}',
			'.skxStatOf{font-size:11.5px;color:var(--skx-fg)}',
			'.skxSourcesHint{margin:0 0 10px}',
			'.skxSplit{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);flex:1;height:auto;min-height:0}',
			'.skxSingle{display:flex;flex-direction:column;height:100%;min-height:0}',
			'.skxSingle .skxListCol{border-right:none}',
			'.skxListCol{display:flex;flex-direction:column;min-height:0;overflow-y:auto;border-right:1px solid var(--skx-line)}',
			'.skxDetailCol{display:flex;flex-direction:column;min-height:0;overflow-y:auto;background:var(--skx-canvas);scrollbar-gutter:stable}',
			'.skxHead{display:flex;align-items:flex-start;gap:12px;padding:16px 18px;border-bottom:1px solid var(--skx-line-soft)}',
			'.skxHeadMain{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}',
			'.skxHeadSide{display:flex;align-items:center;gap:8px;flex:none;padding-top:2px}',
			'.skxTitle{margin:0;font-size:16px;line-height:1.3;font-weight:600;color:var(--skx-fg)}',
			'.skxTitleMeta{font-size:12.5px;color:var(--skx-fg-muted)}',
			'.skxCode{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;color:var(--skx-fg-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.skxCodeBlock{display:block;padding:8px 10px;border:1px solid var(--skx-line);border-radius:var(--dsw-radius-md);background:var(--skx-surface);word-break:break-all;white-space:normal}',
			'.skxToolbar{display:flex;align-items:center;gap:10px;padding:12px 18px;border-bottom:1px solid var(--skx-line-soft);flex-wrap:wrap}',
			'.skxInput{flex:1;min-width:160px;padding:8px 12px;border:1px solid var(--skx-line);border-radius:var(--dsw-radius-md);background:var(--skx-canvas);color:var(--skx-fg);font:inherit;font-size:13px;outline:none;transition:border-color .15s ease,box-shadow .15s ease}',
			'.skxInput:focus{border-color:var(--skx-accent);box-shadow:0 0 0 3px var(--skx-accent-soft)}',
			'.skxInput::placeholder{color:var(--skx-fg-subtle)}',
			'.skxCheck{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--skx-fg-muted);white-space:nowrap;cursor:pointer}',
			'.skxCheck input{width:15px;height:15px;accent-color:var(--skx-accent);cursor:pointer}',
			'.skxSelect{padding:7px 10px;border:1px solid var(--skx-line);border-radius:var(--dsw-radius-md);background:var(--skx-canvas);color:var(--skx-fg);font:inherit;font-size:14px;cursor:pointer}',
			'.skxSegmented{display:inline-flex;border:1px solid var(--skx-line);border-radius:var(--dsw-radius-md);overflow:hidden}',
			'.skxSeg{padding:7px 14px;border:0;background:transparent;color:var(--skx-fg-muted);font:inherit;font-size:13px;cursor:pointer}',
			'.skxSegOn{background:var(--skx-accent);color:var(--dsw-alias-label-primary-foreground);font-weight:600}',
			'.skxBtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:7px 14px;border:1px solid var(--skx-line);border-radius:var(--dsw-radius-md);background:var(--skx-raised);color:var(--skx-fg);font:inherit;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background .12s ease,border-color .12s ease,transform .06s ease}',
			'.skxBtn:active:not(:disabled){transform:translateY(1px)}',
			'.skxBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}',
			'.skxBtn:disabled{opacity:.55;cursor:not-allowed}',
			'.skxBtnPrimary{background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-foreground)}',
			'.skxBtnPrimary:hover:not(:disabled){filter:brightness(1.05)}',
			'.skxBtnWarn{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-state-warn-primary)}',
			'.skxBtnWarn:hover{border-color:var(--dsw-alias-state-warn-primary);background:transparent}',
			'.skxBtnDanger{color:var(--skx-red)}',
			'.skxBtnDanger:hover:not(:disabled){background:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-primary-foreground)}',
			'.skxBtnSmall{padding:5px 11px;font-size:12.5px}',
			'.skxRows{list-style:none;margin:0;padding:6px;display:flex;flex-direction:column;gap:2px}',
			'.skxRow{position:relative;display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border-radius:var(--dsw-radius-md);cursor:pointer;border:1px solid transparent;transition:background .12s ease,border-color .12s ease}',
			'.skxRow:hover{background:var(--skx-raised)}',
			'.skxRowOn{background:var(--skx-accent-soft);border-color:var(--dsw-alias-state-business-primary);box-shadow:var(--skx-shadow-sm)}',
			'.skxRowOn:before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:3px;border-radius:3px;background:var(--skx-accent)}',
			'.skxRowStatic{cursor:default}',
			'.skxRowOff{opacity:.6}',
			'.skxRowMain{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}',
			'.skxRowTitle{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}',
			'.skxRowName{font-size:16px;line-height:1.4;font-weight:600;color:var(--skx-fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.skxRowDesc{margin:0;font-size:12.5px;line-height:1.55;color:var(--skx-fg-muted);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
			'.skxRowEnd{display:flex;align-items:center;gap:8px;flex:none}',
			'.skxRowActions{display:flex;gap:8px;margin-top:8px}',
			'.skxBadge{padding:1px 8px;border:1px solid var(--skx-line);border-radius:999px;background:var(--skx-raised);font-size:11.5px;color:var(--skx-fg-muted);white-space:nowrap;flex:none}',
			'.skxBadgeWarn{color:var(--skx-amber);border-color:var(--dsw-alias-state-warn-primary)}',
			'.skxSwitch{position:relative;width:44px;height:24px;flex:none;padding:0;border:1px solid var(--skx-line);border-radius:999px;background:var(--skx-raised);cursor:pointer;transition:background .15s ease,border-color .15s ease}',
			'.skxSwitch:disabled{opacity:.5;cursor:not-allowed}',
			'.skxSwitchKnob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--dsw-alias-label-tertiary);transition:transform .15s ease,background .15s ease}',
			'.skxSwitchOn{background:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}',
			'.skxSwitchOn .skxSwitchKnob{transform:translateX(20px);background:var(--dsw-alias-label-primary-foreground)}',
			'.skxSwitchSm{width:38px;height:21px}',
			'.skxSwitchSm .skxSwitchKnob{width:15px;height:15px}',
			'.skxSwitchSm.skxSwitchOn .skxSwitchKnob{transform:translateX(17px)}',
			'.skxSwitchLabel{font-size:12.5px;color:var(--skx-fg-muted)}',
			'.skxDoc{display:flex;flex-direction:column;gap:18px;padding:20px 22px}',
			'.skxDocInline .skxDoc{padding:0;gap:16px}',
			'.skxDocInline .skxDocHead{position:static;margin:0;padding:0 0 14px;background:none}',
			'.skxDocInline .skxDocTitle{display:none}',
			'.mgrModalWide{width:min(880px,100%)}',
			'.skxDocHead{position:sticky;top:0;z-index:2;display:flex;align-items:flex-start;gap:14px;padding:18px 22px 14px;margin:-20px -22px 0;background:linear-gradient(var(--skx-canvas) 78%,transparent);border-bottom:1px solid var(--skx-line-soft)}',
			'.skxDocHeadMain{display:flex;flex-direction:column;gap:8px;min-width:0;flex:1}',
			'.skxDocAction{flex:none;margin-top:2px}',
			'.skxDocTitle{margin:0;font-size:17px;line-height:1.3;font-weight:600;color:var(--skx-fg);word-break:break-word}',
			'.skxDocSection{display:flex;flex-direction:column;gap:7px}',
			'.skxLabel{font-size:12px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:var(--skx-fg-subtle)}',
			'.skxLabelRow{display:flex;align-items:center;justify-content:space-between;gap:10px}',
			'.skxProse{margin:0;font-size:13px;line-height:1.7;color:var(--skx-fg);white-space:pre-wrap;word-break:break-word}',
			'.skxTokens{display:flex;flex-wrap:wrap;gap:8px}',
			'.skxToken{padding:2px 9px;border:1px solid var(--skx-line);border-radius:999px;background:var(--skx-raised);font-size:12px;color:var(--skx-fg-muted)}',
			'.skxLink{padding:0;border:0;background:none;color:var(--dsw-alias-state-business-primary);font:inherit;font-size:12.5px;cursor:pointer}',
			'.skxLink:hover{text-decoration:underline}',
			'.skxPre{margin:0;padding:14px 16px;max-height:420px;overflow:auto;border:1px solid var(--skx-line);border-radius:var(--dsw-radius-md);background:var(--skx-surface);font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12.5px;line-height:1.7;color:var(--skx-fg);white-space:pre-wrap;word-break:break-word}',
			'.skxTextarea{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--skx-line);border-radius:var(--dsw-radius-md);background:var(--skx-canvas);color:var(--skx-fg);font:inherit;font-size:13px;line-height:1.6;resize:vertical;outline:none}',
			'.skxTextarea:focus{border-color:var(--skx-accent);box-shadow:0 0 0 3px var(--skx-accent-soft)}',
			'.skxChips{display:flex;flex-wrap:wrap;gap:8px;padding:12px 18px;border-bottom:1px solid var(--skx-line-soft)}',
			'.skxChip{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid var(--skx-line);border-radius:999px;background:var(--skx-raised);color:var(--skx-fg);font:inherit;font-size:13px;cursor:pointer}',
			'.skxChipOn{background:var(--skx-accent);border-color:var(--skx-accent);color:var(--dsw-alias-label-primary-foreground);font-weight:600}',
			'.skxChipOn .skxSourceCount{color:inherit}',
			'.skxChipOff{opacity:.55}',
			'.skxGroup{padding:8px 12px}',
			'.skxGroupHead{display:flex;align-items:center;gap:8px;padding:8px 6px 4px}',
			'.skxNote{margin:0 18px 8px;padding:9px 12px;border:1px solid var(--dsw-alias-state-business-primary);border-radius:var(--dsw-radius-md);background:var(--skx-accent-soft);font-size:14px;color:var(--skx-fg)}',
			'.skxBanner{display:flex;align-items:center;gap:12px;padding:11px 14px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover-danger);font-size:13px;color:var(--dsw-alias-state-error-primary)}',
			'.skxBannerText{flex:1;word-break:break-word}',
			'.skxEmptyTall{flex:1;display:flex;align-items:center;justify-content:center;min-height:220px}',
			'.skxSearchField{display:flex;align-items:center;gap:8px;flex:1;min-width:180px;padding:0 12px;border:1px solid var(--skx-line);border-radius:var(--dsw-radius-md);background:var(--skx-canvas);transition:border-color .15s ease,box-shadow .15s ease}',
			'.skxSearchField:focus-within{border-color:var(--skx-accent);box-shadow:0 0 0 3px var(--skx-accent-soft)}',
			'.skxSearchIcon{font-size:16px;color:var(--skx-fg-subtle);flex:none;line-height:1}',
			'.skxInputBare{flex:1;min-width:0;padding:9px 0;border:0;background:transparent;box-shadow:none!important}',
			'.skxInputBare:focus{border:0;box-shadow:none}',
			'.skxTabs{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
			'.skxChipTight{padding:5px 12px;font-size:12.5px}',
			'.skxRowMeta{font-size:12px;color:var(--skx-fg-subtle);font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.skxDocSections{display:flex;flex-direction:column;gap:18px}',
			'.skxDocFoot{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:auto;padding-top:16px;border-top:1px solid var(--skx-line-soft)}',
			'.skxHint{font-size:12px;line-height:1.6;color:var(--skx-fg-subtle)}',
			'.skxModal{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:24px;background:color-mix(in srgb,var(--dsw-alias-bg-base) 72%,transparent);backdrop-filter:blur(2px)}',
			'.skxModalCard{width:min(460px,100%);display:flex;flex-direction:column;gap:12px;padding:22px 24px;border:1px solid var(--skx-line);border-radius:var(--dsw-radius-lg);background:var(--skx-surface);box-shadow:var(--dsw-shadow-lv3)}',
			'.skxModalCard .skxProse{font-size:13px;line-height:1.7;color:var(--skx-fg-muted)}',
			'.skxConfirmTitle{font-size:13.5px;font-weight:600;color:var(--skx-fg)}',
			'.skxEmpty{padding:32px 20px;text-align:center;font-size:13px;line-height:1.7;color:var(--skx-fg-muted)}',
			'@media (max-width:1100px){.skxSplit{grid-template-columns:minmax(0,1fr)}}',
		].join('\n');

		//#endregion

		//#region helpers

		/**
		 * Call one `/api/manager` endpoint on the Host.
		 *
		 * @param {object} ctx - Client context.
		 * @param {string} endpoint - Endpoint name.
		 * @param {object} payload - JSON payload.
		 * @param {number} [timeoutMs] - How long to wait; searches need more than the default.
		 * @returns {Promise<object>} The endpoint's value.
		 */
		function callHost(ctx, endpoint, payload, timeoutMs) {
			if (ctx.get('connection') === undefined) return Promise.reject(new Error('连接不可用'));
			var options = {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload ?? {}),
				credentials: 'same-origin',
			};
			var wait = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 30000;
			if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
				options.signal = AbortSignal.timeout(wait);
			}
			return fetch(API_PREFIX + '/' + endpoint, options).then(function (response) {
				// A Host that has not reloaded the plugin (or an authenticating
				// proxy) answers with plain text, not this plugin's JSON envelope.
				// Parsing that as JSON would surface "Unexpected token" as the
				// panel's error, which says nothing about what went wrong.
				return response.text().then(function (raw) {
					var value;
					try {
						value = JSON.parse(raw);
					} catch {
						if (!response.ok) throw new Error('HTTP ' + response.status + (raw === '' ? '' : '：' + raw.slice(0, 120)));
						throw new Error('服务端返回了非 JSON 响应：' + raw.slice(0, 120));
					}
					// The error envelope is an object with a code and a message.
					// A plain `error` string in a payload is data, not a failure.
					var error = value !== null && typeof value === 'object' && value.error !== null && typeof value.error === 'object'
						? value.error
						: undefined;
					if (!response.ok || error !== undefined) {
						var failure = new Error((error && (error.message || error.code)) || ('HTTP ' + response.status));
						if (error && typeof error.code === 'string') failure.code = error.code;
						if (error && error.details !== undefined) failure.details = error.details;
						throw failure;
					}
					return value;
				});
			});
		}

		/**
		 * Read a thrown value's message.
		 *
		 * @param {unknown} reason - Thrown value.
		 * @returns {string} The message.
		 */
		function messageOf(reason) {
			return reason instanceof Error ? reason.message : String(reason);
		}

		/**
		 * Join class names.
		 *
		 * @returns {string} The class list.
		 */
		function classes() {
			var out = [];
			for (var index = 0; index < arguments.length; index += 1) {
				if (arguments[index]) out.push(arguments[index]);
			}
			return out.join(' ');
		}

		/**
		 * Join a name list, keeping the line short.
		 *
		 * @param {string[]} names - Names.
		 * @param {number} [max] - How many names to spell out.
		 * @returns {string} The list.
		 */
		function nameList(names, max) {
			var limit = max || 6;
			if (names.length <= limit) return names.join(', ');
			return names.slice(0, limit).join(', ') + ' … +' + (names.length - limit);
		}

		/**
		 * Read a URL's hostname for a result row.
		 *
		 * @param {string} value - The URL.
		 * @returns {string} The hostname, or an empty string.
		 */
		function hostOf(value) {
			try {
				return new URL(value).hostname;
			} catch {
				return '';
			}
		}

		//#endregion

		//#region primitives

		/**
		 * Host-like toggle.
		 *
		 * @param {object} props - `checked`, `onChange`, optional `label`, `disabled`.
		 * @returns {object} React node.
		 */
		function Switch(props) {
			return h('button', {
				type: 'button',
				role: 'switch',
				'aria-checked': props.checked === true,
				'aria-label': props.label,
				title: props.label,
				disabled: props.disabled === true,
				className: classes('mgrSwitch', props.checked === true && 'mgrSwitchOn'),
				onClick: function (event) {
					event.stopPropagation();
					if (props.disabled !== true) props.onChange(!props.checked);
				},
			}, h('span', { className: 'mgrSwitchKnob' }));
		}

		/**
		 * Small status tag.
		 *
		 * @param {object} props - `tone` and children.
		 * @returns {object} React node.
		 */
		function Badge(props) {
			return h('span', {
				className: classes('mgrBadge', props.tone && 'mgrBadge' + props.tone),
				title: props.title,
			}, props.children);
		}

		/**
		 * Loading row.
		 *
		 * @param {object} props - `label`.
		 * @returns {object} React node.
		 */
		function Loading(props) {
			return h('div', { className: 'mgrLoading' },
				h('span', { className: 'mgrSpinner', 'aria-hidden': true }),
				h('span', null, props.label));
		}

		/**
		 * Dialog shell with Escape and backdrop dismissal.
		 *
		 * @param {object} props - `title`, `onClose`, `children`, `footer`.
		 * @returns {object} React node.
		 */
		function Modal(props) {
			var panelRef = useRef(null);
			// Keep the latest close handler without re-running the mount effect:
			// the panel re-renders on its four-second status poll, and a changing
			// dependency would steal focus back to the first field.
			var closeRef = useRef(props.onClose);
			closeRef.current = props.onClose;
			useEffect(function () {
				function onKeyDown(event) {
					if (event.key === 'Escape') {
						event.stopPropagation();
						closeRef.current();
					}
				}
				document.addEventListener('keydown', onKeyDown);
				var node = panelRef.current;
				var target = node === null ? null : node.querySelector('.mgrModalBody input, .mgrModalBody textarea, .mgrModalBody select, .mgrModalBody button');
				if (target !== null) target.focus();
				return function () {
					document.removeEventListener('keydown', onKeyDown);
				};
			}, []);
			return h('div', {
				className: 'mgrModalBackdrop',
				onMouseDown: function (event) {
					if (event.target === event.currentTarget) props.onClose();
				},
			}, h('div', {
				className: classes('mgrModal', props.className),
				role: 'dialog',
				'aria-modal': 'true',
				'aria-label': props.title,
				ref: panelRef,
			},
				h('div', { className: 'mgrModalHead' },
					h('h2', { className: 'mgrModalTitle' }, props.title),
					h('button', {
						type: 'button',
						className: 'mgrIconBtn',
						'aria-label': 'close',
						onClick: props.onClose,
					}, '×')),
				h('div', { className: 'mgrModalBody' }, props.children),
				props.footer === undefined ? null : h('div', { className: 'mgrModalFoot' }, props.footer)));
		}

		/**
		 * One labelled form field.
		 *
		 * @param {object} props - `label`, `hint`, `children`, optional `htmlFor`.
		 * @returns {object} React node.
		 */
		function Field(props) {
			return h('div', { className: 'mgrField' },
				h('label', { className: 'mgrLabel', htmlFor: props.htmlFor }, props.label),
				props.children,
				props.hint === undefined ? null : h('div', { className: 'mgrFieldHint' }, props.hint));
		}

		//#endregion

		//#region skills view

		/**
		 * Call one of the vendored kernel's endpoints.
		 *
		 * The kernel answers `{ ok, data }` on success and `{ ok: false, error }`
		 * on failure, which is a different envelope from this plugin's own
		 * endpoints. Keeping the two call paths apart means neither has to learn
		 * the other's error shape.
		 *
		 * @param {object} ctx - Client context.
		 * @param {string} path - Kernel route below `/api/manager`.
		 * @param {object} [body] - JSON body for a POST.
		 * @param {object} [options] - `method` override and `query` search params.
		 * @returns {Promise<unknown>} The route's `data`.
		 */
		function callKernel(ctx, path, body, options) {
			if (ctx.get('connection') === undefined) return Promise.reject(new Error('连接不可用'));
			var settings = options ?? {};
			var verb = settings.method ?? (body === undefined ? 'GET' : 'POST');
			var url = API_PREFIX + '/' + path;
			if (settings.query !== undefined && settings.query !== '') url += '?' + settings.query;
			var request = {
				method: verb,
				headers: { 'content-type': 'application/json', 'x-dsh-manager-client': '1' },
				credentials: 'same-origin',
			};
			if (verb !== 'GET' && verb !== 'HEAD') request.body = JSON.stringify(body ?? {});
			if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
				request.signal = AbortSignal.timeout(30000);
			}
			return fetch(url, request).then(function (response) {
				return response.text().then(function (raw) {
					var value;
					try {
						value = JSON.parse(raw);
					} catch {
						if (!response.ok) throw new Error('HTTP ' + response.status + (raw === '' ? '' : '：' + raw.slice(0, 120)));
						throw new Error('服务端返回了非 JSON 响应：' + raw.slice(0, 120));
					}
					if (value !== null && typeof value === 'object' && value.ok === true) return value.data;
					// The kernel reports a refused operation as `{ ok: false, code, error }`
					// where `error` is the message string.
					var error = value !== null && typeof value === 'object' ? value.error : undefined;
					var message = typeof error === 'string' && error !== ''
						? error
						: (error !== null && typeof error === 'object' && typeof error.message === 'string' ? error.message : 'HTTP ' + response.status);
					var failure = new Error(message);
					if (error !== null && typeof error === 'object' && typeof error.code === 'string') failure.code = error.code;
					if (value !== null && typeof value === 'object' && typeof value.code === 'string') failure.code = value.code;
					throw failure;
				});
			});
		}

		/**
		 * Group a root's skills by effective name, keeping one representative.
		 *
		 * The same skill commonly exists in several agent directories (a shared
		 * copy, a per-app copy, a symlink). Showing every copy turns a 26-skill
		 * machine into a wall of duplicates, so the list shows the copy that
		 * actually wins and reports the rest as a count.
		 *
		 * @param {Array<object>} skills - The root's skills.
		 * @returns {Array<object>} One row per name, with `copies` filled in.
		 */
		function collapseSkills(skills) {
			var byName = new Map();
			for (var index = 0; index < skills.length; index += 1) {
				var skill = skills[index];
				var key = skill.canonicalName ?? skill.name;
				var existing = byName.get(key);
				if (existing === undefined) {
					byName.set(key, { ...skill, copies: 0 });
					continue;
				}
				// A loadable copy beats an unparseable one; otherwise the first
				// listed (highest-priority source) keeps the row.
				if (skill.loadable !== false && existing.loadable === false) {
					byName.set(key, { ...skill, copies: existing.copies + 1 });
				} else {
					existing.copies += 1;
				}
			}
			return Array.from(byName.values());
		}

		/**
		 * UTF-8 byte length of one draft.
		 *
		 * The host caps the preference file by bytes, so the counter has to
		 * match what the file will weigh, not the string length.
		 *
		 * @param {string} text - Draft.
		 * @returns {number} Bytes.
		 */
		function byteLength(text) {
			if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
			var encoded = encodeURIComponent(text);
			var bytes = 0;
			for (var index = 0; index < encoded.length; index += 1) {
				if (encoded[index] === '%') { bytes += 1; index += 2; } else bytes += 1;
			}
			return bytes;
		}

		/**
		 * Rough token estimate for the counter.
		 *
		 * Same shape as the host's estimator: a CJK character is about one
		 * token, everything else about four characters per token.
		 *
		 * @param {string} text - Draft.
		 * @returns {number} Estimated tokens.
		 */
		function estimateTokens(text) {
			if (text === '') return 0;
			var wide = 0;
			for (var index = 0; index < text.length; index += 1) {
				if (text.charCodeAt(index) > 0x2e7f) wide += 1;
			}
			return Math.ceil(wide + (text.length - wide) / 4);
		}

		/**
		 * A GitHub-style pill switch.
		 *
		 * Sits inline in a row and toggles on click; it stops propagation so a
		 * row that is itself clickable (to select) is not also selected.
		 *
		 * @param {object} props - `checked`, `label`, `disabled`, `onChange`, `size`.
		 * @returns {object} React node.
		 */
		function PillSwitch(props) {
			var size = props.size === 'sm' ? ' skxSwitchSm' : '';
			return h('button', {
				type: 'button',
				role: 'switch',
				'aria-checked': props.checked === true,
				'aria-label': props.label,
				title: props.label,
				disabled: props.disabled === true,
				className: classes('skxSwitch', props.checked === true && 'skxSwitchOn', size),
				onClick: function (event) {
					event.stopPropagation();
					if (props.disabled !== true) props.onChange(!props.checked);
				},
			}, h('span', { className: 'skxSwitchKnob' }));
		}

		/**
		 * The skills workspace: four sub-tabs, each a page of its own.
		 *
		 * The sources live inside 已安装 as a scope rail, not next to the tab
		 * row: they filter one page's list, they are not a fifth section.
		 *
		 * @param {object} props - Panel data and actions.
		 * @returns {object} React node.
		 */
		function SkillsWorkspace(props) {
			var t = props.t;
			var call = props.callKernel;
			var [roots, setRoots] = useState(null);
			var [tab, setTab] = useState('installed');
			var [trashCount, setTrashCount] = useState(0);
			var [error, setError] = useState('');
			var [busy, setBusy] = useState(false);

			var load = useCallback(function () {
				setBusy(true);
				return call('state').then(function (data) {
					// A root whose directory is absent has nothing to show and nothing
					// to write to; the kernel still reports it, so it is dropped here.
					var list = (Array.isArray(data?.roots) ? data.roots : []).filter(function (entry) { return entry.exists !== false; });
					setRoots(list);
					setTrashCount(Array.isArray(data?.trash) ? data.trash.length : 0);
					setError('');
				}).catch(function (reason) {
					setError(messageOf(reason));
				}).finally(function () {
					setBusy(false);
				});
			}, [call]);

			useEffect(function () { void load(); }, [load, props.rescan]);

			if (roots === null) {
				return h('div', { className: 'skxRoot' },
					error === ''
						? h(Loading, { label: t('state.loading') })
						: h('div', { className: 'mgrErrorBox' },
							h('span', null, error),
							h('span', { className: 'mgrSpacer' }),
							h('button', { type: 'button', className: 'mgrBtn', onClick: function () { void load(); } }, t('action.retry'))));
			}


			var toggleSource = function (entry, enabled) {
				setBusy(true);
				call(enabled ? 'source-enable' : 'source-disable', { root: entry.key }).then(load).catch(function (reason) {
					setError(messageOf(reason));
				}).finally(function () { setBusy(false); });
			};

			var tabs = [
				// The page badge carries the counts; the tab stays a plain label.
				{ id: 'installed', label: t('skx.tab.installed'), count: '' },
				{ id: 'project', label: t('skx.tab.project'), count: '' },
				{ id: 'discover', label: t('skx.tab.discover'), count: '' },
				{ id: 'trash', label: t('skx.tab.trash'), count: trashCount > 0 ? String(trashCount) : '' },
			];
			var tabView = h('div', { className: 'mgrSubTabs skxSubTabs', role: 'tablist', 'aria-label': t('skx.subtabs') },
				tabs.map(function (entry) {
					return h('button', {
						type: 'button',
						role: 'tab',
						key: entry.id,
						'aria-selected': tab === entry.id,
						className: classes('mgrTab', tab === entry.id && 'mgrTabActive'),
						onClick: function () { setTab(entry.id); },
					},
						entry.label,
						entry.count === '' ? null : h('span', { className: 'mgrTabCount' }, entry.count));
				}));

			var listPanel = h(SkillListPanel, {
				t: t, call: call, roots: roots, busy: busy,
				onToggleSource: toggleSource, onChanged: load, onReload: function () { void load(); }, setError: setError,
			});

			// Every sub-view stays mounted (the inactive ones are hidden) so a tab
			// switch never drops a filter, a preview, or a half-written note. The
			// panels that fetch on their own only do so once they first become
			// active, so opening the skill page costs one request, not four.
			var subViews = h('div', { className: 'skxSubViews' },
				h('div', { className: 'skxSubView', style: { display: tab === 'installed' ? undefined : 'none' } },
					h('section', { className: 'skxMain' }, listPanel)),
				h('div', { className: 'skxSubView', style: { display: tab === 'project' ? undefined : 'none' } },
					h('section', { className: 'skxMain' },
						h(ProjectSkillsPanel, { t: t, call: call, active: tab === 'project', setError: setError }))),
				h('div', { className: 'skxSubView', style: { display: tab === 'discover' ? undefined : 'none' } },
					h('section', { className: 'skxMain' },
						h(DiscoverPanel, { t: t, call: call, roots: roots, active: tab === 'discover', onInstalled: load, setError: setError }))),
				h('div', { className: 'skxSubView', style: { display: tab === 'trash' ? undefined : 'none' } },
					h('section', { className: 'skxMain' },
						h(TrashPanel, { t: t, call: call, active: tab === 'trash', onRestored: load, setError: setError }))));

			return h('div', { className: 'skxRoot' },
				error === '' ? null : h('div', { className: 'skxBanner' },
					h('span', { className: 'skxBannerText' }, error),
					h('button', { type: 'button', className: 'skxBtn', onClick: function () { setError(''); void load(); } }, t('action.retry'))),
				tabView,
				subViews);
		}

		/**
		 * The locale key of every kernel diagnostic the panel knows.
		 *
		 * A static map, not `'skx.diag.' + code`: a code the panel has no text
		 * for falls back to a readable sentence instead of a missing key.
		 */
		var DIAGNOSTIC_HINT = {
			'diagnostic.frontmatter.missing': 'skx.diag.frontmatter',
			'diagnostic.name.missing': 'skx.diag.nameMissing',
			'diagnostic.name.invalid': 'skx.diag.nameInvalid',
			'diagnostic.description.missing': 'skx.diag.description',
			'diagnostic.invocation.invalid': 'skx.diag.invocation',
		};

		/**
		 * Why the host refuses one skill.
		 *
		 * @param {object} t - Translator.
		 * @param {object[]} diagnostics - The kernel's diagnostics.
		 * @returns {string} The readable reason.
		 */
		function diagnosticText(t, diagnostics) {
			var codes = (Array.isArray(diagnostics) ? diagnostics : [])
				.filter(function (entry) { return entry !== null && typeof entry === 'object' && entry.level === 'error' })
				.map(function (entry) { return entry.code; });
			if (codes.length === 0) return t('skx.diag.other');
			var seen = [];
			for (var index = 0; index < codes.length; index += 1) {
				var text = t(DIAGNOSTIC_HINT[codes[index]] ?? 'skx.diag.other');
				if (seen.indexOf(text) < 0) seen.push(text);
			}
			return seen.join('；');
		}

		/**
		 * Every installed skill in one list: search on top, sources as labels.
		 *
		 * The list is the page: there is no sibling detail column and no create
		 * button, so a row spans the full width and one skill's document opens
		 * over the list instead of shrinking it to half a page.
		 *
		 * @param {object} props - All roots, busy flag and callbacks.
		 * @returns {object} React node.
		 */
		function SkillListPanel(props) {
			var t = props.t;
			var sources = Array.isArray(props.roots) ? props.roots : [];
			var [query, setQuery] = useState('');
			var [brokenOpen, setBrokenOpen] = useState(false);
			var [opened, setOpened] = useState(null);
			var [sourcesOpen, setSourcesOpen] = useState(false);

			if (sources.length === 0) return h('div', { className: 'skxEmpty' }, t('skx.noSources'));

			var sourceOf = function (key) {
				return sources.find(function (item) { return item.key === key; }) ?? sources[0];
			};

			var needle = query.trim().toLowerCase();
			var collected = [];
			for (var index = 0; index < sources.length; index += 1) {
				var source = sources[index];
				var skills = source.skills ?? [];
				for (var position = 0; position < skills.length; position += 1) {
					collected.push({
						...skills[position],
						sourceKey: source.key,
						sourceLabel: source.label ?? source.key,
						sourceOff: source.enabled === false,
					});
				}
			}
			// Collapsing keeps one row per skill name; the badge then means "the
			// same name also exists in another source", which is what it says.
			var collapsed = collapseSkills(collected);
			// The host refuses these, so they are not part of the list at all;
			// they are reported on their own so the reason stays visible.
			var broken = collapsed.filter(function (skill) { return skill.loadable === false; });
			var rows = collapsed.filter(function (skill) {
				if (skill.loadable === false) return false;
				if (needle === '') return true;
				var haystack = (skill.name + ' ' + (skill.description ?? '') + ' ' + (skill.customNote ?? '')).toLowerCase();
				return haystack.indexOf(needle) >= 0;
			});

			// The page owns these two numbers now: how many skills the agent
			// actually starts with, and how many exist in total. The list itself is
			// filtered by the search box, so the counts come from the full set.
			var listed = collapsed.filter(function (skill) { return skill.loadable !== false; });
			var startedCount = listed.filter(function (skill) { return skill.enabled !== false; }).length;

			var flip = function (skill, enabled) {
				return props.call(enabled ? 'enable' : 'disable', { root: skill.sourceKey, name: skill.name }).then(props.onChanged).catch(function (reason) {
					props.setError(messageOf(reason));
				});
			};

			return h('div', { className: 'skxPage' },
				// The input is the only thing that grows, so it spans the page.
				h('div', { className: 'skxToolbar skxToolbarTop' },
					h('input', {
						className: 'skxInput',
						type: 'search',
						value: query,
						placeholder: t('skx.search'),
						'aria-label': t('skx.search'),
						onChange: function (event) { setQuery(event.target.value); },
					}),
					h('span', { className: 'skxStatBadge', title: t('skx.countsHint') },
						h('span', { className: 'skxStatLabel' }, t('skx.countsLabel')),
						h('span', { className: 'skxStatOn' }, String(startedCount)),
						h('span', { className: 'skxStatOf' }, t('skx.countsOf', { total: listed.length }))),
					h('button', {
						type: 'button',
						className: classes('skxBtn', 'skxBtnSmall', broken.length > 0 && 'skxBtnWarn'),
						onClick: function () { setBrokenOpen(true); },
					}, t('skx.brokenButton'), h('span', { className: 'skxTabCount' }, String(broken.length))),
					h('button', {
						type: 'button',
						className: 'skxBtn skxBtnSmall',
						onClick: function () { setSourcesOpen(true); },
					}, t('skx.sourcesButton'), h('span', { className: 'skxTabCount' }, String(sources.length))),
					h('button', {
						type: 'button',
						className: 'skxBtn skxBtnSmall',
						disabled: props.busy,
						onClick: function () { props.onReload(); },
					}, props.busy ? t('state.loading') : t('action.refresh'))),
				h('div', { className: 'skxSingle' },
					h('div', { className: 'skxListCol' },
						rows.length === 0
							? h('div', { className: 'skxEmpty' }, needle === '' ? t('skx.noSkills') : t('skx.noMatch'))
							: h('ul', { className: 'skxRows' }, rows.map(function (skill) {
								var on = skill.enabled !== false;
								return h('li', {
									key: skill.sourceKey + '/' + skill.name,
									className: classes('skxRow', opened !== null && opened.sourceKey === skill.sourceKey && opened.name === skill.name && 'skxRowOn', !on && 'skxRowOff'),
									role: 'button',
									tabIndex: 0,
									'aria-pressed': opened !== null && opened.sourceKey === skill.sourceKey && opened.name === skill.name,
									onClick: function () { setOpened(skill); },
									onKeyDown: function (event) {
										if (event.key !== 'Enter' && event.key !== ' ') return;
										event.preventDefault();
										setOpened(skill);
									},
								},
								h('div', { className: 'skxRowMain' },
									h('div', { className: 'skxRowTitle' },
										h('span', { className: 'skxRowName' }, skill.name),
										h('span', {
											className: classes('skxBadge', skill.sourceOff && 'skxBadgeWarn'),
											title: skill.sourceOff ? t('skx.sourceOffTip') : skill.sourceLabel,
										}, skill.sourceLabel),
										skill.copies > 0 ? h('span', { className: 'skxBadge', title: t('skx.copiesTip', { n: skill.copies }) }, '+' + skill.copies) : null,
										skill.enabled !== false && skill.modelInvocable === false
											? h('span', { className: 'skxBadge', title: t('skx.manualOnlyTip') }, t('skx.manualOnly'))
											: null,
										skill.loadable === false ? h('span', { className: 'skxBadge skxBadgeWarn' }, t('skx.broken')) : null),
									h('p', { className: 'skxRowDesc' }, (skill.description ?? '') === '' ? t('skx.noDescription') : skill.description)),
								h(PillSwitch, {
									checked: on,
									label: t('skx.toggleSkill') + '：' + skill.name,
									size: 'sm',
									onChange: function (next) { void flip(skill, next); },
								}));
							})))),
				brokenOpen
					? h(Modal, {
						title: t('skx.brokenTitle'),
						className: 'mgrModalWide',
						onClose: function () { setBrokenOpen(false); },
					},
						h('div', null,
							h('p', { className: 'skxProse skxSourcesHint' }, t('skx.brokenHint')),
							broken.length === 0
								? h('div', { className: 'skxEmpty' }, t('skx.brokenNone'))
								: h('ul', { className: 'skxRows' }, broken.map(function (skill) {
									return h('li', { key: skill.sourceKey + '/' + skill.name, className: 'skxRow skxRowStatic' },
										h('div', { className: 'skxRowMain' },
											h('div', { className: 'skxRowTitle' },
												h('span', { className: 'skxRowName' }, skill.name),
												h('span', { className: 'skxBadge' }, skill.sourceLabel)),
											h('p', { className: 'skxRowDesc' }, diagnosticText(t, skill.diagnostics)),
											h('code', { className: 'skxCode skxCodeBlock' }, skill.path ?? '')));
								}))))
					: null,
				sourcesOpen
					? h(Modal, {
						title: t('skx.sourcesTitle'),
						onClose: function () { setSourcesOpen(false); },
					},
						h('div', null,
							h('p', { className: 'skxProse skxSourcesHint' }, t('skx.sourcesHint')),
							h('ul', { className: 'skxRows' }, sources.map(function (entry) {
								var count = (entry.skills ?? []).length;
								return h('li', { key: entry.key, className: 'skxRow skxRowStatic' },
									h('div', { className: 'skxRowMain' },
										h('div', { className: 'skxRowTitle' },
											h('span', { className: 'skxRowName' }, entry.label ?? entry.key),
											h('span', { className: 'skxBadge' }, t('skx.sourceSkillCount', { n: count }))),
										h('p', { className: 'skxRowDesc' }, entry.path)),
									h(PillSwitch, {
										checked: entry.enabled !== false,
										label: t('skx.toggleSource') + '：' + (entry.label ?? entry.key),
										disabled: props.busy,
										onChange: function (next) { props.onToggleSource(entry, next); },
									}));
							}))))
					: null,
				opened === null
					? null
					: h(Modal, {
						title: opened.name,
						className: 'mgrModalWide',
						onClose: function () { setOpened(null); },
					},
						h('div', { className: 'skxDocInline' },
							h(SkillPane, {
								t: t, call: props.call, root: sourceOf(opened.sourceKey), skill: opened,
								onSaved: props.onChanged,
								onDeleted: function () { setOpened(null); },
								setError: props.setError,
							}))));
		}

		/**
		 * The right pane: one skill's document, tokens, and note editor.
		 *
		 * @param {object} props - The selected skill and its source root.
		 * @returns {object} React node.
		 */
		function SkillPane(props) {
			var t = props.t;
			var skill = props.skill;
			var root = props.root;
			var [doc, setDoc] = useState({ loading: true, data: null, error: '' });
			var [note, setNote] = useState('');
			var [editing, setEditing] = useState(false);
			var [saving, setSaving] = useState(false);
			var [copied, setCopied] = useState(false);
			var [confirming, setConfirming] = useState(false);
			var [deleting, setDeleting] = useState(false);

			useEffect(function () {
				var alive = true;
				setDoc({ loading: true, data: null, error: '' });
				setEditing(false);
				props.call('detail', { root: root.key, name: skill.name }).then(function (data) {
					if (!alive) return;
					setDoc({ loading: false, data: data, error: '' });
					setNote(data?.customNote ?? '');
				}).catch(function (reason) {
					if (alive) setDoc({ loading: false, data: null, error: messageOf(reason) });
				});
				return function () { alive = false; };
			}, [root.key, skill.name, props.call]);

			if (doc.loading) return h('div', { className: 'skxEmpty skxEmptyTall' }, t('state.loading'));
			if (doc.error !== '') return h('div', { className: 'skxEmpty skxEmptyTall' }, doc.error);

			var data = doc.data ?? {};
			var saveNote = function () {
				setSaving(true);
				props.call('skill-note', { root: root.key, name: skill.name, note: note }).then(function () {
					// The detail effect is keyed on the skill, not on the note, so
					// showing the saved text has to update the loaded copy here.
					if (doc.data !== null) setDoc({ loading: false, data: { ...doc.data, customNote: note }, error: '' });
					setEditing(false);
					if (props.onSaved) props.onSaved();
				}).catch(function (reason) {
					props.setError(messageOf(reason));
				}).finally(function () { setSaving(false); });
			};
			var copyBody = function () {
				var text = data.body ?? '';
				if (typeof navigator === 'undefined' || navigator.clipboard === undefined) return;
				navigator.clipboard.writeText(text).then(function () {
					setCopied(true);
					setTimeout(function () { setCopied(false); }, 1500);
				}).catch(function () {});
			};

			return h('div', { className: 'skxDoc' },
				h('div', { className: 'skxDocHead' },
					h('div', { className: 'skxDocHeadMain' },
						h('h2', { className: 'skxDocTitle' }, data.declaredName ?? skill.name),
						h('div', { className: 'skxTokens' },
							h('span', { className: 'skxToken', title: t('skx.descTokensTip') }, String(data.descriptionTokens ?? 0) + ' ' + t('skx.tokenDesc')),
							h('span', { className: 'skxToken', title: t('skx.bodyTokensTip') }, String(data.bodyTokens ?? 0) + ' ' + t('skx.tokenBody')))),
					// Kept in the header so it stays reachable no matter how long the
					// document is; the body below can run for thousands of lines.
					root.mutable === true && data.sourceReadOnly !== true && data.linked !== true
						? h('button', {
							type: 'button',
							className: 'skxBtn skxBtnDanger skxBtnSmall skxDocAction',
							title: t('skx.trash'),
							onClick: function () { setConfirming(true); },
						}, t('skx.trash'))
						: null),
				h('div', { className: 'skxDocSection' },
					h('div', { className: 'skxLabel' }, t('skx.description')),
					h('p', { className: 'skxProse' }, (data.description ?? '') === '' ? t('skx.noDescription') : data.description)),
				h('div', { className: 'skxDocSection' },
					h('div', { className: 'skxLabelRow' },
						h('span', { className: 'skxLabel' }, t('skx.note')),
						editing ? null : h('button', { type: 'button', className: 'skxLink', onClick: function () { setEditing(true); } }, t('skx.editNote'))),
					editing
						? h('div', null,
							h('textarea', {
								className: 'skxTextarea',
								rows: 3,
								value: note,
								placeholder: t('skx.notePlaceholder'),
								onChange: function (event) { setNote(event.target.value); },
							}),
							h('div', { className: 'skxRowActions' },
								h('button', { type: 'button', className: 'skxBtn skxBtnPrimary', disabled: saving, onClick: saveNote }, saving ? t('state.loading') : t('skx.save')),
								h('button', { type: 'button', className: 'skxBtn', onClick: function () { setEditing(false); setNote(data.customNote ?? ''); } }, t('action.cancel'))))
						: h('p', { className: 'skxProse' }, (data.customNote ?? '') === '' ? t('skx.noNote') : data.customNote)),
				(data.body ?? '') === '' ? null : h('div', { className: 'skxDocSection' },
					h('div', { className: 'skxLabelRow' },
						h('span', { className: 'skxLabel' }, t('skx.body')),
						h('button', { type: 'button', className: 'skxLink', onClick: copyBody }, copied ? t('skx.copied') : t('skx.copyBody'))),
					h('pre', { className: 'skxPre' }, data.body)),
				h('div', { className: 'skxDocSection' },
					h('div', { className: 'skxLabel' }, t('skx.path')),
					h('code', { className: 'skxCode skxCodeBlock' }, data.path ?? '')),
				// The button itself lives in the header so it is always reachable;
				// this only explains why it is absent when the source is read-only.
				root.mutable === true && data.sourceReadOnly !== true && data.linked !== true
					? null
					: h('div', { className: 'skxDocFoot' },
						h('span', { className: 'skxHint' }, t('skx.deleteUnavailable'))),
				// A fixed overlay, not an in-flow block: the document below can be
				// thousands of lines long, and an in-flow confirmation would render
				// off-screen at its end.
				confirming
					? h(Modal, {
						title: t('skx.confirmTrashTitle', { name: data.declaredName ?? skill.name }),
						onClose: function () { if (!deleting) setConfirming(false); },
						footer: h('div', { className: 'skxRowActions' },
							h('button', {
								type: 'button',
								className: 'skxBtn skxBtnDanger',
								disabled: deleting,
								onClick: function () {
									setDeleting(true);
									props.call('delete', { root: root.key, name: skill.name }, { method: 'POST' }).then(function () {
										setConfirming(false);
										if (props.onDeleted) props.onDeleted();
										if (props.onSaved) props.onSaved();
									}).catch(function (reason) {
										props.setError(messageOf(reason));
									}).finally(function () { setDeleting(false); });
								},
							}, deleting ? t('state.loading') : t('skx.trashConfirm')),
							h('button', { type: 'button', className: 'skxBtn', onClick: function () { setConfirming(false); } }, t('action.cancel'))),
					},
						h('p', { className: 'skxProse' }, t('skx.confirmTrashDesc')))
					: null);
		}

		/**
		 * Project-scoped skills, grouped by registered workspace.
		 *
		 * @param {object} props - Kernel caller and error sink.
		 * @returns {object} React node.
		 */
		function ProjectSkillsPanel(props) {
			var t = props.t;
			var call = props.call;
			var [loading, setLoading] = useState(true);
			var [workspaces, setWorkspaces] = useState([]);
			var [detail, setDetail] = useState(null);
			var [activePath, setActivePath] = useState('');
			var [loadError, setLoadError] = useState('');
			var [nonce, setNonce] = useState(0);
			var loadedRef = useRef(false);

			var retry = function () {
				loadedRef.current = false;
				setNonce(function (value) { return value + 1; });
			};

			useEffect(function () {
				if (props.active !== true || loadedRef.current) return;
				loadedRef.current = true;
				call('workspaces').then(function (data) {
					var items = Array.isArray(data?.items) ? data.items : [];
					setWorkspaces(items);
					var first = items.find(function (item) { return item.available !== false; });
					if (first !== undefined) setActivePath(first.path);
				}).catch(function (reason) {
					setLoadError(messageOf(reason));
					props.setError(messageOf(reason));
				}).finally(function () { setLoading(false); });
			}, [props.active, call, nonce]);

			useEffect(function () {
				if (activePath === '') return undefined;
				var alive = true;
				setDetail(null);
				call('workspace-skills', { workspace: activePath }).then(function (data) {
					if (alive) setDetail(data);
				}).catch(function (reason) {
					if (alive) setDetail({ error: messageOf(reason) });
				});
				return function () { alive = false; };
			}, [activePath, call]);

			if (loading) return h('div', { className: 'skxEmpty skxEmptyTall' }, t('state.loading'));
			if (loadError !== '') {
				return h('div', { className: 'skxEmpty skxEmptyTall' },
					h('span', null, loadError),
					h('button', { type: 'button', className: 'skxBtn', onClick: retry }, t('action.retry')));
			}
			if (workspaces.length === 0) return h('div', { className: 'skxEmpty skxEmptyTall' }, t('skx.noWorkspaces'));

			var roots = Array.isArray(detail?.roots) ? detail.roots : [];
			var visible = roots.filter(function (root) { return (root.skills ?? []).length > 0; });

			return h('div', { className: 'skxSingle' },
				h('div', { className: 'skxListCol' },
					h('div', { className: 'skxHead' },
						h('div', { className: 'skxHeadMain' },
							h('span', { className: 'skxTitleMeta' }, t('skx.projectHint')))),
					h('div', { className: 'skxChips' }, workspaces.map(function (item) {
						return h('button', {
							type: 'button',
							key: item.path,
							className: classes('skxChip', item.path === activePath && 'skxChipOn', item.available === false && 'skxChipOff'),
							title: item.available === false ? t('skx.workspaceUnavailable') : item.path,
							onClick: function () { setActivePath(item.path); },
						}, item.name, h('span', { className: 'skxSourceCount' }, String(item.skillCount ?? 0)));
					})),
					detail === null
						? h('div', { className: 'skxEmpty' }, t('state.loading'))
						: detail.error !== undefined
							? h('div', { className: 'skxEmpty' }, detail.error)
							: visible.length === 0
								? h('div', { className: 'skxEmpty' }, t('skx.workspaceNoSkills'))
								: h('div', null, visible.map(function (root) {
									return h('div', { className: 'skxGroup', key: root.key },
										h('div', { className: 'skxGroupHead' },
											h('span', { className: 'skxLabel' }, root.label ?? root.key),
											h('span', { className: 'skxSourceCount' }, String((root.skills ?? []).length))),
										h('ul', { className: 'skxRows' }, collapseSkills(root.skills).map(function (skill) {
											return h('li', { key: skill.name, className: 'skxRow skxRowStatic' },
												h('div', { className: 'skxRowMain' },
													h('div', { className: 'skxRowTitle' }, h('span', { className: 'skxRowName' }, skill.name)),
													h('p', { className: 'skxRowDesc' }, (skill.description ?? '') === '' ? t('skx.noDescription') : skill.description)));
										})));
								}))));
		}

		/**
		 * Discovery: the ClawHub chart and its search.
		 *
		 * @param {object} props - Kernel caller, live roots, install callback.
		 * @returns {object} React node.
		 */
		function DiscoverPanel(props) {
			var t = props.t;
			var call = props.call;
			var [query, setQuery] = useState('');
			var [busy, setBusy] = useState(false);
			var [items, setItems] = useState([]);
			var [note, setNote] = useState('');
			var [target, setTarget] = useState('dsh');
			var [installing, setInstalling] = useState('');
			var [preview, setPreview] = useState(null);
			var [sort, setSort] = useState('downloads');
			var loadedRef = useRef(false);
			/**
			 * The only request allowed to write `items`.
			 *
			 * Each load takes a ticket; a slower, older answer that arrives after
			 * a newer one is dropped instead of overwriting the newer list.
			 */
			var requestId = useRef(0);

			/**
			 * Fetch the ClawHub chart or search results.
			 *
			 * The kernel's chart endpoint caps `limit` at 10 and only offers the
			 * download-sorted chart, so the list request uses no `sort` at all and
			 * the visible order is applied here (see `orderedItems`).
			 *
			 * @param {string} mode - `chart` or `search`.
			 * @param {string} text - Search terms; ignored for the chart.
			 * @returns {void}
			 */
			var load = useCallback(function (mode, text) {
				var ticket = requestId.current + 1;
				requestId.current = ticket;
				setBusy(true);
				var query0 = mode === 'search'
					? 'q=' + encodeURIComponent(text) + '&limit=24'
					: 'limit=10';
				var route = mode === 'search' ? 'clawhub/search' : 'clawhub/list';
				call(route, undefined, { method: 'GET', query: query0 }).then(function (data) {
					if (requestId.current !== ticket) return;
					var rows = mode === 'search'
						? (Array.isArray(data?.results) ? data.results : (Array.isArray(data?.items) ? data.items : []))
						: (Array.isArray(data?.items) ? data.items : []);
					setItems(rows);
					setNote(rows.length === 0 ? t('skx.discoverNone') : '');
				}).catch(function (reason) {
					if (requestId.current !== ticket) return;
					setItems([]);
					setNote(messageOf(reason));
				}).finally(function () {
					if (requestId.current === ticket) setBusy(false);
				});
			}, [call, t]);

			useEffect(function () {
				if (props.active !== true || loadedRef.current) return;
				loadedRef.current = true;
				load('chart', '');
			}, [props.active, load]);

			var runSearch = function () {
				var text = query.trim();
				if (text === '') return;
				setPreview(null);
				load('search', text);
			};
			var resetChart = function () {
				setQuery('');
				setPreview(null);
				setNote('');
				load('chart', '');
			};

			var inspect = function (item) {
				setPreview({ loading: true, item: item });
				call('catalog/detail', { catalog: 'clawhub', owner: item.ownerHandle ?? item.owner, slug: item.slug }, { method: 'POST' }).then(function (data) {
					setPreview({ loading: false, item: item, detail: data });
				}).catch(function (reason) {
					setPreview({ loading: false, item: item, error: messageOf(reason) });
				});
			};

			var targets = (props.roots ?? []).filter(function (root) { return root.mutable === true || root.key === 'dsh' || root.key === 'agents'; });
			var installTargets = targets.length === 0 ? [{ key: 'dsh', label: 'DSH' }] : targets;
			// `dsh` is absent on a machine that never created ~/.dsh/skills, so the
			// selection must fall back to a target that is actually listed.
			var selectedTarget = installTargets.some(function (root) { return root.key === target; }) ? target : installTargets[0].key;

			var install = function (item) {
				var key = item.slug ?? item.id ?? item.name;
				setInstalling(key);
				call('catalog/install', { catalog: 'clawhub', owner: item.ownerHandle ?? item.owner, slug: item.slug, root: selectedTarget }, { method: 'POST' }).then(function () {
					setNote(t('skx.installed', { name: item.displayName ?? item.name ?? key }));
					setPreview(null);
					if (props.onInstalled) props.onInstalled();
				}).catch(function (reason) {
					setNote(messageOf(reason));
				}).finally(function () { setInstalling(''); });
			};

			/**
			 * The visible order.
			 *
			 * The kernel exposes one server-side chart order (downloads), so the
			 * other two orders are applied over the rows already fetched.
			 */
			var orderedItems = sort === 'downloads' ? items : items.slice().sort(function (left, right) {
				var a = Number((left.stats ?? {})[sort] ?? left[sort] ?? 0);
				var b = Number((right.stats ?? {})[sort] ?? right[sort] ?? 0);
				return b - a;
			});
			var formatCount = function (value) {
				var n = Number(value);
				if (!Number.isFinite(n)) return '';
				if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
				if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
				return String(n);
			};

			return h('div', { className: 'skxSplit' },
				h('div', { className: 'skxListCol' },
					h('div', { className: 'skxHead' },
						h('div', { className: 'skxHeadMain' },
							h('span', { className: 'skxTitleMeta' }, t('skx.discoverHint')))),
					h('div', { className: 'skxToolbar' },
						h('div', { className: 'skxSearchField' },
							h('span', { className: 'skxSearchIcon', 'aria-hidden': 'true' }, '⌕'),
							h('input', {
								className: 'skxInput skxInputBare',
								type: 'search',
								value: query,
								placeholder: t('skx.discoverSearch'),
								onChange: function (event) { setQuery(event.target.value); },
								'aria-label': t('skx.discoverSearch'),
								onKeyDown: function (event) {
									// Confirm a candidate in an IME is not a submit.
									if (event.isComposing === true || event.keyCode === 229) return;
									if (event.key === 'Enter') runSearch();
								},
							})),
						h('button', { type: 'button', className: 'skxBtn skxBtnPrimary', onClick: runSearch, disabled: busy }, t('skx.searchAction')),
						query === '' && note === '' ? null : h('button', { type: 'button', className: 'skxBtn', onClick: resetChart }, t('skx.backToChart'))),
					h('div', { className: 'skxToolbar' },
						h('div', { className: 'skxTabs' },
							tabChip('downloads', t('skx.sortDownloads')),
							tabChip('installs', t('skx.sortInstalls')),
							tabChip('stars', t('skx.sortStars'))),
						h('span', { className: 'mgrSpacer' }),
						h('span', { className: 'skxLabel' }, t('skx.installTo')),
						h('select', {
							className: 'skxSelect',
							value: selectedTarget,
							'aria-label': t('skx.installTo'),
							onChange: function (event) { setTarget(event.target.value); },
						}, installTargets.map(function (root) {
							return h('option', { value: root.key, key: root.key }, root.label ?? root.key);
						}))),
					note === '' ? null : h('div', { className: 'skxNote' }, note),
					busy
						? h('div', { className: 'skxEmpty' }, t('state.loading'))
						: orderedItems.length === 0
							? h('div', { className: 'skxEmpty' }, t('skx.discoverEmpty'))
							: h('ul', { className: 'skxRows' }, orderedItems.map(function (item) {
								var key = item.slug ?? item.id ?? item.name;
								var title = item.displayName ?? item.name ?? item.slug ?? key;
								var desc = item.summary ?? item.description ?? '';
								var stats = item.stats ?? {};
								var active = preview !== null && (preview.item.slug ?? preview.item.id) === (item.slug ?? item.id);
								return h('li', {
									key: key,
									className: classes('skxRow', 'skxRowStatic', active && 'skxRowOn'),
									onClick: function () { inspect(item); },
								},
								h('div', { className: 'skxRowMain' },
									h('div', { className: 'skxRowTitle' },
										h('span', { className: 'skxRowName' }, title),
										stats.downloads === undefined ? null : h('span', { className: 'skxBadge' }, t('skx.downloads', { n: formatCount(stats.downloads) })),
										stats.stars === undefined || stats.stars === 0 ? null : h('span', { className: 'skxBadge' }, '★ ' + formatCount(stats.stars))),
									h('p', { className: 'skxRowDesc' }, desc === '' ? t('skx.noDescription') : desc),
									h('span', { className: 'skxRowMeta' }, (item.ownerHandle ?? item.owner ?? '') + ' / ' + (item.slug ?? ''))),
								h('div', { className: 'skxRowEnd' },
									h('button', { type: 'button', className: 'skxBtn skxBtnSmall', onClick: function (event) { event.stopPropagation(); inspect(item); } }, t('skx.preview')),
									h('button', {
										type: 'button',
										className: 'skxBtn skxBtnPrimary skxBtnSmall',
										disabled: installing === key,
										onClick: function (event) { event.stopPropagation(); install(item); },
									}, installing === key ? t('state.loading') : t('skx.install'))));
							}))),
				h('div', { className: 'skxDetailCol' },
					preview === null
						? h('div', { className: 'skxEmpty skxEmptyTall' }, t('skx.discoverPick'))
						: preview.loading
							? h('div', { className: 'skxEmpty skxEmptyTall' }, t('state.loading'))
							: h('div', { className: 'skxDoc' },
								h('div', { className: 'skxDocHead' },
									h('h2', { className: 'skxDocTitle' }, preview.detail?.name ?? preview.item.displayName ?? preview.item.name ?? ''),
									h('div', { className: 'skxTokens' },
										preview.detail === undefined ? null : h('span', { className: 'skxToken' }, String(preview.detail.descriptionTokens ?? 0) + ' ' + t('skx.tokenDesc')),
										preview.detail === undefined ? null : h('span', { className: 'skxToken' }, String(preview.detail.bodyTokens ?? 0) + ' ' + t('skx.tokenBody')))),
								preview.error !== undefined
									? h('div', { className: 'skxEmpty' }, preview.error)
									: h('div', { className: 'skxDocSections' },
										h('div', { className: 'skxDocSection' },
											h('div', { className: 'skxLabel' }, t('skx.description')),
											h('p', { className: 'skxProse' }, preview.detail?.description ?? '')),
										(preview.detail?.body ?? '') === '' ? null : h('div', { className: 'skxDocSection' },
											h('div', { className: 'skxLabel' }, t('skx.body')),
											h('pre', { className: 'skxPre' }, preview.detail.body))),
								h('div', { className: 'skxDocFoot' },
									h('button', { type: 'button', className: 'skxBtn skxBtnPrimary', onClick: function () { install(preview.item); } }, t('skx.install')),
									h('button', { type: 'button', className: 'skxBtn', onClick: function () { setPreview(null); } }, t('action.close'))))));

			function tabChip(id, label) {
				return h('button', {
					type: 'button',
					key: id,
					className: classes('skxChip', 'skxChipTight', sort === id && 'skxChipOn'),
					onClick: function () { setSort(id); setPreview(null); },
				}, label);
			}
		}

		/**
		 * The kernel's trash: restore or delete forever.
		 *
		 * @param {object} props - Kernel caller and restore callback.
		 * @returns {object} React node.
		 */
		function TrashPanel(props) {
			var t = props.t;
			var call = props.call;
			var [items, setItems] = useState(null);
			var [busy, setBusy] = useState(false);
			var [purging, setPurging] = useState(null);
			var loadedRef = useRef(false);

			var load = useCallback(function () {
				setBusy(true);
				return call('state').then(function (data) {
					setItems(Array.isArray(data?.trash) ? data.trash : []);
				}).catch(function (reason) {
					setItems([]);
					props.setError(messageOf(reason));
				}).finally(function () { setBusy(false); });
			}, [call]);

			useEffect(function () {
				if (props.active !== true || loadedRef.current) return;
				loadedRef.current = true;
				void load();
			}, [props.active, load]);

			var restore = function (item) {
				setBusy(true);
				call('trash-restore', { id: item.id }).then(function () {
					if (props.onRestored) props.onRestored();
					return load();
				}).catch(function (reason) {
					props.setError(messageOf(reason));
				}).finally(function () { setBusy(false); });
			};
			var purge = function (item) {
				setBusy(true);
				call('trash-delete', { id: item.id }).then(load).catch(function (reason) {
					props.setError(messageOf(reason));
				}).finally(function () { setBusy(false); });
			};
			var when = function (value) {
				if (typeof value !== 'string' || value === '') return '';
				try {
					return new Date(value).toLocaleString();
				} catch {
					return value;
				}
			};

			if (items === null) return h('div', { className: 'skxEmpty skxEmptyTall' }, t('state.loading'));

			return h('div', { style: { height: '100%' } },
				h('div', { className: 'skxSingle' },
				h('div', { className: 'skxListCol' },
					h('div', { className: 'skxHead' },
						h('div', { className: 'skxHeadMain' },
							h('span', { className: 'skxTitleMeta' }, t('skx.trashHint')))),
					items.length === 0
						? h('div', { className: 'skxEmpty' }, t('skx.trashEmpty'))
						: h('ul', { className: 'skxRows' }, items.map(function (item) {
							return h('li', { key: item.id, className: 'skxRow skxRowStatic' },
								h('div', { className: 'skxRowMain' },
									h('div', { className: 'skxRowTitle' },
										h('span', { className: 'skxRowName' }, item.name ?? item.id),
										h('span', { className: 'skxBadge' }, when(item.deletedAt))),
									h('p', { className: 'skxRowDesc' }, t('skx.trashFrom', { root: typeof item.root === 'string' ? item.root : (item.root?.key ?? '') }))),
								h('div', { className: 'skxRowEnd' },
									h('button', { type: 'button', className: 'skxBtn skxBtnSmall', disabled: busy, onClick: function () { restore(item); } }, t('skx.restore')),
									h('button', { type: 'button', className: 'skxBtn skxBtnDanger skxBtnSmall', disabled: busy, onClick: function () { setPurging(item); } }, t('skx.purge'))));
						})))),
			purging === null ? null : h(Modal, {
				title: t('skx.purgeConfirmTitle', { name: purging.name ?? purging.id }),
				onClose: function () { setPurging(null); },
				footer: h('div', { className: 'skxRowActions' },
					h('button', {
						type: 'button',
						className: 'skxBtn skxBtnDanger',
						disabled: busy,
						onClick: function () {
							var item = purging;
							setPurging(null);
							purge(item);
						},
					}, t('skx.purge')),
					h('button', { type: 'button', className: 'skxBtn', onClick: function () { setPurging(null); } }, t('action.cancel'))),
			},
				h('p', { className: 'skxProse' }, t('skx.purgeConfirmDesc'))));
		}

		//#endregion

		//#region mcp view

		/**
		 * Parse the environment textarea.
		 *
		 * @param {string} text - KEY=VALUE lines.
		 * @returns {Record<string, string> | undefined} Parsed map, or undefined when invalid.
		 */
		function parseEnv(text) {
			var env = {};
			var lines = text.split('\n');
			for (var index = 0; index < lines.length; index += 1) {
				var line = lines[index].trim();
				if (line === '') continue;
				var equals = line.indexOf('=');
				if (equals <= 0) return undefined;
				var key = line.slice(0, equals).trim();
				var value = line.slice(equals + 1).trim();
				if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return undefined;
				if (value !== '') env[key] = value;
			}
			return env;
		}

		/**
		 * Add or edit one MCP server.
		 *
		 * @param {object} props - `mode`, `server`, `credentials`, `t`, `onSubmit`, `onClose`.
		 * @returns {object} React node.
		 */
		function McpForm(props) {
			var editing = props.mode === 'edit';
			var t = props.t;
			var server = props.server;
			var [name, setName] = useState(editing ? server.name : '');
			var [command, setCommand] = useState(editing ? server.command : '');
			var [argsText, setArgsText] = useState(editing ? server.args.join('\n') : '');
			var [cwd, setCwd] = useState(editing ? server.cwd : '');
			var [envText, setEnvText] = useState('');
			var [clearEnv, setClearEnv] = useState(false);
			var [enabled, setEnabled] = useState(editing ? server.enabled : true);
			var [error, setError] = useState('');
			var [busy, setBusy] = useState(false);
			function submit(event) {
				if (event) event.preventDefault();
				var nameValue = name.trim();
				var commandValue = command.trim();
				if (nameValue === '' || commandValue === '') {
					setError(t('mcp.form.required'));
					return;
				}
				var args = argsText.split('\n').map(function (line) { return line.trim(); }).filter(function (line) { return line !== ''; });
				var payload = {
					name: nameValue,
					command: commandValue,
					args: args,
					cwd: cwd.trim(),
					enabled: enabled,
				};
				if (editing) payload.id = server.id;
				if (clearEnv) {
					payload.env = {};
				} else if (envText.trim() !== '') {
					var parsed = parseEnv(envText);
					if (parsed === undefined) {
						setError(t('mcp.form.invalidEnv'));
						return;
					}
					if (props.credentials !== true && Object.keys(parsed).length > 0) {
						setError(t('mcp.noCredentials'));
						return;
					}
					payload.env = parsed;
				}
				setBusy(true);
				setError('');
				props.onSubmit(payload)
					.catch(function (reason) { setError(messageOf(reason)); })
					.then(function () { setBusy(false); });
			}
			return h(Modal, {
				title: editing ? t('mcp.form.editTitle') : t('mcp.form.addTitle'),
				onClose: props.onClose,
				footer: [
					h('button', { type: 'button', className: 'mgrBtn', key: 'cancel', onClick: props.onClose }, t('action.cancel')),
					h('button', { type: 'submit', className: 'mgrBtn mgrBtnPrimary', key: 'submit', form: 'mgr-mcp-form', disabled: busy }, t('mcp.form.submit')),
				],
			},
				h('form', { id: 'mgr-mcp-form', onSubmit: submit },
					error === '' ? null : h('p', { className: 'mgrFormError' }, error),
					h(Field, { label: t('mcp.form.name'), hint: t('mcp.form.nameHint'), htmlFor: 'mgr-mcp-name' },
						h('input', {
							id: 'mgr-mcp-name',
							className: 'mgrInput',
							value: name,
							placeholder: 'github',
							onChange: function (event) { setName(event.target.value); },
						})),
					h(Field, { label: t('mcp.form.command'), hint: t('mcp.form.commandHint'), htmlFor: 'mgr-mcp-command' },
						h('input', {
							id: 'mgr-mcp-command',
							className: 'mgrInput',
							value: command,
							placeholder: 'npx',
							onChange: function (event) { setCommand(event.target.value); },
						})),
					h(Field, { label: t('mcp.form.args'), hint: t('mcp.form.argsHint'), htmlFor: 'mgr-mcp-args' },
						h('textarea', {
							id: 'mgr-mcp-args',
							className: 'mgrTextarea',
							value: argsText,
							rows: 3,
							placeholder: '-y\n@modelcontextprotocol/server-github',
							onChange: function (event) { setArgsText(event.target.value); },
						})),
					h(Field, { label: t('mcp.form.cwd'), hint: t('mcp.form.cwdHint'), htmlFor: 'mgr-mcp-cwd' },
						h('input', {
							id: 'mgr-mcp-cwd',
							className: 'mgrInput',
							value: cwd,
							placeholder: '/Users/you/project',
							onChange: function (event) { setCwd(event.target.value); },
						})),
					h(Field, {
						label: t('mcp.form.env'),
						hint: props.credentials === true
							? (editing && server.envKeys.length > 0
								? t('mcp.form.envSaved', { n: server.envKeys.length, keys: server.envKeys.join(', ') }) + ' ' + t('mcp.form.envKeep')
								: t('mcp.form.envHint'))
							: t('mcp.noCredentials'),
						htmlFor: 'mgr-mcp-env',
					},
						h('textarea', {
							id: 'mgr-mcp-env',
							className: 'mgrTextarea',
							value: envText,
							rows: 3,
							disabled: props.credentials !== true || clearEnv,
							placeholder: 'GITHUB_TOKEN=xxx',
							onChange: function (event) { setEnvText(event.target.value); },
						}),
						editing && server.envKeys.length > 0 && props.credentials === true
							? h('label', { className: 'mgrFieldHint', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
								h('input', {
									type: 'checkbox',
									checked: clearEnv,
									onChange: function (event) { setClearEnv(event.target.checked); },
								}),
								t('mcp.form.clearEnv'))
							: null),
					h('label', { className: 'mgrFieldHint', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
						h('input', {
							type: 'checkbox',
							checked: enabled,
							onChange: function (event) { setEnabled(event.target.checked); },
						}),
						t('mcp.form.enabled'))));
		}

		/**
		 * The MCP server list.
		 *
		 * @param {object} props - Panel data and actions.
		 * @returns {object} React node.
		 */
		function McpSection(props) {
			var t = props.t;
			var mcp = props.mcp;
			var [openTools, setOpenTools] = useState({});
			var [confirming, setConfirming] = useState('');
			var [editing, setEditing] = useState(null);
			function stateLabel(server) {
				if (!server.enabled) return t('mcp.state.stopped');
				if (server.state === 'stopped') return t('mcp.state.connecting');
				return t('mcp.state.' + server.state);
			}
			function tone(server) {
				if (!server.enabled) return '';
				if (server.state === 'ready') return 'Ok';
				if (server.state === 'connecting') return 'Warn';
				if (server.state === 'error') return 'Error';
				return '';
			}
			return h('div', null,
				h('div', { className: 'mgrToolbar' },
					h('div', { className: 'mgrHint' }, t('mcp.note')),
					h('span', { className: 'mgrToolbarSpacer' }),
					h('button', {
						type: 'button',
						className: 'mgrBtn mgrBtnPrimary',
						disabled: props.busy || mcp.available !== true,
						onClick: function () { setEditing({ mode: 'add', server: null }); },
					}, t('mcp.add'))),
				mcp.available === true ? null : h('div', { className: 'mgrWarn' }, t('mcp.unavailable')),
				mcp.credentials === true ? null : h('div', { className: 'mgrWarn' }, t('mcp.noCredentials')),
				mcp.servers.length === 0 ? h('div', { className: 'mgrEmpty' }, t('mcp.empty')) : mcp.servers.map(function (server) {
					var toolsOpen = openTools[server.id] === true;
					var envLabel = server.envKeys.length === 0 ? t('mcp.noEnv') : server.envKeys.join(', ');
					return h('div', { className: 'mgrServer', key: server.id },
						h('div', { className: 'mgrServerHead' },
							h('span', { className: 'mgrDot mgrDot-' + (server.enabled ? server.state : 'stopped'), 'aria-hidden': true }),
							h('span', { className: 'mgrServerName' }, server.name),
							h(Badge, { tone: tone(server) }, stateLabel(server)),
							server.enabled ? h('span', { className: 'mgrMeta' }, t('mcp.toolsCount', { n: server.tools.length })) : null,
							h('span', { className: 'mgrSpacer' }),
							h(Switch, {
								checked: server.enabled,
								disabled: props.busy || mcp.available !== true,
								label: server.name,
								onChange: function (next) { props.onToggle(server.id, next); },
							})),
						h('div', { className: 'mgrCommand' }, server.command + (server.args.length > 0 ? ' ' + server.args.join(' ') : '')),
						server.cwd === '' ? null : h('div', { className: 'mgrMeta' }, server.cwd),
						h('div', { className: 'mgrMeta' }, t('mcp.envKeys') + '：' + envLabel),
						server.error === '' ? null : h('div', { className: 'mgrServerError' }, server.error),
						h('div', { className: 'mgrServerActions' },
							h('button', {
								type: 'button',
								className: 'mgrBtn',
								disabled: !server.enabled || props.busy || mcp.available !== true,
								onClick: function () { props.onReconnect(server.id); },
							}, t('action.reconnect')),
							h('button', {
								type: 'button',
								className: 'mgrBtn',
								onClick: function () {
									setOpenTools(function (current) {
										var next = { ...current };
										next[server.id] = current[server.id] !== true;
										return next;
									});
								},
							}, (toolsOpen ? t('mcp.hideTools') : t('mcp.showTools')) + ' (' + server.tools.length + ')'),
							h('button', {
								type: 'button',
								className: 'mgrBtn',
								onClick: function () { setEditing({ mode: 'edit', server: server }); },
							}, t('action.edit')),
							confirming === server.id
								? [
									h('button', {
										type: 'button',
										className: 'mgrBtn mgrBtnDanger',
										key: 'confirm',
										disabled: props.busy,
										onClick: function () {
											props.onRemove(server.id).then(function () { setConfirming(''); }).catch(function () {});
										},
									}, t('mcp.deleteConfirm')),
									h('button', {
										type: 'button',
										className: 'mgrBtn',
										key: 'cancel',
										onClick: function () { setConfirming(''); },
									}, t('action.cancel')),
								]
								: h('button', {
									type: 'button',
									className: 'mgrBtn mgrBtnDanger',
									onClick: function () { setConfirming(server.id); },
								}, t('action.delete'))),
						!toolsOpen ? null : h('div', { className: 'mgrToolList' },
							server.tools.length === 0 ? h('div', { className: 'mgrMeta' }, t('mcp.toolsEmpty')) : server.tools.map(function (tool) {
								return h('div', { className: 'mgrToolRow', key: tool.public },
									h('div', { className: 'mgrToolName' }, tool.public),
									tool.description === '' ? null : h('div', { className: 'mgrToolDesc' }, tool.description));
							})),
						!toolsOpen || server.stderr.length === 0 ? null : h('div', null,
							h('div', { className: 'mgrLabel', style: { margin: '10px 0 6px' } }, t('mcp.stderr')),
							h('pre', { className: 'mgrPre' }, server.stderr.join('\n'))));
				}),
				editing === null ? null : h(McpForm, {
					mode: editing.mode,
					server: editing.server,
					credentials: mcp.credentials,
					t: t,
					onClose: function () { setEditing(null); },
					onSubmit: function (payload) {
						return props.onSave(payload).then(function () { setEditing(null); });
					},
				}));
		}

		//#endregion

		//#region search view

		/**
		 * One configurable search channel.
		 *
		 * The switch is saved immediately; the rest of the form is saved on
		 * demand so typing a key never changes the live search config halfway.
		 * Keys are write-only: the input clears after a save and the Host never
		 * sends a value back.
		 *
		 * @param {object} props - Channel view, translator and callbacks.
		 * @returns {object} React node.
		 */
		function SearchChannelRow(props) {
			var t = props.t;
			var channel = props.channel;
			var [open, setOpen] = useState(false);
			var [apiKey, setApiKey] = useState('');
			var [baseUrl, setBaseUrl] = useState(channel.baseUrl);
			var [saving, setSaving] = useState(false);
			var [testing, setTesting] = useState(false);
			var [test, setTest] = useState(null);
			var [formError, setFormError] = useState('');

			useEffect(function () {
				setBaseUrl(channel.baseUrl);
			}, [channel.baseUrl]);

			var descKey = 'search.channel.' + channel.id + '.desc';
			var description = t(descKey);
			if (typeof description !== 'string' || description === '' || description === descKey) {
				description = channel.description;
			}

			var keyBadge;
			if (channel.keyConfigured) {
				keyBadge = h(Badge, { tone: 'Ok' }, channel.keySource === 'env' ? t('search.channel.keyEnv') : channel.keySource === 'host' ? t('search.channel.keyHost') : t('search.channel.keyConfigured'));
			} else if (channel.requiresKey) {
				keyBadge = h(Badge, { tone: 'Warn' }, t('search.channel.keyMissing'));
			} else {
				keyBadge = h(Badge, { tone: 'Ok' }, t('search.channel.keyless'));
			}
			var freeBadge = channel.free === true ? h(Badge, { tone: 'Free' }, t('search.free')) : null;
			var cooldownBadge = Number(channel.cooldownMs) > 0
				? h(Badge, { tone: 'Warn' }, t('search.cooldown', { s: Math.ceil(Number(channel.cooldownMs) / 1000) }))
				: null;

			function fail(reason) {
				setFormError(messageOf(reason));
			}

			function toggle(enabled) {
				setSaving(true);
				setFormError('');
				return props.onSave({ id: channel.id, enabled: enabled }).catch(fail).then(function () {
					setSaving(false);
				});
			}

			function move(direction) {
				setSaving(true);
				setFormError('');
				return props.onMove(channel.id, direction, props.moveOrder).catch(fail).then(function () {
					setSaving(false);
				});
			}

			function save() {
				setSaving(true);
				setFormError('');
				setTest(null);
				return props.onSave({
					id: channel.id,
					baseUrl: baseUrl,
					apiKey: apiKey,
				}).then(function () {
					setApiKey('');
				}).catch(fail).then(function () {
					setSaving(false);
				});
			}

			function clearKey() {
				setSaving(true);
				setFormError('');
				setTest(null);
				return props.onSave({ id: channel.id, clearKey: true }).then(function () {
					setApiKey('');
				}).catch(fail).then(function () {
					setSaving(false);
				});
			}

			function runTest() {
				setTesting(true);
				setTest(null);
				setFormError('');
				return props.onTest(channel.id, props.defaultQuery).then(function (value) {
					setTest(value);
				}).catch(function (reason) {
					setTest({ ok: false, id: channel.id, label: channel.label, count: 0, sources: [], failure: { code: '', message: messageOf(reason) } });
				}).then(function () {
					setTesting(false);
				});
			}

			var testSources = test !== null && Array.isArray(test.sources) ? test.sources : [];
			var testView = test === null ? null : h('div', { className: classes('mgrSearchTest', test.ok === true ? 'mgrSearchTestOk' : 'mgrSearchTestError') },
				h('div', { className: 'mgrSearchTestTitle' },
					test.ok === true
						? t('search.channel.testOk', { n: test.count, ms: test.elapsedMs })
						: t('search.channel.testFail') + (test.failure && test.failure.code ? ' · ' + test.failure.code : '')),
				test.query ? h('div', { className: 'mgrHint' }, t('search.channel.testQuery', { query: test.query })) : null,
				test.ok === true
					? (testSources.length === 0
						? h('div', { className: 'mgrHint' }, t('search.noResults'))
						: testSources.map(function (source, index) {
							return h('div', { className: 'mgrSearchTestItem', key: source.url + '#' + index }, (index + 1) + '. ' + (source.title === '' ? source.url : source.title));
						}))
					: h('div', { className: 'mgrHint' }, test.failure && test.failure.message ? test.failure.message : ''));

			var keyField;
			if (channel.keySupported === false) {
				keyField = h('div', { className: 'mgrField mgrSearchChannelField' },
					h('span', { className: 'mgrLabel' }, t('search.channel.apiKey')),
					h('div', { className: 'mgrHint' }, t('search.channel.noKeyNeeded')));
			} else {
				keyField = h('div', { className: 'mgrField mgrSearchChannelField' },
					h('span', { className: 'mgrLabel' }, t('search.channel.apiKey')),
					h('input', {
						className: 'mgrInput',
						type: 'password',
						value: apiKey,
						placeholder: channel.keyConfigured
							? (channel.keySource === 'env' ? t('search.channel.apiKeyEnvKeep') : channel.keySource === 'host' ? t('search.channel.apiKeyHostKeep') : t('search.channel.apiKeyKeep'))
							: (channel.requiresKey ? t('search.channel.apiKeyNew') : (channel.id === 'searxng' ? t('search.channel.apiKeyOptional') : t('search.channel.apiKeyOptionalFree'))),
						autoComplete: 'new-password',
						spellCheck: false,
						disabled: saving || channel.keyWritable !== true,
						onChange: function (event) { setApiKey(event.target.value); },
					}),
					h('span', { className: 'mgrFieldHint' },
						channel.keyWritable !== true
							? t('search.channel.noCredentials')
							: (channel.envName ? t('search.channel.envHint', { env: channel.envName }) + ' · ' + t('search.channel.apiKeyMulti') : t('search.channel.apiKeyMulti'))));
			}

			// 12x12 stroke glyphs instead of text arrows: row actions are one
			// type system (12.5px labels) plus one icon language, not two.
			function arrowIcon(d) {
				return h('svg', {
					width: 12,
					height: 12,
					viewBox: '0 0 12 12',
					fill: 'none',
					stroke: 'currentColor',
					strokeWidth: 1.5,
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					'aria-hidden': true,
				}, h('path', { d: d }));
			}

			return h('div', { className: classes('mgrSearchChannel', channel.enabled !== true && 'mgrSearchChannelOff') },
				h('div', { className: 'mgrSearchChannelHead' },
					h('div', { className: 'mgrSearchChannelMain' },
						// The switch rides the name row so the text column can take the
						// whole card width; the actions become one line at the card foot.
						h('div', { className: 'mgrSearchChannelNameRow' },
							h('div', { className: 'mgrSearchChannelName' }, channel.label),
							h('div', { className: 'mgrSearchChannelBadges' }, freeBadge, keyBadge, cooldownBadge),
							h(Switch, {
								checked: channel.enabled,
								disabled: saving || props.bulkBusy === true,
								label: t('search.channel.enable'),
								onChange: function (next) { void toggle(next); },
							})),
						h('div', { className: 'mgrSearchChannelDesc' }, description)),
					h('div', { className: 'mgrSearchChannelActions' },
						h('div', { className: 'mgrSearchOrder' },
							h('button', {
								type: 'button',
								className: 'mgrIconBtn',
								title: t('search.moveUp'),
								'aria-label': t('search.moveUp'),
								disabled: saving || props.canMoveUp !== true,
								onClick: function () { void move('up'); },
							}, arrowIcon('M6 10V2M2.5 5.5L6 2l3.5 3.5')),
							h('button', {
								type: 'button',
								className: 'mgrIconBtn',
								title: t('search.moveDown'),
								'aria-label': t('search.moveDown'),
								disabled: saving || props.canMoveDown !== true,
								onClick: function () { void move('down'); },
							}, arrowIcon('M6 2v8M2.5 6.5L6 10l3.5-3.5'))),
						h('button', {
							type: 'button',
							className: 'mgrBtn',
							disabled: testing || saving,
							onClick: runTest,
						}, testing ? t('search.channel.testing') : t('search.channel.test')),
						h('button', {
							type: 'button',
							className: 'mgrBtn',
							onClick: function () { setOpen(!open); },
						}, open ? t('search.channel.hide') : t('search.channel.configure')))),
				open === false ? null : h('div', { className: 'mgrSearchChannelBody' },
					h('div', { className: 'mgrSearchChannelGrid' },
						keyField,
						h('div', { className: 'mgrField mgrSearchChannelField' },
							h('span', { className: 'mgrLabel' }, t('search.channel.baseUrl')),
							h('input', {
								className: 'mgrInput',
								type: 'text',
								value: baseUrl,
								placeholder: channel.defaultBaseUrl,
								spellCheck: false,
								disabled: saving,
								onChange: function (event) { setBaseUrl(event.target.value); },
							}),
							h('span', { className: 'mgrFieldHint' }, t('search.channel.baseUrlHint', { url: channel.defaultBaseUrl })))),
					h('div', { className: 'mgrSearchChannelFoot' },
						h('button', { type: 'button', className: 'mgrBtn mgrBtnPrimary', disabled: saving, onClick: save },
							saving ? t('search.channel.saving') : t('search.channel.save')),
						channel.keyConfigured === true && channel.keySource === 'record' && channel.keyWritable === true
							? h('button', { type: 'button', className: 'mgrBtn mgrBtnDanger', disabled: saving, onClick: clearKey }, t('search.channel.clearKey'))
							: null,
						h('span', { className: 'mgrSpacer' }),
						h('span', { className: 'mgrHint' }, t('search.channel.testHint')))),
				formError === '' && test === null
					? null
					: h('div', { className: 'mgrSearchChannelResult' },
						formError === '' ? null : h('div', { className: 'mgrFormError' }, formError),
						testView));
		}

		/**
		 * The results page of the web-search tab.
		 *
		 * Per-channel chips say which channel answered or why it failed; the
		 * sources are plain text and HTTP(S) links only.
		 *
		 * @param {object} props - `t`, `busy`, `result` and `error`.
		 * @returns {object} React node.
		 */
		function SearchResults(props) {
			var t = props.t;
			if (props.busy === true) return h(Loading, { label: t('search.running') });
			if (props.error !== null && props.error !== undefined) {
				var error = props.error;
				return h('div', { className: 'mgrErrorBox' },
					h('span', null,
						h('b', null, t('search.failed') + (typeof error.code === 'string' && error.code !== '' ? ' · ' + error.code : '')),
						h('br'),
						error.message));
			}
			var result = props.result;
			if (result === null || result === undefined) {
				return h('div', { className: 'mgrEmpty' }, t('search.emptyIdle'));
			}
			var sources = Array.isArray(result.sources) ? result.sources : [];
			var channelResults = Array.isArray(result.channels) ? result.channels : [];
			var content = typeof result.content === 'string' ? result.content : '';
			var allFailed = channelResults.length > 0 && channelResults.every(function (channel) { return channel.ok !== true; });
			var chips = channelResults.map(function (channel) {
				var failed = channel.ok !== true;
				return h('span', {
					className: classes('mgrSearchChip', failed && 'mgrSearchChipError'),
					key: channel.id,
					title: failed && channel.error ? channel.error.message : '',
				}, failed
					? t('search.chipFail', { label: channel.label, code: channel.error ? channel.error.code : 'error' })
					: t('search.chipOk', { label: channel.label, n: channel.count }));
			});
			return h('div', { className: 'mgrSearchResults' },
				h('div', { className: 'mgrSearchSummary' },
					h('span', null, t('search.resultCount', { n: sources.length, ms: result.elapsedMs || 0 })),
					result.cached === true ? h(Badge, { tone: 'Ok' }, t('search.cached')) : null),
				chips.length === 0 ? null : h('div', { className: 'mgrSearchChips' }, chips),
				sources.length === 0 && content === ''
					? null
					: h('div', { className: 'mgrHint', style: { margin: '4px 0 10px' } }, t('search.external')),
				content === ''
					? null
					: h('div', { className: 'mgrSearchAnswer' },
						h('div', { className: 'mgrSearchAnswerTitle' }, t('search.answer')),
						h('div', { className: 'mgrSearchAnswerBody' }, content)),
				sources.length === 0
					? h('div', { className: 'mgrEmpty' }, result.allCooling === true ? t('search.allCooling') : allFailed ? t('search.allFailed') : t('search.noResults'))
					: h('div', { className: 'mgrSearchList' },
						sources.map(function (source, rank) {
							var host = hostOf(source.url);
							return h('div', { className: 'mgrSearchResult', key: source.url + '#' + rank },
								h('div', { className: 'mgrSearchResultHead' },
									h('span', { className: 'mgrSearchRank' }, String(rank + 1)),
									h('a', {
										className: 'mgrSearchLink',
										href: source.url,
										target: '_blank',
										rel: 'noopener noreferrer',
										title: t('search.open'),
									}, source.title === '' ? source.url : source.title),
									h('span', { className: 'mgrSearchChannelTag' }, source.channelLabel || source.channel || ''),
									host === '' ? null : h('span', { className: 'mgrSearchHost' }, host)),
								source.snippet === '' ? null : h('div', { className: 'mgrSearchSnippet' }, source.snippet),
								source.publishedAt === '' ? null : h('div', { className: 'mgrSearchDate' }, source.publishedAt));
						})));
		}

		/**
		 * The channel page: the search mode, the all-channel check and one row
		 * per channel. The filter box exists because thirty-seven rows are more
		 * than scrolled reading can carry without a needle.
		 *
		 * @param {object} props - Status fields and callbacks.
		 * @returns {object} React node.
		 */
		/**
		 * The search-mode switches.
		 *
		 * A mode decides how the enabled channels are combined; the numbers above
		 * the buttons are the result cap and the per-channel cap. It sits in the
		 * settings pane, next to the other things that shape a search.
		 *
		 * @param {object} props - `t`, `mode`, `maxResults`, `perChannel`, `onMode`.
		 * @returns {object} React node.
		 */
		function SearchModeCard(props) {
			var t = props.t;
			var mode = props.mode;

			function modeButton(id, label) {
				return h('button', {
					type: 'button',
					key: id,
					className: classes('mgrBtn', mode === id && 'mgrBtnPrimary'),
					onClick: function () { if (mode !== id) void props.onMode(id); },
				}, label);
			}

			return h('div', { className: 'mgrSearchCard' },
					h('div', { className: 'mgrSearchCardHead' },
						h('span', { className: 'mgrSearchCardTitle' }, t('search.mode')),
						h('span', { className: 'mgrHint' }, t('search.maxResults', { n: props.maxResults, per: props.perChannel }))),
					h('div', { className: 'mgrSearchControls' },
						modeButton('merge', t('search.modeMerge')),
						modeButton('fallback', t('search.modeFallback')),
						modeButton('auto', t('search.modeAuto')),
						h('span', { className: 'mgrHint' }, mode === 'fallback'
							? t('search.modeFallbackHint')
							: mode === 'auto' ? t('search.modeAutoHint') : t('search.modeMergeHint'))));
		}

		/**
		 * The channel list: one row per channel, with its switch, test and form.
		 *
		 * @param {object} props - Channel rows and the callbacks they need.
		 * @returns {object} React node.
		 */
		function SearchChannels(props) {
			var t = props.t;
			var channels = props.channels;
			var [filter, setFilter] = useState('');
			var [onlyEnabled, setOnlyEnabled] = useState(false);
			var needle = filter.trim().toLowerCase();
			// Enabled rows first, each group in the stored order, so the result of
			// a bulk switch is visible without scrolling through thirty-seven rows.
			// Besides the list this pass decides what the bulk switch says and what
			// one click would change.
			var ordered = [];
			var usableIds = [];
			var enabledIds = [];
			var usableCount = 0;
			var usableOn = 0;
			var freeCount = 0;
			var keyedCount = 0;
			var missingCount = 0;
			var index;
			for (index = 0; index < channels.length; index += 1) {
				var channel = channels[index];
				var usable = channel.free === true || channel.keyConfigured === true;
				if (channel.free === true) freeCount += 1;
				if (channel.keyConfigured === true) keyedCount += 1;
				else if (channel.requiresKey === true) missingCount += 1;
				if (usable) {
					usableCount += 1;
					if (channel.enabled === true) usableOn += 1;
					else usableIds.push(channel.id);
				}
				if (channel.enabled === true) {
					enabledIds.push(channel.id);
					ordered.push(channel);
				}
			}
			// Two states only: "on" means every usable channel is on. A paid
			// channel without a key stays off and never spoils the reading.
			var allUsableOn = usableCount > 0 && usableOn === usableCount;
			for (index = 0; index < channels.length; index += 1) {
				if (channels[index].enabled !== true) ordered.push(channels[index]);
			}
			var orderedIds = ordered.map(function (entry) { return entry.id; });
			var visible = [];
			for (index = 0; index < ordered.length; index += 1) {
				channel = ordered[index];
				if (onlyEnabled === true && channel.enabled !== true) continue;
				if (needle !== '') {
					var haystack = (channel.label + ' ' + channel.description + ' ' + channel.id).toLowerCase();
					if (haystack.indexOf(needle) < 0) continue;
				}
				visible.push(channel);
			}
			var filtering = needle !== '' || onlyEnabled === true;
			var testAll = props.testAll === null || props.testAll === undefined ? null : props.testAll;

			return h('div', null,
				// The action itself sits on the sub-tab row; its result stays here
				// without a container of its own, so the first screen starts with
				// the channel list instead of a framed tool block.
				testAll === null ? null : h('div', { className: 'mgrSearchChips' },
					h('span', { className: 'mgrHint' }, t('search.testAllSummary', { ok: testAll.ok, total: testAll.total })),
					testAll.results.map(function (entry) {
						return h('span', {
							className: classes('mgrSearchChip', entry.ok !== true && 'mgrSearchChipError'),
							key: entry.id,
							title: entry.ok === true ? '' : entry.failure ? entry.failure.message : '',
						}, entry.ok === true
							? t('search.chipOk', { label: entry.label, n: entry.count })
							: t('search.chipFail', { label: entry.label, code: entry.failure ? entry.failure.code : 'error' }));
					})),
				h('div', { className: 'mgrSearchChannels' },
					h('div', { className: 'mgrSearchChannelsHead' },
						h('span', { className: 'mgrSearchChannelsTitle' }, t('search.channels')),
						h('div', { className: 'mgrSearchChannelStats' },
							h('span', { className: 'mgrCount mgrSearchStatLead' }, t('search.channelsCount', { enabled: props.enabled, total: channels.length })),
							h('span', { className: 'mgrCount' }, t('search.statFree', { n: freeCount })),
							h('span', { className: 'mgrCount' }, t('search.statKeyed', { n: keyedCount })),
							h('span', {
								className: classes('mgrCount', missingCount > 0 && 'mgrSearchStatWarn'),
							}, t('search.statKeyMissing', { n: missingCount })))),
					h('div', { className: 'mgrSearchChannelFilter' },
						h('input', {
							className: 'mgrInput',
							type: 'search',
							value: filter,
							placeholder: t('search.channelFilterPlaceholder'),
							'aria-label': t('search.channelFilterPlaceholder'),
							onChange: function (event) { setFilter(event.target.value); },
						}),
						h('label', { className: 'mgrSearchSafeWrap' },
							h('input', {
								type: 'checkbox',
								checked: onlyEnabled,
								onChange: function (event) { setOnlyEnabled(event.target.checked); },
							}),
							h('span', { className: 'mgrHint' }, t('search.onlyEnabled'))),
						h('div', { className: 'mgrSearchBulk' },
							h('span', { className: 'mgrHint', title: t('search.bulkUsableHint') }, t('search.bulkUsable')),
							h(Switch, {
								checked: allUsableOn,
								disabled: props.bulkBusy === true,
								label: t('search.bulkUsable'),
								onChange: function (next) {
									// On turns the usable channels on and leaves a paid
									// channel without a key alone; off turns everything
									// off, so the list really is empty afterwards.
									void props.onSetChannels(next === true ? usableIds : enabledIds, next);
								},
							}),
							props.bulkBusy === true
								? h('span', { className: 'mgrHint' }, t('search.enabling'))
								: null)),
					filtering === true
						? h('div', { className: 'mgrHint mgrSearchFilterCount' }, t('search.filteredCount', { shown: visible.length, total: channels.length }))
						: null,
					visible.length === 0
						? h('div', { className: 'mgrEmpty' }, t('search.filteredEmpty'))
						: null,
					visible.map(function (row) {
						var full = ordered.indexOf(row);
						return h(SearchChannelRow, {
							key: row.id,
							channel: row,
							t: t,
							defaultQuery: props.query.trim() === '' ? 'DeepSeek Harness' : props.query.trim(),
							onSave: props.onSave,
							onTest: props.onTest,
							onMove: props.onMove,
							// The arrows move a row inside the list as drawn, which is
							// why the batch order is handed over as well: the stored
							// order alone would move a row the grouping hides.
							moveOrder: orderedIds,
							bulkBusy: props.bulkBusy === true,
							canMoveUp: full > 0,
							canMoveDown: full >= 0 && full < ordered.length - 1,
						});
					})));
		}

		/**
		 * The web-search tab.
		 *
		 * The query box stays at the top because it is the primary action of the
		 * whole tab. Everything else is split into three sub-tabs — results,
		 * channels and filter — so a thirty-seven-row channel list no longer
		 * pushes the answer off the screen. The inactive pages stay mounted but
		 * hidden, so an unsaved key or an open channel form survives a look at
		 * the results.
		 *
		 * @param {object} props - Status, query state, result, sub-tab and callbacks.
		 * @returns {object} React node.
		 */
		function SearchSection(props) {
			var t = props.t;
			var status = props.status;
			var result = props.result;
			var error = props.error;
			var busy = props.busy;
			var sub = props.sub;
			var channels = status !== null && Array.isArray(status.channels) ? status.channels : [];
			var enabled = 0;
			for (var index = 0; index < channels.length; index += 1) {
				if (channels[index].enabled === true) enabled += 1;
			}
			var maxResults = status !== null && Number.isFinite(status.maxResults) ? status.maxResults : 20;
			var perChannel = status !== null && Number.isFinite(status.perChannelResults) ? status.perChannelResults : 10;
			var available = status !== null && enabled > 0;
			var mode = status !== null && status.mode === 'fallback'
				? 'fallback'
				: status !== null && status.mode === 'auto' ? 'auto' : 'merge';
			var modeLabel = mode === 'fallback' ? t('search.modeFallback') : mode === 'auto' ? t('search.modeAuto') : t('search.modeMerge');
			var safeSearch = status === null || status.safeSearch !== false;
			var cooldowns = status !== null && status.cooldowns !== null && typeof status.cooldowns === 'object' ? status.cooldowns : {};
			var hasCooldown = Object.keys(cooldowns).length > 0;
			var statusError = status !== null && typeof status.error === 'string' ? status.error : '';
			var sources = result === null || !Array.isArray(result.sources) ? [] : result.sources;
			var blockedDomains = status !== null && Array.isArray(status.blockedDomains) ? status.blockedDomains : [];

			function submit() {
				if (busy === true || !available) return;
				if (props.query.trim() === '') return;
				props.onSearch();
			}

			function onKeyDown(event) {
				// Enter also confirms an IME candidate; searching there would
				// fire before the Chinese/Japanese text is committed.
				if (event.isComposing === true || event.keyCode === 229) return;
				if (event.key !== 'Enter' || event.shiftKey) return;
				event.preventDefault();
				submit();
			}

			var tabs = [
				{ id: 'results', label: t('search.sub.results'), count: sources.length > 0 ? String(sources.length) : '' },
				{ id: 'channels', label: t('search.sub.channels'), count: channels.length > 0 ? enabled + '/' + channels.length : '' },
				// The mode switches and the domain filter are both settings; they share
				// one tab instead of taking the top of the channel list.
				{ id: 'settings', label: t('search.sub.settings'), count: blockedDomains.length === 0 ? '' : String(blockedDomains.length) },
			];
			var tabView = h('div', { className: 'mgrSubTabsBar' },
				h('div', { className: 'mgrSubTabs', role: 'tablist', 'aria-label': t('search.subtabs') },
					tabs.map(function (entry) {
						return h('button', {
							type: 'button',
							role: 'tab',
							key: entry.id,
							'aria-selected': sub === entry.id,
							className: classes('mgrTab', sub === entry.id && 'mgrTabActive'),
							onClick: function () { props.setSub(entry.id); },
						},
							entry.label,
							entry.count === '' ? null : h('span', { className: 'mgrTabCount' }, entry.count));
					})),
				// The all-channel check is a secondary action, so it rides the
				// sub-tab row as text instead of framing another card above the list.
				// It only belongs to the channel pane: on the other panes a click
				// would test something the reader cannot see.
				sub === 'channels' ? h('div', { className: 'mgrSubActions' },
					h('button', {
						type: 'button',
						className: 'mgrTextAction',
						title: t('search.testHint'),
						disabled: available !== true || props.testAllBusy === true,
						onClick: function () { void props.onTestAll(); },
					}, props.testAllBusy === true ? t('search.testAllRunning') : t('search.testAll')),
					hasCooldown === true
						? h('button', {
							type: 'button',
							className: 'mgrTextAction',
							onClick: function () { void props.onResetCooldowns(); },
						}, t('search.resetCooldowns'))
						: null) : null);
			// A real search costs quota and cooldown time; the cost stays visible
			// instead of hiding in the action's title.
			var testCostView = sub === 'channels'
				? h('div', { className: 'mgrHint mgrSubHint' }, t('search.testCost'))
				: null;

			var barView = h('div', { className: 'mgrSearchBar' },
				h('input', {
					className: 'mgrInput',
					type: 'search',
					value: props.query,
					placeholder: t('search.placeholder'),
					'aria-label': t('search.placeholder'),
					enterKeyHint: 'search',
					autoFocus: true,
					disabled: !available,
					onChange: function (event) { props.setQuery(event.target.value); },
					onKeyDown: onKeyDown,
				}),
				h('button', {
					type: 'button',
					className: 'mgrBtn mgrBtnPrimary mgrSearchGo',
					disabled: !available || busy === true || props.query.trim() === '',
					onClick: submit,
				}, busy === true ? t('search.submitBusy') : t('search.submit')));

			var metaView = h('div', { className: 'mgrSearchMeta' },
				h('span', { className: 'mgrHint' }, t('search.modeCurrent', { mode: modeLabel })),
				h('button', {
					type: 'button',
					className: 'mgrLinkBtn',
					onClick: function () { props.setSub('settings'); },
				}, t('search.modeJump')),
				h('span', { className: 'mgrSpacer' }),
				// Time and safe search wrap together, never one of them alone.
				h('div', { className: 'mgrSubMetaGroup' },
				h('label', { className: 'mgrSearchTimeWrap', title: t('search.timeTitle') },
					h('span', { className: 'mgrHint' }, t('search.time')),
					h('select', {
						className: 'mgrInput mgrSearchTime',
						value: props.timeRange || '',
						'aria-label': t('search.time'),
						onChange: function (event) { props.onTimeRange(event.target.value); },
					},
						h('option', { value: '' }, t('search.timeAny')),
						h('option', { value: 'day' }, t('search.timeDay')),
						h('option', { value: 'week' }, t('search.timeWeek')),
						h('option', { value: 'month' }, t('search.timeMonth')),
						h('option', { value: 'year' }, t('search.timeYear')))),
				h('label', { className: 'mgrSearchSafeWrap' },
					h('input', {
						type: 'checkbox',
						checked: safeSearch,
						onChange: function (event) { void props.onSafeSearch(event.target.checked); },
					}),
					h('span', { className: 'mgrHint' }, t('search.safeSearch')))));

			var panes = h('div', null,
				h('div', { style: sub === 'results' ? undefined : { display: 'none' } },
					h(SearchResults, { t: t, busy: busy, result: result, error: error })),
				h('div', { style: sub === 'channels' ? undefined : { display: 'none' } },
					h(SearchChannels, {
						t: t,
						channels: channels,
						enabled: enabled,
						query: props.query,
						testAll: props.testAll,
						onSave: props.onSave,
						onTest: props.onTest,
						onMove: props.onMove,
						bulkBusy: props.bulkBusy,
						onSetChannels: props.onSetChannels,
					})),
				h('div', { style: sub === 'settings' ? undefined : { display: 'none' } },
					h(SearchModeCard, {
						t: t,
						mode: mode,
						maxResults: maxResults,
						perChannel: perChannel,
						onMode: props.onMode,
					}),
					h('div', { className: 'mgrSearchBlocked' },
						h('div', { className: 'mgrSearchBlockedHead' },
							h('span', { className: 'mgrLabel' }, t('search.blocked')),
							h('span', { className: 'mgrHint' }, t('search.blockedHint'))),
						h('textarea', {
							className: 'mgrInput mgrSearchBlockedInput',
							rows: 2,
							value: props.blocked === null || props.blocked === undefined ? '' : props.blocked,
							placeholder: t('search.blockedPlaceholder'),
							'aria-label': t('search.blocked'),
							onChange: function (event) { props.onBlockedChange(event.target.value); },
						}),
						h('div', { className: 'mgrHint', style: { marginTop: '6px' } }, t('search.filterScope')),
						h('div', { className: 'mgrSearchBlockedFoot' },
							h('button', {
								type: 'button',
								className: 'mgrBtn mgrBtnPrimary',
								onClick: function () { void props.onSaveBlocked(); },
							}, t('search.blockedSave'))))));

			return h('div', null,
				barView,
				metaView,
				statusError === ''
					? null
					: h('div', { className: 'mgrErrorBox' }, h('span', null, t('search.statusError', { error: statusError }))),
				status !== null && enabled === 0 && statusError === ''
					? h('div', { className: 'mgrWarn' },
						h('span', null, t('search.enabledNone')),
						h('span', { className: 'mgrSpacer' }),
						h('button', {
							type: 'button',
							className: 'mgrBtn',
							onClick: function () { props.setSub('channels'); },
						}, t('search.enabledNoneAction')))
					: null,
				status === null ? h(Loading, { label: t('state.loading') }) : h('div', null, tabView, testCostView, panes));
		}

		//#endregion

		//#region lan view

		/**
		 * The QR code of the access link.
		 *
		 * The Host sends the module matrix as rows of `0` and `1`; the panel
		 * draws it as plain rectangles, so no image and no markup from the
		 * network ever reaches the page.
		 *
		 * @param {object} props - `rows` and `label`.
		 * @returns {object} React node.
		 */
		function QrCode(props) {
			var rows = props.rows;
			if (!Array.isArray(rows) || rows.length === 0) return null;
			var size = rows.length;
			var cells = [];
			for (var y = 0; y < size; y += 1) {
				var row = rows[y];
				if (typeof row !== 'string') continue;
				for (var x = 0; x < row.length; x += 1) {
					if (row[x] !== '1') continue;
					cells.push(h('rect', { key: x + '-' + y, x: x, y: y, width: 1, height: 1, fill: '#000' }));
				}
			}
			return h('svg', {
				className: 'mgrQr',
				viewBox: '0 0 ' + size + ' ' + size,
				role: 'img',
				'aria-label': props.label,
				shapeRendering: 'crispEdges',
			},
				h('rect', { x: 0, y: 0, width: size, height: size, fill: '#fff' }),
				cells);
		}

		/**
		 * The LAN access panel.
		 *
		 * @param {object} props - `t`, `state`, `busy`, `onToggle`, `onCopy`.
		 * @returns {object} React node.
		 */
		function LanSection(props) {
			var t = props.t;
			var state = props.state;
			var enabled = state !== null && state.enabled === true;
			var running = state !== null && state.running === true;
			var certificate = state === null || state.certificate === undefined ? null : state.certificate;
			return h('div', null,
				h('div', { className: 'mgrLanCard' },
					h('div', { className: 'mgrLanRow' },
						h('div', { className: 'mgrLanRowMain' },
							h('div', { className: 'mgrLanTitle' }, t('lan.switch')),
							h('div', { className: 'mgrLanHint' }, t('lan.switchHint'))),
						h(Switch, {
							checked: enabled,
							disabled: props.busy === true,
							label: t('lan.switch'),
							onChange: props.onToggle,
						})),
					enabled ? h('div', { className: 'mgrLanRow mgrLanRowSub' },
						h('div', { className: 'mgrLanRowMain' },
							h('div', { className: 'mgrLanTitle' }, t('lan.secure')),
							h('div', { className: 'mgrLanHint' }, t('lan.secureHint'))),
						h(Switch, {
							checked: state.secure === true,
							disabled: props.busy === true,
							label: t('lan.secure'),
							onChange: props.onToggleSecure,
						})) : null),
				state !== null && state.error !== ''
					? h('div', { className: 'mgrErrorBox' },
						h('span', null, t('lan.error') + '：' + state.error))
					: null,
				running && typeof state.url === 'string' && state.url !== ''
					? h('div', { className: 'mgrLanCard' },
						h('div', { className: 'mgrLanGrid' },
							h('div', { className: 'mgrQrBox' },
								h(QrCode, { rows: state.matrix, label: t('lan.qr') }),
								h('div', { className: 'mgrQrCaption' }, t('lan.qr'))),
							h('div', { className: 'mgrLanMain' },
								h('div', { className: 'mgrLanTitle' }, t('lan.url')),
								h('div', { className: 'mgrLanUrl' }, state.url),
								h('div', { className: 'mgrLanActions' },
									h('button', {
										type: 'button',
										className: 'mgrBtn',
										onClick: function () { props.onCopy(state.url); },
									}, t('lan.copy'))),
								h('div', { className: 'mgrLanMeta' },
									h('div', { className: 'mgrLanMetaRow' },
										h('span', { className: 'mgrLanMetaKey' }, t('lan.address')),
										h('span', { className: 'mgrLanMetaValue' }, state.address + ':' + String(state.port))),
									h('div', { className: 'mgrLanMetaRow' },
										h('span', { className: 'mgrLanMetaKey' }, t('lan.upstream')),
										h('span', { className: 'mgrLanMetaValue' }, state.upstream)),
									certificate ? h('div', { className: 'mgrLanMetaRow' },
										h('span', { className: 'mgrLanMetaKey' }, t('lan.certificate')),
										h('span', { className: 'mgrLanMetaValue' }, certificate.fingerprint)) : null,
									certificate ? h('div', { className: 'mgrLanMetaRow' },
										h('span', { className: 'mgrLanMetaKey' }, t('lan.certificateValid')),
										h('span', { className: 'mgrLanMetaValue' }, certificate.validTo)) : null))),
						state.secure === true ? h('div', { className: 'mgrLanTrust' },
							h('div', { className: 'mgrLanTitle' }, t('lan.trust')),
							h('div', { className: 'mgrLanHint' }, t('lan.trustHint')),
							h('div', { className: 'mgrLanActions' },
								h('button', {
									type: 'button',
									className: 'mgrBtn mgrBtnPrimary',
									onClick: function () { props.onDownloadCa(); },
								}, t('lan.downloadCa'))),
							h('div', { className: 'mgrLanHint mgrLanSteps' }, t('lan.ios')),
							h('div', { className: 'mgrLanHint mgrLanSteps' }, t('lan.android'))) : null,
						state.secure === true ? h('div', { className: 'mgrWarn' }, h('span', null, t('lan.certWarning'))) : null,
						h('div', { className: 'mgrWarn' }, h('span', null, t('lan.tokenWarning'))))
					: h('div', { className: 'mgrLanCard' },
						h('div', { className: 'mgrLanHint' }, t('lan.off')),
						state !== null && Array.isArray(state.addresses) && state.addresses.length > 0
							? h('div', { className: 'mgrLanMeta' },
								h('div', { className: 'mgrLanMetaRow' },
									h('span', { className: 'mgrLanMetaKey' }, t('lan.addresses')),
									h('span', { className: 'mgrLanMetaValue' }, state.addresses.join(', '))))
							: null));
		}

		//#endregion

		//#region tools view

		/**
		 * The locale key of every tool section's name.
		 *
		 * The map keeps the keys static: a group id that is not in here has no
		 * name of its own, and the panel shows the raw id instead of guessing.
		 */
		var TOOL_GROUP_LABEL = {
			skills: 'tools.group.skills',
			mcp: 'tools.group.mcp',
			search: 'tools.group.search',
			lan: 'tools.group.lan',
		};

		/** The locale key of every tool section's one-line explanation. */
		var TOOL_GROUP_HINT = {
			skills: 'tools.hint.skills',
			mcp: 'tools.hint.mcp',
			search: 'tools.hint.search',
			lan: 'tools.hint.lan',
		};

		/** The locale key of every tool section's empty state. */
		var TOOL_GROUP_EMPTY = {
			skills: 'tools.empty.skills',
			mcp: 'tools.empty.mcp',
			search: 'tools.empty.search',
			lan: 'tools.empty.lan',
		};

		/**
		 * The name of one tool section.
		 *
		 * @param {object} t - Translator.
		 * @param {string} id - Section id.
		 * @returns {string} The section name.
		 */
		function toolGroupLabel(t, id) {
			var key = TOOL_GROUP_LABEL[id];
			return key === undefined ? id : t(key);
		}

		/**
		 * The parameter type of one schema property.
		 *
		 * @param {object} spec - One property schema.
		 * @returns {string} The type, with `[]` for arrays.
		 */
		function toolParamType(spec) {
			if (spec === null || typeof spec !== 'object') return 'any';
			var type = typeof spec.type === 'string' ? spec.type : 'any';
			if (type === 'array' && spec.items !== null && typeof spec.items === 'object' && typeof spec.items.type === 'string') {
				return spec.items.type + '[]';
			}
			return type;
		}

		/**
		 * One tool: its name, where it comes from, its description and its
		 * parameters.
		 *
		 * @param {object} props - `t` and `tool`.
		 * @returns {object} React node.
		 */
		function ToolCard(props) {
			var t = props.t;
			var tool = props.tool;
			var schema = tool.parameters !== null && typeof tool.parameters === 'object' ? tool.parameters : null;
			var properties = schema !== null && schema.properties !== null && typeof schema.properties === 'object'
				? schema.properties
				: null;
			var required = schema !== null && Array.isArray(schema.required) ? schema.required : [];
			var source = typeof tool.source === 'string' ? tool.source : '';
			return h('div', { className: 'mgrToolCard' },
				h('div', { className: 'mgrToolCardHead' },
					h('span', { className: 'mgrToolCardName' }, tool.name),
					source === '' ? null : h('span', { className: 'mgrBadge' }, source === 'skills' ? t('tools.source.skills') : (source === 'search' ? t('tools.source.search') : source)),
					typeof tool.mode === 'string' ? h('span', { className: 'mgrBadge' }, tool.mode) : null,
					tool.enabled === false ? h('span', { className: 'mgrBadge mgrBadgeWarn' }, t('tools.modeOff')) : null),
				tool.description === '' ? null : h('div', { className: 'mgrToolCardDesc' }, tool.description),
				schema === null ? null : h('div', { className: 'mgrToolParams' },
					h('div', { className: 'mgrToolParamsHead' }, t('tools.params')),
					properties === null || Object.keys(properties).length === 0
						? h('div', { className: 'mgrToolParamDesc' }, t('tools.noParams'))
						: null,
					properties === null ? null : Object.keys(properties).map(function (key) {
						var spec = properties[key];
						var specObject = spec !== null && typeof spec === 'object' ? spec : {};
						return h('div', { className: 'mgrToolParam', key: key },
							h('span', { className: 'mgrToolParamName' }, key),
							h('span', { className: 'mgrToolParamType' }, toolParamType(specObject)),
							required.indexOf(key) >= 0 ? h('span', { className: 'mgrToolParamReq' }, t('tools.required')) : null,
							Array.isArray(specObject.enum) && specObject.enum.length > 0
								? h('span', { className: 'mgrToolParamType' }, specObject.enum.join(' / '))
								: null,
							typeof specObject.description === 'string' && specObject.description !== ''
								? h('span', { className: 'mgrToolParamDesc' }, specObject.description)
								: null);
					})));
		}

		/**
		 * One tool section: the tools of one module.
		 *
		 * @param {object} props - `t` and `group`.
		 * @returns {object} React node.
		 */
		function ToolGroup(props) {
			var t = props.t;
			var group = props.group;
			var tools = Array.isArray(group.tools) ? group.tools : [];
			var hint = TOOL_GROUP_HINT[group.id];
			return h('div', null,
				hint === undefined ? null : h('div', { className: 'mgrHint', style: { marginBottom: '10px' } }, t(hint)),
				tools.length === 0
					? h('div', { className: 'mgrEmpty' }, TOOL_GROUP_EMPTY[group.id] === undefined ? t('tools.empty') : t(TOOL_GROUP_EMPTY[group.id]))
					: tools.map(function (tool) {
						return h(ToolCard, { t: t, tool: tool, key: tool.name });
					}));
		}

		/**
		 * The UI-enhancement page: one switch per profile bundle.
		 *
		 * A switch does not reimplement anything: it asks the Host's plugin
		 * manager to select or drop that bundle, so the feature behaves exactly
		 * as the plugin does — including everything the plugin brings with it.
		 *
		 * @param {object} props - `t`, `state`, `onToggle`, `busy`.
		 * @returns {object} React node.
		 */
		function UiEnhancementsSection(props) {
			var t = props.t;
			var state = props.state;
			if (state === null || state === undefined) {
				return h('div', { className: 'mgrLoading' }, h('span', { className: 'mgrSpinner' }), h('span', null, t('state.loading')));
			}
			if (state.available !== true) {
				return h('div', { className: 'mgrWarn' }, h('span', null, t('ui.unavailable')));
			}
			var features = Array.isArray(state.features) ? state.features : [];
			var client = state.client !== null && typeof state.client === 'object' ? state.client : null;
			return h('div', null,
				h('div', { className: 'mgrToolbar' },
					h('div', { className: 'mgrHint' }, t('ui.hint'))),
				client === null || features.length > 1 ? null : h('div', { className: 'mgrMeta', style: { marginBottom: '10px' } },
					// The host may still be the older build that reports one flat
					// record; read both shapes so the line is never empty.
					t('ui.clientState', {
						state: (client.mount ?? client).mounted === true ? t('ui.clientMounted') : t('ui.clientNotMounted'),
						reason: (client.mount ?? client).reason ?? '',
					}),
					client.row === undefined ? null : h('div', null,
						t('ui.rowState', {
							state: client.row.mounted === true ? t('ui.clientMounted') : t('ui.clientNotMounted'),
							reason: client.row.reason ?? '',
						}))),
				features.length === 0
					? h('div', { className: 'mgrEmpty' }, t('skx.noSources'))
					: h('div', { className: 'mgrServer' },
						features.map(function (feature) {
							var title = localizedText(feature.title, feature.id);
							var description = localizedText(feature.description, '');
							var missing = feature.installed === false;
							return h('div', { className: 'mgrUiFeature', key: feature.id },
								h('div', { className: 'mgrUiFeatureMain' },
									h('div', { className: 'mgrUiFeatureTitle' },
										title === '' ? feature.bundle : title,
										feature.defaultEnabled === true
											? h('span', { className: 'mgrBadge' }, t('ui.defaultOn'))
											: h('span', { className: 'mgrBadge' }, t('ui.defaultOff')),
										feature.version === '' ? null : h('span', { className: 'mgrBadge' }, 'v' + feature.version)),
									description === '' ? null : h('div', { className: 'mgrUiFeatureDesc' }, description),
									missing ? h('div', { className: 'mgrMeta' }, t('ui.missing')) : null,
								client === null || client.features === undefined || client.features[feature.id] === undefined
									? null
									: h('div', { className: 'mgrMeta' },
										t('ui.featureClient', {
											state: client.features[feature.id].mounted === true ? t('ui.clientMounted') : t('ui.clientNotMounted'),
											reason: client.features[feature.id].reason ?? '',
										}))),
								h(PillSwitch, {
									checked: feature.enabled === true,
									label: title === '' ? feature.bundle : title,
									disabled: props.busy === true || feature.available === false,
									onChange: function (next) { props.onToggle(feature.id, next); },
								}));
						})));
		}

		/**
		 * One localized text, whatever shape the Host hands over.
		 *
		 * @param {string | object} value - Literal text or a per-language map.
		 * @param {string} fallback - What to use when there is none.
		 * @returns {string} The text.
		 */
		function localizedText(value, fallback) {
			if (typeof value === 'string') return value === '' ? fallback : value;
			if (value === null || typeof value !== 'object') return fallback;
			var keys = Object.keys(value);
			for (var index = 0; index < keys.length; index += 1) {
				var key = keys[index];
				if (key === 'zh' || key.startsWith('zh-')) return String(value[key]);
			}
			for (var other = 0; other < keys.length; other += 1) {
				if (keys[other] === 'en' || keys[other].startsWith('en-')) return String(value[keys[other]]);
			}
			return keys.length === 0 ? fallback : String(value[keys[0]]);
		}

		/**
		 * The tool catalog page.
		 *
		 * One sub-tab per module, each listing the tools that module gives the
		 * agent together with their descriptions and parameter schemas. Every
		 * section stays mounted so switching back does not re-read anything.
		 *
		 * @param {object} props - `t`, `catalog`, `sub`, `setSub`.
		 * @returns {object} React node.
		 */
		function ToolsSection(props) {
			var t = props.t;
			var catalog = props.catalog;
			var sub = props.sub;
			if (catalog === null || catalog === undefined) {
				return h('div', { className: 'mgrLoading' }, h('span', { className: 'mgrSpinner' }), h('span', null, t('tools.loading')));
			}
			if (typeof catalog.error === 'string' && catalog.error !== '') {
				return h('div', { className: 'mgrErrorBox' }, h('span', null, t('tools.failed') + '：' + catalog.error));
			}
			var groups = Array.isArray(catalog.groups) ? catalog.groups : [];
			if (groups.length === 0) {
				return h('div', { className: 'mgrEmpty' }, t('tools.empty'));
			}
			return h('div', null,
				h('div', { className: 'mgrToolbar' },
					h('div', { className: 'mgrHint' }, t('tools.note'))),
				h('div', { className: 'mgrSubTabs', role: 'tablist', 'aria-label': t('tools.subtabs') },
					groups.map(function (group) {
						return h('button', {
							type: 'button',
							role: 'tab',
							key: group.id,
							'aria-selected': sub === group.id,
							className: classes('mgrTab', sub === group.id && 'mgrTabActive'),
							onClick: function () { props.setSub(group.id); },
						},
							toolGroupLabel(t, group.id),
							h('span', { className: 'mgrTabCount' }, String(Array.isArray(group.tools) ? group.tools.length : 0)));
					})),
				groups.map(function (group) {
					return h('div', { key: group.id, style: { display: sub === group.id ? undefined : 'none' } },
						h(ToolGroup, { t: t, group: group }));
				}));
		}

		//#endregion

		//#region preferences view

		/**
		 * The global preference editor.
		 *
		 * The manager owns `$DSH_HOME/AGENTS.md` — the file DSH reads at the start
		 * of every session — and keeps the authoritative copy in its own data
		 * directory (symlinked, or duplicated when symlinks are unavailable).
		 * Ported from the 自衍中枢 preference pane, same semantics.
		 *
		 * @param {object} props - `t`, `call`, `notify`, `setError`.
		 * @returns {object} React node.
		 */
		function PreferencesSection(props) {
			var t = props.t;
			var [state, setState] = useState(null);
			var [draft, setDraft] = useState('');
			var [baseline, setBaseline] = useState('');
			var [busy, setBusy] = useState(false);
			var [error, setError] = useState('');

			// Re-read on every open: another window may have written the file.
			useEffect(function () {
				var alive = true;
				props.call('preferences').then(function (value) {
					if (!alive) return;
					setState(value);
					setDraft(String(value?.content ?? ''));
					setBaseline(String(value?.content ?? ''));
				}).catch(function (reason) {
					if (alive) setError(messageOf(reason));
				});
				return function () { alive = false; };
			}, [props.call]);

			if (state === null) {
				return error === ''
					? h(Loading, { label: t('preferences.loading') })
					: h('div', { className: 'mgrErrorBox' }, h('span', null, error));
			}

			var dirty = draft !== baseline;
			var cap = Number(state.cap) || 0;
			var bytes = byteLength(draft);
			var readable = state.readable !== false;

			var save = function () {
				setBusy(true);
				props.call('preferences-save', { content: draft }).then(function (value) {
					setState(value);
					setDraft(String(value?.content ?? ''));
					setBaseline(String(value?.content ?? ''));
					props.notify(t('preferences.saved'), false);
				}).catch(function (reason) {
					props.notify(messageOf(reason), true);
				}).then(function () { setBusy(false); });
			};

			return h('div', { className: 'mgrServer' },
				h('div', { className: 'mgrHint', style: { marginBottom: '10px' } }, t('preferences.hint')),
				h('div', { className: 'mgrPrefsPath' },
					h('span', { className: 'mgrLabel' }, t('preferences.file')),
					h('code', { className: 'mgrCode' }, state.path ?? '')),
				h('div', { className: 'mgrMeta' }, t('preferences.link', { agents: state.agentsPath ?? '' })),
				state.mode === 'link'
					? h('div', { className: 'mgrMeta' }, t('preferences.mode.link'))
					: state.mode === 'copy'
						? h('div', { className: 'mgrMeta' }, t('preferences.mode.copy'))
						: null,
				readable ? null : h('div', { className: 'mgrWarn' }, t('preferences.unreadable')),
				h('textarea', {
					className: 'mgrInput mgrPrefsText',
					value: draft,
					disabled: !readable,
					'aria-label': t('tab.preferences'),
					onChange: function (event) { setDraft(event.target.value); },
				}),
				h('div', { className: 'mgrToolbar', style: { marginTop: '10px', marginBottom: 0 } },
					h('span', { className: 'mgrHint' },
						t('preferences.size', { tokens: estimateTokens(draft), bytes: bytes, cap: cap })
						+ (dirty ? ' · ' + t('preferences.dirty') : '')),
					h('span', { className: 'mgrToolbarSpacer' }),
					h('button', {
						type: 'button',
						className: 'mgrBtn',
						disabled: !dirty || busy,
						onClick: function () { setDraft(baseline); },
					}, t('preferences.reset')),
					h('button', {
						type: 'button',
						className: 'mgrBtn mgrBtnPrimary',
						disabled: !dirty || busy || !readable || (cap > 0 && bytes > cap),
						onClick: save,
					}, busy ? t('state.loading') : t('preferences.save'))));
		}

		//#endregion


		//#region composer history view

		/**
		 * The input-box history.
		 *
		 * ArrowUp walks back through what this session already sent; ArrowDown
		 * walks forward again and finally restores the draft that was there
		 * before. A recalled message is put back into the composer as an editable
		 * draft, so it can be fixed and sent with no extra step.
		 *
		 * The switch lives in the manager (UI 增强 → 输入框历史). The Host has no
		 * part in it, so this is the whole feature.
		 *
		 * @param {object} ctx - Host context.
		 * @returns {Function} Cleanup.
		 */
		function installComposerHistory(ctx) {
			try {
				return installComposerHistoryInner(ctx);
			} catch (error) {
				// A silent failure here looks exactly like "the keys do nothing",
				// so it is reported where the panel can show it.
				callHost(ctx, 'ui-client-status', {
					feature: 'composer-history',
					scope: 'mount',
					mounted: false,
					reason: 'install-failed: ' + messageOf(error),
				}).catch(function () {});
				return function () {};
			}
		}

		/**
		 * The history itself, once installing is known to have worked.
		 *
		 * @param {object} ctx - Host context.
		 * @returns {Function} Cleanup.
		 */
		function installComposerHistoryInner(ctx) {
			var KEY = 'dsh-manager:composer-history:';
			var LIMIT = 50;
			var enabled = false;
			var items = [];
			var cursor = -1;
			var draft = '';
			var lastSeen = '';
			// The text we last put into the composer from the history; while the
			// box still holds exactly that, the arrows keep walking instead of
			// requiring the caret to reach the edge first.
			var recalled = null;
			var element = null;

			/** The storage key of the session on screen. */
			var sessionKey = function () {
				var sessions = ctx.sessions !== undefined ? ctx.sessions : ctx.get('sessions');
				if (sessions === undefined || sessions === null || typeof sessions.list?.getSnapshot !== 'function') return KEY + 'default';
				var byId = sessions.list.getSnapshot().byId ?? {};
				var ids = Object.keys(byId).filter(function (id) { return (byId[id]?.retainedBy?.mainView ?? 0) > 0; });
				return KEY + (ids.length === 1 ? ids[0] : 'default');
			};

			/** The session on screen, when exactly one is open. */
			var sessionId = function () {
				var sessions = ctx.sessions !== undefined ? ctx.sessions : ctx.get('sessions');
				if (sessions === undefined || sessions === null || typeof sessions.list?.getSnapshot !== 'function') return '';
				var byId = sessions.list.getSnapshot().byId ?? {};
				var ids = Object.keys(byId).filter(function (id) { return (byId[id]?.retainedBy?.mainView ?? 0) > 0; });
				return ids.length === 1 ? ids[0] : '';
			};

			/** Read the stored history for this session. */
			var load = function () {
				items = [];
				cursor = -1;
				try {
					var raw = window.localStorage.getItem(sessionKey());
					var parsed = raw === null ? null : JSON.parse(raw);
					if (Array.isArray(parsed)) items = parsed.filter(function (entry) { return typeof entry === 'string' && entry.trim() !== ''; }).slice(-LIMIT);
				} catch (error) {
					items = [];
				}
			};

			/** Persist the history for this session. */
			var save = function () {
				try {
					window.localStorage.setItem(sessionKey(), JSON.stringify(items.slice(-LIMIT)));
				} catch (error) {
					// A full or blocked store only costs the next session; the current
					// one keeps working from memory.
				}
			};


			/** Remember one sent message. */
			var remember = function (text) {
				var value = String(text ?? '').trim();
				if (value === '') return;
				if (items.length > 0 && items[items.length - 1] === value) return;
				items.push(value);
				if (items.length > LIMIT) items = items.slice(-LIMIT);
				save();
			};

			/** Put one message back into the composer, editable. */
			var fill = function (text) {
				if (element === null) return;
				if (element.tagName !== 'TEXTAREA' && element.isContentEditable === true) {
					// Select what is there and let the editor's own input path insert
					// the replacement: Lexical keeps its state in the DOM events, so a
					// direct innerText write would be thrown away on the next render.
					element.focus();
					var selection = window.getSelection();
					if (selection === null) return;
					var range = document.createRange();
					range.selectNodeContents(element);
					selection.removeAllRanges();
					selection.addRange(range);
					if (typeof document.execCommand !== 'function') return;
					if (text === '') document.execCommand('delete', false);
					else document.execCommand('insertText', false, text);
					return;
				}
				// React tracks the value on its own node, so the native setter is what
				// makes it notice a programmatic change; without the prototype (a bare
				// element in tests) the plain assignment is the same thing.
				var prototype = typeof window.HTMLTextAreaElement === 'function' ? window.HTMLTextAreaElement.prototype : undefined;
				var descriptor = prototype === undefined ? undefined : Object.getOwnPropertyDescriptor(prototype, 'value');
				if (descriptor !== undefined && typeof descriptor.set === 'function') descriptor.set.call(element, text);
				else element.value = text;
				if (typeof element.dispatchEvent === 'function' && typeof Event === 'function') element.dispatchEvent(new Event('input', { bubbles: true }));
				try {
					element.setSelectionRange(text.length, text.length);
				} catch (error) {
					// Some textareas refuse selection; the value is already in place.
				}
			};

			/** Is this element the conversation composer? */
			var isComposer = function (target) {
				if (target === null || target === undefined) return false;
				var element = target;
				// The conversation composer is a Lexical contenteditable div; a
				// plugin or a simpler surface may use a plain textarea.
				if (element.isContentEditable !== true && element.tagName !== 'TEXTAREA') {
					element = typeof target.closest === 'function' ? target.closest('[contenteditable="true"]') : null;
					if (element === null || element === undefined) return false;
				}
				if (typeof element.closest === 'function' && element.closest('.mgrRoot') !== null) return false;
				return true;
			};

			/** The text currently in the composer. */
			var textOf = function (target) {
				if (target === null || target === undefined) return '';
				if (target.tagName === 'TEXTAREA') return String(target.value ?? '');
				return String(target.innerText ?? target.textContent ?? '');
			};

			var onKeyDown = function (event) {
				if (enabled !== true) return;
				if (!isComposer(event.target)) return;
				if (event.isComposing === true || event.keyCode === 229) return;
				element = event.target;

				var text = textOf(element);
				if (event.key === 'Enter' && event.shiftKey !== true) {
					remember(text);
					return;
				}
				var observable = element.tagName === 'TEXTAREA';
				var atStart = observable
					? element.selectionStart === 0 && element.selectionEnd === 0
					: text.trim() === '';
				// In the rich composer the caret position is the editor's business, so
				// ArrowDown only takes over while walking the history; anywhere else it
				// stays a caret key.
				var atEnd = observable
					? element.selectionStart === element.value.length && element.selectionEnd === element.value.length
					: false;
				var navigating = recalled !== null && text === recalled;

				if (event.key === 'ArrowUp' && (atStart || navigating)) {
					if (items.length === 0) return;
					if (cursor < 0) draft = text;
					cursor = cursor < 0 ? items.length - 1 : Math.max(cursor - 1, 0);
					recalled = items[cursor];
					fill(items[cursor]);
					event.preventDefault();
					return;
				}
				if (event.key === 'ArrowDown' && (atEnd || navigating) && cursor >= 0) {
					if (cursor === items.length - 1) {
						cursor = -1;
						recalled = draft;
						fill(draft);
					} else {
						cursor += 1;
						recalled = items[cursor];
						fill(items[cursor]);
					}
					event.preventDefault();
				}
			};

			// A send that clears the box (Enter, or the send button) is the moment
			// the text stopped being a draft.
			var onInput = function (event) {
				if (enabled !== true) return;
				var target = event.target;
				if (!isComposer(target)) return;
				var value = textOf(target);
				if (value.trim() === '' && lastSeen.trim() !== '') remember(lastSeen);
				if (recalled !== null && value !== recalled) recalled = null;
				lastSeen = value;
				if (value.trim() === '') {
					cursor = -1;
					draft = '';
				}
			};

			// The session already knows which messages were sent. Reading them means
			// the history works right after a reload, instead of starting empty
			// until the next send.
			var seeding = false;
			var seed = function () {
				if (items.length > 0 || seeding === true) return;
				var id = sessionId();
				if (id === '') return;
				seeding = true;
				fetch('./api/dsh-rewind/candidates', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ sessionId: id }),
				}).then(function (response) { return response.json(); }).then(function (result) {
					seeding = false;
					if (result === null || typeof result !== 'object' || result.ok !== true) return;
					var candidates = Array.isArray(result.value?.candidates) ? result.value.candidates : [];
					var texts = candidates
						.map(function (candidate) { return String(candidate.preview ?? '').trim(); })
						.filter(function (text) { return text !== ''; });
					if (texts.length === 0) return;
					items = texts.slice(-LIMIT);
					cursor = -1;
					report('seeded');
				}).catch(function () { seeding = false; });
			};

			var report = function (reason) {
				callHost(ctx, 'ui-client-status', {
					feature: 'composer-history',
					scope: 'mount',
					mounted: enabled,
					// The panel shows the count, so an empty history and a broken
					// listener do not look the same from the outside.
					reason: reason + ' · ' + items.length + ' 条',
				}).catch(function () {});
			};

			var readSwitch = function () {
				callHost(ctx, 'ui-status', {}).then(function (value) {
					var features = value !== null && typeof value === 'object' && Array.isArray(value.features) ? value.features : [];
					var feature = features.find(function (entry) { return entry.id === 'composer-history'; });
					enabled = feature !== undefined && feature.enabled === true;
					report(enabled ? 'installed' : 'feature-off');
					if (enabled) seed();
				}).catch(function (error) {
					enabled = false;
					report('switch-unreadable: ' + messageOf(error));
				});
			};

			window.__dshManagerHistory = { items: function () { return items.length; }, enabled: function () { return enabled; } };
			document.addEventListener('keydown', onKeyDown, true);
			document.addEventListener('input', onInput, true);
			var refresh = function () { load(); readSwitch(); seed(); };
			window.addEventListener('focus', refresh);
			window.addEventListener('dsh-manager:ui-changed', readSwitch);
			readSwitch();
			load();

			return function () {
				document.removeEventListener('keydown', onKeyDown, true);
				document.removeEventListener('input', onInput, true);
				window.removeEventListener('focus', refresh);
				window.removeEventListener('dsh-manager:ui-changed', readSwitch);
			};
		}

		//#endregion

		//#region panel

		/**
		 * The management page.
		 *
		 * @param {object} props - Client context and translator.
		 * @returns {object} React node.
		 */
		function Panel(props) {
			var ctx = props.ctx;
			var t = props.t;
			var call = useCallback(function (endpoint, payload) { return callHost(ctx, endpoint, payload); }, [ctx]);
			// The vendored kernel answers its own envelope, so it gets its own
			// caller; `call` above stays for this plugin's endpoints.
			var kernelCall = useCallback(function (path, payload, options) { return callKernel(ctx, path, payload, options); }, [ctx]);
			var [tab, setTab] = useState('skills');
			// Bumped by the header's rescan so the skills workspace re-reads its
			// own scan; the overview alone does not carry that list.
			var [rescanToken, setRescanToken] = useState(0);
			var [data, setData] = useState(null);
			var [lan, setLan] = useState(null);
			var [error, setError] = useState('');
			var [busy, setBusy] = useState(false);
			var [toast, setToast] = useState(null);
			var [query, setQuery] = useState('');
			var [searchStatus, setSearchStatus] = useState(null);
			var [searchQuery, setSearchQuery] = useState('');
			var [searchResult, setSearchResult] = useState(null);
			var [searchError, setSearchError] = useState(null);
			var [searchBusy, setSearchBusy] = useState(false);
			var [searchTimeRange, setSearchTimeRange] = useState('');
			var [searchBlocked, setSearchBlocked] = useState(null);
			var [searchTestAll, setSearchTestAll] = useState(null);
			var [searchTestAllBusy, setSearchTestAllBusy] = useState(false);
			// A batch of channel switches runs one request at a time; the flag
			// keeps the second button (and every row switch) from starting edge
			// cases while the first batch is still landing.
			var [searchBulkBusy, setSearchBulkBusy] = useState(false);
			// Which sub-tab of the search page is open; it lives here so a run
			// that lands while another tab is open can bring the results back.
			var [searchSub, setSearchSub] = useState('results');
			// The tool catalog and the section of it that is open. The catalog
			// is read while the 工具 tab is on screen, because MCP servers
			// connect and disconnect on their own.
			var [toolsCatalog, setToolsCatalog] = useState(null);
			var [toolsSub, setToolsSub] = useState('skills');
			// The UI-enhancement switches and the state behind them.
			var [uiState, setUiState] = useState(null);
			var [uiBusy, setUiBusy] = useState(false);

			var searchRequest = useCallback(function (payload) {
				// Channel calls have their own 20s budget; the wider browser
				// budget covers the fan-out and a slow local event loop.
				return callHost(ctx, 'search-query', payload, 60000);
			}, [ctx]);

			var applyOverview = useCallback(function (value) {
				setData(value);
				setError('');
				// The overview carries the switch state; the full status with
				// the link and the code arrives from `lan-status`.
				setLan(function (current) {
					return current === null && value !== null && value.lan !== undefined ? value.lan : current;
				});
			}, []);

			var load = useCallback(function () {
				return call('overview').then(applyOverview).catch(function (reason) {
					setError(messageOf(reason));
				});
			}, [call, applyOverview]);

			useEffect(function () {
				void load();
			}, [load]);

			useEffect(function () {
				if (tab !== 'mcp') return undefined;
				var timer = setInterval(function () {
					call('mcp-status').then(function (mcp) {
						setData(function (current) {
							return current === null ? current : { ...current, mcp: mcp };
						});
					}).catch(function () {});
				}, 4000);
				return function () { clearInterval(timer); };
			}, [tab, call, applyOverview]);

			useEffect(function () {
				if (tab !== 'lan') return undefined;
				var readLan = function () {
					return call('lan-status').then(function (value) {
						setLan(value);
					}).catch(function () {});
				};
				void readLan();
				var timer = setInterval(readLan, 3000);
				return function () { clearInterval(timer); };
			}, [tab, call]);

			useEffect(function () {
				if (tab !== 'search') return undefined;
				var active = true;
				call('search-status').then(function (value) {
					if (!active) return;
					setSearchStatus(value);
					// Load the editor's text once; later refreshes must not
					// overwrite edits the operator has not saved yet.
					setSearchBlocked(function (current) {
						if (current !== null) return current;
						return Array.isArray(value.blockedDomains) ? value.blockedDomains.join('\n') : '';
					});
				}).catch(function (reason) {
					if (!active) return;
					setSearchStatus({
						channels: [],
						enabledCount: 0,
						maxResults: 20,
						perChannelResults: 10,
						error: messageOf(reason),
					});
				});
				return function () { active = false; };
			}, [tab, call]);

			useEffect(function () {
				if (tab !== 'tools') return undefined;
				var active = true;
				var readTools = function () {
					return call('tools-list').then(function (value) {
						if (!active) return;
						setToolsCatalog(value);
					}).catch(function (reason) {
						if (!active) return;
						setToolsCatalog({ groups: [], error: messageOf(reason) });
					});
				};
				void readTools();
				// MCP servers connect on their own, so the catalog is read again
				// while the page is open instead of only once.
				var timer = setInterval(readTools, 5000);
				return function () { active = false; clearInterval(timer); };
			}, [tab, call]);

			useEffect(function () {
				if (tab !== 'ui') return undefined;
				var active = true;
				call('ui-status').then(function (value) {
					if (!active) return;
					setUiState(value);
				}).catch(function (reason) {
					if (!active) return;
					setUiState({ available: false, features: [], error: messageOf(reason) });
				});
				return function () { active = false; };
			}, [tab, call]);

			useEffect(function () {
				if (toast === null || toast.error === true) return undefined;
				var timer = setTimeout(function () { setToast(null); }, 4000);
				return function () { clearTimeout(timer); };
			}, [toast]);
			function toggleUiFeature(id, enabled) {
				setUiBusy(true);
				notify(t('ui.applying'), false);
				return call('ui-toggle', { id: id, enabled: enabled }).then(function (value) {
					setUiState(value);
					setUiBusy(false);
					// Features that live in the browser pick the switch up from this
					// event; the ones that live in a conversation bundle still need
					// the reload below.
					if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
						window.dispatchEvent(new CustomEvent('dsh-manager:ui-changed'));
					}
					notify(t('ui.applying'), false);
					// The feature's surface lives in the conversation UI, which is
					// mounted when the page loads; reloading applies the switch
					// everywhere at once instead of leaving half of it behind.
					if (typeof location !== 'undefined' && typeof location.reload === 'function') location.reload();
				}).catch(function (reason) {
					setUiBusy(false);
					// Switching a bundle recomposes the profile, which can take
					// this very request down with it; re-read the state to see
					// what actually landed.
					return call('ui-status').then(function (value) {
						setUiState(value);
						notify(t('ui.failed', { reason: messageOf(reason) }), true);
					}).catch(function () {
						notify(t('ui.failed', { reason: messageOf(reason) }), true);
					});
				});
			}

			function notify(message, isError) {
				setToast({ message: message, error: isError === true });
			}

			function run(promise, done) {
				setBusy(true);
				return promise.then(function (value) {
					if (done) done(value);
					return value;
				}).catch(function (reason) {
					notify(messageOf(reason), true);
					throw reason;
				}).then(function (value) {
					setBusy(false);
					return value;
				}, function (reason) {
					setBusy(false);
					throw reason;
				});
			}

			function refresh() {
				setRescanToken(function (value) { return value + 1; });
				void run(call('skills-refresh'), function (value) {
					applyOverview(value);
					notify(t('state.refreshed'), false);
				}).catch(function () {});
			}

			function mcpToggle(id, enabled) {
				void run(call('mcp-toggle', { id: id, enabled: enabled }), function (value) {
					applyOverview(value.overview);
					notify(t('state.saved'), false);
				}).catch(function () {});
			}

			function mcpReconnect(id) {
				void run(call('mcp-reconnect', { id: id }), function (value) {
					applyOverview(value.overview);
					notify(t('state.saved'), false);
				}).catch(function () {});
			}

			function mcpRemove(id) {
				return call('mcp-remove', { id: id }).then(function (value) {
					applyOverview(value);
					notify(t('state.deleted'), false);
				}).catch(function (reason) {
					notify(messageOf(reason), true);
					throw reason;
				});
			}

			function mcpSave(payload) {
				return call('mcp-save', payload).then(function (value) {
					applyOverview(value.overview);
					notify(t('state.saved'), false);
				});
			}

			function saveSearchChannel(payload) {
				return call('search-save', payload).then(function (value) {
					setSearchStatus(value);
					notify(t('state.saved'), false);
					return value;
				}).catch(function (reason) {
					notify(messageOf(reason), true);
					throw reason;
				});
			}

			/**
			 * Move a batch of channels to one switch state.
			 *
			 * One request at a time over the single-channel switch: the Host
			 * serialises the settings writes anyway, and a channel that fails must
			 * not take the rest of the batch down with it. Every answer is the full
			 * status, so the list regroups as the switches land and the bulk switch
			 * ends up showing what actually happened.
			 *
			 * @param {string[]} ids - Channel ids to switch.
			 * @param {boolean} enabled - The state to move them to.
			 * @returns {Promise<object|null>} The last status, or null.
			 */
			function setSearchChannels(ids, enabled) {
				if (!Array.isArray(ids) || ids.length === 0) return Promise.resolve(null);
				setSearchBulkBusy(true);
				var failed = 0;
				var chain = Promise.resolve();
				ids.forEach(function (id) {
					chain = chain.then(function () {
						return call('search-save', { id: id, enabled: enabled === true }).then(function (value) {
							setSearchStatus(value);
						}).catch(function () {
							// Counted, not thrown: the remaining channels still get
							// their switch, and the summary below says what happened.
							failed += 1;
						});
					});
				});
				return chain.then(function () {
					setSearchBulkBusy(false);
					if (failed === 0) {
						notify(t('state.saved'), false);
						return null;
					}
					notify(t('search.bulkPartial', { n: failed }), true);
					return call('search-status').then(setSearchStatus).catch(function () { return null; });
				});
			}

			function testSearchChannel(id, query) {
				return call('search-test', { id: id, query: query }).then(function (value) {
					// A failed test can start a cooldown; refresh the row badges.
					call('search-status').then(function (status) {
						setSearchStatus(status);
					}).catch(function () { /* keep the test result */ });
					return value;
				});
			}

			function moveSearchChannel(id, direction, orderedIds) {
				// The list on screen is grouped (enabled rows first), so the rows
				// hand over the order as drawn; the stored order alone would swap a
				// row the grouping has moved somewhere else.
				var source = Array.isArray(orderedIds) && orderedIds.length > 0
					? orderedIds
					: (searchStatus !== null && Array.isArray(searchStatus.order) ? searchStatus.order : null);
				if (source === null) return Promise.resolve();
				var order = source.slice();
				var index = order.indexOf(id);
				var target = direction === 'up' ? index - 1 : index + 1;
				if (index < 0 || target < 0 || target >= order.length) return Promise.resolve();
				order[index] = order[target];
				order[target] = id;
				return call('search-order', { ids: order }).then(function (value) {
					setSearchStatus(value);
					return value;
				}).catch(function (reason) {
					notify(messageOf(reason), true);
					throw reason;
				});
			}

			function setSearchMode(mode) {
				return call('search-mode', { mode: mode }).then(function (value) {
					setSearchStatus(value);
					return value;
				}).catch(function (reason) {
					notify(messageOf(reason), true);
					throw reason;
				});
			}

			function resetSearchCooldowns() {
				return call('search-cooldowns-clear').then(function (value) {
					setSearchStatus(value);
					setSearchResult(null);
					return value;
				}).catch(function (reason) {
					notify(messageOf(reason), true);
					throw reason;
				});
			}

			function testAllSearchChannels() {
				setSearchTestAllBusy(true);
				var query = searchQuery.trim();
				return callHost(ctx, 'search-test-all', { ...(query === '' ? {} : { query: query }) }, 60000).then(function (value) {
					setSearchTestAll(value);
					call('search-status').then(setSearchStatus).catch(function () {});
					return value;
				}).catch(function (reason) {
					notify(messageOf(reason), true);
					return null;
				}).then(function (value) {
					setSearchTestAllBusy(false);
					return value;
				});
			}

			function saveSafeSearch(value) {
				return call('search-safe-search', { safeSearch: value }).then(function (status) {
					setSearchStatus(status);
					return status;
				}).catch(function (reason) {
					notify(messageOf(reason), true);
					return null;
				});
			}

			function saveSearchBlocked() {
				var text = searchBlocked === null ? '' : searchBlocked;
				return call('search-blocked-domains', { domains: text.split('\n') }).then(function (value) {
					setSearchStatus(value);
					setSearchBlocked(Array.isArray(value.blockedDomains) ? value.blockedDomains.join('\n') : '');
					notify(t('state.saved'), false);
					return value;
				}).catch(function (reason) {
					// The save button ignores the promise; report and stop rather
					// than leaving an unhandled rejection in the console.
					notify(messageOf(reason), true);
					return null;
				});
			}

			function searchWeb() {
				var text = searchQuery.trim();
				if (text === '') {
					setSearchError({ code: '', message: t('search.queryRequired') });
					return Promise.resolve();
				}
				setSearchSub('results');
				setSearchBusy(true);
				setSearchError(null);
				setSearchResult(null);
				return searchRequest({ query: text, maxResults: 20, ...(searchTimeRange === '' ? {} : { timeRange: searchTimeRange }) }).then(function (value) {
					setSearchResult(value);
					return call('search-status').then(function (status) {
						setSearchStatus(status);
					}).catch(function () { /* search already succeeded; a stale status is harmless */ });
				}).catch(function (reason) {
					var code = reason !== null && typeof reason === 'object' && typeof reason.code === 'string' ? reason.code : '';
					setSearchError({ code: code, message: messageOf(reason) });
				}).then(function () {
					setSearchBusy(false);
				});
			}

			function lanToggle(enabled) {
				return run(call('lan-toggle', { enabled: enabled, secure: lan !== null && lan.secure === true }), function (value) {
					setLan(value);
					notify(t('state.saved'), false);
				}).catch(function () {});
			}

			function lanToggleSecure(secure) {
				return run(call('lan-toggle', { enabled: lan !== null && lan.enabled === true, secure: secure }), function (value) {
					setLan(value);
					notify(t('state.saved'), false);
				}).catch(function () {});
			}

			function lanDownloadCa() {
				return call('lan-ca').then(function (value) {
					if (value === null || value === undefined || typeof value.der !== 'string' || value.der === '') {
						throw new Error(t('lan.error'));
					}
					var binary = atob(value.der);
					var bytes = new Uint8Array(binary.length);
					for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
					var blob = new Blob([bytes], { type: 'application/x-x509-ca-cert' });
					var url = URL.createObjectURL(blob);
					var anchor = document.createElement('a');
					anchor.href = url;
					anchor.download = value.name;
					document.body.appendChild(anchor);
					anchor.click();
					anchor.remove();
					setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
					notify(t('lan.caDownloaded'), false);
				}).catch(function (reason) {
					notify(messageOf(reason), true);
				});
			}

			function lanCopy(url) {
				if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
					navigator.clipboard.writeText(url).then(function () {
						notify(t('lan.copied'), false);
					}).catch(function () {
						notify(t('lan.url') + ': ' + url, false);
					});
					return;
				}
				notify(t('lan.url') + ': ' + url, false);
			}

			var skillsCount = data === null ? 0 : data.skills.totals.skills;
			var mcpCount = data === null ? 0 : data.mcp.servers.length;
			var toolsCount = data === null || data.tools === undefined ? 0 : data.tools.total;
			var uiCount = uiState === null || !Array.isArray(uiState.features) ? 0 : uiState.features.filter(function (feature) { return feature.enabled === true; }).length;
			return h('div', { className: 'mgrRoot' },
				h('div', { className: 'mgrHead' },
					h('div', { className: 'mgrHeadMain' },
						h('h1', { className: 'mgrTitle' },
							t('panel'),
							data === null || data.version === '' ? null : h('span', { className: 'mgrVersion' }, 'v' + data.version)),
						h('div', { className: 'mgrSubtitle' },
							data === null ? t('state.loading') : t('subtitle') + ' · ' + data.dataDir)),
					h('div', { className: 'mgrHeadActions' },
						h('button', { type: 'button', className: 'mgrBtn', onClick: refresh, disabled: data === null || busy }, t('action.refresh')))),
				h('div', { className: 'mgrTabs', role: 'tablist' },
					h('button', {
						type: 'button',
						role: 'tab',
						'aria-selected': tab === 'skills',
						className: classes('mgrTab', tab === 'skills' && 'mgrTabActive'),
						onClick: function () { setTab('skills'); },
					}, t('tab.skills')),
					h('button', {
						type: 'button',
						role: 'tab',
						'aria-selected': tab === 'mcp',
						className: classes('mgrTab', tab === 'mcp' && 'mgrTabActive'),
						onClick: function () { setTab('mcp'); },
					}, t('tab.mcp'), h('span', { className: 'mgrTabCount' }, String(mcpCount))),
					h('button', {
						type: 'button',
						role: 'tab',
						'aria-selected': tab === 'search',
						className: classes('mgrTab', tab === 'search' && 'mgrTabActive'),
						onClick: function () { setTab('search'); },
					}, t('tab.search')),
					h('button', {
						type: 'button',
						role: 'tab',
						'aria-selected': tab === 'ui',
						className: classes('mgrTab', tab === 'ui' && 'mgrTabActive'),
						onClick: function () { setTab('ui'); },
					}, t('tab.ui'), uiCount > 0 ? h('span', { className: 'mgrTabCount' }, String(uiCount)) : null),
					h('button', {
						type: 'button',
						role: 'tab',
						'aria-selected': tab === 'preferences',
						className: classes('mgrTab', tab === 'preferences' && 'mgrTabActive'),
						onClick: function () { setTab('preferences'); },
					}, t('tab.preferences')),
					h('button', {
						type: 'button',
						role: 'tab',
						'aria-selected': tab === 'lan',
						className: classes('mgrTab', tab === 'lan' && 'mgrTabActive'),
						onClick: function () { setTab('lan'); },
					}, t('tab.lan'), lan !== null && lan.running === true
						? h('span', { className: 'mgrDot mgrDot-ready' })
						: null),
					h('button', {
						type: 'button',
						role: 'tab',
						'aria-selected': tab === 'tools',
						className: classes('mgrTab', tab === 'tools' && 'mgrTabActive'),
						onClick: function () { setTab('tools'); },
					}, t('tab.tools'), h('span', { className: 'mgrTabCount' }, String(toolsCount)))),
				h('div', { className: 'mgrBody' },
					error === '' ? null : h('div', { className: 'mgrErrorBox' },
						h('span', null, t('error.banner') + '：' + error),
						h('span', { className: 'mgrSpacer' }),
						h('button', { type: 'button', className: 'mgrBtn', onClick: function () { void load(); } }, t('action.retry'))),
					data === null
						? (error === '' ? h(Loading, { label: t('state.loading') }) : null)
						: (tab === 'skills'
							? (data.kernel !== undefined && data.kernel.routes > 0
								? h(SkillsWorkspace, { t: t, callKernel: kernelCall, rescan: rescanToken })
								: h('div', { className: 'mgrErrorBox' },
									h('span', null, t('skx.kernelError', {
										detail: data.kernel === undefined
											? t('skx.kernelNotWired')
											: t('skx.kernelDetail', {
												mounted: String(data.kernel.mounted),
												routes: String(data.kernel.routes),
												error: data.kernel.error === '' ? t('skx.kernelNoError') : data.kernel.error,
											}),
									})),
									h('span', { className: 'mgrSpacer' }),
									h('button', { type: 'button', className: 'mgrBtn', onClick: function () { void load(); } }, t('action.retry'))))
							: tab === 'mcp'
								? h(McpSection, {
									t: t,
									mcp: data.mcp,
									busy: busy,
									onToggle: mcpToggle,
									onReconnect: mcpReconnect,
									onRemove: mcpRemove,
									onSave: mcpSave,
								})
								: tab === 'search'
									? h(SearchSection, {
										t: t,
										status: searchStatus,
										sub: searchSub,
										setSub: setSearchSub,
										query: searchQuery,
										setQuery: setSearchQuery,
										onSearch: searchWeb,
										onSave: saveSearchChannel,
										onTest: testSearchChannel,
										onMove: moveSearchChannel,
										onMode: setSearchMode,
										onResetCooldowns: resetSearchCooldowns,
										timeRange: searchTimeRange,
										onTimeRange: setSearchTimeRange,
										blocked: searchBlocked,
										onBlockedChange: setSearchBlocked,
										onSaveBlocked: saveSearchBlocked,
										onSafeSearch: saveSafeSearch,
										testAll: searchTestAll,
										testAllBusy: searchTestAllBusy,
										onTestAll: testAllSearchChannels,
										bulkBusy: searchBulkBusy,
										onSetChannels: setSearchChannels,
										busy: searchBusy,
										result: searchResult,
										error: searchError,
									})
										: tab === 'preferences'
											? h(PreferencesSection, {
												t: t,
												call: call,
												notify: notify,
												setError: setError,
											})
											: tab === 'tools'
											? h(ToolsSection, {
												t: t,
												catalog: toolsCatalog,
												sub: toolsSub,
												setSub: setToolsSub,
											})
											: tab === 'ui'
												? h(UiEnhancementsSection, {
													t: t,
													state: uiState,
													busy: uiBusy,
													onToggle: toggleUiFeature,
												})
											: h(LanSection, {
									t: t,
									state: lan,
									busy: busy,
									onToggle: lanToggle,
									onToggleSecure: lanToggleSecure,
									onCopy: lanCopy,
									onDownloadCa: lanDownloadCa,
								}))),
				toast === null ? null : h('div', { className: classes('mgrToast', toast.error && 'mgrToastError'), role: 'status' },
					h('span', { className: 'mgrToastText' }, toast.message),
					h('button', {
						type: 'button',
						className: 'mgrToastClose',
						'aria-label': t('action.close'),
						onClick: function () { setToast(null); },
					}, '×')));
		}

		//#endregion

		//#region plugin

		var inject = ['slots', 'sessions', 'locale', 'commandUi', 'configForms', 'connection', 'layout'];

		/**
		 * Register the sidebar entry and the main panel.
		 *
		 * @param {object} ctx - Client context.
		 * @returns {void}
		 */
		function apply(ctx) {
			/** Register something that may fail without taking the panel with it. */
			var guard = function (label, register) {
				try {
					return register();
				} catch (error) {
					console.warn('[dsh-manager] ' + label + ' 没有注册成功', error);
					return function () {};
				}
			};

			ctx.effect(function () {
				return ctx.locale.register(NS, { zh: zh, en: en });
			}, 'dsh-manager: dictionaries');
			var t = ctx.locale.bind(NS);

			// The vendored conversation-rewind client: the same code the plugin
			// ships, mounted while the manager's switch is on. The services it
			// needs come from the Host's client packages; a missing one only
			// means the rewind surface does not mount.
			ctx.effect(function () {
				try {
					return mountRewindClient(ctx, t);
				} catch (error) {
					console.warn('[dsh-manager] 对话回退客户端没有挂载', error);
					return function () {};
				}
			}, 'dsh-manager: rewind client');

			function mountRewindClient(ctx, t) {
				var alive = true;
				/** One service of the client context, by name. */
				var service = function (name) {
					if (ctx[name] !== undefined) return ctx[name];
					return ctx.get(name);
				};
				/** Tell the host what the browser managed to do. */
				var report = function (mounted, reason) {
					callHost(ctx, 'ui-client-status', { scope: 'mount', mounted: mounted, reason: reason }).catch(function () {});
				};
				/** Mount the vendored rewind client once the host says it is on. */
				var mount = function (attempt) {
					callHost(ctx, 'ui-status', {}).then(function (value) {
						if (!alive) return;
						var features = value !== null && typeof value === 'object' && Array.isArray(value.features) ? value.features : [];
						var rewind = features.find(function (feature) { return feature.id === 'rewind'; });
						if (rewind === undefined) return report(false, 'unknown-feature');
						if (rewind.enabled !== true) {
							callHost(ctx, 'ui-client-status', { scope: 'row', mounted: false, reason: 'row-action-feature-off' }).catch(function () {});
							return report(false, 'feature-off');
						}
						// The upstream half takes over the `conversation.chat.node` row
						// component and appends its button to the row's action cluster
						// (next to copy). This DSH renders that row without a session
						// id, which made the takeover bail; the bridge below hands its
						// `targetOf` the session the page is showing, so upstream's own
						// placement works unchanged.
						var lastRowReason = '';
						var reportRow = function (mounted, reason) {
							if (lastRowReason === reason) return;
							lastRowReason = reason;
							callHost(ctx, 'ui-client-status', { scope: 'row', mounted: mounted, reason: reason }).catch(function () {});
						};
						var currentSession = function () {
							var sessions = service('sessions');
							if (sessions === undefined || sessions === null || typeof sessions.list?.getSnapshot !== 'function') return undefined;
							var byId = sessions.list.getSnapshot().byId ?? {};
							var ids = Object.keys(byId).filter(function (id) { return (byId[id]?.retainedBy?.mainView ?? 0) > 0; });
							return ids.length === 1 ? ids[0] : undefined;
						};
						window.__dshManagerRewind = {
							enabled: function () { return true; },
							session: currentSession,
							report: function () { reportRow(true, 'row-action-mounted'); },
						};
						var shim = {
							effect: function (fn, label) { return ctx.effect(fn, label); },
							locale: ctx.locale,
							slots: {
								entries: function (key) { return ctx.slots.entries(key); },
								subscribe: function (key, fn) { return ctx.slots.subscribe(key, fn); },
								register: function (options, component) { return ctx.slots.register(options, component); },
								inject: function (name, fn) { return ctx.slots.inject(name, fn); },
							},
							sessions: service('sessions'),
							commandUi: service('commandUi'),
							configForms: service('configForms'),
							get: function (name) { return ctx.get(name); },
						};
						if (shim.sessions === undefined || shim.commandUi === undefined) {
							console.warn('[dsh-manager] 对话回退没有挂载：客户端服务不可用');
							return report(false, 'services-missing');
						}
						try {
							createRewindClient(require).apply(shim);
						} catch (error) {
							console.warn('[dsh-manager] 对话回退挂载失败', error);
							return report(false, 'apply-failed: ' + (error && error.message ? error.message : 'unknown'));
						}
						report(true, 'mounted');
						// The row takeover runs when the chat UI registers its row, which
						// is later than this mount; until then the panel says so.
						reportRow(false, 'row-action-pending');
						// Verify the takeover really replaced the row component: a
						// shadowed entry would look identical from the panel otherwise.
						var verify = function (attempt) {
							if (!alive) return;
							var entries = typeof ctx.slots.entries === 'function' ? ctx.slots.entries('conversation.chat.node') : [];
							var wrapped = (entries ?? []).some(function (item) {
								return item !== null && typeof item === 'object' && item.component?.__dshManagerRewindRow === true;
							});
							if (wrapped) return;
							if (attempt >= 8) return reportRow(false, 'row-action-takeover-rejected');
							setTimeout(function () { verify(attempt + 1); }, 1000);
						};
						verify(0);
					}).catch(function (error) {
						// The host's route may not answer yet; a few tries are enough.
						if (!alive) return;
						if (attempt >= 4) return report(false, 'status-unavailable: ' + (error && error.message ? error.message : 'unknown'));
						setTimeout(function () { mount(attempt + 1); }, 700);
					});
				};
				mount(0);
				return function () {
					alive = false;
					if (window.__dshManagerRewind !== undefined) delete window.__dshManagerRewind;
				};
			}

			ctx.effect(function () {
				var style = document.createElement('style');
				style.dataset.plugin = 'dsh-manager';
				style.textContent = css;
				document.head.appendChild(style);
				return function () { style.remove(); };
			}, 'dsh-manager: styles');

			ctx.effect(function () {
				return guard('主面板', function () {
					return ctx.slots.inject('main', function () {
						return ctx.slots.register({
							name: 'main',
							key: PANEL_ID,
							locale: NS,
							inject: function () { return { ctx: ctx, t: t }; },
						}, Panel);
					});
				});
			}, 'dsh-manager: main panel');

			ctx.effect(function () {
				return guard('输入框历史', function () { return installComposerHistory(ctx); });
			}, 'dsh-manager: composer history');

			ctx.effect(function () {
				return guard('侧边栏入口', function () {
					return ctx.slots.inject('sidebar.panellist', function () {
						return ctx.slots.register({
							name: 'sidebar.panellist',
							id: PANEL_ID,
							order: PANEL_ORDER,
							locale: NS,
							label: function () { return t('panel'); },
						}, ManagerIcon);
					});
				});
			}, 'dsh-manager: sidebar entry');

			// The settings dialog lists one nav row per `settings.section`; ours is a
			// door to the panel, not a page inside the dialog (see ManagerSettingsEntry).
			ctx.effect(function () {
				return guard('设置页入口', function () {
					var offSection = ctx.slots.inject('settings.section', function () {
						return ctx.slots.register({
							name: 'settings.section',
							id: PANEL_ID,
							order: SETTINGS_ORDER,
							locale: NS,
							label: function () { return t('panel'); },
							inject: function () { return { ctx: ctx, t: t }; },
						}, ManagerSettingsEntry);
					});
					// The host paints this beside the label; a host without the seat
					// keeps its own default glyph, so nothing here is required.
					var offIcon = ctx.slots.inject('settings.section.icon', function () {
						return ctx.slots.register({
							name: 'settings.section.icon',
							id: PANEL_ID,
							order: SETTINGS_ORDER,
							locale: NS,
						}, function (owner) {
							return h(ManagerIcon, { size: owner.size === undefined ? 16 : owner.size });
						});
					});
					return function () {
						if (typeof offSection === 'function') offSection();
						if (typeof offIcon === 'function') offIcon();
					};
				});
			}, 'dsh-manager: settings entry');
		}

		/**
		 * The settings row opens the panel instead of rendering a page in place.
		 *
		 * The panel is a full-window workspace — its own header, seven top tabs and
		 * its own scrolling body — while the settings content column is about 556px
		 * wide. Embedding it would add a second layout to design and verify, plus a
		 * second scroll container and a duplicate title; switching panels costs one
		 * click and no layout at all, which is what the shell's `close` is for.
		 *
		 * When the panel cannot be selected the dialog stays open and says so: a row
		 * that closes the dialog onto nothing would be worse than no row at all.
		 *
		 * @param {object} props - `ctx` and `t` from `inject`, `close` from the shell.
		 * @returns {object|null} React node.
		 */
		function ManagerSettingsEntry(props) {
			var [failed, setFailed] = useState(false);
			useEffect(function () {
				var layout = props.ctx === undefined ? undefined : props.ctx.layout;
				try {
					if (layout === undefined || typeof layout.selectPanel !== 'function') {
						throw new Error('the layout service is not available');
					}
					layout.selectPanel(PANEL_ID);
				} catch (error) {
					console.warn('[dsh-manager] 设置页入口没有打开主面板', error);
					setFailed(true);
					return;
				}
				if (typeof props.close === 'function') props.close();
			}, []);
			if (!failed) return null;
			return h('div', { className: 'mgrWarn' }, props.t('settings.failed'));
		}

		/**
		 * Sidebar mark: three sliders in the current text color.
		 *
		 * @param {object} props - `size`, `active`.
		 * @returns {object} React node.
		 */
		function ManagerIcon(props) {
			var size = props.size ?? 18;
			return h('svg', {
				viewBox: '0 0 24 24',
				width: size,
				height: size,
				fill: 'none',
				stroke: 'currentColor',
				strokeWidth: 1.7,
				strokeLinecap: 'round',
				'aria-hidden': true,
			},
				h('path', { d: 'M4 6h8' }),
				h('path', { d: 'M17 6h3' }),
				h('circle', { cx: 14.5, cy: 6, r: 2.5, fill: 'currentColor', stroke: 'none' }),
				h('path', { d: 'M4 12h2' }),
				h('path', { d: 'M11 12h9' }),
				h('circle', { cx: 8.5, cy: 12, r: 2.5, fill: 'currentColor', stroke: 'none' }),
				h('path', { d: 'M4 18h10' }),
				h('path', { d: 'M19 18h1' }),
				h('circle', { cx: 16.5, cy: 18, r: 2.5, fill: 'currentColor', stroke: 'none' }));
		}

		//#endregion

		return {
			inject: inject,
			apply: apply,
		};
	},
});
