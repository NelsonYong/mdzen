/** Theme CSS variables, toggle UI, and switching logic */

export const themeStyles = `
/* ── Light theme ── */
:root[data-theme="light"] {
  --bg-page: #f5f5f5;
  --bg-content: #fff;
  --bg-sidebar: #fff;
  --bg-hover: #f0f7ff;
  --bg-code-inline: #f4f4f4;
  --bg-code-block: #f6f8fa;
  --border-code-block: #d0d7de;
  --bg-blockquote: #f9f9f9;
  --bg-table-header: #f5f5f5;

  --text-primary: #333;
  --text-secondary: #666;
  --text-tertiary: #999;
  --text-heading3: #444;
  --text-heading4: #555;
  --link-color: #0066cc;
  --link-hover-bg: rgba(0,102,204,0.05);
  --link-active-bg: rgba(0,102,204,0.08);

  --border-color: #eee;
  --border-medium: #ddd;
  --shadow: 0 2px 8px rgba(0,0,0,0.1);
  --shadow-lg: 0 4px 20px rgba(0,0,0,0.1);

  /* Frontmatter */
  --fm-bg: #f8fafc;
  --fm-border: #e2e8f0;
  --fm-key: #6366f1;
  --fm-value: #334155;
  --fm-code-bg: #e0e7ff;
  --fm-code-color: #4338ca;

  /* Tree nav */
  --tree-count-bg: #f0f0f0;

  /* Editor link button */
  --btn-border: #e2e8f0;
  --btn-bg: #f8fafc;
  --btn-color: #94a3b8;
  --btn-hover-bg: #e0e7ff;
  --btn-hover-border: #818cf8;
  --btn-hover-color: #4f46e5;

  /* Admonition content */
  --admonition-content-color: #374151;

  /* Admonition types */
  --adm-info-border: #3b82f6; --adm-info-title-bg: #dbeafe; --adm-info-title-color: #1d4ed8; --adm-info-bg: #eff6ff;
  --adm-tip-border: #22c55e; --adm-tip-title-bg: #dcfce7; --adm-tip-title-color: #15803d; --adm-tip-bg: #f0fdf4;
  --adm-warning-border: #f59e0b; --adm-warning-title-bg: #fef3c7; --adm-warning-title-color: #b45309; --adm-warning-bg: #fffbeb;
  --adm-danger-border: #ef4444; --adm-danger-title-bg: #fee2e2; --adm-danger-title-color: #b91c1c; --adm-danger-bg: #fef2f2;
  --adm-caution-border: #f97316; --adm-caution-title-bg: #ffedd5; --adm-caution-title-color: #c2410c; --adm-caution-bg: #fff7ed;
  --adm-note-border: #a855f7; --adm-note-title-bg: #f3e8ff; --adm-note-title-color: #7e22ce; --adm-note-bg: #faf5ff;

  /* hljs light (GitHub Light) */
  --hljs-color: #24292e;
  --hljs-bg: #f6f8fa;
  --hljs-keyword: #d73a49;
  --hljs-title: #6f42c1;
  --hljs-attr: #005cc5;
  --hljs-string: #032f62;
  --hljs-built-in: #e36209;
  --hljs-comment: #6a737d;
  --hljs-tag: #22863a;
  --hljs-subst: #24292e;
  --hljs-section: #005cc5;
  --hljs-bullet: #735c0f;
  --hljs-emphasis: #24292e;
  --hljs-strong: #24292e;
  --hljs-addition-color: #22863a;
  --hljs-addition-bg: #f0fff4;
  --hljs-deletion-color: #b31d28;
  --hljs-deletion-bg: #ffeef0;
}

/* ── Dark theme ── */
:root[data-theme="dark"] {
  --bg-page: #0d1117;
  --bg-content: #161b22;
  --bg-sidebar: #161b22;
  --bg-hover: rgba(56,139,253,0.1);
  --bg-code-inline: #1c2128;
  --bg-code-block: #0d1117;
  --border-code-block: #30363d;
  --bg-blockquote: #1c2128;
  --bg-table-header: #1c2128;

  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-tertiary: #6e7681;
  --text-heading3: #c9d1d9;
  --text-heading4: #8b949e;
  --link-color: #58a6ff;
  --link-hover-bg: rgba(56,139,253,0.1);
  --link-active-bg: rgba(56,139,253,0.15);

  --border-color: #30363d;
  --border-medium: #30363d;
  --shadow: 0 2px 8px rgba(0,0,0,0.3);
  --shadow-lg: 0 4px 20px rgba(0,0,0,0.4);

  /* Frontmatter */
  --fm-bg: #1c2128;
  --fm-border: #30363d;
  --fm-key: #a5b4fc;
  --fm-value: #c9d1d9;
  --fm-code-bg: #1e1b4b;
  --fm-code-color: #a5b4fc;

  /* Tree nav */
  --tree-count-bg: #21262d;

  /* Editor link button */
  --btn-border: #30363d;
  --btn-bg: #1c2128;
  --btn-color: #6e7681;
  --btn-hover-bg: #1e1b4b;
  --btn-hover-border: #818cf8;
  --btn-hover-color: #a5b4fc;

  /* Admonition content */
  --admonition-content-color: #c9d1d9;

  /* Admonition types (dark) */
  --adm-info-border: #3b82f6; --adm-info-title-bg: #1e3a5f; --adm-info-title-color: #93c5fd; --adm-info-bg: #172554;
  --adm-tip-border: #22c55e; --adm-tip-title-bg: #14532d; --adm-tip-title-color: #86efac; --adm-tip-bg: #052e16;
  --adm-warning-border: #f59e0b; --adm-warning-title-bg: #78350f; --adm-warning-title-color: #fde68a; --adm-warning-bg: #451a03;
  --adm-danger-border: #ef4444; --adm-danger-title-bg: #7f1d1d; --adm-danger-title-color: #fca5a5; --adm-danger-bg: #450a0a;
  --adm-caution-border: #f97316; --adm-caution-title-bg: #7c2d12; --adm-caution-title-color: #fdba74; --adm-caution-bg: #431407;
  --adm-note-border: #a855f7; --adm-note-title-bg: #581c87; --adm-note-title-color: #d8b4fe; --adm-note-bg: #3b0764;

  /* hljs dark (GitHub Dark) */
  --hljs-color: #c9d1d9;
  --hljs-bg: #0d1117;
  --hljs-keyword: #ff7b72;
  --hljs-title: #d2a8ff;
  --hljs-attr: #79c0ff;
  --hljs-string: #a5d6ff;
  --hljs-built-in: #ffa657;
  --hljs-comment: #8b949e;
  --hljs-tag: #7ee787;
  --hljs-subst: #c9d1d9;
  --hljs-section: #1f6feb;
  --hljs-bullet: #f2cc60;
  --hljs-emphasis: #c9d1d9;
  --hljs-strong: #c9d1d9;
  --hljs-addition-color: #aff5b4;
  --hljs-addition-bg: #033a16;
  --hljs-deletion-color: #ffdcd7;
  --hljs-deletion-bg: #67060c;
}
`;

/** Inline script for <head> to prevent flash of wrong theme */
export const themeInitScript = `<script>
(function(){
  // One-time migration from legacy key
  try {
    var legacy = localStorage.getItem('mdzen-theme');
    if (legacy && !localStorage.getItem('mdzen-theme')) {
      localStorage.setItem('mdzen-theme', legacy);
      localStorage.removeItem('mdzen-theme');
    }
  } catch(e) {}
  var s = (function(){ try { return localStorage.getItem('mdzen-theme'); } catch(e) { return null; } })() || 'system';
  var d = s === 'system'
    ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : s;
  document.documentElement.setAttribute('data-theme', d);
})();
</script>`;

/** Theme toggle panel — injected inside .status-dot container */
export const themeToggleButtons = `
<button class="theme-btn" data-theme-mode="light" title="浅色模式">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
</button>
<button class="theme-btn" data-theme-mode="dark" title="深色模式">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
</button>
<button class="theme-btn" data-theme-mode="system" title="跟随系统">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
</button>`;

export const themeToggleStyles = `
/* Status dot: collapsed = single dot, hover = expand theme panel */
.status-dot {
  position: fixed;
  top: 14px;
  right: 14px;
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 2px;
  border-radius: 8px;
  padding: 3px;
  transition: all 0.25s ease;
  cursor: default;
}
.status-dot-light {
  width: 10px;
  height: 10px;
  min-width: 10px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 8px rgba(16,185,129,0.5);
  transition: all 0.3s ease;
}
.status-dot .theme-btn {
  width: 0;
  height: 28px;
  padding: 0;
  overflow: hidden;
  opacity: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}
/* Hover/focus: expand into theme panel */
.status-dot:hover,
.status-dot:focus-within {
  background: var(--bg-content);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow);
  padding: 3px;
}
.status-dot:hover .status-dot-light,
.status-dot:focus-within .status-dot-light {
  width: 8px;
  height: 8px;
  min-width: 8px;
  margin: 0 4px;
}
.status-dot:hover .theme-btn,
.status-dot:focus-within .theme-btn {
  width: 28px;
  opacity: 1;
}
/* Always allow tab to reach the buttons even when collapsed */
.status-dot .theme-btn { pointer-events: auto; }
.theme-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.theme-btn:focus-visible {
  outline: 2px solid var(--link-color);
  outline-offset: 1px;
}
.theme-btn.active,
.theme-btn[aria-pressed="true"] {
  background: var(--link-color);
  color: #fff;
}
`;

export const themeScript = `
<script>
(function(){
  var mq = window.matchMedia('(prefers-color-scheme: dark)');

  function applyTheme(mode) {
    var resolved = mode === 'system'
      ? (mq.matches ? 'dark' : 'light')
      : mode;
    document.documentElement.setAttribute('data-theme', resolved);
    // Update toggle buttons + aria-pressed state
    document.querySelectorAll('.theme-btn').forEach(function(btn) {
      var active = btn.getAttribute('data-theme-mode') === mode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  function setTheme(mode) {
    localStorage.setItem('mdzen-theme', mode);
    applyTheme(mode);
  }

  // Listen for system preference changes
  mq.addEventListener('change', function() {
    var saved = localStorage.getItem('mdzen-theme') || 'system';
    if (saved === 'system') applyTheme('system');
  });

  // Bind click handlers
  document.querySelectorAll('.theme-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      setTheme(btn.getAttribute('data-theme-mode'));
    });
  });

  // Initial state
  applyTheme(localStorage.getItem('mdzen-theme') || 'system');
  window.__setTheme = setTheme;
})();
</script>`;
