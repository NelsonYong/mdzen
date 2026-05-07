export interface SseHandlers {
  onToken?(text: string): void;
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
}

export class SseConsumer {
  private es: EventSource | null = null;

  constructor(sessionId: string, handlers: SseHandlers, prefix = '/api/pet') {
    this.es = new EventSource(`${prefix}/sse?session=${encodeURIComponent(sessionId)}`);
    this.es.onmessage = (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data as string);
        switch (ev.type) {
          case 'token':
            handlers.onToken?.(ev.text);
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
  prefix = '/api/pet',
): Promise<{ status: number; data: unknown }> {
  const r = await fetch(`${prefix}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, text }),
  });
  let data: unknown = null;
  try {
    data = await r.json();
  } catch {}
  return { status: r.status, data };
}
