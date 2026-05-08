import type { FsmState } from '../shared/types.ts';
import {
  CORE_ANIMATIONS,
  createAnimationRegistry,
  resolveAssetUrl,
  type AnimationDef,
  type AnimationRegistry,
} from '../shared/animations.ts';

const DEFAULT_ASSETS_BASE = '/api/pet/assets/';

export interface SpriteOptions {
  size: number;
  zIndex: number;
  initialState: FsmState;
  /** When false, the gif is hidden; the anchor el still exists for bubble positioning. */
  visible?: boolean;
  /** Override the assets URL prefix. Default: '/api/pet/assets/'. */
  assetsBase?: string;
  /** Animation registry. Default: core animations only. */
  registry?: AnimationRegistry;
}

export class Sprite {
  readonly el: HTMLDivElement;
  readonly img: HTMLImageElement;
  private currentId: string;
  private facing: 'left' | 'right' = 'right';
  private assetsBase: string;
  private registry: AnimationRegistry;

  constructor(opts: SpriteOptions) {
    this.currentId = opts.initialState;
    this.assetsBase = opts.assetsBase ?? DEFAULT_ASSETS_BASE;
    this.registry = opts.registry ?? createAnimationRegistry();
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
      display: opts.visible === false ? 'none' : 'block',
    });
    const initial = this.registry.byId(this.currentId) ?? CORE_ANIMATIONS[0]!;
    this.img.src = resolveAssetUrl(initial as AnimationDef, this.assetsBase);
    this.img.alt = 'pet';
    this.img.draggable = false;
    this.el.appendChild(this.img);
  }

  /**
   * Switch to an animation by id. Validates against the registry — unknown ids are no-ops,
   * which keeps stray LLM action picks from breaking the UI.
   */
  setAnimation(id: string): void {
    if (id === this.currentId) return;
    const def = this.registry.byId(id);
    if (!def) return;
    this.currentId = id;
    this.img.src = resolveAssetUrl(def, this.assetsBase);
  }

  /** Legacy alias retained so existing FsmState call sites keep working. */
  setState(s: FsmState): void {
    this.setAnimation(s);
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
