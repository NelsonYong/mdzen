import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { HumanMessage, AIMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { resolve, relative, extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { ChatMessage } from './storage.ts';
import { buildTools, type ToolContext } from './tools.ts';
import type { PetEvent } from './sse.ts';
import type { ProposalRegistry } from './proposals.ts';
import type { EmotionStore } from './emotion-storage.ts';
import { affectionZone, PRESET_PHRASES, tickRecovery, applyPatientFollowUp } from './emotion.ts';
import { generateContextualPhrase, shouldRegenerate } from './contextual.ts';
import type { MemoryStore } from './memory.ts';
import { maybeUpdateMemory } from './memory-updater.ts';
import { computeRhythm, nowPromptLine } from '../shared/rhythm.ts';
import type { PetProfile } from './profile.ts';
import type { AnimationRegistry } from '../shared/animations.ts';
import { pickAction } from './action-picker.ts';
import {
  type InnerThoughtStore,
  currentInnerThought,
  maybeRefreshInnerThought,
} from './inner-thought.ts';
import {
  type AcquiredStore,
  buildAcquiredPromptBlock,
} from './acquired.ts';
import { maybeUpdateAcquired } from './acquired-extractor.ts';
import {
  type PresenceStore,
  formatLastSeenLine,
  formatCompanionshipLine,
  formatSessionBoundaryLine,
  lastSeenAgoSec,
} from './presence.ts';
import { type DreamLogStore, mostRecentDream } from './dream-log.ts';
import {
  type DayMoodStore,
  currentDayMood,
  maybeRefreshDayMood,
} from './day-mood.ts';
import { runMoodAck, fallbackMoodAck } from './mood-ack.ts';

// ─────────────────────────────────────────────────────────────────────────────
// System prompt assembly order — load-bearing, do not reorder casually.
//
//   1. SOUL (profile.soul)               永久身份, 不可被记忆覆盖
//   2. behavior rules (relation/forbid/tone/length)
//   3a. 【上次见到他】 lastSeen line      presence
//   3b. 【我们】 companionship line       presence (firstSeenAt + sessionsCount + milestone)
//   3c. 【新一次见面】 session boundary    presence (only when ≥4h gap)
//   4a. 【她此刻心境】 inner thought       rhythm (or LLM-refreshed)
//   4b. 【今天她的状态】 day-mood          24h baseline (LLM-refreshed at dawn/morning)
//   5. 【你逐渐学到的...】 acquired       confidence-filtered traits
//   6. 【基础情绪】 zone phrase           emotion zone
//   7. 【此刻心境】 contextual phrase     emotion contextualPhrase
//   8. 【用户当前在看】 currentDoc        per-request context
//   9. 【关于这位用户的概要】 userProfile  memory
//  10. 【你记得的关于这位用户的事】 facts memory
//  11. 【最近的几段共同记忆】 episodes    memory (last 2)
//  12. (every 8 turns) reinject SOUL + zone — combats persona drift
//
// Each block is conditional on its store/data being present. SOUL is FIRST
// and IMMUTABLE — memory/dream may rewrite userProfile/facts/episodes but
// never the SOUL body. Acquired layer comes AFTER soul/behavior so it can
// never override identity, but BEFORE memory so it influences how she
// frames the user's facts.
// ─────────────────────────────────────────────────────────────────────────────

// Re-inject soul + zone every N turns to combat persona drift documented at 8-12 turns.
const REINJECT_EVERY_N_TURNS = 8;

export interface AgentDeps {
  workspaceRoot: string;
  apiKey: string;
  baseURL?: string;
  model?: string;
  /** Resolved persona profile — name, relationship, soul, forbid, etc. */
  profile: PetProfile;
  /** Animation registry; used by post-reply LLM action picker. */
  animations: AnimationRegistry;
  /** When true, run the LLM action picker after each reply. Default true. */
  llmActions?: boolean;
  proposals?: ProposalRegistry;
  emotionStore?: EmotionStore;
  memoryStore?: MemoryStore;
  innerThoughtStore?: InnerThoughtStore;
  acquiredStore?: AcquiredStore;
  presenceStore?: PresenceStore;
  dreamLogStore?: DreamLogStore;
  dayMoodStore?: DayMoodStore;
  /** SSE event sink. Per-Pet instance, no module singletons. */
  dispatch: (event: PetEvent) => void;
}

export interface PetAgent {
  run(
    sessionId: string,
    history: ChatMessage[],
    userText: string,
    context?: { currentDoc?: string },
  ): Promise<string>;
}

function isInside(root: string, path: string): boolean {
  const r = relative(root, path);
  return r !== '' && !r.startsWith('..') && !r.startsWith('/');
}

export function createPetAgent(deps: AgentDeps): PetAgent {
  const profile = deps.profile;
  const llm = new ChatOpenAI({
    apiKey: deps.apiKey,
    model: deps.model ?? 'gpt-4o-mini',
    streaming: true,
    configuration: deps.baseURL ? { baseURL: deps.baseURL } : undefined,
  });
  const baseSystemPrompt = buildSystemPrompt(profile, !!deps.proposals);
  const llmActions = deps.llmActions !== false;

  return {
    async run(sessionId, history, userText, context) {
      const now = Date.now();
      const { systemPrompt, presence, rhythm } = await assembleSystemPrompt(
        deps,
        profile,
        baseSystemPrompt,
        history,
        context,
        now,
      );

      // Mood-aware ack + willingness gate. Runs BEFORE the main answer stream
      // so she can refuse outright when emotion is bad. Skipped only when
      // there's no emotion store wired (silent / test setups).
      if (deps.emotionStore) {
        const emotionRaw = await deps.emotionStore.load();
        // 1. tick passive recovery
        // 2. patient follow-up boost: if she refused recently and the user is
        //    coming back gently (not spam), bump affection like a 'sorry'.
        //    This is what lets a cold-zone session warm back up over a few
        //    careful retries instead of staying locked out.
        let emotion = tickRecovery(emotionRaw, now);
        const boosted = applyPatientFollowUp(emotion, now);
        if (boosted !== emotion) {
          emotion = boosted;
          await deps.emotionStore.save(emotion);
        }
        const zone = affectionZone(emotion.affection);
        const memForAck = deps.memoryStore ? await deps.memoryStore.load() : null;
        const recentEpisodes =
          memForAck?.episodes.slice(-3).map((e) => ({ gist: e.gist, herFeeling: e.herFeeling })) ??
          [];
        const ackResult =
          (await runMoodAck(
            { apiKey: deps.apiKey, baseURL: deps.baseURL, model: deps.model },
            {
              profile,
              zone,
              affection: emotion.affection,
              mood: emotion.mood,
              innerThought: rhythm.innerThought,
              userText,
              recentEpisodes,
            },
          )) ?? fallbackMoodAck(zone);

        deps.dispatch({
          type: 'ack',
          sessionId,
          text: ackResult.ack,
          willing: ackResult.willing,
        });

        // Track refusal cycle so the next turn's patient follow-up boost
        // (or its absence) sees the right state.
        if (!ackResult.willing) {
          await deps.emotionStore.save({ ...emotion, lastRefusalAt: now });
        } else if (typeof emotion.lastRefusalAt === 'number') {
          const cleared = { ...emotion };
          delete cleared.lastRefusalAt;
          await deps.emotionStore.save(cleared);
        }

        if (!ackResult.willing) {
          // Refusal stands as the whole reply. No main agent stream, no post-
          // reply jobs — there's no actual answer to extract memory from.
          deps.dispatch({ type: 'final', sessionId, messageId: `${Date.now()}` });
          return ackResult.ack;
        }
      }

      const ctx: ToolContext | undefined = deps.proposals
        ? {
            async proposeEdit(input) {
              const target = resolve(deps.workspaceRoot, input.path);
              if (!isInside(deps.workspaceRoot, target)) throw new Error('path outside workspace');
              if (extname(target) !== '.md') throw new Error('only .md files');
              const content = await readFile(target, 'utf-8');
              if (!content.includes(input.oldText)) {
                throw new Error('oldText not found verbatim in current file');
              }
              const id = deps.proposals!.create(
                {
                  sessionId,
                  path: input.path,
                  oldText: input.oldText,
                  newText: input.newText,
                  reason: input.reason,
                },
                Date.now(),
              );
              deps.dispatch({
                type: 'propose-edit',
                sessionId,
                proposalId: id,
                path: input.path,
                oldText: input.oldText,
                newText: input.newText,
                reason: input.reason,
              });
              return `提议已发送给用户, 等候应用或拒绝(proposalId=${id})`;
            },
          }
        : undefined;

      const tools = buildTools(deps.workspaceRoot, ctx);
      const agent = createAgent({ model: llm, tools });

      const messages: BaseMessage[] = [
        new SystemMessage(systemPrompt),
        ...history.map((m) =>
          m.role === 'user'
            ? new HumanMessage(m.content)
            : m.role === 'assistant'
              ? new AIMessage(m.content)
              : new SystemMessage(m.content),
        ),
        new HumanMessage(userText),
      ];

      let acc = '';
      try {
        const stream = await agent.stream(
          { messages },
          { streamMode: 'messages' } as Record<string, unknown>,
        );
        for await (const chunk of stream as AsyncIterable<unknown>) {
          let msg: unknown = chunk;
          if (Array.isArray(chunk)) msg = chunk[0];
          const m = msg as { content?: unknown; getType?: () => string } | undefined;
          if (!m) continue;
          const role = typeof m.getType === 'function' ? m.getType() : undefined;
          if (role && role !== 'ai') continue;
          const content = m.content;
          const text = typeof content === 'string' ? content : '';
          if (text) {
            acc += text;
            deps.dispatch({ type: 'token', sessionId, text });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[pet agent] stream error:', message);
        deps.dispatch({ type: 'error', sessionId, message });
        throw err;
      }
      deps.dispatch({ type: 'final', sessionId, messageId: `${Date.now()}` });

      // All post-reply work runs through one fan-out — fire-and-forget,
      // observable, and never blocks `acc` return.
      dispatchPostReplyJobs(deps, profile, {
        sessionId,
        history,
        userText,
        reply: acc,
        presence,
        rhythm,
        llmActions,
      });

      return acc;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt assembly — extracted for unit testing + clarity.
// Builds the system prompt deterministically in the documented order. Returns
// the assembled string plus a snapshot of state already loaded (presence /
// rhythm) so the post-reply jobs don't reload them.
// ─────────────────────────────────────────────────────────────────────────────

import type { Presence } from './presence.ts';
import type { RhythmSnapshot } from '../shared/rhythm.ts';

export interface PromptAssemblyResult {
  systemPrompt: string;
  presence: Presence | null;
  rhythm: RhythmSnapshot;
  zonePhrase: string;
}

export async function assembleSystemPrompt(
  deps: AgentDeps,
  profile: PetProfile,
  baseSystemPrompt: string,
  history: ChatMessage[],
  context: { currentDoc?: string } | undefined,
  now: number,
): Promise<PromptAssemblyResult> {
  let systemPrompt = baseSystemPrompt;

  // 3. lastSeen + companionship + session-boundary — load presence BEFORE the
  //    user touch lands so we get the perceived gap.
  const presence = deps.presenceStore ? await deps.presenceStore.load() : null;
  const lastSeenLine = formatLastSeenLine(presence, now);
  if (lastSeenLine) {
    systemPrompt = `${systemPrompt}\n【上次见到他】${lastSeenLine}`;
  }
  const companionship = formatCompanionshipLine(presence, now);
  if (companionship) {
    systemPrompt = `${systemPrompt}\n【我们】${companionship}`;
  }
  const sessionBoundary = formatSessionBoundaryLine(presence, now);
  if (sessionBoundary) {
    systemPrompt = `${systemPrompt}\n【新一次见面】${sessionBoundary}`;
  }

  // 4. wall-clock + rhythm + inner thought
  const nowDate = new Date(now);
  const rhythm = computeRhythm(nowDate);
  const thoughtText = deps.innerThoughtStore
    ? await currentInnerThought(deps.innerThoughtStore, rhythm)
    : rhythm.innerThought;
  systemPrompt = `${systemPrompt}\n${nowPromptLine(nowDate)}`;
  systemPrompt = `${systemPrompt}\n【她此刻心境】${thoughtText}(${rhythm.phase})`;

  // 4b. day-mood — slow 24h baseline. Independent of inner-thought (hourly).
  const dayMood = deps.dayMoodStore ? await currentDayMood(deps.dayMoodStore, now) : null;
  if (dayMood) {
    systemPrompt = `${systemPrompt}\n【今天她的状态】${dayMood}`;
  }

  // 5. acquired layer (filtered by confidence)
  if (deps.acquiredStore) {
    const acquired = await deps.acquiredStore.load();
    const block = buildAcquiredPromptBlock(acquired);
    if (block) systemPrompt = `${systemPrompt}\n\n${block}`;
  }

  // 6, 7. emotion zone + contextual phrase
  let zonePhrase = '';
  if (deps.emotionStore) {
    const raw = await deps.emotionStore.load();
    const ticked = tickRecovery(raw, now);
    const zone = affectionZone(ticked.affection);
    zonePhrase = PRESET_PHRASES[zone];
    const fragments = [`【基础情绪】${zonePhrase}`];
    if (ticked.contextualPhrase) {
      fragments.push(`【此刻心境】${ticked.contextualPhrase}`);
    }
    systemPrompt = `${systemPrompt}\n\n${fragments.join('\n')}`;
  }

  // 8. currentDoc — per-request
  if (context?.currentDoc) {
    systemPrompt = `${systemPrompt}\n\n【用户当前在看】${context.currentDoc}`;
  }

  // 9, 10, 11. memory: profile + facts + recent episodes
  if (deps.memoryStore) {
    const mem = await deps.memoryStore.load();
    const fragments: string[] = [];
    if (mem.userProfile) fragments.push(`【关于这位用户的概要】${mem.userProfile}`);
    if (mem.facts.length) {
      fragments.push(
        `【你记得的关于这位用户的事】\n${mem.facts.map((f) => `- ${f}`).join('\n')}`,
      );
    }
    if (mem.episodes.length) {
      const recent = mem.episodes.slice(-2);
      fragments.push(
        `【最近的几段共同记忆】\n${recent
          .map((e) => `- ${e.gist}(你当时: ${e.herFeeling})`)
          .join('\n')}`,
      );
    }
    if (fragments.length) systemPrompt = `${systemPrompt}\n\n${fragments.join('\n\n')}`;
  }

  // 12. persona re-injection every N turns — fights drift in long sessions.
  const turnCount = Math.floor(history.length / 2);
  if (turnCount > 0 && turnCount % REINJECT_EVERY_N_TURNS === 0) {
    const reinject = [
      `【提醒一下你自己是谁】`,
      profile.soul.slice(0, 600),
      zonePhrase ? `当前情绪基调: ${zonePhrase}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    systemPrompt = `${systemPrompt}\n\n${reinject}`;
  }

  return { systemPrompt, presence, rhythm, zonePhrase };
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-reply fan-out — all the fire-and-forget work that happens AFTER
// the agent stream finalizes. Observable: every job logs failures via
// console.warn breadcrumbs (prevents silent regressions).
// ─────────────────────────────────────────────────────────────────────────────

interface PostReplyJobsCtx {
  sessionId: string;
  history: ChatMessage[];
  userText: string;
  reply: string;
  presence: Presence | null;
  rhythm: RhythmSnapshot;
  llmActions: boolean;
}

function dispatchPostReplyJobs(
  deps: AgentDeps,
  profile: PetProfile,
  ctx: PostReplyJobsCtx,
): void {
  const { sessionId, history, userText, reply, presence, rhythm, llmActions } = ctx;
  const fullHistory: ChatMessage[] = [
    ...history,
    { role: 'user', content: userText, timestamp: Date.now() },
    { role: 'assistant', content: reply, timestamp: Date.now() },
  ];

  // Action picker: animation by zone + rhythm.
  if (llmActions) {
    void (async () => {
      try {
        const zoneNow = deps.emotionStore
          ? affectionZone(tickRecovery(await deps.emotionStore.load(), Date.now()).affection)
          : 'friendly';
        const picked = await pickAction(
          {
            apiKey: deps.apiKey,
            baseURL: deps.baseURL,
            model: deps.model,
            registry: deps.animations,
            profile,
          },
          { userText, petReply: reply, zone: zoneNow, rhythm: computeRhythm(new Date()) },
        );
        if (picked.id !== 'idle' || picked.durationMs !== 0) {
          deps.dispatch({
            type: 'action',
            sessionId,
            animationId: picked.id,
            durationMs: picked.durationMs,
          });
        }
      } catch (err) {
        console.warn('[pet] action picker failed:', err instanceof Error ? err.message : err);
      }
    })();
  }

  // Memory updater (30min cooldown, applied inside maybeUpdateMemory).
  if (deps.memoryStore) {
    void maybeUpdateMemory(
      {
        apiKey: deps.apiKey,
        baseURL: deps.baseURL,
        model: deps.model,
        profile,
        store: deps.memoryStore,
      },
      fullHistory,
    ).catch((err) =>
      console.warn('[pet] memory updater failed:', err instanceof Error ? err.message : err),
    );
  }

  // Presence touch — this user-initiated message is the new "last seen".
  if (deps.presenceStore) {
    void deps.presenceStore.touch(Date.now()).catch((err) =>
      console.warn('[pet] presence touch failed:', err instanceof Error ? err.message : err),
    );
  }

  // Acquired-traits update (60min cooldown).
  if (deps.acquiredStore) {
    void maybeUpdateAcquired(
      {
        apiKey: deps.apiKey,
        baseURL: deps.baseURL,
        model: deps.model,
        profile,
        store: deps.acquiredStore,
      },
      fullHistory,
    ).catch((err) =>
      console.warn('[pet] acquired updater failed:', err instanceof Error ? err.message : err),
    );
  }

  // Day-mood refresh (24h cadence; only fires in dawn/morning when stale).
  if (deps.dayMoodStore) {
    void (async () => {
      try {
        const mem = deps.memoryStore ? await deps.memoryStore.load() : null;
        const aff = deps.emotionStore ? (await deps.emotionStore.load()).affection : 60;
        const dreamLog = deps.dreamLogStore ? await deps.dreamLogStore.load() : null;
        const recentDream = dreamLog ? mostRecentDream(dreamLog) : null;
        await maybeRefreshDayMood(
          {
            apiKey: deps.apiKey,
            baseURL: deps.baseURL,
            model: deps.model,
            profile,
            store: deps.dayMoodStore!,
          },
          {
            rhythm,
            affection: aff,
            recentEpisodes: mem?.episodes ?? [],
            recentDream,
          },
          Date.now(),
        );
      } catch (err) {
        console.warn('[pet] day-mood refresh failed:', err instanceof Error ? err.message : err);
      }
    })();
  }

  // Inner-thought refresh (1h or phase-change).
  if (deps.innerThoughtStore) {
    void (async () => {
      try {
        const mem = deps.memoryStore ? await deps.memoryStore.load() : null;
        const aff = deps.emotionStore ? (await deps.emotionStore.load()).affection : 60;
        const ago = lastSeenAgoSec(presence, Date.now());
        const dreamLog = deps.dreamLogStore ? await deps.dreamLogStore.load() : null;
        const recentDream = dreamLog ? mostRecentDream(dreamLog) : null;
        await maybeRefreshInnerThought(
          {
            apiKey: deps.apiKey,
            baseURL: deps.baseURL,
            model: deps.model,
            profile,
            store: deps.innerThoughtStore!,
          },
          {
            rhythm,
            recentEpisodes: mem?.episodes ?? [],
            affection: aff,
            ...(ago !== undefined ? { lastSeenAgoSec: ago } : {}),
            ...(recentDream ? { recentDream } : {}),
          },
          Date.now(),
        );
      } catch (err) {
        console.warn('[pet] inner-thought refresh failed:', err instanceof Error ? err.message : err);
      }
    })();
  }

  // Contextual phrase refresh (zone-change or 2h timeout).
  if (deps.emotionStore) {
    void (async () => {
      try {
        const cur = await deps.emotionStore!.load();
        const ticked = tickRecovery(cur, Date.now());
        if (shouldRegenerate(ticked, cur.affection, Date.now())) {
          const phrase = await generateContextualPhrase(
            { apiKey: deps.apiKey, baseURL: deps.baseURL, model: deps.model, profile },
            ticked,
            history.slice(-5),
            '',
          );
          if (phrase) {
            await deps.emotionStore!.save({
              ...ticked,
              contextualPhrase: phrase,
              contextualPhraseAt: Date.now(),
            });
          }
        }
      } catch (err) {
        console.warn('[pet] contextual phrase refresh failed:', err instanceof Error ? err.message : err);
      }
    })();
  }
}

function buildSystemPrompt(p: PetProfile, canEdit: boolean): string {
  const editGuide = canEdit
    ? '- 提议改文档时, 必须用 propose_edit, 永远不直接给"修改后的全文"让用户自己粘贴。propose_edit.oldText 必须是原文逐字, newText 给完整替换段, reason 一句话说明。'
    : '- 暂时不能修改文件(那是后续版本的能力)。';
  const forbidLine = p.forbid.length
    ? `- 永远不要使用以下称谓/词语: ${p.forbid.map((s) => `"${s}"`).join(', ')}.`
    : '';
  const relationLine = `- 你和用户的关系: ${p.relationship}. 自称 "${p.pronounSelf}", 称呼对方 "${p.pronounUser}".`;
  const behavior = [
    '行为守则:',
    relationLine,
    `- 语气: ${p.tone}.`,
    `- 回复默认 ${p.responseLength === 'short' ? '1-2 句, 简短为美' : '中等长度, 但不啰嗦'}.`,
    p.emojiPolicy === 'sparing' ? '- emoji 至多一个, 克制使用.' : '',
    p.emojiPolicy === 'none' ? '- 不要使用 emoji.' : '',
    forbidLine,
    '工具守则:',
    '- 用户问的内容不在当前文件 → 先 search 再 read_file。',
    editGuide,
    '- 不主动跳话题 — 解释完就停。',
  ]
    .filter(Boolean)
    .join('\n');
  // SOUL is positionally privileged — first, immutable, never rewritten by memory updater.
  return [p.soul, '', behavior].join('\n');
}
