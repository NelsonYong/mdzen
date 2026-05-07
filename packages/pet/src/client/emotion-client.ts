export type AffectionZone = 'adored' | 'friendly' | 'sulky' | 'cold' | 'hiding';

export interface EmotionSnapshot {
  affection: number;
  mood: number;
  lastUpdated: number;
  contextualPhrase?: string;
  contextualPhraseAt?: number;
}

const PREFIX = '/api/pet';

export class EmotionClient {
  private state: EmotionSnapshot = { affection: 60, mood: 50, lastUpdated: Date.now() };
  private inflight: Promise<void> | null = null;

  async refresh(): Promise<void> {
    try {
      const r = await fetch(`${PREFIX}/state`);
      if (!r.ok) return;
      this.state = (await r.json()) as EmotionSnapshot;
    } catch {}
  }

  emit(event: string): void {
    void fetch(`${PREFIX}/event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: EmotionSnapshot | null) => {
        if (s) this.state = s;
      })
      .catch(() => {});
  }

  zone(): AffectionZone {
    const a = this.state.affection;
    if (a >= 80) return 'adored';
    if (a >= 50) return 'friendly';
    if (a >= 25) return 'sulky';
    if (a >= 10) return 'cold';
    return 'hiding';
  }

  shouldGateProbabilisticTrigger(): boolean {
    const z = this.zone();
    return z === 'cold' || z === 'hiding';
  }

  isHiding(): boolean {
    return this.zone() === 'hiding';
  }
}

export const globalEmotion = new EmotionClient();
