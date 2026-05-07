import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBound, clampPoint, type Rect } from './boundary.ts';

test('boundary: full viewport with padding', () => {
  const b = computeBound({
    viewport: { w: 1000, h: 800 },
    excluded: [],
    padding: 24,
  });
  assert.deepEqual(b, { x: 24, y: 24, w: 952, h: 752 });
});

test('boundary: excluded right sidebar shrinks width', () => {
  const b = computeBound({
    viewport: { w: 1000, h: 800 },
    excluded: [{ x: 800, y: 0, w: 200, h: 800 }],
    padding: 0,
  });
  assert.equal(b.w, 800);
  assert.equal(b.h, 800);
});

test('boundary: excluded left sidebar shrinks width and shifts x', () => {
  const b = computeBound({
    viewport: { w: 1000, h: 800 },
    excluded: [{ x: 0, y: 0, w: 200, h: 800 }],
    padding: 0,
  });
  assert.equal(b.x, 200);
  assert.equal(b.w, 800);
});

test('clamp: point inside passes through', () => {
  const bound: Rect = { x: 100, y: 100, w: 500, h: 400 };
  assert.deepEqual(clampPoint({ x: 200, y: 200 }, bound), { x: 200, y: 200 });
});

test('clamp: point outside is clamped to edge', () => {
  const bound: Rect = { x: 100, y: 100, w: 500, h: 400 };
  assert.deepEqual(clampPoint({ x: 50, y: 50 }, bound), { x: 100, y: 100 });
  assert.deepEqual(clampPoint({ x: 9999, y: 9999 }, bound), { x: 600, y: 500 });
});
