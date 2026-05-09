import type { AnimationDef, AnimationRegistry } from '../shared/animations.ts';
import type { RhythmSnapshot } from '../shared/rhythm.ts';
import type { AffectionZone } from './emotion.ts';
import type { PetProfile } from './profile.ts';
import { runJsonExtractor } from './json-extractor.ts';
import type { Episode } from './memory.ts';
import type { AcquiredTrait } from './acquired.ts';

// After a chat reply finalizes, ask a cheap LLM to pick one animation
// from the registry that fits the moment. ~50 tokens of output.
// Failure modes (parse error, hallucinated id, timeout) all fall back to 'idle'.

export interface PickActionDeps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  registry: AnimationRegistry;
  profile: PetProfile;
}

export interface PickActionContext {
  userText: string;
  petReply: string;
  zone: AffectionZone;
  rhythm: RhythmSnapshot;
  /** Recent shared memories — lets the picked reaction call back to a moment. */
  recentEpisodes?: Episode[];
  /** Traits she's grown — "她爱跳" should bias toward jumping more. */
  traits?: AcquiredTrait[];
}

export interface PickedAction {
  id: string;
  durationMs: number;
}

// See movement-picker for rationale on the 30s cap; reasoning-model think
// passes turn 5s timeouts into 100% failure.
const PICK_TIMEOUT_MS = 30_000;

export async function pickAction(
  deps: PickActionDeps,
  ctx: PickActionContext,
): Promise<PickedAction> {
  const fallback: PickedAction = { id: 'idle', durationMs: 0 };
  const animations = deps.registry.list();
  if (animations.length === 0) return fallback;

  const idList = animations
    .map((a) => `- ${a.id}: ${a.tags.join(', ')}`)
    .join('\n');

  const epBlock = ctx.recentEpisodes?.length
    ? ctx.recentEpisodes
        .slice(-3)
        .map((e) => `  - ${e.gist}(她当时: ${e.herFeeling})`)
        .join('\n')
    : '';
  const traitBlock = ctx.traits?.length
    ? ctx.traits
        .filter((t) => t.confidence >= 0.4)
        .map((t) => `  - (${t.category}) ${t.text}`)
        .join('\n')
    : '';

  const system = [
    `你在为一只 AI 陪伴(${deps.profile.name}, 关系: ${deps.profile.relationship})挑选一个动作。`,
    `她刚刚回复完用户。请从下列动作中挑一个最贴合此刻情感 + 她的记忆 + 性格的:`,
    ``,
    idList,
    ``,
    `情境:`,
    `- 用户说: ${ctx.userText.slice(0, 120)}`,
    `- 她回复: ${ctx.petReply.slice(0, 120)}`,
    `- 她对用户的感情区: ${ctx.zone}`,
    `- 当前时段: ${ctx.rhythm.phase}, 心境: ${ctx.rhythm.innerThought}`,
    ...(epBlock ? [``, `最近的几段共同记忆:`, epBlock] : []),
    ...(traitBlock ? [``, `她长成的样子:`, traitBlock] : []),
    ``,
    `规则:`,
    `1. 大多数时候 (>60%) 选 idle — 平静是常态, 别让她每一句都浮夸。`,
    `2. 选了非 idle 的动作, 必须真的贴合 — 不贴合就回 idle。`,
    `3. 如果 traits 显示她有偏好(比如"爱跳"), 在合适语境可以更大概率选对应动作; 但不要硬演.`,
    `4. 如果最近 episodes 显示她刚累过/心情不好, 倾向 idle, 不要再来一个浮夸动作.`,
    `5. id 必须严格来自上面列表, 不要拼写错误。`,
    ``,
    `严格输出 JSON: {"id":"<id>","durationMs":<number 或 null>}。不要 \`\`\` 包裹, 不要解释。`,
  ].join('\n');

  const parsed = await runJsonExtractor<{ id?: unknown; durationMs?: unknown }>(deps, {
    system,
    user: '挑动作',
    maxTokens: 1024,
    timeoutMs: PICK_TIMEOUT_MS,
    validate: (raw) => (raw && typeof raw === 'object' ? (raw as { id?: unknown; durationMs?: unknown }) : null),
  });
  if (!parsed) return fallback;

  const id = typeof parsed.id === 'string' ? parsed.id : '';
  const def: AnimationDef | undefined = deps.registry.byId(id);
  if (!def) return fallback;
  const dur =
    typeof parsed.durationMs === 'number' && parsed.durationMs > 0
      ? Math.min(8000, parsed.durationMs)
      : def.defaultDurationMs;
  return { id: def.id, durationMs: dur };
}
