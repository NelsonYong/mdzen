import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NotifyType } from './types.ts';

const sseClients = new Map<string, ServerResponse>();
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function safeWrite(res: ServerResponse, message: string): boolean {
  try {
    return res.write(message);
  } catch (err) {
    console.error('[sse] write error:', (err as Error).message);
    return false;
  }
}

export function notifyClients(type: NotifyType, data: Record<string, string> = {}): void {
  const message = `data: ${JSON.stringify({ type, ...data })}\n\n`;

  for (const [clientId, client] of sseClients) {
    const ok = safeWrite(client, message);
    if (!ok) {
      // write returned false → buffer full, but don't drop client; backpressure will drain
      // unless write threw, in which case we removed it via catch
    }
    if (client.writableEnded || client.destroyed) {
      sseClients.delete(clientId);
    }
  }

  const logMessages: Partial<Record<NotifyType, string>> = {
    update: `📝 文件更新: ${data['file']}`,
    add: `➕ 文件添加: ${data['file']}`,
    delete: `➖ 文件删除: ${data['file']}`,
    reload: `🔄 文件列表变化`,
  };
  console.log(`${logMessages[type] ?? type}，已通知 ${sseClients.size} 个客户端`);
}

export function closeAllClients(): void {
  for (const [, client] of sseClients) {
    try {
      client.end();
    } catch (err) {
      console.error('[sse] close error:', (err as Error).message);
    }
  }
  sseClients.clear();
}

export function handleSSE(req: IncomingMessage, res: ServerResponse, clientId: string): void {
  const origin = req.headers.origin;
  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
  if (origin && LOCAL_ORIGIN_RE.test(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  res.writeHead(200, headers);

  if (sseClients.has(clientId)) {
    try {
      sseClients.get(clientId)!.end();
    } catch (err) {
      console.error('[sse] replace prior connection error:', (err as Error).message);
    }
  }

  safeWrite(res, `data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);
  sseClients.set(clientId, res);
  console.log(
    `🔗 SSE 客户端已连接 [${clientId.slice(0, 8)}...]，当前连接数: ${sseClients.size}`,
  );

  const heartbeat = setInterval(() => {
    if (!safeWrite(res, ': heartbeat\n\n') || res.writableEnded) {
      clearInterval(heartbeat);
    }
  }, 15_000);

  const cleanup = (): void => {
    clearInterval(heartbeat);
    if (sseClients.get(clientId) === res) {
      sseClients.delete(clientId);
      console.log(
        `❌ SSE 客户端已断开 [${clientId.slice(0, 8)}...]，当前连接数: ${sseClients.size}`,
      );
    }
  };

  req.on('close', cleanup);
  res.on('close', cleanup);
  res.on('error', (err) => {
    console.error('[sse] response error:', err.message);
    cleanup();
  });
}
