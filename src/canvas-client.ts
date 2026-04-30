/**
 * Bottom FAB (canvas-mode toggle + clear-all) + canvas-mode itself.
 *
 * Canvas mode uses Drauu (https://github.com/antfu-collective/drauu) — a
 * minimal SVG free-drawing library by antfu. Lazy-loaded as ESM from jsDelivr
 * on first activation; falls back to a clear error message if the CDN fails.
 *
 * Strokes serialize to an SVG string and persist via PUT /api/canvas/:file.
 * The overlay <svg> is sized to the .content element so drawings travel with
 * the document on scroll.
 */

export const canvasStyles = `
/* Hide the standalone search-trigger from features.ts — its job is done by the
 * search FAB inside .anno-fab-bar (preview pages only; index page still uses it). */
.search-trigger { display: none !important; }

.anno-fab-bar {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 80;
  display: flex;
  flex-direction: row;
  gap: 8px;
  align-items: center;
}
.anno-fab {
  width: 44px;
  height: 44px;
  border-radius: 22px;
  border: 1px solid var(--border-color);
  background: var(--bg-content);
  color: var(--text-secondary);
  box-shadow: var(--shadow-lg);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0;
  transition: width 0.25s ease, opacity 0.18s ease, transform 0.2s ease,
              color 0.2s, border-color 0.2s, background 0.2s, box-shadow 0.2s;
}
/* Default-collapsed state: every FAB except the rightmost (anchor) is hidden */
.anno-fab-bar > .anno-fab:not(:last-child) {
  width: 0;
  opacity: 0;
  transform: scale(0.5);
  border-color: transparent;
  box-shadow: none;
  pointer-events: none;
  overflow: hidden;
}
.anno-fab-bar:hover > .anno-fab:not(:last-child),
.anno-fab-bar:focus-within > .anno-fab:not(:last-child) {
  width: 44px;
  opacity: 1;
  transform: scale(1);
  border-color: var(--border-color);
  box-shadow: var(--shadow-lg);
  pointer-events: auto;
}
/* When canvas mode is active, keep the canvas FAB visible even without hover so
 * the user has a constant exit affordance. */
.anno-fab-bar > .anno-fab[aria-pressed="true"] {
  width: 44px !important;
  opacity: 1 !important;
  transform: scale(1) !important;
  border-color: var(--link-color) !important;
  box-shadow: var(--shadow-lg) !important;
  pointer-events: auto !important;
}
.anno-fab:hover { color: var(--link-color); border-color: var(--link-color); }
.anno-fab:focus-visible { outline: 2px solid var(--link-color); outline-offset: 2px; }
.anno-fab[aria-pressed="true"] {
  background: var(--link-color);
  color: #fff;
  border-color: var(--link-color);
}
.anno-fab[data-fab="clear"]:hover {
  color: var(--adm-danger-title-color);
  border-color: var(--adm-danger-border);
}

/* Canvas overlay */
.canvas-host {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 9;
}
.canvas-host[data-active="true"] {
  pointer-events: auto;
  cursor: crosshair;
}
.canvas-host svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.canvas-host[data-active="true"] svg {
  background: rgba(0, 0, 0, 0.02);
  outline: 2px dashed var(--link-color);
  outline-offset: -1px;
}
.canvas-host[data-mode="select"] { cursor: default; }
.canvas-host[data-mode="select"] svg * { cursor: pointer; }
.canvas-host svg [data-canvas-selected="true"] {
  filter: drop-shadow(0 0 3px var(--link-color)) drop-shadow(0 0 1px var(--link-color));
}

/* In-canvas-mode toolbar */
.canvas-toolbar {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 24px;
  z-index: 90;
  display: none;
  align-items: center;
  gap: 4px;
  padding: 6px;
  background: var(--bg-content);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
}
.canvas-toolbar[data-open="true"] { display: inline-flex; }
.canvas-tool {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.canvas-tool:hover { background: var(--bg-hover); color: var(--text-primary); }
.canvas-tool[aria-pressed="true"] { background: var(--bg-hover); color: var(--link-color); border-color: var(--link-color); }
.canvas-tool:focus-visible { outline: 2px solid var(--link-color); outline-offset: 1px; }
.canvas-tool-divider { width: 1px; height: 22px; background: var(--border-color); margin: 0 4px; }

.canvas-color {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
}
.canvas-color[aria-pressed="true"] { border-color: var(--text-primary); transform: scale(1.12); }
.canvas-color[data-color="red"]    { background: #ef4444; }
.canvas-color[data-color="yellow"] { background: #f59e0b; }
.canvas-color[data-color="green"]  { background: #22c55e; }
.canvas-color[data-color="blue"]   { background: #3b82f6; }
.canvas-color[data-color="black"]  { background: #111827; }

.canvas-size-input {
  width: 54px;
  cursor: pointer;
  accent-color: var(--link-color);
}

.canvas-status {
  position: fixed;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 90;
  background: var(--bg-content);
  border: 1px solid var(--link-color);
  color: var(--link-color);
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;
  box-shadow: var(--shadow);
  display: none;
}
.canvas-status[data-open="true"] { display: inline-block; }

/* Confirm dialog (clear-all) */
.anno-confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 350;
  background: rgba(0, 0, 0, 0.4);
  display: none;
  align-items: center;
  justify-content: center;
}
.anno-confirm-backdrop[data-open="true"] { display: flex; }
.anno-confirm {
  background: var(--bg-content);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 22px 24px;
  max-width: 360px;
  width: 90%;
  box-shadow: var(--shadow-lg);
}
.anno-confirm-title { font-size: 16px; font-weight: 600; margin-bottom: 8px; color: var(--text-primary); }
.anno-confirm-msg { font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 16px; }
.anno-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
.anno-confirm-btn {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid var(--border-medium);
  background: var(--bg-page);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 13px;
}
.anno-confirm-btn:hover { background: var(--bg-hover); }
.anno-confirm-btn:focus-visible { outline: 2px solid var(--link-color); outline-offset: 2px; }
.anno-confirm-btn[data-variant="danger"] {
  background: var(--adm-danger-bg);
  border-color: var(--adm-danger-border);
  color: var(--adm-danger-title-color);
}
.anno-confirm-btn[data-variant="danger"]:hover { filter: brightness(0.9); }
`;

export const canvasMarkup = `
<div class="anno-fab-bar" role="group" aria-label="标注工具">
  <button type="button" class="anno-fab" data-fab="panel" aria-pressed="false" aria-label="标注列表" title="标注 / 评论列表">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
  </button>
  <button type="button" class="anno-fab" data-fab="canvas" aria-pressed="false" aria-label="切换画布模式 (B)" title="画布模式 (按 B 切换)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
  </button>
  <button type="button" class="anno-fab" data-fab="clear" aria-label="清空当前文档所有标注与画布" title="清空全部标注 / 画布">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
  </button>
  <button type="button" class="anno-fab" data-fab="search" data-search-toggle aria-label="搜索文件 (⌘K)" title="搜索 (⌘K)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
  </button>
</div>

<div class="canvas-toolbar" data-canvas-toolbar role="toolbar" aria-label="画布工具栏">
  <button type="button" class="canvas-tool" data-canvas-tool="select" aria-pressed="false" aria-label="选择 (V)" title="选择 — 点击元素后按 Delete 删除">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74"/><path d="M14 10.81V8a2 2 0 1 1 4 0v9a7 7 0 0 1-14 0v-3a2 2 0 0 1 4 0v.5"/><path d="M9 13a2 2 0 1 1 4 0"/></svg>
  </button>
  <button type="button" class="canvas-tool" data-canvas-tool="draw" aria-pressed="true" aria-label="画笔" title="画笔">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
  </button>
  <button type="button" class="canvas-tool" data-canvas-tool="line" aria-pressed="false" aria-label="直线" title="直线">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="19" x2="19" y2="5"/></svg>
  </button>
  <button type="button" class="canvas-tool" data-canvas-tool="rectangle" aria-pressed="false" aria-label="矩形" title="矩形">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="1"/></svg>
  </button>
  <button type="button" class="canvas-tool" data-canvas-tool="ellipse" aria-pressed="false" aria-label="椭圆" title="椭圆">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="12" rx="8" ry="6"/></svg>
  </button>
  <button type="button" class="canvas-tool" data-canvas-tool="eraseLine" aria-pressed="false" aria-label="橡皮" title="橡皮(逐笔擦除)">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l6 6 12-12-6-6L3 17z"/><path d="M9 23l-6-6"/></svg>
  </button>
  <span class="canvas-tool-divider" aria-hidden="true"></span>
  <button type="button" class="canvas-color" data-canvas-color="red" aria-pressed="true" aria-label="红色"></button>
  <button type="button" class="canvas-color" data-canvas-color="yellow" aria-pressed="false" aria-label="黄色"></button>
  <button type="button" class="canvas-color" data-canvas-color="green" aria-pressed="false" aria-label="绿色"></button>
  <button type="button" class="canvas-color" data-canvas-color="blue" aria-pressed="false" aria-label="蓝色"></button>
  <button type="button" class="canvas-color" data-canvas-color="black" aria-pressed="false" aria-label="黑色"></button>
  <span class="canvas-tool-divider" aria-hidden="true"></span>
  <input type="range" class="canvas-size-input" data-canvas-size min="1" max="20" value="3" aria-label="笔刷粗细" title="笔刷粗细">
  <span class="canvas-tool-divider" aria-hidden="true"></span>
  <button type="button" class="canvas-tool" data-canvas-tool-action="undo" aria-label="撤销 (Cmd/Ctrl+Z)" title="撤销 (Cmd/Ctrl+Z)">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.36 2.64L3 13"/></svg>
  </button>
  <button type="button" class="canvas-tool" data-canvas-tool-action="redo" aria-label="重做 (Cmd/Ctrl+Shift+Z)" title="重做">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.36 2.64L21 13"/></svg>
  </button>
  <button type="button" class="canvas-tool" data-canvas-tool-action="clear" aria-label="清空画布" title="清空画布">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
  </button>
  <span class="canvas-tool-divider" aria-hidden="true"></span>
  <button type="button" class="canvas-tool" data-canvas-tool-action="exit" aria-label="退出画布模式" title="退出 (Esc)">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  </button>
</div>

<div class="canvas-status" data-canvas-status>画布模式 — Esc 退出</div>

<div class="anno-confirm-backdrop" data-confirm-backdrop role="dialog" aria-modal="true" aria-labelledby="anno-confirm-title">
  <div class="anno-confirm">
    <div class="anno-confirm-title" id="anno-confirm-title">确认清空</div>
    <div class="anno-confirm-msg" data-confirm-msg></div>
    <div class="anno-confirm-actions">
      <button type="button" class="anno-confirm-btn" data-confirm-action="cancel">取消</button>
      <button type="button" class="anno-confirm-btn" data-variant="danger" data-confirm-action="ok">确认清空</button>
    </div>
  </div>
</div>
`;

export const canvasScript = `
<script>
(function() {
  var DRAUU_CDN = 'https://cdn.jsdelivr.net/npm/drauu@0.4.3/+esm';
  var COLORS = { red: '#ef4444', yellow: '#f59e0b', green: '#22c55e', blue: '#3b82f6', black: '#111827' };

  var fileKey = null;
  var contentEl = null;
  var canvasHost = null;
  var canvasSvg = null;
  var canvasToolbar = null;
  var statusBadge = null;
  var fabCanvasBtn = null;
  var drauu = null;
  var drauuLoad = null;
  var canvasActive = false;
  var saveTimer = null;
  var currentColor = 'red';
  var currentSize = 3;
  var currentTool = 'draw';

  function getFileKey() {
    var match = location.pathname.match(/^\\/view\\/(.+)$/);
    if (!match) return null;
    try { return decodeURIComponent(match[1]); } catch { return match[1]; }
  }

  function loadDrauu() {
    if (drauuLoad) return drauuLoad;
    drauuLoad = import(DRAUU_CDN)
      .catch(function(err) {
        console.error('[canvas] drauu load failed:', err);
        showStatus('画布库加载失败,请检查网络', true);
        throw err;
      });
    return drauuLoad;
  }

  /* ───── overlay sizing ───── */

  function ensureOverlayHost() {
    if (canvasHost) return canvasHost;
    contentEl = document.querySelector('.content');
    if (!contentEl) return null;
    // Make .content the positioning context so the absolute SVG covers exactly it
    if (getComputedStyle(contentEl).position === 'static') contentEl.style.position = 'relative';
    canvasHost = document.createElement('div');
    canvasHost.className = 'canvas-host';
    canvasSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    canvasSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    canvasHost.appendChild(canvasSvg);
    contentEl.appendChild(canvasHost);
    syncOverlaySize();
    window.addEventListener('resize', syncOverlaySize, { passive: true });
    return canvasHost;
  }

  function syncOverlaySize() {
    if (!contentEl || !canvasSvg) return;
    var rect = contentEl.getBoundingClientRect();
    canvasSvg.setAttribute('viewBox', '0 0 ' + Math.round(rect.width) + ' ' + Math.round(contentEl.scrollHeight));
    canvasSvg.style.height = contentEl.scrollHeight + 'px';
  }

  /* ───── load + save SVG strokes ───── */

  function fetchCanvas() {
    if (!fileKey) return Promise.resolve('');
    return fetch('/api/canvas/' + encodeURIComponent(fileKey))
      .then(function(r) { return r.ok ? r.json() : { svg: '' }; })
      .then(function(d) { return typeof d.svg === 'string' ? d.svg : ''; })
      .catch(function() { return ''; });
  }

  function saveCanvas() {
    if (!fileKey) return;
    var svg = drauu ? drauu.dump() : (canvasSvg ? canvasSvg.innerHTML : '');
    fetch('/api/canvas/' + encodeURIComponent(fileKey), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ svg: svg || '' }),
    }).catch(function(err) { console.error('[canvas] save failed:', err); });
  }

  function debouncedSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function() { saveTimer = null; saveCanvas(); }, 600);
  }

  /* ───── canvas mode toggle ───── */

  function showStatus(msg, isError) {
    if (!statusBadge) return;
    statusBadge.textContent = msg;
    statusBadge.style.borderColor = isError ? 'var(--adm-danger-border)' : 'var(--link-color)';
    statusBadge.style.color = isError ? 'var(--adm-danger-title-color)' : 'var(--link-color)';
    statusBadge.setAttribute('data-open', 'true');
    if (statusBadge.__hideTimer) clearTimeout(statusBadge.__hideTimer);
    statusBadge.__hideTimer = setTimeout(function() {
      if (!canvasActive) statusBadge.removeAttribute('data-open');
    }, isError ? 4000 : 2000);
  }

  function setActive(active) {
    canvasActive = active;
    if (canvasHost) canvasHost.setAttribute('data-active', active ? 'true' : 'false');
    if (canvasToolbar) {
      if (active) canvasToolbar.setAttribute('data-open', 'true');
      else canvasToolbar.removeAttribute('data-open');
    }
    if (fabCanvasBtn) fabCanvasBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (statusBadge) {
      if (active) { statusBadge.textContent = '画布模式 — Esc 退出'; statusBadge.setAttribute('data-open', 'true'); }
      else statusBadge.removeAttribute('data-open');
    }
    document.body.style.userSelect = active ? 'none' : '';
  }

  function activate() {
    if (canvasActive) return;
    if (!fileKey) return;
    var host = ensureOverlayHost();
    if (!host) return;
    setActive(true);
    if (drauu) {
      drauu.enabled = true;
      return;
    }
    loadDrauu().then(function(mod) {
      var createDrauu = (mod && mod.createDrauu) || (mod && mod.default && mod.default.createDrauu);
      if (typeof createDrauu !== 'function') {
        console.error('[canvas] createDrauu not found in module', mod);
        showStatus('画布库初始化失败', true);
        return;
      }
      drauu = createDrauu({
        el: canvasSvg,
        brush: { color: COLORS[currentColor], size: currentSize },
        coordinateScale: 1,
      });
      drauu.mode = currentTool;
      // Restore prior content
      fetchCanvas().then(function(svg) {
        if (svg && drauu) try { drauu.load(svg); } catch (e) { console.warn('[canvas] load failed', e); }
      });
      // Save on every commit (drauu fires 'committed' after each finished stroke)
      drauu.on && drauu.on('end', debouncedSave);
      drauu.on && drauu.on('committed', debouncedSave);
    }).catch(function() {
      setActive(false);
    });
  }

  function deactivate() {
    if (!canvasActive) return;
    setActive(false);
    if (drauu) {
      drauu.enabled = false;
      // Final save
      saveCanvas();
    }
  }

  function toggle() {
    if (canvasActive) deactivate();
    else activate();
  }

  /* ───── tool / color / size handlers ───── */

  function clearSelection() {
    if (!canvasSvg) return;
    canvasSvg.querySelectorAll('[data-canvas-selected="true"]').forEach(function(el) {
      el.removeAttribute('data-canvas-selected');
    });
  }

  function setTool(tool) {
    currentTool = tool;
    if (tool === 'select') {
      if (drauu) drauu.enabled = false;
      if (canvasHost) canvasHost.setAttribute('data-mode', 'select');
    } else {
      if (drauu) { drauu.enabled = true; drauu.mode = tool; }
      if (canvasHost) canvasHost.setAttribute('data-mode', 'draw');
      clearSelection();
    }
    canvasToolbar.querySelectorAll('[data-canvas-tool]').forEach(function(b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-canvas-tool') === tool ? 'true' : 'false');
    });
  }
  function setColor(c) {
    currentColor = c;
    if (drauu && drauu.brush) drauu.brush.color = COLORS[c];
    canvasToolbar.querySelectorAll('[data-canvas-color]').forEach(function(b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-canvas-color') === c ? 'true' : 'false');
    });
  }
  function setSize(n) {
    currentSize = n;
    if (drauu && drauu.brush) drauu.brush.size = n;
  }
  function undo() { if (drauu && drauu.undo) { drauu.undo(); debouncedSave(); } }
  function redo() { if (drauu && drauu.redo) { drauu.redo(); debouncedSave(); } }
  function clearCanvas() {
    if (drauu && drauu.clear) drauu.clear();
    saveCanvas();
  }

  /* ───── confirm dialog (clear-all) ───── */

  function showConfirm(title, message) {
    return new Promise(function(resolve) {
      var bd = document.querySelector('[data-confirm-backdrop]');
      var msgEl = document.querySelector('[data-confirm-msg]');
      if (!bd || !msgEl) { resolve(window.confirm(message)); return; }
      msgEl.textContent = message;
      bd.setAttribute('data-open', 'true');
      var okBtn = bd.querySelector('[data-confirm-action="ok"]');
      var cancelBtn = bd.querySelector('[data-confirm-action="cancel"]');
      function cleanup(result) {
        bd.removeAttribute('data-open');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        bd.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKey);
        resolve(result);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      function onBackdrop(e) { if (e.target === bd) cleanup(false); }
      function onKey(e) { if (e.key === 'Escape') cleanup(false); else if (e.key === 'Enter') cleanup(true); }
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      bd.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKey);
      cancelBtn.focus();
    });
  }

  function clearAll() {
    if (!fileKey) return;
    showConfirm('清空当前文档', '将清空当前页面的所有标注和画布内容,此操作不可撤销。是否继续?').then(function(ok) {
      if (!ok) return;
      Promise.all([
        fetch('/api/annotations/' + encodeURIComponent(fileKey) + '?all=1', { method: 'DELETE' }),
        fetch('/api/canvas/' + encodeURIComponent(fileKey), { method: 'DELETE' }),
      ]).then(function() {
        if (drauu && drauu.clear) drauu.clear();
        if (canvasSvg) canvasSvg.innerHTML = '';
        // Notify annotations module to refresh DOM
        document.dispatchEvent(new CustomEvent('mdzen:annotations:cleared'));
        showStatus('已清空');
      }).catch(function(err) { console.error('[canvas] clear-all failed', err); });
    });
  }

  /* ───── wire ───── */

  function init() {
    fileKey = getFileKey();
    if (!fileKey) return;
    canvasToolbar = document.querySelector('[data-canvas-toolbar]');
    statusBadge = document.querySelector('[data-canvas-status]');
    fabCanvasBtn = document.querySelector('.anno-fab[data-fab="canvas"]');

    // Pre-render saved strokes into the SVG without activating drauu
    fetchCanvas().then(function(svg) {
      if (!svg) return;
      ensureOverlayHost();
      if (canvasSvg) canvasSvg.innerHTML = svg;
    });
  }

  document.addEventListener('click', function(e) {
    var t = e.target;
    var fab = t.closest && t.closest('[data-fab]');
    if (fab) {
      var which = fab.getAttribute('data-fab');
      if (which === 'canvas') { e.preventDefault(); toggle(); return; }
      if (which === 'clear')  { e.preventDefault(); clearAll(); return; }
      // other FABs (e.g. data-fab="panel") fall through to their own handlers
    }
    if (!canvasToolbar) return;
    var tool = t.closest && t.closest('[data-canvas-tool]');
    if (tool && canvasToolbar.contains(tool)) {
      setTool(tool.getAttribute('data-canvas-tool'));
      return;
    }
    var color = t.closest && t.closest('[data-canvas-color]');
    if (color && canvasToolbar.contains(color)) {
      setColor(color.getAttribute('data-canvas-color'));
      return;
    }
    var act = t.closest && t.closest('[data-canvas-tool-action]');
    if (act && canvasToolbar.contains(act)) {
      var which = act.getAttribute('data-canvas-tool-action');
      if (which === 'undo') undo();
      else if (which === 'redo') redo();
      else if (which === 'clear') clearCanvas();
      else if (which === 'exit') deactivate();
      return;
    }
  });

  document.addEventListener('input', function(e) {
    if (e.target && e.target.matches && e.target.matches('[data-canvas-size]')) {
      setSize(parseInt(e.target.value, 10) || 3);
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'b' || e.key === 'B') {
      if (!e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); toggle(); }
    }
    if (e.key === 'v' || e.key === 'V') {
      if (canvasActive && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); setTool('select'); }
    }
    if (e.key === 'Escape' && canvasActive) { e.preventDefault(); deactivate(); }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z') && canvasActive) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    // Delete selected canvas elements
    if ((e.key === 'Delete' || e.key === 'Backspace') && canvasActive && currentTool === 'select') {
      var sel = canvasSvg ? canvasSvg.querySelectorAll('[data-canvas-selected="true"]') : [];
      if (sel.length) {
        e.preventDefault();
        sel.forEach(function(el) { el.remove(); });
        debouncedSave();
      }
    }
  });

  // Click to select / multi-select with Shift in select mode
  document.addEventListener('click', function(e) {
    if (!canvasActive || currentTool !== 'select' || !canvasHost) return;
    if (!canvasHost.contains(e.target)) {
      // Click outside canvas in select mode → clear selection
      clearSelection();
      return;
    }
    var t = e.target;
    if (t === canvasSvg || t.tagName === 'svg') {
      if (!e.shiftKey && !e.metaKey && !e.ctrlKey) clearSelection();
      return;
    }
    if (!e.shiftKey && !e.metaKey && !e.ctrlKey) clearSelection();
    if (t.getAttribute('data-canvas-selected') === 'true') {
      t.removeAttribute('data-canvas-selected');
    } else {
      t.setAttribute('data-canvas-selected', 'true');
    }
  }, true);

  // Sync overlay when content changes (HMR)
  window.__canvasResync = function() {
    if (!canvasSvg) return;
    syncOverlaySize();
    fetchCanvas().then(function(svg) {
      if (drauu && canvasActive) {
        try { drauu.clear(); if (svg) drauu.load(svg); } catch (e) {}
      } else if (canvasSvg) {
        canvasSvg.innerHTML = svg || '';
      }
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
</script>
`;
