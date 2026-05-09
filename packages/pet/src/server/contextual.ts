import type { EmotionState } from './emotion.ts';
import type { ChatMessage } from './storage.ts';
import type { PetProfile } from './profile.ts';
import { runTextExtractor } from './json-extractor.ts';

export interface ContextualDeps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  profile: PetProfile;
}

export async function generateContextualPhrase(
  deps: ContextualDeps,
  state: EmotionState,
  recentMessages: ChatMessage[],
  currentDocTitle: string,
): Promise<string> {
  const eventsTail = recentMessages
    .slice(-5)
    .map((m) => `${m.role}: ${m.content.slice(0, 80)}`)
    .join('\n');

  const system = [
    `根据下面信息, 用一句话(最多 25 字)描写她此刻的心境。`,
    `视角: 第三人称, 像在看她, 不许用"我"。`,
    ``,
    `性格: ${deps.profile.tone}`,
    `最近事件:`,
    eventsTail || '(无)',
    `当前文档: ${currentDocTitle || '(未知)'}`,
    `affection: ${state.affection.toFixed(0)}  mood: ${state.mood.toFixed(0)}`,
    ``,
    `输出: 只一句话, 不要引号。`,
  ].join('\n');

  const text = await runTextExtractor(
    { ...deps, maxTokens: 1024 },
    { system, user: '生成', maxLen: 60 },
  );
  return text ?? '';
}

export function shouldRegenerate(
  state: EmotionState,
  prevAffection: number | undefined,
  now: number,
): boolean {
  if (!state.contextualPhrase || !state.contextualPhraseAt) return true;
  if (now - state.contextualPhraseAt > 2 * 60 * 60_000) return true;
  if (prevAffection != null) {
    const a1 = zoneIdx(prevAffection);
    const a2 = zoneIdx(state.affection);
    if (a1 !== a2) return true;
  }
  return false;
}

function zoneIdx(a: number): number {
  if (a >= 80) return 4;
  if (a >= 50) return 3;
  if (a >= 25) return 2;
  if (a >= 10) return 1;
  return 0;
}
