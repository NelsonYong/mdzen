import type { BubbleHost } from '../bubble.ts';
import type { CooldownGate } from '../cooldown.ts';
import { pickPreset } from '../presets.ts';
import { globalEmotion } from '../emotion-client.ts';

const MIN_COPY_LEN = 10;
const PROBABILITY = 0.20;
const COOLDOWN_MS = 90_000;

export function attachCopy(bubble: BubbleHost, gate: CooldownGate): { destroy: () => void } {
  const onCopy = (): void => {
    const sel = window.getSelection()?.toString() ?? '';
    if (sel.length < MIN_COPY_LEN) return;
    if (globalEmotion.shouldGateProbabilisticTrigger()) return;
    const now = performance.now();
    if (gate.tryFire('copy', COOLDOWN_MS, now, Math.random, PROBABILITY)) {
      bubble.show({ text: pickPreset('copy'), variant: 'passive' });
    }
  };
  document.addEventListener('copy', onCopy);
  return {
    destroy() {
      document.removeEventListener('copy', onCopy);
    },
  };
}
