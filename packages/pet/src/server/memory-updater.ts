import type { ChatMessage } from './storage.ts';
import { MAX_EPISODES, type Episode, type MemoryStore, type PetMemory } from './memory.ts';
import type { PetProfile } from './profile.ts';
import { runJsonExtractor } from './json-extractor.ts';

const MAX_FACTS = 8;
const MIN_TURNS_TO_UPDATE = 3;
const UPDATE_COOLDOWN_MS = 30 * 60_000;

export interface MemoryUpdaterDeps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  profile: PetProfile;
  store: MemoryStore;
}

export type MemoryOp =
  | { op: 'ADD'; text: string }
  | { op: 'UPDATE'; index: number; text: string }
  | { op: 'DELETE'; index: number }
  | { op: 'NOOP' };

export interface MemoryPatch {
  userProfile?: string;
  ops: MemoryOp[];
  /** Optional new episode — emotional snapshot from this exchange. */
  episode?: { gist: string; herFeeling: string; userTone?: Episode['userTone'] };
}

/**
 * mem0-style 4-op classifier. The LLM emits a list of ops over the
 * existing facts array (ADD / UPDATE / DELETE / NOOP), plus an optional
 * userProfile rewrite. Failure of one op never wipes good facts.
 */
export async function maybeUpdateMemory(
  deps: MemoryUpdaterDeps,
  recentMessages: ChatMessage[],
): Promise<void> {
  const current = await deps.store.load();
  const now = Date.now();
  if (now - current.updatedAt < UPDATE_COOLDOWN_MS) return;
  if (recentMessages.length < MIN_TURNS_TO_UPDATE) return;

  const tail = recentMessages
    .slice(-12)
    .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
    .join('\n');

  const factsListing = current.facts.length
    ? current.facts.map((f, i) => `  [${i}] ${f}`).join('\n')
    : '  (空)';

  const system = [
    `你在维护一只 AI 陪伴(${deps.profile.name})对其用户的长期记忆。`,
    `两类记忆:`,
    `  - facts: 关于用户的事实, 知识型 (例: "他在写 markdown 工具")`,
    `  - episodes: 情感切片, 关系型 (例: "他分享了第一个版本, 我替他高兴")`,
    ``,
    `【现有 userProfile】(对用户的整体描述, ≤200 字)`,
    current.userProfile || '(空)',
    ``,
    `【现有 facts】(带索引)`,
    factsListing,
    ``,
    `【最近对话】`,
    tail,
    ``,
    `请输出 JSON, 格式严格如下:`,
    `{`,
    `  "userProfile": "可选: 对用户的更新整体描述",`,
    `  "ops": [`,
    `    {"op": "ADD", "text": "新事实(≤30字, 第三人称)"},`,
    `    {"op": "UPDATE", "index": 0, "text": "改写后的文本"},`,
    `    {"op": "DELETE", "index": 1},`,
    `    {"op": "NOOP"}`,
    `  ],`,
    `  "episode": {`,
    `    "gist": "这次互动里发生的一件值得记住的小事(≤60字)",`,
    `    "herFeeling": "她当时的感受(≤20字, 例: 被信任 / 心疼 / 高兴 / 想保护)",`,
    `    "userTone": "happy | tired | frustrated | neutral | affectionate"`,
    `  }`,
    `}`,
    ``,
    `规则:`,
    `1. facts 的 ADD 仅当对话里有已知 facts 没覆盖的具体信息。`,
    `2. UPDATE/DELETE 仅当已有 fact 被精化或证伪, index 必须有效。`,
    `3. 大多数时候输出 {"ops":[{"op":"NOOP"}]}。`,
    `4. 一次最多 3 个 ops。`,
    `5. episode 仅当对话里真的有情感性时刻才写; 平淡的工具问答省略 episode 键。`,
    `6. herFeeling 用第三人称("她"的视角), 不要用比喻或长描述。`,
    ``,
    `严格只输出 JSON, 不要 \`\`\` 包裹, 不要解释。`,
  ].join('\n');

  const parsed = await runJsonExtractor<MemoryPatch>(deps, {
    system,
    user: '更新记忆',
    maxTokens: 320,
    validate: (raw) => (raw && typeof raw === 'object' ? (raw as MemoryPatch) : null),
  });
  if (!parsed) return;

  const next = applyMemoryPatch(current, parsed, now);
  if (next === current) return;
  try {
    await deps.store.save(next);
  } catch (err) {
    console.warn('[pet] memory-updater save failed:', errMsg(err));
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Pure applier — exported for unit tests. Dedupes by substring match,
 * caps at MAX_FACTS / MAX_EPISODES, returns the same reference if nothing changed.
 */
export function applyMemoryPatch(
  current: PetMemory,
  patch: MemoryPatch,
  now: number,
): PetMemory {
  const ops = Array.isArray(patch.ops) ? patch.ops : [];
  let facts = [...current.facts];
  let episodes = [...current.episodes];
  let dirty = false;

  for (const op of ops.slice(0, 3)) {
    if (!op || typeof op !== 'object') continue;
    if (op.op === 'NOOP') continue;
    if (op.op === 'ADD') {
      const t = sanitizeFact(op.text);
      if (!t) continue;
      if (existsBySubstring(facts, t)) continue;
      facts.push(t);
      dirty = true;
    } else if (op.op === 'UPDATE') {
      const t = sanitizeFact(op.text);
      const i = op.index;
      if (!t || typeof i !== 'number' || i < 0 || i >= facts.length) continue;
      if (facts[i] === t) continue;
      facts[i] = t;
      dirty = true;
    } else if (op.op === 'DELETE') {
      const i = op.index;
      if (typeof i !== 'number' || i < 0 || i >= facts.length) continue;
      facts.splice(i, 1);
      dirty = true;
    }
  }

  if (facts.length > MAX_FACTS) {
    facts = facts.slice(facts.length - MAX_FACTS);
    dirty = true;
  }

  // Append episode if the LLM emitted one. Strict shape; otherwise dropped silently.
  if (patch.episode && typeof patch.episode === 'object') {
    const gist = sanitizeText(patch.episode.gist, 60);
    const feeling = sanitizeText(patch.episode.herFeeling, 30);
    if (gist && feeling) {
      const episode: Episode = {
        ts: now,
        gist,
        herFeeling: feeling,
        ...(typeof patch.episode.userTone === 'string'
          ? { userTone: patch.episode.userTone }
          : {}),
      };
      episodes.push(episode);
      if (episodes.length > MAX_EPISODES) {
        episodes = episodes.slice(episodes.length - MAX_EPISODES);
      }
      dirty = true;
    }
  }

  const newProfile =
    typeof patch.userProfile === 'string' && patch.userProfile.trim()
      ? patch.userProfile.trim().slice(0, 200)
      : current.userProfile;

  if (!dirty && newProfile === current.userProfile) return current;

  return {
    userProfile: newProfile,
    facts,
    episodes,
    updatedAt: now,
  };
}

function sanitizeText(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim().slice(0, max);
  return t.length > 0 ? t : null;
}

function sanitizeFact(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim().slice(0, 60);
  return t.length > 0 ? t : null;
}

function existsBySubstring(facts: string[], candidate: string): boolean {
  const c = candidate.toLowerCase();
  return facts.some((f) => {
    const lf = f.toLowerCase();
    return lf.includes(c) || c.includes(lf);
  });
}

