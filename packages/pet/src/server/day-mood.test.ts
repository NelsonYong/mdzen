import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDayMoodStore, currentDayMood, type DayMood } from './day-mood.ts';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60_000;

test('day-mood: load returns null when missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-dm-'));
  try {
    const store = createDayMoodStore({ dir });
    assert.equal(await store.load(), null);
    assert.equal(await currentDayMood(store, NOW), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('day-mood: roundtrip save + load', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-dm-'));
  try {
    const store = createDayMoodStore({ dir });
    const mood: DayMood = {
      text: '今天精神不错',
      generatedAt: NOW,
      validUntil: NOW + DAY,
    };
    await store.save(mood);
    assert.deepEqual(await store.load(), mood);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('day-mood: currentDayMood returns text when fresh', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-dm-'));
  try {
    const store = createDayMoodStore({ dir });
    await store.save({
      text: '今天有点低落',
      generatedAt: NOW - 60_000,
      validUntil: NOW + DAY,
    });
    assert.equal(await currentDayMood(store, NOW), '今天有点低落');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('day-mood: currentDayMood returns null when expired', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-dm-'));
  try {
    const store = createDayMoodStore({ dir });
    await store.save({
      text: '过期了',
      generatedAt: NOW - 2 * DAY,
      validUntil: NOW - DAY, // already expired
    });
    assert.equal(await currentDayMood(store, NOW), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('day-mood: currentDayMood returns null exactly at boundary', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-dm-'));
  try {
    const store = createDayMoodStore({ dir });
    await store.save({
      text: 'boundary',
      generatedAt: NOW - DAY,
      validUntil: NOW, // <= now
    });
    assert.equal(await currentDayMood(store, NOW), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
