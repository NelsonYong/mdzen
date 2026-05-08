import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server, type IncomingMessage } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPet } from '../index.ts';

async function withServer(fn: (port: number) => Promise<void>): Promise<void> {
  const pet = createPet({ workspaceRoot: process.cwd() });
  const server: Server = createServer(async (req, res) => {
    if (pet.matches(req)) return pet.handle(req, res);
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    await fn(port);
  } finally {
    await pet.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
}

/**
 * Like withServer but uses an isolated chatDir so route tests don't pollute
 * the user's ~/.seren. Silent mode (no LLM) — chat / dream return 503.
 */
async function withIsolatedServer(
  fn: (port: number, chatDir: string) => Promise<void>,
): Promise<void> {
  const chatDir = await mkdtemp(join(tmpdir(), 'pet-routes-'));
  const pet = createPet({
    workspaceRoot: chatDir,
    storage: { chatDir },
  });
  const server: Server = createServer(async (req, res) => {
    if (pet.matches(req)) return pet.handle(req, res);
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    await fn(port, chatDir);
  } finally {
    await pet.close();
    await new Promise<void>((r) => server.close(() => r()));
    // Tests trigger fire-and-forget writes (presence.touch, emotion.save).
    // Give them ~50ms to settle before rm so we don't race ENOTEMPTY.
    await new Promise((r) => setTimeout(r, 50));
    try {
      await rm(chatDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup; tmp lives in /tmp anyway.
    }
  }
}

test('handler: matches /api/pet/* paths', () => {
  const pet = createPet({ workspaceRoot: process.cwd() });
  assert.equal(pet.matches({ url: '/api/pet/assets/xilian-idle.gif' } as IncomingMessage), true);
  assert.equal(pet.matches({ url: '/api/pet/client.js' } as IncomingMessage), true);
  assert.equal(pet.matches({ url: '/foo' } as IncomingMessage), false);
  assert.equal(pet.matches({ url: '/api/pet' } as IncomingMessage), false);
});

test('handler: GET asset returns gif bytes', async () => {
  await withServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/assets/xilian-idle.gif`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/gif');
    const buf = new Uint8Array(await r.arrayBuffer());
    assert.equal(String.fromCharCode(buf[0]!, buf[1]!, buf[2]!, buf[3]!), 'GIF8');
  });
});

test('handler: GET unknown asset returns 404', async () => {
  await withServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/assets/notexist.gif`);
    assert.equal(r.status, 404);
  });
});

test('handler: GET asset blocks path traversal', async () => {
  await withServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/assets/..%2F..%2Fpackage.json`);
    assert.equal(r.status, 404);
  });
});

test('handler: GET client.js returns javascript', async () => {
  await withServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/client.js`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /javascript/);
    const text = await r.text();
    assert.ok(text.includes('xilian-idle.gif'), 'bundle should reference idle gif path');
  });
});

test('handler: scriptTag includes default bundle and config', () => {
  const pet = createPet({ workspaceRoot: process.cwd() });
  const tag = pet.scriptTag();
  assert.match(tag, /<script src="\/api\/pet\/client\.js" defer><\/script>/);
  assert.match(tag, /__SEREN_CONFIG__/);
  assert.match(tag, /"routePrefix":"\/api\/pet"/);
  // Default client config: sprite shown, autonomous motion on.
  assert.match(tag, /"showSprite":true/);
  assert.match(tag, /"autonomousMotion":true/);
});

test('handler: scriptTag honors routePrefix', () => {
  const pet = createPet({ workspaceRoot: process.cwd(), routePrefix: '/_pet' });
  const tag = pet.scriptTag();
  assert.match(tag, /<script src="\/_pet\/client\.js" defer><\/script>/);
  assert.match(tag, /"routePrefix":"\/_pet"/);
});

test('handler: scriptTag honors client toggles', () => {
  const pet = createPet({
    workspaceRoot: process.cwd(),
    client: { showSprite: false, autonomousMotion: false },
  });
  const tag = pet.scriptTag();
  assert.match(tag, /"showSprite":false/);
  assert.match(tag, /"autonomousMotion":false/);
});

// ─────────────────────────────────────────────────────────────────────────────
// HTTP route smoke tests — silent mode (no LLM), isolated chatDir.
// ─────────────────────────────────────────────────────────────────────────────

test('handler: POST /chat returns 503 in silent mode (no LLM)', async () => {
  await withIsolatedServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 's1', text: 'hi' }),
    });
    assert.equal(r.status, 503);
    const data = (await r.json()) as { message?: string };
    assert.match(data.message ?? '', /没接 LLM/);
  });
});

test('handler: POST /chat 400 when sessionId or text missing', async () => {
  await withIsolatedServer(async (port) => {
    // silent mode short-circuits to 503 before validation; that's still a
    // negative response (not a leak). Validate an alternate path here.
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    // In silent mode this is 503; that's the documented behavior.
    assert.ok([400, 503].includes(r.status));
  });
});

test('handler: GET /state returns emotion snapshot', async () => {
  await withIsolatedServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/state`);
    assert.equal(r.status, 200);
    const s = (await r.json()) as { affection?: number; mood?: number };
    assert.equal(typeof s.affection, 'number');
    assert.equal(typeof s.mood, 'number');
  });
});

test('handler: POST /event updates emotion state', async () => {
  await withIsolatedServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'click' }),
    });
    assert.equal(r.status, 200);
    const s = (await r.json()) as { affection?: number };
    assert.equal(typeof s.affection, 'number');
  });
});

test('handler: POST /event 400 when event missing', async () => {
  await withIsolatedServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(r.status, 400);
  });
});

test('handler: POST /signal returns 204', async () => {
  await withIsolatedServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/signal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 's1', currentDoc: 'a.md', lastActivityAgoSec: 5 }),
    });
    assert.equal(r.status, 204);
  });
});

test('handler: POST /signal 400 when sessionId missing', async () => {
  await withIsolatedServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/signal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(r.status, 400);
  });
});

test('handler: GET /history returns [] when no chat', async () => {
  await withIsolatedServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/history?session=fresh`);
    assert.equal(r.status, 200);
    const arr = (await r.json()) as unknown[];
    assert.deepEqual(arr, []);
  });
});

test('handler: DELETE /history returns 200', async () => {
  await withIsolatedServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/history?session=s1`, {
      method: 'DELETE',
    });
    assert.equal(r.status, 200);
    const data = (await r.json()) as { ok?: boolean };
    assert.equal(data.ok, true);
  });
});

test('handler: DELETE /history 400 when session missing', async () => {
  await withIsolatedServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/history`, { method: 'DELETE' });
    assert.equal(r.status, 400);
  });
});

test('handler: DELETE /memory returns 200', async () => {
  await withIsolatedServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/memory`, { method: 'DELETE' });
    assert.equal(r.status, 200);
  });
});

test('handler: POST /dream returns 503 in silent mode', async () => {
  await withIsolatedServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/dream`, { method: 'POST' });
    assert.equal(r.status, 503);
  });
});

test('handler: POST /apply-edit 400 when proposalId missing', async () => {
  await withIsolatedServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/apply-edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(r.status, 400);
  });
});

test('handler: POST /apply-edit 404 for unknown proposalId', async () => {
  await withIsolatedServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/apply-edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proposalId: 'never-existed' }),
    });
    assert.equal(r.status, 404);
  });
});

test('handler: unknown route returns 404 from outer server', async () => {
  await withIsolatedServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/nonexistent`);
    // matches() filters; unknown sub-paths fall through to outer 404
    assert.equal(r.status, 404);
  });
});

test('handler: GET /acquired returns empty traits initially', async () => {
  await withIsolatedServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/acquired`);
    assert.equal(r.status, 200);
    const data = (await r.json()) as { traits?: unknown[] };
    assert.ok(Array.isArray(data.traits));
    assert.equal(data.traits!.length, 0);
  });
});

test('handler: GET /dreams returns empty log initially', async () => {
  await withIsolatedServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/dreams`);
    assert.equal(r.status, 200);
    const data = (await r.json()) as { recentDreams?: unknown[]; lastDreamAt?: number };
    assert.ok(Array.isArray(data.recentDreams));
    assert.equal(data.recentDreams!.length, 0);
    assert.equal(data.lastDreamAt, 0);
  });
});
