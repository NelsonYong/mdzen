import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPreset, PRESET_LINES } from './presets.ts';

test('preset: returns from category at index 0', () => {
  for (const k of Object.keys(PRESET_LINES) as Array<keyof typeof PRESET_LINES>) {
    const s = pickPreset(k, () => 0);
    assert.ok((PRESET_LINES[k] as ReadonlyArray<string>).includes(s));
  }
});

test('preset: high random index in range', () => {
  const v = pickPreset('protest', () => 0.99);
  assert.ok((PRESET_LINES.protest as ReadonlyArray<string>).includes(v));
});
