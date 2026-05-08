import { mkdir, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

// Best-effort one-time migration from the v1 per-workspace storage layout
// (~/.seren/workspaces/<hash>/*.json) to the v2 global layout
// (~/.seren/global/*.json). Picks the most recently updated workspace as the
// source of truth — that's the one the user has actively interacted with.
//
// Idempotent: skipped entirely once globalDir contains any of the target files.
// Errors are swallowed; this never blocks startup.

const TARGET_FILES = [
  'memory.json',
  'emotion.json',
  'inner-thought.json',
  'acquired.json',
  'presence.json',
];

// Legacy filename → new filename. Single rename (pet-state → emotion).
const LEGACY_FILENAME: Record<string, string> = {
  'pet-state.json': 'emotion.json',
};

export async function migrateLegacyWorkspaceData(
  chatDir: string,
  globalDir: string,
): Promise<void> {
  // Idempotency: if any target already exists in global, do nothing.
  for (const f of TARGET_FILES) {
    if (await exists(join(globalDir, f))) return;
  }

  const workspacesDir = join(chatDir, 'workspaces');
  let entries: string[];
  try {
    entries = await readdir(workspacesDir);
  } catch {
    return;
  }
  if (entries.length === 0) return;

  // Find the workspace with the most recently modified target files.
  let bestDir: string | null = null;
  let bestMtime = 0;
  for (const e of entries) {
    const wd = join(workspacesDir, e);
    const cands = [
      ...TARGET_FILES,
      ...Object.keys(LEGACY_FILENAME),
    ];
    let dirMax = 0;
    for (const f of cands) {
      try {
        const s = await stat(join(wd, f));
        if (s.mtimeMs > dirMax) dirMax = s.mtimeMs;
      } catch {
        // missing file is fine
      }
    }
    if (dirMax > bestMtime) {
      bestMtime = dirMax;
      bestDir = wd;
    }
  }
  if (!bestDir) return;

  await mkdir(globalDir, { recursive: true });
  const sourceFiles = [
    ...TARGET_FILES.map((f) => ({ src: f, dst: f })),
    ...Object.entries(LEGACY_FILENAME).map(([src, dst]) => ({ src, dst })),
  ];
  for (const { src, dst } of sourceFiles) {
    try {
      const buf = await readFile(join(bestDir, src), 'utf-8');
      await writeFile(join(globalDir, dst), buf);
    } catch {
      // missing or unreadable — skip
    }
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}
