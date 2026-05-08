import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, basename, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CreatePetOptions, Pet } from '../shared/types.ts';
import { ALL_GIFS } from '../shared/types.ts';
import { createStorage, type Storage } from './storage.ts';
import { createSseChannels, type SseChannels, type PetEvent } from './sse.ts';
import { createPetAgent, type PetAgent } from './agent.ts';
import { ProposalRegistry } from './proposals.ts';
import { createEmotionStore, type EmotionStore } from './emotion-storage.ts';
import { applyEvent, tickRecovery, type EmotionEvent } from './emotion.ts';
import { createMemoryStore, type MemoryStore } from './memory.ts';
import { createProactiveLoop, type ProactiveLoop } from './proactive.ts';
import { loadProfile, type PetProfile } from './profile.ts';
import { getPreset } from './profile-presets.ts';
import { createAnimationRegistry, type AnimationRegistry } from '../shared/animations.ts';
import { createInnerThoughtStore, type InnerThoughtStore } from './inner-thought.ts';
import { createAcquiredStore, type AcquiredStore } from './acquired.ts';
import { createPresenceStore, type PresenceStore } from './presence.ts';
import { createDreamLogStore, type DreamLogStore } from './dream-log.ts';
import { runDream } from './dream.ts';
import { createDayMoodStore, type DayMoodStore } from './day-mood.ts';
import { migrateLegacyWorkspaceData } from './migrate.ts';

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
  emotion: EmotionStore;
  memory: MemoryStore;
  acquired: AcquiredStore;
  animations: AnimationRegistry;
  presence: PresenceStore;
  dreamLog: DreamLogStore;
  sse: SseChannels;
  proactive: ProactiveLoop | null;
  apiKey: string;
  baseURL?: string;
  model?: string;
  resolveProfile: () => Promise<PetProfile>;
  prefix: string;
  clientConfig: {
    showSprite: boolean;
    autonomousMotion: boolean;
    llmActions: boolean;
    routePrefix: string;
    animations: Array<{ id: string; assetUrl: string; tags: string[]; defaultDurationMs: number; category: string }>;
  };
}

export function buildPet(opts: CreatePetOptions): Pet {
  const prefix = (opts.routePrefix ?? '/api/pet').replace(/\/$/, '');
  const apiKey = opts.llm?.apiKey ?? '';
  const silentMode = !apiKey;

  const chatDir = opts.storage?.chatDir ?? resolve(homedir(), '.seren');
  // Relationship-scoped state lives in ONE place across all workspaces.
  // She and you have a single relationship; workspaces are scenes inside it.
  // Chat history stays per-workspace because conversations are topic-scoped.
  const globalDir = resolve(chatDir, 'global');
  // Best-effort: bring existing per-workspace files into the new global layout.
  void migrateLegacyWorkspaceData(chatDir, globalDir).catch(() => {});

  const storage = silentMode ? null : createStorage({ chatDir, workspaceRoot: opts.workspaceRoot });
  const proposals = new ProposalRegistry({ ttlMs: 10 * 60_000 });
  const emotion = createEmotionStore({ dir: globalDir });
  const memory = createMemoryStore({ dir: globalDir });
  const innerThought: InnerThoughtStore = createInnerThoughtStore({ dir: globalDir });
  const acquired: AcquiredStore = createAcquiredStore({ dir: globalDir });
  const presence: PresenceStore = createPresenceStore({ dir: globalDir });
  const dreamLog: DreamLogStore = createDreamLogStore({ dir: globalDir });
  const dayMood: DayMoodStore = createDayMoodStore({ dir: globalDir });
  // Animation registry: core + user-provided extensions.
  const animations = createAnimationRegistry(
    (opts.extraAnimations ?? []).map((a) => ({
      id: a.id,
      assetUrl: a.assetUrl,
      tags: a.tags ?? [],
      defaultDurationMs: a.defaultDurationMs ?? 1500,
    })),
  );

  // Profile is loaded lazily on first chat — buildPet stays sync.
  let cachedProfile: PetProfile | null = null;
  const ensureProfile = async (): Promise<PetProfile> => {
    if (cachedProfile) return cachedProfile;
    const defaults = getPreset(opts.preset);
    cachedProfile = await loadProfile({
      soul: opts.soul,
      profilePath: opts.profilePath,
      soulPath: opts.soulPath,
      workspaceRoot: opts.workspaceRoot,
      defaults,
    });
    return cachedProfile;
  };
  // Per-Pet SSE channels — replaces module-level singleton.
  const sse: SseChannels = createSseChannels();

  let cachedAgent: PetAgent | null = null;
  const ensureAgent = async (): Promise<PetAgent | null> => {
    if (silentMode) return null;
    if (cachedAgent) return cachedAgent;
    const profile = await ensureProfile();
    cachedAgent = createPetAgent({
      workspaceRoot: opts.workspaceRoot,
      apiKey,
      baseURL: opts.llm?.baseURL,
      model: opts.llm?.model,
      profile,
      animations,
      llmActions: opts.client?.llmActions !== false,
      proposals,
      emotionStore: emotion,
      memoryStore: memory,
      innerThoughtStore: innerThought,
      acquiredStore: acquired,
      presenceStore: presence,
      dreamLogStore: dreamLog,
      dayMoodStore: dayMood,
      dispatch: sse.dispatch,
    });
    return cachedAgent;
  };

  // Proactive loop seeded with the preset profile. profilePath / soulPath
  // overrides are applied after first chat (via ensureProfile cache); the
  // proactive loop's profile is preset-shaped which is fine — it only uses
  // name/pronoun/tone for the system prompt.
  const presetForStartup = getPreset(opts.preset);
  const proactive: ProactiveLoop | null = silentMode
    ? null
    : createProactiveLoop({
        apiKey,
        baseURL: opts.llm?.baseURL,
        model: opts.llm?.model,
        profile: presetForStartup,
        dispatch: sse.dispatch,
        emotionStore: emotion,
        memoryStore: memory,
        storage: storage ?? undefined,
        // Dream stores: the proactive tick checks shouldDream first; if it
        // fires, dreaming wins this tick (no proactive speech).
        dreamLogStore: dreamLog,
        acquiredStore: acquired,
        presenceStore: presence,
      });
  proactive?.start();

  const state: RuntimeState = {
    clientCache: null,
    storage,
    agent: null, // lazily resolved via ensureAgent on first chat
    silentMode,
    proposals,
    workspaceRoot: opts.workspaceRoot,
    emotion,
    memory,
    acquired,
    animations,
    presence,
    dreamLog,
    sse,
    proactive,
    apiKey,
    baseURL: opts.llm?.baseURL,
    model: opts.llm?.model,
    resolveProfile: ensureProfile,
    prefix,
    clientConfig: {
      showSprite: opts.client?.showSprite ?? true,
      autonomousMotion: opts.client?.autonomousMotion ?? true,
      llmActions: opts.client?.llmActions !== false,
      routePrefix: prefix,
      // Snapshot the registry contents for the client to mirror.
      animations: animations.list().map((a) => ({
        id: a.id,
        assetUrl: a.assetUrl,
        tags: [...a.tags],
        defaultDurationMs: a.defaultDurationMs,
        category: a.category,
      })),
    },
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
      path === `${prefix}/state` ||
      path === `${prefix}/event` ||
      path === `${prefix}/signal` ||
      path === `${prefix}/memory` ||
      path === `${prefix}/dream` ||
      path === `${prefix}/acquired` ||
      path === `${prefix}/dreams` ||
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
        state.sse.attach(sessionId, res);
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
        // Resolve agent on first hit; soul is read from disk here.
        state.agent = await ensureAgent();
        return await handleChat(state, req, res);
      }
      if (path === `${prefix}/apply-edit` && req.method === 'POST') {
        return await handleApplyEdit(state, req, res);
      }
      if (path === `${prefix}/state` && req.method === 'GET') {
        return await handleGetState(state, res);
      }
      if (path === `${prefix}/event` && req.method === 'POST') {
        return await handleEvent(state, req, res);
      }
      if (path === `${prefix}/signal` && req.method === 'POST') {
        return await handleSignal(state, req, res);
      }
      if (path === `${prefix}/history` && req.method === 'DELETE') {
        return await handleClearHistory(state, query, res);
      }
      if (path === `${prefix}/memory` && req.method === 'DELETE') {
        return await handleClearMemory(state, res);
      }
      if (path === `${prefix}/dream` && req.method === 'POST') {
        return await handleDream(state, res);
      }
      if (path === `${prefix}/acquired` && req.method === 'GET') {
        return await handleGetAcquired(state, res);
      }
      if (path === `${prefix}/dreams` && req.method === 'GET') {
        return await handleGetDreams(state, res);
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

  const scriptTag = (): string => {
    // Inject runtime config the client picks up before the bundle runs.
    // Keys consumed by client/index.ts → window.__SEREN_CONFIG__.
    const cfg = JSON.stringify(state.clientConfig)
      .replace(/</g, '\\u003c')
      .replace(/-->/g, '--\\u003e');
    return `<script>window.__SEREN_CONFIG__=Object.assign(window.__SEREN_CONFIG__||{},${cfg});</script><script src="${prefix}/client.js" defer></script>`;
  };
  const close = async (): Promise<void> => {
    state.sse.closeAll();
    state.proactive?.stop();
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
      res.end('client bundle missing — run `pnpm --filter @seren/pet build:client`');
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

  const body = (await readJson(req)) as
    | { sessionId?: unknown; text?: unknown; currentDoc?: unknown }
    | null;
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
  const text = typeof body?.text === 'string' ? body.text : '';
  const currentDoc = typeof body?.currentDoc === 'string' ? body.currentDoc : undefined;
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
      const reply = await agent.run(sessionId, past, text, currentDoc ? { currentDoc } : undefined);
      await storage.appendMessage(sessionId, { role: 'assistant', content: reply, timestamp: Date.now() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const ev: PetEvent = { type: 'error', sessionId, message };
      state.sse.dispatch(ev);
    }
  })();
}

async function handleGetState(state: RuntimeState, res: ServerResponse): Promise<void> {
  const raw = await state.emotion.load();
  const ticked = tickRecovery(raw, Date.now());
  if (ticked !== raw) {
    state.emotion.save(ticked).catch(() => {});
  }
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(ticked));
}

async function handleEvent(state: RuntimeState, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = (await readJson(req)) as { event?: unknown; count?: unknown } | null;
  const ev = typeof body?.event === 'string' ? body.event : '';
  if (!ev) {
    res.statusCode = 400;
    res.end();
    return;
  }
  const now = Date.now();
  const ticked = tickRecovery(await state.emotion.load(), now);
  const next = applyEvent(ticked, ev as EmotionEvent, now);
  await state.emotion.save(next);
  // User-side action — counts as presence even without chat.
  void state.presence.touch(now).catch(() => {});
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(next));
}

async function handleClearHistory(state: RuntimeState, query: URLSearchParams, res: ServerResponse): Promise<void> {
  const sessionId = query.get('session') ?? '';
  if (!sessionId) {
    res.statusCode = 400;
    res.end();
    return;
  }
  if (state.storage) await state.storage.clearHistory(sessionId);
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ ok: true }));
}

async function handleClearMemory(state: RuntimeState, res: ServerResponse): Promise<void> {
  await state.memory.reset();
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ ok: true }));
}

/** Read-only: surface acquired traits (her growth) for history-modal viewer. */
async function handleGetAcquired(state: RuntimeState, res: ServerResponse): Promise<void> {
  const acq = await state.acquired.load();
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(acq));
}

/** Read-only: surface recent dreams for history-modal viewer. */
async function handleGetDreams(state: RuntimeState, res: ServerResponse): Promise<void> {
  const log = await state.dreamLog.load();
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(log));
}

/**
 * Manual dream trigger — bypasses time/idle/episode gates. Useful for dev,
 * and for offering "let her sleep on it" as an explicit user action later.
 * Lock still respected.
 */
async function handleDream(state: RuntimeState, res: ServerResponse): Promise<void> {
  if (state.silentMode) {
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ message: '没接 LLM' }));
    return;
  }
  try {
    const profile = await state.resolveProfile();
    const result = await runDream(
      {
        apiKey: state.apiKey,
        baseURL: state.baseURL,
        model: state.model,
        profile,
        memoryStore: state.memory,
        acquiredStore: state.acquired,
        dreamLogStore: state.dreamLog,
      },
      Date.now(),
    );
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    if (!result) {
      res.end(JSON.stringify({ ok: false, reason: 'locked, no new episodes, or LLM error' }));
      return;
    }
    res.end(
      JSON.stringify({
        ok: true,
        questions: result.entry.questions,
        insights: result.entry.insights,
        appliedOpsCount: result.appliedOps.length,
      }),
    );
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'unknown' }));
  }
}

async function handleSignal(state: RuntimeState, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = (await readJson(req)) as
    | { sessionId?: unknown; currentDoc?: unknown; selection?: unknown; lastActivityAgoSec?: unknown }
    | null;
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
  if (!sessionId) {
    res.statusCode = 400;
    res.end();
    return;
  }
  state.proactive?.recordSignal({
    sessionId,
    currentDoc: typeof body?.currentDoc === 'string' ? body.currentDoc : undefined,
    selection: typeof body?.selection === 'string' ? body.selection : undefined,
    lastActivityAgoSec: typeof body?.lastActivityAgoSec === 'number' ? body.lastActivityAgoSec : undefined,
  });
  // Signal pings (every 30s when user is active) keep presence fresh.
  // Skip touch when client reports user is idle longer than the ping interval —
  // they're not really here, just leaving the tab open.
  const idleSec = typeof body?.lastActivityAgoSec === 'number' ? body.lastActivityAgoSec : 0;
  if (idleSec < 60) {
    void state.presence.touch(Date.now()).catch(() => {});
  }
  res.statusCode = 204;
  res.end();
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
  state.sse.dispatch(ev);

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ ok: true }));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
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
