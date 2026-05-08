import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonStore } from './json-store.ts';

interface Box {
  n: number;
}

function store(dir: string) {
  return createJsonStore<Box>({
    dir,
    file: 'box.json',
    validate: (raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const p = raw as Partial<Box>;
      return typeof p.n === 'number' ? { n: p.n } : null;
    },
    empty: { n: 0 },
  });
}

test('json-store: load returns empty when file missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'js-'));
  try {
    const s = store(dir);
    assert.deepEqual(await s.load(), { n: 0 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('json-store: roundtrip', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'js-'));
  try {
    const s = store(dir);
    await s.save({ n: 42 });
    assert.deepEqual(await s.load(), { n: 42 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ─── concurrency: the bug the user reported ─────────────────────────────────
// Before the fix, 50 parallel saves to the same path within a few ms would
// collide on the `${Date.now()}.${pid}.tmp` name. The first save's rename
// removed the shared temp; subsequent ones threw ENOENT.
test('json-store: 50 concurrent saves to same path do not race', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'js-'));
  try {
    const s = store(dir);
    const writes = Array.from({ length: 50 }, (_, i) => s.save({ n: i }));
    // Must not throw ENOENT or any other error.
    await Promise.all(writes);
    // File must be readable + valid (one of the values won the last-write race).
    const final = await s.load();
    assert.ok(typeof final.n === 'number');
    assert.ok(final.n >= 0 && final.n < 50);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('json-store: no orphan .tmp files left after concurrent saves', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'js-'));
  try {
    const s = store(dir);
    await Promise.all(Array.from({ length: 30 }, (_, i) => s.save({ n: i })));
    const entries = await readdir(dir);
    const orphans = entries.filter((e) => e.endsWith('.tmp'));
    assert.deepEqual(orphans, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// Concurrent saves to *different* paths must not block each other. Saves to
// the same path serialize via writeLocks; saves to different paths run in
// parallel.
test('json-store: saves to different paths do not interfere', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'js-'));
  try {
    const a = createJsonStore<Box>({
      dir,
      file: 'a.json',
      validate: (raw) => (raw && typeof raw === 'object' ? (raw as Box) : null),
      empty: { n: 0 },
    });
    const b = createJsonStore<Box>({
      dir,
      file: 'b.json',
      validate: (raw) => (raw && typeof raw === 'object' ? (raw as Box) : null),
      empty: { n: 0 },
    });
    await Promise.all([a.save({ n: 1 }), b.save({ n: 2 }), a.save({ n: 3 }), b.save({ n: 4 })]);
    assert.deepEqual(await a.load(), { n: 3 });
    assert.deepEqual(await b.load(), { n: 4 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('json-store: failed save does not poison subsequent saves on same path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'js-'));
  try {
    const s = store(dir);
    // Force a failure with an un-serializable value (BigInt). The lock chain
    // must catch + drop this so the next save still goes through.
    const bad = s.save({ n: 1n as unknown as number }).catch((e) => e);
    const good = s.save({ n: 7 });
    const [err] = await Promise.all([bad, good]);
    assert.ok(err instanceof Error, 'first save should have thrown');
    assert.deepEqual(await s.load(), { n: 7 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('json-store: reset removes file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'js-'));
  try {
    const s = store(dir);
    await s.save({ n: 5 });
    await s.reset();
    assert.deepEqual(await s.load(), { n: 0 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
