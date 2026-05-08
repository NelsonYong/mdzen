import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phaseOf, computeRhythm, rhythmPromptLine, nowPromptLine } from './rhythm.ts';

test('phaseOf: full day coverage', () => {
  assert.equal(phaseOf(0), 'lateNight');
  assert.equal(phaseOf(4), 'lateNight');
  assert.equal(phaseOf(5), 'dawn');
  assert.equal(phaseOf(6), 'dawn');
  assert.equal(phaseOf(7), 'morning');
  assert.equal(phaseOf(10), 'morning');
  assert.equal(phaseOf(11), 'noon');
  assert.equal(phaseOf(12), 'noon');
  assert.equal(phaseOf(13), 'afternoon');
  assert.equal(phaseOf(16), 'afternoon');
  assert.equal(phaseOf(17), 'evening');
  assert.equal(phaseOf(19), 'evening');
  assert.equal(phaseOf(20), 'night');
  assert.equal(phaseOf(22), 'night');
  assert.equal(phaseOf(23), 'lateNight');
});

test('computeRhythm: all phases reachable, all fields populated', () => {
  for (let h = 0; h < 24; h++) {
    const d = new Date(2026, 0, 1, h, 30, 0);
    const r = computeRhythm(d);
    assert.equal(r.hour, h);
    assert.ok(r.phase);
    assert.ok(r.baseMood >= 0 && r.baseMood <= 100, `baseMood ${r.baseMood} out of range at ${h}h`);
    assert.ok(r.energyLevel >= 0 && r.energyLevel <= 100);
    assert.ok(r.dialogueTendency >= 0 && r.dialogueTendency <= 1);
    assert.ok(r.innerThought.length > 0);
  }
});

test('computeRhythm: morning more energetic than lateNight', () => {
  const morning = computeRhythm(new Date(2026, 0, 1, 9, 0));
  const lateNight = computeRhythm(new Date(2026, 0, 1, 2, 0));
  assert.ok(morning.energyLevel > lateNight.energyLevel);
  assert.ok(morning.dialogueTendency > lateNight.dialogueTendency);
});

test('rhythmPromptLine: includes inner thought and phase', () => {
  const r = computeRhythm(new Date(2026, 0, 1, 19, 0));
  const line = rhythmPromptLine(r);
  assert.match(line, /傍晚/);
  assert.match(line, /evening/);
  assert.match(line, /精力/);
});

test('nowPromptLine: zero-pads month, day, hour, minute', () => {
  const line = nowPromptLine(new Date(2026, 4, 8, 9, 5));
  assert.equal(line, '【现在】2026-05-08 周五 09:05');
});

test('nowPromptLine: weekday matches Chinese convention (周日 for Sunday)', () => {
  // 2026-01-04 was a Sunday
  const line = nowPromptLine(new Date(2026, 0, 4, 14, 30));
  assert.match(line, /周日/);
});

test('nowPromptLine: covers full hour range', () => {
  for (let h = 0; h < 24; h++) {
    const line = nowPromptLine(new Date(2026, 0, 1, h, 0));
    assert.match(line, new RegExp(`${String(h).padStart(2, '0')}:00`));
  }
});
