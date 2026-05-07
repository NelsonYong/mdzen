import { randomUUID } from 'node:crypto';

export interface Proposal {
  sessionId: string;
  path: string;
  oldText: string;
  newText: string;
  reason: string;
  createdAt: number;
}

export interface ProposalInput {
  sessionId: string;
  path: string;
  oldText: string;
  newText: string;
  reason: string;
}

export interface ProposalRegistryConfig {
  ttlMs: number;
}

export class ProposalRegistry {
  private map = new Map<string, Proposal>();
  private ttlMs: number;

  constructor(cfg: ProposalRegistryConfig) {
    this.ttlMs = cfg.ttlMs;
  }

  create(input: ProposalInput, now: number): string {
    const id = randomUUID();
    this.map.set(id, { ...input, createdAt: now });
    return id;
  }

  get(id: string, now: number): Proposal | null {
    const p = this.map.get(id);
    if (!p) return null;
    if (now - p.createdAt > this.ttlMs) {
      this.map.delete(id);
      return null;
    }
    return p;
  }

  consume(id: string, now: number): Proposal | null {
    const p = this.get(id, now);
    if (p) this.map.delete(id);
    return p;
  }
}
