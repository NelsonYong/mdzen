const KEY = 'mdzen-pet-drag-log';
const WINDOW_MS = 5 * 60_000;

interface DragEntry {
  ts: number;
  durationMs: number;
}

function read(): DragEntry[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DragEntry[];
  } catch {
    return [];
  }
}

function write(entries: DragEntry[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(entries));
  } catch {}
}

export function recordDrag(durationMs: number): {
  countInWindow: number;
  totalDurationInWindow: number;
} {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const fresh = read().filter((e) => e.ts >= cutoff);
  fresh.push({ ts: now, durationMs });
  write(fresh);
  let total = 0;
  for (const e of fresh) total += e.durationMs;
  return { countInWindow: fresh.length, totalDurationInWindow: total };
}

export function dragsInWindow(): { countInWindow: number } {
  const cutoff = Date.now() - WINDOW_MS;
  const fresh = read().filter((e) => e.ts >= cutoff);
  return { countInWindow: fresh.length };
}
