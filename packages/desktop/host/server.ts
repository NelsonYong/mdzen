// Pet-only sidecar — what the Tauri shell spawns. There's no markdown reader
// here; the desktop product is the companion alone. mdzen is fully decoupled.
//
// Three HTML routes, one per Tauri window, all backed by the same `pet`
// instance + bundle:
//   GET /sprite   → tiny floating window: just the sprite + bubble
//   GET /input    → floating prompt window: just the chat input bar
//   GET /history  → resizable window: just the history modal
// `/` redirects to `/sprite`.
//
// Configuration is env-only (Tauri inherits parent env, so users set these
// before launching `pnpm desktop:dev`):
//   OPENAI_API_KEY (or SEREN_API_KEY) — required for chat to work
//   OPENAI_BASE_URL (or SEREN_BASE_URL) — optional override for non-OpenAI
//                                          providers (DeepSeek, Qwen, etc.)
//   SEREN_MODEL — optional model id override
//   SEREN_WORKSPACE_ROOT — optional; defaults to the user's home directory.
//                          Only matters for the apply-edit endpoint, which
//                          isn't reachable from the desktop UI.
//   SEREN_PRESET — lover / pet / friend / sister (default: lover)
//   SEREN_PROFILE_PATH — optional .md profile override
//
// Port is OS-assigned (listen on 0); we print one line of stdout matching
// the format the Rust side parses: `📍 http://127.0.0.1:PORT`.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { createPet } from '../../pet/src/index.ts';

const apiKey = process.env.OPENAI_API_KEY ?? process.env.SEREN_API_KEY ?? '';
const baseURL = process.env.OPENAI_BASE_URL ?? process.env.SEREN_BASE_URL ?? undefined;
const model = process.env.SEREN_MODEL ?? undefined;
const workspaceRoot = resolve(process.env.SEREN_WORKSPACE_ROOT ?? homedir());
const preset = (process.env.SEREN_PRESET ?? 'lover') as
  | 'lover'
  | 'pet'
  | 'friend'
  | 'sister';
const profilePath = process.env.SEREN_PROFILE_PATH || undefined;

const pet = createPet({
  workspaceRoot,
  preset,
  ...(profilePath ? { profilePath } : {}),
  llm: {
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    ...(model ? { model } : {}),
  },
});

type Mode = 'sprite' | 'input' | 'history';

/**
 * Render the per-mode HTML shell. Each shell loads the same pet bundle but
 * overrides `__SEREN_CONFIG__.mode` AFTER pet's own scriptTag has set the
 * snapshot (the snapshot's default is 'embedded' — we override it here).
 */
function renderShell(mode: Mode): string {
  const bgStyle =
    mode === 'history'
      ? 'background: #14141c;'
      : 'background: transparent;';
  // Drag-region is NOT applied to body. Why:
  //   - sprite mode: the sprite element manages its own click-or-drag intent
  //     in JS (window-drag.ts). Body drag-region would conflict with click
  //     events and make the sprite element non-interactive in some cases.
  //     The Rust side injects a small 8px transparent drag strip at the
  //     window top as a predictable fallback.
  //   - input mode: the window is too small to need drag, and Esc closes it.
  //   - history mode: standard OS chrome (decorations: true) handles drag.

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' http://127.0.0.1:* http://localhost:*; img-src * data: blob:; connect-src *; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'">
  <title>希莲 — ${mode}</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100vw;
      height: 100vh;
      ${bgStyle}
      overflow: hidden;
      -webkit-user-select: none;
      user-select: none;
      font: 13px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #d8d8d8;
      cursor: default;
    }
    ::-webkit-scrollbar { width: 0; height: 0; }
  </style>
</head>
<body>
${pet.scriptTag()}
<script>
  // Override the mode AFTER pet's snapshot scriptTag set __SEREN_CONFIG__.
  // (Pet defaults to 'embedded'; the desktop shell wants 'sprite'/'input'/'history'.)
  if (window.__SEREN_CONFIG__) window.__SEREN_CONFIG__.mode = ${JSON.stringify(mode)};
</script>
</body>
</html>`;
}

const shells: Record<Mode, string> = {
  sprite: renderShell('sprite'),
  input: renderShell('input'),
  history: renderShell('history'),
};

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    if (pet.matches(req)) return pet.handle(req, res);
    const url = req.url ?? '';
    const path = url.split('?')[0] ?? '';
    if (path === '/') {
      res.statusCode = 302;
      res.setHeader('location', '/sprite');
      res.end();
      return;
    }
    let mode: Mode | null = null;
    if (path === '/sprite' || path === '/sprite.html') mode = 'sprite';
    else if (path === '/input' || path === '/input.html') mode = 'input';
    else if (path === '/history' || path === '/history.html') mode = 'history';
    if (mode) {
      res.statusCode = 200;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(shells[mode]);
      return;
    }
    res.statusCode = 404;
    res.end();
  } catch (err) {
    console.error('[seren-host] handle error:', err instanceof Error ? err.message : err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end();
    }
  }
});

// Bind to 127.0.0.1 only — the desktop sidecar must never be reachable from
// the network. Port 0 = let the OS pick a free port; stdout broadcasts the
// chosen port to the Rust parent.
server.listen(0, '127.0.0.1', () => {
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  console.log(`📍 http://127.0.0.1:${port}`);
  if (!apiKey) {
    console.warn('[seren-host] no OPENAI_API_KEY set — chat will fall back to silent mode');
  }
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[seren-host] ${signal} received, shutting down`);
  try {
    await pet.close();
  } catch {}
  server.close(() => process.exit(0));
  // Hard-exit fallback if server.close hangs on lingering SSE clients.
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
