import { createJsonStore, type JsonStore } from './json-store.ts';

// Soul evolution layer.
//
// Two-layer SOUL design (Chapter 2):
//   - soul-base   = handwritten, permanent identity (in profile.soul)
//   - acquired    = LLM-discovered small additions: habits, preferences,
//                   relationship beliefs. NEVER allowed to contradict the base.
//
// Each trait carries a confidence score that grows on REINFORCE and shrinks on
// CONTRADICT. Traits below CONFIDENCE_DROP_THRESHOLD are removed silently.
// Per-category cap (MAX_TRAITS_PER_CATEGORY) keeps the layer thin enough to
// inject without bloating every system prompt.

export type AcquiredCategory = 'habit' | 'preference' | 'relation_belief';

export interface AcquiredTrait {
  category: AcquiredCategory;
  /** First-person, ≤60 chars. "我跟他聊代码时会慢一点" */
  text: string;
  /** 0..1 — drives prompt inclusion + auto-drop. */
  confidence: number;
  firstObservedAt: number;
  lastReinforcedAt: number;
  reinforcementCount: number;
}

export type AcquiredOp =
  | { op: 'ADD'; category: AcquiredCategory; text: string }
  | { op: 'REINFORCE'; index: number }
  | { op: 'CONTRADICT'; index: number }
  | { op: 'NOOP' };

export interface AcquiredPatch {
  ops: AcquiredOp[];
}

export interface AcquiredState {
  traits: AcquiredTrait[];
  updatedAt: number;
}

const EMPTY: AcquiredState = { traits: [], updatedAt: 0 };

export const MAX_TRAITS_PER_CATEGORY = 4;
const INITIAL_CONFIDENCE = 0.5;
const REINFORCE_DELTA = 0.15;
const CONTRADICT_DELTA = 0.25;
const CONFIDENCE_DROP_THRESHOLD = 0.2;
/** Only traits with confidence at or above this make it into the system prompt. */
export const PROMPT_INCLUDE_THRESHOLD = 0.4;

export interface AcquiredStoreOptions {
  dir: string;
}

export type AcquiredStore = JsonStore<AcquiredState>;

export function createAcquiredStore(opts: AcquiredStoreOptions): AcquiredStore {
  return createJsonStore<AcquiredState>({
    dir: opts.dir,
    file: 'acquired.json',
    validate: (raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const p = raw as Partial<AcquiredState>;
      const traits = Array.isArray(p.traits)
        ? p.traits.filter((t): t is AcquiredTrait =>
            !!t &&
            typeof t === 'object' &&
            isCategory((t as AcquiredTrait).category) &&
            typeof (t as AcquiredTrait).text === 'string' &&
            typeof (t as AcquiredTrait).confidence === 'number',
          )
        : [];
      return {
        traits,
        updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0,
      };
    },
    empty: { traits: [], updatedAt: 0 },
  });
}

function isCategory(c: unknown): c is AcquiredCategory {
  return c === 'habit' || c === 'preference' || c === 'relation_belief';
}

/**
 * Pure 4-op applier. Returns the same reference if no effective change happened
 * (so callers can skip writes). A bad op never wipes good traits.
 */
export function applyAcquiredPatch(
  current: AcquiredState,
  patch: AcquiredPatch,
  now: number,
): AcquiredState {
  const ops = Array.isArray(patch.ops) ? patch.ops : [];
  let traits = current.traits.map((t) => ({ ...t }));
  let dirty = false;

  for (const op of ops.slice(0, 3)) {
    if (!op || typeof op !== 'object') continue;
    if (op.op === 'NOOP') continue;
    if (op.op === 'ADD') {
      if (!isCategory(op.category)) continue;
      const text = sanitizeText(op.text, 60);
      if (!text) continue;
      // Substring dedupe within same category.
      if (traits.some((t) => t.category === op.category && substringMatch(t.text, text))) continue;
      traits.push({
        category: op.category,
        text,
        confidence: INITIAL_CONFIDENCE,
        firstObservedAt: now,
        lastReinforcedAt: now,
        reinforcementCount: 1,
      });
      dirty = true;
    } else if (op.op === 'REINFORCE') {
      const i = op.index;
      if (typeof i !== 'number' || i < 0 || i >= traits.length) continue;
      const t = traits[i]!;
      t.confidence = Math.min(1, t.confidence + REINFORCE_DELTA);
      t.lastReinforcedAt = now;
      t.reinforcementCount += 1;
      dirty = true;
    } else if (op.op === 'CONTRADICT') {
      const i = op.index;
      if (typeof i !== 'number' || i < 0 || i >= traits.length) continue;
      const t = traits[i]!;
      t.confidence = Math.max(0, t.confidence - CONTRADICT_DELTA);
      dirty = true;
    }
  }

  if (!dirty) return current;

  // Drop traits below threshold.
  traits = traits.filter((t) => t.confidence >= CONFIDENCE_DROP_THRESHOLD);

  // Per-category cap: drop lowest-confidence first.
  for (const cat of ['habit', 'preference', 'relation_belief'] as AcquiredCategory[]) {
    const inCat = traits.filter((t) => t.category === cat);
    if (inCat.length > MAX_TRAITS_PER_CATEGORY) {
      const survivors = [...inCat]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, MAX_TRAITS_PER_CATEGORY);
      const survivorSet = new Set(survivors);
      traits = traits.filter((t) => t.category !== cat || survivorSet.has(t));
    }
  }

  return { traits, updatedAt: now };
}

/**
 * Format the prompt block. Returns '' if there's nothing significant to inject.
 * Includes only confidence ≥ PROMPT_INCLUDE_THRESHOLD; never shows numbers.
 */
export function buildAcquiredPromptBlock(state: AcquiredState): string {
  const visible = state.traits.filter((t) => t.confidence >= PROMPT_INCLUDE_THRESHOLD);
  if (visible.length === 0) return '';

  const byCat: Record<AcquiredCategory, string[]> = {
    habit: [],
    preference: [],
    relation_belief: [],
  };
  for (const t of visible) byCat[t.category].push(t.text);

  const sections: string[] = [];
  if (byCat.habit.length) sections.push(`习惯:\n${byCat.habit.map((s) => `- ${s}`).join('\n')}`);
  if (byCat.preference.length) sections.push(`偏好:\n${byCat.preference.map((s) => `- ${s}`).join('\n')}`);
  if (byCat.relation_belief.length) sections.push(`你对他的看法:\n${byCat.relation_belief.map((s) => `- ${s}`).join('\n')}`);

  return [
    '【你逐渐学到的(若与基础人格冲突, 以基础人格为准)】',
    ...sections,
  ].join('\n');
}

/**
 * Format an indexed listing for the extractor LLM (so it can reference traits
 * by index in REINFORCE/CONTRADICT ops). Confidence shown as low/mid/high.
 */
export function formatTraitsForExtractor(state: AcquiredState): string {
  if (state.traits.length === 0) return '(空)';
  const labels = state.traits.map((t, i) => {
    const conf = t.confidence < 0.4 ? '弱' : t.confidence < 0.7 ? '中' : '强';
    const cat =
      t.category === 'habit' ? '习惯' : t.category === 'preference' ? '偏好' : '看法';
    return `  [${i}] (${cat}, 置信${conf}) ${t.text}`;
  });
  return labels.join('\n');
}

function sanitizeText(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim().slice(0, max);
  return t.length > 0 ? t : null;
}

function substringMatch(a: string, b: string): boolean {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  return la.includes(lb) || lb.includes(la);
}
