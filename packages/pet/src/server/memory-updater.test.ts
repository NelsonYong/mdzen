import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMemoryPatch } from './memory-updater.ts';
import type { PetMemory } from './memory.ts';

const NOW = 1_700_000_000_000;

function base(): PetMemory {
  return {
    userProfile: '一位喜欢深夜读书的程序员',
    facts: ['喜欢喝美式咖啡', '在写一个 markdown 阅读器'],
    episodes: [],
    updatedAt: NOW - 60_000,
  };
}

test('applyMemoryPatch: NOOP returns same reference', () => {
  const cur = base();
  const out = applyMemoryPatch(cur, { ops: [{ op: 'NOOP' }] }, NOW);
  assert.equal(out, cur);
});

test('applyMemoryPatch: ADD appends new fact', () => {
  const cur = base();
  const out = applyMemoryPatch(cur, { ops: [{ op: 'ADD', text: '养了一只橘猫' }] }, NOW);
  assert.deepEqual(out.facts, [...cur.facts, '养了一只橘猫']);
  assert.equal(out.updatedAt, NOW);
});

test('applyMemoryPatch: ADD dedupes by substring', () => {
  const cur = base();
  // Existing: "喜欢喝美式咖啡". New: "喝美式" — strict substring of existing → reject.
  const out = applyMemoryPatch(cur, { ops: [{ op: 'ADD', text: '喝美式' }] }, NOW);
  assert.equal(out, cur);
});

test('applyMemoryPatch: UPDATE replaces fact at index', () => {
  const cur = base();
  const out = applyMemoryPatch(
    cur,
    { ops: [{ op: 'UPDATE', index: 0, text: '改喝拿铁了' }] },
    NOW,
  );
  assert.equal(out.facts[0], '改喝拿铁了');
  assert.equal(out.facts[1], cur.facts[1]);
});

test('applyMemoryPatch: UPDATE bad index is silently dropped', () => {
  const cur = base();
  const out = applyMemoryPatch(
    cur,
    { ops: [{ op: 'UPDATE', index: 99, text: '不存在' }] },
    NOW,
  );
  assert.equal(out, cur);
});

test('applyMemoryPatch: DELETE removes fact at index', () => {
  const cur = base();
  const out = applyMemoryPatch(cur, { ops: [{ op: 'DELETE', index: 0 }] }, NOW);
  assert.deepEqual(out.facts, ['在写一个 markdown 阅读器']);
});

test('applyMemoryPatch: userProfile rewrite', () => {
  const cur = base();
  const out = applyMemoryPatch(
    cur,
    { userProfile: '一位刚开始养猫的开发者', ops: [{ op: 'NOOP' }] },
    NOW,
  );
  assert.equal(out.userProfile, '一位刚开始养猫的开发者');
});

test('applyMemoryPatch: caps facts at MAX_FACTS', () => {
  const cur: PetMemory = {
    userProfile: '',
    facts: Array.from({ length: 8 }, (_, i) => `fact-${i}`),
    episodes: [],
    updatedAt: NOW,
  };
  const out = applyMemoryPatch(cur, { ops: [{ op: 'ADD', text: 'fact-new' }] }, NOW);
  assert.equal(out.facts.length, 8);
  assert.equal(out.facts[7], 'fact-new');
  // Oldest dropped
  assert.equal(out.facts[0], 'fact-1');
});

test('applyMemoryPatch: a single bad op never wipes good facts', () => {
  const cur = base();
  const out = applyMemoryPatch(
    cur,
    {
      ops: [
        { op: 'ADD', text: '新事实' },
        { op: 'DELETE', index: 999 } as never, // bad
        { op: 'NOOP' },
      ],
    },
    NOW,
  );
  // Original 2 + new 1 (bad delete is silently dropped)
  assert.equal(out.facts.length, 3);
  assert.ok(out.facts.includes('新事实'));
});

test('applyMemoryPatch: episode appended when LLM emits one', () => {
  const cur = base();
  const out = applyMemoryPatch(
    cur,
    {
      ops: [{ op: 'NOOP' }],
      episode: { gist: '他第一次跟我分享他写的东西', herFeeling: '被信任' },
    },
    NOW,
  );
  assert.equal(out.episodes.length, 1);
  assert.equal(out.episodes[0]?.gist, '他第一次跟我分享他写的东西');
  assert.equal(out.episodes[0]?.herFeeling, '被信任');
  assert.equal(out.episodes[0]?.ts, NOW);
});

test('applyMemoryPatch: episode without required fields is dropped', () => {
  const cur = base();
  const out = applyMemoryPatch(
    cur,
    { ops: [{ op: 'NOOP' }], episode: { gist: '只有摘要', herFeeling: '' } },
    NOW,
  );
  assert.equal(out, cur);
});

test('applyMemoryPatch: episodes capped at MAX_EPISODES', () => {
  const cur = {
    ...base(),
    episodes: Array.from({ length: 10 }, (_, i) => ({
      ts: i,
      gist: `e${i}`,
      herFeeling: 'f',
    })),
  };
  const out = applyMemoryPatch(
    cur,
    { ops: [{ op: 'NOOP' }], episode: { gist: 'newest', herFeeling: 'fresh' } },
    NOW,
  );
  assert.equal(out.episodes.length, 10);
  assert.equal(out.episodes[9]?.gist, 'newest');
  assert.equal(out.episodes[0]?.gist, 'e1');
});

test('applyMemoryPatch: limited to 3 ops per call', () => {
  const cur: PetMemory = { userProfile: '', facts: [], episodes: [], updatedAt: NOW };
  const out = applyMemoryPatch(
    cur,
    {
      ops: [
        { op: 'ADD', text: 'a' },
        { op: 'ADD', text: 'b' },
        { op: 'ADD', text: 'c' },
        { op: 'ADD', text: 'd' },
        { op: 'ADD', text: 'e' },
      ],
    },
    NOW,
  );
  assert.equal(out.facts.length, 3);
});
