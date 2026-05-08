import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyAcquiredPatch,
  buildAcquiredPromptBlock,
  createAcquiredStore,
  formatTraitsForExtractor,
  MAX_TRAITS_PER_CATEGORY,
  PROMPT_INCLUDE_THRESHOLD,
  type AcquiredState,
  type AcquiredTrait,
} from './acquired.ts';

const NOW = 1_700_000_000_000;

function empty(): AcquiredState {
  return { traits: [], updatedAt: 0 };
}

function trait(over: Partial<AcquiredTrait> = {}): AcquiredTrait {
  return {
    category: 'habit',
    text: '默认',
    confidence: 0.5,
    firstObservedAt: NOW - 60_000,
    lastReinforcedAt: NOW - 60_000,
    reinforcementCount: 1,
    ...over,
  };
}

test('acquired: ADD creates new trait at confidence 0.5', () => {
  const out = applyAcquiredPatch(
    empty(),
    { ops: [{ op: 'ADD', category: 'habit', text: '我跟他聊代码时会慢一点' }] },
    NOW,
  );
  assert.equal(out.traits.length, 1);
  assert.equal(out.traits[0]?.text, '我跟他聊代码时会慢一点');
  assert.equal(out.traits[0]?.confidence, 0.5);
  assert.equal(out.traits[0]?.reinforcementCount, 1);
});

test('acquired: ADD substring duplicate within same category is dropped', () => {
  const cur: AcquiredState = {
    traits: [trait({ text: '我跟他聊代码时会慢一点' })],
    updatedAt: NOW - 1000,
  };
  const out = applyAcquiredPatch(
    cur,
    { ops: [{ op: 'ADD', category: 'habit', text: '聊代码时会慢一点' }] },
    NOW,
  );
  assert.equal(out, cur);
});

test('acquired: ADD same-text different-category is allowed', () => {
  const cur: AcquiredState = {
    traits: [trait({ category: 'habit', text: '关于傍晚' })],
    updatedAt: NOW - 1000,
  };
  const out = applyAcquiredPatch(
    cur,
    { ops: [{ op: 'ADD', category: 'preference', text: '关于傍晚' }] },
    NOW,
  );
  assert.equal(out.traits.length, 2);
});

test('acquired: REINFORCE bumps confidence and count', () => {
  const cur: AcquiredState = {
    traits: [trait({ confidence: 0.5, reinforcementCount: 1 })],
    updatedAt: NOW - 1000,
  };
  const out = applyAcquiredPatch(cur, { ops: [{ op: 'REINFORCE', index: 0 }] }, NOW);
  assert.ok(Math.abs((out.traits[0]?.confidence ?? 0) - 0.65) < 1e-9);
  assert.equal(out.traits[0]?.reinforcementCount, 2);
  assert.equal(out.traits[0]?.lastReinforcedAt, NOW);
});

test('acquired: REINFORCE caps at 1.0', () => {
  const cur: AcquiredState = {
    traits: [trait({ confidence: 0.95 })],
    updatedAt: NOW - 1000,
  };
  const out = applyAcquiredPatch(cur, { ops: [{ op: 'REINFORCE', index: 0 }] }, NOW);
  assert.equal(out.traits[0]?.confidence, 1);
});

test('acquired: CONTRADICT lowers confidence', () => {
  const cur: AcquiredState = {
    traits: [trait({ confidence: 0.7 })],
    updatedAt: NOW - 1000,
  };
  const out = applyAcquiredPatch(cur, { ops: [{ op: 'CONTRADICT', index: 0 }] }, NOW);
  assert.ok(Math.abs((out.traits[0]?.confidence ?? 0) - 0.45) < 1e-9);
});

test('acquired: CONTRADICT below threshold drops trait', () => {
  const cur: AcquiredState = {
    traits: [trait({ confidence: 0.4 })],
    updatedAt: NOW - 1000,
  };
  const out = applyAcquiredPatch(cur, { ops: [{ op: 'CONTRADICT', index: 0 }] }, NOW);
  assert.equal(out.traits.length, 0);
});

test('acquired: bad index in REINFORCE is dropped silently', () => {
  const cur = empty();
  const out = applyAcquiredPatch(cur, { ops: [{ op: 'REINFORCE', index: 999 }] }, NOW);
  assert.equal(out, cur);
});

test('acquired: per-category cap drops lowest confidence', () => {
  const cur: AcquiredState = {
    traits: Array.from({ length: MAX_TRAITS_PER_CATEGORY }, (_, i) =>
      trait({ category: 'habit', text: `h${i}`, confidence: 0.3 + i * 0.1 }),
    ),
    updatedAt: NOW - 1000,
  };
  const out = applyAcquiredPatch(
    cur,
    { ops: [{ op: 'ADD', category: 'habit', text: 'newest' }] },
    NOW,
  );
  assert.equal(out.traits.length, MAX_TRAITS_PER_CATEGORY);
  assert.ok(out.traits.some((t) => t.text === 'newest'));
  // Lowest (h0 with 0.3) should be evicted.
  assert.ok(!out.traits.some((t) => t.text === 'h0'));
});

test('acquired: NOOP only returns same reference', () => {
  const cur = empty();
  const out = applyAcquiredPatch(cur, { ops: [{ op: 'NOOP' }] }, NOW);
  assert.equal(out, cur);
});

test('acquired: bad op never wipes good traits', () => {
  const cur: AcquiredState = { traits: [trait({ text: 'good' })], updatedAt: NOW - 1000 };
  const out = applyAcquiredPatch(
    cur,
    {
      ops: [
        { op: 'ADD', category: 'habit', text: 'newone' },
        { op: 'REINFORCE', index: 999 } as never,
        { op: 'NOOP' },
      ],
    },
    NOW,
  );
  assert.equal(out.traits.length, 2);
  assert.ok(out.traits.some((t) => t.text === 'good'));
  assert.ok(out.traits.some((t) => t.text === 'newone'));
});

test('buildAcquiredPromptBlock: filters by confidence threshold', () => {
  const state: AcquiredState = {
    traits: [
      trait({ category: 'habit', text: 'visible', confidence: 0.8 }),
      trait({ category: 'habit', text: 'hidden', confidence: PROMPT_INCLUDE_THRESHOLD - 0.05 }),
    ],
    updatedAt: NOW,
  };
  const block = buildAcquiredPromptBlock(state);
  assert.match(block, /visible/);
  assert.doesNotMatch(block, /hidden/);
});

test('buildAcquiredPromptBlock: empty when nothing significant', () => {
  assert.equal(buildAcquiredPromptBlock(empty()), '');
});

test('buildAcquiredPromptBlock: groups by category, no numbers shown', () => {
  const state: AcquiredState = {
    traits: [
      trait({ category: 'habit', text: '聊代码时慢一点', confidence: 0.8 }),
      trait({ category: 'preference', text: '喜欢傍晚', confidence: 0.7 }),
      trait({ category: 'relation_belief', text: '他不愿示弱', confidence: 0.9 }),
    ],
    updatedAt: NOW,
  };
  const block = buildAcquiredPromptBlock(state);
  assert.match(block, /习惯:/);
  assert.match(block, /偏好:/);
  assert.match(block, /你对他的看法:/);
  // No numeric confidence leaks
  assert.doesNotMatch(block, /\d\.\d/);
});

test('formatTraitsForExtractor: indexed + verbal confidence', () => {
  const state: AcquiredState = {
    traits: [trait({ confidence: 0.3 }), trait({ confidence: 0.55 }), trait({ confidence: 0.85 })],
    updatedAt: NOW,
  };
  const out = formatTraitsForExtractor(state);
  assert.match(out, /\[0\]/);
  assert.match(out, /置信弱/);
  assert.match(out, /置信中/);
  assert.match(out, /置信强/);
});

test('store: roundtrip + reset', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-acq-'));
  try {
    const store = createAcquiredStore({ dir });
    const t: AcquiredState = {
      traits: [trait({ text: 'persisted' })],
      updatedAt: NOW,
    };
    await store.save(t);
    const loaded = await store.load();
    assert.equal(loaded.traits.length, 1);
    assert.equal(loaded.traits[0]?.text, 'persisted');
    await store.reset();
    const reloaded = await store.load();
    assert.equal(reloaded.traits.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
