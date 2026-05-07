import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { EmotionState } from './emotion.ts';
import { INITIAL_STATE } from './emotion.ts';

export interface EmotionStoreOptions {
  chatDir: string;
  workspaceRoot: string;
}

export interface EmotionStore {
  load(): Promise<EmotionState>;
  save(s: EmotionState): Promise<void>;
  filePath: string;
}

export function createEmotionStore(opts: EmotionStoreOptions): EmotionStore {
  const hash = createHash('sha1').update(opts.workspaceRoot).digest('hex').slice(0, 12);
  const dir = join(opts.chatDir, 'workspaces', hash);
  const filePath = join(dir, 'pet-state.json');
  return {
    filePath,
    async load() {
      try {
        const buf = await readFile(filePath, 'utf-8');
        return JSON.parse(buf) as EmotionState;
      } catch {
        return INITIAL_STATE(Date.now());
      }
    },
    async save(s) {
      await mkdir(dir, { recursive: true });
      const tmp = `${filePath}.${Date.now()}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(s, null, 2));
      await rename(tmp, filePath);
    },
  };
}
