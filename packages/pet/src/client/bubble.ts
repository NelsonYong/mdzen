export type BubbleVariant = 'passive' | 'protest' | 'thought' | 'chat-stub';

export interface BubbleSpec {
  text: string;
  variant: BubbleVariant;
  durationMs?: number;
  onClick?: () => void;
}

const STYLE_BY_VARIANT: Record<BubbleVariant, Partial<CSSStyleDeclaration>> = {
  passive: { background: '#fff', border: '1px solid #ddd', color: '#333' },
  protest: { background: '#ffe8e8', border: '1px solid #d05b5b', color: '#a14747' },
  thought: { background: '#f5f5f5', border: '1px dashed #bbb', color: '#666', fontStyle: 'italic' },
  'chat-stub': { background: '#fff', border: '1px solid #d06b9a', color: '#333', cursor: 'pointer' },
};

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
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'absolute',
      left: '50%',
      top: '-8px',
      transform: 'translate(-50%, -100%)',
      pointerEvents: 'auto',
      zIndex: '1',
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
        const dur = durationMs ?? Math.min(15000, Math.max(4000, (el.textContent ?? '').length * 60));
        this.timer = setTimeout(() => this.dismiss(), dur);
      },
      cancel: () => this.dismiss(),
    };
  }

  private createEl(variant: BubbleVariant, text: string, onClick?: () => void): HTMLDivElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      padding: '6px 10px',
      borderRadius: '12px',
      fontSize: '12px',
      lineHeight: '1.4',
      maxWidth: '220px',
      whiteSpace: 'normal',
      wordBreak: 'break-word',
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      ...STYLE_BY_VARIANT[variant],
    });
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
  return Math.min(8000, Math.max(4000, s.text.length * 120));
}
