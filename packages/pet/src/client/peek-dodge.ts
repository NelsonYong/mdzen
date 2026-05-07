import type { Sprite } from './sprite.ts';
import type { Loop } from './loop.ts';

const DODGE_PROBABILITY = 0.15;
const DODGE_HOP_PX = 40;
const DODGE_COOLDOWN_MS = 5 * 60_000;

export function peekOnLoad(sprite: Sprite, loop: Loop, target: { x: number; y: number }): void {
  // start below viewport, walk up to target.
  const startY = window.innerHeight + 80;
  sprite.setPosition(target.x, startY);
  loop.setPosition(target.x, startY);
  sprite.setState('walk-left');
  const startedAt = performance.now();
  const duration = 800;
  const animate = (t: number): void => {
    const k = Math.min(1, (t - startedAt) / duration);
    const y = startY + (target.y - startY) * k;
    sprite.setPosition(target.x, y);
    loop.setPosition(target.x, y);
    if (k < 1) requestAnimationFrame(animate);
    else {
      sprite.setState('idle');
    }
  };
  requestAnimationFrame(animate);
}

export function attachDodgeClick(sprite: Sprite, loop: Loop): { destroy: () => void } {
  let lastDodgeAt = -Infinity;

  const onClick = (e: MouseEvent): void => {
    const now = performance.now();
    if (now - lastDodgeAt < DODGE_COOLDOWN_MS) return;
    if (Math.random() >= DODGE_PROBABILITY) return;
    lastDodgeAt = now;
    e.preventDefault();
    e.stopPropagation();

    const m = /translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/.exec(sprite.el.style.transform);
    if (!m) return;
    const x = parseFloat(m[1] ?? '0');
    const y = parseFloat(m[2] ?? '0');
    const dir = Math.random() < 0.5 ? -1 : 1;
    const targetX = x + dir * DODGE_HOP_PX;

    sprite.setState('jumping');
    sprite.setPosition(targetX, y);
    loop.setPosition(targetX, y);
    setTimeout(() => sprite.setState('idle'), 600);
  };

  sprite.img.addEventListener('click', onClick);
  return {
    destroy() {
      sprite.img.removeEventListener('click', onClick);
    },
  };
}
