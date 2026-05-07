import { renderMarkdownTiny } from './markdown-tiny.ts';

const STYLE_ID = 'mdzen-pet-reader-styles';

function ensureStylesheet(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.mdzen-pet-reader-overlay {
  position: fixed; inset: 0;
  background: rgba(20, 16, 12, 0.18);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  z-index: 19998;
  opacity: 0;
  transition: opacity 220ms ease;
}
.mdzen-pet-reader-overlay.open { opacity: 1; }

.mdzen-pet-reader-panel {
  position: fixed; right: 0; top: 0; bottom: 0;
  width: min(440px, 92vw);
  background:
    linear-gradient(180deg, rgba(255,253,247,0.98) 0%, rgba(252,247,236,0.98) 100%);
  box-shadow: -16px 0 48px rgba(60,30,20,0.18);
  z-index: 19999;
  display: flex; flex-direction: column;
  transform: translateX(100%);
  transition: transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Songti SC", "Noto Serif", serif;
}
.mdzen-pet-reader-panel.open { transform: translateX(0); }

.mdzen-pet-reader-header {
  padding: 22px 28px 12px;
  display: flex; justify-content: space-between; align-items: baseline;
  border-bottom: 1px dashed rgba(180, 140, 110, 0.28);
}
.mdzen-pet-reader-title {
  font-size: 12px; letter-spacing: 0.18em; color: #b08562;
  text-transform: uppercase;
}
.mdzen-pet-reader-close {
  width: 28px; height: 28px;
  border: none; background: transparent;
  font-size: 18px; line-height: 1; cursor: pointer; color: #8a6948;
}
.mdzen-pet-reader-close:hover { color: #4d3a28; }

.mdzen-pet-reader-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px 48px;
  font-size: 14.5px;
  line-height: 1.85;
  color: #2c2218;
}

.mdzen-pet-reader-content h1,
.mdzen-pet-reader-content h2,
.mdzen-pet-reader-content h3 {
  font-weight: 600;
  color: #3d2c1c;
  margin: 1.4em 0 0.4em;
  line-height: 1.3;
}
.mdzen-pet-reader-content h1 { font-size: 18px; }
.mdzen-pet-reader-content h2 { font-size: 16px; }
.mdzen-pet-reader-content h3 { font-size: 14.5px; }
.mdzen-pet-reader-content p { margin: 0.5em 0; }
.mdzen-pet-reader-content ul,
.mdzen-pet-reader-content ol { padding-left: 1.4em; margin: 0.4em 0; }
.mdzen-pet-reader-content li { margin: 0.15em 0; }
.mdzen-pet-reader-content blockquote {
  margin: 0.6em 0;
  padding: 0.4em 0.9em;
  border-left: 3px solid rgba(180, 140, 110, 0.5);
  background: rgba(245, 235, 220, 0.4);
  color: #5a4530;
  font-style: italic;
}
.mdzen-pet-reader-content code.mdzen-md-ic {
  background: rgba(190, 145, 110, 0.14);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12.5px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  color: #6d4a2e;
}
.mdzen-pet-reader-content pre.mdzen-md-code {
  background: #2a2018;
  color: #f6e7d3;
  padding: 14px 16px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 12.5px;
  line-height: 1.55;
  margin: 0.7em 0;
}
.mdzen-pet-reader-content hr {
  border: none;
  border-top: 1px dashed rgba(180, 140, 110, 0.3);
  margin: 1.6em 0;
}
.mdzen-pet-reader-content::-webkit-scrollbar { width: 8px; }
.mdzen-pet-reader-content::-webkit-scrollbar-thumb {
  background: rgba(180, 140, 110, 0.35); border-radius: 4px;
}
`;
  document.head.appendChild(style);
}

export interface ReaderHandle {
  setText(text: string): void;
  close(): void;
}

export function showReaderPanel(initialText: string, opts?: { title?: string }): ReaderHandle {
  ensureStylesheet();

  const overlay = document.createElement('div');
  overlay.className = 'mdzen-pet-reader-overlay';

  const panel = document.createElement('div');
  panel.className = 'mdzen-pet-reader-panel';

  const header = document.createElement('div');
  header.className = 'mdzen-pet-reader-header';
  const title = document.createElement('div');
  title.className = 'mdzen-pet-reader-title';
  title.textContent = opts?.title ?? '· 卷轴 · ';
  const close = document.createElement('button');
  close.className = 'mdzen-pet-reader-close';
  close.setAttribute('aria-label', 'close');
  close.textContent = '×';
  header.appendChild(title);
  header.appendChild(close);

  const content = document.createElement('div');
  content.className = 'mdzen-pet-reader-content';
  content.innerHTML = renderMarkdownTiny(initialText);

  panel.appendChild(header);
  panel.appendChild(content);
  document.body.appendChild(overlay);
  document.body.appendChild(panel);

  requestAnimationFrame(() => {
    overlay.classList.add('open');
    panel.classList.add('open');
  });

  const dismiss = (): void => {
    overlay.classList.remove('open');
    panel.classList.remove('open');
    setTimeout(() => {
      overlay.remove();
      panel.remove();
    }, 320);
  };
  close.addEventListener('click', dismiss);
  overlay.addEventListener('click', dismiss);
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', onKey);
      dismiss();
    }
  };
  document.addEventListener('keydown', onKey);

  return {
    setText(text) {
      content.innerHTML = renderMarkdownTiny(text);
    },
    close: dismiss,
  };
}
