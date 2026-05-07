# 阅读宠物 · Phase 6 + 7 (Emotion System)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** 加入两轴情绪(Affection 长期 / Mood 短期),5 个区间映射到行为。情绪只通过行为渗透,**永不显示数字**(MIT Petz 原则)。affection/mood 持久化到 `~/.mdzen/workspaces/<hash>/pet-state.json`。LLM 调用时注入"基础情绪"phrase,以及周期性生成的"情境化心境"。

**Spec reference:** §5 整章, §5.5 混合情绪。

---

## Task 1: Emotion module (server, TDD)

**Files:** `src/server/emotion.ts` + test.

- [ ] **Step 1**: Pure-logic state machine for affection/mood + zone classification.

```ts
// emotion.ts
export interface EmotionState {
  affection: number;   // 0-100
  mood: number;        // 0-100
  lastUpdated: number;
  contextualPhrase?: string;
  contextualPhraseAt?: number;
}

export type AffectionZone = 'adored' | 'friendly' | 'sulky' | 'cold' | 'hiding';

export function affectionZone(a: number): AffectionZone {
  if (a >= 80) return 'adored';
  if (a >= 50) return 'friendly';
  if (a >= 25) return 'sulky';
  if (a >= 10) return 'cold';
  return 'hiding';
}

export type EmotionEvent =
  | 'click'
  | 'apply-diff'
  | 'open-chat'
  | 'chat-turn'
  | 'sorry'
  | 'bubble-ignored'
  | 'chat-quick-close'
  | 'diff-rejected'
  | 'idle-hour'
  | 'drag-1st'
  | 'drag-3plus'
  | 'drag-too-long';

export const EVENT_DELTAS: Readonly<Record<EmotionEvent, { affection: number; mood: number }>> = {
  click:            { affection:  +3, mood:  +3 },
  'apply-diff':     { affection:  +5, mood:  +6 },
  'open-chat':      { affection:  +2, mood:  +2 },
  'chat-turn':      { affection:  +1, mood:  +1 },
  sorry:            { affection:  +5, mood:  +6 },
  'bubble-ignored': { affection:  -2, mood:  -3 },
  'chat-quick-close':{ affection: -1, mood:  -2 },
  'diff-rejected':  { affection:  -1, mood:  -2 },
  'idle-hour':      { affection:-0.5, mood:  -1 },
  'drag-1st':       { affection:  -1, mood:  -3 },
  'drag-3plus':     { affection:  -3, mood:  -8 },
  'drag-too-long':  { affection:  -2, mood:  -5 },
};

export function applyEvent(s: EmotionState, ev: EmotionEvent, now: number): EmotionState {
  const d = EVENT_DELTAS[ev];
  return clampState({
    affection: s.affection + d.affection,
    mood: s.mood + d.mood,
    lastUpdated: now,
    contextualPhrase: s.contextualPhrase,
    contextualPhraseAt: s.contextualPhraseAt,
  });
}

export function tickRecovery(s: EmotionState, now: number): EmotionState {
  const minutes = (now - s.lastUpdated) / 60_000;
  if (minutes < 1) return s;
  const moodToward50 = (50 - s.mood) * Math.min(0.5, minutes / 20); // mood pulls to 50
  return clampState({
    affection: s.affection + 0.2 * minutes,                          // +0.2/min
    mood: s.mood + moodToward50,
    lastUpdated: now,
    contextualPhrase: s.contextualPhrase,
    contextualPhraseAt: s.contextualPhraseAt,
  });
}

function clampState(s: EmotionState): EmotionState {
  return {
    ...s,
    affection: Math.max(0, Math.min(100, s.affection)),
    mood: Math.max(0, Math.min(100, s.mood)),
  };
}

export const PRESET_PHRASES: Readonly<Record<AffectionZone, string>> = {
  adored:   '你今天心情很好, 语气可以更活泼, 适当撒娇。',
  friendly: '保持温柔, 简洁回应。',
  sulky:    '你最近被晾了几次, 有点小脾气。回应短一点, 语气微凉但不过分。用户表达善意立刻软化。',
  cold:     '你正在生气。除非用户明显道歉或问得真诚, 否则只回"嗯"/"…"/"随便你"。',
  hiding:   '你藏起来了, 不主动说话。',
};

export function INITIAL_STATE(now: number): EmotionState {
  return { affection: 60, mood: 50, lastUpdated: now };
}
```

- [ ] **Step 2**: Test:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { affectionZone, applyEvent, tickRecovery, INITIAL_STATE, PRESET_PHRASES } from './emotion.ts';

test('emotion: zone boundaries', () => {
  assert.equal(affectionZone(85), 'adored');
  assert.equal(affectionZone(50), 'friendly');
  assert.equal(affectionZone(25), 'sulky');
  assert.equal(affectionZone(10), 'cold');
  assert.equal(affectionZone(0), 'hiding');
});

test('emotion: applyEvent click adds affection', () => {
  const s = INITIAL_STATE(0);
  const next = applyEvent(s, 'click', 1000);
  assert.equal(next.affection, 63);
});

test('emotion: applyEvent clamps to 0-100', () => {
  const s = { affection: 99, mood: 99, lastUpdated: 0 };
  const next = applyEvent(s, 'apply-diff', 1000);
  assert.equal(next.affection, 100);
});

test('emotion: tickRecovery pushes affection up over time', () => {
  const s = { affection: 50, mood: 30, lastUpdated: 0 };
  const next = tickRecovery(s, 10 * 60_000);
  assert.ok(next.affection > 50);
  assert.ok(next.mood > 30);
});

test('emotion: every zone has a preset phrase', () => {
  for (const z of ['adored', 'friendly', 'sulky', 'cold', 'hiding'] as const) {
    assert.ok(PRESET_PHRASES[z].length > 0);
  }
});
```

- [ ] **Step 3**: Tests pass, commit `feat(pet): emotion module (affection/mood, zones, preset phrases)`.

---

## Task 2: Emotion persistence

**Files:** `src/server/emotion-storage.ts` + extend storage handling.

- [ ] **Step 1**: Implement `loadState / saveState` in workspace dir (alongside chat). Atomic write.

```ts
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { EmotionState } from './emotion.ts';
import { INITIAL_STATE } from './emotion.ts';

export interface EmotionStoreOptions {
  chatDir: string;
  workspaceRoot: string;
}

export interface EmotionStore {
  load(): Promise<EmotionState>;
  save(s: EmotionState): Promise<void>;
  filePath: string;
}

export function createEmotionStore(opts: EmotionStoreOptions): EmotionStore {
  const hash = createHash('sha1').update(opts.workspaceRoot).digest('hex').slice(0, 12);
  const dir = join(opts.chatDir, 'workspaces', hash);
  const filePath = join(dir, 'pet-state.json');
  return {
    filePath,
    async load() {
      try {
        const buf = await readFile(filePath, 'utf-8');
        return JSON.parse(buf) as EmotionState;
      } catch {
        return INITIAL_STATE(Date.now());
      }
    },
    async save(s) {
      await mkdir(dir, { recursive: true });
      const tmp = `${filePath}.${Date.now()}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(s, null, 2));
      await rename(tmp, filePath);
    },
  };
}
```

- [ ] **Step 2**: Commit `feat(pet): emotion state persistence`.

---

## Task 3: Emotion API endpoints + agent prompt injection

**Files:** `handler.ts` (extend), `agent.ts` (read state).

- [ ] **Step 1**: New routes:
  - `GET /api/pet/state` → returns current EmotionState (plus ticked recovery).
  - `POST /api/pet/event` → body `{event, count?}`, applies, saves, returns new state.
  - `POST /api/pet/contextual` → triggers LLM-generated contextual phrase regen (used internally and from client).

- [ ] **Step 2**: Wire `state` cache into RuntimeState. Reload + tickRecovery on each access.

- [ ] **Step 3**: agent.ts reads emotion state at run() and injects:

```ts
const emotion = await store.load();
const tickedEmotion = tickRecovery(emotion, Date.now());
const zone = affectionZone(tickedEmotion.affection);
// inject PRESET_PHRASES[zone] + tickedEmotion.contextualPhrase if recent into systemPrompt
```

- [ ] **Step 4**: Commit `feat(pet): emotion endpoints + prompt injection`.

---

## Task 4: Contextual emotion generator

**Files:** `src/server/contextual.ts`.

- [ ] **Step 1**: Function that uses a small `ChatOpenAI` call (no tools, low max-tokens) to produce a one-sentence "third-person" emotion description based on personality + last 5 messages + current affection/mood. Cached in EmotionState. Trigger conditions: zone changed, every 2h, on apply-diff/diff-rejected.

```ts
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { EmotionState } from './emotion.ts';
import type { PersonalityConfig } from '../shared/types.ts';
import type { ChatMessage } from './storage.ts';

export interface ContextualDeps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  personality: PersonalityConfig;
}

export async function generateContextualPhrase(
  deps: ContextualDeps,
  state: EmotionState,
  recentMessages: ChatMessage[],
  currentDocTitle: string,
): Promise<string> {
  const llm = new ChatOpenAI({
    apiKey: deps.apiKey,
    model: deps.model ?? 'gpt-4o-mini',
    streaming: false,
    maxTokens: 60,
    configuration: deps.baseURL ? { baseURL: deps.baseURL } : undefined,
  });

  const eventsTail = recentMessages
    .slice(-5)
    .map((m) => `${m.role}: ${m.content.slice(0, 80)}`)
    .join('\n');

  const sys = new SystemMessage(
    [
      `根据下面信息, 用一句话(最多 25 字)描写她此刻的心境。`,
      `视角: 第三人称, 像在看她, 不许用"我"。`,
      ``,
      `性格: ${deps.personality.baseTone}`,
      `最近事件:\n${eventsTail || '(无)'}`,
      `当前文档: ${currentDocTitle || '(未知)'}`,
      `affection: ${state.affection.toFixed(0)}  mood: ${state.mood.toFixed(0)}`,
      ``,
      `输出: 只一句话, 不要引号。`,
    ].join('\n'),
  );

  try {
    const res = await llm.invoke([sys, new HumanMessage('生成')]);
    const text = ((res?.content as string | undefined) ?? '').trim();
    return text.slice(0, 60);
  } catch {
    return '';
  }
}
```

- [ ] **Step 2**: Wire into agent.ts: at run() start, if needed, call generateContextualPhrase and update EmotionState (background).

- [ ] **Step 3**: Commit `feat(pet): LLM-generated contextual emotion phrase`.

---

## Task 5: Client emotion sync + zone-gated triggers

**Files:** `src/client/emotion-client.ts` + wire in trigger modules.

- [ ] **Step 1**: A small client module that:
  1. Loads current state via `GET /api/pet/state`.
  2. Provides `emit(event)` that POSTs to `/api/pet/event` (debounced).
  3. Exposes `currentZone(): AffectionZone` and `block(category)` checks.

- [ ] **Step 2**: Existing trigger modules query `emotion-client.currentZone()` before firing:
  - `cold` zone: skip all probabilistic triggers (only deterministic-click works in chat).
  - `hiding`: pet hidden (handled in sprite — sprite.setHidden(true)).

- [ ] **Step 3**: Drag triggers `emit('drag-1st')` or `emit('drag-3plus')` based on session counter (already in drag.ts).

- [ ] **Step 4**: Click on sprite emits `'click'`. Open chat panel → `'open-chat'`. Each chat send → `'chat-turn'`.

- [ ] **Step 5**: Commit `feat(pet): client emotion sync + zone-gated triggers`.

---

## Task 6: 3-layer protest mixer

**Files:** `src/client/lines.ts` (new) + use in drag protest, idle thought, ceremonial.

- [ ] **Step 1**: Pick line strategy:
  1. 30% chance: contextual generated (already in pet-state.contextualPhrase if fresh).
  2. 30% chance: ad-hoc LLM mini-call (call `/api/pet/line` with category) — implement endpoint that does a small LLM call.
  3. 40% (or fallback): preset pool (existing `pickPreset`).

- [ ] **Step 2**: Add `/api/pet/line` endpoint server side: `{category} → {text}`. Uses small LLM call with constrained prompt.

- [ ] **Step 3**: Replace `bubble.show({text: pickPreset('protest'), variant: 'protest'})` with `mixedLine('protest', bubble)` etc.

- [ ] **Step 4**: Commit `feat(pet): 3-layer protest line mixer (contextual + ad-hoc LLM + preset)`.

---

## Task 7: Verify

- [ ] **Step 1**: Pipeline green.
- [ ] **Step 2**: With API key: chat several rounds, watch system prompt include emotion phrase. Try ignoring bubbles → affection drops → behavior changes (manual check).
- [ ] **Step 3**: Restart server: emotion persists.
- [ ] **Step 4**: Commit verify.
