import { globalBusy } from './busy.ts';

export interface InputBarOptions {
  placeholder?: string;
  onSubmit: (text: string) => void;
  onOpenHistory: () => void;
}

export class InputBar {
  private root: HTMLDivElement;
  private input: HTMLInputElement;
  private send: HTMLButtonElement;
  private history: HTMLButtonElement;
  private isOpen = false;
  private opts: InputBarOptions;
  private unsubscribeBusy: () => void;

  constructor(opts: InputBarOptions) {
    this.opts = opts;
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      left: '50%',
      bottom: '32px',
      transform: 'translate(-50%, 100px)',
      zIndex: '10000',
      width: 'min(640px, calc(100vw - 32px))',
      background: '#2c2c2c',
      color: '#f5f5f5',
      borderRadius: '14px',
      boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
      padding: '10px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif',
      fontSize: '13px',
      opacity: '0',
      pointerEvents: 'none',
      transition: 'opacity 180ms ease, transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
    });

    const star = document.createElement('div');
    star.textContent = '🐾';
    Object.assign(star.style, { fontSize: '18px', flexShrink: '0' });

    this.history = makeIconButton('📜', '查看历史');
    this.history.addEventListener('click', () => this.opts.onOpenHistory());

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = opts.placeholder ?? '问我点什么...';
    Object.assign(this.input.style, {
      flex: '1',
      background: 'transparent',
      color: 'inherit',
      border: 'none',
      outline: 'none',
      fontSize: '14px',
      fontFamily: 'inherit',
      padding: '6px 4px',
    });

    this.send = document.createElement('button');
    this.send.setAttribute('aria-label', 'send');
    this.send.textContent = '↑';
    Object.assign(this.send.style, {
      width: '32px',
      height: '32px',
      borderRadius: '8px',
      border: 'none',
      background: '#d06b9a',
      color: '#fff',
      cursor: 'pointer',
      fontSize: '16px',
      fontWeight: 'bold',
      flexShrink: '0',
      transition: 'background 120ms ease, opacity 120ms ease',
    });

    this.root.appendChild(star);
    this.root.appendChild(this.history);
    this.root.appendChild(this.input);
    this.root.appendChild(this.send);
    document.body.appendChild(this.root);

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submit();
      } else if (e.key === 'Escape') {
        this.close();
      }
    });
    this.send.addEventListener('click', () => this.submit());

    document.addEventListener('mousedown', this.handleOutsideClick);

    this.unsubscribeBusy = globalBusy.onChange((busy) => this.applyBusy(busy));
    this.applyBusy(globalBusy.isBusy());
  }

  private applyBusy(busy: boolean): void {
    this.input.disabled = busy;
    this.send.disabled = busy;
    this.send.style.opacity = busy ? '0.45' : '1';
    this.send.style.cursor = busy ? 'not-allowed' : 'pointer';
    this.input.style.opacity = busy ? '0.6' : '1';
    this.input.placeholder = busy
      ? '她正在回应中...'
      : (this.opts.placeholder ?? '问我点什么...');
  }

  private handleOutsideClick = (e: MouseEvent): void => {
    if (!this.isOpen) return;
    const target = e.target as Node | null;
    if (target && (this.root.contains(target) || this.isPetClick(target))) return;
    this.close();
  };

  private isPetClick(target: Node): boolean {
    const petWrap = document.querySelector('img[alt="pet"]');
    return petWrap?.contains(target) ?? false;
  }

  private submit(): void {
    if (globalBusy.isBusy()) return;
    const text = this.input.value.trim();
    if (!text) return;
    this.input.value = '';
    this.opts.onSubmit(text);
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.root.style.opacity = '1';
    this.root.style.pointerEvents = 'auto';
    this.root.style.transform = 'translate(-50%, 0)';
    requestAnimationFrame(() => {
      if (!this.input.disabled) this.input.focus();
    });
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.style.opacity = '0';
    this.root.style.pointerEvents = 'none';
    this.root.style.transform = 'translate(-50%, 100px)';
    this.input.blur();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  destroy(): void {
    this.unsubscribeBusy();
    document.removeEventListener('mousedown', this.handleOutsideClick);
    this.root.remove();
  }
}

function makeIconButton(icon: string, label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.setAttribute('aria-label', label);
  b.title = label;
  b.textContent = icon;
  Object.assign(b.style, {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: 'none',
    background: 'transparent',
    color: '#cdcdcd',
    cursor: 'pointer',
    fontSize: '14px',
    flexShrink: '0',
    transition: 'background 120ms ease',
  });
  b.addEventListener('mouseenter', () => {
    b.style.background = 'rgba(255,255,255,0.08)';
  });
  b.addEventListener('mouseleave', () => {
    b.style.background = 'transparent';
  });
  return b;
}
