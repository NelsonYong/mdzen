import type { BubbleHost } from '../bubble.ts';
import type { CooldownGate } from '../cooldown.ts';
import { pickPreset } from '../presets.ts';

const IDLE_THRESHOLD_MS = 5 * 60_000;
const POLL_MS = 30_000;
const TRIGGER_GUARD_MS = 60 * 60_000;

export function attachIdle(bubble: BubbleHost, gate: CooldownGate): { destroy: () => void } {
  let lastActivity = performance.now();
  let firedThisIdle = false;
  const bump = (): void => {
    lastActivity = performance.now();
    firedThisIdle = false;
  };

  const events: Array<keyof DocumentEventMap> = ['mousemove', 'keydown', 'wheel', 'touchstart'];
  for (const e of events) document.addEventListener(e, bump, { passive: true } as AddEventListenerOptions);

  const interval = setInterval(() => {
    const now = performance.now();
    if (firedThisIdle) return;
    if (now - lastActivity < IDLE_THRESHOLD_MS) return;
    if (gate.tryFire('idle', TRIGGER_GUARD_MS, now, Math.random, 1.0)) {
      bubble.show({ text: pickPreset('idle_long'), variant: 'thought', durationMs: 8000 });
      firedThisIdle = true;
    }
  }, POLL_MS);

  return {
    destroy() {
      clearInterval(interval);
      for (const e of events) document.removeEventListener(e, bump);
    },
  };
}
