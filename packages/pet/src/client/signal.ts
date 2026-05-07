const PING_INTERVAL_MS = 30_000;

export interface SignalPayload {
  sessionId: string;
  currentDoc?: string;
  selection?: string;
  lastActivityAgoSec?: number;
}

export class SignalReporter {
  private sessionId: string;
  private getCurrentDoc: () => string | undefined;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastActivityAt = Date.now();

  constructor(sessionId: string, getCurrentDoc: () => string | undefined) {
    this.sessionId = sessionId;
    this.getCurrentDoc = getCurrentDoc;
    const bump = (): void => {
      this.lastActivityAt = Date.now();
    };
    document.addEventListener('mousemove', bump, { passive: true });
    document.addEventListener('keydown', bump);
    document.addEventListener('wheel', bump, { passive: true });
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.send(), PING_INTERVAL_MS);
    void this.send();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async send(): Promise<void> {
    const sel = window.getSelection()?.toString() ?? '';
    const payload: SignalPayload = {
      sessionId: this.sessionId,
      currentDoc: this.getCurrentDoc(),
      selection: sel.length > 0 ? sel.slice(0, 200) : undefined,
      lastActivityAgoSec: Math.floor((Date.now() - this.lastActivityAt) / 1000),
    };
    try {
      await fetch('/api/pet/signal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {}
  }
}
