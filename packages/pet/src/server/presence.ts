import { phaseOf, type DayPhase } from '../shared/rhythm.ts';
import { createJsonStore, type JsonStore } from './json-store.ts';

// Cross-restart presence — "how long since she saw him last".
// This is the smallest single signal that produces a giant felt-life jump:
// she stops behaving like a fresh process and starts having continuity.
//
// Touched on USER-side actions only (chat POST / signal POST / event POST).
// Her own utterances do not reset this — that would defeat the point.

const NEW_SESSION_GAP_MS = 4 * 60 * 60_000;

export interface Presence {
  /** Epoch ms of the most recent user-side action. */
  lastSeenAt: number;
  /** Day phase when she last saw him. */
  lastSeenPhase: DayPhase;
  /** Count of distinct "sessions" — incremented when gap ≥ NEW_SESSION_GAP_MS. */
  sessionsCount: number;
  /** First-ever interaction timestamp. */
  firstSeenAt: number;
}

export interface PresenceStoreOptions {
  dir: string;
}

export interface PresenceStore {
  load(): Promise<Presence | null>;
  /** Save a fresh touch. Returns the snapshot written. */
  touch(now: number): Promise<Presence>;
  /** Absolute path to presence.json (useful for tests + tooling). */
  filePath: string;
}

export function createPresenceStore(opts: PresenceStoreOptions): PresenceStore {
  const inner: JsonStore<Presence | null> = createJsonStore<Presence | null>({
    dir: opts.dir,
    file: 'presence.json',
    validate: (raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const p = raw as Partial<Presence>;
      if (
        typeof p.lastSeenAt === 'number' &&
        typeof p.lastSeenPhase === 'string' &&
        typeof p.sessionsCount === 'number' &&
        typeof p.firstSeenAt === 'number'
      ) {
        return {
          lastSeenAt: p.lastSeenAt,
          lastSeenPhase: p.lastSeenPhase as DayPhase,
          sessionsCount: p.sessionsCount,
          firstSeenAt: p.firstSeenAt,
        };
      }
      return null;
    },
    empty: null,
  });

  async function touch(now: number): Promise<Presence> {
    const prev = await inner.load();
    const phase = phaseOf(new Date(now).getHours());
    const isNewSession = !prev || now - prev.lastSeenAt >= NEW_SESSION_GAP_MS;
    const next: Presence = {
      lastSeenAt: now,
      lastSeenPhase: phase,
      sessionsCount: prev ? prev.sessionsCount + (isNewSession ? 1 : 0) : 1,
      firstSeenAt: prev?.firstSeenAt ?? now,
    };
    try {
      await inner.save(next);
    } catch {
      // Persistence is best-effort — we still return the in-memory value so callers can use it.
    }
    return next;
  }

  return { filePath: inner.filePath, load: inner.load, touch };
}

/**
 * Render the prompt-side last-seen line. Returns null when the gap is so short
 * that mentioning it would be intrusive (< 60s — she just saw you).
 *
 * Designed to read like a human noticing time, not a clock readout.
 */
export function formatLastSeenLine(p: Presence | null, now: number): string | null {
  if (!p) return null;
  const sec = Math.max(0, Math.floor((now - p.lastSeenAt) / 1000));
  if (sec < 60) return null;
  if (sec < 30 * 60) return '你刚回来了';
  if (sec < 4 * 3600) {
    const h = Math.max(1, Math.floor(sec / 3600));
    return `${h} 小时前你还在`;
  }
  if (sec < 24 * 3600) return '今天还没见过你';
  const days = Math.floor(sec / 86400);
  if (days === 1) return '昨天之后你就没回来';
  return `${days} 天没见到你了`;
}

/** Numeric form for downstream consumers (inner-thought generator etc). */
export function lastSeenAgoSec(p: Presence | null, now: number): number | undefined {
  if (!p) return undefined;
  return Math.max(0, Math.floor((now - p.lastSeenAt) / 1000));
}

// ─────────────────────────────────────────────────────────────────────────────
// Companionship — daysKnown + sessions + milestone notes.
// Pure data derivation from Presence; no scene coupling.
// ─────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/** Days elapsed since first interaction. 0 = same day, 1 = next day. */
export function daysKnown(p: Presence | null, now: number): number {
  if (!p) return 0;
  return Math.max(0, Math.floor((now - p.firstSeenAt) / MS_PER_DAY));
}

function milestoneNote(days: number): string | null {
  if (days === 7) return '一周纪念';
  if (days === 14) return '两周';
  if (days === 30) return '满一个月';
  if (days === 60) return '两个月';
  if (days === 100) return '认识你 100 天了';
  if (days === 200) return '200 天';
  if (days === 365) return '一周年';
  if (days >= 730 && days % 365 === 0) return `${days / 365} 周年`;
  return null;
}

/**
 * Render the companionship line for system prompt injection.
 * Returns null on day 0 (too fresh to mention).
 *
 * Format examples:
 *   - "认识 5 天, 第 8 次见你"
 *   - "认识 30 天, 第 41 次见你 (满一个月)"
 *   - "认识 365 天, 第 412 次见你 (一周年)"
 */
export function formatCompanionshipLine(p: Presence | null, now: number): string | null {
  if (!p) return null;
  const days = daysKnown(p, now);
  if (days < 1) return null;
  const base = `认识 ${days} 天, 第 ${p.sessionsCount} 次见你`;
  const note = milestoneNote(days);
  return note ? `${base} (${note})` : base;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session boundary — when a chat opens after a 4h+ gap, the first reply has
// "reunion" texture. Read at agent.run() start (presence still has the old
// lastSeenAt). After the reply, presence.touch() advances lastSeenAt.
// ─────────────────────────────────────────────────────────────────────────────

const NEW_SESSION_THRESHOLD_MS = 4 * 60 * 60_000;

/** True when this chat is the first interaction after a 4h+ gap. */
export function isReturningAfterGap(p: Presence | null, now: number): boolean {
  if (!p) return false; // first ever; not "returning"
  return now - p.lastSeenAt >= NEW_SESSION_THRESHOLD_MS;
}

/**
 * Render a one-line "this is the first interaction of a new session" hint.
 * Returns null when same session.
 */
export function formatSessionBoundaryLine(p: Presence | null, now: number): string | null {
  if (!isReturningAfterGap(p, now)) return null;
  const sec = Math.floor((now - p!.lastSeenAt) / 1000);
  let gap: string;
  if (sec < 12 * 3600) gap = `${Math.floor(sec / 3600)} 小时`;
  else if (sec < 48 * 3600) gap = '隔了一觉';
  else gap = `${Math.floor(sec / 86400)} 天`;
  return `距上次已${gap} — 这是你这次的第一句话, 可以自然带"重逢"的小色彩, 但不要夸张`;
}
