import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollAutonomousTransition } from './fsm.ts';

test('fsm: roll < 0.40 stays in idle', () => {
  const next = rollAutonomousTransition({ current: 'idle', random: 0.10 });
  assert.equal(next, 'idle');
});

test('fsm: 0.40 <= roll < 0.65 picks a walk direction', () => {
  const a = rollAutonomousTransition({ current: 'idle', random: 0.50 });
  assert.ok(a === 'walk-left' || a === 'walk-right', `got ${a}`);
});

test('fsm: 0.65 <= roll < 0.80 picks wandering', () => {
  const next = rollAutonomousTransition({ current: 'idle', random: 0.70 });
  assert.equal(next, 'wandering');
});

test('fsm: 0.80 <= roll < 0.90 picks jumping', () => {
  const next = rollAutonomousTransition({ current: 'idle', random: 0.85 });
  assert.equal(next, 'jumping');
});

test('fsm: 0.90 <= roll < 0.98 picks waiting', () => {
  const next = rollAutonomousTransition({ current: 'idle', random: 0.94 });
  assert.equal(next, 'waiting');
});

test('fsm: roll >= 0.98 picks running', () => {
  const next = rollAutonomousTransition({ current: 'idle', random: 0.99 });
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
