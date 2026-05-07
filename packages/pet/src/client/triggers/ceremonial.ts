import type { BubbleHost } from '../bubble.ts';
import type { CooldownGate } from '../cooldown.ts';
import type { Sprite } from '../sprite.ts';
import { mixedLine } from '../lines.ts';

const SCROLL_END_PROBABILITY = 0.60;
const SCROLL_END_COOLDOWN = 120_000;
const FILE_SWITCH_PROBABILITY = 0.40;
const FILE_SWITCH_COOLDOWN = 30_000;

export function attachCeremonial(
  bubble: BubbleHost,
  gate: CooldownGate,
  sprite: Sprite,
): { destroy: () => void } {
  let lastPath = location.pathname;
  let firedScrollEnd = false;

  const onScroll = (): void => {
    const atBottom =
      window.innerHeight + window.scrollY >= document.body.scrollHeight - 20;
    if (!atBottom) {
      firedScrollEnd = false;
      return;
    }
    if (firedScrollEnd) return;
    firedScrollEnd = true;
    const now = performance.now();
    if (gate.tryFire('scroll-end', SCROLL_END_COOLDOWN, now, Math.random, SCROLL_END_PROBABILITY)) {
      sprite.setState('waving');
      bubble.show({ text: mixedLine('ceremony_read_end'), variant: 'passive' });
    }
  };

  const checkPath = (): void => {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    const now = performance.now();
    if (gate.tryFire('file-switch', FILE_SWITCH_COOLDOWN, now, Math.random, FILE_SWITCH_PROBABILITY)) {
      sprite.setState('waving');
      bubble.show({ text: mixedLine('ceremony_file_switch'), variant: 'passive' });
    }
  };

  document.addEventListener('scroll', onScroll, { passive: true });
  const interval = setInterval(checkPath, 1000);
  return {
    destroy() {
      document.removeEventListener('scroll', onScroll);
      clearInterval(interval);
    },
  };
}
