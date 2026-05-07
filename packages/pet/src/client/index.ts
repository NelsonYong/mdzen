import { Sprite } from './sprite.ts';
import { Loop } from './loop.ts';
import { attachDrag } from './drag.ts';
import { BubbleHost } from './bubble.ts';
import { CooldownGate } from './cooldown.ts';
import { pickPreset } from './presets.ts';
import { attachSelection } from './triggers/selection.ts';
import { attachCopy } from './triggers/copy.ts';
import { attachIdle } from './triggers/idle.ts';
import { attachCeremonial } from './triggers/ceremonial.ts';
import { clampPoint, computeBound, type Rect } from './boundary.ts';

declare global {
  interface Window {
    __mdzenPet?: { stop: () => void };
    __MDZEN_PET_CONFIG__?: {
      excludeSelectors?: string[];
      padding?: number;
    };
  }
}

function start(): void {
  if (window.__mdzenPet) return;

  const sprite = new Sprite({ size: 72, zIndex: 9999, initialState: 'idle' });
  document.body.appendChild(sprite.el);
  const bubble = new BubbleHost(sprite.el);

  const config = window.__MDZEN_PET_CONFIG__ ?? {};
  const excludeSelectors: string[] = config.excludeSelectors ?? [
    '.toc-sidebar',
    '.file-nav',
    '.preview-toc',
    '.preview-nav',
  ];
  const padding: number = config.padding ?? 24;

  const getExcluded = (): Rect[] => {
    const out: Rect[] = [];
    for (const sel of excludeSelectors) {
      document.querySelectorAll(sel).forEach((node) => {
        const r = (node as HTMLElement).getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          out.push({ x: r.left, y: r.top, w: r.width, h: r.height });
        }
      });
    }
    return out;
  };

  const loop = new Loop({
    sprite,
    getViewport: () => ({ w: window.innerWidth, h: window.innerHeight }),
    getExcluded,
    padding,
  });
  loop.start();

  const gate = new CooldownGate({ globalMs: 30_000 });
  const selection = attachSelection(bubble, gate);
  const copy = attachCopy(bubble, gate);
  const idle = attachIdle(bubble, gate);
  const ceremonial = attachCeremonial(bubble, gate, sprite);

  const drag = attachDrag({
    trigger: sprite.img,
    onDragStart: () => {
      loop.freeze();
      sprite.setState('waiting');
      bubble.show({ text: pickPreset('protest'), variant: 'protest' });
    },
    onDragMove: (x, y) => {
      const bound = computeBound({
        viewport: { w: window.innerWidth, h: window.innerHeight },
        excluded: getExcluded(),
        padding,
      });
      const clamped = clampPoint({ x, y }, bound);
      sprite.setPosition(clamped.x, clamped.y);
      loop.setPosition(clamped.x, clamped.y);
    },
    onDragEnd: () => {
      sprite.setState('jumping');
      loop.unfreeze();
    },
  });

  window.__mdzenPet = {
    stop: () => {
      selection.destroy();
      copy.destroy();
      idle.destroy();
      ceremonial.destroy();
      drag.destroy();
      bubble.destroy();
      loop.stop();
      sprite.destroy();
      window.__mdzenPet = undefined;
    },
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
