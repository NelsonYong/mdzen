import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPresenceStore,
  formatLastSeenLine,
  lastSeenAgoSec,
  daysKnown,
  formatCompanionshipLine,
  formatSessionBoundaryLine,
  isReturningAfterGap,
  type Presence,
} from './presence.ts';

const NOW = new Date(2026, 0, 1, 19, 0, 0).getTime();

test('presence: first touch creates fresh record with sessionsCount=1', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-pres-'));
  try {
    const store = createPresenceStore({ dir });
    assert.equal(await store.load(), null);
    const p = await store.touch(NOW);
    assert.equal(p.sessionsCount, 1);
    assert.equal(p.firstSeenAt, NOW);
    assert.equal(p.lastSeenAt, NOW);
    assert.equal(p.lastSeenPhase, 'evening');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('presence: touch within 4h does not increment sessions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-pres-'));
  try {
    const store = createPresenceStore({ dir });
    await store.touch(NOW);
    const p2 = await store.touch(NOW + 30 * 60_000);
    assert.equal(p2.sessionsCount, 1);
    assert.equal(p2.firstSeenAt, NOW);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('presence: touch after 4h+ increments sessions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-pres-'));
  try {
    const store = createPresenceStore({ dir });
    await store.touch(NOW);
    const p2 = await store.touch(NOW + 5 * 60 * 60_000);
    assert.equal(p2.sessionsCount, 2);
    assert.equal(p2.firstSeenAt, NOW);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('presence: persists across reload', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-pres-'));
  try {
    const a = createPresenceStore({ dir });
    await a.touch(NOW);
    const b = createPresenceStore({ dir });
    const loaded = await b.load();
    assert.equal(loaded?.lastSeenAt, NOW);
    assert.equal(loaded?.sessionsCount, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('formatLastSeenLine: < 60s is silent', () => {
  const p: Presence = {
    lastSeenAt: NOW - 30_000,
    lastSeenPhase: 'evening',
    sessionsCount: 1,
    firstSeenAt: NOW,
  };
  assert.equal(formatLastSeenLine(p, NOW), null);
});

test('formatLastSeenLine: 30min returns 你刚回来了', () => {
  const p: Presence = {
    lastSeenAt: NOW - 5 * 60_000,
    lastSeenPhase: 'evening',
    sessionsCount: 1,
    firstSeenAt: NOW,
  };
  assert.equal(formatLastSeenLine(p, NOW), '你刚回来了');
});

test('formatLastSeenLine: 2h returns hour count', () => {
  const p: Presence = {
    lastSeenAt: NOW - 2 * 60 * 60_000,
    lastSeenPhase: 'morning',
    sessionsCount: 1,
    firstSeenAt: NOW,
  };
  assert.equal(formatLastSeenLine(p, NOW), '2 小时前你还在');
});

test('formatLastSeenLine: 12h returns 今天还没见过你', () => {
  const p: Presence = {
    lastSeenAt: NOW - 12 * 60 * 60_000,
    lastSeenPhase: 'lateNight',
    sessionsCount: 1,
    firstSeenAt: NOW,
  };
  assert.equal(formatLastSeenLine(p, NOW), '今天还没见过你');
});

test('formatLastSeenLine: ~1 day returns 昨天之后', () => {
  const p: Presence = {
    lastSeenAt: NOW - 30 * 60 * 60_000,
    lastSeenPhase: 'evening',
    sessionsCount: 1,
    firstSeenAt: NOW,
  };
  assert.equal(formatLastSeenLine(p, NOW), '昨天之后你就没回来');
});

test('formatLastSeenLine: 3 days returns N 天没见', () => {
  const p: Presence = {
    lastSeenAt: NOW - 3 * 24 * 60 * 60_000,
    lastSeenPhase: 'evening',
    sessionsCount: 1,
    firstSeenAt: NOW,
  };
  assert.equal(formatLastSeenLine(p, NOW), '3 天没见到你了');
});

test('formatLastSeenLine: null presence returns null', () => {
  assert.equal(formatLastSeenLine(null, NOW), null);
});

test('lastSeenAgoSec: returns whole seconds', () => {
  const p: Presence = {
    lastSeenAt: NOW - 12500,
    lastSeenPhase: 'evening',
    sessionsCount: 1,
    firstSeenAt: NOW,
  };
  assert.equal(lastSeenAgoSec(p, NOW), 12);
});

// ─── Companionship + session boundary ─────────────────────────────────────

const MS_DAY = 86_400_000;

function pres(over: Partial<Presence> = {}): Presence {
  return {
    lastSeenAt: NOW,
    lastSeenPhase: 'evening',
    sessionsCount: 1,
    firstSeenAt: NOW - 5 * MS_DAY,
    ...over,
  };
}

test('daysKnown: zero on day 0, increments by day', () => {
  const today = pres({ firstSeenAt: NOW });
  assert.equal(daysKnown(today, NOW), 0);

  const fiveDays = pres({ firstSeenAt: NOW - 5 * MS_DAY });
  assert.equal(daysKnown(fiveDays, NOW), 5);

  // Null presence → 0
  assert.equal(daysKnown(null, NOW), 0);
});

test('formatCompanionshipLine: day 0 returns null (too fresh)', () => {
  assert.equal(formatCompanionshipLine(pres({ firstSeenAt: NOW }), NOW), null);
});

test('formatCompanionshipLine: regular day shows count + sessions', () => {
  const p = pres({ firstSeenAt: NOW - 5 * MS_DAY, sessionsCount: 8 });
  assert.equal(formatCompanionshipLine(p, NOW), '认识 5 天, 第 8 次见你');
});

test('formatCompanionshipLine: 7 days adds 一周纪念 suffix', () => {
  const p = pres({ firstSeenAt: NOW - 7 * MS_DAY, sessionsCount: 12 });
  const line = formatCompanionshipLine(p, NOW);
  assert.match(line ?? '', /7 天.*第 12 次/);
  assert.match(line ?? '', /一周纪念/);
});

test('formatCompanionshipLine: 30 days adds 满一个月', () => {
  const p = pres({ firstSeenAt: NOW - 30 * MS_DAY, sessionsCount: 41 });
  assert.match(formatCompanionshipLine(p, NOW) ?? '', /满一个月/);
});

test('formatCompanionshipLine: 365 days adds 一周年', () => {
  const p = pres({ firstSeenAt: NOW - 365 * MS_DAY, sessionsCount: 412 });
  assert.match(formatCompanionshipLine(p, NOW) ?? '', /一周年/);
});

test('formatCompanionshipLine: 730 days adds 2 周年', () => {
  const p = pres({ firstSeenAt: NOW - 730 * MS_DAY });
  assert.match(formatCompanionshipLine(p, NOW) ?? '', /2 周年/);
});

test('formatCompanionshipLine: non-milestone day has no suffix', () => {
  const p = pres({ firstSeenAt: NOW - 50 * MS_DAY, sessionsCount: 60 });
  const line = formatCompanionshipLine(p, NOW);
  assert.match(line ?? '', /^认识 50 天, 第 60 次见你$/);
});

test('isReturningAfterGap: < 4h returns false', () => {
  const p = pres({ lastSeenAt: NOW - 2 * 60 * 60_000 });
  assert.equal(isReturningAfterGap(p, NOW), false);
});

test('isReturningAfterGap: ≥ 4h returns true', () => {
  const p = pres({ lastSeenAt: NOW - 5 * 60 * 60_000 });
  assert.equal(isReturningAfterGap(p, NOW), true);
});

test('isReturningAfterGap: null presence (first ever) returns false', () => {
  assert.equal(isReturningAfterGap(null, NOW), false);
});

test('formatSessionBoundaryLine: same session returns null', () => {
  const p = pres({ lastSeenAt: NOW - 30 * 60_000 });
  assert.equal(formatSessionBoundaryLine(p, NOW), null);
});

test('formatSessionBoundaryLine: 5h gap shows hours', () => {
  const p = pres({ lastSeenAt: NOW - 5 * 60 * 60_000 });
  const line = formatSessionBoundaryLine(p, NOW);
  assert.match(line ?? '', /5 小时/);
  assert.match(line ?? '', /重逢/);
});

test('formatSessionBoundaryLine: ~10h gap renders "隔了一觉"', () => {
  const p = pres({ lastSeenAt: NOW - 14 * 60 * 60_000 });
  assert.match(formatSessionBoundaryLine(p, NOW) ?? '', /隔了一觉/);
});

test('formatSessionBoundaryLine: 3 day gap shows days', () => {
  const p = pres({ lastSeenAt: NOW - 3 * MS_DAY });
  assert.match(formatSessionBoundaryLine(p, NOW) ?? '', /3 天/);
});
