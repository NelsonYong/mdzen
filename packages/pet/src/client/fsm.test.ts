import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollAutonomousTransition } from './fsm.ts';

test('fsm: roll < 0.70 stays in idle', () => {
  const next = rollAutonomousTransition({ current: 'idle', random: 0.10 });
  assert.equal(next, 'idle');
});

test('fsm: 0.70 <= roll < 0.80 picks a walk direction', () => {
  const a = rollAutonomousTransition({ current: 'idle', random: 0.74 });
  assert.ok(a === 'walk-left' || a === 'walk-right', `got ${a}`);
});

test('fsm: 0.80 <= roll < 0.86 picks wandering', () => {
  const next = rollAutonomousTransition({ current: 'idle', random: 0.83 });
  assert.equal(next, 'wandering');
});

test('fsm: 0.86 <= roll < 0.92 picks jumping', () => {
  const next = rollAutonomousTransition({ current: 'idle', random: 0.90 });
  assert.equal(next, 'jumping');
});

test('fsm: 0.92 <= roll < 0.99 picks waiting', () => {
  const next = rollAutonomousTransition({ current: 'idle', random: 0.95 });
  assert.equal(next, 'waiting');
});

test('fsm: roll >= 0.99 picks running', () => {
  const next = rollAutonomousTransition({ current: 'idle', random: 0.995 });
  assert.equal(next, 'running');
});

test('fsm: non-idle state never auto-transitions', () => {
  const next = rollAutonomousTransition({ current: 'jumping', random: 0.99 });
  assert.equal(next, 'jumping');
});

test('fsm: review state cannot be overridden by autonomous roll', () => {
  const next = rollAutonomousTransition({ current: 'review', random: 0.50 });
  assert.equal(next, 'review');
});
