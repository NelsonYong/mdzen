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
import { randomUUID } from 'node:crypto';

import { DOC_ROOT } from './config.ts';

const STORE_DIR = join(DOC_ROOT, '.mdzen');
const STORE_FILE = join(STORE_DIR, 'annotations.json');
const FILE_VERSION = 1;
const MAX_ANNOTATIONS_PER_FILE = 5_000;

export type AnnotationKind = 'highlight' | 'underline' | 'comment';
export type AnnotationColor = 'yellow' | 'green' | 'pink' | 'blue';

export interface TextQuoteAnchor {
  exact: string;
  prefix: string;
  suffix: string;
}

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  color: AnnotationColor;
  anchor: TextQuoteAnchor;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

interface Store {
  version: number;
  files: Record<string, Annotation[]>;
}

const VALID_KINDS: ReadonlySet<AnnotationKind> = new Set(['highlight', 'underline', 'comment']);
const VALID_COLORS: ReadonlySet<AnnotationColor> = new Set(['yellow', 'green', 'pink', 'blue']);

function emptyStore(): Store {
  return { version: FILE_VERSION, files: {} };
}

function readStore(): Store {
  if (!existsSync(STORE_FILE)) return emptyStore();
  try {
    const raw = readFileSync(STORE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Store>;
    if (!parsed || typeof parsed !== 'object') return emptyStore();
    if (parsed.version !== FILE_VERSION) return emptyStore();
    return {
      version: FILE_VERSION,
      files:
        parsed.files && typeof parsed.files === 'object'
          ? (parsed.files as Record<string, Annotation[]>)
          : {},
    };
  } catch (err) {
    console.error('[annotations] read error, starting fresh:', (err as Error).message);
    return emptyStore();
  }
}

function writeStoreAtomic(store: Store): void {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
  const tmpDir = mkdtempSync(join(dirname(STORE_FILE), '.mdzen-anno-'));
  const tmpFile = join(tmpDir, 'annotations.json');
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

// Serialize all reads/writes through a single in-process queue. Multiple mdzen on the same
// docRoot are already prevented by the registry, so this is enough for a local tool.
let queue: Promise<void> = Promise.resolve();

function enqueue<T>(work: () => T): Promise<T> {
  const next = queue.then(work);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function validateAnchor(value: unknown): TextQuoteAnchor | null {
  if (!value || typeof value !== 'object') return null;
  const a = value as Record<string, unknown>;
  if (!isString(a['exact']) || !isString(a['prefix']) || !isString(a['suffix'])) return null;
  if (a['exact'].length === 0 || a['exact'].length > 10_000) return null;
  if (a['prefix'].length > 256 || a['suffix'].length > 256) return null;
  return { exact: a['exact'], prefix: a['prefix'], suffix: a['suffix'] };
}

export interface CreateAnnotationInput {
  kind: unknown;
  color: unknown;
  anchor: unknown;
  note?: unknown;
}

export interface ValidationError {
  ok: false;
  error: string;
}

export interface AnnotationOk {
  ok: true;
  annotation: Annotation;
}

export function validateCreate(input: CreateAnnotationInput): AnnotationOk | ValidationError {
  if (!input || typeof input !== 'object') return { ok: false, error: 'body must be an object' };
  const kind = input.kind as AnnotationKind;
  const color = input.color as AnnotationColor;
  if (!VALID_KINDS.has(kind)) return { ok: false, error: `invalid kind: ${String(kind)}` };
  if (!VALID_COLORS.has(color)) return { ok: false, error: `invalid color: ${String(color)}` };

  const anchor = validateAnchor(input.anchor);
  if (!anchor) return { ok: false, error: 'invalid anchor' };

  const note =
    typeof input.note === 'string' && input.note.length > 0 && input.note.length <= 4000
      ? input.note
      : undefined;

  if (kind === 'comment' && !note) {
    return { ok: false, error: 'comment requires non-empty note' };
  }

  const now = new Date().toISOString();
  const annotation: Annotation = {
    id: randomUUID(),
    kind,
    color,
    anchor,
    createdAt: now,
    updatedAt: now,
    ...(note !== undefined ? { note } : {}),
  };
  return { ok: true, annotation };
}

export function listAnnotations(file: string): Promise<Annotation[]> {
  return enqueue(() => {
    const store = readStore();
    return store.files[file] ?? [];
  });
}

export function addAnnotation(file: string, annotation: Annotation): Promise<Annotation> {
  return enqueue(() => {
    const store = readStore();
    const list = store.files[file] ?? [];
    if (list.length >= MAX_ANNOTATIONS_PER_FILE) {
      throw new Error(`per-file annotation cap reached (${MAX_ANNOTATIONS_PER_FILE})`);
    }
    list.push(annotation);
    store.files[file] = list;
    writeStoreAtomic(store);
    return annotation;
  });
}

export function clearFileAnnotations(file: string): Promise<number> {
  return enqueue(() => {
    const store = readStore();
    const list = store.files[file];
    if (!list || list.length === 0) return 0;
    const count = list.length;
    delete store.files[file];
    writeStoreAtomic(store);
    return count;
  });
}

export function removeAnnotation(file: string, id: string): Promise<boolean> {
  return enqueue(() => {
    const store = readStore();
    const list = store.files[file];
    if (!list) return false;
    const idx = list.findIndex((a) => a.id === id);
    if (idx < 0) return false;
    list.splice(idx, 1);
    if (list.length === 0) delete store.files[file];
    else store.files[file] = list;
    writeStoreAtomic(store);
    return true;
  });
}

export function updateAnnotation(
  file: string,
  id: string,
  patch: { color?: AnnotationColor; note?: string | null },
): Promise<Annotation | null> {
  return enqueue(() => {
    const store = readStore();
    const list = store.files[file];
    if (!list) return null;
    const idx = list.findIndex((a) => a.id === id);
    if (idx < 0) return null;
    const current = list[idx]!;
    const next: Annotation = {
      ...current,
      ...(patch.color && VALID_COLORS.has(patch.color) ? { color: patch.color } : {}),
      ...(patch.note === null
        ? (() => {
            const { note: _omit, ...rest } = current;
            void _omit;
            return rest;
          })()
        : typeof patch.note === 'string' && patch.note.length <= 4000
          ? { note: patch.note }
          : {}),
      updatedAt: new Date().toISOString(),
    };
    list[idx] = next;
    store.files[file] = list;
    writeStoreAtomic(store);
    return next;
  });
}
