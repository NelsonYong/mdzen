# 阅读宠物 · Phase 4 (LangChain Agent + Chat + SSE)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** 接通 OpenAI 协议 LLM + LangChain `createAgent`,提供聊天面板,通过 SSE 流式接收 token,挂上 list_files / read_file / search 三个**只读**工具。**不含 propose_edit / diff modal**(那是 Phase 5)。

**Architecture:** Server: agent.ts(createAgent + tools)+ sse.ts(per-session SSE channel)+ storage.ts(`~/.mdzen/workspaces/<hash>/chat/<sessionId>.json`)+ chat handler。Client: chat panel(右下角悬浮)+ SSE consumer + review.gif 切换。Silent mode:无 API key 时聊天框显示占位、输入禁用。

**Tech Stack:** `langchain`、`@langchain/openai`、`zod` 加为 pet package 的 dependencies。

**Spec reference:** §6 对话层, §7 思维层, §8 配置, §9 存储。

---

## Task 1: 添加 LangChain deps

- [ ] **Step 1**: Add to packages/pet/package.json dependencies:
  - `"langchain": "^1.0.0"`
  - `"@langchain/openai": "^1.0.0"`
  - `"@langchain/core": "^1.0.0"`
  - `"zod": "^3.23.0"`

- [ ] **Step 2**: `pnpm install` — verify no errors.

- [ ] **Step 3**: Commit `chore(pet): add langchain dependencies`.

---

## Task 2: Storage module (TDD)

**Files:** `src/server/storage.ts` + test.

- [ ] **Step 1**: Write test for atomic-write + workspace-hash isolation:

```ts
// storage.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStorage } from './storage.ts';

test('storage: workspace hash creates per-root isolation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pet-st-'));
  const a = createStorage({ chatDir: root, workspaceRoot: '/foo' });
  const b = createStorage({ chatDir: root, workspaceRoot: '/bar' });
  assert.notEqual(a.workspaceDir, b.workspaceDir);
  rmSync(root, { recursive: true, force: true });
});

test('storage: append + read round-trip', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pet-st-'));
  const s = createStorage({ chatDir: root, workspaceRoot: '/test' });
  await s.appendMessage('sess1', { role: 'user', content: 'hi', timestamp: 1 });
  await s.appendMessage('sess1', { role: 'assistant', content: 'hello', timestamp: 2 });
  const msgs = await s.loadHistory('sess1');
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0]?.content, 'hi');
  rmSync(root, { recursive: true, force: true });
});

test('storage: missing session returns empty array', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pet-st-'));
  const s = createStorage({ chatDir: root, workspaceRoot: '/test' });
  const msgs = await s.loadHistory('nope');
  assert.equal(msgs.length, 0);
  rmSync(root, { recursive: true, force: true });
});
```

- [ ] **Step 2**: Implement:

```ts
// storage.ts
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface StorageOptions {
  chatDir: string;
  workspaceRoot: string;
}

export interface Storage {
  workspaceDir: string;
  appendMessage(sessionId: string, msg: ChatMessage): Promise<void>;
  loadHistory(sessionId: string): Promise<ChatMessage[]>;
}

export function createStorage(opts: StorageOptions): Storage {
  const hash = createHash('sha1').update(opts.workspaceRoot).digest('hex').slice(0, 12);
  const workspaceDir = join(opts.chatDir, 'workspaces', hash, 'chat');

  return {
    workspaceDir,
    async appendMessage(sessionId, msg) {
      await mkdir(workspaceDir, { recursive: true });
      const file = join(workspaceDir, `${sanitize(sessionId)}.json`);
      const existing = await loadFile(file);
      existing.push(msg);
      await atomicWrite(file, JSON.stringify(existing, null, 2));
    },
    async loadHistory(sessionId) {
      const file = join(workspaceDir, `${sanitize(sessionId)}.json`);
      return loadFile(file);
    },
  };
}

async function loadFile(file: string): Promise<ChatMessage[]> {
  try {
    const buf = await readFile(file, 'utf-8');
    return JSON.parse(buf);
  } catch {
    return [];
  }
}

async function atomicWrite(file: string, content: string): Promise<void> {
  const tmp = `${file}.${Date.now()}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, file);
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}
```

- [ ] **Step 3**: Test runs green, commit `feat(pet): chat storage with workspace isolation and atomic write`.

---

## Task 3: Tools (list_files, read_file, search)

**Files:** `src/server/tools.ts` + test.

- [ ] **Step 1**: Implement only-read tools using safeResolve-equivalent:

```ts
// tools.ts
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';

const MAX_FILE_BYTES = 50 * 1024;
const MAX_SEARCH_HITS = 20;

function isInside(root: string, path: string): boolean {
  const r = relative(root, path);
  return !r.startsWith('..') && !r.startsWith('/');
}

export function buildTools(workspaceRoot: string) {
  const listFiles = tool(
    async () => {
      const out: string[] = [];
      async function walk(dir: string): Promise<void> {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          const p = resolve(dir, e.name);
          if (e.isDirectory()) {
            if (e.name.startsWith('.') || e.name === 'node_modules') continue;
            await walk(p);
          } else if (e.isFile() && extname(e.name) === '.md') {
            out.push(relative(workspaceRoot, p));
          }
        }
      }
      await walk(workspaceRoot);
      return JSON.stringify(out);
    },
    {
      name: 'list_files',
      description: '列出工作区下所有 Markdown 文件的相对路径',
      schema: z.object({}),
    },
  );

  const readFileTool = tool(
    async (input) => {
      const target = resolve(workspaceRoot, input.path);
      if (!isInside(workspaceRoot, target)) throw new Error('path outside workspace');
      if (extname(target) !== '.md') throw new Error('only .md files');
      const buf = await readFile(target, 'utf-8');
      if (buf.length > MAX_FILE_BYTES) {
        return buf.slice(0, MAX_FILE_BYTES) + '\n[…truncated]';
      }
      return buf;
    },
    {
      name: 'read_file',
      description: '读取一个 Markdown 文件的内容(>50KB 截断)',
      schema: z.object({ path: z.string() }),
    },
  );

  const searchTool = tool(
    async (input) => {
      const hits: Array<{ file: string; line: number; text: string }> = [];
      async function walk(dir: string): Promise<void> {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          if (hits.length >= MAX_SEARCH_HITS) return;
          const p = resolve(dir, e.name);
          if (e.isDirectory()) {
            if (e.name.startsWith('.') || e.name === 'node_modules') continue;
            await walk(p);
          } else if (e.isFile() && extname(e.name) === '.md') {
            const text = await readFile(p, 'utf-8');
            const lines = text.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if ((lines[i] ?? '').toLowerCase().includes(input.query.toLowerCase())) {
                hits.push({ file: relative(workspaceRoot, p), line: i + 1, text: (lines[i] ?? '').trim() });
                if (hits.length >= MAX_SEARCH_HITS) return;
              }
            }
          }
        }
      }
      await walk(workspaceRoot);
      return JSON.stringify(hits);
    },
    {
      name: 'search',
      description: '在工作区 Markdown 文件中关键词搜索, 返回 file:line 与片段(最多 20 条)',
      schema: z.object({ query: z.string() }),
    },
  );

  return [listFiles, readFileTool, searchTool];
}
```

- [ ] **Step 2**: Test (basic happy paths + path traversal blocked):

```ts
// tools.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTools } from './tools.ts';

test('tools: list_files finds md files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pet-tools-'));
  writeFileSync(join(root, 'a.md'), '# A');
  mkdirSync(join(root, 'sub'));
  writeFileSync(join(root, 'sub/b.md'), '# B');
  const [list] = buildTools(root);
  const result = JSON.parse(await list!.invoke({}) as string);
  assert.ok(result.includes('a.md'));
  assert.ok(result.some((p: string) => p.endsWith('b.md')));
  rmSync(root, { recursive: true, force: true });
});

test('tools: read_file blocks path traversal', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pet-tools-'));
  const [, readF] = buildTools(root);
  await assert.rejects(() => readF!.invoke({ path: '../../etc/passwd' }));
  rmSync(root, { recursive: true, force: true });
});

test('tools: search returns hits with file and line', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pet-tools-'));
  writeFileSync(join(root, 'a.md'), 'line1\nhello world\nline3');
  const [, , search] = buildTools(root);
  const hits = JSON.parse(await search!.invoke({ query: 'hello' }) as string);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 2);
  rmSync(root, { recursive: true, force: true });
});
```

- [ ] **Step 3**: Tests pass, commit `feat(pet): list_files / read_file / search tools (read-only)`.

---

## Task 4: SSE module

**Files:** `src/server/sse.ts`.

- [ ] **Step 1**: Implement a session-keyed SSE registry:

```ts
import type { ServerResponse } from 'node:http';

export type PetEvent =
  | { type: 'token'; sessionId: string; text: string }
  | { type: 'tool-start'; sessionId: string; tool: string }
  | { type: 'tool-end'; sessionId: string; tool: string }
  | { type: 'final'; sessionId: string; messageId: string }
  | { type: 'error'; sessionId: string; message: string };

const channels = new Map<string, ServerResponse>();

export function attachSseClient(sessionId: string, res: ServerResponse): void {
  channels.get(sessionId)?.end();
  res.statusCode = 200;
  res.setHeader('content-type', 'text/event-stream');
  res.setHeader('cache-control', 'no-cache');
  res.setHeader('connection', 'keep-alive');
  res.write(': connected\n\n');
  channels.set(sessionId, res);
  res.on('close', () => {
    if (channels.get(sessionId) === res) channels.delete(sessionId);
  });
}

export function dispatch(event: PetEvent): void {
  const ch = channels.get(event.sessionId);
  if (!ch) return;
  ch.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function closeAll(): void {
  for (const ch of channels.values()) ch.end();
  channels.clear();
}
```

- [ ] **Step 2**: Commit `feat(pet): per-session SSE channel registry`.

---

## Task 5: Agent (server/agent.ts)

**Files:** `src/server/agent.ts`.

- [ ] **Step 1**: Implement using LangChain 1.0 `createAgent`:

```ts
import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
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

export function createPetAgent(deps: AgentDeps) {
  const personality = { ...DEFAULT_PERSONALITY, ...deps.personality };
  const llm = new ChatOpenAI({
    apiKey: deps.apiKey,
    model: deps.model ?? 'gpt-4o-mini',
    streaming: true,
    configuration: deps.baseURL ? { baseURL: deps.baseURL } : undefined,
  });
  const tools = buildTools(deps.workspaceRoot);
  const agent = createAgent({ llm, tools });

  const systemPrompt = buildSystemPrompt(personality);

  return {
    async run(sessionId: string, history: ChatMessage[], userText: string): Promise<string> {
      const messages = [
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
      const stream = await agent.stream({ messages });
      for await (const chunk of stream) {
        const aiMsg = chunk?.agent?.messages?.[chunk.agent.messages.length - 1];
        const text = (aiMsg?.content as string | undefined) ?? '';
        if (text && text !== acc) {
          const delta = text.slice(acc.length);
          acc = text;
          dispatch({ type: 'token', sessionId, text: delta });
        }
        if (chunk?.tools) {
          dispatch({ type: 'tool-end', sessionId, tool: 'tool' });
        }
      }
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
  ].filter(Boolean).join('\n');
}
```

- [ ] **Step 2**: Commit `feat(pet): langchain agent with system prompt`.

---

## Task 6: Server handler routes for chat

**Files:** modify `src/server/handler.ts`.

- [ ] **Step 1**: Add routes for `/api/pet/sse`, `/api/pet/chat`, `/api/pet/history`.
  - SSE: parse `?session=:id`, call `attachSseClient`.
  - Chat: parse JSON body `{sessionId, text}`, save user msg, call `agent.run`, save assistant msg, dispatch `final`.
  - History: parse `?session=:id`, return saved messages.
  - Silent mode: if `apiKey` missing, chat returns 503 with friendly message; sse still works (just no events).

- [ ] **Step 2**: Update `matches()` to recognize new routes.

- [ ] **Step 3**: Wire deps via `buildPet(opts)`: `agent`, `storage` instantiated when apiKey provided.

- [ ] **Step 4**: Commit `feat(pet): chat / history / sse endpoints`.

---

## Task 7: Update mdzen adapter to read env

**Files:** `src/pet-adapter.ts`.

- [ ] **Step 1**:

```ts
import { createPet } from '@mdzen/pet';
import { DOC_ROOT } from './config.ts';

export const pet = createPet({
  workspaceRoot: DOC_ROOT,
  llm: {
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL,
  },
});
```

- [ ] **Step 2**: Commit `feat(mdzen): adapter reads OPENAI_* env vars`.

---

## Task 8: Client chat panel

**Files:** `src/client/chat.ts` + wire in `index.ts`.

- [ ] **Step 1**: A floating panel toggleable from a small button. Inside: message list + input + send button. SSE consumer renders streaming text, switches sprite to `review` while streaming.

```ts
import type { Sprite } from './sprite.ts';

const PREFIX = '/api/pet';

export interface ChatHostOptions {
  sprite: Sprite;
  sessionId: string;
}

export class ChatHost {
  private root: HTMLDivElement;
  private toggle: HTMLButtonElement;
  private panel: HTMLDivElement;
  private list: HTMLDivElement;
  private input: HTMLTextAreaElement;
  private sse: EventSource | null = null;
  private currentAssistantBubble: HTMLDivElement | null = null;

  constructor(private opts: ChatHostOptions) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed', right: '12px', bottom: '12px',
      zIndex: '10000', fontFamily: 'system-ui, sans-serif',
    });

    this.toggle = document.createElement('button');
    this.toggle.textContent = '💬';
    Object.assign(this.toggle.style, {
      width: '40px', height: '40px', borderRadius: '50%',
      border: '1px solid #d06b9a', background: '#fde7f3',
      cursor: 'pointer', fontSize: '18px',
    });

    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      display: 'none', width: '320px', height: '420px',
      background: '#fff', border: '1px solid #ddd',
      borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      flexDirection: 'column', position: 'absolute',
      right: '0', bottom: '52px',
    });

    this.list = document.createElement('div');
    Object.assign(this.list.style, {
      flex: '1', overflowY: 'auto', padding: '12px', fontSize: '13px',
    });

    const inputRow = document.createElement('div');
    Object.assign(inputRow.style, {
      borderTop: '1px solid #eee', padding: '8px',
      display: 'flex', gap: '6px',
    });
    this.input = document.createElement('textarea');
    Object.assign(this.input.style, {
      flex: '1', resize: 'none', height: '36px',
      border: '1px solid #ddd', borderRadius: '6px', padding: '6px',
      fontSize: '13px', fontFamily: 'inherit',
    });
    const send = document.createElement('button');
    send.textContent = '发送';
    Object.assign(send.style, { padding: '0 12px', borderRadius: '6px', border: '1px solid #d06b9a', background: '#fde7f3', cursor: 'pointer' });

    inputRow.appendChild(this.input);
    inputRow.appendChild(send);
    this.panel.appendChild(this.list);
    this.panel.appendChild(inputRow);
    this.root.appendChild(this.panel);
    this.root.appendChild(this.toggle);
    document.body.appendChild(this.root);

    this.toggle.addEventListener('click', () => this.toggleOpen());
    send.addEventListener('click', () => void this.send());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.send();
      }
    });

    void this.loadHistory();
    this.openSSE();
  }

  private toggleOpen(): void {
    const open = this.panel.style.display === 'flex';
    this.panel.style.display = open ? 'none' : 'flex';
    if (!open) this.input.focus();
  }

  private async loadHistory(): Promise<void> {
    try {
      const r = await fetch(`${PREFIX}/history?session=${encodeURIComponent(this.opts.sessionId)}`);
      if (!r.ok) return;
      const msgs = await r.json() as Array<{ role: string; content: string }>;
      for (const m of msgs) this.append(m.role, m.content);
    } catch {}
  }

  private openSSE(): void {
    this.sse = new EventSource(`${PREFIX}/sse?session=${encodeURIComponent(this.opts.sessionId)}`);
    this.sse.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === 'token') {
          this.opts.sprite.setState('review');
          this.appendToken(ev.text);
        } else if (ev.type === 'final') {
          this.currentAssistantBubble = null;
          this.opts.sprite.setState('idle');
        } else if (ev.type === 'error') {
          this.append('system', `出错了: ${ev.message}`);
          this.opts.sprite.setState('failed');
          setTimeout(() => this.opts.sprite.setState('idle'), 2000);
        }
      } catch {}
    };
  }

  private async send(): Promise<void> {
    const text = this.input.value.trim();
    if (!text) return;
    this.input.value = '';
    this.append('user', text);
    try {
      const r = await fetch(`${PREFIX}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: this.opts.sessionId, text }),
      });
      if (r.status === 503) {
        this.append('system', '我今天不太想说话呢 (没接 LLM)');
      }
    } catch (err) {
      this.append('system', `发送失败`);
    }
  }

  private append(role: string, text: string): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      marginBottom: '8px',
      padding: '6px 10px',
      borderRadius: '8px',
      maxWidth: '85%',
      ...(role === 'user'
        ? { background: '#f0f4ff', alignSelf: 'flex-end', marginLeft: 'auto' }
        : role === 'assistant'
          ? { background: '#fde7f3' }
          : { background: '#f5f5f5', color: '#888', fontStyle: 'italic' }),
    });
    el.textContent = text;
    this.list.appendChild(el);
    this.list.scrollTop = this.list.scrollHeight;
    if (role === 'assistant') this.currentAssistantBubble = el;
  }

  private appendToken(text: string): void {
    if (!this.currentAssistantBubble) {
      this.append('assistant', '');
    }
    if (this.currentAssistantBubble) {
      this.currentAssistantBubble.textContent = (this.currentAssistantBubble.textContent ?? '') + text;
      this.list.scrollTop = this.list.scrollHeight;
    }
  }

  destroy(): void {
    this.sse?.close();
    this.root.remove();
  }
}
```

- [ ] **Step 2**: Wire in client/index.ts. Generate sessionId via crypto.randomUUID() (stored in sessionStorage).

- [ ] **Step 3**: Commit `feat(pet): client chat panel with SSE consumer`.

---

## Task 9: Verify

- [ ] **Step 1**: typecheck + tests + build (pet + mdzen).
- [ ] **Step 2**: Manual: with `OPENAI_API_KEY` set, ask "what files are here?" — should see token streaming + review.gif during, idle after.
- [ ] **Step 3**: Without API key: chat panel still opens, send shows fallback message.
- [ ] **Step 4**: Commit `chore(pet): phase 4 verified` if needed.
