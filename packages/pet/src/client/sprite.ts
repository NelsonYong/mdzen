import type { FsmState } from '../shared/types.ts';
import { STATE_TO_GIF } from '../shared/types.ts';

const ASSETS_BASE = '/api/pet/assets/';

export interface SpriteOptions {
  size: number;
  zIndex: number;
  initialState: FsmState;
}

export class Sprite {
  readonly el: HTMLDivElement;
  private img: HTMLImageElement;
  private state: FsmState;
  private facing: 'left' | 'right' = 'right';

  constructor(opts: SpriteOptions) {
    this.state = opts.initialState;
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: `${opts.size}px`,
      height: `${opts.size}px`,
      zIndex: String(opts.zIndex),
      pointerEvents: 'none',
      transform: 'translate(0, 0)',
      willChange: 'transform',
      userSelect: 'none',
    });
    this.img = document.createElement('img');
    Object.assign(this.img.style, {
      width: '100%',
      height: '100%',
      pointerEvents: 'auto',
      cursor: 'pointer',
    });
    this.img.src = ASSETS_BASE + STATE_TO_GIF[this.state];
    this.img.alt = 'pet';
    this.img.draggable = false;
    this.el.appendChild(this.img);
  }

  setState(s: FsmState): void {
    if (s === this.state) return;
    this.state = s;
    this.img.src = ASSETS_BASE + STATE_TO_GIF[s];
  }

  setPosition(x: number, y: number): void {
    this.el.style.transform = `translate(${x}px, ${y}px)`;
  }

  setFacing(f: 'left' | 'right'): void {
    if (f === this.facing) return;
    this.facing = f;
  }

  destroy(): void {
    this.el.remove();
  }
}
