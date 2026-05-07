import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  affectionZone,
  applyEvent,
  tickRecovery,
  INITIAL_STATE,
  PRESET_PHRASES,
} from './emotion.ts';

test('emotion: zone boundaries', () => {
  assert.equal(affectionZone(85), 'adored');
  assert.equal(affectionZone(50), 'friendly');
  assert.equal(affectionZone(25), 'sulky');
  assert.equal(affectionZone(10), 'cold');
  assert.equal(affectionZone(0), 'hiding');
});

test('emotion: applyEvent click adds affection and mood', () => {
  const s = INITIAL_STATE(0);
  const next = applyEvent(s, 'click', 1000);
  assert.equal(next.affection, 63);
  assert.equal(next.mood, 53);
});

test('emotion: applyEvent clamps to 0-100', () => {
  const s = { affection: 99, mood: 99, lastUpdated: 0 };
  const next = applyEvent(s, 'apply-diff', 1000);
  assert.equal(next.affection, 100);
  assert.equal(next.mood, 100);
});

test('emotion: applyEvent floors at 0', () => {
  const s = { affection: 1, mood: 1, lastUpdated: 0 };
  const next = applyEvent(s, 'drag-3plus', 1000);
  assert.equal(next.affection, 0);
  assert.equal(next.mood, 0);
});

test('emotion: tickRecovery pulls toward 50 mood and lifts affection', () => {
  const s = { affection: 50, mood: 30, lastUpdated: 0 };
  const next = tickRecovery(s, 10 * 60_000);
  assert.ok(next.affection > 50, `affection=${next.affection}`);
  assert.ok(next.mood > 30, `mood=${next.mood}`);
});

test('emotion: every zone has a non-empty preset phrase', () => {
  for (const z of ['adored', 'friendly', 'sulky', 'cold', 'hiding'] as const) {
    assert.ok(PRESET_PHRASES[z].length > 0, `zone ${z} phrase empty`);
  }
});
