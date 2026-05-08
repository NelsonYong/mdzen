import type { Sprite } from './sprite.ts';
import type { FsmState } from '../shared/types.ts';
import type { BubbleHost, StreamingBubble } from './bubble.ts';
import { globalBusy } from './busy.ts';
import { globalEmotion } from './emotion-client.ts';
import { showReaderPanel, type ReaderHandle } from './reader-panel.ts';
import { stripThinkBlocks } from '../shared/strip-think.ts';

// Placeholder shown for ~150ms after submit, before the server's mood-aware
// ack arrives. Kept as quiet thinking dots — no fake content. Replaced as soon
// as `applyAck()` fires.
const ACK_PLACEHOLDER = '...';
const THINKING_TEXT = '让我想想...';
const ERROR_TEXT = '出错啦, 等等再试?';
const ACK_LINGER_MS = 1400;
const REFUSAL_LINGER_MS = 4000;

export class PetSpeech {
  private sprite: Sprite;
  private bubble: BubbleHost;
  private rawBuffer = '';
  private stream: StreamingBubble | null = null;
  private ackTimer: ReturnType<typeof setTimeout> | null = null;
  private thinkingTimer: ReturnType<typeof setTimeout> | null = null;
  private reader: ReaderHandle | null = null;
  /** Set when applyAck() lands a refusal — finalize() must not dismiss it. */
  private refused = false;

  constructor(sprite: Sprite, bubble: BubbleHost) {
    this.sprite = sprite;
    this.bubble = bubble;
  }

  acknowledge(): void {
    this.cancel();
    globalBusy.set(true);
    // Show a quiet placeholder. The server will replace it with a mood-aware
    // ack via applyAck() within a few hundred ms. If the server stalls, the
    // placeholder transitions to "let me think" so the user isn't left blank.
    this.bubble.show({ text: ACK_PLACEHOLDER, variant: 'passive', durationMs: 30_000 });
    this.ackTimer = setTimeout(() => {
      this.ackTimer = null;
      this.startThinking();
    }, 1500);
  }

  /**
   * Server-driven mood ack. Replaces the placeholder bubble with the real
   * reaction. If `willing=false`, this ack stands as the whole reply — no
   * tokens follow, sprite goes back to idle.
   */
  applyAck(text: string, willing: boolean): void {
    if (this.ackTimer) {
      clearTimeout(this.ackTimer);
      this.ackTimer = null;
    }
    if (this.thinkingTimer) {
      clearTimeout(this.thinkingTimer);
      this.thinkingTimer = null;
    }
    if (!text) {
      // Server sent empty ack — fall back to the thinking transition.
      this.startThinking();
      return;
    }
    if (!willing) {
      // Refusal: bubble lingers, no further tokens expected. Sprite shows a
      // brief turning-away tell when we have one, otherwise stays idle.
      this.refused = true;
      this.bubble.show({ text, variant: 'protest', durationMs: REFUSAL_LINGER_MS });
      this.sprite.setState('idle');
      this.rawBuffer = '';
      globalBusy.set(false);
      return;
    }
    this.bubble.show({ text, variant: 'passive', durationMs: ACK_LINGER_MS });
    this.ackTimer = setTimeout(() => {
      this.ackTimer = null;
      this.startThinking();
    }, ACK_LINGER_MS);
  }

  private startThinking(): void {
    this.sprite.setState('review');
    // Use a thought bubble with animated dots; the textContent is just placeholder
    // for the bubble's auto-sizing — real animation comes from spans we splice in.
    this.bubble.show({ text: THINKING_TEXT, variant: 'thought', durationMs: 90_000 });
  }

  receiveToken(text: string): void {
    if (this.ackTimer) {
      clearTimeout(this.ackTimer);
      this.ackTimer = null;
    }
    this.rawBuffer += text;
    const visible = stripThinkBlocks(this.rawBuffer);
    if (!visible) return;
    if (!this.stream) {
      globalBusy.set(true);
      this.sprite.setState('review');
      this.stream = this.bubble.startStream('passive', {
        onExpand: () => this.expandToReader(),
      });
    }
    this.stream.setText(visible);
    if (this.reader) this.reader.setText(visible);
  }

  expandToReader(): void {
    const visible = stripThinkBlocks(this.rawBuffer);
    if (!visible) return;
    if (this.reader) {
      this.reader.setText(visible);
      return;
    }
    this.reader = showReaderPanel(visible, { title: '· 卷轴 ·' });
  }

  finalize(): void {
    if (this.thinkingTimer) {
      clearTimeout(this.thinkingTimer);
      this.thinkingTimer = null;
    }
    // Refusal path: applyAck already painted the bubble + parked the sprite;
    // finalize is a no-op here, otherwise we'd dismiss the refusal early.
    if (this.refused) {
      this.refused = false;
      return;
    }
    const visible = stripThinkBlocks(this.rawBuffer);
    if (!this.stream) {
      this.bubble.dismiss();
    } else {
      this.stream.setText(visible || '...');
      this.stream.finish();
      this.stream = null;
    }
    this.rawBuffer = '';
    // Context-driven reaction: zone biases the post-reply animation. The
    // pet expresses her current feeling about the user without ever showing
    // a number — Affection -> behavior, per MIT Petz's hidden-state principle.
    const reaction = pickFinalReaction(globalEmotion.zone(), Math.random());
    if (reaction) {
      this.sprite.setState(reaction);
      setTimeout(() => this.sprite.setState('idle'), 1100);
    } else {
      this.sprite.setState('idle');
    }
    globalBusy.set(false);
  }

  fail(message?: string): void {
    this.cancel();
    this.sprite.setState('failed');
    this.bubble.show({
      text: message ? `${ERROR_TEXT} (${message.slice(0, 40)})` : ERROR_TEXT,
      variant: 'protest',
      durationMs: 4000,
    });
    setTimeout(() => this.sprite.setState('idle'), 2000);
    globalBusy.set(false);
  }

  cancel(): void {
    if (this.ackTimer) {
      clearTimeout(this.ackTimer);
      this.ackTimer = null;
    }
    if (this.thinkingTimer) {
      clearTimeout(this.thinkingTimer);
      this.thinkingTimer = null;
    }
    if (this.stream) {
      this.stream.cancel();
      this.stream = null;
    }
    if (this.reader) {
      this.reader.close();
      this.reader = null;
    }
    this.rawBuffer = '';
    this.refused = false;
  }
}

/**
 * Map emotion zone to a probabilistic reaction state after a chat finalizes.
 * Returns null = stay calmly idle (most common, especially in negative zones).
 *
 * - adored:   ~50% jumping / 20% waving / rest idle (joyful, expressive)
 * - friendly: ~25% waving / rest idle (warm but reserved)
 * - sulky:    ~15% waiting / rest idle (a small turn-away tell)
 * - cold:     always idle (cold = behavioral flat)
 * - hiding:   always idle (she shouldn't even be visible at this zone)
 */
export function pickFinalReaction(
  zone: ReturnType<typeof globalEmotion.zone>,
  random: number,
): FsmState | null {
  if (zone === 'adored') {
    if (random < 0.5) return 'jumping';
    if (random < 0.7) return 'waving';
    return null;
  }
  if (zone === 'friendly') {
    if (random < 0.25) return 'waving';
    return null;
  }
  if (zone === 'sulky') {
    if (random < 0.15) return 'waiting';
    return null;
  }
  return null;
}

// Re-export for backward compatibility (pet-speech.test.ts imports here).
export { stripThinkBlocks } from '../shared/strip-think.ts';
