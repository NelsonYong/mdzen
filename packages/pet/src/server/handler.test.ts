import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server, type IncomingMessage } from 'node:http';
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

test('handler: scriptTag returns expected markup', () => {
  const pet = createPet({ workspaceRoot: process.cwd() });
  assert.equal(pet.scriptTag(), '<script src="/api/pet/client.js" defer></script>');
});

test('handler: scriptTag honors routePrefix', () => {
  const pet = createPet({ workspaceRoot: process.cwd(), routePrefix: '/_pet' });
  assert.equal(pet.scriptTag(), '<script src="/_pet/client.js" defer></script>');
});
