import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { DOC_ROOT } from './config.ts';

const STORE_DIR = join(DOC_ROOT, '.mdzen');
const STORE_FILE = join(STORE_DIR, 'canvas.json');
const FILE_VERSION = 1;
const MAX_SVG_BYTES = 1_000_000; // 1 MB per file

interface Store {
  version: number;
  files: Record<string, string>;
}

function emptyStore(): Store {
  return { version: FILE_VERSION, files: {} };
}

function readStore(): Store {
  if (!existsSync(STORE_FILE)) return emptyStore();
  try {
    const raw = readFileSync(STORE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Store>;
    if (!parsed || parsed.version !== FILE_VERSION) return emptyStore();
    return {
      version: FILE_VERSION,
      files:
        parsed.files && typeof parsed.files === 'object'
          ? (parsed.files as Record<string, string>)
          : {},
    };
  } catch (err) {
    console.error('[canvas] read error, starting fresh:', (err as Error).message);
    return emptyStore();
  }
}

function writeStoreAtomic(store: Store): void {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
  const tmpDir = mkdtempSync(join(dirname(STORE_FILE), '.mdzen-canvas-'));
  const tmpFile = join(tmpDir, 'canvas.json');
  try {
    writeFileSync(tmpFile, JSON.stringify(store, null, 2), 'utf-8');
    renameSync(tmpFile, STORE_FILE);
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      /* already moved */
    }
    try {
      rmdirSync(tmpDir);
    } catch {
      /* ignore */
    }
  }
}

let queue: Promise<void> = Promise.resolve();

function enqueue<T>(work: () => T): Promise<T> {
  const next = queue.then(work);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export interface CanvasResult {
  ok: true;
  svg: string;
}
export interface CanvasError {
  ok: false;
  error: string;
}

export function getCanvas(file: string): Promise<string> {
  return enqueue(() => readStore().files[file] ?? '');
}

export function putCanvas(file: string, svg: unknown): Promise<CanvasResult | CanvasError> {
  return enqueue(() => {
    if (typeof svg !== 'string') return { ok: false, error: 'svg must be a string' };
    if (svg.length > MAX_SVG_BYTES) {
      return { ok: false, error: `svg too large (max ${MAX_SVG_BYTES} bytes)` };
    }
    // Reject obviously dangerous content. Drauu emits only path/line/rect/ellipse/g/defs.
    if (/<\s*script\b/i.test(svg) || /\bjavascript:/i.test(svg) || /\bon\w+\s*=/i.test(svg)) {
      return { ok: false, error: 'svg contains disallowed content' };
    }
    const store = readStore();
    if (svg.length === 0) delete store.files[file];
    else store.files[file] = svg;
    writeStoreAtomic(store);
    return { ok: true, svg };
  });
}

export function deleteCanvas(file: string): Promise<boolean> {
  return enqueue(() => {
    const store = readStore();
    if (!(file in store.files)) return false;
    delete store.files[file];
    writeStoreAtomic(store);
    return true;
  });
}
