export interface CooldownConfig {
  globalMs: number;
}

export class CooldownGate {
  private lastByCategory = new Map<string, number>();
  private lastGlobal = -Infinity;

  constructor(private cfg: CooldownConfig) {}

  tryFire(
    category: string,
    perCategoryMs: number,
    now: number,
    rng: () => number,
    probability = 1,
  ): boolean {
    if (now - this.lastGlobal < this.cfg.globalMs) return false;
    const last = this.lastByCategory.get(category) ?? -Infinity;
    if (now - last < perCategoryMs) return false;
    if (rng() >= probability) return false;
    this.lastByCategory.set(category, now);
    this.lastGlobal = now;
    return true;
  }

  forceFire(category: string, now: number): void {
    this.lastByCategory.set(category, now);
    this.lastGlobal = now;
  }
}
