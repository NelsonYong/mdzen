import { renderMarkdownTiny } from './markdown-tiny.ts';

export type BubbleVariant = 'passive' | 'protest' | 'thought' | 'chat-stub';

export interface BubbleSpec {
  text: string;
  variant: BubbleVariant;
  durationMs?: number;
  onClick?: () => void;
  /** When provided on a streaming-capable variant, shows a "📜" pill that opens the reader. */
  onExpand?: () => void;
}

interface VariantStyle {
  bg: string;
  border: string;
  color: string;
  italic?: boolean;
  cursor?: 'pointer';
  borderStyle?: 'solid' | 'dashed';
}

const STYLE_BY_VARIANT: Record<BubbleVariant, VariantStyle> = {
  passive:    { bg: '#ffffff', border: '#e5e5e5', color: '#222', borderStyle: 'solid' },
  protest:    { bg: '#fff0f0', border: '#d05b5b', color: '#8c2e2e', borderStyle: 'solid' },
  thought:    { bg: '#f7f7f7', border: '#cbcbcb', color: '#666', italic: true, borderStyle: 'dashed' },
  'chat-stub':{ bg: '#ffffff', border: '#d06b9a', color: '#333', cursor: 'pointer', borderStyle: 'solid' },
};

const STYLE_ID = 'mdzen-pet-bubble-styles';
function ensureStylesheet(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
@keyframes mdzen-pet-bubble-in {
  from { opacity: 0; transform: translateY(4px) scale(0.94); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.mdzen-pet-bubble {
  display: inline-block;
  padding: 8px 12px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.55;
  max-width: 320px;
  min-width: 32px;
  max-height: min(45vh, 360px);
  overflow-y: auto;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: normal;
  hyphens: none;
  box-shadow: 0 6px 20px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
  text-align: left;
  position: relative;
  animation: mdzen-pet-bubble-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
  scrollbar-width: thin;
  scrollbar-color: rgba(0,0,0,0.2) transparent;
}
.mdzen-pet-bubble::-webkit-scrollbar { width: 6px; }
.mdzen-pet-bubble::-webkit-scrollbar-thumb {
  background: rgba(0,0,0,0.18); border-radius: 3px;
}
.mdzen-pet-bubble.has-expand { padding-right: 38px; }
.mdzen-pet-bubble::before,
.mdzen-pet-bubble::after {
  content: '';
  position: absolute;
  left: 50%;
  width: 0;
  height: 0;
  pointer-events: none;
}
.mdzen-pet-bubble::before {
  bottom: -8px;
  margin-left: -8px;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 8px solid var(--mdzen-pet-border, #e5e5e5);
}
.mdzen-pet-bubble::after {
  bottom: -6px;
  margin-left: -7px;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-top: 7px solid var(--mdzen-pet-bg, #ffffff);
}
.mdzen-pet-bubble.thought::before,
.mdzen-pet-bubble.thought::after {
  display: none;
}
.mdzen-pet-bubble.thought {
  border-radius: 18px 18px 18px 6px;
}
.mdzen-pet-bubble-content {
  white-space: pre-wrap;
}
.mdzen-pet-bubble-content > *:first-child { margin-top: 0; }
.mdzen-pet-bubble-content > *:last-child { margin-bottom: 0; }
.mdzen-pet-bubble-content p { margin: 0.3em 0; }
.mdzen-pet-bubble-content h1,
.mdzen-pet-bubble-content h2,
.mdzen-pet-bubble-content h3 {
  font-size: 13px; font-weight: 600; margin: 0.5em 0 0.2em;
}
.mdzen-pet-bubble-content ul,
.mdzen-pet-bubble-content ol { padding-left: 1.2em; margin: 0.25em 0; }
.mdzen-pet-bubble-content li { margin: 0.1em 0; }
.mdzen-pet-bubble-content blockquote {
  margin: 0.3em 0;
  padding: 0.1em 0.6em;
  border-left: 2px solid rgba(0,0,0,0.12);
  color: #555;
  font-style: italic;
}
.mdzen-pet-bubble-content code.mdzen-md-ic {
  background: rgba(0,0,0,0.06);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 11.5px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
}
.mdzen-pet-bubble-content pre.mdzen-md-code {
  background: rgba(0,0,0,0.85);
  color: #f0e8db;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 11.5px;
  overflow-x: auto;
  margin: 0.4em 0;
}
.mdzen-pet-bubble-content hr {
  border: none;
  border-top: 1px dashed rgba(0,0,0,0.18);
  margin: 0.6em 0;
}
.mdzen-pet-bubble-expand {
  position: sticky;
  float: right;
  top: 0;
  margin-right: -28px;
  margin-top: -2px;
  width: 26px; height: 26px;
  background: rgba(255,255,255,0.85);
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  font-size: 12px;
  color: #555;
  transition: transform 120ms ease, background 120ms ease;
  z-index: 1;
}
.mdzen-pet-bubble-expand:hover {
  transform: scale(1.08);
  background: #fff;
}
.mdzen-pet-thought-dots {
  display: inline-flex; gap: 3px; align-items: center;
}
.mdzen-pet-thought-dots span {
  width: 4px; height: 4px; border-radius: 50%;
  background: #aaa;
  animation: mdzen-pet-blink 1.2s infinite ease-in-out;
}
.mdzen-pet-thought-dots span:nth-child(2) { animation-delay: 0.2s; }
.mdzen-pet-thought-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes mdzen-pet-blink {
  0%, 70%, 100% { opacity: 0.25; transform: scale(0.85); }
  35% { opacity: 1; transform: scale(1); }
}
`;
  document.head.appendChild(style);
}

export interface StreamingBubble {
  setText(text: string): void;
  finish(durationMs?: number): void;
  cancel(): void;
}

interface BubbleEntry {
  el: HTMLDivElement;
  content: HTMLDivElement;
  pinScroll: boolean;
}

export class BubbleHost {
  private root: HTMLDivElement;
  private current: BubbleEntry | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private streaming = false;

  constructor(parent: HTMLElement) {
    ensureStylesheet();
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'absolute',
      left: '50%',
      bottom: 'calc(100% + 12px)',
      transform: 'translateX(-50%)',
      width: 'max-content',
      maxWidth: 'min(360px, calc(100vw - 32px))',
      pointerEvents: 'none',
      zIndex: '10001',
    });
    parent.appendChild(this.root);
  }

  show(spec: BubbleSpec): void {
    if (this.streaming) return;
    this.dismiss();
    this.current = this.createEl(spec.variant, spec.text, {
      onClick: spec.onClick,
      onExpand: spec.onExpand,
      asMarkdown: spec.variant === 'passive',
    });
    const dur = spec.durationMs ?? defaultDuration(spec);
    this.timer = setTimeout(() => this.dismiss(), dur);
  }

  startStream(variant: BubbleVariant, opts?: { onExpand?: () => void }): StreamingBubble {
    this.dismiss();
    this.streaming = true;
    const entry = this.createEl(variant, '', {
      onExpand: opts?.onExpand,
      asMarkdown: true,
    });
    return {
      setText: (text) => {
        entry.content.innerHTML = renderMarkdownTiny(text);
        if (entry.pinScroll) {
          entry.el.scrollTop = entry.el.scrollHeight;
        }
      },
      finish: (durationMs) => {
        const len = (entry.content.textContent ?? '').length;
        const dur = durationMs ?? Math.min(20000, Math.max(5000, len * 65));
        this.timer = setTimeout(() => this.dismiss(), dur);
      },
      cancel: () => this.dismiss(),
    };
  }

  private createEl(
    variant: BubbleVariant,
    text: string,
    opts: { onClick?: () => void; onExpand?: () => void; asMarkdown?: boolean },
  ): BubbleEntry {
    const v = STYLE_BY_VARIANT[variant];
    const el = document.createElement('div');
    el.className = `mdzen-pet-bubble ${variant === 'thought' ? 'thought' : ''}`.trim();
    if (opts.onExpand) el.classList.add('has-expand');
    el.style.background = v.bg;
    el.style.color = v.color;
    el.style.border = `1px ${v.borderStyle ?? 'solid'} ${v.border}`;
    el.style.setProperty('--mdzen-pet-bg', v.bg);
    el.style.setProperty('--mdzen-pet-border', v.border);
    el.style.pointerEvents = 'auto';
    if (v.italic) el.style.fontStyle = 'italic';
    if (v.cursor) el.style.cursor = v.cursor;

    if (opts.onExpand) {
      const pill = document.createElement('button');
      pill.className = 'mdzen-pet-bubble-expand';
      pill.title = '展开成卷轴';
      pill.setAttribute('aria-label', 'expand');
      pill.textContent = '📜';
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onExpand!();
      });
      el.appendChild(pill);
    }

    const content = document.createElement('div');
    content.className = 'mdzen-pet-bubble-content';
    if (opts.asMarkdown) {
      content.innerHTML = renderMarkdownTiny(text);
    } else {
      content.textContent = text;
    }
    el.appendChild(content);

    if (opts.onClick) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', opts.onClick);
    }
    this.root.appendChild(el);

    // Auto-pin to bottom on user-not-scrolled-up; if user scrolls up, release pin.
    let pinScroll = true;
    el.addEventListener('scroll', () => {
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
      pinScroll = atBottom;
    });
    const entry: BubbleEntry = { el, content, pinScroll: true };
    Object.defineProperty(entry, 'pinScroll', {
      get: () => pinScroll,
    });

    this.current = entry;
    return entry;
  }

  dismiss(): void {
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.current) {
      this.current.el.remove();
      this.current = null;
    }
    this.streaming = false;
  }

  destroy(): void {
    this.dismiss();
    this.root.remove();
  }
}

function defaultDuration(s: BubbleSpec): number {
  if (s.variant === 'protest') return 3000;
  if (s.variant === 'thought') return 6000;
  if (s.variant === 'chat-stub') return 8000;
  return Math.min(12000, Math.max(5000, s.text.length * 90));
}
