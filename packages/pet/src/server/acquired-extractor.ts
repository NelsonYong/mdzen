import type { ChatMessage } from './storage.ts';
import type { PetProfile } from './profile.ts';
import {
  applyAcquiredPatch,
  formatTraitsForExtractor,
  type AcquiredOp,
  type AcquiredPatch,
  type AcquiredStore,
} from './acquired.ts';
import { runJsonExtractor } from './json-extractor.ts';

// Slow LLM update pass — discovers SOUL acquisitions from recent dialogue.
// Cooldown is 60min (vs memory-updater's 30min) because acquired traits
// should evolve slowly, not flicker per session.

const MIN_TURNS = 6;
const COOLDOWN_MS = 60 * 60_000;

export interface AcquiredExtractorDeps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  profile: PetProfile;
  store: AcquiredStore;
}

export async function maybeUpdateAcquired(
  deps: AcquiredExtractorDeps,
  recent: ChatMessage[],
): Promise<void> {
  const current = await deps.store.load();
  const now = Date.now();
  if (now - current.updatedAt < COOLDOWN_MS) return;
  if (recent.length < MIN_TURNS) return;

  const tail = recent
    .slice(-12)
    .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
    .join('\n');

  const system = [
    `你在维护${deps.profile.name}的"成长层" — 她和基础人格并存的小习惯 / 偏好 / 对用户的看法。`,
    `基础人格(永远不可冲突):`,
    deps.profile.soul.slice(0, 600),
    ``,
    `【已有成长层】(带索引)`,
    formatTraitsForExtractor(current),
    ``,
    `【最近对话】`,
    tail,
    ``,
    `请输出 JSON:`,
    `{`,
    `  "ops": [`,
    `    {"op": "ADD", "category": "habit | preference | relation_belief", "text": "≤60字, 第一人称"},`,
    `    {"op": "REINFORCE", "index": <int>},`,
    `    {"op": "CONTRADICT", "index": <int>},`,
    `    {"op": "NOOP"}`,
    `  ]`,
    `}`,
    ``,
    `规则:`,
    `1. 大多数对话是平淡的 — NOOP 最常见。`,
    `2. ADD 仅当本次对话揭示了一个 *模式*, 不是单次事件; 单次事件该写进 episode, 不是这里。`,
    `3. ADD 必须第一人称, 严格不能与基础人格冲突。例: 基础是"温柔", 就不能 ADD "我变冷漠了"。`,
    `4. REINFORCE: 已有 trait 被本次对话再次印证 — index 必须是上面已有索引。`,
    `5. CONTRADICT: 已有 trait 被本次对话直接证伪。`,
    `6. 一次最多 2 个 ops。`,
    ``,
    `严格只输出 JSON, 不要 \`\`\` 包裹, 不要解释。`,
  ].join('\n');

  const parsed = await runJsonExtractor<AcquiredPatch>(deps, {
    system,
    user: '更新成长层',
    maxTokens: 1024,
    validate: (raw) =>
      raw && typeof raw === 'object' && Array.isArray((raw as AcquiredPatch).ops)
        ? (raw as AcquiredPatch)
        : null,
  });
  if (!parsed) return;

  // Sanitize ops shape minimally — applier rejects bad ones too, but this is
  // a lightweight pre-filter to avoid logging garbage.
  const cleanOps: AcquiredOp[] = parsed.ops.filter((o): o is AcquiredOp => {
    if (!o || typeof o !== 'object') return false;
    if (o.op === 'NOOP') return true;
    if (o.op === 'ADD') return typeof o.text === 'string' && typeof o.category === 'string';
    if (o.op === 'REINFORCE' || o.op === 'CONTRADICT') return typeof o.index === 'number';
    return false;
  });

  const next = applyAcquiredPatch(current, { ops: cleanOps }, Date.now());
  if (next === current) return;
  try {
    await deps.store.save(next);
  } catch (err) {
    console.warn('[pet] acquired-extractor save failed:', err instanceof Error ? err.message : err);
  }
}
