import type { ServerResponse } from 'node:http';

export type PetEvent =
  | { type: 'token'; sessionId: string; text: string }
  | { type: 'tool-start'; sessionId: string; tool: string }
  | { type: 'tool-end'; sessionId: string; tool: string }
  | { type: 'propose-edit';
      sessionId: string;
      proposalId: string;
      path: string;
      oldText: string;
      newText: string;
      reason: string }
  | { type: 'edit-applied'; sessionId: string; proposalId: string; path: string }
  | { type: 'final'; sessionId: string; messageId: string }
  | { type: 'error'; sessionId: string; message: string };

const channels = new Map<string, ServerResponse>();

export function attachSseClient(sessionId: string, res: ServerResponse): void {
  const existing = channels.get(sessionId);
  if (existing) existing.end();

  res.statusCode = 200;
  res.setHeader('content-type', 'text/event-stream');
  res.setHeader('cache-control', 'no-cache');
  res.setHeader('connection', 'keep-alive');
  res.setHeader('x-accel-buffering', 'no');
  res.write(': connected\n\n');
  channels.set(sessionId, res);

  res.on('close', () => {
    if (channels.get(sessionId) === res) channels.delete(sessionId);
  });
}

export function dispatch(event: PetEvent): void {
  const ch = channels.get(event.sessionId);
  if (!ch) return;
  try {
    ch.write(`data: ${JSON.stringify(event)}\n\n`);
  } catch {
    channels.delete(event.sessionId);
  }
}

export function closeAll(): void {
  for (const ch of channels.values()) {
    try {
      ch.end();
    } catch {}
  }
  channels.clear();
}
