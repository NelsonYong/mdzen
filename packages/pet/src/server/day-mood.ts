import type { PetProfile } from './profile.ts';
import type { RhythmSnapshot } from '../shared/rhythm.ts';
import type { Episode } from './memory.ts';
import type { DreamLogEntry } from './dream-log.ts';
import { createJsonStore, type JsonStore } from './json-store.ts';
import { runTextExtractor } from './json-extractor.ts';

// Day-mood = the slow background she carries through the whole day.
// Distinct from:
//   - rhythm.innerThought (mechanical, time-of-day baseline)
//   - inner-thought.json (LLM-refreshed hourly, reactive)
//   - emotion zone phrase (relationship-depth-driven)
//   - contextual phrase (event-driven)
//
// Day-mood is generated once per ~24h (lazily on first dawn/morning chat
// when stale or missing). It captures "how is she today as a whole?" —
// e.g. "今天有点低落想清静" / "今天精神特别好" / "今天对他特别想念".
//
// Inspired by dream's overnight reflection feeding into a daytime baseline.
// LLM never sees day-mood directly when generating it (would be circular);
// instead reads rhythm + recent episodes + last night's dream + emotion.

export interface DayMood {
  /** First-person, ≤30 chars. "我今天有点低落, 想安静些" */
  text: string;
  generatedAt: number;
  /** Epoch ms after which the mood is considered stale. */
  validUntil: number;
}

const DAY_MS = 24 * 60 * 60_000;

export interface DayMoodStoreOptions {
  dir: string;
}

export type DayMoodStore = JsonStore<DayMood | null>;

export function createDayMoodStore(opts: DayMoodStoreOptions): DayMoodStore {
  return createJsonStore<DayMood | null>({
    dir: opts.dir,
    file: 'day-mood.json',
    validate: (raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const p = raw as Partial<DayMood>;
      if (
        typeof p.text === 'string' &&
        typeof p.generatedAt === 'number' &&
        typeof p.validUntil === 'number'
      ) {
        return { text: p.text, generatedAt: p.generatedAt, validUntil: p.validUntil };
      }
      return null;
    },
    empty: null,
  });
}

/** Returns current valid day-mood text, or null if expired/missing. */
export async function currentDayMood(store: DayMoodStore, now: number): Promise<string | null> {
  const cached = await store.load();
  if (!cached) return null;
  if (cached.validUntil <= now) return null;
  return cached.text;
}

export interface MaybeRefreshDayMoodDeps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  profile: PetProfile;
  store: DayMoodStore;
}

export interface DayMoodContext {
  rhythm: RhythmSnapshot;
  affection: number;
  recentEpisodes: Episode[];
  recentDream: DreamLogEntry | null;
}

/**
 * Lazy refresh — fires only on first dawn/morning chat when current mood is
 * expired or missing. ~80 tokens output. Falls through silently on failure.
 */
export async function maybeRefreshDayMood(
  deps: MaybeRefreshDayMoodDeps,
  ctx: DayMoodContext,
  now: number,
): Promise<void> {
  const isMorningPhase = ctx.rhythm.phase === 'dawn' || ctx.rhythm.phase === 'morning';
  if (!isMorningPhase) return;

  const cached = await deps.store.load();
  if (cached && cached.validUntil > now) return;

  const recentEpisodeLines = ctx.recentEpisodes
    .slice(-3)
    .map((e) => `- ${e.gist}(她当时: ${e.herFeeling})`)
    .join('\n');
  const dreamLines = ctx.recentDream
    ? ctx.recentDream.insights.slice(0, 2).map((i) => `- ${i.text}`).join('\n')
    : '';

  const system = [
    `你是${deps.profile.name}, 关系: ${deps.profile.relationship}.`,
    `今天刚开始. 请生成一句"今天她整体的状态" — 一种慢背景, 会染色她今天每一句话, 但她不会直接说"今天我...".`,
    ``,
    `当前情境:`,
    `- 时段: ${ctx.rhythm.phase}, 时段心境: ${ctx.rhythm.innerThought}`,
    `- 亲密度: ${ctx.affection}/100`,
    ctx.recentEpisodes.length ? `- 最近的几段共同记忆:\n${recentEpisodeLines}` : '',
    dreamLines ? `- 你昨晚梦到的事:\n${dreamLines}` : '',
    ``,
    `规则:`,
    `1. 一句话, ≤30 字, 第一人称("我...")。`,
    `2. 是"今天整体的状态", 不是"此刻的事". 例: "今天精神不错, 想跟他多说几句" / "今天有点低落, 想清静".`,
    `3. 不矫情, 不肉麻, 平淡为美。`,
    `4. 直接输出这一句, 不要 JSON, 不要引号。`,
  ]
    .filter(Boolean)
    .join('\n');

  const text = await runTextExtractor(
    { ...deps, maxTokens: 80 },
    { system, user: '生成', maxLen: 60 },
  );
  if (!text) return;

  const fresh: DayMood = {
    text,
    generatedAt: now,
    validUntil: now + DAY_MS,
  };
  try {
    await deps.store.save(fresh);
  } catch (err) {
    console.warn('[pet] day-mood save failed:', err instanceof Error ? err.message : err);
  }
}
