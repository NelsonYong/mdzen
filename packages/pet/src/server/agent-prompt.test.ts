import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleSystemPrompt, type AgentDeps } from './agent.ts';
import { LOVER, PET as PET_PRESET } from './profile-presets.ts';
import { createMemoryStore } from './memory.ts';
import { createEmotionStore } from './emotion-storage.ts';
import { createPresenceStore } from './presence.ts';
import { createInnerThoughtStore } from './inner-thought.ts';
import { createAcquiredStore, type AcquiredState } from './acquired.ts';
import { createDreamLogStore } from './dream-log.ts';
import { createAnimationRegistry } from '../shared/animations.ts';

// ─────────────────────────────────────────────────────────────────────────────
// These tests exercise the system prompt assembly without LLM calls. The full
// run() path was previously untested; this is the load-bearing logic where
// persona drift, memory placement, and re-injection cadence live.
// ─────────────────────────────────────────────────────────────────────────────

const FIXED_NOW = new Date(2026, 4, 7, 19, 30, 0).getTime(); // evening
const BASE_PROMPT = '__BASE_PROMPT__';

async function withDeps<T>(fn: (dir: string, deps: AgentDeps) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'pet-prompt-'));
  try {
    const deps: AgentDeps = {
      workspaceRoot: dir,
      apiKey: 'unused',
      profile: LOVER,
      animations: createAnimationRegistry(),
      dispatch: () => undefined,
      memoryStore: createMemoryStore({ dir }),
      emotionStore: createEmotionStore({ dir }),
      presenceStore: createPresenceStore({ dir }),
      innerThoughtStore: createInnerThoughtStore({ dir }),
      acquiredStore: createAcquiredStore({ dir }),
      dreamLogStore: createDreamLogStore({ dir }),
    };
    return await fn(dir, deps);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('assembleSystemPrompt: empty stores → only base + rhythm fragment', async () => {
  await withDeps(async (_dir, deps) => {
    const r = await assembleSystemPrompt(deps, LOVER, BASE_PROMPT, [], undefined, FIXED_NOW);
    assert.match(r.systemPrompt, /^__BASE_PROMPT__/);
    assert.match(r.systemPrompt, /【她此刻心境】.*\(evening\)/);
    // No lastSeen, no acquired, no memory blocks.
    assert.doesNotMatch(r.systemPrompt, /【上次见到他】/);
    assert.doesNotMatch(r.systemPrompt, /【你逐渐学到的/);
    assert.doesNotMatch(r.systemPrompt, /【关于这位用户的概要】/);
    assert.doesNotMatch(r.systemPrompt, /【你记得的关于这位用户的事】/);
    assert.doesNotMatch(r.systemPrompt, /【最近的几段共同记忆】/);
  });
});

test('assembleSystemPrompt: presence touched → lastSeen line appears', async () => {
  await withDeps(async (_dir, deps) => {
    // Touch 2h ago — under the 4h boundary so we get "N 小时前你还在".
    await deps.presenceStore!.touch(FIXED_NOW - 2 * 60 * 60_000);
    const r = await assembleSystemPrompt(deps, LOVER, BASE_PROMPT, [], undefined, FIXED_NOW);
    assert.match(r.systemPrompt, /【上次见到他】2 小时前你还在/);
  });
});

test('assembleSystemPrompt: full state → SOUL → lastSeen → 心境 → acquired → emotion → currentDoc → memory order', async () => {
  await withDeps(async (_dir, deps) => {
    // Memory.
    await deps.memoryStore!.save({
      userProfile: '一位深夜读书的程序员',
      facts: ['他喜欢咖啡', '他在写 markdown 工具'],
      episodes: [
        { ts: FIXED_NOW - 3600_000, gist: '他第一次分享了写的东西', herFeeling: '被信任' },
        { ts: FIXED_NOW - 1800_000, gist: '他凌晨3点还在调bug', herFeeling: '心疼' },
      ],
      updatedAt: FIXED_NOW,
    });

    // Acquired (above PROMPT_INCLUDE_THRESHOLD = 0.4).
    const acquired: AcquiredState = {
      traits: [
        {
          category: 'habit',
          text: '我跟他聊代码时会慢一点',
          confidence: 0.7,
          firstObservedAt: FIXED_NOW,
          lastReinforcedAt: FIXED_NOW,
          reinforcementCount: 1,
        },
      ],
      updatedAt: FIXED_NOW,
    };
    await deps.acquiredStore!.save(acquired);

    // Presence.
    await deps.presenceStore!.touch(FIXED_NOW - 2 * 60 * 60_000);

    const r = await assembleSystemPrompt(
      deps,
      LOVER,
      BASE_PROMPT,
      [],
      { currentDoc: 'docs/api.md' },
      FIXED_NOW,
    );

    // Verify ordering: each block's anchor must come before the next.
    const idx = (s: string): number => r.systemPrompt.indexOf(s);
    const iBase = idx(BASE_PROMPT);
    const iLastSeen = idx('【上次见到他】');
    const iThought = idx('【她此刻心境】');
    const iAcquired = idx('【你逐渐学到的');
    const iEmotion = idx('【基础情绪】');
    const iDoc = idx('【用户当前在看】');
    const iProfile = idx('【关于这位用户的概要】');
    const iFacts = idx('【你记得的关于这位用户的事】');
    const iEpisodes = idx('【最近的几段共同记忆】');

    assert.equal(iBase, 0, 'SOUL should be first');
    assert.ok(iBase < iLastSeen, 'lastSeen after base');
    assert.ok(iLastSeen < iThought, 'thought after lastSeen');
    assert.ok(iThought < iAcquired, 'acquired after thought');
    assert.ok(iAcquired < iEmotion, 'emotion after acquired');
    assert.ok(iEmotion < iDoc, 'currentDoc after emotion');
    assert.ok(iDoc < iProfile, 'memory blocks after currentDoc');
    assert.ok(iProfile < iFacts, 'facts after userProfile');
    assert.ok(iFacts < iEpisodes, 'episodes after facts');

    // Episodes contain only the most recent 2 (we have 2 → both).
    assert.match(r.systemPrompt, /他第一次分享了写的东西/);
    assert.match(r.systemPrompt, /他凌晨3点还在调bug/);
  });
});

test('assembleSystemPrompt: re-inject fires every 8 turns', async () => {
  await withDeps(async (_dir, deps) => {
    // 16 messages = 8 turn-pairs.
    const history = Array.from({ length: 16 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `msg${i}`,
      timestamp: FIXED_NOW - (16 - i) * 1000,
    }));
    const r = await assembleSystemPrompt(deps, LOVER, BASE_PROMPT, history, undefined, FIXED_NOW);
    assert.match(r.systemPrompt, /【提醒一下你自己是谁】/);
  });
});

test('assembleSystemPrompt: re-inject does NOT fire mid-cycle (turn 5)', async () => {
  await withDeps(async (_dir, deps) => {
    // 10 messages = 5 turn-pairs (not multiple of 8).
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `msg${i}`,
      timestamp: FIXED_NOW - (10 - i) * 1000,
    }));
    const r = await assembleSystemPrompt(deps, LOVER, BASE_PROMPT, history, undefined, FIXED_NOW);
    assert.doesNotMatch(r.systemPrompt, /【提醒一下你自己是谁】/);
  });
});

test('assembleSystemPrompt: re-inject does NOT fire on turn 0 (fresh session)', async () => {
  await withDeps(async (_dir, deps) => {
    const r = await assembleSystemPrompt(deps, LOVER, BASE_PROMPT, [], undefined, FIXED_NOW);
    assert.doesNotMatch(r.systemPrompt, /【提醒一下你自己是谁】/);
  });
});

test('assembleSystemPrompt: SOUL is positionally first (cannot be overridden by memory)', async () => {
  await withDeps(async (_dir, deps) => {
    await deps.memoryStore!.save({
      userProfile: 'X',
      facts: ['Y'],
      episodes: [{ ts: FIXED_NOW, gist: 'G', herFeeling: 'F' }],
      updatedAt: FIXED_NOW,
    });
    const r = await assembleSystemPrompt(deps, LOVER, BASE_PROMPT, [], undefined, FIXED_NOW);
    assert.equal(r.systemPrompt.indexOf(BASE_PROMPT), 0);
    assert.ok(r.systemPrompt.indexOf('X') > 0);
  });
});

test('assembleSystemPrompt: profile parameter wins over deps.profile', async () => {
  // Useful invariant: caller can override profile per-run (e.g., for A/B).
  await withDeps(async (_dir, deps) => {
    const r = await assembleSystemPrompt(
      deps,
      PET_PRESET, // pet preset, not lover (deps.profile = LOVER)
      BASE_PROMPT,
      // 16 messages so re-inject fires (uses profile.soul slice)
      Array.from({ length: 16 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `msg${i}`,
        timestamp: 0,
      })),
      undefined,
      FIXED_NOW,
    );
    // PET preset's soul mentions "小生灵" / "猫"; LOVER's mentions "恋人".
    assert.match(r.systemPrompt, /小生灵|猫/);
    assert.doesNotMatch(r.systemPrompt, /我是恋人/);
  });
});

test('assembleSystemPrompt: returns presence + rhythm + zonePhrase snapshot', async () => {
  await withDeps(async (_dir, deps) => {
    await deps.presenceStore!.touch(FIXED_NOW - 60_000);
    const r = await assembleSystemPrompt(deps, LOVER, BASE_PROMPT, [], undefined, FIXED_NOW);
    assert.ok(r.presence);
    assert.equal(r.presence?.lastSeenAt, FIXED_NOW - 60_000);
    assert.equal(r.rhythm.phase, 'evening');
    // zonePhrase comes from emotion store; defaults to "friendly" zone (60 affection).
    assert.ok(r.zonePhrase.length > 0);
  });
});

test('assembleSystemPrompt: low-confidence acquired traits filtered out', async () => {
  await withDeps(async (_dir, deps) => {
    await deps.acquiredStore!.save({
      traits: [
        {
          category: 'habit',
          text: '高置信',
          confidence: 0.8,
          firstObservedAt: FIXED_NOW,
          lastReinforcedAt: FIXED_NOW,
          reinforcementCount: 1,
        },
        {
          category: 'habit',
          text: '低置信不应出现',
          confidence: 0.3, // below PROMPT_INCLUDE_THRESHOLD
          firstObservedAt: FIXED_NOW,
          lastReinforcedAt: FIXED_NOW,
          reinforcementCount: 1,
        },
      ],
      updatedAt: FIXED_NOW,
    });
    const r = await assembleSystemPrompt(deps, LOVER, BASE_PROMPT, [], undefined, FIXED_NOW);
    assert.match(r.systemPrompt, /高置信/);
    assert.doesNotMatch(r.systemPrompt, /低置信不应出现/);
  });
});

test('assembleSystemPrompt: empty acquired (all below threshold) → no acquired block', async () => {
  await withDeps(async (_dir, deps) => {
    await deps.acquiredStore!.save({
      traits: [
        {
          category: 'habit',
          text: 'x',
          confidence: 0.3,
          firstObservedAt: FIXED_NOW,
          lastReinforcedAt: FIXED_NOW,
          reinforcementCount: 1,
        },
      ],
      updatedAt: FIXED_NOW,
    });
    const r = await assembleSystemPrompt(deps, LOVER, BASE_PROMPT, [], undefined, FIXED_NOW);
    assert.doesNotMatch(r.systemPrompt, /【你逐渐学到的/);
  });
});
