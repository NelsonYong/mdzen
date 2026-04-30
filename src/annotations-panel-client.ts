/**
 * Bottom-FAB-launched annotations panel — drawer that slides in from the right
 * showing every annotation in the current file (highlights / underlines /
 * comments) with filter tabs, search, click-to-jump, and per-item delete.
 */

export const annotationsPanelStyles = `
.anno-panel-fab {
  /* Sits in the existing .anno-fab-bar stack, styled like other FABs */
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
  transition: color 0.2s, border-color 0.2s, background 0.2s;
  padding: 0;
}
.anno-panel-fab:hover { color: var(--link-color); border-color: var(--link-color); }
.anno-panel-fab:focus-visible { outline: 2px solid var(--link-color); outline-offset: 2px; }
.anno-panel-fab[aria-pressed="true"] {
  background: var(--link-color);
  color: #fff;
  border-color: var(--link-color);
}

.anno-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 380px;
  max-width: 92vw;
  z-index: 220;
  background: var(--bg-content);
  border-left: 1px solid var(--border-color);
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.15);
  transform: translateX(100%);
  transition: transform 0.25s ease;
  display: flex;
  flex-direction: column;
}
.anno-panel[data-open="true"] { transform: translateX(0); }

.anno-panel-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 8px;
}
.anno-panel-title { font-size: 14px; font-weight: 600; color: var(--text-primary); flex: 1; }
.anno-panel-close {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-medium);
  background: var(--bg-page);
  color: var(--text-primary);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  padding: 0;
}
.anno-panel-close:hover { background: var(--bg-hover); }
.anno-panel-close:focus-visible { outline: 2px solid var(--link-color); outline-offset: 2px; }

.anno-panel-search {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
}
.anno-panel-search input {
  width: 100%;
  border: 1px solid var(--border-medium);
  border-radius: 6px;
  padding: 6px 10px;
  background: var(--bg-page);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}
.anno-panel-search input:focus { border-color: var(--link-color); }

.anno-panel-tabs {
  display: flex;
  gap: 0;
  padding: 0 12px;
  border-bottom: 1px solid var(--border-color);
}
.anno-panel-tab {
  flex: 1;
  padding: 8px 4px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  font-weight: 500;
}
.anno-panel-tab:hover { color: var(--text-primary); }
.anno-panel-tab[aria-pressed="true"] {
  color: var(--link-color);
  border-bottom-color: var(--link-color);
}
.anno-panel-tab:focus-visible { outline: 2px solid var(--link-color); outline-offset: -2px; border-radius: 3px; }
.anno-panel-tab-count { font-size: 10px; opacity: 0.7; }

.anno-panel-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.anno-panel-list:empty::before {
  content: '暂无标注';
  display: block;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 12px;
  padding: 32px 0;
}

.anno-panel-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-page);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.anno-panel-item:hover { border-color: var(--link-color); background: var(--bg-hover); }
.anno-panel-item:focus-visible { outline: 2px solid var(--link-color); outline-offset: 1px; }
.anno-panel-item-color {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 5px;
}
.anno-panel-item-color[data-color="yellow"] { background: var(--anno-yellow-border); }
.anno-panel-item-color[data-color="green"]  { background: var(--anno-green-border); }
.anno-panel-item-color[data-color="pink"]   { background: var(--anno-pink-border); }
.anno-panel-item-color[data-color="blue"]   { background: var(--anno-blue-border); }
.anno-panel-item-body { flex: 1; min-width: 0; }
.anno-panel-item-text {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.anno-panel-item-note {
  font-size: 13px;
  color: var(--text-primary);
  margin-top: 4px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
}
.anno-panel-item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 10px;
  color: var(--text-tertiary);
}
.anno-panel-item-kind {
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--bg-content);
  border: 1px solid var(--border-medium);
  color: var(--text-secondary);
  font-size: 10px;
}
.anno-panel-item-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}
.anno-panel-item-btn {
  width: 24px;
  height: 24px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-tertiary);
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.anno-panel-item-btn:hover { background: var(--bg-content); color: var(--adm-danger-title-color); border-color: var(--adm-danger-border); }
.anno-panel-item-btn:focus-visible { outline: 2px solid var(--link-color); outline-offset: 1px; }
`;

export const annotationsPanelMarkup = `
<div class="anno-panel" data-anno-panel role="dialog" aria-modal="false" aria-label="标注列表" hidden>
  <div class="anno-panel-header">
    <div class="anno-panel-title">标注 / 评论列表</div>
    <button type="button" class="anno-panel-close" data-anno-panel-close aria-label="关闭" title="关闭 (Esc)">×</button>
  </div>
  <div class="anno-panel-search">
    <input type="search" data-anno-panel-search placeholder="搜索原文 / 评论…" autocomplete="off" spellcheck="false">
  </div>
  <div class="anno-panel-tabs" role="tablist">
    <button type="button" class="anno-panel-tab" role="tab" aria-pressed="true"  data-anno-panel-tab="all">全部 <span class="anno-panel-tab-count" data-count="all">0</span></button>
    <button type="button" class="anno-panel-tab" role="tab" aria-pressed="false" data-anno-panel-tab="highlight">高亮 <span class="anno-panel-tab-count" data-count="highlight">0</span></button>
    <button type="button" class="anno-panel-tab" role="tab" aria-pressed="false" data-anno-panel-tab="underline">划线 <span class="anno-panel-tab-count" data-count="underline">0</span></button>
    <button type="button" class="anno-panel-tab" role="tab" aria-pressed="false" data-anno-panel-tab="comment">评论 <span class="anno-panel-tab-count" data-count="comment">0</span></button>
  </div>
  <div class="anno-panel-list" data-anno-panel-list></div>
</div>
`;

export const annotationsPanelScript = `
<script>
(function() {
  var panel = null;
  var fab = null;
  var listEl = null;
  var searchInput = null;
  var fileKey = null;
  var currentTab = 'all';
  var query = '';
  var items = [];

  function getFileKey() {
    var match = location.pathname.match(/^\\/view\\/(.+)$/);
    if (!match) return null;
    try { return decodeURIComponent(match[1]); } catch { return match[1]; }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  function fetchAll() {
    if (!fileKey) return Promise.resolve([]);
    return fetch('/api/annotations/' + encodeURIComponent(fileKey))
      .then(function(r) { return r.ok ? r.json() : { annotations: [] }; })
      .then(function(d) { return Array.isArray(d.annotations) ? d.annotations : []; })
      .catch(function() { return []; });
  }

  function deleteOne(id) {
    return fetch('/api/annotations/' + encodeURIComponent(fileKey) + '/' + encodeURIComponent(id), { method: 'DELETE' });
  }

  function counts() {
    var c = { all: items.length, highlight: 0, underline: 0, comment: 0 };
    items.forEach(function(a) { if (c[a.kind] !== undefined) c[a.kind]++; });
    return c;
  }

  function filtered() {
    return items.filter(function(a) {
      if (currentTab !== 'all' && a.kind !== currentTab) return false;
      if (query) {
        var q = query.toLowerCase();
        if ((a.anchor.exact || '').toLowerCase().indexOf(q) === -1 &&
            (a.note || '').toLowerCase().indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function kindLabel(k) {
    return k === 'highlight' ? '高亮' : k === 'underline' ? '划线' : k === 'comment' ? '评论' : k;
  }

  function render() {
    if (!panel) return;
    var c = counts();
    panel.querySelectorAll('[data-count]').forEach(function(el) {
      el.textContent = String(c[el.getAttribute('data-count')] || 0);
    });
    panel.querySelectorAll('[data-anno-panel-tab]').forEach(function(t) {
      t.setAttribute('aria-pressed', t.getAttribute('data-anno-panel-tab') === currentTab ? 'true' : 'false');
    });
    var list = filtered();
    listEl.innerHTML = list.map(function(a) {
      var note = a.note ? '<div class="anno-panel-item-note">' + esc(a.note) + '</div>' : '';
      var when = new Date(a.updatedAt || a.createdAt).toLocaleString();
      return '<div class="anno-panel-item" role="button" tabindex="0" data-anno-panel-id="' + esc(a.id) + '">'
        + '<span class="anno-panel-item-color" data-color="' + esc(a.color) + '" aria-hidden="true"></span>'
        + '<div class="anno-panel-item-body">'
        + '<div class="anno-panel-item-text">' + esc(a.anchor.exact || '') + '</div>'
        + note
        + '<div class="anno-panel-item-meta">'
        + '<span class="anno-panel-item-kind">' + kindLabel(a.kind) + '</span>'
        + '<span>' + esc(when) + '</span>'
        + '</div></div>'
        + '<div class="anno-panel-item-actions">'
        + '<button type="button" class="anno-panel-item-btn" data-anno-panel-delete="' + esc(a.id) + '" aria-label="删除" title="删除">'
        + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>'
        + '</button></div></div>';
    }).join('');
  }

  function open() {
    if (!panel) return;
    panel.hidden = false;
    panel.setAttribute('data-open', 'true');
    if (fab) fab.setAttribute('aria-pressed', 'true');
    refresh();
  }
  function close() {
    if (!panel) return;
    panel.removeAttribute('data-open');
    setTimeout(function() { panel.hidden = true; }, 250);
    if (fab) fab.setAttribute('aria-pressed', 'false');
  }
  function toggle() {
    if (panel.getAttribute('data-open') === 'true') close();
    else open();
  }

  function refresh() {
    fetchAll().then(function(list) { items = list; render(); });
  }

  function jumpTo(id) {
    var ann = items.find(function(a) { return a.id === id; });
    if (!ann) return;
    // Find existing mark or pin in DOM
    var el = document.querySelector('[data-anno-id="' + id + '"]');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('anno-flash');
      setTimeout(function() { el.classList.remove('anno-flash'); }, 1200);
    }
  }

  function init() {
    fileKey = getFileKey();
    if (!fileKey) return;
    panel = document.querySelector('[data-anno-panel]');
    fab = document.querySelector('[data-fab="panel"]');
    if (!panel) return;
    listEl = panel.querySelector('[data-anno-panel-list]');
    searchInput = panel.querySelector('[data-anno-panel-search]');

    // Refresh on creation/update/deletion events from the rest of the system
    document.addEventListener('mdzen:annotations:changed', refresh);
    document.addEventListener('mdzen:annotations:cleared', function() {
      items = []; render();
    });
  }

  document.addEventListener('click', function(e) {
    var t = e.target;
    var fabBtn = t.closest && t.closest('[data-fab="panel"]');
    if (fabBtn) { e.preventDefault(); toggle(); return; }
    if (!panel) return;
    if (t.closest('[data-anno-panel-close]')) { e.preventDefault(); close(); return; }
    var tab = t.closest && t.closest('[data-anno-panel-tab]');
    if (tab && panel.contains(tab)) {
      currentTab = tab.getAttribute('data-anno-panel-tab');
      render();
      return;
    }
    var del = t.closest && t.closest('[data-anno-panel-delete]');
    if (del) {
      e.preventDefault();
      var id = del.getAttribute('data-anno-panel-delete');
      deleteOne(id).then(function() {
        items = items.filter(function(a) { return a.id !== id; });
        render();
        document.dispatchEvent(new CustomEvent('mdzen:annotations:item-deleted', { detail: { id: id } }));
      });
      return;
    }
    var item = t.closest && t.closest('[data-anno-panel-id]');
    if (item && panel.contains(item)) {
      jumpTo(item.getAttribute('data-anno-panel-id'));
      return;
    }
  });

  document.addEventListener('input', function(e) {
    if (e.target && e.target.matches && e.target.matches('[data-anno-panel-search]')) {
      query = e.target.value || '';
      render();
    }
  });

  document.addEventListener('keydown', function(e) {
    if (!panel || panel.getAttribute('data-open') !== 'true') return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  });

  // Refresh when other modules signal changes
  document.addEventListener('mdzen:annotations:cleared', function() {
    if (panel && panel.getAttribute('data-open') === 'true') refresh();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
</script>

<style>
.anno-flash {
  animation: anno-flash-anim 1.2s ease-out;
}
@keyframes anno-flash-anim {
  0% { box-shadow: 0 0 0 4px var(--link-color); }
  100% { box-shadow: 0 0 0 4px transparent; }
}
</style>
`;
