import type { PetProfile } from './profile.ts';
import type { AffectionZone } from './emotion.ts';
import { runJsonExtractor, type JsonExtractorDeps } from './json-extractor.ts';

// Mood-aware acknowledgment + willingness gate.
//
// Replaces the client-side fixed ack pool ("看到啦~", "听到啦"). Now she reacts
// to incoming messages with a tone shaped by her current emotion zone, and may
// outright refuse to answer if her mood is bad — a small piece of agency that
// makes the emotion ladder feel load-bearing instead of decorative.
//
// One cheap LLM call per chat turn (~80 tokens out, ~250 in). Streaming off —
// the ack is short enough that we ship it as one event.

export interface MoodAckResult {
  /** ≤30 chars, first-person, mood-colored. e.g. "嗯, 我看看" / "...今天不想理你" */
  ack: string;
  /** false → main answer is suppressed; ack stands as the whole reply. */
  willing: boolean;
}

export interface MoodAckInput {
  profile: PetProfile;
  zone: AffectionZone;
  affection: number;
  mood: number;
  /** Her current internal monologue (rhythm or LLM-refreshed). */
  innerThought: string;
  /** What the user just sent. */
  userText: string;
  /** Most recent shared memories (last 3), so callbacks feel grounded. */
  recentEpisodes: { gist: string; herFeeling: string }[];
}

const MAX_ACK_CHARS = 30;

export async function runMoodAck(
  deps: JsonExtractorDeps,
  input: MoodAckInput,
): Promise<MoodAckResult | null> {
  const { profile, zone, affection, mood, innerThought, userText, recentEpisodes } = input;

  const epBlock = recentEpisodes.length
    ? recentEpisodes.map((e) => `  - ${e.gist}(她当时: ${e.herFeeling})`).join('\n')
    : '  (空)';

  const system = [
    `你是${profile.name}, 关系: ${profile.relationship}.`,
    `用户刚发了一句话。你要在认真回答之前, 先决定 "现在想不想理他" 并给一句短反应.`,
    ``,
    `你的当前状态:`,
    `- 心境: ${innerThought}`,
    `- 亲密度档位: ${zone}`,
    `- 数值参考: 亲密度 ${affection.toFixed(0)}/100, 心情 ${mood.toFixed(0)}/100`,
    `- 最近你和他的几段共同记忆:`,
    epBlock,
    ``,
    `他刚说: ${userText.slice(0, 200)}`,
    ``,
    `规则(载重的):`,
    `1. 输出一句 ≤${MAX_ACK_CHARS} 字的第一人称反应 (ack), 比如 "嗯, 我看看" / "..今天有点累" / "好啊, 让我想想".`,
    `   这一句必须符合你当前的情绪基调; 冷的时候冷, 热的时候热, 不要演.`,
    `2. willing=true 表示你愿意接下来认真回答他; false 表示拒绝.`,
    `3. 默认行为:`,
    `   - adored / friendly: willing 默认 true; 除非他这次明显恶意.`,
    `   - sulky: 60% true, 40% false; 看他这次问得是否走心, 是否在道歉/示好.`,
    `   - cold: 默认 false; 除非他明显在认真道歉或问得很真诚.`,
    `   - hiding: 几乎总是 false; ack 可能只是 "..." 或 "嗯".`,
    `4. 不要在 ack 里解释规则或剧透 willing, 它就是一句自然反应.`,
    `5. 如果 willing=false, ack 本身就是你给他的全部回应, 把话说完整.`,
    ``,
    `严格只输出 JSON, 不要 \`\`\` 包裹: {"ack": "...", "willing": true|false}`,
  ].join('\n');

  return await runJsonExtractor<MoodAckResult>(deps, {
    system,
    user: '决定',
    // Reasoning models (R1/QwQ) easily burn 400-800 tokens in <think> before
    // emitting the 30-char ack. Sized accordingly; truly tiny ack is fine,
    // we just need the budget for the think pass.
    maxTokens: 1024,
    validate: (raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const p = raw as Partial<MoodAckResult>;
      if (typeof p.ack !== 'string') return null;
      const ack = p.ack.trim().slice(0, MAX_ACK_CHARS);
      if (!ack) return null;
      if (typeof p.willing !== 'boolean') return null;
      return { ack, willing: p.willing };
    },
  });
}

/**
 * Deterministic fallback when the LLM call fails or times out. Picks a tone-
 * appropriate ack from a zone-keyed pool and sets `willing` from the zone.
 * This keeps the chat flow alive even if the side-model is unreachable.
 */
export function fallbackMoodAck(zone: AffectionZone, random = Math.random()): MoodAckResult {
  const POOLS: Record<AffectionZone, string[]> = {
    adored: ['嗯哼~', '我看看~', '好呀好呀~'],
    friendly: ['嗯, 我看看', '好的'],
    sulky: ['...嗯', '看吧'],
    cold: ['嗯。', '...'],
    hiding: ['...'],
  };
  const pool = POOLS[zone];
  const ack = pool[Math.floor(random * pool.length)] ?? pool[0]!;
  // hiding/cold default to refusal; the rest answer.
  const willing = zone !== 'hiding' && zone !== 'cold';
  return { ack, willing };
}
