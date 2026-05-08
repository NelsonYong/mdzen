import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';

// Chat history per workspace+session.
//
// IMPORTANT: this is the only WORKSPACE-scoped store. All other long-lived state
// (memory, emotion, presence, inner-thought, acquired, dream-log) lives in
// `~/.seren/global/` because she has ONE relationship with the user across
// every project. Conversations stay topic/scene-scoped, hence per-workspace
// here. Don't store anything relationship-shaped (facts, mood, etc.) in this
// store — that belongs to global.

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface StorageOptions {
  chatDir: string;
  workspaceRoot: string;
}

/** Chat history store. Workspace-scoped (per-folder), session-scoped within. */
export interface Storage {
  workspaceDir: string;
  appendMessage(sessionId: string, msg: ChatMessage): Promise<void>;
  loadHistory(sessionId: string): Promise<ChatMessage[]>;
  clearHistory(sessionId: string): Promise<void>;
}

export function createStorage(opts: StorageOptions): Storage {
  const hash = createHash('sha1').update(opts.workspaceRoot).digest('hex').slice(0, 12);
  const workspaceDir = join(opts.chatDir, 'workspaces', hash, 'chat');

  async function appendMessage(sessionId: string, msg: ChatMessage): Promise<void> {
    await mkdir(workspaceDir, { recursive: true });
    const file = join(workspaceDir, `${sanitize(sessionId)}.json`);
    const existing = await loadFile(file);
    existing.push(msg);
    await atomicWrite(file, JSON.stringify(existing, null, 2));
  }

  async function loadHistory(sessionId: string): Promise<ChatMessage[]> {
    const file = join(workspaceDir, `${sanitize(sessionId)}.json`);
    return loadFile(file);
  }

  async function clearHistory(sessionId: string): Promise<void> {
    const file = join(workspaceDir, `${sanitize(sessionId)}.json`);
    try {
      await unlink(file);
    } catch {}
  }

  return { workspaceDir, appendMessage, loadHistory, clearHistory };
}

async function loadFile(file: string): Promise<ChatMessage[]> {
  try {
    const buf = await readFile(file, 'utf-8');
    return JSON.parse(buf) as ChatMessage[];
  } catch {
    return [];
  }
}

async function atomicWrite(file: string, content: string): Promise<void> {
  const tmp = `${file}.${Date.now()}.${process.pid}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, file);
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}
