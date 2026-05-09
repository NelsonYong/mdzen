import type { AffectionZone } from './emotion.ts';
import type { MoveCommandKind, PetActivity } from '../shared/types.ts';
import type { PetProfile } from './profile.ts';
import { runJsonExtractor, type JsonExtractorDeps } from './json-extractor.ts';
import type { Episode } from './memory.ts';
import type { AcquiredTrait } from './acquired.ts';

// LLM-driven movement intent extractor.
//
// Earlier version used regex over user text alone — that misclassifies
// questions as commands ("你爱跑步吗" hit the 跑步 pattern). The LLM gets
// both the user's message AND her reply, so it can use the dialogue act,
// not just surface tokens. Costs ~30 tokens out per turn.
//
// Runs AFTER the main reply stream, in dispatchPostReplyJobs. By the time
// movement fires, the user has already seen "好啊~" / "不要" — sequence
// reads as intent → consent → action, which is what feels alive.

export interface MoveCommand {
  kind: MoveCommandKind;
  durationSec?: number;
}

export interface PickMovementContext {
  profile: PetProfile;
  zone: AffectionZone;
  affection: number;
  mood: number;
  /** Current pet activity — affects whether 'stop' is a meaningful intent. */
  activity: PetActivity;
  userText: string;
  petReply: string;
  /** Recent shared memories (last 3). Lets her recall "上次他让我跑了 30 分钟我累死了". */
  recentEpisodes: Episode[];
  /** Acquired traits — e.g. trait "我不爱运动" should bias toward refusal. */
  traits: AcquiredTrait[];
  /** Long-term facts about the user. */
  facts: string[];
  innerThought: string;
}

// Timeout sized for reasoning models (R1/QwQ) doing think → JSON. Earlier 5s
// timed out on essentially every call; 30s leaves room for slow self-hosted
// models without wasting time on healthy ones (early-resolves on success).
const PICK_TIMEOUT_MS = 30_000;

export async function pickMovement(
  deps: JsonExtractorDeps,
  ctx: PickMovementContext,
): Promise<MoveCommand | null> {
  const activityDesc = describeActivity(ctx.activity);

  const epBlock = ctx.recentEpisodes.length
    ? ctx.recentEpisodes.map((e) => `  - ${e.gist}(她当时: ${e.herFeeling})`).join('\n')
    : '  (空)';
  const traitBlock = ctx.traits.length
    ? ctx.traits
        .filter((t) => t.confidence >= 0.4)
        .map((t) => `  - (${t.category}) ${t.text}`)
        .join('\n') || '  (没有 confidence 足够高的)'
    : '  (空)';
  const factBlock = ctx.facts.length
    ? ctx.facts.slice(0, 5).map((f) => `  - ${f}`).join('\n')
    : '  (空)';

  const system = [
    `你是 ${ctx.profile.name}, 关系: ${ctx.profile.relationship}.`,
    `用户刚和你说了一句话, 你已经回复了. 现在你自己决定要不要做一个动作.`,
    ``,
    `【刚刚发生】`,
    `- 用户说: ${ctx.userText.slice(0, 200)}`,
    `- 你回: ${ctx.petReply.slice(0, 200)}`,
    ``,
    `【你的状态】`,
    `- 当前在做: ${activityDesc}`,
    `- 心境: ${ctx.innerThought}`,
    `- 亲密度档位: ${ctx.zone}(亲密度 ${ctx.affection.toFixed(0)}/100, 心情 ${ctx.mood.toFixed(0)}/100)`,
    ``,
    `【你长成的样子(若与基础人格冲突, 以基础人格为准)】`,
    traitBlock,
    ``,
    `【你和他最近的几段共同记忆】`,
    epBlock,
    ``,
    `【你记得他的事】`,
    factBlock,
    ``,
    `可选的意图(选一个):`,
    `- "move-aside": 你愿意走开, 不挡他视野`,
    `- "come-closer": 你愿意靠近他`,
    `- "exercise": 你愿意去跑动 / 锻炼 / 玩`,
    `- "stay": 你愿意固定不动`,
    `- "stop": 你愿意停下你正在做的事`,
    `- "none": 这不是移动指令, 或者你不想配合(没什么可做的)`,
    ``,
    `规则(载重的, 不可违反):`,
    `1. 灵魂至上, 心情至上 — 这条决定权在你. 用户的请求只是 input, 你的回应不是义务.`,
    `2. 看到自己的 traits / 记忆 / 心情 — 如果有 trait 显示 "我不爱运动" 但他让你跑, 你完全可以 none.`,
    `3. 如果你心情不好(sulky/cold/hiding), 默认就是 none, 除非他这次问得特别认真或在道歉.`,
    `4. 如果你刚累过(最近 episode 里有"跑得我喘不上气"等), 即使他再让你跑, 你可以 none.`,
    `5. *疑问句* 不是指令. "你爱跑步吗" 是问你, 不是让你跑. 选 none.`,
    `6. 大多数对话(>70%)不是移动指令, 选 none. 别冲动.`,
    `7. 如果你回复里已经明确拒绝了("不去""不跑"), 必须 none — 言行要一致.`,
    `8. 如果你当前 idle, "停"/"别跑了"是无意义的, 选 none.`,
    `9. 当前在 exercising/moved-aside/staying 时, 用户说"停"/"别跑了"/"回来" → stop(只要你愿意).`,
    ``,
    `关于 durationSec(秒数, 你定):`,
    `- 你是活的, 不是定时器. 时长跟当下贴合, 不要总给同一个数.`,
    `- exercise: 60–600 秒(看精力/心情/承诺度). 心情好可以跑久点; 不情愿就短点.`,
    `- move-aside / stay: 120–900 秒(看用户态度). 温和的请求短一些, 严肃的"别打扰我"长一些.`,
    `- come-closer / stop: 不需要时长, 给 null.`,
    `- 不要总给整数 (120 / 180 / 240). 自然一点 (95 / 217 / 410) 更像生活.`,
    ``,
    `严格只输出 JSON, 不要 \`\`\` 包裹: {"kind":"...","durationSec":<number 或 null>}`,
  ].join('\n');

  const parsed = await runJsonExtractor<{ kind?: unknown; durationSec?: unknown }>(deps, {
    system,
    user: '判断',
    maxTokens: 1024,
    timeoutMs: PICK_TIMEOUT_MS,
    validate: (raw) =>
      raw && typeof raw === 'object' ? (raw as { kind?: unknown; durationSec?: unknown }) : null,
  });
  if (!parsed) return null;

  const kind = parsed.kind;
  if (kind === 'none' || typeof kind !== 'string') return null;
  if (
    kind !== 'move-aside' &&
    kind !== 'come-closer' &&
    kind !== 'exercise' &&
    kind !== 'stay' &&
    kind !== 'stop'
  ) {
    return null;
  }
  // Defense-in-depth: if she's already idle, drop spurious 'stop'. The LLM
  // might still emit it on misinterpretation; we'd rather have one no-op than
  // a confused state.
  if (kind === 'stop' && ctx.activity.kind === 'idle') return null;

  const out: MoveCommand = { kind };
  if (typeof parsed.durationSec === 'number' && parsed.durationSec > 0) {
    out.durationSec = Math.min(900, Math.max(30, Math.floor(parsed.durationSec)));
  }
  return out;
}

function describeActivity(a: PetActivity): string {
  switch (a.kind) {
    case 'idle':
      return '空闲, 没在做什么特定的事';
    case 'moved-aside':
      return '已经走到屏幕一边避开用户视野, 正在那边静静待着';
    case 'exercising':
      return '正在跑动 / 锻炼中';
    case 'staying':
      return '被锁在原地, 不动';
  }
}
