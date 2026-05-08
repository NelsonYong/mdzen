import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDreamLogStore, mostRecentDream } from './dream-log.ts';

test('dream-log: load empty when missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-dream-'));
  try {
    const store = createDreamLogStore({ dir });
    const log = await store.load();
    assert.equal(log.lastDreamAt, 0);
    assert.equal(log.dreamedThruEpisodeCount, 0);
    assert.equal(log.recentDreams.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dream-log: appendEntry caps at 5 most recent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-dream-'));
  try {
    const store = createDreamLogStore({ dir });
    for (let i = 0; i < 8; i++) {
      await store.appendEntry(
        {
          ts: 1000 + i,
          newEpisodeCount: 1,
          questions: [`q${i}`],
          insights: [{ text: `i${i}`, cited: [0] }],
          appliedOps: [{ op: 'NOOP' }],
        },
        i + 1,
      );
    }
    const log = await store.load();
    assert.equal(log.recentDreams.length, 5);
    // Should be the latest 5: ts 1003..1007
    assert.equal(log.recentDreams[0]?.ts, 1003);
    assert.equal(log.recentDreams[4]?.ts, 1007);
    assert.equal(log.dreamedThruEpisodeCount, 8);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dream-log: tryLock once succeeds, second fails', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-dream-'));
  try {
    const store = createDreamLogStore({ dir });
    const now = 1_700_000_000_000;
    assert.equal(await store.tryLock(now), true);
    assert.equal(await store.tryLock(now + 1000), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dream-log: stale lock (>10min) is overwritten', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-dream-'));
  try {
    const store = createDreamLogStore({ dir });
    const now = 1_700_000_000_000;
    assert.equal(await store.tryLock(now), true);
    // Past the stale window
    assert.equal(await store.tryLock(now + 11 * 60 * 1000), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dream-log: releaseLock removes lock file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-dream-'));
  try {
    const store = createDreamLogStore({ dir });
    const now = 1_700_000_000_000;
    await store.tryLock(now);
    await store.releaseLock();
    assert.equal(await store.tryLock(now + 1000), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('mostRecentDream: returns last entry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-dream-'));
  try {
    const store = createDreamLogStore({ dir });
    await store.appendEntry(
      {
        ts: 1000,
        newEpisodeCount: 1,
        questions: ['q1'],
        insights: [],
        appliedOps: [],
      },
      1,
    );
    await store.appendEntry(
      {
        ts: 2000,
        newEpisodeCount: 2,
        questions: ['q2'],
        insights: [],
        appliedOps: [],
      },
      3,
    );
    const log = await store.load();
    const recent = mostRecentDream(log);
    assert.equal(recent?.ts, 2000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('mostRecentDream: null when empty', () => {
  assert.equal(
    mostRecentDream({ lastDreamAt: 0, dreamedThruEpisodeCount: 0, recentDreams: [] }),
    null,
  );
});
