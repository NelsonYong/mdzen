import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, basename, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CreatePetOptions, Pet } from '../shared/types.ts';
import { ALL_GIFS } from '../shared/types.ts';
import { createStorage, type Storage } from './storage.ts';
import { attachSseClient, dispatch, closeAll, type PetEvent } from './sse.ts';
import { createPetAgent, type PetAgent } from './agent.ts';
import { ProposalRegistry } from './proposals.ts';

const HERE_FILE = fileURLToPath(import.meta.url);
const PKG_ROOT = resolve(dirname(HERE_FILE), '../..');
const ASSETS_DIR = resolve(PKG_ROOT, 'src/assets');
const CLIENT_JS_PATH = resolve(PKG_ROOT, 'dist/client.js');

const GIF_SET = new Set(ALL_GIFS);
const MAX_BODY_BYTES = 64 * 1024;

interface RuntimeState {
  clientCache: Buffer | null;
  storage: Storage | null;
  agent: PetAgent | null;
  silentMode: boolean;
  proposals: ProposalRegistry;
  workspaceRoot: string;
}

export function buildPet(opts: CreatePetOptions): Pet {
  const prefix = (opts.routePrefix ?? '/api/pet').replace(/\/$/, '');
  const apiKey = opts.llm?.apiKey ?? '';
  const silentMode = !apiKey;

  const chatDir = opts.storage?.chatDir ?? resolve(homedir(), '.mdzen');
  const storage = silentMode ? null : createStorage({ chatDir, workspaceRoot: opts.workspaceRoot });
  const proposals = new ProposalRegistry({ ttlMs: 10 * 60_000 });
  const agent = silentMode
    ? null
    : createPetAgent({
        workspaceRoot: opts.workspaceRoot,
        apiKey,
        baseURL: opts.llm?.baseURL,
        model: opts.llm?.model,
        personality: opts.personality,
        proposals,
      });

  const state: RuntimeState = {
    clientCache: null,
    storage,
    agent,
    silentMode,
    proposals,
    workspaceRoot: opts.workspaceRoot,
  };

  const matches = (req: IncomingMessage): boolean => {
    const url = req.url ?? '';
    const path = url.split('?')[0] ?? '';
    return (
      path === `${prefix}/client.js` ||
      path === `${prefix}/sse` ||
      path === `${prefix}/chat` ||
      path === `${prefix}/history` ||
      path === `${prefix}/apply-edit` ||
      path.startsWith(`${prefix}/assets/`)
    );
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const fullUrl = req.url ?? '';
      const path = fullUrl.split('?')[0] ?? '';
      const query = new URLSearchParams(fullUrl.includes('?') ? fullUrl.slice(fullUrl.indexOf('?') + 1) : '');

      if (path === `${prefix}/client.js`) return await serveClient(state, res);
      if (path.startsWith(`${prefix}/assets/`)) {
        return await serveAsset(path.slice(`${prefix}/assets/`.length), res);
      }
      if (path === `${prefix}/sse` && req.method === 'GET') {
        const sessionId = query.get('session') ?? '';
        if (!sessionId) {
          res.statusCode = 400;
          res.end();
          return;
        }
        attachSseClient(sessionId, res);
        return;
      }
      if (path === `${prefix}/history` && req.method === 'GET') {
        const sessionId = query.get('session') ?? '';
        if (!sessionId || !state.storage) {
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json');
          res.end('[]');
          return;
        }
        const msgs = await state.storage.loadHistory(sessionId);
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(msgs));
        return;
      }
      if (path === `${prefix}/chat` && req.method === 'POST') {
        return await handleChat(state, req, res);
      }
      if (path === `${prefix}/apply-edit` && req.method === 'POST') {
        return await handleApplyEdit(state, req, res);
      }
      res.statusCode = 404;
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[pet] handle error:', message);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end();
      }
    }
  };

  const scriptTag = (): string => `<script src="${prefix}/client.js" defer></script>`;
  const close = async (): Promise<void> => {
    closeAll();
    state.clientCache = null;
  };

  return { matches, handle, scriptTag, close };
}

async function serveAsset(rawName: string, res: ServerResponse): Promise<void> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawName);
  } catch {
    res.statusCode = 404;
    res.end();
    return;
  }
  const safe = basename(decoded);
  if (safe !== decoded || !GIF_SET.has(safe)) {
    res.statusCode = 404;
    res.end();
    return;
  }
  try {
    const buf = await readFile(resolve(ASSETS_DIR, safe));
    res.statusCode = 200;
    res.setHeader('content-type', 'image/gif');
    res.setHeader('cache-control', 'public, max-age=86400');
    res.end(buf);
  } catch {
    res.statusCode = 404;
    res.end();
  }
}

async function serveClient(state: RuntimeState, res: ServerResponse): Promise<void> {
  if (!state.clientCache) {
    try {
      state.clientCache = await readFile(CLIENT_JS_PATH);
    } catch {
      res.statusCode = 503;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('client bundle missing — run `pnpm --filter @mdzen/pet build:client`');
      return;
    }
  }
  res.statusCode = 200;
  res.setHeader('content-type', 'application/javascript; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=300');
  res.end(state.clientCache);
}

async function handleChat(state: RuntimeState, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (state.silentMode || !state.agent || !state.storage) {
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ message: '没接 LLM' }));
    return;
  }

  const body = await readJson(req);
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
  const text = typeof body?.text === 'string' ? body.text : '';
  if (!sessionId || !text) {
    res.statusCode = 400;
    res.end();
    return;
  }

  res.statusCode = 202;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ accepted: true }));

  const now = Date.now();
  const storage = state.storage;
  const agent = state.agent;
  storage.appendMessage(sessionId, { role: 'user', content: text, timestamp: now }).catch(() => {});
  void (async () => {
    try {
      const history = await storage.loadHistory(sessionId);
      const past = history.slice(0, Math.max(0, history.length - 1));
      const reply = await agent.run(sessionId, past, text);
      await storage.appendMessage(sessionId, { role: 'assistant', content: reply, timestamp: Date.now() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const ev: PetEvent = { type: 'error', sessionId, message };
      dispatch(ev);
    }
  })();
}

async function handleApplyEdit(state: RuntimeState, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = (await readJson(req)) as { proposalId?: unknown } | null;
  const id = typeof body?.proposalId === 'string' ? body.proposalId : '';
  if (!id) {
    res.statusCode = 400;
    res.end();
    return;
  }
  const p = state.proposals.consume(id, Date.now());
  if (!p) {
    res.statusCode = 404;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: '提议不存在或已过期' }));
    return;
  }
  const target = resolve(state.workspaceRoot, p.path);
  const rel = relative(state.workspaceRoot, target);
  if (rel === '' || rel.startsWith('..') || rel.startsWith('/') || extname(target) !== '.md') {
    res.statusCode = 422;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: '路径无效' }));
    return;
  }

  let content: string;
  try {
    content = await readFile(target, 'utf-8');
  } catch {
    res.statusCode = 422;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: '文件读取失败' }));
    return;
  }
  if (!content.includes(p.oldText)) {
    res.statusCode = 422;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: '文件已被改动, 请让她重新看一遍' }));
    return;
  }
  const updated = content.replace(p.oldText, p.newText);
  const tmp = `${target}.${Date.now()}.${process.pid}.tmp`;
  await writeFile(tmp, updated);
  await rename(tmp, target);

  const ev: PetEvent = { type: 'edit-applied', sessionId: p.sessionId, proposalId: id, path: p.path };
  dispatch(ev);

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ ok: true }));
}

async function readJson(req: IncomingMessage): Promise<{ sessionId?: unknown; text?: unknown; proposalId?: unknown } | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new Error('payload too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return null;
  const text = Buffer.concat(chunks).toString('utf-8');
  if (!text) return null;
  return JSON.parse(text);
}
