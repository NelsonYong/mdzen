import type { ServerResponse } from 'node:http';

// Per-Pet SSE channel multiplexer. Previously held a module-level Map; now
// each `buildPet()` instance owns its own channels so two Pets in one process
// (or test isolation, or future Tauri sidecar embedding multiple profiles)
// don't share state.

export type PetEvent =
  | { type: 'token'; sessionId: string; text: string }
  | { type: 'ack'; sessionId: string; text: string; willing: boolean }
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
  | { type: 'action'; sessionId: string; animationId: string; durationMs: number }
  | {
      type: 'move-command';
      sessionId: string;
      kind: 'move-aside' | 'come-closer' | 'exercise' | 'stay' | 'stop';
      durationSec?: number;
    }
  | { type: 'error'; sessionId: string; message: string };

export interface SseChannels {
  attach(sessionId: string, res: ServerResponse): void;
  dispatch(event: PetEvent): void;
  closeAll(): void;
}

export function createSseChannels(): SseChannels {
  const channels = new Map<string, ServerResponse>();

  return {
    attach(sessionId, res) {
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
    },

    dispatch(event) {
      const ch = channels.get(event.sessionId);
      if (!ch) return;
      try {
        ch.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        channels.delete(event.sessionId);
      }
    },

    closeAll() {
      for (const ch of channels.values()) {
        try {
          ch.end();
        } catch {}
      }
      channels.clear();
    },
  };
}
