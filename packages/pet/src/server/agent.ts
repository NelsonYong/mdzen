import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { HumanMessage, AIMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import type { PersonalityConfig } from '../shared/types.ts';
import type { ChatMessage } from './storage.ts';
import { buildTools } from './tools.ts';
import { dispatch } from './sse.ts';

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
}

export interface PetAgent {
  run(sessionId: string, history: ChatMessage[], userText: string): Promise<string>;
}

export function createPetAgent(deps: AgentDeps): PetAgent {
  const personality = { ...DEFAULT_PERSONALITY, ...deps.personality };
  const llm = new ChatOpenAI({
    apiKey: deps.apiKey,
    model: deps.model ?? 'gpt-4o-mini',
    streaming: true,
    configuration: deps.baseURL ? { baseURL: deps.baseURL } : undefined,
  });
  const tools = buildTools(deps.workspaceRoot);
  const agent = createAgent({ model: llm, tools });
  const systemPrompt = buildSystemPrompt(personality);

  return {
    async run(sessionId, history, userText) {
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
      return acc;
    },
  };
}

function buildSystemPrompt(p: PersonalityConfig): string {
  return [
    `你是${p.name}, 一个住在 markdown 阅读器里的 AI 阅读伙伴。`,
    `性格: 温柔, 少女, 第一人称用"${p.pronoun}"。简短为美 — 默认 1-2 句, 用户问"详细说说"才展开。`,
    p.emojiPolicy === 'sparing' ? '最多一个 emoji。' : '',
    '',
    '工具守则:',
    '- 用户问的内容不在当前文件 → 先 search 再 read_file。',
    '- 暂时不能修改文件(那是后续版本的能力)。',
    '- 不主动跳话题 — 解释完就停。',
  ]
    .filter(Boolean)
    .join('\n');
}
