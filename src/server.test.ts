import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

const PORT = 3950 + Math.floor(Math.random() * 40);
let proc: ChildProcess;
let docRoot: string;

async function waitForServer(port: number, attempts = 30): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(`http://localhost:${port}/`);
      if (r.ok) return;
    } catch {
      /* not ready */
    }
    await wait(100);
  }
  throw new Error(`server did not start on port ${port}`);
}

describe('HTTP integration', () => {
  before(async () => {
    docRoot = mkdtempSync(join(tmpdir(), 'mdzen-http-'));
    writeFileSync(join(docRoot, 'hello.md'), '---\ntitle: Hello\n---\n# Hello\n\nworld\n');
    mkdirSync(join(docRoot, 'sub'));
    writeFileSync(join(docRoot, 'sub', 'inner.md'), '# Inner');
    writeFileSync(join(docRoot, 'evil-<img src=x>.md'), '# safe filename test');

    proc = spawn(
      process.execPath,
      ['--experimental-strip-types', 'src/server.ts', '-d', docRoot, '-p', String(PORT)],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    await waitForServer(PORT);
  });

  after(async () => {
    proc?.kill('SIGTERM');
    await wait(200);
    if (!proc.killed) proc.kill('SIGKILL');
    rmSync(docRoot, { recursive: true, force: true });
  });

  it('GET / returns the file index page', async () => {
    const r = await fetch(`http://localhost:${PORT}/`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /text\/html/);
    const body = await r.text();
    assert.ok(body.includes('hello.md'));
  });

  it('GET /api/content/:file returns rendered HTML and TOC JSON', async () => {
    const r = await fetch(`http://localhost:${PORT}/api/content/hello.md`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /application\/json/);
    const data = (await r.json()) as { html: string; tocHtml: string; filePath: string };
    assert.ok(data.html.includes('Hello'));
    assert.ok(data.tocHtml.includes('Hello'));
    assert.ok(data.filePath.endsWith('hello.md'));
  });

  it('GET /view/missing.md returns 404 with back-link', async () => {
    const r = await fetch(`http://localhost:${PORT}/view/missing.md`);
    assert.equal(r.status, 200, 'still 200 because we render an HTML 404 page');
    const body = await r.text();
    assert.ok(body.includes('文件不存在'));
    assert.ok(body.includes('返回首页'));
  });

  it('GET /api/content/missing returns 404 JSON', async () => {
    const r = await fetch(`http://localhost:${PORT}/api/content/missing.md`);
    assert.equal(r.status, 404);
  });

  it('rejects path traversal with 403', async () => {
    const r = await fetch(`http://localhost:${PORT}/view/..%2F..%2Fetc%2Fpasswd`);
    // Markdown extension check fails first → falls through to serveStaticFile which 403s
    assert.ok([403, 404].includes(r.status), `expected 403/404, got ${r.status}`);
  });

  it('GET /sse opens an event stream and emits a connected event', async () => {
    const r = await fetch(`http://localhost:${PORT}/sse?clientId=test-1`, {
      headers: { Accept: 'text/event-stream' },
    });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /text\/event-stream/);
    const reader = r.body!.getReader();
    const { value } = await reader.read();
    const chunk = new TextDecoder().decode(value);
    assert.match(chunk, /"type":"connected"/);
    await reader.cancel();
  });

  it('escapes filenames with HTML-special chars in tree output', async () => {
    const r = await fetch(`http://localhost:${PORT}/`);
    const body = await r.text();
    // Filename evil-<img src=x>.md must appear as &lt;img src=x&gt; — not as a real img tag
    assert.ok(body.includes('evil-&lt;img'), 'filename should be HTML-escaped');
    assert.ok(!body.includes('evil-<img src=x>'), 'raw filename must not appear unescaped');
  });
});
