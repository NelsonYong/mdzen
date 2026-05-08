import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';

// Generic JSON file store. Replaces six near-identical store files
// (memory / emotion / presence / inner-thought / acquired / dream-log).
//
// Atomic writes: temp file + rename. Validation is the caller's responsibility
// — `validate(parsed)` returns the typed value or null (treated as "missing /
// corrupt"; loader returns `empty`). This keeps schema migration logic in the
// owning module rather than baked into the store.
//
// Concurrency: emotion.json + presence.json get hit from agent post-reply jobs,
// /event handlers, and /signal fire-and-forget at the same time. Two saves
// within the same millisecond used to collide on the temp filename
// (Date.now() + pid was not unique enough), causing rename ENOENT after the
// first one consumed the shared tmp. Two layers of defense:
//   1. process-wide monotonic counter in the temp name
//   2. per-filePath promise chain so saves of the same target serialize
//      (also prevents read-modify-write loss from concurrent callers)

let writeCounter = 0;
const writeLocks = new Map<string, Promise<unknown>>();

export interface JsonStoreOptions<T> {
  /** Directory where the file lives. Created on first save. */
  dir: string;
  /** File basename, e.g. 'memory.json'. */
  file: string;
  /**
   * Validate + coerce a parsed JSON blob into T. Return null if the data is
   * malformed or unrecognized — load() will return `empty` in that case.
   */
  validate: (parsed: unknown) => T | null;
  /**
   * Default value used when:
   *  1. file doesn't exist
   *  2. file exists but is unreadable
   *  3. file parses but `validate` returns null
   *
   * Either a literal or a thunk (use the thunk form for values that depend on
   * `Date.now()` so each empty load gets a fresh timestamp).
   */
  empty: T | (() => T);
}

export interface JsonStore<T> {
  load(): Promise<T>;
  save(value: T): Promise<void>;
  /** Delete the underlying file. Best-effort; missing-file errors swallowed. */
  reset(): Promise<void>;
  /** Absolute path to the JSON file. Useful for tests + lock files alongside. */
  filePath: string;
  /** Directory containing the file. Useful for placing siblings (e.g. lock). */
  dir: string;
}

export function createJsonStore<T>(opts: JsonStoreOptions<T>): JsonStore<T> {
  const { dir, file, validate, empty } = opts;
  const filePath = join(dir, file);
  const emptyValue = (): T => (typeof empty === 'function' ? (empty as () => T)() : empty);

  return {
    filePath,
    dir,
    async load() {
      try {
        const buf = await readFile(filePath, 'utf-8');
        const parsed = JSON.parse(buf) as unknown;
        const v = validate(parsed);
        return v ?? emptyValue();
      } catch {
        return emptyValue();
      }
    },
    async save(value: T): Promise<void> {
      const prev = writeLocks.get(filePath) ?? Promise.resolve();
      const task = prev.catch(() => {}).then(async () => {
        await mkdir(dir, { recursive: true });
        const tmp = `${filePath}.${Date.now()}.${process.pid}.${++writeCounter}.tmp`;
        await writeFile(tmp, JSON.stringify(value, null, 2));
        await rename(tmp, filePath);
      });
      writeLocks.set(filePath, task);
      try {
        await task;
      } finally {
        if (writeLocks.get(filePath) === task) writeLocks.delete(filePath);
      }
    },
    async reset() {
      try {
        await unlink(filePath);
      } catch {}
    },
  };
}
