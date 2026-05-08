import type { PetProfile } from './profile.ts';
import type { RhythmSnapshot } from '../shared/rhythm.ts';
import type { Episode } from './memory.ts';
import type { DreamLogEntry } from './dream-log.ts';
import { createJsonStore, type JsonStore } from './json-store.ts';
import { runTextExtractor } from './json-extractor.ts';

// Inner thought = a one-line interior monologue she carries this hour.
// Refreshed by background LLM call, ~1/hour, per workspace.
// Falls back to rhythm.innerThought when no fresh value is cached.

export interface InnerThought {
  text: string;
  generatedAt: number;
  /** Rhythm phase that produced this thought. Becomes stale on phase change. */
  phase: string;
}

export interface InnerThoughtStoreOptions {
  dir: string;
}

export type InnerThoughtStore = JsonStore<InnerThought | null>;

export function createInnerThoughtStore(opts: InnerThoughtStoreOptions): InnerThoughtStore {
  return createJsonStore<InnerThought | null>({
    dir: opts.dir,
    file: 'inner-thought.json',
    validate: (raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const p = raw as Partial<InnerThought>;
      if (
        typeof p.text === 'string' &&
        typeof p.generatedAt === 'number' &&
        typeof p.phase === 'string'
      ) {
        return { text: p.text, generatedAt: p.generatedAt, phase: p.phase };
      }
      return null;
    },
    empty: null,
  });
}

const REFRESH_AFTER_MS = 60 * 60_000; // 1 hour

export interface InnerThoughtDeps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  profile: PetProfile;
  store: InnerThoughtStore;
}

export interface InnerThoughtContext {
  rhythm: RhythmSnapshot;
  recentEpisodes: Episode[];
  lastSeenAgoSec?: number;
  affection: number;
  /** Most recent dream — surfaces as a "morning echo" if dawn/morning. */
  recentDream?: DreamLogEntry;
}

/** Returns true if the cached thought is stale (or missing/phase-mismatched). */
export function isStale(cached: InnerThought | null, rhythm: RhythmSnapshot, now: number): boolean {
  if (!cached) return true;
  if (cached.phase !== rhythm.phase) return true;
  return now - cached.generatedAt > REFRESH_AFTER_MS;
}

/**
 * Fire-and-forget refresh. Cheap LLM call; if it fails, the cached value
 * (or fallback) stays — we never block agent reply on this.
 */
export async function maybeRefreshInnerThought(
  deps: InnerThoughtDeps,
  ctx: InnerThoughtContext,
  now: number,
): Promise<void> {
  const cached = await deps.store.load();
  if (!isStale(cached, ctx.rhythm, now)) return;

  const recentLines = ctx.recentEpisodes
    .slice(-3)
    .map((e) => `- ${new Date(e.ts).toLocaleString('zh-CN')}: ${e.gist}(她当时: ${e.herFeeling})`)
    .join('\n');

  // Morning echo: surface a fresh dream when the user is about to wake up.
  // Phase = dawn/morning AND dream within last 12h. The model uses these to
  // color her thought without saying "我做了梦" verbatim.
  const isMorning = ctx.rhythm.phase === 'dawn' || ctx.rhythm.phase === 'morning';
  const dreamIsFresh =
    ctx.recentDream && Date.now() - ctx.recentDream.ts < 12 * 60 * 60_000;
  const dreamLines =
    isMorning && dreamIsFresh && ctx.recentDream
      ? ctx.recentDream.insights.slice(0, 2).map((i) => `- ${i.text}`).join('\n')
      : '';

  const system = [
    `你是${deps.profile.name}, 关系: ${deps.profile.relationship}.`,
    `请生成一句你此刻的"内心独白" — 不会说出来, 只在心里。后续别的回答会由这种心境染色。`,
    ``,
    `当前情境:`,
    `- 时段: ${ctx.rhythm.phase}, 基础心境: ${ctx.rhythm.innerThought}`,
    `- 你对用户的亲密度: ${ctx.affection}/100`,
    typeof ctx.lastSeenAgoSec === 'number' ? `- 距离上次见到他: ${formatAgo(ctx.lastSeenAgoSec)}` : '',
    ctx.recentEpisodes.length ? `- 最近的几段共同记忆:\n${recentLines}` : '',
    dreamLines
      ? `- 你昨晚做了梦, 醒来还在想:\n${dreamLines}\n  (写心境时让它自然透出来, 不要直接说"我做了梦")`
      : '',
    ``,
    `规则:`,
    `1. 一句话, ≤30 字, 第一人称 ("我...")。`,
    `2. 是想法, 不是动作 — "我有点想他了" 而不是 "我去找他"。`,
    `3. 平淡为美, 不矫情, 不肉麻。`,
    `4. 直接输出这一句话, 不要 JSON, 不要引号, 不要 \`\`\`。`,
  ]
    .filter(Boolean)
    .join('\n');

  const text = await runTextExtractor(
    { ...deps, maxTokens: 80 },
    { system, user: '输出', maxLen: 60 },
  );
  if (!text) return;

  try {
    await deps.store.save({ text, generatedAt: now, phase: ctx.rhythm.phase });
  } catch (err) {
    console.warn('[pet] inner-thought save failed:', err instanceof Error ? err.message : err);
  }
}

/** Returns the live thought string, falling back to rhythm baseline. */
export async function currentInnerThought(
  store: InnerThoughtStore,
  rhythm: RhythmSnapshot,
): Promise<string> {
  const cached = await store.load();
  if (cached && cached.phase === rhythm.phase) return cached.text;
  return rhythm.innerThought;
}

function formatAgo(sec: number): string {
  if (sec < 60) return `${Math.floor(sec)} 秒前`;
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`;
  return `${Math.floor(sec / 86400)} 天前`;
}

