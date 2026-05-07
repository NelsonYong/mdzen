import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CooldownGate } from './cooldown.ts';

test('cooldown: blocks within per-category window', () => {
  const g = new CooldownGate({ globalMs: 0 });
  assert.equal(g.tryFire('selection', 60_000, 0, () => 0), true);
  assert.equal(g.tryFire('selection', 60_000, 5_000, () => 0), false);
  assert.equal(g.tryFire('selection', 60_000, 70_000, () => 0), true);
});

test('cooldown: probability gate rejects high random', () => {
  const g = new CooldownGate({ globalMs: 0 });
  assert.equal(g.tryFire('selection', 0, 0, () => 0.99, 0.30), false);
  assert.equal(g.tryFire('selection', 0, 0, () => 0.10, 0.30), true);
});

test('cooldown: global cooldown crosses categories', () => {
  const g = new CooldownGate({ globalMs: 30_000 });
  assert.equal(g.tryFire('a', 0, 0, () => 0), true);
  assert.equal(g.tryFire('b', 0, 5_000, () => 0), false);
  assert.equal(g.tryFire('b', 0, 31_000, () => 0), true);
});

test('cooldown: forceFire bypasses gates but updates state', () => {
  const g = new CooldownGate({ globalMs: 30_000 });
  g.forceFire('a', 0);
  assert.equal(g.tryFire('a', 0, 5_000, () => 0), false);
  assert.equal(g.tryFire('b', 0, 31_000, () => 0), true);
});
