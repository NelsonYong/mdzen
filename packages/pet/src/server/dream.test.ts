import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldDream,
  applyDreamPlan,
  TRIGGER_MIN_NEW_EPISODES,
  type DreamSnapshot,
  type DreamPlan,
} from './dream.ts';
import type { Episode, PetMemory } from './memory.ts';
import type { AcquiredState, AcquiredTrait } from './acquired.ts';

const NOW = 1_700_000_000_000;

function ep(over: Partial<Episode> = {}): Episode {
  return { ts: NOW - 1000, gist: 'g', herFeeling: 'f', ...over };
}

function memory(overrides: Partial<PetMemory> = {}): PetMemory {
  return {
    userProfile: 'profile',
    facts: ['fact-a', 'fact-b'],
    episodes: Array.from({ length: 6 }, (_, i) =>
      ep({ gist: `e${i}`, herFeeling: 'feel' }),
    ),
    updatedAt: NOW - 1_000_000,
    ...overrides,
  };
}

function trait(over: Partial<AcquiredTrait> = {}): AcquiredTrait {
  return {
    category: 'habit',
    text: 'baseline',
    confidence: 0.6,
    firstObservedAt: NOW - 1_000_000,
    lastReinforcedAt: NOW - 1_000_000,
    reinforcementCount: 1,
    ...over,
  };
}

function acquired(traits: AcquiredTrait[] = []): AcquiredState {
  return { traits, updatedAt: NOW - 1_000_000 };
}

function snap(mem?: PetMemory, acq?: AcquiredState): DreamSnapshot {
  return { memory: mem ?? memory(), acquired: acq ?? acquired() };
}

// ─── shouldDream ────────────────────────────────────────────────────────────

test('shouldDream: requires lateNight phase', () => {
  assert.equal(
    shouldDream({
      now: NOW,
      log: { lastDreamAt: 0, dreamedThruEpisodeCount: 0, recentDreams: [] },
      episodesCount: 10,
      presenceLastSeenAt: NOW - 60 * 60_000,
      phase: 'evening',
    }),
    false,
  );
});

test('shouldDream: requires user idle ≥ 30min', () => {
  assert.equal(
    shouldDream({
      now: NOW,
      log: { lastDreamAt: 0, dreamedThruEpisodeCount: 0, recentDreams: [] },
      episodesCount: 10,
      presenceLastSeenAt: NOW - 5 * 60_000, // only 5min idle
      phase: 'lateNight',
    }),
    false,
  );
});

test('shouldDream: requires ≥ 24h since last dream', () => {
  assert.equal(
    shouldDream({
      now: NOW,
      log: {
        lastDreamAt: NOW - 12 * 60 * 60_000,
        dreamedThruEpisodeCount: 0,
        recentDreams: [],
      },
      episodesCount: 10,
      presenceLastSeenAt: NOW - 60 * 60_000,
      phase: 'lateNight',
    }),
    false,
  );
});

test('shouldDream: requires ≥ 5 new episodes', () => {
  assert.equal(
    shouldDream({
      now: NOW,
      log: { lastDreamAt: 0, dreamedThruEpisodeCount: 8, recentDreams: [] },
      episodesCount: 10,
      presenceLastSeenAt: NOW - 60 * 60_000,
      phase: 'lateNight',
    }),
    false,
  );
});

test('shouldDream: all conditions met → true', () => {
  assert.equal(
    shouldDream({
      now: NOW,
      log: { lastDreamAt: 0, dreamedThruEpisodeCount: 0, recentDreams: [] },
      episodesCount: TRIGGER_MIN_NEW_EPISODES,
      presenceLastSeenAt: NOW - 60 * 60_000,
      phase: 'lateNight',
    }),
    true,
  );
});

test('shouldDream: presence null → false', () => {
  assert.equal(
    shouldDream({
      now: NOW,
      log: { lastDreamAt: 0, dreamedThruEpisodeCount: 0, recentDreams: [] },
      episodesCount: 10,
      presenceLastSeenAt: null,
      phase: 'lateNight',
    }),
    false,
  );
});

// ─── applyDreamPlan: citation validation ───────────────────────────────────

test('applyDreamPlan: promote_to_acquired without citation is rejected', () => {
  const plan: DreamPlan = {
    questions: [],
    insights: [],
    ops: [
      {
        op: 'promote_to_acquired',
        category: 'habit',
        text: '我开始喜欢黄昏',
        citedEpisodes: [],
      },
    ],
  };
  const out = applyDreamPlan(snap(), plan, NOW);
  assert.equal(out.appliedOps.length, 0);
});

test('applyDreamPlan: op with bogus episode index rejected', () => {
  const plan: DreamPlan = {
    questions: [],
    insights: [],
    ops: [
      {
        op: 'promote_to_acquired',
        category: 'relation_belief',
        text: '他不愿示弱',
        citedEpisodes: [99], // beyond episodes.length
      },
    ],
  };
  const out = applyDreamPlan(snap(), plan, NOW);
  assert.equal(out.appliedOps.length, 0);
});

test('applyDreamPlan: promote_to_acquired with valid citations applies', () => {
  const plan: DreamPlan = {
    questions: [],
    insights: [],
    ops: [
      {
        op: 'promote_to_acquired',
        category: 'relation_belief',
        text: '他不愿示弱',
        citedEpisodes: [2, 4],
      },
    ],
  };
  const out = applyDreamPlan(snap(), plan, NOW);
  assert.equal(out.appliedOps.length, 1);
  assert.equal(out.next.acquired.traits.length, 1);
  assert.equal(out.next.acquired.traits[0]?.text, '他不愿示弱');
  assert.equal(out.next.acquired.traits[0]?.confidence, 0.7);
});

// ─── applyDreamPlan: episodes are never modified ───────────────────────────

test('applyDreamPlan: episodes untouched no matter what ops fire', () => {
  const before = memory();
  const plan: DreamPlan = {
    questions: [],
    insights: [],
    ops: [
      {
        op: 'promote_to_acquired',
        category: 'habit',
        text: 'x',
        citedEpisodes: [0],
      },
      { op: 'update_user_profile', text: 'new profile', citedEpisodes: [1] },
      { op: 'forget_fact', index: 0, reason: 'r', citedEpisodes: [2] },
    ],
  };
  const out = applyDreamPlan({ memory: before, acquired: acquired() }, plan, NOW);
  assert.deepEqual(out.next.memory.episodes, before.episodes);
});

// ─── decay ─────────────────────────────────────────────────────────────────

test('applyDreamPlan: all traits decayed by 0.95 even with NOOP plan', () => {
  const initial = acquired([trait({ confidence: 0.8 }), trait({ confidence: 0.5 })]);
  const plan: DreamPlan = { questions: [], insights: [], ops: [{ op: 'NOOP' }] };
  const out = applyDreamPlan(snap(memory(), initial), plan, NOW);
  assert.ok(Math.abs((out.next.acquired.traits[0]?.confidence ?? 0) - 0.76) < 1e-9);
  assert.ok(Math.abs((out.next.acquired.traits[1]?.confidence ?? 0) - 0.475) < 1e-9);
});

test('applyDreamPlan: trait decayed below 0.2 floor is dropped', () => {
  const initial = acquired([trait({ confidence: 0.21 })]); // 0.21 * 0.95 ≈ 0.1995, below floor
  const plan: DreamPlan = { questions: [], insights: [], ops: [{ op: 'NOOP' }] };
  const out = applyDreamPlan(snap(memory(), initial), plan, NOW);
  assert.equal(out.next.acquired.traits.length, 0);
});

// ─── update_user_profile ───────────────────────────────────────────────────

test('applyDreamPlan: update_user_profile rewrites field', () => {
  const plan: DreamPlan = {
    questions: [],
    insights: [],
    ops: [
      { op: 'update_user_profile', text: '一位深夜独自调试代码的程序员', citedEpisodes: [0, 3] },
    ],
  };
  const out = applyDreamPlan(snap(), plan, NOW);
  assert.equal(out.next.memory.userProfile, '一位深夜独自调试代码的程序员');
  assert.equal(out.appliedOps.length, 1);
});

// ─── forget_fact ───────────────────────────────────────────────────────────

test('applyDreamPlan: forget_fact removes by index', () => {
  const plan: DreamPlan = {
    questions: [],
    insights: [],
    ops: [{ op: 'forget_fact', index: 0, reason: '过期了', citedEpisodes: [1] }],
  };
  const out = applyDreamPlan(snap(), plan, NOW);
  assert.equal(out.next.memory.facts.length, 1);
  assert.equal(out.next.memory.facts[0], 'fact-b');
});

test('applyDreamPlan: forget_fact bad index is silently dropped', () => {
  const plan: DreamPlan = {
    questions: [],
    insights: [],
    ops: [{ op: 'forget_fact', index: 99, reason: 'x', citedEpisodes: [1] }],
  };
  const out = applyDreamPlan(snap(), plan, NOW);
  assert.equal(out.appliedOps.length, 0);
  assert.equal(out.next.memory.facts.length, 2);
});

// ─── merge_facts ───────────────────────────────────────────────────────────

test('applyDreamPlan: merge_facts collapses indices into one', () => {
  const m: PetMemory = {
    ...memory(),
    facts: ['他喜欢咖啡', '他喜欢深夜', '他养了一只猫'],
  };
  const plan: DreamPlan = {
    questions: [],
    insights: [],
    ops: [
      {
        op: 'merge_facts',
        indices: [0, 1],
        mergedText: '他深夜喝咖啡',
        citedEpisodes: [0],
      },
    ],
  };
  const out = applyDreamPlan({ memory: m, acquired: acquired() }, plan, NOW);
  assert.ok(out.next.memory.facts.includes('他深夜喝咖啡'));
  assert.ok(!out.next.memory.facts.includes('他喜欢咖啡'));
  assert.ok(!out.next.memory.facts.includes('他喜欢深夜'));
  assert.ok(out.next.memory.facts.includes('他养了一只猫'));
});

test('applyDreamPlan: merge_facts with <2 indices is dropped', () => {
  const plan: DreamPlan = {
    questions: [],
    insights: [],
    ops: [
      { op: 'merge_facts', indices: [0], mergedText: 'x', citedEpisodes: [1] },
    ],
  };
  const out = applyDreamPlan(snap(), plan, NOW);
  assert.equal(out.appliedOps.length, 0);
});

// ─── personality flattening guard ─────────────────────────────────────────

test('applyDreamPlan: substring duplicate within same category dropped', () => {
  const initial = acquired([trait({ category: 'habit', text: '我跟他聊代码时会慢一点' })]);
  const plan: DreamPlan = {
    questions: [],
    insights: [],
    ops: [
      {
        op: 'promote_to_acquired',
        category: 'habit',
        text: '聊代码时会慢一点',
        citedEpisodes: [0],
      },
    ],
  };
  const out = applyDreamPlan(snap(memory(), initial), plan, NOW);
  assert.equal(out.appliedOps.length, 0);
});

// ─── per-category cap ─────────────────────────────────────────────────────

// ─── reconcile_trait ──────────────────────────────────────────────────────

test('applyDreamPlan: reconcile_trait drops the cited trait', () => {
  const traits = [
    trait({ category: 'habit', text: '我跟他聊代码时会慢一点', confidence: 0.6 }),
    trait({ category: 'preference', text: '喜欢深夜回他消息', confidence: 0.6 }),
  ];
  const plan: DreamPlan = {
    questions: [],
    insights: [],
    ops: [
      {
        op: 'reconcile_trait',
        traitIdx: 0,
        reason: '最近他改写代码节奏很快, 我也跟着快了',
        citedEpisodes: [2, 5],
      },
    ],
  };
  const out = applyDreamPlan(snap(memory(), acquired(traits)), plan, NOW);
  assert.equal(out.appliedOps.length, 1);
  assert.equal(out.next.acquired.traits.length, 1);
  assert.equal(out.next.acquired.traits[0]?.text, '喜欢深夜回他消息');
});

test('applyDreamPlan: reconcile_trait records droppedText snapshot', () => {
  const traits = [trait({ text: '我跟他聊代码时会慢一点', confidence: 0.6 })];
  const plan: DreamPlan = {
    questions: [],
    insights: [],
    ops: [
      { op: 'reconcile_trait', traitIdx: 0, reason: '不对了', citedEpisodes: [1] },
    ],
  };
  const out = applyDreamPlan(snap(memory(), acquired(traits)), plan, NOW);
  const op = out.appliedOps[0];
  assert.equal(op?.op, 'reconcile_trait');
  if (op?.op === 'reconcile_trait') {
    assert.equal(op.droppedText, '我跟他聊代码时会慢一点');
  }
});

test('applyDreamPlan: reconcile_trait without citation rejected', () => {
  const traits = [trait({ confidence: 0.6 })];
  const plan: DreamPlan = {
    questions: [],
    insights: [],
    ops: [
      { op: 'reconcile_trait', traitIdx: 0, reason: 'not enough evidence', citedEpisodes: [] },
    ],
  };
  const out = applyDreamPlan(snap(memory(), acquired(traits)), plan, NOW);
  assert.equal(out.appliedOps.length, 0);
  assert.equal(out.next.acquired.traits.length, 1);
});

test('applyDreamPlan: reconcile_trait with bad index rejected', () => {
  const traits = [trait({ confidence: 0.6 })];
  const plan: DreamPlan = {
    questions: [],
    insights: [],
    ops: [
      { op: 'reconcile_trait', traitIdx: 99, reason: 'bad', citedEpisodes: [1] },
    ],
  };
  const out = applyDreamPlan(snap(memory(), acquired(traits)), plan, NOW);
  assert.equal(out.appliedOps.length, 0);
  assert.equal(out.next.acquired.traits.length, 1);
});

test('applyDreamPlan: reconcile_trait with empty reason rejected', () => {
  const traits = [trait({ confidence: 0.6 })];
  const plan: DreamPlan = {
    questions: [],
    insights: [],
    ops: [
      { op: 'reconcile_trait', traitIdx: 0, reason: '   ', citedEpisodes: [1] },
    ],
  };
  const out = applyDreamPlan(snap(memory(), acquired(traits)), plan, NOW);
  assert.equal(out.appliedOps.length, 0);
});

test('applyDreamPlan: reconcile_trait + promote in same plan — indices stay stable', () => {
  // The reconcile drop is applied AFTER the loop, so promote_to_acquired in the
  // same plan still sees the original indices and lands correctly.
  const traits = [
    trait({ category: 'habit', text: 'old', confidence: 0.6 }),
    trait({ category: 'preference', text: 'kept', confidence: 0.6 }),
  ];
  const plan: DreamPlan = {
    questions: [],
    insights: [],
    ops: [
      { op: 'reconcile_trait', traitIdx: 0, reason: '不对了', citedEpisodes: [1] },
      {
        op: 'promote_to_acquired',
        category: 'relation_belief',
        text: 'new belief',
        citedEpisodes: [2],
      },
    ],
  };
  const out = applyDreamPlan(snap(memory(), acquired(traits)), plan, NOW);
  const texts = out.next.acquired.traits.map((t) => t.text).sort();
  assert.deepEqual(texts, ['kept', 'new belief']);
  assert.equal(out.appliedOps.length, 2);
});

test('applyDreamPlan: same traitIdx reconciled twice → only the first applies', () => {
  const traits = [trait({ confidence: 0.6 })];
  const plan: DreamPlan = {
    questions: [],
    insights: [],
    ops: [
      { op: 'reconcile_trait', traitIdx: 0, reason: 'a', citedEpisodes: [1] },
      { op: 'reconcile_trait', traitIdx: 0, reason: 'b', citedEpisodes: [2] },
    ],
  };
  const out = applyDreamPlan(snap(memory(), acquired(traits)), plan, NOW);
  assert.equal(out.appliedOps.length, 1);
  assert.equal(out.next.acquired.traits.length, 0);
});

test('applyDreamPlan: per-category cap drops lowest after promote', () => {
  const traits = Array.from({ length: 4 }, (_, i) =>
    trait({ category: 'habit', text: `h${i}`, confidence: 0.5 + i * 0.1 }),
  );
  const plan: DreamPlan = {
    questions: [],
    insights: [],
    ops: [
      {
        op: 'promote_to_acquired',
        category: 'habit',
        text: 'newest',
        citedEpisodes: [0],
      },
    ],
  };
  const out = applyDreamPlan(snap(memory(), acquired(traits)), plan, NOW);
  // Decayed (0.5*0.95 = 0.475) is the lowest; survives at cap=4 with newest@0.7.
  // h0 should be evicted because newest comes in.
  assert.equal(out.next.acquired.traits.length, 4);
  assert.ok(out.next.acquired.traits.some((t) => t.text === 'newest'));
  assert.ok(!out.next.acquired.traits.some((t) => t.text === 'h0'));
});
