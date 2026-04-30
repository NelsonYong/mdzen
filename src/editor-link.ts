import type { EditorKind } from './config.ts';

export const editorLinkStyles = `
.content [data-source-line] {
  position: relative;
}
.line-link-btn {
  position: absolute;
  left: -32px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid var(--btn-border);
  background: var(--btn-bg);
  color: var(--btn-color);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease;
  font-size: 12px;
  line-height: 1;
  padding: 0;
  z-index: 10;
}
.content [data-source-line]:hover > .line-link-btn,
.content [data-source-line]:focus-within > .line-link-btn {
  opacity: 1;
}
.line-link-btn:focus-visible {
  opacity: 1;
  outline: 2px solid var(--link-color);
  outline-offset: 1px;
}
.line-link-btn:hover {
  background: var(--btn-hover-bg);
  border-color: var(--btn-hover-border);
  color: var(--btn-hover-color);
}
`;

const EDITOR_LABELS: Record<EditorKind, string> = {
  cursor: 'Cursor',
  vscode: 'VS Code',
  idea: 'IntelliJ IDEA',
  webstorm: 'WebStorm',
  vim: 'Vim',
  none: '编辑器',
};

const EDITOR_URL_BUILDER: Record<EditorKind, string> = {
  // Each builder is a JS expression body where `path` is encodeURI'd path and `line` is the line number
  cursor: "'cursor://file/' + encodeURI(path) + ':' + line",
  vscode: "'vscode://file/' + encodeURI(path) + ':' + line",
  idea: "'idea://open?file=' + encodeURIComponent(path) + '&line=' + line",
  webstorm: "'webstorm://open?file=' + encodeURIComponent(path) + '&line=' + line",
  vim: "'vim://' + encodeURI(path) + ':' + line",
  none: "''",
};

export function buildEditorLinkScript(editor: EditorKind): string {
  if (editor === 'none') return '';
  const label = EDITOR_LABELS[editor];
  const builder = EDITOR_URL_BUILDER[editor];

  return `
<script>
(function() {
  function buildUrl(path, line) {
    return ${builder};
  }

  function injectEditorButtons() {
    var contentEl = document.querySelector('.content');
    if (!contentEl) return;
    var filePath = contentEl.getAttribute('data-file-path');
    if (!filePath) return;

    contentEl.querySelectorAll('.line-link-btn').forEach(function(btn) { btn.remove(); });

    // Skip mermaid blocks — injecting a button inside would pollute mermaid.run()'s textContent read.
    contentEl.querySelectorAll('[data-source-line]:not(.mermaid):not([data-mermaid-source])').forEach(function(el) {
      var line = el.getAttribute('data-source-line');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'line-link-btn';
      btn.title = '在 ${label} 中打开 (行 ' + line + ')';
      btn.setAttribute('aria-label', '在 ${label} 中打开第 ' + line + ' 行');
      btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var url = buildUrl(filePath, line);
        if (url) window.open(url, '_self');
      });
      el.insertBefore(btn, el.firstChild);
    });
  }

  injectEditorButtons();
  window.__injectEditorButtons = injectEditorButtons;
})();
</script>`;
}

// Backward-compat default — preserved for templates that import editorLinkScript directly
export const editorLinkScript = buildEditorLinkScript('cursor');
