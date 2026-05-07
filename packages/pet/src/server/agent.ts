import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { HumanMessage, AIMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { resolve, relative, extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { PersonalityConfig } from '../shared/types.ts';
import type { ChatMessage } from './storage.ts';
import { buildTools, type ToolContext } from './tools.ts';
import { dispatch } from './sse.ts';
import type { ProposalRegistry } from './proposals.ts';
import type { EmotionStore } from './emotion-storage.ts';
import { affectionZone, PRESET_PHRASES, tickRecovery } from './emotion.ts';
import { generateContextualPhrase, shouldRegenerate } from './contextual.ts';

const DEFAULT_PERSONALITY: PersonalityConfig = {
  name: '希莲',
  pronoun: '我',
  baseTone: 'gentle-girlish',
  emojiPolicy: 'sparing',
  responseLength: 'short',
};

export interface AgentDeps {
  workspaceRoot: string;
  apiKey: string;
  baseURL?: string;
  model?: string;
  personality?: Partial<PersonalityConfig>;
  proposals?: ProposalRegistry;
  emotionStore?: EmotionStore;
}

export interface PetAgent {
  run(sessionId: string, history: ChatMessage[], userText: string): Promise<string>;
}

function isInside(root: string, path: string): boolean {
  const r = relative(root, path);
  return r !== '' && !r.startsWith('..') && !r.startsWith('/');
}

export function createPetAgent(deps: AgentDeps): PetAgent {
  const personality = { ...DEFAULT_PERSONALITY, ...deps.personality };
  const llm = new ChatOpenAI({
    apiKey: deps.apiKey,
    model: deps.model ?? 'gpt-4o-mini',
    streaming: true,
    configuration: deps.baseURL ? { baseURL: deps.baseURL } : undefined,
  });
  const baseSystemPrompt = buildSystemPrompt(personality, !!deps.proposals);

  return {
    async run(sessionId, history, userText) {
      let systemPrompt = baseSystemPrompt;
      if (deps.emotionStore) {
        const raw = await deps.emotionStore.load();
        const ticked = tickRecovery(raw, Date.now());
        const zone = affectionZone(ticked.affection);
        const fragments = [
          `【基础情绪】${PRESET_PHRASES[zone]}`,
        ];
        if (ticked.contextualPhrase) {
          fragments.push(`【此刻心境】${ticked.contextualPhrase}`);
        }
        systemPrompt = `${systemPrompt}\n\n${fragments.join('\n')}`;
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
              dispatch({
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
        const stream = await agent.stream({ messages });
        for await (const chunk of stream) {
          const agentChunk = (chunk as { agent?: { messages?: BaseMessage[] } }).agent;
          const lastMsg = agentChunk?.messages?.[agentChunk.messages.length - 1];
          const text = (lastMsg?.content as string | undefined) ?? '';
          if (text && text !== acc) {
            const delta = text.slice(acc.length);
            acc = text;
            dispatch({ type: 'token', sessionId, text: delta });
          }
          const toolsChunk = (chunk as { tools?: unknown }).tools;
          if (toolsChunk) {
            dispatch({ type: 'tool-end', sessionId, tool: 'tool' });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        dispatch({ type: 'error', sessionId, message });
        throw err;
      }
      dispatch({ type: 'final', sessionId, messageId: `${Date.now()}` });

      if (deps.emotionStore) {
        void (async () => {
          try {
            const cur = await deps.emotionStore!.load();
            const ticked = tickRecovery(cur, Date.now());
            if (shouldRegenerate(ticked, cur.affection, Date.now())) {
              const phrase = await generateContextualPhrase(
                {
                  apiKey: deps.apiKey,
                  baseURL: deps.baseURL,
                  model: deps.model,
                  personality,
                },
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
          } catch {}
        })();
      }

      return acc;
    },
  };
}

function buildSystemPrompt(p: PersonalityConfig, canEdit: boolean): string {
  const editGuide = canEdit
    ? '- 提议改文档时, 必须用 propose_edit, 永远不直接给"修改后的全文"让用户自己粘贴。propose_edit.oldText 必须是原文逐字, newText 给完整替换段, reason 一句话说明。'
    : '- 暂时不能修改文件(那是后续版本的能力)。';
  return [
    `你是${p.name}, 一个住在 markdown 阅读器里的 AI 阅读伙伴。`,
    `性格: 温柔, 少女, 第一人称用"${p.pronoun}"。简短为美 — 默认 1-2 句, 用户问"详细说说"才展开。`,
    p.emojiPolicy === 'sparing' ? '最多一个 emoji。' : '',
    '',
    '工具守则:',
    '- 用户问的内容不在当前文件 → 先 search 再 read_file。',
    editGuide,
    '- 不主动跳话题 — 解释完就停。',
  ]
    .filter(Boolean)
    .join('\n');
}
