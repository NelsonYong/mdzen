import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { PersonalityConfig } from '../shared/types.ts';
import type { EmotionStore } from './emotion-storage.ts';
import type { MemoryStore } from './memory.ts';
import type { Storage } from './storage.ts';
import { affectionZone, tickRecovery } from './emotion.ts';
import { dispatch } from './sse.ts';

export interface ProactiveSignal {
  sessionId: string;
  currentDoc?: string;
  selection?: string;
  cursorIdleSec?: number;
  lastActivityAgoSec?: number;
}

interface ProactiveDeps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  personality: PersonalityConfig;
  emotionStore?: EmotionStore;
  memoryStore?: MemoryStore;
  storage?: Storage;
}

const TICK_MS = 4 * 60_000;
const MIN_INTERVAL_BETWEEN_SPEAKS_MS = 8 * 60_000;
const MIN_USER_IDLE_SEC = 90;
const MAX_TEXT_CHARS = 80;

const activeSignals = new Map<string, { signal: ProactiveSignal; updatedAt: number }>();
let lastSpokenAt = 0;
let timer: ReturnType<typeof setInterval> | null = null;

export function recordSignal(s: ProactiveSignal): void {
  activeSignals.set(s.sessionId, { signal: s, updatedAt: Date.now() });
}

export function startProactiveLoop(deps: ProactiveDeps): () => void {
  if (timer) return () => stopProactiveLoop();
  timer = setInterval(() => {
    void tickOnce(deps).catch(() => {});
  }, TICK_MS);
  return () => stopProactiveLoop();
}

export function stopProactiveLoop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  activeSignals.clear();
}

async function tickOnce(deps: ProactiveDeps): Promise<void> {
  const now = Date.now();
  if (now - lastSpokenAt < MIN_INTERVAL_BETWEEN_SPEAKS_MS) return;

  // Pick the freshest session that has been idle long enough
  const stale = now - 10 * 60_000;
  let candidate: ProactiveSignal | null = null;
  for (const [, v] of activeSignals) {
    if (v.updatedAt < stale) continue;
    if ((v.signal.lastActivityAgoSec ?? 0) < MIN_USER_IDLE_SEC) continue;
    if (!candidate || (v.signal.lastActivityAgoSec ?? 0) > (candidate.lastActivityAgoSec ?? 0)) {
      candidate = v.signal;
    }
  }
  if (!candidate) return;

  const memory = deps.memoryStore ? await deps.memoryStore.load() : null;
  const emotion = deps.emotionStore
    ? tickRecovery(await deps.emotionStore.load(), now)
    : null;
  if (emotion) {
    const z = affectionZone(emotion.affection);
    if (z === 'cold' || z === 'hiding') return;
  }

  const decision = await askShouldSpeak(deps, candidate, memory?.summary, emotion?.affection ?? 60);
  if (!decision || decision.shouldSpeak !== true || !decision.text) return;
  lastSpokenAt = now;

  const text = decision.text.slice(0, MAX_TEXT_CHARS);
  for (const ch of text) {
    dispatch({ type: 'token', sessionId: candidate.sessionId, text: ch });
    await new Promise((r) => setTimeout(r, 30));
  }
  dispatch({ type: 'final', sessionId: candidate.sessionId, messageId: `proactive-${now}` });
}

async function askShouldSpeak(
  deps: ProactiveDeps,
  signal: ProactiveSignal,
  memorySummary: string | undefined,
  affection: number,
): Promise<{ shouldSpeak: boolean; text?: string } | null> {
  const llm = new ChatOpenAI({
    apiKey: deps.apiKey,
    model: deps.model ?? 'gpt-4o-mini',
    streaming: false,
    maxTokens: 120,
    configuration: deps.baseURL ? { baseURL: deps.baseURL } : undefined,
  });

  const sys = new SystemMessage(
    [
      `你是${deps.personality.name},一个住在 markdown 阅读器里的 AI 阅读伙伴。`,
      `性格: 温柔, 少女, 第一人称用"${deps.personality.pronoun}"。`,
      `现在你正想自己开口说一句闲话。决定权在你。`,
      ``,
      `信号:`,
      `- 用户当前在看: ${signal.currentDoc ?? '(未知)'}`,
      `- 用户选中的文字: ${signal.selection?.slice(0, 80) ?? '(无)'}`,
      `- 用户已经多久没动: ${signal.lastActivityAgoSec ?? 0} 秒`,
      `- 你对用户的亲密度: ${affection.toFixed(0)}/100`,
      `- 你对这位用户记得的概要: ${memorySummary ?? '(还不熟)'}`,
      ``,
      `规则:`,
      `1. 大多数时候 (>70%) 应该选择不说话, 安静比聒噪好。`,
      `2. 如果说, 必须是符合性格的一句话(≤30 字), 第一人称, 不要解释你为什么说话。`,
      `3. 不要重复"想问什么呢"这种空洞句子, 要基于信号说点贴近的。`,
      ``,
      `严格只输出 JSON, 不要 \`\`\` 包裹: {"speak": false}  或  {"speak": true, "text": "..."}`,
    ].join('\n'),
  );

  try {
    const res = await llm.invoke([sys, new HumanMessage('决定')]);
    const raw = ((res?.content as string | undefined) ?? '').trim();
    const cleaned = stripThinkBlocks(raw);
    const parsed = JSON.parse(cleaned) as { speak?: boolean; text?: string };
    if (parsed.speak === true && typeof parsed.text === 'string' && parsed.text.length > 0) {
      return { shouldSpeak: true, text: parsed.text };
    }
    return { shouldSpeak: false };
  } catch {
    return null;
  }
}

function stripThinkBlocks(s: string): string {
  let out = s.replace(/<think>[\s\S]*?<\/think>/g, '');
  const open = out.lastIndexOf('<think>');
  if (open >= 0 && out.indexOf('</think>', open) < 0) {
    out = out.slice(0, open);
  }
  return out.trim();
}
