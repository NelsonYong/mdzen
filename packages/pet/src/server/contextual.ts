import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { EmotionState } from './emotion.ts';
import type { PersonalityConfig } from '../shared/types.ts';
import type { ChatMessage } from './storage.ts';

export interface ContextualDeps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  personality: PersonalityConfig;
}

export async function generateContextualPhrase(
  deps: ContextualDeps,
  state: EmotionState,
  recentMessages: ChatMessage[],
  currentDocTitle: string,
): Promise<string> {
  const llm = new ChatOpenAI({
    apiKey: deps.apiKey,
    model: deps.model ?? 'gpt-4o-mini',
    streaming: false,
    maxTokens: 60,
    configuration: deps.baseURL ? { baseURL: deps.baseURL } : undefined,
  });

  const eventsTail = recentMessages
    .slice(-5)
    .map((m) => `${m.role}: ${m.content.slice(0, 80)}`)
    .join('\n');

  const sys = new SystemMessage(
    [
      `根据下面信息, 用一句话(最多 25 字)描写她此刻的心境。`,
      `视角: 第三人称, 像在看她, 不许用"我"。`,
      ``,
      `性格: ${deps.personality.baseTone}`,
      `最近事件:`,
      eventsTail || '(无)',
      `当前文档: ${currentDocTitle || '(未知)'}`,
      `affection: ${state.affection.toFixed(0)}  mood: ${state.mood.toFixed(0)}`,
      ``,
      `输出: 只一句话, 不要引号。`,
    ].join('\n'),
  );

  try {
    const res = await llm.invoke([sys, new HumanMessage('生成')]);
    const text = ((res?.content as string | undefined) ?? '').trim();
    return text.slice(0, 60);
  } catch {
    return '';
  }
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
