/**
 * Self-contained CSS + client-script bundles for user-facing features.
 * Each pair (`*Styles`, `*Script`) is inlined into the preview page.
 * No external dependencies — everything runs from the same-origin server.
 */

/* ─────────────────── Copy-code button ─────────────────── */

export const copyCodeStyles = `
.content pre { position: relative; }
.code-copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--btn-border);
  background: var(--btn-bg);
  color: var(--btn-color);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease, color 0.2s, background 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  z-index: 5;
}
.content pre:hover .code-copy-btn,
.content pre:focus-within .code-copy-btn,
.code-copy-btn:focus-visible {
  opacity: 1;
}
.code-copy-btn:focus-visible { outline: 2px solid var(--link-color); outline-offset: 2px; }
.code-copy-btn:hover { background: var(--btn-hover-bg); border-color: var(--btn-hover-border); color: var(--btn-hover-color); }
.code-copy-btn[data-copied="true"] {
  background: var(--adm-tip-bg);
  border-color: var(--adm-tip-border);
  color: var(--adm-tip-title-color);
}
.code-copy-btn .copy-check { display: none; }
.code-copy-btn[data-copied="true"] .copy-icon { display: none; }
.code-copy-btn[data-copied="true"] .copy-check { display: block; }
.content pre[data-lang]::before {
  content: attr(data-lang);
  position: absolute;
  top: 8px;
  left: 12px;
  font-size: 11px;
  font-family: 'SF Mono', Monaco, monospace;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  pointer-events: none;
  user-select: none;
  opacity: 0.6;
}
.content pre[data-lang=""]::before { content: none; }
`;

export const copyCodeScript = `
<script>
(function() {
  var ICON_COPY = '<svg class="copy-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var ICON_CHECK = '<svg class="copy-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

  function inject() {
    // Exclude mermaid blocks — they parse their own textContent and would treat a copy button as source.
    var blocks = document.querySelectorAll('.content pre:not(.mermaid):not([data-mermaid-source])');
    blocks.forEach(function(pre) {
      if (pre.querySelector('.code-copy-btn')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'code-copy-btn';
      btn.setAttribute('aria-label', '复制代码');
      btn.title = '复制代码';
      btn.innerHTML = ICON_COPY + ICON_CHECK;
      pre.appendChild(btn);
    });
  }

  document.addEventListener('click', function(e) {
    var btn = e.target.closest && e.target.closest('.code-copy-btn');
    if (!btn) return;
    var pre = btn.closest('pre');
    var code = pre && pre.querySelector('code');
    if (!code) return;
    var text = code.innerText;
    var done = function() {
      btn.setAttribute('data-copied', 'true');
      btn.setAttribute('aria-label', '已复制');
      setTimeout(function() {
        btn.removeAttribute('data-copied');
        btn.setAttribute('aria-label', '复制代码');
      }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
      fallback();
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch {}
      document.body.removeChild(ta);
    }
  });

  window.__injectCopyButtons = inject;
  inject();
})();
</script>
`;

/* ─────────────────── Mobile-nav drawer ─────────────────── */

export const mobileNavStyles = `
.mobile-toggle {
  display: none;
  position: fixed;
  top: 12px;
  z-index: 150;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--bg-content);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  box-shadow: var(--shadow);
  cursor: pointer;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.mobile-toggle:focus-visible { outline: 2px solid var(--link-color); outline-offset: 2px; }
.mobile-toggle.left { left: 12px; }
.mobile-toggle.right { right: 12px; }

@media (max-width: 1200px) {
  .mobile-toggle { display: flex; }
  .sidebar, .left-nav {
    transform: translateX(0);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s, transform 0.25s ease;
  }
  .sidebar { transform: translateX(110%); }
  .left-nav { transform: translateX(-110%); }
  .sidebar[data-open="true"], .left-nav[data-open="true"] { opacity: 1; pointer-events: auto; transform: translateX(0); }
  .sidebar .toc-container { width: 280px !important; padding: 16px !important; border-radius: 16px 0 0 16px !important; }
  .sidebar .toc-title { writing-mode: horizontal-tb !important; }
  .sidebar .toc-nav { opacity: 1 !important; }
  .left-nav .left-nav-container { width: 280px !important; padding: 16px !important; }
  .left-nav .nav-hint { display: none; }
  .left-nav .nav-breadcrumb, .left-nav .file-path, .left-nav .file-nav { opacity: 1 !important; }
  .page-layout { padding-top: 60px !important; }
}

.mobile-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.35);
  z-index: 49;
  opacity: 0;
  transition: opacity 0.2s ease;
}
.mobile-backdrop[data-open="true"] { display: block; opacity: 1; }
`;

export const mobileNavMarkup = `
<button type="button" class="mobile-toggle left" data-mobile-toggle="left-nav" aria-label="打开文件导航" aria-expanded="false">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
</button>
<button type="button" class="mobile-toggle right" data-mobile-toggle="sidebar" aria-label="打开目录" aria-expanded="false">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
</button>
<div class="mobile-backdrop" data-mobile-backdrop></div>
`;

export const mobileNavScript = `
<script>
(function() {
  function panels() {
    return Array.from(document.querySelectorAll('[data-open]'));
  }
  function close(panel) {
    if (!panel) return;
    panel.removeAttribute('data-open');
    var trig = document.querySelector('[data-mobile-toggle="' + panel.classList[0] + '"]');
    if (trig) trig.setAttribute('aria-expanded', 'false');
  }
  function closeAll() { panels().forEach(close); }
  function open(target) {
    var el = document.querySelector('.' + target);
    if (!el) return;
    panels().forEach(function(p) { if (p !== el && !p.hasAttribute('data-mobile-backdrop')) close(p); });
    el.setAttribute('data-open', 'true');
    var bd = document.querySelector('[data-mobile-backdrop]');
    if (bd) bd.setAttribute('data-open', 'true');
    var trig = document.querySelector('[data-mobile-toggle="' + target + '"]');
    if (trig) trig.setAttribute('aria-expanded', 'true');
    // Focus first focusable
    var first = el.querySelector('a, button, [tabindex]:not([tabindex="-1"])');
    if (first) first.focus();
  }

  document.addEventListener('click', function(e) {
    var t = e.target.closest('[data-mobile-toggle]');
    if (t) {
      var name = t.getAttribute('data-mobile-toggle');
      var el = document.querySelector('.' + name);
      if (el && el.getAttribute('data-open') === 'true') close(el);
      else open(name);
      return;
    }
    if (e.target.matches('[data-mobile-backdrop]')) {
      closeAll();
      var bd = document.querySelector('[data-mobile-backdrop]');
      if (bd) bd.removeAttribute('data-open');
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeAll();
      var bd = document.querySelector('[data-mobile-backdrop]');
      if (bd) bd.removeAttribute('data-open');
    }
  });
})();
</script>
`;

/* ─────────────────── Cmd-K cross-file search ─────────────────── */

export const searchStyles = `
.search-trigger {
  position: fixed;
  bottom: 18px;
  right: 18px;
  z-index: 80;
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
  transition: all 0.2s ease;
}
.search-trigger:hover { color: var(--link-color); border-color: var(--link-color); }
.search-trigger:focus-visible { outline: 2px solid var(--link-color); outline-offset: 2px; }

.search-modal {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: none;
  align-items: flex-start;
  justify-content: center;
  padding: 10vh 16px 16px;
  background: rgba(0,0,0,0.4);
  backdrop-filter: blur(4px);
}
.search-modal[data-open="true"] { display: flex; }
.search-panel {
  width: 100%;
  max-width: 600px;
  background: var(--bg-content);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--border-color);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 70vh;
}
.search-input {
  width: 100%;
  border: none;
  outline: none;
  padding: 18px 20px;
  font-size: 16px;
  background: transparent;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-color);
}
.search-results {
  list-style: none;
  margin: 0;
  padding: 8px;
  overflow-y: auto;
  flex: 1;
}
.search-result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 6px;
  text-decoration: none;
  color: var(--text-primary);
  cursor: pointer;
}
.search-result[aria-selected="true"], .search-result:hover {
  background: var(--bg-hover);
  color: var(--link-color);
}
.search-result-name { flex: 1; font-size: 14px; word-break: break-all; }
.search-result-dir { font-size: 12px; color: var(--text-tertiary); }
.search-result-icon { font-size: 16px; flex-shrink: 0; }
.search-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}
.search-hint {
  padding: 8px 14px;
  font-size: 11px;
  color: var(--text-tertiary);
  border-top: 1px solid var(--border-color);
  display: flex;
  gap: 12px;
}
.search-hint kbd {
  font-family: inherit;
  background: var(--bg-page);
  border: 1px solid var(--border-medium);
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 10px;
}
`;

export const searchMarkup = `
<button type="button" class="search-trigger" data-search-toggle aria-label="搜索文件 (按 Cmd/Ctrl-K 打开)" title="搜索 (⌘K)">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
</button>
<div class="search-modal" data-search-modal role="dialog" aria-modal="true" aria-label="文件搜索">
  <div class="search-panel">
    <input class="search-input" data-search-input type="search" placeholder="输入文件名搜索…" autocomplete="off" spellcheck="false">
    <ul class="search-results" data-search-results role="listbox"></ul>
    <div class="search-hint">
      <span><kbd>↑↓</kbd> 选择</span><span><kbd>Enter</kbd> 打开</span><span><kbd>Esc</kbd> 关闭</span>
    </div>
  </div>
</div>
`;

export const searchScript = `
<script>
(function() {
  var modal = document.querySelector('[data-search-modal]');
  if (!modal) return;
  var input = modal.querySelector('[data-search-input]');
  var list = modal.querySelector('[data-search-results]');
  var trigger = document.querySelector('[data-search-toggle]');
  var selected = 0;
  var results = [];
  var lastFocused = null;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  function score(query, target) {
    query = query.toLowerCase();
    target = target.toLowerCase();
    if (!query) return 1;
    if (target.indexOf(query) !== -1) return 10 + (target.indexOf(query) === 0 ? 5 : 0) - target.length * 0.01;
    // Subsequence (fuzzy)
    var qi = 0, ti = 0, gaps = 0;
    while (qi < query.length && ti < target.length) {
      if (query[qi] === target[ti]) qi++;
      else gaps++;
      ti++;
    }
    return qi === query.length ? 5 - gaps * 0.05 : 0;
  }

  function render() {
    if (!results.length) {
      list.innerHTML = '<li class="search-empty">无匹配文件</li>';
      return;
    }
    list.innerHTML = results.map(function(r, i) {
      var icon = r.path.endsWith('.mdc') ? '🚥' : '📄';
      var dir = r.path.lastIndexOf('/') > -1 ? r.path.substring(0, r.path.lastIndexOf('/')) : '';
      return '<li><a class="search-result" role="option" data-idx="' + i + '" aria-selected="' + (i === selected ? 'true' : 'false') + '" href="/view/' + encodeURIComponent(r.path) + '">'
        + '<span class="search-result-icon" aria-hidden="true">' + icon + '</span>'
        + '<span class="search-result-name">' + esc(r.name) + '</span>'
        + (dir ? '<span class="search-result-dir">' + esc(dir) + '</span>' : '')
        + '</a></li>';
    }).join('');
  }

  function update() {
    var q = input.value.trim();
    var files = window.__allFiles || [];
    results = files
      .map(function(p) {
        var name = p.lastIndexOf('/') > -1 ? p.substring(p.lastIndexOf('/') + 1) : p;
        var s = score(q, name);
        if (s === 0 && q) s = score(q, p);
        return s > 0 ? { path: p, name: name, score: s } : null;
      })
      .filter(Boolean)
      .sort(function(a, b) { return b.score - a.score; })
      .slice(0, 50);
    selected = 0;
    render();
  }

  function open() {
    lastFocused = document.activeElement;
    modal.setAttribute('data-open', 'true');
    update();
    setTimeout(function() { input.focus(); }, 0);
  }
  function close() {
    modal.removeAttribute('data-open');
    input.value = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function move(delta) {
    if (!results.length) return;
    selected = (selected + delta + results.length) % results.length;
    render();
    var el = list.querySelector('[data-idx="' + selected + '"]');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', update);
  modal.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      var pick = results[selected];
      if (pick) location.href = '/view/' + encodeURIComponent(pick.path);
    }
  });
  modal.addEventListener('click', function(e) {
    if (e.target === modal) close();
    var item = e.target.closest('.search-result');
    if (item) {
      var idx = parseInt(item.getAttribute('data-idx'), 10);
      if (results[idx]) {
        e.preventDefault();
        location.href = '/view/' + encodeURIComponent(results[idx].path);
      }
    }
  });
  // Delegated trigger handler: any [data-search-toggle] on the page opens the search modal.
  // (We have multiple — the standalone .search-trigger on the index page, and the FAB
  // version inside .anno-fab-bar on preview pages.)
  document.addEventListener('click', function(e) {
    var btn = e.target.closest && e.target.closest('[data-search-toggle]');
    if (btn) {
      e.preventDefault();
      if (modal.getAttribute('data-open') === 'true') close();
      else open();
    }
  });

  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (modal.getAttribute('data-open') === 'true') close();
      else open();
    }
    if (e.key === '/' && !modal.getAttribute('data-open') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      e.preventDefault();
      open();
    }
  });
})();
</script>
`;

/* ─────────────────── Mermaid lazy loader (community-standard mermaid v11 UMD) ─────────────────── */

export const mermaidStyles = `
pre.mermaid {
  display: block;
  position: relative;
  background: var(--bg-content);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  margin: 1rem 0;
  text-align: center;
  overflow-x: auto;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: var(--text-secondary);
  white-space: pre-wrap;
}
pre.mermaid[data-mermaid-rendered="true"] {
  white-space: normal;
  color: inherit;
}
pre.mermaid svg { max-width: 100%; height: auto; }
pre.mermaid[data-mermaid-error="true"] {
  color: var(--adm-danger-title-color);
  background: var(--adm-danger-bg);
  border-color: var(--adm-danger-border);
  text-align: left;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 12px;
  white-space: pre-wrap;
}

/* Fullscreen expand button — only on rendered diagrams */
.mermaid-expand-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--btn-border);
  background: var(--btn-bg);
  color: var(--btn-color);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease, color 0.2s, background 0.2s;
  padding: 0;
  z-index: 5;
}
pre.mermaid:hover .mermaid-expand-btn,
pre.mermaid:focus-within .mermaid-expand-btn,
.mermaid-expand-btn:focus-visible { opacity: 1; }
.mermaid-expand-btn:hover { background: var(--btn-hover-bg); border-color: var(--btn-hover-border); color: var(--btn-hover-color); }

/* Fullscreen modal */
.mermaid-modal {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(4px);
  animation: mermaid-modal-in 0.18s ease-out;
}
@keyframes mermaid-modal-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.mermaid-modal-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--bg-content);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.mermaid-modal-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mermaid-modal-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--border-medium);
  background: var(--bg-page);
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 14px;
  font-weight: 500;
  flex-shrink: 0;
}
.mermaid-modal-btn:hover { background: var(--bg-hover); border-color: var(--link-color); color: var(--link-color); }
.mermaid-modal-btn:focus-visible { outline: 2px solid var(--link-color); outline-offset: 2px; }
.mermaid-modal-btn[data-action="close"] { font-size: 18px; line-height: 1; }
.mermaid-modal-canvas {
  flex: 1;
  position: relative;
  overflow: hidden;
  cursor: grab;
  background: var(--bg-page);
  display: flex;
  align-items: center;
  justify-content: center;
}
.mermaid-modal-canvas:active { cursor: grabbing; }
.mermaid-modal-canvas svg {
  user-select: none;
  max-width: none;
  max-height: none;
  /* panzoom takes over transform — flexbox handles initial centering */
}
.mermaid-modal-hint {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 11px;
  pointer-events: none;
  display: flex;
  gap: 12px;
}
.mermaid-modal-hint kbd {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  padding: 1px 5px;
  font-family: inherit;
  font-size: 10px;
}
`;

export const mermaidScript = `
<script>
(function() {
  var MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
  var loadPromise = null;

  function loadMermaid() {
    if (loadPromise) return loadPromise;
    loadPromise = new Promise(function(resolve, reject) {
      if (window.mermaid) { resolve(window.mermaid); return; }
      var s = document.createElement('script');
      s.src = MERMAID_CDN;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = function() {
        if (!window.mermaid) {
          reject(new Error('mermaid global not found after load'));
          return;
        }
        try {
          window.mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: currentTheme(),
            fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif',
          });
          resolve(window.mermaid);
        } catch (e) { reject(e); }
      };
      s.onerror = function() { reject(new Error('mermaid CDN unavailable: ' + MERMAID_CDN)); };
      document.head.appendChild(s);
    });
    return loadPromise;
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default';
  }

  function pendingNodes() {
    return Array.prototype.slice.call(
      document.querySelectorAll('pre.mermaid[data-mermaid-source="true"]:not([data-mermaid-rendered]):not([data-mermaid-pending])'),
    );
  }

  function render() {
    var nodes = pendingNodes();
    if (!nodes.length) return;
    nodes.forEach(function(n) { n.setAttribute('data-mermaid-pending', 'true'); });

    loadMermaid().then(function(mermaid) {
      // mermaid.run mutates each node: it parses textContent, replaces it with the SVG.
      // Use a fresh ID each invocation so re-render after HMR doesn't collide.
      return mermaid.run({
        nodes: nodes,
        suppressErrors: false,
      }).then(function() {
        nodes.forEach(function(n) {
          n.removeAttribute('data-mermaid-pending');
          n.setAttribute('data-mermaid-rendered', 'true');
          injectExpandButton(n);
        });
      });
    }).catch(function(err) {
      console.error('[mermaid]', err);
      nodes.forEach(function(n) {
        n.removeAttribute('data-mermaid-pending');
        n.setAttribute('data-mermaid-error', 'true');
        n.textContent = '⚠️ Mermaid 渲染失败: ' + (err && err.message ? err.message : String(err));
      });
    });
  }

  function rerenderForTheme() {
    // After theme switch: re-render previously-rendered diagrams with the new theme.
    // mermaid.run won't touch nodes already marked rendered, so we must restore source first.
    if (!window.mermaid) return;
    var rendered = document.querySelectorAll('pre.mermaid[data-mermaid-rendered="true"]');
    if (!rendered.length) return;
    try {
      window.mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: currentTheme(),
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif',
      });
    } catch {}
    rendered.forEach(function(n) {
      var src = n.getAttribute('data-mermaid-src-cache');
      if (!src) {
        // Cache the source before we first render so theme re-render works
        return;
      }
      n.textContent = src;
      n.removeAttribute('data-mermaid-rendered');
      n.removeAttribute('data-processed');
    });
    render();
  }

  // Snapshot source before mermaid mutates the node so theme re-render can restore it.
  function snapshotSources() {
    document.querySelectorAll('pre.mermaid[data-mermaid-source="true"]:not([data-mermaid-src-cache])').forEach(function(n) {
      n.setAttribute('data-mermaid-src-cache', n.textContent || '');
    });
  }

  // Watch for data-theme changes on <html>
  var themeObserver = new MutationObserver(function(records) {
    for (var i = 0; i < records.length; i++) {
      if (records[i].attributeName === 'data-theme') { rerenderForTheme(); break; }
    }
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* ───── Fullscreen modal (panzoom) ───── */

  var PANZOOM_CDN = 'https://cdn.jsdelivr.net/npm/panzoom@9.4.3/dist/panzoom.min.js';
  var panzoomLoad = null;
  var EXPAND_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';

  function loadPanzoom() {
    if (panzoomLoad) return panzoomLoad;
    panzoomLoad = new Promise(function(resolve, reject) {
      if (window.panzoom) { resolve(window.panzoom); return; }
      var s = document.createElement('script');
      s.src = PANZOOM_CDN;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = function() {
        if (window.panzoom) resolve(window.panzoom);
        else reject(new Error('panzoom global missing after load'));
      };
      s.onerror = function() { reject(new Error('panzoom CDN unavailable')); };
      document.head.appendChild(s);
    });
    return panzoomLoad;
  }

  function injectExpandButton(pre) {
    if (pre.querySelector('.mermaid-expand-btn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mermaid-expand-btn';
    btn.title = '全屏展开 (点击或按 F)';
    btn.setAttribute('aria-label', '全屏展开图表');
    btn.innerHTML = EXPAND_ICON;
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      openFullscreen(pre);
    });
    pre.appendChild(btn);
  }

  var activeModal = null;
  var prevFocus = null;

  function closeFullscreen() {
    if (!activeModal) return;
    if (activeModal.__pz) try { activeModal.__pz.dispose(); } catch {}
    activeModal.remove();
    activeModal = null;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onModalKey);
    if (prevFocus && prevFocus.focus) prevFocus.focus();
  }

  function onModalKey(e) {
    if (!activeModal) return;
    if (e.key === 'Escape') { e.preventDefault(); closeFullscreen(); }
    else if (e.key === '+' || (e.key === '=' && e.shiftKey === false)) {
      if (activeModal.__pz) zoomBy(activeModal.__pz, 1.25);
    } else if (e.key === '-' || e.key === '_') {
      if (activeModal.__pz) zoomBy(activeModal.__pz, 0.8);
    } else if (e.key === '0') {
      resetTransform();
    }
  }

  function zoomBy(pz, factor) {
    var rect = activeModal.querySelector('.mermaid-modal-canvas').getBoundingClientRect();
    pz.smoothZoom(rect.width / 2, rect.height / 2, factor);
  }

  function resetTransform() {
    if (!activeModal || !activeModal.__pz) return;
    // Identity transform: scale=1, pan=(0,0). Flexbox handles re-centering.
    activeModal.__pz.zoomAbs(0, 0, 1);
    activeModal.__pz.moveTo(0, 0);
  }

  function openFullscreen(pre) {
    if (activeModal) closeFullscreen();
    var origSvg = pre.querySelector('svg');
    if (!origSvg) return;
    prevFocus = document.activeElement;

    var modal = document.createElement('div');
    modal.className = 'mermaid-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Mermaid 图表全屏预览');
    modal.innerHTML =
      '<div class="mermaid-modal-toolbar">' +
        '<div class="mermaid-modal-title">Mermaid 图表预览</div>' +
        '<button type="button" class="mermaid-modal-btn" data-action="zoom-in"  aria-label="放大" title="放大 (+)">+</button>' +
        '<button type="button" class="mermaid-modal-btn" data-action="zoom-out" aria-label="缩小" title="缩小 (-)">−</button>' +
        '<button type="button" class="mermaid-modal-btn" data-action="reset"    aria-label="重置缩放" title="重置 (0)">⟳</button>' +
        '<button type="button" class="mermaid-modal-btn" data-action="close"    aria-label="关闭" title="关闭 (Esc)">×</button>' +
      '</div>' +
      '<div class="mermaid-modal-canvas" data-canvas></div>' +
      '<div class="mermaid-modal-hint"><span><kbd>滚轮</kbd> 缩放</span><span><kbd>拖动</kbd> 平移</span><span><kbd>0</kbd> 重置</span><span><kbd>Esc</kbd> 关闭</span></div>';

    var canvas = modal.querySelector('[data-canvas]');
    var clone = origSvg.cloneNode(true);
    // Drop intrinsic width/height attrs so the SVG can resize via CSS,
    // then constrain to viewport so it fits the canvas on open.
    // panzoom applies transform:scale after layout, so zoom-in is unaffected by these caps.
    clone.removeAttribute('width');
    clone.removeAttribute('height');
    clone.style.maxWidth = '92vw';
    clone.style.maxHeight = 'calc(100vh - 120px)';
    clone.style.width = 'auto';
    clone.style.height = 'auto';
    canvas.appendChild(clone);
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    activeModal = modal;
    document.addEventListener('keydown', onModalKey);

    // Toolbar button clicks (close-on-canvas-click is intentionally NOT wired —
    // panzoom drag-end synthesizes a click that would close mid-pan).
    modal.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var act = btn.getAttribute('data-action');
      if (act === 'close') closeFullscreen();
      else if (modal.__pz) {
        if (act === 'zoom-in') zoomBy(modal.__pz, 1.25);
        else if (act === 'zoom-out') zoomBy(modal.__pz, 0.8);
        else if (act === 'reset') resetTransform();
      }
    });

    // Lazy-load panzoom and attach to the svg
    loadPanzoom().then(function(panzoom) {
      modal.__pz = panzoom(clone, {
        maxZoom: 20,
        minZoom: 0.1,
        bounds: false,
        smoothScroll: false,
        zoomDoubleClickSpeed: 1.6,
      });
    }).catch(function(err) {
      console.error('[mermaid-fullscreen] panzoom load failed:', err);
      // Fallback: rendered SVG without pan/zoom — user can still close
    });

    // Move focus into modal for accessibility
    var closeBtn = modal.querySelector('[data-action="close"]');
    if (closeBtn) closeBtn.focus();
  }

  function go() {
    snapshotSources();
    render();
    // For diagrams that were already rendered (e.g. theme-rerender path) make sure they get the button
    document.querySelectorAll('pre.mermaid[data-mermaid-rendered="true"]').forEach(injectExpandButton);
  }

  window.__renderMermaid = go;

  if ('requestIdleCallback' in window) requestIdleCallback(go);
  else setTimeout(go, 50);
})();
</script>
`;

/* ─────────────────── Frontmatter neutral false-color (P6 polish) ─────────────────── */

export const frontmatterNeutralStyles = `
:root[data-theme="light"] { --fm-false-bg: #f1f5f9; --fm-false-color: #475569; --fm-true-bg: #dcfce7; --fm-true-color: #166534; }
:root[data-theme="dark"]  { --fm-false-bg: #1e293b; --fm-false-color: #94a3b8; --fm-true-bg: #14532d; --fm-true-color: #86efac; }
.fm-true  { background: var(--fm-true-bg)  !important; color: var(--fm-true-color)  !important; }
.fm-false { background: var(--fm-false-bg) !important; color: var(--fm-false-color) !important; }
`;

/* ─────────────────── Reduced-motion respect (P6 polish) ─────────────────── */

export const reducedMotionStyles = `
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto !important; }
  *, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
}
`;
