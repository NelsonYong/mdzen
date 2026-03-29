import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NotifyType } from './types.ts';

const sseClients = new Map<string, ServerResponse>();

export function notifyClients(type: NotifyType, data: Record<string, string> = {}): void {
  const message = `data: ${JSON.stringify({ type, ...data })}\n\n`;

  for (const [clientId, client] of sseClients) {
    try {
      client.write(message);
    } catch {
      sseClients.delete(clientId);
    }
  }

  const logMessages: Partial<Record<NotifyType, string>> = {
    update: `📝 文件更新: ${data['file']}`,
    add:    `➕ 文件添加: ${data['file']}`,
    delete: `➖ 文件删除: ${data['file']}`,
    reload: `🔄 文件列表变化`,
  };
  console.log(`${logMessages[type] ?? type}，已通知 ${sseClients.size} 个客户端`);
}

export function closeAllClients(): void {
  for (const [, client] of sseClients) {
    try { client.end(); } catch { /* ignore */ }
  }
  sseClients.clear();
}

export function handleSSE(req: IncomingMessage, res: ServerResponse, clientId: string): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Replace any existing connection for this client
  if (sseClients.has(clientId)) {
    try { sseClients.get(clientId)!.end(); } catch { /* ignore */ }
  }

  res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);
  sseClients.set(clientId, res);
  console.log(`🔗 SSE 客户端已连接 [${clientId.slice(0, 8)}...]，当前连接数: ${sseClients.size}`);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 15_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    if (sseClients.get(clientId) === res) {
      sseClients.delete(clientId);
      console.log(`❌ SSE 客户端已断开 [${clientId.slice(0, 8)}...]，当前连接数: ${sseClients.size}`);
    }
  });
}
