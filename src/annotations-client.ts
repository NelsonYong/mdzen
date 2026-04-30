/**
 * Client-side annotation module — selection toolbar, highlight/underline rendering,
 * and persistence to /api/annotations.
 *
 * Anchor strategy: W3C TextQuoteSelector { exact, prefix, suffix } against the
 * plain-text content of `.content` (UI buttons / mermaid blocks excluded).
 * The matching algorithm is the same one used server-side in src/utils/anchor.ts —
 * we vendor a JS copy here to keep the client zero-deps.
 */

export const annotationsStyles = `
:root[data-theme="light"] {
  --anno-yellow-bg: rgba(254, 240, 138, 0.7);
  --anno-yellow-border: #facc15;
  --anno-green-bg: rgba(187, 247, 208, 0.7);
  --anno-green-border: #22c55e;
  --anno-pink-bg: rgba(251, 207, 232, 0.7);
  --anno-pink-border: #ec4899;
  --anno-blue-bg: rgba(191, 219, 254, 0.7);
  --anno-blue-border: #3b82f6;
}
:root[data-theme="dark"] {
  --anno-yellow-bg: rgba(202, 138, 4, 0.42);
  --anno-yellow-border: #facc15;
  --anno-green-bg: rgba(22, 163, 74, 0.42);
  --anno-green-border: #4ade80;
  --anno-pink-bg: rgba(219, 39, 119, 0.42);
  --anno-pink-border: #f472b6;
  --anno-blue-bg: rgba(37, 99, 235, 0.42);
  --anno-blue-border: #60a5fa;
}

/* Overlay-based annotations — zero DOM mutation.
 * For each annotation we create absolutely-positioned <div> rectangles inside
 * .anno-overlay-host that exactly cover the Range.getClientRects() of the anchor.
 * The text below stays untouched, so tables/code blocks/lists keep their natural layout.
 * Click handling is done via hit-testing in JS (overlays use pointer-events:none so
 * text selection still works through them). */
.content { position: relative; }
.anno-overlay-host {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 4;
}
.anno-overlay {
  position: absolute;
  border-radius: 2px;
  transition: background-color 0.15s ease, opacity 0.15s ease;
}
.anno-overlay[data-kind="highlight"][data-color="yellow"] { background-color: var(--anno-yellow-bg); }
.anno-overlay[data-kind="highlight"][data-color="green"]  { background-color: var(--anno-green-bg);  }
.anno-overlay[data-kind="highlight"][data-color="pink"]   { background-color: var(--anno-pink-bg);   }
.anno-overlay[data-kind="highlight"][data-color="blue"]   { background-color: var(--anno-blue-bg);   }

.anno-overlay[data-kind="underline"],
.anno-overlay[data-kind="comment"] {
  background: transparent;
  /* the underline is drawn by an inner pseudo-element so the bbox can stay rectangular */
}
.anno-overlay[data-kind="underline"]::after,
.anno-overlay[data-kind="comment"]::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
}
.anno-overlay[data-kind="underline"]::after {
  background:
    linear-gradient(90deg, currentColor 50%, transparent 50%) repeat-x bottom left / 6px 2px;
  /* fallback: solid bar */
  background-color: currentColor;
  height: 2px;
}
.anno-overlay[data-kind="comment"]::after {
  background-image: radial-gradient(circle, currentColor 1px, transparent 1.5px);
  background-size: 6px 2px;
  background-repeat: repeat-x;
  background-position: bottom left;
}
.anno-overlay[data-kind="underline"][data-color="yellow"],
.anno-overlay[data-kind="comment"][data-color="yellow"]   { color: var(--anno-yellow-border); }
.anno-overlay[data-kind="underline"][data-color="green"],
.anno-overlay[data-kind="comment"][data-color="green"]    { color: var(--anno-green-border);  }
.anno-overlay[data-kind="underline"][data-color="pink"],
.anno-overlay[data-kind="comment"][data-color="pink"]     { color: var(--anno-pink-border);   }
.anno-overlay[data-kind="underline"][data-color="blue"],
.anno-overlay[data-kind="comment"][data-color="blue"]     { color: var(--anno-blue-border);   }

.anno-overlay[data-anno-hovered="true"] { filter: brightness(0.92); }

/* ───── Comment rail (right side of .content) ───── */
.main-content { position: relative; }
.anno-rail {
  position: absolute;
  top: 0;
  right: -68px;
  width: 56px;
  pointer-events: none;
  z-index: 6;
}
.anno-pin {
  position: absolute;
  right: 8px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid var(--bg-content);
  box-shadow: var(--shadow);
  cursor: pointer;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--anno-yellow-border);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.anno-pin:hover { transform: scale(1.08); box-shadow: var(--shadow-lg); }
.anno-pin:focus-visible { outline: 2px solid var(--link-color); outline-offset: 2px; }
.anno-pin[data-color="yellow"] { background: var(--anno-yellow-border); }
.anno-pin[data-color="green"]  { background: var(--anno-green-border); }
.anno-pin[data-color="pink"]   { background: var(--anno-pink-border); }
.anno-pin[data-color="blue"]   { background: var(--anno-blue-border); }
.anno-pin svg { width: 16px; height: 16px; }
@media (max-width: 1100px) {
  .anno-rail { display: none; }
  /* On narrow viewports the rail is hidden; the dotted-underline mark
   * already shows the user where comments live. No layout changes. */
}

/* ───── Comment editor (floating textarea on create) ───── */
.anno-comment-editor {
  position: absolute;
  z-index: 260;
  display: none;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: var(--bg-content);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  width: 320px;
  max-width: calc(100vw - 24px);
}
.anno-comment-editor[data-open="true"] { display: flex; }
.anno-comment-editor textarea {
  width: 100%;
  min-height: 72px;
  resize: vertical;
  border: 1px solid var(--border-medium);
  border-radius: 6px;
  padding: 8px 10px;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  background: var(--bg-page);
  color: var(--text-primary);
  outline: none;
}
.anno-comment-editor textarea:focus { border-color: var(--link-color); }
.anno-comment-editor-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.anno-comment-editor-colors { display: flex; gap: 4px; }
.anno-comment-editor-actions { display: flex; gap: 6px; }
.anno-comment-editor-btn {
  border: 1px solid var(--border-medium);
  background: var(--bg-page);
  color: var(--text-primary);
  border-radius: 6px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: 13px;
}
.anno-comment-editor-btn:hover { background: var(--bg-hover); }
.anno-comment-editor-btn[data-variant="primary"] { background: var(--link-color); color: #fff; border-color: var(--link-color); }
.anno-comment-editor-btn[data-variant="primary"]:hover { filter: brightness(0.92); }
.anno-comment-editor-btn:focus-visible { outline: 2px solid var(--link-color); outline-offset: 2px; }

/* ───── Comment popover (click pin) ───── */
.anno-comment-popover {
  position: absolute;
  z-index: 250;
  display: none;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-content);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  width: 320px;
  max-width: calc(100vw - 24px);
}
.anno-comment-popover[data-open="true"] { display: flex; }
.anno-comment-popover-text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 240px;
  overflow-y: auto;
}
.anno-comment-popover-meta {
  font-size: 11px;
  color: var(--text-tertiary);
}
.anno-comment-popover-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  border-top: 1px solid var(--border-color);
  padding-top: 8px;
}

/* Floating selection toolbar */
.anno-toolbar {
  position: absolute;
  z-index: 250;
  display: none;
  align-items: center;
  gap: 4px;
  padding: 6px;
  background: var(--bg-content);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  user-select: none;
  animation: anno-tool-in 0.12s ease-out;
}
@keyframes anno-tool-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.anno-toolbar[data-open="true"] { display: inline-flex; }
.anno-tool-btn {
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 13px;
}
.anno-tool-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.anno-tool-btn:focus-visible { outline: 2px solid var(--link-color); outline-offset: 1px; }
.anno-tool-btn[aria-pressed="true"] { background: var(--bg-hover); color: var(--link-color); }
.anno-tool-divider { width: 1px; height: 18px; background: var(--border-color); margin: 0 2px; }
.anno-tool-color {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
}
.anno-tool-color[data-anno-color="yellow"],
.anno-tool-color[data-anno-pop-color="yellow"] { background: var(--anno-yellow-border); }
.anno-tool-color[data-anno-color="green"],
.anno-tool-color[data-anno-pop-color="green"]  { background: var(--anno-green-border); }
.anno-tool-color[data-anno-color="pink"],
.anno-tool-color[data-anno-pop-color="pink"]   { background: var(--anno-pink-border); }
.anno-tool-color[data-anno-color="blue"],
.anno-tool-color[data-anno-pop-color="blue"]   { background: var(--anno-blue-border); }
.anno-tool-color[aria-pressed="true"] { border-color: var(--text-primary); transform: scale(1.15); }

/* Per-annotation popover (delete) */
.anno-popover {
  position: absolute;
  z-index: 240;
  display: none;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: var(--bg-content);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: var(--shadow-lg);
}
.anno-popover[data-open="true"] { display: inline-flex; }
.anno-popover .anno-tool-btn[data-action="delete"]:hover {
  background: var(--adm-danger-bg);
  color: var(--adm-danger-title-color);
}
`;

export const annotationsToolbarMarkup = `
<div class="anno-toolbar" data-anno-toolbar role="toolbar" aria-label="标注工具栏">
  <button type="button" class="anno-tool-btn" data-anno-action="highlight" aria-pressed="false" title="高亮">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
  </button>
  <button type="button" class="anno-tool-btn" data-anno-action="underline" aria-pressed="false" title="划线">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3v7a6 6 0 0 0 12 0V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>
  </button>
  <button type="button" class="anno-tool-btn" data-anno-action="comment" aria-pressed="false" title="评论">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
  </button>
  <span class="anno-tool-divider" aria-hidden="true"></span>
  <button type="button" class="anno-tool-color" data-anno-color="yellow" aria-pressed="true" aria-label="黄色"></button>
  <button type="button" class="anno-tool-color" data-anno-color="green"  aria-pressed="false" aria-label="绿色"></button>
  <button type="button" class="anno-tool-color" data-anno-color="pink"   aria-pressed="false" aria-label="粉色"></button>
  <button type="button" class="anno-tool-color" data-anno-color="blue"   aria-pressed="false" aria-label="蓝色"></button>
</div>
<div class="anno-comment-editor" data-anno-comment-editor role="dialog" aria-label="新增评论">
  <textarea data-anno-comment-text rows="3" placeholder="添加评论…"></textarea>
  <div class="anno-comment-editor-row">
    <div class="anno-comment-editor-colors">
      <button type="button" class="anno-tool-color" data-anno-editor-color="yellow" aria-pressed="true"  aria-label="黄色"></button>
      <button type="button" class="anno-tool-color" data-anno-editor-color="green"  aria-pressed="false" aria-label="绿色"></button>
      <button type="button" class="anno-tool-color" data-anno-editor-color="pink"   aria-pressed="false" aria-label="粉色"></button>
      <button type="button" class="anno-tool-color" data-anno-editor-color="blue"   aria-pressed="false" aria-label="蓝色"></button>
    </div>
    <div class="anno-comment-editor-actions">
      <button type="button" class="anno-comment-editor-btn" data-anno-editor-action="cancel">取消</button>
      <button type="button" class="anno-comment-editor-btn" data-variant="primary" data-anno-editor-action="save">保存 (⌘↵)</button>
    </div>
  </div>
</div>

<div class="anno-comment-popover" data-anno-comment-popover role="dialog" aria-label="查看评论">
  <div class="anno-comment-popover-text" data-anno-comment-popover-text></div>
  <div class="anno-comment-popover-meta" data-anno-comment-popover-meta></div>
  <div class="anno-comment-popover-actions">
    <button type="button" class="anno-comment-editor-btn" data-anno-comment-pop-action="edit">编辑</button>
    <button type="button" class="anno-comment-editor-btn" data-anno-comment-pop-action="delete">删除</button>
  </div>
</div>

<div class="anno-popover" data-anno-popover role="toolbar" aria-label="标注操作">
  <button type="button" class="anno-tool-color" data-anno-pop-color="yellow" aria-label="改为黄色"></button>
  <button type="button" class="anno-tool-color" data-anno-pop-color="green"  aria-label="改为绿色"></button>
  <button type="button" class="anno-tool-color" data-anno-pop-color="pink"   aria-label="改为粉色"></button>
  <button type="button" class="anno-tool-color" data-anno-pop-color="blue"   aria-label="改为蓝色"></button>
  <span class="anno-tool-divider" aria-hidden="true"></span>
  <button type="button" class="anno-tool-btn" data-anno-action="delete" title="删除标注" aria-label="删除标注">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
  </button>
</div>
`;

export const annotationsScript = `
<script>
(function() {
  var ANNO_CONTEXT = 32;
  var EXCLUDE_SELECTOR = 'button, .mermaid-expand-btn, .code-copy-btn, .line-link-btn, pre.mermaid';
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, BUTTON: 1 };

  var contentEl = null;
  var fileKey = null;
  var toolbar = null;
  var popover = null;
  var selectedColor = 'yellow';
  var activePopoverId = null;
  var saveInFlight = false;

  /* ───── plain-text walker (skips UI buttons + mermaid) ───── */

  function buildPlainText(root) {
    var parts = [];
    var map = []; // [{node, startInPlain, length}]
    var offset = 0;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function(node) {
        var p = node.parentNode;
        while (p && p !== root) {
          if (p.nodeType === 1) {
            var tag = p.tagName;
            if (SKIP_TAGS[tag]) return NodeFilter.FILTER_REJECT;
            if (p.classList && (p.classList.contains('mermaid') || p.classList.contains('mermaid-expand-btn') || p.classList.contains('code-copy-btn') || p.classList.contains('line-link-btn'))) {
              return NodeFilter.FILTER_REJECT;
            }
          }
          p = p.parentNode;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while ((n = walker.nextNode())) {
      var text = n.nodeValue || '';
      if (text.length === 0) continue;
      map.push({ node: n, startInPlain: offset, length: text.length });
      parts.push(text);
      offset += text.length;
    }
    return { text: parts.join(''), map: map };
  }

  function plainOffsetToDom(map, offset) {
    // Returns {node, offsetInNode} or null
    for (var i = 0; i < map.length; i++) {
      var m = map[i];
      if (offset >= m.startInPlain && offset <= m.startInPlain + m.length) {
        return { node: m.node, offsetInNode: offset - m.startInPlain };
      }
    }
    return null;
  }

  function rangeFromPlainOffsets(map, start, end) {
    var s = plainOffsetToDom(map, start);
    var e = plainOffsetToDom(map, end);
    if (!s || !e) return null;
    var range = document.createRange();
    try {
      range.setStart(s.node, s.offsetInNode);
      range.setEnd(e.node, e.offsetInNode);
    } catch (err) { return null; }
    return range;
  }

  function selectionPlainOffsets(map, range) {
    var startOff = -1, endOff = -1;
    for (var i = 0; i < map.length; i++) {
      var m = map[i];
      if (m.node === range.startContainer) startOff = m.startInPlain + range.startOffset;
      if (m.node === range.endContainer)   endOff   = m.startInPlain + range.endOffset;
    }
    if (startOff < 0 || endOff < 0 || endOff <= startOff) return null;
    return { start: startOff, end: endOff };
  }

  /* ───── TextQuote algorithm (mirror of src/utils/anchor.ts) ───── */

  function makeTextQuote(text, start, end) {
    return {
      exact: text.slice(start, end),
      prefix: text.slice(Math.max(0, start - ANNO_CONTEXT), start),
      suffix: text.slice(end, Math.min(text.length, end + ANNO_CONTEXT))
    };
  }
  function suffixOfAMatchesPrefixOfB(a, b) {
    var max = Math.min(a.length, b.length), i = 0;
    while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
    return i;
  }
  function prefixOfAMatchesPrefixOfB(a, b) {
    var max = Math.min(a.length, b.length), i = 0;
    while (i < max && a[i] === b[i]) i++;
    return i;
  }
  function resolveTextQuote(haystack, anchor) {
    if (!anchor.exact) return null;
    var occurrences = [];
    var from = 0, idx;
    while ((idx = haystack.indexOf(anchor.exact, from)) !== -1) { occurrences.push(idx); from = idx + 1; }
    if (occurrences.length === 0) return null;
    if (occurrences.length === 1 && !anchor.prefix && !anchor.suffix) {
      return { start: occurrences[0], end: occurrences[0] + anchor.exact.length, score: 0 };
    }
    var best = null;
    for (var i = 0; i < occurrences.length; i++) {
      var s = occurrences[i];
      var e = s + anchor.exact.length;
      var before = haystack.slice(Math.max(0, s - anchor.prefix.length), s);
      var after  = haystack.slice(e, Math.min(haystack.length, e + anchor.suffix.length));
      var ps = anchor.prefix ? suffixOfAMatchesPrefixOfB(before, anchor.prefix) : 0;
      var ss = anchor.suffix ? prefixOfAMatchesPrefixOfB(after, anchor.suffix)  : 0;
      var score = ps + ss;
      if (!best || score > best.score) best = { start: s, end: e, score: score };
    }
    if (best && (anchor.prefix || anchor.suffix) && best.score === 0) return null;
    return best;
  }

  /* ───── Overlay rendering (zero-DOM-mutation) ───── */

  var overlayHost = null;
  var rectMap = new Map(); // id -> [{ left, top, width, height }] in .content-relative coords
  var loadedAnnotations = [];

  function ensureOverlayHost() {
    if (overlayHost && contentEl && contentEl.contains(overlayHost)) return overlayHost;
    if (!contentEl) return null;
    overlayHost = document.createElement('div');
    overlayHost.className = 'anno-overlay-host';
    overlayHost.setAttribute('aria-hidden', 'true');
    contentEl.appendChild(overlayHost);
    return overlayHost;
  }

  function clearOverlay() {
    if (overlayHost) overlayHost.innerHTML = '';
    rectMap.clear();
  }

  function applyAll(annotations) {
    if (!contentEl) return;
    var host = ensureOverlayHost();
    if (!host) return;
    host.innerHTML = '';
    rectMap.clear();
    var pt = buildPlainText(contentEl);
    var contentRect = contentEl.getBoundingClientRect();
    annotations.forEach(function(a) {
      var hit = resolveTextQuote(pt.text, a.anchor);
      if (!hit) return;
      var range = rangeFromPlainOffsets(pt.map, hit.start, hit.end);
      if (!range) return;
      var rects = range.getClientRects();
      if (!rects || rects.length === 0) return;
      var stored = [];
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        if (r.width === 0 || r.height === 0) continue;
        var left = r.left - contentRect.left;
        var top = r.top - contentRect.top;
        var ov = document.createElement('div');
        ov.className = 'anno-overlay';
        ov.setAttribute('data-anno-id', a.id);
        ov.setAttribute('data-kind', a.kind);
        ov.setAttribute('data-color', a.color);
        ov.style.left = left + 'px';
        ov.style.top = top + 'px';
        ov.style.width = r.width + 'px';
        ov.style.height = r.height + 'px';
        host.appendChild(ov);
        stored.push({ left: left, top: top, width: r.width, height: r.height });
      }
      if (stored.length) rectMap.set(a.id, stored);
    });
    renderRail(annotations);
  }

  // Hit-test: given a viewport-relative click point, find which annotation it lands in.
  function findAnnotationAtPoint(clientX, clientY) {
    if (!contentEl) return null;
    var contentRect = contentEl.getBoundingClientRect();
    var lx = clientX - contentRect.left;
    var ly = clientY - contentRect.top;
    // Iterate in reverse over loadedAnnotations so the most recently-added wins on overlap
    for (var i = loadedAnnotations.length - 1; i >= 0; i--) {
      var ann = loadedAnnotations[i];
      var rects = rectMap.get(ann.id);
      if (!rects) continue;
      for (var j = 0; j < rects.length; j++) {
        var r = rects[j];
        if (lx >= r.left && lx <= r.left + r.width && ly >= r.top && ly <= r.top + r.height) {
          return ann.id;
        }
      }
    }
    return null;
  }

  /* ───── Right-side comment rail ───── */

  var rail = null;
  var mainContentEl = null;

  function ensureRail() {
    if (rail && document.body.contains(rail)) return rail;
    mainContentEl = document.querySelector('.main-content');
    if (!mainContentEl) return null;
    rail = document.createElement('div');
    rail.className = 'anno-rail';
    rail.setAttribute('aria-label', '评论列表');
    mainContentEl.appendChild(rail);
    return rail;
  }

  function renderRail(annotations) {
    var r = ensureRail();
    if (!r || !mainContentEl || !contentEl) return;
    r.innerHTML = '';
    var comments = annotations.filter(function(a) { return a.kind === 'comment'; });
    if (!comments.length) return;
    var pt = buildPlainText(contentEl);
    var mainRect = mainContentEl.getBoundingClientRect();
    var pins = [];
    comments.forEach(function(a) {
      var hit = resolveTextQuote(pt.text, a.anchor);
      if (!hit) return;
      var range = rangeFromPlainOffsets(pt.map, hit.start, hit.end);
      if (!range) return;
      var rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      pins.push({ top: rect.top - mainRect.top - 4, ann: a });
    });
    pins.sort(function(a, b) { return a.top - b.top; });
    for (var i = 1; i < pins.length; i++) {
      if (pins[i].top - pins[i - 1].top < 42) pins[i].top = pins[i - 1].top + 42;
    }
    pins.forEach(function(p) {
      var pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'anno-pin';
      pin.setAttribute('data-anno-id', p.ann.id);
      pin.setAttribute('data-anno-pin', '');
      pin.setAttribute('data-color', p.ann.color);
      pin.style.top = p.top + 'px';
      pin.title = '查看评论';
      pin.setAttribute('aria-label', '评论: ' + (p.ann.note || '').slice(0, 40));
      pin.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
      r.appendChild(pin);
    });
  }

  /* ───── Comment editor + popover ───── */

  var commentEditor = null;
  var commentPopover = null;
  var pendingAnchor = null;
  var pendingRect = null;
  var editorColor = 'yellow';
  var activeCommentId = null;

  function setEditorColor(c) {
    editorColor = c;
    if (!commentEditor) return;
    commentEditor.querySelectorAll('[data-anno-editor-color]').forEach(function(b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-anno-editor-color') === c ? 'true' : 'false');
    });
  }

  function showCommentEditorForSelection() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    var range = sel.getRangeAt(0);
    if (!contentEl || !contentEl.contains(range.commonAncestorContainer)) return;
    var pt = buildPlainText(contentEl);
    var offsets = selectionPlainOffsets(pt.map, range);
    if (!offsets) return;
    pendingAnchor = makeTextQuote(pt.text, offsets.start, offsets.end);
    pendingRect = range.getBoundingClientRect();
    delete commentEditor.dataset.editingId;
    setEditorColor(editorColor);
    commentEditor.querySelector('[data-anno-comment-text]').value = '';
    commentEditor.setAttribute('data-open', 'true');
    positionFloater(commentEditor, pendingRect);
    commentEditor.querySelector('textarea').focus();
    hideToolbar();
  }
  function hideCommentEditor() {
    if (commentEditor) {
      commentEditor.removeAttribute('data-open');
      delete commentEditor.dataset.editingId;
    }
    pendingAnchor = null; pendingRect = null;
  }
  function commitNewComment() {
    if (!pendingAnchor) return;
    var text = (commentEditor.querySelector('textarea').value || '').trim();
    if (!text || saveInFlight) return;
    saveInFlight = true;
    postCreate({ kind: 'comment', color: editorColor, anchor: pendingAnchor, note: text })
      .then(function(d) {
        loadedAnnotations.push(d.annotation);
        applyAll(loadedAnnotations);
        var sel = window.getSelection(); if (sel) sel.removeAllRanges();
        hideCommentEditor();
        notifyChanged();
      })
      .catch(function(err) { console.error('[anno] comment save failed:', err); })
      .finally(function() { saveInFlight = false; });
  }
  function saveEditedComment() {
    var id = commentEditor.dataset.editingId;
    if (!id) { commitNewComment(); return; }
    var text = (commentEditor.querySelector('textarea').value || '').trim();
    if (!text || saveInFlight) return;
    saveInFlight = true;
    patchAnno(id, { note: text, color: editorColor }).then(function(d) {
      if (d && d.annotation) {
        var idx = loadedAnnotations.findIndex(function(a) { return a.id === id; });
        if (idx >= 0) loadedAnnotations[idx] = d.annotation;
        applyAll(loadedAnnotations);
        notifyChanged();
      }
      hideCommentEditor();
    }).finally(function() { saveInFlight = false; });
  }

  function showCommentPopover(target, ann) {
    if (!commentPopover) return;
    activeCommentId = ann.id;
    var rect = target.getBoundingClientRect();
    commentPopover.querySelector('[data-anno-comment-popover-text]').textContent = ann.note || '';
    var date = new Date(ann.updatedAt || ann.createdAt);
    commentPopover.querySelector('[data-anno-comment-popover-meta]').textContent = '更新于 ' + date.toLocaleString();
    commentPopover.setAttribute('data-open', 'true');
    // Try to place to the LEFT of the target (rail is on right); if no room, place to the right.
    var top = window.scrollY + rect.top;
    var left = window.scrollX + rect.left - commentPopover.offsetWidth - 12;
    if (left < 8) left = window.scrollX + rect.right + 12;
    commentPopover.style.top = top + 'px';
    commentPopover.style.left = left + 'px';
  }
  function hideCommentPopover() {
    if (commentPopover) commentPopover.removeAttribute('data-open');
    activeCommentId = null;
  }
  function editActiveComment() {
    if (!activeCommentId) return;
    var ann = loadedAnnotations.find(function(a) { return a.id === activeCommentId; });
    if (!ann) return;
    pendingAnchor = ann.anchor;
    var pinOrMark = document.querySelector('[data-anno-id="' + activeCommentId + '"]');
    pendingRect = pinOrMark ? pinOrMark.getBoundingClientRect() : null;
    setEditorColor(ann.color);
    commentEditor.querySelector('textarea').value = ann.note || '';
    commentEditor.dataset.editingId = activeCommentId;
    commentEditor.setAttribute('data-open', 'true');
    if (pendingRect) positionFloater(commentEditor, pendingRect);
    commentEditor.querySelector('textarea').focus();
    hideCommentPopover();
  }
  function deleteActiveComment() {
    if (!activeCommentId) return;
    var id = activeCommentId;
    deleteAnno(id).then(function(ok) {
      if (!ok) return;
      loadedAnnotations = loadedAnnotations.filter(function(a) { return a.id !== id; });
      applyAll(loadedAnnotations);
      hideCommentPopover();
      notifyChanged();
    });
  }

  /* ───── Network ───── */

  function fetchAll() {
    if (!fileKey) return Promise.resolve([]);
    return fetch('/api/annotations/' + encodeURIComponent(fileKey))
      .then(function(r) { return r.ok ? r.json() : { annotations: [] }; })
      .then(function(d) { return Array.isArray(d.annotations) ? d.annotations : []; })
      .catch(function() { return []; });
  }

  function postCreate(payload) {
    return fetch('/api/annotations/' + encodeURIComponent(fileKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function(r) {
      if (!r.ok) throw new Error('save failed: ' + r.status);
      return r.json();
    });
  }

  function patchAnno(id, patch) {
    return fetch('/api/annotations/' + encodeURIComponent(fileKey) + '/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(function(r) { return r.ok ? r.json() : null; });
  }

  function deleteAnno(id) {
    return fetch('/api/annotations/' + encodeURIComponent(fileKey) + '/' + encodeURIComponent(id), {
      method: 'DELETE',
    }).then(function(r) { return r.ok; });
  }

  /* ───── Toolbar UI ───── */

  function hideToolbar() { if (toolbar) toolbar.removeAttribute('data-open'); }
  function hidePopover() { if (popover) { popover.removeAttribute('data-open'); activePopoverId = null; } }

  function positionFloater(el, rect) {
    var top = window.scrollY + rect.top - el.offsetHeight - 8;
    if (top < window.scrollY + 8) top = window.scrollY + rect.bottom + 8;
    var left = window.scrollX + rect.left + (rect.width - el.offsetWidth) / 2;
    var maxLeft = window.scrollX + document.documentElement.clientWidth - el.offsetWidth - 8;
    if (left > maxLeft) left = maxLeft;
    if (left < window.scrollX + 8) left = window.scrollX + 8;
    el.style.top = top + 'px';
    el.style.left = left + 'px';
  }

  function showToolbarForSelection() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { hideToolbar(); return; }
    var range = sel.getRangeAt(0);
    if (!contentEl || !contentEl.contains(range.commonAncestorContainer)) { hideToolbar(); return; }
    // Skip if selection inside excluded UI
    var anc = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentNode;
    if (anc && anc.closest && anc.closest(EXCLUDE_SELECTOR)) { hideToolbar(); return; }
    var rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { hideToolbar(); return; }
    toolbar.setAttribute('data-open', 'true');
    positionFloater(toolbar, rect);
  }

  function showPopoverForMark(mark) {
    if (!popover) return;
    activePopoverId = mark.getAttribute('data-anno-id');
    var rect = mark.getBoundingClientRect();
    popover.setAttribute('data-open', 'true');
    positionFloater(popover, rect);
  }

  function rectFromAnnotation(ann) {
    var rects = rectMap.get(ann.id);
    if (!rects || !rects.length || !contentEl) return null;
    var contentRect = contentEl.getBoundingClientRect();
    var first = rects[0];
    return {
      top: contentRect.top + first.top,
      left: contentRect.left + first.left,
      bottom: contentRect.top + first.top + first.height,
      right: contentRect.left + first.left + first.width,
      width: first.width,
      height: first.height,
    };
  }

  function showPopoverAtPoint(x, y, ann) {
    if (!popover) return;
    activePopoverId = ann.id;
    var rect = rectFromAnnotation(ann) || { top: y, left: x, bottom: y, right: x, width: 0, height: 0 };
    popover.setAttribute('data-open', 'true');
    positionFloater(popover, rect);
  }
  function showCommentPopoverAtPoint(x, y, ann) {
    if (!commentPopover) return;
    activeCommentId = ann.id;
    var rect = rectFromAnnotation(ann) || { top: y, left: x, bottom: y, right: x, width: 0, height: 0 };
    commentPopover.querySelector('[data-anno-comment-popover-text]').textContent = ann.note || '';
    var date = new Date(ann.updatedAt || ann.createdAt);
    commentPopover.querySelector('[data-anno-comment-popover-meta]').textContent = '更新于 ' + date.toLocaleString();
    commentPopover.setAttribute('data-open', 'true');
    var top = window.scrollY + rect.bottom + 8;
    var left = window.scrollX + rect.left;
    var maxLeft = window.scrollX + document.documentElement.clientWidth - commentPopover.offsetWidth - 8;
    if (left > maxLeft) left = maxLeft;
    if (left < 8) left = 8;
    commentPopover.style.top = top + 'px';
    commentPopover.style.left = left + 'px';
  }

  /* ───── Action handlers ───── */

  function setColor(c) {
    selectedColor = c;
    toolbar.querySelectorAll('[data-anno-color]').forEach(function(b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-anno-color') === c ? 'true' : 'false');
    });
  }

  function notifyChanged() {
    document.dispatchEvent(new CustomEvent('mdzen:annotations:changed'));
  }

  function commitFromSelection(kind) {
    if (saveInFlight || !contentEl || !fileKey) return;
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    var range = sel.getRangeAt(0);
    if (!contentEl.contains(range.commonAncestorContainer)) return;
    var pt = buildPlainText(contentEl);
    var offsets = selectionPlainOffsets(pt.map, range);
    if (!offsets) return;
    var anchor = makeTextQuote(pt.text, offsets.start, offsets.end);

    saveInFlight = true;
    postCreate({ kind: kind, color: selectedColor, anchor: anchor })
      .then(function(d) {
        loadedAnnotations.push(d.annotation);
        applyAll(loadedAnnotations);
        sel.removeAllRanges();
        hideToolbar();
        notifyChanged();
      })
      .catch(function(err) { console.error('[anno] save failed:', err); })
      .finally(function() { saveInFlight = false; });
  }

  function changeColorOfActive(color) {
    if (!activePopoverId) return;
    patchAnno(activePopoverId, { color: color }).then(function(d) {
      if (!d || !d.annotation) return;
      var idx = loadedAnnotations.findIndex(function(a) { return a.id === activePopoverId; });
      if (idx >= 0) loadedAnnotations[idx] = d.annotation;
      applyAll(loadedAnnotations);
      hidePopover();
      notifyChanged();
    });
  }

  function deleteActive() {
    if (!activePopoverId) return;
    var id = activePopoverId;
    deleteAnno(id).then(function(ok) {
      if (!ok) return;
      loadedAnnotations = loadedAnnotations.filter(function(a) { return a.id !== id; });
      applyAll(loadedAnnotations);
      hidePopover();
      notifyChanged();
    });
  }

  /* ───── Wire events ───── */

  function init() {
    contentEl = document.querySelector('.content');
    if (!contentEl) return;
    var match = location.pathname.match(/^\\/view\\/(.+)$/);
    if (!match) return;
    try { fileKey = decodeURIComponent(match[1]); } catch (e) { fileKey = match[1]; }

    toolbar = document.querySelector('[data-anno-toolbar]');
    popover = document.querySelector('[data-anno-popover]');
    commentEditor = document.querySelector('[data-anno-comment-editor]');
    commentPopover = document.querySelector('[data-anno-comment-popover]');
    if (!toolbar || !popover || !commentEditor || !commentPopover) return;

    fetchAll().then(function(list) { loadedAnnotations = list; applyAll(loadedAnnotations); });
  }

  // Selection change → toolbar
  document.addEventListener('mouseup', function() {
    setTimeout(showToolbarForSelection, 0);
  });
  document.addEventListener('keyup', function(e) {
    if (e.shiftKey || ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].indexOf(e.key) >= 0) {
      setTimeout(showToolbarForSelection, 0);
    }
  });
  document.addEventListener('mousedown', function(e) {
    if (toolbar && toolbar.contains(e.target)) return;
    if (popover && popover.contains(e.target)) return;
    if (commentEditor && commentEditor.contains(e.target)) return;
    if (commentPopover && commentPopover.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.anno-pin')) return;
    // Hit-test against overlay rects so clicking on a highlighted area doesn't dismiss popovers
    if (contentEl && contentEl.contains(e.target) && findAnnotationAtPoint(e.clientX, e.clientY)) return;
    hideToolbar();
    hidePopover();
    hideCommentPopover();
    // Don't auto-close commentEditor on outside mousedown — too easy to lose drafted text
  });

  document.addEventListener('click', function(e) {
    var t = e.target;
    // Selection toolbar actions (highlight / underline / comment)
    var toolBtn = t.closest && t.closest('[data-anno-action]');
    if (toolBtn && toolbar && toolbar.contains(toolBtn)) {
      var act = toolBtn.getAttribute('data-anno-action');
      if (act === 'highlight') commitFromSelection('highlight');
      else if (act === 'underline') commitFromSelection('underline');
      else if (act === 'comment') showCommentEditorForSelection();
      e.preventDefault();
      return;
    }
    // Color selection in selection toolbar
    var colBtn = t.closest && t.closest('[data-anno-color]');
    if (colBtn && toolbar && toolbar.contains(colBtn)) {
      setColor(colBtn.getAttribute('data-anno-color'));
      e.preventDefault();
      return;
    }
    // Mark popover: change color
    var popColor = t.closest && t.closest('[data-anno-pop-color]');
    if (popColor && popover && popover.contains(popColor)) {
      changeColorOfActive(popColor.getAttribute('data-anno-pop-color'));
      e.preventDefault();
      return;
    }
    // Mark popover: delete (note: must check popover BEFORE comment popover delete)
    var popDel = t.closest && t.closest('[data-anno-action="delete"]');
    if (popDel && popover && popover.contains(popDel)) {
      deleteActive();
      e.preventDefault();
      return;
    }
    // Comment editor: color
    var edColor = t.closest && t.closest('[data-anno-editor-color]');
    if (edColor && commentEditor && commentEditor.contains(edColor)) {
      setEditorColor(edColor.getAttribute('data-anno-editor-color'));
      e.preventDefault();
      return;
    }
    // Comment editor: save / cancel
    var edAct = t.closest && t.closest('[data-anno-editor-action]');
    if (edAct && commentEditor && commentEditor.contains(edAct)) {
      var which = edAct.getAttribute('data-anno-editor-action');
      if (which === 'cancel') hideCommentEditor();
      else if (which === 'save') saveEditedComment();
      e.preventDefault();
      return;
    }
    // Comment popover: edit / delete
    var cpAct = t.closest && t.closest('[data-anno-comment-pop-action]');
    if (cpAct && commentPopover && commentPopover.contains(cpAct)) {
      var act2 = cpAct.getAttribute('data-anno-comment-pop-action');
      if (act2 === 'edit') editActiveComment();
      else if (act2 === 'delete') deleteActiveComment();
      e.preventDefault();
      return;
    }
    // Click pin → comment popover
    var pin = t.closest && t.closest('.anno-pin');
    if (pin) {
      var pinId = pin.getAttribute('data-anno-id');
      var pinAnn = loadedAnnotations.find(function(a) { return a.id === pinId; });
      if (pinAnn) showCommentPopover(pin, pinAnn);
      e.preventDefault();
      return;
    }
    // Hit-test: did the click land inside any annotation's rect?
    if (contentEl && contentEl.contains(t)) {
      var hitId = findAnnotationAtPoint(e.clientX, e.clientY);
      if (hitId) {
        var hitAnn = loadedAnnotations.find(function(a) { return a.id === hitId; });
        if (hitAnn) {
          e.preventDefault();
          if (hitAnn.kind === 'comment') {
            showCommentPopoverAtPoint(e.clientX, e.clientY, hitAnn);
          } else {
            showPopoverAtPoint(e.clientX, e.clientY, hitAnn);
          }
          return;
        }
      }
    }
  });

  // Cmd/Ctrl+Enter inside the comment editor textarea → save
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      hideToolbar(); hidePopover(); hideCommentPopover();
      if (commentEditor && commentEditor.getAttribute('data-open') === 'true') hideCommentEditor();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      if (commentEditor && commentEditor.getAttribute('data-open') === 'true') {
        e.preventDefault();
        saveEditedComment();
      }
    }
  });

  // Re-render overlays + rail on resize (text reflows → rect positions move)
  var resizeRaf = null;
  function scheduleRerender() {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(function() {
      resizeRaf = null;
      applyAll(loadedAnnotations);
    });
  }
  window.addEventListener('resize', scheduleRerender, { passive: true });

  // Re-apply after HMR content swap
  window.__reapplyAnnotations = function() {
    fetchAll().then(function(list) { loadedAnnotations = list; applyAll(loadedAnnotations); });
  };

  // Clear-all event from FAB
  document.addEventListener('mdzen:annotations:cleared', function() {
    loadedAnnotations = [];
    clearOverlay();
    if (rail) rail.innerHTML = '';
  });

  // Item deleted from the panel — drop locally to keep DOM in sync
  document.addEventListener('mdzen:annotations:item-deleted', function(e) {
    var id = e.detail && e.detail.id;
    if (!id) return;
    loadedAnnotations = loadedAnnotations.filter(function(a) { return a.id !== id; });
    applyAll(loadedAnnotations);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
</script>
`;
