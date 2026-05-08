import { createJsonStore, type JsonStore } from './json-store.ts';

export interface Episode {
  ts: number;
  /** One-line summary of what happened. ≤60 chars. */
  gist: string;
  /** How she felt about it. ≤30 chars. */
  herFeeling: string;
  /** Optional tone read from the user side. */
  userTone?: 'happy' | 'tired' | 'frustrated' | 'neutral' | 'affectionate';
}

export interface PetMemory {
  /** Short rolling description of the user. ≤200 chars. LLM-updated. */
  userProfile: string;
  /** Specific facts about the user (≤30 chars each). LLM-managed via 4-op patches. */
  facts: string[];
  /**
   * Emotional moments. Append-only — episodes are emotional ground truth and
   * are NEVER rewritten. The memory-updater can only push new entries; the
   * dream pass reads them but never modifies them. Only forget_fact /
   * merge_facts in dream consolidate facts; episodes are immutable history.
   * Capped at MAX_EPISODES, oldest dropped on overflow.
   */
  episodes: Episode[];
  updatedAt: number;
}

export const MAX_EPISODES = 10;

export interface MemoryStoreOptions {
  /** Relationship-scoped dir, shared across workspaces. */
  dir: string;
}

export type MemoryStore = JsonStore<PetMemory>;

export function createMemoryStore(opts: MemoryStoreOptions): MemoryStore {
  return createJsonStore<PetMemory>({
    dir: opts.dir,
    file: 'memory.json',
    validate: (raw) => {
      if (!raw || typeof raw !== 'object') return null;
      // Accept legacy `summary` field name (renamed to userProfile).
      const p = raw as Partial<PetMemory> & { summary?: string };
      const userProfile =
        typeof p.userProfile === 'string'
          ? p.userProfile
          : typeof p.summary === 'string'
            ? p.summary
            : '';
      const episodes = Array.isArray(p.episodes)
        ? p.episodes
            .filter(
              (e): e is Episode =>
                !!e &&
                typeof e === 'object' &&
                typeof (e as Episode).gist === 'string' &&
                typeof (e as Episode).herFeeling === 'string',
            )
            .slice(-MAX_EPISODES)
        : [];
      return {
        userProfile,
        facts: Array.isArray(p.facts)
          ? p.facts.filter((f): f is string => typeof f === 'string')
          : [],
        episodes,
        updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0,
      };
    },
    empty: { userProfile: '', facts: [], episodes: [], updatedAt: 0 },
  });
}
