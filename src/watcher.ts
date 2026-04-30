import { statSync, watch, type FSWatcher } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { DOC_ROOT, SUPPORTED_EXTENSIONS, EXCLUDED_DIRS } from './config.ts';
import { getMdFiles, invalidateFileCache } from './files.ts';
import { notifyClients } from './sse.ts';

const DEBOUNCE_MS = 50;
const POLL_INTERVAL_MS = 500;

function isSupported(file: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).some((ext) => file.endsWith(ext));
}

function isExcluded(rel: string): boolean {
  const head = rel.split(sep, 1)[0];
  return head !== undefined && (EXCLUDED_DIRS as readonly string[]).includes(head);
}

interface WatchState {
  knownFiles: Set<string>;
  fileMtimes: Map<string, number>;
  pendingPaths: Set<string>;
  flushTimer: NodeJS.Timeout | null;
}

function createState(): WatchState {
  const knownFiles = new Set(getMdFiles());
  const fileMtimes = new Map<string, number>();
  for (const f of knownFiles) {
    try {
      fileMtimes.set(f, statSync(join(DOC_ROOT, f)).mtimeMs);
    } catch {
      /* ignore */
    }
  }
  return { knownFiles, fileMtimes, pendingPaths: new Set(), flushTimer: null };
}

function flush(state: WatchState): void {
  state.flushTimer = null;
  const paths = [...state.pendingPaths];
  state.pendingPaths.clear();

  // Recompute current file set once for structural diff
  const currentFiles = new Set(getMdFiles());
  let structureChanged = false;

  for (const file of currentFiles) {
    if (!state.knownFiles.has(file)) {
      structureChanged = true;
      console.log(`➕ 检测到新文件: ${file}`);
      try {
        state.fileMtimes.set(file, statSync(join(DOC_ROOT, file)).mtimeMs);
      } catch {
        /* ignore */
      }
    }
  }
  for (const file of state.knownFiles) {
    if (!currentFiles.has(file)) {
      structureChanged = true;
      console.log(`➖ 检测到文件删除: ${file}`);
      state.fileMtimes.delete(file);
    }
  }
  if (structureChanged) {
    state.knownFiles = currentFiles;
    invalidateFileCache();
    notifyClients('reload');
  }

  // Per-file content-update events
  const seen = new Set<string>();
  for (const p of paths) {
    if (!isSupported(p) || isExcluded(p)) continue;
    if (!currentFiles.has(p)) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    try {
      const mtime = statSync(join(DOC_ROOT, p)).mtimeMs;
      const last = state.fileMtimes.get(p);
      if (last === undefined || mtime > last) {
        state.fileMtimes.set(p, mtime);
        notifyClients('update', { file: p });
      }
    } catch {
      /* ignore — likely just deleted */
    }
  }
}

function schedule(state: WatchState, relPath: string): void {
  state.pendingPaths.add(relPath);
  if (state.flushTimer === null) {
    state.flushTimer = setTimeout(() => {
      try {
        flush(state);
      } catch (err) {
        console.error('[watcher] flush error:', err);
      }
    }, DEBOUNCE_MS);
  }
}

function startFsWatch(state: WatchState): FSWatcher | null {
  try {
    const watcher = watch(DOC_ROOT, { recursive: true, persistent: true }, (_event, filename) => {
      if (!filename) return;
      const rel = filename.toString();
      if (isExcluded(rel)) return;
      schedule(state, rel);
    });
    watcher.on('error', (err) => {
      console.error('[watcher] fs.watch error:', err);
    });
    return watcher;
  } catch (err) {
    console.warn(`[watcher] fs.watch 不可用 (${(err as Error).message})，回退到 ${POLL_INTERVAL_MS}ms 轮询`);
    return null;
  }
}

function startPollingFallback(state: WatchState): NodeJS.Timeout {
  return setInterval(() => {
    try {
      const currentFiles = new Set(getMdFiles());
      const all = new Set([...currentFiles, ...state.knownFiles]);
      for (const f of all) schedule(state, relative(DOC_ROOT, join(DOC_ROOT, f)));
    } catch (err) {
      console.error('[watcher] polling error:', err);
    }
  }, POLL_INTERVAL_MS);
}

export function watchMdFiles(): void {
  const state = createState();
  const watcher = startFsWatch(state);
  if (watcher === null) startPollingFallback(state);
  console.log(`👀 正在监听 ${state.knownFiles.size} 个 Markdown 文件的变化...`);
}
