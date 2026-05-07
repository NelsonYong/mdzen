import { readFile } from 'node:fs/promises';
import { resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CreatePetOptions, Pet } from '../shared/types.ts';
import { ALL_GIFS } from '../shared/types.ts';

const HERE_FILE = fileURLToPath(import.meta.url);
const PKG_ROOT = resolve(dirname(HERE_FILE), '../..');
const ASSETS_DIR = resolve(PKG_ROOT, 'src/assets');
const CLIENT_JS_PATH = resolve(PKG_ROOT, 'dist/client.js');

const GIF_SET = new Set(ALL_GIFS);

interface RuntimeState {
  clientCache: Buffer | null;
}

export function buildPet(opts: CreatePetOptions): Pet {
  const prefix = (opts.routePrefix ?? '/api/pet').replace(/\/$/, '');
  const state: RuntimeState = { clientCache: null };

  const matches = (req: IncomingMessage): boolean => {
    const url = req.url ?? '';
    return url === `${prefix}/client.js` || url.startsWith(`${prefix}/assets/`);
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const url = (req.url ?? '').split('?')[0] ?? '';
      if (url === `${prefix}/client.js`) return await serveClient(state, res);
      if (url.startsWith(`${prefix}/assets/`)) {
        return await serveAsset(url.slice(`${prefix}/assets/`.length), res);
      }
      res.statusCode = 404;
      res.end();
    } catch {
      res.statusCode = 500;
      res.end();
    }
  };

  const scriptTag = (): string => `<script src="${prefix}/client.js" defer></script>`;
  const close = async (): Promise<void> => {
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
