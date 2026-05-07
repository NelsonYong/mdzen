import type { Sprite } from './sprite.ts';
import type { BubbleHost, StreamingBubble } from './bubble.ts';

const ACK_LINES = ['看到啦~', '我看到了', '收到', '嗯, 听到啦'];
const THINKING_TEXT = '让我想想...';
const ERROR_TEXT = '出错啦, 等等再试?';

export class PetSpeech {
  private sprite: Sprite;
  private bubble: BubbleHost;
  private rawBuffer = '';
  private stream: StreamingBubble | null = null;
  private ackTimer: ReturnType<typeof setTimeout> | null = null;
  private thinkingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(sprite: Sprite, bubble: BubbleHost) {
    this.sprite = sprite;
    this.bubble = bubble;
  }

  acknowledge(): void {
    this.cancel();
    const line = ACK_LINES[Math.floor(Math.random() * ACK_LINES.length)] ?? ACK_LINES[0]!;
    this.bubble.show({ text: line, variant: 'passive', durationMs: 1200 });
    this.ackTimer = setTimeout(() => {
      this.ackTimer = null;
      this.startThinking();
    }, 1200);
  }

  private startThinking(): void {
    this.sprite.setState('review');
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
      this.sprite.setState('review');
      this.stream = this.bubble.startStream('passive');
    }
    this.stream.setText(visible);
  }

  finalize(): void {
    if (this.thinkingTimer) {
      clearTimeout(this.thinkingTimer);
      this.thinkingTimer = null;
    }
    const visible = stripThinkBlocks(this.rawBuffer);
    if (!this.stream) {
      // No real content was streamed (LLM produced only think block, or empty)
      this.bubble.dismiss();
    } else {
      this.stream.setText(visible || '...');
      this.stream.finish();
      this.stream = null;
    }
    this.rawBuffer = '';
    this.sprite.setState('idle');
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
    this.rawBuffer = '';
  }
}

export function stripThinkBlocks(s: string): string {
  let out = s.replace(/<think>[\s\S]*?<\/think>/g, '');
  const open = out.lastIndexOf('<think>');
  if (open >= 0 && out.indexOf('</think>', open) < 0) {
    out = out.slice(0, open);
  }
  return out.trim();
}
