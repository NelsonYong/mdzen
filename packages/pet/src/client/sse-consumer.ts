import { getRoutePrefix } from './route-config.ts';
import type { PetActivity } from '../shared/types.ts';

export interface SseHandlers {
  onToken?(text: string): void;
  onAck?(payload: { text: string; willing: boolean }): void;
  onFinal?(): void;
  onError?(message: string): void;
  onProposeEdit?(payload: {
    proposalId: string;
    path: string;
    oldText: string;
    newText: string;
    reason: string;
  }): void;
  onEditApplied?(payload: { proposalId: string; path: string }): void;
  onToolEnd?(tool: string): void;
  onAction?(payload: { animationId: string; durationMs: number }): void;
  onMoveCommand?(payload: {
    kind: 'move-aside' | 'come-closer' | 'exercise' | 'stay' | 'stop';
    durationSec?: number;
  }): void;
}

export class SseConsumer {
  private es: EventSource | null = null;

  constructor(sessionId: string, handlers: SseHandlers, prefix = getRoutePrefix()) {
    this.es = new EventSource(`${prefix}/sse?session=${encodeURIComponent(sessionId)}`);
    this.es.onmessage = (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data as string);
        switch (ev.type) {
          case 'token':
            handlers.onToken?.(ev.text);
            break;
          case 'ack':
            handlers.onAck?.({
              text: typeof ev.text === 'string' ? ev.text : '',
              willing: ev.willing === true,
            });
            break;
          case 'final':
            handlers.onFinal?.();
            break;
          case 'error':
            handlers.onError?.(ev.message ?? '');
            break;
          case 'tool-end':
            handlers.onToolEnd?.(ev.tool);
            break;
          case 'propose-edit':
            handlers.onProposeEdit?.({
              proposalId: ev.proposalId,
              path: ev.path,
              oldText: ev.oldText,
              newText: ev.newText,
              reason: ev.reason,
            });
            break;
          case 'edit-applied':
            handlers.onEditApplied?.({ proposalId: ev.proposalId, path: ev.path });
            break;
          case 'action':
            handlers.onAction?.({
              animationId: ev.animationId,
              durationMs: typeof ev.durationMs === 'number' ? ev.durationMs : 1500,
            });
            break;
          case 'move-command':
            console.log('[seren sse] move-command received:', ev.kind, ev.durationSec);
            handlers.onMoveCommand?.({
              kind: ev.kind,
              ...(typeof ev.durationSec === 'number' ? { durationSec: ev.durationSec } : {}),
            });
            break;
        }
      } catch {}
    };
  }

  destroy(): void {
    this.es?.close();
    this.es = null;
  }
}

export async function postChat(
  sessionId: string,
  text: string,
  context?: { currentDoc?: string; currentActivity?: PetActivity },
  prefix = getRoutePrefix(),
): Promise<{ status: number; data: unknown }> {
  const r = await fetch(`${prefix}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, text, ...(context ?? {}) }),
  });
  let data: unknown = null;
  try {
    data = await r.json();
  } catch {}
  return { status: r.status, data };
}
