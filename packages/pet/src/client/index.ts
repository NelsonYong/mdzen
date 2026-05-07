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
import { attachMischief } from './mischief.ts';
import { peekOnLoad, attachDodgeClick } from './peek-dodge.ts';
import { ChatHost } from './chat.ts';
import { globalEmotion } from './emotion-client.ts';
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

  void globalEmotion.refresh();
  sprite.img.addEventListener('click', () => globalEmotion.emit('click'));

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

  const initialBound = computeBound({
    viewport: { w: window.innerWidth, h: window.innerHeight },
    excluded: getExcluded(),
    padding,
  });
  peekOnLoad(sprite, loop, {
    x: initialBound.x + initialBound.w * 0.9,
    y: initialBound.y + initialBound.h * 0.9,
  });

  const mischief = attachMischief({
    loop,
    sprite,
    getViewport: () => ({ w: window.innerWidth, h: window.innerHeight }),
    getExcluded,
    padding,
  });
  const dodge = attachDodgeClick(sprite, loop);

  let dragCount = 0;
  let sessionId = sessionStorage.getItem('mdzen-pet-session');
  if (!sessionId) {
    sessionId = (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `s${Date.now()}-${Math.random().toString(36).slice(2)}`);
    sessionStorage.setItem('mdzen-pet-session', sessionId);
  }
  const chat = new ChatHost({ sprite, sessionId });

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
      dragCount += 1;
      globalEmotion.emit(dragCount >= 3 ? 'drag-3plus' : 'drag-1st');
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
      chat.destroy();
      selection.destroy();
      copy.destroy();
      idle.destroy();
      ceremonial.destroy();
      mischief.destroy();
      dodge.destroy();
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
