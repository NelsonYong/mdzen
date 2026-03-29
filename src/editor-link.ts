/** CSS styles for the editor line-link button */
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
.content [data-source-line]:hover > .line-link-btn {
  opacity: 1;
}
.line-link-btn:hover {
  background: var(--btn-hover-bg);
  border-color: var(--btn-hover-border);
  color: var(--btn-hover-color);
}
`;

/** Client-side script that injects editor link buttons and handles clicks */
export const editorLinkScript = `
<script>
(function() {
  function injectEditorButtons() {
    var contentEl = document.querySelector('.content');
    if (!contentEl) return;
    var filePath = contentEl.getAttribute('data-file-path');
    if (!filePath) return;

    // Remove existing buttons (for HMR re-injection)
    contentEl.querySelectorAll('.line-link-btn').forEach(function(btn) { btn.remove(); });

    contentEl.querySelectorAll('[data-source-line]').forEach(function(el) {
      var line = el.getAttribute('data-source-line');
      var btn = document.createElement('button');
      btn.className = 'line-link-btn';
      btn.title = '在 Cursor 中打开 (行 ' + line + ')';
      btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        window.open('cursor://file/' + filePath + ':' + line, '_self');
      });
      el.insertBefore(btn, el.firstChild);
    });
  }

  // Initial injection
  injectEditorButtons();

  // Re-inject after HMR content updates
  window.__injectEditorButtons = injectEditorButtons;
})();
</script>
`;
