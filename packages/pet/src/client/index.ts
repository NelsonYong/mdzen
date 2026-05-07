import { Sprite } from './sprite.ts';
import { Loop } from './loop.ts';
import type { Rect } from './boundary.ts';

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

  window.__mdzenPet = {
    stop: () => {
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
