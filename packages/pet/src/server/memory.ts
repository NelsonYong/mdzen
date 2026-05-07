import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export interface PetMemory {
  summary: string;
  facts: string[];
  updatedAt: number;
}

const EMPTY: PetMemory = { summary: '', facts: [], updatedAt: 0 };

export interface MemoryStoreOptions {
  chatDir: string;
  workspaceRoot: string;
}

export interface MemoryStore {
  load(): Promise<PetMemory>;
  save(m: PetMemory): Promise<void>;
  reset(): Promise<void>;
  filePath: string;
}

export function createMemoryStore(opts: MemoryStoreOptions): MemoryStore {
  const hash = createHash('sha1').update(opts.workspaceRoot).digest('hex').slice(0, 12);
  const dir = join(opts.chatDir, 'workspaces', hash);
  const filePath = join(dir, 'memory.json');
  return {
    filePath,
    async load() {
      try {
        const buf = await readFile(filePath, 'utf-8');
        const parsed = JSON.parse(buf) as Partial<PetMemory>;
        return {
          summary: typeof parsed.summary === 'string' ? parsed.summary : '',
          facts: Array.isArray(parsed.facts)
            ? parsed.facts.filter((f): f is string => typeof f === 'string')
            : [],
          updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
        };
      } catch {
        return { ...EMPTY };
      }
    },
    async save(m) {
      await mkdir(dir, { recursive: true });
      const tmp = `${filePath}.${Date.now()}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(m, null, 2));
      await rename(tmp, filePath);
    },
    async reset() {
      try {
        await unlink(filePath);
      } catch {}
    },
  };
}
