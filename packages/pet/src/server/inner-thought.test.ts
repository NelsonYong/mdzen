import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createInnerThoughtStore,
  isStale,
  currentInnerThought,
  type InnerThought,
} from './inner-thought.ts';
import { computeRhythm } from '../shared/rhythm.ts';

test('inner-thought store: roundtrip save + load', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-it-'));
  try {
    const store = createInnerThoughtStore({ dir });
    assert.equal(await store.load(), null);
    const t: InnerThought = { text: '我有点想他', generatedAt: 1000, phase: 'evening' };
    await store.save(t);
    assert.deepEqual(await store.load(), t);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('isStale: missing cached → stale', () => {
  const r = computeRhythm(new Date(2026, 0, 1, 19, 0));
  assert.ok(isStale(null, r, Date.now()));
});

test('isStale: phase mismatch → stale', () => {
  const r = computeRhythm(new Date(2026, 0, 1, 19, 0));
  assert.ok(isStale({ text: 'x', generatedAt: Date.now(), phase: 'morning' }, r, Date.now()));
});

test('isStale: same phase + within 1h → fresh', () => {
  const now = Date.now();
  const r = computeRhythm(new Date(2026, 0, 1, 19, 0));
  assert.ok(!isStale({ text: 'x', generatedAt: now - 30 * 60_000, phase: r.phase }, r, now));
});

test('isStale: same phase but 2h old → stale', () => {
  const now = Date.now();
  const r = computeRhythm(new Date(2026, 0, 1, 19, 0));
  assert.ok(isStale({ text: 'x', generatedAt: now - 2 * 60 * 60_000, phase: r.phase }, r, now));
});

test('currentInnerThought: falls back to rhythm phrase when nothing cached', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-it-'));
  try {
    const store = createInnerThoughtStore({ dir });
    const r = computeRhythm(new Date(2026, 0, 1, 19, 0));
    const out = await currentInnerThought(store, r);
    assert.equal(out, r.innerThought);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('currentInnerThought: returns cached when phase matches', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-it-'));
  try {
    const store = createInnerThoughtStore({ dir });
    const r = computeRhythm(new Date(2026, 0, 1, 19, 0));
    await store.save({ text: '只想着他', generatedAt: Date.now(), phase: r.phase });
    const out = await currentInnerThought(store, r);
    assert.equal(out, '只想着他');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('currentInnerThought: phase mismatch falls back to rhythm', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-it-'));
  try {
    const store = createInnerThoughtStore({ dir });
    const r = computeRhythm(new Date(2026, 0, 1, 19, 0));
    await store.save({ text: '过期了', generatedAt: Date.now(), phase: 'morning' });
    const out = await currentInnerThought(store, r);
    assert.equal(out, r.innerThought);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
