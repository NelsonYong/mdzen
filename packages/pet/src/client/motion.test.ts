import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepToward, facingFromDelta } from './motion.ts';

test('motion: full step when far away', () => {
  const r = stepToward({ from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, speedPxPerSec: 100, dtSec: 0.5, arriveRadius: 0 });
  assert.equal(r.pos.x, 50);
  assert.equal(r.pos.y, 0);
  assert.equal(r.arrived, false);
});

test('motion: snap to target when within step distance', () => {
  const r = stepToward({ from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, speedPxPerSec: 100, dtSec: 0.5, arriveRadius: 0 });
  assert.equal(r.pos.x, 10);
  assert.equal(r.arrived, true);
});

test('motion: arrival within ARRIVE_RADIUS counts as arrived', () => {
  const r = stepToward({ from: { x: 0, y: 0 }, to: { x: 30, y: 0 }, speedPxPerSec: 1000, dtSec: 0.001, arriveRadius: 32 });
  assert.equal(r.arrived, true);
});

test('motion: diagonal direction normalized', () => {
  const r = stepToward({ from: { x: 0, y: 0 }, to: { x: 100, y: 100 }, speedPxPerSec: Math.SQRT2 * 10, dtSec: 1, arriveRadius: 0 });
  assert.ok(Math.abs(r.pos.x - 10) < 0.01, `x=${r.pos.x}`);
  assert.ok(Math.abs(r.pos.y - 10) < 0.01, `y=${r.pos.y}`);
});

test('facingFromDelta: positive dx → right', () => {
  assert.equal(facingFromDelta(50, 10), 'right');
});

test('facingFromDelta: negative dx → left', () => {
  assert.equal(facingFromDelta(-50, 10), 'left');
});

test('facingFromDelta: tiny dx with previous facing keeps facing', () => {
  assert.equal(facingFromDelta(2, 200, 'right'), 'right');
  assert.equal(facingFromDelta(2, 200, 'left'), 'left');
});
