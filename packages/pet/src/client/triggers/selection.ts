import type { BubbleHost } from '../bubble.ts';
import type { CooldownGate } from '../cooldown.ts';
import { mixedLine } from '../lines.ts';
import { globalEmotion } from '../emotion-client.ts';

const MIN_SELECTION_LEN = 20;
const DWELL_MS = 2000;
const PROBABILITY = 0.30;
const COOLDOWN_MS = 60_000;

export function attachSelection(bubble: BubbleHost, gate: CooldownGate): { destroy: () => void } {
  let dwellTimer: ReturnType<typeof setTimeout> | null = null;

  const onSelectionChange = (): void => {
    const sel = window.getSelection();
    const text = sel?.toString() ?? '';
    if (dwellTimer != null) {
      clearTimeout(dwellTimer);
      dwellTimer = null;
    }
    if (text.length < MIN_SELECTION_LEN) return;
    dwellTimer = setTimeout(() => {
      if (globalEmotion.shouldGateProbabilisticTrigger()) return;
      const now = performance.now();
      if (gate.tryFire('selection', COOLDOWN_MS, now, Math.random, PROBABILITY)) {
        bubble.show({ text: mixedLine('selection'), variant: 'chat-stub' });
      }
    }, DWELL_MS);
  };

  document.addEventListener('selectionchange', onSelectionChange);
  return {
    destroy() {
      document.removeEventListener('selectionchange', onSelectionChange);
      if (dwellTimer != null) clearTimeout(dwellTimer);
    },
  };
}
