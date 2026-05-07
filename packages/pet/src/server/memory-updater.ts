import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { PersonalityConfig } from '../shared/types.ts';
import type { ChatMessage } from './storage.ts';
import type { MemoryStore, PetMemory } from './memory.ts';

const MAX_FACTS = 30;
const MIN_TURNS_TO_UPDATE = 3;
const UPDATE_COOLDOWN_MS = 30 * 60_000;

export interface MemoryUpdaterDeps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  personality: PersonalityConfig;
  store: MemoryStore;
}

/**
 * Refresh memory after a chat. Cheap LLM call producing
 * - a short rolling summary (≤80 字)
 * - up to 5 new bullet facts about the user
 * Skipped if too soon since last update or too few turns.
 * Errors swallowed — memory is best-effort.
 */
export async function maybeUpdateMemory(
  deps: MemoryUpdaterDeps,
  recentMessages: ChatMessage[],
): Promise<void> {
  const current = await deps.store.load();
  const now = Date.now();
  if (now - current.updatedAt < UPDATE_COOLDOWN_MS) return;
  if (recentMessages.length < MIN_TURNS_TO_UPDATE) return;

  const llm = new ChatOpenAI({
    apiKey: deps.apiKey,
    model: deps.model ?? 'gpt-4o-mini',
    streaming: false,
    maxTokens: 240,
    configuration: deps.baseURL ? { baseURL: deps.baseURL } : undefined,
  });

  const tail = recentMessages
    .slice(-12)
    .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
    .join('\n');

  const sys = new SystemMessage(
    [
      `你在维护一只 AI 阅读伙伴(${deps.personality.name})对其用户的长期记忆。`,
      `下面是已有记忆 + 最近 12 条消息。请输出新的 JSON, 包含两个键:`,
      `  "summary": 一句话(≤80 字), 记述用户的近期偏好/项目/性格观察`,
      `  "facts": 数组, 你新学到的关于用户的具体事实(≤5 条, 每条≤30 字, 第三人称, 不重复已有事实)`,
      ``,
      `已有记忆:`,
      `summary: ${current.summary || '(空)'}`,
      `facts:`,
      ...(current.facts.length ? current.facts.map((f) => `- ${f}`) : ['  (空)']),
      ``,
      `最近对话:`,
      tail,
      ``,
      `严格只输出 JSON, 不要 \`\`\` 包裹, 不要解释。例如: {"summary":"...","facts":["...","..."]}`,
    ].join('\n'),
  );

  let parsed: { summary?: string; facts?: string[] } | null = null;
  try {
    const res = await llm.invoke([sys, new HumanMessage('更新记忆')]);
    const raw = stripThinkBlocks((res?.content as string | undefined) ?? '').trim();
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!parsed) return;

  const newFacts = Array.isArray(parsed.facts)
    ? parsed.facts.filter((f): f is string => typeof f === 'string' && f.length > 0)
    : [];
  const merged = mergeFacts(current.facts, newFacts);

  const next: PetMemory = {
    summary: typeof parsed.summary === 'string' && parsed.summary ? parsed.summary : current.summary,
    facts: merged.slice(-MAX_FACTS),
    updatedAt: now,
  };
  try {
    await deps.store.save(next);
  } catch {}
}

function mergeFacts(existing: string[], incoming: string[]): string[] {
  const set = new Set(existing.map((f) => f.trim()));
  for (const f of incoming) {
    const t = f.trim();
    if (!t) continue;
    if (!set.has(t)) {
      set.add(t);
      existing.push(t);
    }
  }
  return existing;
}

function stripThinkBlocks(s: string): string {
  let out = s.replace(/<think>[\s\S]*?<\/think>/g, '');
  const open = out.lastIndexOf('<think>');
  if (open >= 0 && out.indexOf('</think>', open) < 0) {
    out = out.slice(0, open);
  }
  return out.trim();
}
