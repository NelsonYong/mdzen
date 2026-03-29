import { editorLinkStyles, editorLinkScript } from './editor-link.ts';
import { themeStyles, themeInitScript, themeToggleButtons, themeToggleStyles, themeScript } from './theme.ts';

/** Served at GET /logo.svg — supports light/dark via CSS media query inside SVG */
export const logoSvgFileContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <style>
    :root { --c: #444; }
    @media (prefers-color-scheme: dark) { :root { --c: #ccc; } }
    .s { stroke: var(--c); fill: none; }
    .f { fill: var(--c); }
  </style>
  <circle class="s" cx="100" cy="100" r="90" stroke-width="8"/>
  <circle class="s" cx="100" cy="100" r="72" stroke-width="5"/>
  <text class="f" x="62" y="105" font-family="Arial,Helvetica,sans-serif" font-weight="bold" font-size="56">M</text>
  <g transform="translate(118,72)">
    <line class="s" x1="12" y1="0" x2="12" y2="24" stroke-width="6" stroke-linecap="round"/>
    <polyline class="s" points="2,16 12,28 22,16" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text class="f" x="82" y="142" font-family="Arial,Helvetica,sans-serif" font-weight="bold" font-size="36">Z</text>
  <path class="s" d="M50 140Q75 158 100 145Q125 132 150 148" stroke-width="5" stroke-linecap="round"/>
</svg>`;

/** Inline SVG for the index page nav header — uses currentColor to follow CSS theme */
export const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="40" height="40" aria-hidden="true">
  <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" stroke-width="8"/>
  <circle cx="100" cy="100" r="72" fill="none" stroke="currentColor" stroke-width="5"/>
  <text x="62" y="105" font-family="Arial,Helvetica,sans-serif" font-weight="bold" font-size="56" fill="currentColor">M</text>
  <g transform="translate(118,72)">
    <line x1="12" y1="0" x2="12" y2="24" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
    <polyline points="2,16 12,28 22,16" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="82" y="142" font-family="Arial,Helvetica,sans-serif" font-weight="bold" font-size="36" fill="currentColor">Z</text>
  <path d="M50 140Q75 158 100 145Q125 132 150 148" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
</svg>`;

const faviconLink = `<link rel="icon" type="image/svg+xml" href="/logo.svg">`;

export const hljsStyles = `
/* highlight.js theme — uses CSS variables for dark/light */
pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}
.hljs{color:var(--hljs-color);background:var(--hljs-bg)}
.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:var(--hljs-keyword)}
.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:var(--hljs-title)}
.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable{color:var(--hljs-attr)}
.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:var(--hljs-string)}
.hljs-built_in,.hljs-symbol{color:var(--hljs-built-in)}
.hljs-code,.hljs-comment,.hljs-formula{color:var(--hljs-comment)}
.hljs-name,.hljs-quote,.hljs-selector-pseudo,.hljs-selector-tag{color:var(--hljs-tag)}
.hljs-subst{color:var(--hljs-subst)}
.hljs-section{color:var(--hljs-section);font-weight:700}
.hljs-bullet{color:var(--hljs-bullet)}
.hljs-emphasis{color:var(--hljs-emphasis);font-style:italic}
.hljs-strong{color:var(--hljs-strong);font-weight:700}
.hljs-addition{color:var(--hljs-addition-color);background-color:var(--hljs-addition-bg)}
.hljs-deletion{color:var(--hljs-deletion-color);background-color:var(--hljs-deletion-bg)}
`;

export const admonitionStyles = `
.admonition {
  border-radius: 0 8px 8px 0;
  margin: 1.25rem 0;
  overflow: hidden;
}
.admonition-title {
  font-weight: 600;
  font-size: 0.85rem;
  padding: 8px 16px;
  letter-spacing: 0.3px;
}
.admonition-content {
  padding: 12px 16px;
  color: var(--admonition-content-color);
}
.admonition-content > *:first-child { margin-top: 0; }
.admonition-content > *:last-child { margin-bottom: 0; }
.admonition-info    { border-left: 4px solid var(--adm-info-border);    background: var(--adm-info-bg); }
.admonition-info    > .admonition-title { background: var(--adm-info-title-bg);    color: var(--adm-info-title-color); }
.admonition-tip     { border-left: 4px solid var(--adm-tip-border);     background: var(--adm-tip-bg); }
.admonition-tip     > .admonition-title { background: var(--adm-tip-title-bg);     color: var(--adm-tip-title-color); }
.admonition-warning { border-left: 4px solid var(--adm-warning-border); background: var(--adm-warning-bg); }
.admonition-warning > .admonition-title { background: var(--adm-warning-title-bg); color: var(--adm-warning-title-color); }
.admonition-danger  { border-left: 4px solid var(--adm-danger-border);  background: var(--adm-danger-bg); }
.admonition-danger  > .admonition-title { background: var(--adm-danger-title-bg);  color: var(--adm-danger-title-color); }
.admonition-caution { border-left: 4px solid var(--adm-caution-border); background: var(--adm-caution-bg); }
.admonition-caution > .admonition-title { background: var(--adm-caution-title-bg); color: var(--adm-caution-title-color); }
.admonition-note    { border-left: 4px solid var(--adm-note-border);    background: var(--adm-note-bg); }
.admonition-note    > .admonition-title { background: var(--adm-note-title-bg);    color: var(--adm-note-title-color); }
`;

export const hmrScript = `
<script>
  (function() {
    function getCurrentFile() {
      var match = location.pathname.match(/^\\/view\\/(.+)$/);
      return match ? decodeURIComponent(match[1]) : null;
    }

    function getClientId() {
      var clientId = sessionStorage.getItem('hmr-client-id');
      if (!clientId) {
        clientId = 'client-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
        sessionStorage.setItem('hmr-client-id', clientId);
      }
      return clientId;
    }

    var clientId = getClientId();
    var hasConnectedBefore = false;
    var debounceTimer = null;

    function connectSSE() {
      var evtSource = new EventSource('/sse?clientId=' + encodeURIComponent(clientId));

      evtSource.onopen = function() {
        updateBadge('connected');
        if (hasConnectedBefore) refreshContent();
        hasConnectedBefore = true;
      };

      evtSource.onmessage = function(event) {
        var data = JSON.parse(event.data);

        if (data.type === 'connected') return;

        if (data.type === 'reload') {
          if (!getCurrentFile()) {
            location.reload();
          }
          return;
        }

        if (data.type === 'update') {
          var currentFile = getCurrentFile();
          if (currentFile === data.file) {
            scheduleUpdate(currentFile);
          }
        }
      };

      evtSource.onerror = function() {
        updateBadge('error');
        evtSource.close();
        setTimeout(connectSSE, 3000);
      };
    }

    function scheduleUpdate(file) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function() {
        debounceTimer = null;
        fetchAndUpdate(file);
      }, 100);
    }

    function refreshContent() {
      var currentFile = getCurrentFile();
      if (currentFile) fetchAndUpdate(currentFile);
    }

    function fetchAndUpdate(file) {
      updateBadge('updating');
      fetch('/api/content/' + encodeURIComponent(file))
        .then(function(res) { return res.json(); })
        .then(function(data) {
          var contentEl = document.querySelector('.content');
          var tocNav = document.querySelector('.toc-nav');
          if (contentEl) {
            contentEl.innerHTML = data.html;
            if (data.filePath) contentEl.setAttribute('data-file-path', data.filePath);
          }
          if (tocNav && data.tocHtml) tocNav.innerHTML = data.tocHtml;
          if (typeof window.__injectEditorButtons === 'function') window.__injectEditorButtons();
          if (typeof window.__setupTocSpy === 'function') window.__setupTocSpy();
          updateBadge('connected');
        })
        .catch(function() { updateBadge('error'); });
    }

    function updateBadge(state) {
      var badge = document.querySelector('.status-dot-light');
      if (!badge) return;
      var colors = { connected: '#10b981', updating: '#f59e0b', error: '#ef4444' };
      badge.style.background = colors[state] || colors.connected;
      badge.style.boxShadow = '0 0 8px ' + (colors[state] || colors.connected) + '80';
    }

    connectSSE();
  })();
</script>
`;

const sharedContentStyles = `
.content {
  background: var(--bg-content);
  padding: 40px;
  border-radius: 8px;
  box-shadow: var(--shadow);
}
.content h1 { font-size: 2rem; margin-bottom: 1rem; border-bottom: 2px solid var(--border-color); padding-bottom: 0.5rem; }
.content h2 { font-size: 1.5rem; margin: 1.5rem 0 1rem; color: var(--text-primary); }
.content h3 { font-size: 1.25rem; margin: 1.25rem 0 0.75rem; color: var(--text-heading3); }
.content h4 { font-size: 1.1rem; margin: 1rem 0 0.5rem; color: var(--text-heading4); }
.content p { margin: 0.75rem 0; }
.content ul, .content ol { margin: 0.75rem 0; padding-left: 2rem; }
.content li { margin: 0.25rem 0; }
.content code {
  background: var(--bg-code-inline);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 0.9em;
}
.content pre {
  background: var(--bg-code-block);
  border-radius: 8px;
  overflow-x: auto;
  margin: 1rem 0;
  border: 1px solid var(--border-code-block);
}
.content pre code {
  background: transparent;
  padding: 16px;
  display: block;
  font-size: 0.875em;
  line-height: 1.6;
}
.content pre code.hljs { padding: 16px; }
.content blockquote {
  border-left: 4px solid var(--link-color);
  margin: 1rem 0;
  color: var(--text-secondary);
  background: var(--bg-blockquote);
  padding: 12px 16px;
  border-radius: 0 4px 4px 0;
}
.content table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
.content th, .content td { border: 1px solid var(--border-medium); padding: 10px; text-align: left; }
.content th { background: var(--bg-table-header); }
.content img { max-width: 100%; height: auto; display: block; border-radius: 6px; margin: 0.75rem auto; }
.content a { color: var(--link-color); }
`;

const statusDotHtml = `<div class="status-dot"><div class="status-dot-light"></div>${themeToggleButtons}</div>`;

// Simple full-page layout used by the index and 404 pages
export function getHtmlTemplate(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${faviconLink}
  ${themeInitScript}
  <style>
    ${themeStyles}
    ${hljsStyles}
    ${admonitionStyles}
    ${themeToggleStyles}
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: var(--text-primary);
      background: var(--bg-page);
    }
    .container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
    ${sharedContentStyles}
    ${themeToggleStyles}
    .nav {
      background: var(--bg-content);
      padding: 20px;
      border-radius: 8px;
      box-shadow: var(--shadow);
      margin-bottom: 20px;
    }
    .nav-logo { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .nav-logo svg { color: var(--text-primary); flex-shrink: 0; }
    .nav h1 { font-size: 1.5rem; margin: 0; color: var(--text-primary); }
    .nav .file-count { color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 20px; }
    .nav ul { list-style: none; }
    .nav li { margin: 4px 0; }
    .nav a {
      color: var(--link-color);
      text-decoration: none;
      padding: 6px 12px;
      display: inline-block;
      border-radius: 4px;
      transition: background 0.2s;
    }
    .nav a:hover { background: var(--bg-hover); }
    .nav-header { margin-bottom: 20px; }
    .tree-actions {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-color);
    }
    .tree-btn {
      padding: 6px 12px;
      font-size: 12px;
      color: var(--text-secondary);
      background: var(--bg-page);
      border: 1px solid var(--border-medium);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .tree-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
    .tree-container { font-size: 14px; }
    .tree-file {
      padding: 6px 0;
      transition: background 0.15s;
      border-radius: 6px;
      margin: 2px 0;
    }
    .tree-file:hover { background: var(--bg-hover); }
    .tree-file a {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-primary);
      text-decoration: none;
      padding: 4px 8px;
    }
    .tree-file a:hover { background: transparent; }
    .tree-folder { margin: 2px 0; }
    .tree-folder-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      cursor: pointer;
      border-radius: 6px;
      transition: background 0.15s;
      user-select: none;
    }
    .tree-folder-header:hover { background: var(--bg-hover); }
    .tree-arrow { font-size: 10px; color: var(--text-tertiary); width: 12px; transition: transform 0.2s; }
    .tree-arrow.expanded { color: var(--text-secondary); }
    .tree-icon { font-size: 16px; }
    .tree-name { flex: 1; }
    .tree-count {
      font-size: 11px;
      color: var(--text-tertiary);
      background: var(--tree-count-bg);
      padding: 2px 8px;
      border-radius: 10px;
    }
    .tree-folder-content {
      border-left: 1px solid var(--border-color);
      margin-left: 18px;
    }
    .back-link { display: inline-block; margin-bottom: 10px; color: var(--link-color); text-decoration: none; }
    .back-link:hover { text-decoration: underline; }
    .breadcrumb { color: var(--text-tertiary); }
  </style>
</head>
<body>
  <div class="container">
    ${content}
  </div>
  ${statusDotHtml}
  ${hmrScript}
  ${themeScript}
</body>
</html>`;
}

// Sidebar layout used for Markdown preview pages
export function getPreviewTemplate(
  title: string,
  mainContent: string,
  tocHtml: string,
  navInfo: { filename: string; breadcrumb: string },
  filePath?: string,
  allFiles?: string[],
): string {
  const tocScript = `
<script>
  (function() {
    function setupTocSpy() {
      var tocItems = document.querySelectorAll('.toc-item');
      var headings = document.querySelectorAll('.content h1, .content h2, .content h3, .content h4');

      if (window.__tocScrollHandler) {
        window.removeEventListener('scroll', window.__tocScrollHandler);
        window.__tocScrollHandler = null;
      }

      if (tocItems.length === 0 || headings.length === 0) return;

      function updateActiveHeading() {
        var current = '';
        var scrollTop = window.scrollY;
        headings.forEach(function(h) { if (scrollTop >= h.offsetTop - 100) current = h.id; });
        tocItems.forEach(function(item) {
          item.classList.remove('active');
          if (item.getAttribute('href') === '#' + current) item.classList.add('active');
        });
      }

      window.__tocScrollHandler = updateActiveHeading;
      window.addEventListener('scroll', updateActiveHeading);
      updateActiveHeading();
    }

    window.__setupTocSpy = setupTocSpy;
    setupTocSpy();
  })();
</script>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${faviconLink}
  ${themeInitScript}
  <style>
    ${themeStyles}
    ${hljsStyles}
    ${admonitionStyles}
    ${themeToggleStyles}
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: var(--text-primary);
      background: var(--bg-page);
    }
    .page-layout { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
    .main-content { width: 100%; }
    .sidebar { position: fixed; right: 0; top: 70px; z-index: 50; }
    .toc-container {
      background: var(--bg-sidebar);
      border-radius: 16px 0 0 16px;
      box-shadow: var(--shadow-lg);
      padding: 12px;
      max-height: 80vh;
      overflow: hidden;
      width: 40px;
      transition: all 0.25s ease;
    }
    .sidebar:hover .toc-container {
      width: 260px;
      padding: 16px;
      overflow-y: auto;
      border-radius: 16px;
      right: 10px;
    }
    .toc-container::-webkit-scrollbar { width: 3px; }
    .toc-container::-webkit-scrollbar-track { background: transparent; }
    .toc-container::-webkit-scrollbar-thumb { background: var(--border-medium); border-radius: 3px; }
    .toc-title {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-tertiary);
      margin-bottom: 16px;
      text-transform: uppercase;
      letter-spacing: 1px;
      white-space: nowrap;
      writing-mode: vertical-rl;
      transition: all 0.25s ease;
    }
    .sidebar:hover .toc-title { writing-mode: horizontal-tb; }
    .toc-nav { opacity: 0; transition: opacity 0.2s ease; }
    .sidebar:hover .toc-nav { opacity: 1; }
    .toc-item {
      display: block;
      color: var(--text-secondary);
      text-decoration: none;
      padding: 6px 12px;
      margin: 2px 4px;
      border-radius: 6px;
      font-size: 13px;
      line-height: 1.4;
      border-left: 2px solid transparent;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .toc-item:hover { color: var(--link-color); border-left-color: var(--border-medium); background: var(--link-hover-bg); }
    .toc-item.active { color: var(--link-color); border-left-color: var(--link-color); background: var(--link-active-bg); }
    .toc-item[data-level="0"] { padding-left: 12px; font-weight: 600; color: var(--text-primary); }
    .toc-item[data-level="1"] { padding-left: 24px; }
    .toc-item[data-level="2"] { padding-left: 36px; font-size: 12px; color: var(--text-tertiary); }
    .toc-item[data-level="3"] { padding-left: 48px; font-size: 12px; color: var(--text-tertiary); }
    .toc-empty { color: var(--text-tertiary); font-size: 13px; font-style: italic; }
    ${themeToggleStyles}
    ${sharedContentStyles}
    .content h1, .content h2, .content h3, .content h4 { scroll-margin-top: 20px; }
    .frontmatter {
      background: var(--fm-bg);
      border: 1px solid var(--fm-border);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 24px;
      font-size: 13px;
    }
    .fm-item {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px 16px;
      padding: 8px 0;
      border-bottom: 1px solid var(--fm-border);
      align-items: baseline;
    }
    .fm-item:last-child { border-bottom: none; }
    .fm-key { color: var(--fm-key); font-weight: 500; font-size: 12px; white-space: nowrap; }
    .fm-value { color: var(--fm-value); line-height: 1.5; word-break: break-word; }
    .fm-tags { display: flex; flex-wrap: wrap; gap: 6px; }
    .fm-code {
      display: inline-block;
      background: var(--fm-code-bg);
      color: var(--fm-code-color);
      padding: 2px 8px;
      border-radius: 4px;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 11px;
    }
    .fm-bool { display: inline-block; padding: 2px 10px; border-radius: 4px; font-weight: 500; font-size: 11px; }
    .fm-true { background: #dcfce7; color: #166534; }
    .fm-false { background: #fee2e2; color: #991b1b; }
    .left-nav { position: fixed; left: 0; top: 70px; z-index: 50; }
    .left-nav-container {
      background: var(--bg-sidebar);
      border-radius: 0 16px 16px 0;
      box-shadow: var(--shadow-lg);
      padding: 12px;
      width: 40px;
      overflow: hidden;
      transition: all 0.25s ease;
    }
    .left-nav:hover .left-nav-container { width: 260px; padding: 16px; border-radius: 16px; left: 10px; }
    .nav-hint {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-secondary);
      font-size: 18px;
      margin: 0 auto 6px;
      flex-shrink: 0;
      transition: opacity 0.2s ease;
      user-select: none;
    }
    .left-nav:hover .nav-hint { opacity: 0; pointer-events: none; }
    .nav-breadcrumb {
      display: flex;
      align-items: center;
      flex-wrap: nowrap;
      gap: 2px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 10px;
      opacity: 0;
      transition: opacity 0.2s ease;
      overflow: hidden;
      min-height: 28px;
    }
    .left-nav:hover .nav-breadcrumb { opacity: 1; }
    .nav-bc-item {
      font-size: 12px;
      white-space: nowrap;
      color: var(--text-secondary);
      border: none;
      background: none;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
      text-decoration: none;
      line-height: 1.4;
      flex-shrink: 0;
    }
    .nav-bc-item:hover { color: var(--link-color); background: var(--link-hover-bg); }
    .nav-bc-current { color: var(--text-primary) !important; font-weight: 600; cursor: default; }
    .nav-bc-current:hover { background: none !important; }
    .nav-bc-sep { color: var(--text-tertiary); font-size: 12px; flex-shrink: 0; padding: 0 1px; }
    .file-path {
      font-size: 13px;
      color: var(--text-primary);
      font-weight: 500;
      line-height: 1.4;
      opacity: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: opacity 0.2s ease;
      margin-bottom: 4px;
    }
    .left-nav:hover .file-path { opacity: 1; }
    .file-nav {
      opacity: 0;
      transition: opacity 0.2s ease;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--border-color);
      max-height: 60vh;
      overflow-y: auto;
      overflow-x: hidden;
    }
    .left-nav:hover .file-nav { opacity: 1; }
    .file-nav::-webkit-scrollbar { width: 3px; }
    .file-nav::-webkit-scrollbar-track { background: transparent; }
    .file-nav::-webkit-scrollbar-thumb { background: var(--border-medium); border-radius: 3px; }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px;
      border-radius: 4px;
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
      text-decoration: none;
      color: var(--text-primary);
      border: none;
      background: none;
      width: 100%;
      text-align: left;
      margin-bottom: 2px;
    }
    .nav-item:hover { background: var(--link-hover-bg); color: var(--link-color); }
    .nav-item.active { background: var(--link-active-bg); color: var(--link-color); font-weight: 500; }
    .nav-item-icon { flex-shrink: 0; font-size: 14px; }
    .nav-item-name { overflow: hidden; text-overflow: ellipsis; }
    ${editorLinkStyles}
    @media (max-width: 1200px) { .sidebar, .left-nav { display: none; } }
  </style>
</head>
<body>
  <aside class="left-nav">
    <div class="left-nav-container">
      <div class="nav-hint">←</div>
      <nav class="nav-breadcrumb" id="nav-breadcrumb"></nav>
      <div class="file-path">${navInfo.filename}</div>
      <div class="file-nav" id="file-nav"></div>
    </div>
  </aside>
  <script>window.__allFiles=${JSON.stringify(allFiles ?? [])};</script>
  <div class="page-layout">
    <div class="main-content">
      <div class="content"${filePath ? ` data-file-path="${filePath}"` : ''}>${mainContent}</div>
    </div>
    <aside class="sidebar">
      <div class="toc-container">
        <div class="toc-title">目录</div>
        <nav class="toc-nav">
          ${tocHtml}
        </nav>
      </div>
    </aside>
  </div>
  ${statusDotHtml}
  ${hmrScript}
  ${tocScript}
  ${filePath ? editorLinkScript : ''}
  ${themeScript}
  <script>
  (function(){
    var nav = document.getElementById('file-nav');
    if (!nav || !window.__allFiles || !window.__allFiles.length) return;

    var currentPath = location.pathname.replace(/^\\/view\\//, '');
    try { currentPath = decodeURIComponent(currentPath); } catch(e) {}

    var currentDir = currentPath.lastIndexOf('/') > -1
      ? currentPath.substring(0, currentPath.lastIndexOf('/'))
      : '';

    function getEntries(dir) {
      var folders = {};
      var files = [];
      var prefix = dir ? dir + '/' : '';
      for (var i = 0; i < window.__allFiles.length; i++) {
        var f = window.__allFiles[i];
        if (prefix && f.indexOf(prefix) !== 0) continue;
        if (!prefix && f === f) { /* root: all files */ }
        var rest = prefix ? f.substring(prefix.length) : f;
        var slashIdx = rest.indexOf('/');
        if (slashIdx > -1) {
          var folderName = rest.substring(0, slashIdx);
          if (!folders[folderName]) folders[folderName] = true;
        } else {
          files.push({ name: rest, path: f });
        }
      }
      var sortedFolders = Object.keys(folders).sort();
      files.sort(function(a, b) { return a.name.localeCompare(b.name); });
      return { folders: sortedFolders, files: files };
    }

    function renderBreadcrumb(dir) {
      var bc = document.getElementById('nav-breadcrumb');
      if (!bc) return;
      var parts = dir ? dir.split('/') : [];
      var html = '<a href="/" class="nav-bc-item">首页</a>';
      for (var i = 0; i < parts.length; i++) {
        var segDir = parts.slice(0, i + 1).join('/');
        var isLast = i === parts.length - 1;
        html += '<span class="nav-bc-sep">/</span>';
        if (isLast) {
          html += '<span class="nav-bc-item nav-bc-current">' + parts[i] + '</span>';
        } else {
          html += '<button class="nav-bc-item" data-dir="' + segDir + '">' + parts[i] + '</button>';
        }
      }
      bc.innerHTML = html;
    }

    function render(dir) {
      renderBreadcrumb(dir);
      var entries = getEntries(dir);
      var html = '';

      for (var i = 0; i < entries.folders.length; i++) {
        var folder = entries.folders[i];
        var fullDir = dir ? dir + '/' + folder : folder;
        html += '<button class="nav-item" data-dir="' + fullDir + '">'
          + '<span class="nav-item-icon">📁</span>'
          + '<span class="nav-item-name">' + folder + '</span></button>';
      }

      for (var j = 0; j < entries.files.length; j++) {
        var file = entries.files[j];
        var isActive = file.path === currentPath ? ' active' : '';
        html += '<a class="nav-item' + isActive + '" href="/view/' + encodeURIComponent(file.path) + '">'
          + '<span class="nav-item-icon">📄</span>'
          + '<span class="nav-item-name">' + file.name + '</span></a>';
      }

      nav.innerHTML = html;
    }

    document.querySelector('.left-nav-container').addEventListener('click', function(e) {
      var btn = e.target.closest('[data-dir]');
      if (btn) {
        e.preventDefault();
        render(btn.getAttribute('data-dir'));
      }
    });

    render(currentDir);
  })();
  </script>
</body>
</html>`;
}
