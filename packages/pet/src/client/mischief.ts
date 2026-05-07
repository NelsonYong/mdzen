import type { Loop } from './loop.ts';
import type { Sprite } from './sprite.ts';
import { stepToward, facingFromDelta } from './motion.ts';
import { computeBound, clampPoint, type Rect } from './boundary.ts';

const FOLLOW_PROB_PER_TICK = 0.03;
const FOLLOW_DURATION_MS = 8000;
const FOLLOW_COOLDOWN_MS = 5 * 60_000;
const POUNCE_STATIONARY_MS = 30_000;
const POUNCE_PROB_PER_TICK = 0.05;
const POUNCE_COOLDOWN_MS = 3 * 60_000;
const TICK_INTERVAL_MS = 60_000;
const SPEED = 380;
const ARRIVE_R = 32;
const FACING_HYST_MS = 200;

let cursorX = 0;
let cursorY = 0;
let lastCursorMoveAt = 0;
let cursorListenerAttached = false;
function ensureCursorListener(): void {
  if (cursorListenerAttached) return;
  cursorListenerAttached = true;
  document.addEventListener(
    'mousemove',
    (e) => {
      cursorX = e.clientX;
      cursorY = e.clientY;
      lastCursorMoveAt = performance.now();
    },
    { passive: true },
  );
}

export interface MischiefOptions {
  loop: Loop;
  sprite: Sprite;
  getViewport: () => { w: number; h: number };
  getExcluded: () => Rect[];
  padding: number;
}

export function attachMischief(opts: MischiefOptions): { destroy: () => void } {
  ensureCursorListener();

  let lastFollowAt = -Infinity;
  let lastPounceAt = -Infinity;
  let mode: 'idle' | 'follow' | 'pounce' = 'idle';
  let modeEndsAt = 0;
  let facingPrev: 'left' | 'right' = 'right';
  let lastFacingFlipAt = 0;
  let pos = { x: 0, y: 0 };

  const bound = (): Rect =>
    computeBound({
      viewport: opts.getViewport(),
      excluded: opts.getExcluded(),
      padding: opts.padding,
    });

  const tick = setInterval(() => {
    const now = performance.now();
    if (mode !== 'idle') return;

    if (now - lastFollowAt > FOLLOW_COOLDOWN_MS && Math.random() < FOLLOW_PROB_PER_TICK) {
      mode = 'follow';
      modeEndsAt = now + FOLLOW_DURATION_MS;
      lastFollowAt = now;
      pos = readPos(opts.sprite);
      opts.loop.freeze();
      return;
    }

    if (
      now - lastPounceAt > POUNCE_COOLDOWN_MS &&
      now - lastCursorMoveAt > POUNCE_STATIONARY_MS &&
      Math.random() < POUNCE_PROB_PER_TICK
    ) {
      mode = 'pounce';
      modeEndsAt = 0;
      lastPounceAt = now;
      pos = readPos(opts.sprite);
      opts.loop.freeze();
    }
  }, TICK_INTERVAL_MS);

  let last = performance.now();
  let raf = 0;
  const animate = (t: number): void => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (mode !== 'idle' && !document.hidden) {
      const r = stepToward({
        from: pos,
        to: { x: cursorX, y: cursorY },
        speedPxPerSec: SPEED,
        dtSec: dt,
        arriveRadius: ARRIVE_R,
      });
      pos = clampPoint(r.pos, bound());
      opts.sprite.setPosition(pos.x, pos.y);
      opts.loop.setPosition(pos.x, pos.y);

      const dx = cursorX - pos.x;
      if (t - lastFacingFlipAt > FACING_HYST_MS) {
        const next = facingFromDelta(dx, 4, facingPrev);
        if (next !== facingPrev) {
          facingPrev = next;
          lastFacingFlipAt = t;
        }
      }
      opts.sprite.setState(r.arrived ? 'idle' : facingPrev === 'left' ? 'walk-left' : 'walk-right');

      if (mode === 'pounce' && r.arrived) {
        opts.sprite.setState('jumping');
        const cleanupAt = t + 800;
        setTimeout(() => {
          if (performance.now() >= cleanupAt) exitMischief();
        }, 800);
        mode = 'idle';
        opts.loop.unfreeze();
      } else if (mode === 'follow' && t >= modeEndsAt) {
        exitMischief();
      }
    }
    raf = requestAnimationFrame(animate);
  };
  raf = requestAnimationFrame(animate);

  const exitMischief = (): void => {
    mode = 'idle';
    opts.loop.unfreeze();
  };

  return {
    destroy() {
      cancelAnimationFrame(raf);
      clearInterval(tick);
      if (mode !== 'idle') opts.loop.unfreeze();
    },
  };
}

function readPos(sprite: Sprite): { x: number; y: number } {
  const m = /translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/.exec(sprite.el.style.transform);
  if (!m) return { x: 0, y: 0 };
  return { x: parseFloat(m[1] ?? '0'), y: parseFloat(m[2] ?? '0') };
}
