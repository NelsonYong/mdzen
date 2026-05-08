import type { EmotionState } from './emotion.ts';
import { INITIAL_STATE } from './emotion.ts';
import { createJsonStore, type JsonStore } from './json-store.ts';

export interface EmotionStoreOptions {
  /** Directory where the relationship-scoped state file lives. */
  dir: string;
}

export type EmotionStore = JsonStore<EmotionState>;

export function createEmotionStore(opts: EmotionStoreOptions): EmotionStore {
  return createJsonStore<EmotionState>({
    dir: opts.dir,
    file: 'emotion.json',
    validate: (raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const p = raw as Partial<EmotionState>;
      // Per-field validation — a corrupted/older-shape file used to silently
      // produce NaN affection downstream (tickRecovery → math on undefined).
      if (
        typeof p.affection !== 'number' ||
        typeof p.mood !== 'number' ||
        typeof p.lastUpdated !== 'number'
      ) {
        return null;
      }
      const out: EmotionState = {
        affection: p.affection,
        mood: p.mood,
        lastUpdated: p.lastUpdated,
      };
      if (typeof p.contextualPhrase === 'string') out.contextualPhrase = p.contextualPhrase;
      if (typeof p.contextualPhraseAt === 'number') out.contextualPhraseAt = p.contextualPhraseAt;
      if (typeof p.lastRefusalAt === 'number') out.lastRefusalAt = p.lastRefusalAt;
      return out;
    },
    empty: () => INITIAL_STATE(Date.now()),
  });
}
