import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollAutonomousTransition } from './fsm.ts';

test('fsm: roll < 0.75 stays in idle', () => {
  const next = rollAutonomousTransition({ current: 'idle', random: 0.10 });
  assert.equal(next, 'idle');
});

test('fsm: 0.75 <= roll < 0.85 picks a walk direction', () => {
  const a = rollAutonomousTransition({ current: 'idle', random: 0.80 });
  assert.ok(a === 'walk-left' || a === 'walk-right', `got ${a}`);
});

test('fsm: 0.85 <= roll < 0.91 picks wandering', () => {
  const next = rollAutonomousTransition({ current: 'idle', random: 0.88 });
  assert.equal(next, 'wandering');
});

test('fsm: 0.91 <= roll < 0.96 picks jumping', () => {
  const next = rollAutonomousTransition({ current: 'idle', random: 0.93 });
  assert.equal(next, 'jumping');
});

test('fsm: 0.96 <= roll <= 1.00 picks waiting', () => {
  const next = rollAutonomousTransition({ current: 'idle', random: 0.98 });
  assert.equal(next, 'waiting');
});

test('fsm: running is NEVER picked autonomously (reserved for explicit triggers)', () => {
  for (let i = 0; i < 50; i++) {
    const r = i / 50;
    const next = rollAutonomousTransition({ current: 'idle', random: r });
    assert.notEqual(next, 'running', `running picked at random=${r}`);
  }
});

test('fsm: non-idle state never auto-transitions', () => {
  const next = rollAutonomousTransition({ current: 'jumping', random: 0.99 });
  assert.equal(next, 'jumping');
});

test('fsm: review state cannot be overridden by autonomous roll', () => {
  const next = rollAutonomousTransition({ current: 'review', random: 0.50 });
  assert.equal(next, 'review');
});
