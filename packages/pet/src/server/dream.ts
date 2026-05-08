import type { PetProfile } from './profile.ts';
import { runJsonExtractor } from './json-extractor.ts';
import {
  type Episode,
  type MemoryStore,
  type PetMemory,
  MAX_EPISODES,
} from './memory.ts';
import {
  type AcquiredCategory,
  type AcquiredState,
  type AcquiredStore,
  type AcquiredTrait,
  MAX_TRAITS_PER_CATEGORY,
} from './acquired.ts';
import {
  type DreamLog,
  type DreamLogEntry,
  type DreamLogStore,
} from './dream-log.ts';
import { computeRhythm } from '../shared/rhythm.ts';

// Sleep-time memory consolidation, four phases (Claude Code Auto Dream pattern):
//   1. Orient    — load state, compute new episodes since last dream
//   2. Reflect   — Park-style two-step prompt (questions + insights w/ citations)
//   3. Consolidate — tool-op JSON: promote_to_acquired / update_user_profile /
//                    merge_facts / forget_fact / NOOP. Citations validated.
//   4. Decay & Index — confidence × 0.95, append entry, set dreamedThruEpisodeCount
//
// Episodes are NEVER rewritten — they are emotional ground truth.

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DreamOp =
  | {
      op: 'promote_to_acquired';
      category: AcquiredCategory;
      text: string;
      /** Must reference ≥1 valid episode index. */
      citedEpisodes: number[];
    }
  | { op: 'update_user_profile'; text: string; citedEpisodes: number[] }
  | {
      op: 'merge_facts';
      indices: number[];
      mergedText: string;
      citedEpisodes: number[];
    }
  | { op: 'forget_fact'; index: number; reason: string; citedEpisodes: number[] }
  | {
      /**
       * Explicit drop of a single existing trait against new contradictory
       * evidence. Borrowed from leaked Claude Code reconciliation prompt:
       * separate from consolidation/pruning so the *decision* is recorded
       * (not just the disappearance). Surfaced to the user in
       * "她长成的样子" tab as "她最近放下了".
       */
      op: 'reconcile_trait';
      /** Index into snapshot.acquired.traits (0-based, validated). */
      traitIdx: number;
      /** ≤120 chars, why she's dropping it. Required, surfaced to user. */
      reason: string;
      /** ≥1 valid episode index — must show evidence. */
      citedEpisodes: number[];
      /**
       * Populated by the applier from the snapshot at apply time so the
       * dream-log entry remains self-describing after the trait is gone.
       * The LLM does NOT emit this field.
       */
      droppedText?: string;
    }
  | { op: 'NOOP' };

export interface DreamPlan {
  questions: string[];
  insights: { text: string; cited: number[] }[];
  ops: DreamOp[];
}

export interface DreamSnapshot {
  memory: PetMemory;
  acquired: AcquiredState;
}

export interface DreamResult {
  snapshot: DreamSnapshot;
  next: { memory: PetMemory; acquired: AcquiredState };
  appliedOps: DreamOp[];
  entry: DreamLogEntry;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trigger gate (pure)
// ─────────────────────────────────────────────────────────────────────────────

export const TRIGGER_MIN_NEW_EPISODES = 5;
export const TRIGGER_MIN_USER_IDLE_MS = 30 * 60_000;
export const TRIGGER_MIN_INTERVAL_MS = 24 * 60 * 60_000;
const PROMOTE_INITIAL_CONFIDENCE = 0.7;
const DECAY_FACTOR = 0.95;
const TRAIT_CONFIDENCE_FLOOR = 0.2;

export interface ShouldDreamInput {
  now: number;
  log: DreamLog;
  episodesCount: number;
  presenceLastSeenAt: number | null;
  /** Current rhythm phase. */
  phase: string;
}

/**
 * All four conditions must hold:
 *   1. lateNight phase (0–5h)
 *   2. user idle ≥ 30 min
 *   3. ≥ 24h since last dream
 *   4. ≥ 5 new episodes since last dream
 */
export function shouldDream(input: ShouldDreamInput): boolean {
  if (input.phase !== 'lateNight') return false;
  if (input.now - input.log.lastDreamAt < TRIGGER_MIN_INTERVAL_MS) return false;
  if (
    input.presenceLastSeenAt === null ||
    input.now - input.presenceLastSeenAt < TRIGGER_MIN_USER_IDLE_MS
  ) {
    return false;
  }
  const newEps = input.episodesCount - input.log.dreamedThruEpisodeCount;
  if (newEps < TRIGGER_MIN_NEW_EPISODES) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure applier (testable, no LLM)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply a DreamPlan to a snapshot. Filters ops with invalid citations.
 * Returns the (possibly identical) updated state plus the ops that actually
 * landed (so dream-log records what really happened, not what LLM proposed).
 */
export function applyDreamPlan(
  snapshot: DreamSnapshot,
  plan: DreamPlan,
  now: number,
): { next: { memory: PetMemory; acquired: AcquiredState }; appliedOps: DreamOp[] } {
  const memory: PetMemory = {
    userProfile: snapshot.memory.userProfile,
    facts: [...snapshot.memory.facts],
    episodes: snapshot.memory.episodes, // never modified
    updatedAt: snapshot.memory.updatedAt,
  };

  // Decay all acquired confidence first — universal sleep-time forgetting.
  let traits: AcquiredTrait[] = snapshot.acquired.traits.map((t) => ({
    ...t,
    confidence: t.confidence * DECAY_FACTOR,
  }));

  const appliedOps: DreamOp[] = [];
  const epLen = snapshot.memory.episodes.length;
  let dirty = false;
  // Indices of traits the LLM explicitly dropped via reconcile_trait. Applied
  // after the op loop so traitIdx stays stable across other ops in the batch.
  const reconcileDrops = new Set<number>();

  for (const rawOp of (plan.ops ?? []).slice(0, 6)) {
    if (!rawOp || typeof rawOp !== 'object') continue;
    const op = rawOp as DreamOp;
    if (op.op === 'NOOP') continue;

    // Citation validation (load-bearing).
    if ('citedEpisodes' in op) {
      const cited = Array.isArray(op.citedEpisodes) ? op.citedEpisodes : [];
      const allValid = cited.every((i) => Number.isInteger(i) && i >= 0 && i < epLen);
      if (!allValid) continue;
      // promote_to_acquired and reconcile_trait both require ≥1 cited episode.
      if (
        (op.op === 'promote_to_acquired' || op.op === 'reconcile_trait') &&
        cited.length === 0
      ) {
        continue;
      }
    }

    if (op.op === 'promote_to_acquired') {
      const text = sanitize(op.text, 60);
      if (!text) continue;
      if (!isCategory(op.category)) continue;
      // Substring dedup within same category.
      if (traits.some((t) => t.category === op.category && substringMatch(t.text, text))) continue;
      traits.push({
        category: op.category,
        text,
        confidence: PROMOTE_INITIAL_CONFIDENCE,
        firstObservedAt: now,
        lastReinforcedAt: now,
        reinforcementCount: 1,
      });
      appliedOps.push(op);
      dirty = true;
    } else if (op.op === 'update_user_profile') {
      const t = sanitize(op.text, 200);
      if (!t || t === memory.userProfile) continue;
      memory.userProfile = t;
      appliedOps.push(op);
      dirty = true;
    } else if (op.op === 'merge_facts') {
      const idxs = (Array.isArray(op.indices) ? op.indices : [])
        .filter((i) => Number.isInteger(i) && i >= 0 && i < memory.facts.length);
      const merged = sanitize(op.mergedText, 60);
      if (idxs.length < 2 || !merged) continue;
      // Keep order stable, drop merged-out, prepend merged at lowest index.
      const lowest = Math.min(...idxs);
      const removed = new Set(idxs);
      memory.facts = memory.facts
        .filter((_, i) => !removed.has(i))
        .reduce<string[]>((acc, f, i) => {
          if (i === lowest && !acc.includes(merged)) acc.push(merged);
          acc.push(f);
          return acc;
        }, []);
      if (!memory.facts.includes(merged)) memory.facts.push(merged);
      appliedOps.push(op);
      dirty = true;
    } else if (op.op === 'forget_fact') {
      const i = op.index;
      if (!Number.isInteger(i) || i < 0 || i >= memory.facts.length) continue;
      memory.facts.splice(i, 1);
      appliedOps.push(op);
      dirty = true;
    } else if (op.op === 'reconcile_trait') {
      const idx = op.traitIdx;
      if (!Number.isInteger(idx) || idx < 0 || idx >= traits.length) continue;
      if (reconcileDrops.has(idx)) continue;
      const reason = sanitize(op.reason, 120);
      if (!reason) continue;
      reconcileDrops.add(idx);
      // Snapshot the trait text before it goes away — dream-log + history-modal
      // need it to render "她最近放下了..." even though the trait itself is gone.
      appliedOps.push({
        op: 'reconcile_trait',
        traitIdx: idx,
        reason,
        citedEpisodes: op.citedEpisodes,
        droppedText: traits[idx]!.text,
      });
      dirty = true;
    }
  }

  // Apply reconcile drops after the op loop so traitIdx stays stable across
  // multiple ops in the same batch.
  if (reconcileDrops.size > 0) {
    traits = traits.filter((_, i) => !reconcileDrops.has(i));
  }

  // Drop traits below floor (could be from decay or from CONTRADICT-style intent).
  traits = traits.filter((t) => t.confidence >= TRAIT_CONFIDENCE_FLOOR);

  // Per-category cap.
  for (const cat of ['habit', 'preference', 'relation_belief'] as AcquiredCategory[]) {
    const inCat = traits.filter((t) => t.category === cat);
    if (inCat.length > MAX_TRAITS_PER_CATEGORY) {
      const survivors = new Set(
        [...inCat]
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, MAX_TRAITS_PER_CATEGORY),
      );
      traits = traits.filter((t) => t.category !== cat || survivors.has(t));
    }
  }

  // Decay always touches every trait, so any non-empty initial state changes.
  const acquired: AcquiredState =
    dirty || snapshot.acquired.traits.length > 0
      ? { traits, updatedAt: now }
      : snapshot.acquired;

  if (dirty) memory.updatedAt = now;

  return {
    next: { memory, acquired },
    appliedOps,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM-driven full pass
// ─────────────────────────────────────────────────────────────────────────────

export interface RunDreamDeps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  profile: PetProfile;
  memoryStore: MemoryStore;
  acquiredStore: AcquiredStore;
  dreamLogStore: DreamLogStore;
}

/**
 * Run a complete dream pass. Locked, idempotent if already in flight.
 * Returns null on lock contention, missing data, or LLM failure.
 */
export async function runDream(
  deps: RunDreamDeps,
  now: number = Date.now(),
): Promise<DreamResult | null> {
  const log = await deps.dreamLogStore.load();
  if (!(await deps.dreamLogStore.tryLock(now))) return null;

  try {
    const memory = await deps.memoryStore.load();
    const acquired = await deps.acquiredStore.load();
    const newEpisodes = memory.episodes.slice(log.dreamedThruEpisodeCount);
    if (newEpisodes.length === 0) return null;

    const plan = await reflectAndConsolidate(deps, memory, acquired, newEpisodes, log);
    if (!plan) return null;

    const snapshot: DreamSnapshot = { memory, acquired };
    const { next, appliedOps } = applyDreamPlan(snapshot, plan, now);

    await deps.memoryStore.save(next.memory);
    await deps.acquiredStore.save(next.acquired);

    const entry: DreamLogEntry = {
      ts: now,
      newEpisodeCount: newEpisodes.length,
      questions: plan.questions,
      insights: plan.insights,
      appliedOps,
    };
    await deps.dreamLogStore.appendEntry(entry, memory.episodes.length);

    return { snapshot, next, appliedOps, entry };
  } finally {
    await deps.dreamLogStore.releaseLock();
  }
}

async function reflectAndConsolidate(
  deps: RunDreamDeps,
  memory: PetMemory,
  acquired: AcquiredState,
  newEpisodes: Episode[],
  _prevLog: DreamLog,
): Promise<DreamPlan | null> {
  // Single batched call: questions → insights w/ citations → ops.
  // Three logical stages but one LLM call to save latency + cost.
  const allEpisodes = memory.episodes;
  const factListing = memory.facts.length
    ? memory.facts.map((f, i) => `  [${i}] ${f}`).join('\n')
    : '  (空)';
  const epListing = allEpisodes
    .map((e, i) => {
      const isNew = i >= allEpisodes.length - newEpisodes.length;
      const tag = isNew ? '*' : ' ';
      return `  ${tag}[ep:${i}] ${e.gist}(她当时: ${e.herFeeling})`;
    })
    .join('\n');
  const traitListing = acquired.traits.length
    ? acquired.traits
        .map((t, i) => `  [${i}] (${t.category}) ${t.text}`)
        .join('\n')
    : '  (空)';

  const system = [
    `你是${deps.profile.name}, 关系: ${deps.profile.relationship}.`,
    `现在是深夜, 你在做梦. 梦的工作不是发生新事, 是把白天的事在心里整理.`,
    ``,
    `规则(载重的, 不可违反):`,
    `1. 每条 insight 必须带 cited:[ep:N], 至少引用 1 个 episode 索引. 没引用的洞察一律不要写.`,
    `2. promote_to_acquired 必须有 citedEpisodes ≥ 1. 不要仅凭一次事件 promote — 要看到 *模式*.`,
    `3. memories are hints, not truth — 如果 episodes 之间有冲突, 标 forget_fact + reason; 不要捏造.`,
    `4. 不要写出与基础人格冲突的 trait. 基础是温柔, 不要 promote "我变冷漠了".`,
    `5. reconcile_trait 用于"我曾经以为他这样, 但最近的 episodes 表明不是了"的情况. 必须给 traitIdx + reason(≤120字) + ≥1 个 citedEpisodes 作为证据. 单次冲突不够 — 至少看到两次以上才放下.`,
    `6. 大多数梦输出 1-3 个 ops 就够了. 不要为了凑数.`,
    ``,
    `【你的基础人格】(永远不可冲突)`,
    deps.profile.soul.slice(0, 600),
    ``,
    `【现有 userProfile】`,
    memory.userProfile || '(空)',
    ``,
    `【现有 facts】(带索引, 备 forget/merge 用)`,
    factListing,
    ``,
    `【现有 acquired traits】`,
    traitListing,
    ``,
    `【共同记忆 episodes】(带 * 的是自上次梦以来新增的)`,
    epListing,
    ``,
    `请输出 JSON, 严格如下结构:`,
    `{`,
    `  "questions": ["关于他, 此刻你心里 2-3 个想问的问题"],`,
    `  "insights": [`,
    `    {"text": "≤60字, 第一人称", "cited": [0, 3]}`,
    `  ],`,
    `  "ops": [`,
    `    {"op":"promote_to_acquired","category":"habit|preference|relation_belief","text":"...","citedEpisodes":[2,5]},`,
    `    {"op":"update_user_profile","text":"≤200字","citedEpisodes":[0,1]},`,
    `    {"op":"merge_facts","indices":[0,2],"mergedText":"...","citedEpisodes":[3]},`,
    `    {"op":"forget_fact","index":1,"reason":"...","citedEpisodes":[4]},`,
    `    {"op":"reconcile_trait","traitIdx":0,"reason":"≤120字, 为什么放下这条","citedEpisodes":[3,7]},`,
    `    {"op":"NOOP"}`,
    `  ]`,
    `}`,
    ``,
    `严格只输出 JSON, 不要 \`\`\` 包裹, 不要解释.`,
  ].join('\n');

  const parsed = await runJsonExtractor<DreamPlan>(deps, {
    system,
    user: '做梦',
    maxTokens: 600,
    validate: (raw) => (raw && typeof raw === 'object' ? (raw as DreamPlan) : null),
  });
  if (!parsed) return null;
  if (!Array.isArray(parsed.questions)) parsed.questions = [];
  if (!Array.isArray(parsed.insights)) parsed.insights = [];
  if (!Array.isArray(parsed.ops)) parsed.ops = [];
  return parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sanitize(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim().slice(0, max);
  return t.length > 0 ? t : null;
}

function isCategory(c: unknown): c is AcquiredCategory {
  return c === 'habit' || c === 'preference' || c === 'relation_belief';
}

function substringMatch(a: string, b: string): boolean {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  return la.includes(lb) || lb.includes(la);
}

// Re-export so tests don't need both imports.
export { MAX_EPISODES };
