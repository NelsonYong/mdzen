export interface InputBarOptions {
  placeholder?: string;
  onSubmit: (text: string) => void;
}

export class InputBar {
  private root: HTMLDivElement;
  private input: HTMLInputElement;
  private isOpen = false;
  private opts: InputBarOptions;

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
      gap: '10px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px',
      opacity: '0',
      pointerEvents: 'none',
      transition: 'opacity 180ms ease, transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
    });

    const star = document.createElement('div');
    star.textContent = '🐾';
    Object.assign(star.style, { fontSize: '18px', flexShrink: '0' });

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

    const send = document.createElement('button');
    send.setAttribute('aria-label', 'send');
    send.textContent = '↑';
    Object.assign(send.style, {
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
      transition: 'background 120ms ease',
    });

    this.root.appendChild(star);
    this.root.appendChild(this.input);
    this.root.appendChild(send);
    document.body.appendChild(this.root);

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submit();
      } else if (e.key === 'Escape') {
        this.close();
      }
    });
    send.addEventListener('click', () => this.submit());

    document.addEventListener('mousedown', this.handleOutsideClick);
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
    requestAnimationFrame(() => this.input.focus());
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
    document.removeEventListener('mousedown', this.handleOutsideClick);
    this.root.remove();
  }
}
