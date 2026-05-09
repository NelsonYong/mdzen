import type { PetActivity } from '../shared/types.ts';

// Browser localStorage adapter for persisting pet position + current activity.
// The store is intentionally tiny — single key, JSON, last-write-wins. Two
// independent fields with separate update cadences:
//   - pos: written ~once per second while she's moving (debounced)
//   - activity: written immediately on transition (rare events)
//
// Failure modes: storage disabled / quota / SSR-without-localStorage. All of
// these silently degrade — load returns null, save is a no-op. Pet still
// works, just without memory between reloads.

const KEY = 'seren-pet-state-v1';

export interface StoredPetState {
  pos: { x: number; y: number };
  activity: PetActivity;
  /** ms timestamp of last save — used by load() to expire stale activity. */
  savedAt: number;
}

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadPetState(): StoredPetState | null {
  const ls = safeStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPetState>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.pos ||
      typeof parsed.pos.x !== 'number' ||
      typeof parsed.pos.y !== 'number' ||
      !parsed.activity ||
      typeof (parsed.activity as PetActivity).kind !== 'string'
    ) {
      return null;
    }
    return {
      pos: { x: parsed.pos.x, y: parsed.pos.y },
      activity: parsed.activity as PetActivity,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function savePetState(state: StoredPetState): void {
  const ls = safeStorage();
  if (!ls) return;
  try {
    ls.setItem(KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or storage disabled mid-session — nothing useful to
    // do. We accept missing persistence over crashing the loop.
  }
}

export function clearPetState(): void {
  const ls = safeStorage();
  if (!ls) return;
  try {
    ls.removeItem(KEY);
  } catch {}
}

/**
 * Drop a stored activity that has expired by `now`. Position is always kept
 * (it's where she was). Returns the same reference if no expiry happened.
 */
export function expireStaleActivity(state: StoredPetState, now: number): StoredPetState {
  const a = state.activity;
  if (a.kind === 'idle') return state;
  if (typeof (a as { until?: number }).until !== 'number') return state;
  if ((a as { until: number }).until > now) return state;
  return { ...state, activity: { kind: 'idle' } };
}

