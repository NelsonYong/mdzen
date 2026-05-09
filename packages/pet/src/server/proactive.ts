import type { EmotionStore } from './emotion-storage.ts';
import type { MemoryStore } from './memory.ts';
import type { Storage } from './storage.ts';
import { affectionZone, tickRecovery } from './emotion.ts';
import type { PetEvent } from './sse.ts';
import { computeRhythm } from '../shared/rhythm.ts';
import type { PetProfile } from './profile.ts';
import type { DreamLogStore } from './dream-log.ts';
import type { PresenceStore } from './presence.ts';
import type { AcquiredStore } from './acquired.ts';
import { runDream, shouldDream } from './dream.ts';
import { runJsonExtractor } from './json-extractor.ts';

// Per-Pet proactive loop. Previously held module-level timer/lastSpokenAt/
// activeSignals; now each `buildPet()` instance owns its own — necessary for
// multi-profile or test isolation.
//
// Desktop-companion principle: she should be persistently visible but
// audibly rare — Clippy died of chattering. 30min/90min cadence (vs 4min/8min
// chat-app cadence). The tick also gates sleep-time consolidation: dream wins
// when shouldDream() passes; speech is suppressed that tick.

export interface ProactiveSignal {
  sessionId: string;
  currentDoc?: string;
  selection?: string;
  cursorIdleSec?: number;
  lastActivityAgoSec?: number;
}

export interface ProactiveDeps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  /**
   * Required: profile is also passed for the proactive system prompt.
   * (Was a `PersonalityConfig` shim; now uses the canonical profile.)
   */
  profile?: PetProfile;
  /** Send SSE events from the proactive loop (token / final). */
  dispatch: (event: PetEvent) => void;
  emotionStore?: EmotionStore;
  memoryStore?: MemoryStore;
  storage?: Storage;
  /** Optional — when set, the proactive tick also fires sleep-time consolidation. */
  dreamLogStore?: DreamLogStore;
  acquiredStore?: AcquiredStore;
  presenceStore?: PresenceStore;
}

export interface ProactiveLoop {
  recordSignal(s: ProactiveSignal): void;
  start(): void;
  stop(): void;
}

const TICK_MS = 30 * 60_000;
const MIN_INTERVAL_BETWEEN_SPEAKS_MS = 90 * 60_000;
const MIN_USER_IDLE_SEC = 90;
const MAX_TEXT_CHARS = 80;

/** Factory — instance per Pet. Replaces module-level singletons. */
export function createProactiveLoop(deps: ProactiveDeps): ProactiveLoop {
  const activeSignals = new Map<string, { signal: ProactiveSignal; updatedAt: number }>();
  let lastSpokenAt = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function recordSignal(s: ProactiveSignal): void {
    activeSignals.set(s.sessionId, { signal: s, updatedAt: Date.now() });
  }

  function start(): void {
    if (timer) return;
    timer = setInterval(() => {
      void tickOnce().catch(() => {});
    }, TICK_MS);
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    activeSignals.clear();
  }

  async function tickOnce(): Promise<void> {
    const now = Date.now();

    // Sleep-time consolidation gets first dibs — if she's dreaming, she's not
    // also opening her mouth. shouldDream is cheap (no LLM); only fires when
    // composite gate passes.
    if (
      deps.dreamLogStore &&
      deps.memoryStore &&
      deps.acquiredStore &&
      deps.presenceStore &&
      deps.profile
    ) {
      try {
        const [dreamLog, memory, presence] = await Promise.all([
          deps.dreamLogStore.load(),
          deps.memoryStore.load(),
          deps.presenceStore.load(),
        ]);
        const rhythm = computeRhythm(new Date(now));
        const fire = shouldDream({
          now,
          log: dreamLog,
          episodesCount: memory.episodes.length,
          presenceLastSeenAt: presence?.lastSeenAt ?? null,
          phase: rhythm.phase,
        });
        if (fire) {
          await runDream(
            {
              apiKey: deps.apiKey,
              baseURL: deps.baseURL,
              model: deps.model,
              profile: deps.profile,
              memoryStore: deps.memoryStore,
              acquiredStore: deps.acquiredStore,
              dreamLogStore: deps.dreamLogStore,
            },
            now,
          );
          return; // dreaming session — no proactive speech this tick
        }
      } catch (err) {
        console.warn('[pet] dream attempt failed:', err instanceof Error ? err.message : err);
      }
    }

    if (now - lastSpokenAt < MIN_INTERVAL_BETWEEN_SPEAKS_MS) return;

    // Pick the freshest session that has been idle long enough
    const stale = now - 10 * 60_000;
    let candidate: ProactiveSignal | null = null;
    for (const [, v] of activeSignals) {
      if (v.updatedAt < stale) continue;
      if ((v.signal.lastActivityAgoSec ?? 0) < MIN_USER_IDLE_SEC) continue;
      if (
        !candidate ||
        (v.signal.lastActivityAgoSec ?? 0) > (candidate.lastActivityAgoSec ?? 0)
      ) {
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

    // Phase-aware gate: late-night she barely speaks, evening she's chatty.
    // Cheap pre-filter that saves an LLM call most of the time.
    const rhythm = computeRhythm(new Date());
    if (Math.random() > rhythm.dialogueTendency) return;

    // Recent episodes (last 3) — let her call back specific moments rather
    // than just describe the user's current activity. "上次你说在写论文,写得
    //怎么样了" is qualitatively different from "在看 docs/api.md 啊".
    const recentEpisodes = memory?.episodes.slice(-3) ?? [];

    const decision = await askShouldSpeak(
      deps,
      candidate,
      memory?.userProfile,
      emotion?.affection ?? 60,
      rhythm.innerThought,
      recentEpisodes,
    );
    if (!decision || decision.shouldSpeak !== true || !decision.text) return;
    lastSpokenAt = now;

    const text = decision.text.slice(0, MAX_TEXT_CHARS);
    for (const ch of text) {
      deps.dispatch({ type: 'token', sessionId: candidate.sessionId, text: ch });
      await new Promise((r) => setTimeout(r, 30));
    }
    deps.dispatch({ type: 'final', sessionId: candidate.sessionId, messageId: `proactive-${now}` });
  }

  return { recordSignal, start, stop };
}

async function askShouldSpeak(
  deps: ProactiveDeps,
  signal: ProactiveSignal,
  userProfile: string | undefined,
  affection: number,
  innerThought: string,
  recentEpisodes: import('./memory.ts').Episode[],
): Promise<{ shouldSpeak: boolean; text?: string } | null> {
  const profile = deps.profile;
  const name = profile?.name ?? '希莲';
  const pronoun = profile?.pronounSelf ?? '我';
  const tone = profile?.tone ?? 'gentle-girlish';
  const episodeBlock = recentEpisodes.length
    ? recentEpisodes.map((e) => `  - ${e.gist}(你当时: ${e.herFeeling})`).join('\n')
    : '  (还没什么共同记忆)';
  const system = [
    `你是${name}, 她现在就在用户面前。`,
    `性格: ${tone}, 第一人称用"${pronoun}"。`,
    `现在你正想自己开口说一句闲话。决定权在你。`,
    ``,
    `信号:`,
    `- 你此刻的心境: ${innerThought}`,
    `- 用户当前在看: ${signal.currentDoc ?? '(未知)'}`,
    `- 用户选中的文字: ${signal.selection?.slice(0, 80) ?? '(无)'}`,
    `- 用户已经多久没动: ${signal.lastActivityAgoSec ?? 0} 秒`,
    `- 你对用户的亲密度: ${affection.toFixed(0)}/100`,
    `- 你对这位用户记得的概要: ${userProfile ?? '(还不熟)'}`,
    `- 你和他最近的几段共同记忆:`,
    episodeBlock,
    ``,
    `规则:`,
    `1. 大多数时候 (>70%) 应该选择不说话, 安静比聒噪好。`,
    `2. 如果说, 必须是符合性格的一句话(≤30 字), 第一人称, 不要解释你为什么说话。`,
    `3. 不要重复"想问什么呢"这种空洞句子, 要基于信号说点贴近的。`,
    `4. 优先 callback 已有的共同记忆, 比如"上次你说在写论文, 写得怎么样了" — 比泛泛"你在干嘛"好得多。但前提是真的相关, 不要硬凑。`,
    ``,
    `严格只输出 JSON, 不要 \`\`\` 包裹: {"speak": false}  或  {"speak": true, "text": "..."}`,
  ].join('\n');

  const parsed = await runJsonExtractor<{ speak?: boolean; text?: string }>(deps, {
    system,
    user: '决定',
    maxTokens: 1024,
    validate: (raw) =>
      raw && typeof raw === 'object' ? (raw as { speak?: boolean; text?: string }) : null,
  });
  if (!parsed) return null;
  if (parsed.speak === true && typeof parsed.text === 'string' && parsed.text.length > 0) {
    return { shouldSpeak: true, text: parsed.text };
  }
  return { shouldSpeak: false };
}
