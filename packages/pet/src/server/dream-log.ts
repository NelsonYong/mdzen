import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { DreamOp } from './dream.ts';
import { createJsonStore } from './json-store.ts';

// dream-log.json — persistent record of consolidation passes.
// Two roles:
//   1. Trigger gating: lastDreamAt + dreamedThruEpisodeCount + lock
//   2. Product surface: morning inner-thought factors recent insights in
//
// Lock uses a sibling file (dream.lock) holding an epoch-ms expiry.
// Process crashes leave a stale lock; we expire it after STALE_LOCK_MS.
//
// We keep this store hand-written (rather than using createJsonStore directly)
// because lock semantics + appendEntry's load-modify-save pattern are
// dream-specific. The underlying JSON I/O still goes through createJsonStore.

export interface DreamLogEntry {
  ts: number;
  newEpisodeCount: number;
  questions: string[];
  insights: { text: string; cited: number[] }[];
  appliedOps: DreamOp[];
}

export interface DreamLog {
  lastDreamAt: number;
  /** Highest episode index that has been considered in a dream. */
  dreamedThruEpisodeCount: number;
  /** Most recent N entries (cap RECENT_DREAMS_KEEP). */
  recentDreams: DreamLogEntry[];
}

const RECENT_DREAMS_KEEP = 5;
const STALE_LOCK_MS = 10 * 60_000;

export interface DreamLogStoreOptions {
  dir: string;
}

export interface DreamLogStore {
  load(): Promise<DreamLog>;
  save(log: DreamLog): Promise<void>;
  /** Append a new entry, trim to RECENT_DREAMS_KEEP. */
  appendEntry(entry: DreamLogEntry, dreamedThruEpisodeCount: number): Promise<DreamLog>;
  /** Acquire lock; returns false if another dream is in progress. */
  tryLock(now: number): Promise<boolean>;
  releaseLock(): Promise<void>;
  filePath: string;
  lockPath: string;
}

export function createDreamLogStore(opts: DreamLogStoreOptions): DreamLogStore {
  const dir = opts.dir;
  const lockPath = join(dir, 'dream.lock');
  const inner = createJsonStore<DreamLog>({
    dir,
    file: 'dream-log.json',
    validate: (raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const p = raw as Partial<DreamLog>;
      return {
        lastDreamAt: typeof p.lastDreamAt === 'number' ? p.lastDreamAt : 0,
        dreamedThruEpisodeCount:
          typeof p.dreamedThruEpisodeCount === 'number' ? p.dreamedThruEpisodeCount : 0,
        recentDreams: Array.isArray(p.recentDreams)
          ? p.recentDreams
              .filter((e): e is DreamLogEntry => !!e && typeof (e as DreamLogEntry).ts === 'number')
              .slice(-RECENT_DREAMS_KEEP)
          : [],
      };
    },
    empty: { lastDreamAt: 0, dreamedThruEpisodeCount: 0, recentDreams: [] },
  });

  async function appendEntry(
    entry: DreamLogEntry,
    dreamedThruEpisodeCount: number,
  ): Promise<DreamLog> {
    const cur = await inner.load();
    const next: DreamLog = {
      lastDreamAt: entry.ts,
      dreamedThruEpisodeCount,
      recentDreams: [...cur.recentDreams, entry].slice(-RECENT_DREAMS_KEEP),
    };
    await inner.save(next);
    return next;
  }

  async function tryLock(now: number): Promise<boolean> {
    try {
      const buf = await readFile(lockPath, 'utf-8');
      const heldUntil = Number.parseInt(buf, 10);
      if (Number.isFinite(heldUntil) && heldUntil > now) return false;
      // Stale — fall through and overwrite.
    } catch {
      // No lock file — go ahead.
    }
    await mkdir(dir, { recursive: true });
    await writeFile(lockPath, String(now + STALE_LOCK_MS));
    return true;
  }

  async function releaseLock(): Promise<void> {
    try {
      await unlink(lockPath);
    } catch {}
  }

  return {
    filePath: inner.filePath,
    lockPath,
    load: inner.load,
    save: inner.save,
    appendEntry,
    tryLock,
    releaseLock,
  };
}

/** Pure helper exposed for tests + agent. */
export function mostRecentDream(log: DreamLog): DreamLogEntry | null {
  return log.recentDreams.length > 0 ? log.recentDreams[log.recentDreams.length - 1]! : null;
}
