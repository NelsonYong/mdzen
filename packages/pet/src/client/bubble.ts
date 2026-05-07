export type BubbleVariant = 'passive' | 'protest' | 'thought' | 'chat-stub';

export interface BubbleSpec {
  text: string;
  variant: BubbleVariant;
  durationMs?: number;
  onClick?: () => void;
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
  max-width: 240px;
  min-width: 32px;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: normal;
  hyphens: none;
  box-shadow: 0 6px 20px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
  text-align: left;
  position: relative;
  animation: mdzen-pet-bubble-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
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
.mdzen-pet-thought-dot {
  display: inline-block;
  width: 4px;
  height: 4px;
  margin: 0 2px;
  border-radius: 50%;
  background: #aaa;
  animation: mdzen-pet-blink 1.2s infinite ease-in-out;
}
.mdzen-pet-thought-dot:nth-child(2) { animation-delay: 0.2s; }
.mdzen-pet-thought-dot:nth-child(3) { animation-delay: 0.4s; }
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

export class BubbleHost {
  private root: HTMLDivElement;
  private current: HTMLDivElement | null = null;
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
      maxWidth: 'min(280px, calc(100vw - 32px))',
      pointerEvents: 'none',
      zIndex: '10001',
    });
    parent.appendChild(this.root);
  }

  show(spec: BubbleSpec): void {
    if (this.streaming) return;
    this.dismiss();
    this.current = this.createEl(spec.variant, spec.text, spec.onClick);
    const dur = spec.durationMs ?? defaultDuration(spec);
    this.timer = setTimeout(() => this.dismiss(), dur);
  }

  startStream(variant: BubbleVariant): StreamingBubble {
    this.dismiss();
    this.streaming = true;
    const el = this.createEl(variant, '');
    return {
      setText: (text) => {
        el.textContent = text;
      },
      finish: (durationMs) => {
        const dur = durationMs ?? Math.min(15000, Math.max(4500, (el.textContent ?? '').length * 70));
        this.timer = setTimeout(() => this.dismiss(), dur);
      },
      cancel: () => this.dismiss(),
    };
  }

  private createEl(variant: BubbleVariant, text: string, onClick?: () => void): HTMLDivElement {
    const v = STYLE_BY_VARIANT[variant];
    const el = document.createElement('div');
    el.className = `mdzen-pet-bubble ${variant === 'thought' ? 'thought' : ''}`.trim();
    el.style.background = v.bg;
    el.style.color = v.color;
    el.style.border = `1px ${v.borderStyle ?? 'solid'} ${v.border}`;
    el.style.setProperty('--mdzen-pet-bg', v.bg);
    el.style.setProperty('--mdzen-pet-border', v.border);
    el.style.pointerEvents = 'auto';
    if (v.italic) el.style.fontStyle = 'italic';
    if (v.cursor) el.style.cursor = v.cursor;
    el.textContent = text;
    if (onClick) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', onClick);
    }
    this.root.appendChild(el);
    this.current = el;
    return el;
  }

  dismiss(): void {
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.current) {
      this.current.remove();
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
  return Math.min(9000, Math.max(4500, s.text.length * 90));
}
