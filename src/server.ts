#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname } from 'node:path';

import {
  PORT,
  DOC_ROOT,
  SUPPORTED_EXTENSIONS,
  MIME_TYPES,
  registerInstance,
  unregisterInstance,
  findByDocRoot,
} from './config.ts';
import { serveStaticFile } from './files.ts';
import { getMarkdownWithToc, renderToc, renderFrontmatter } from './markdown.ts';
import { renderIndex, renderMarkdown } from './pages.ts';
import { getHtmlTemplate, logoSvgFileContent } from './templates.ts';
import { handleSSE, closeAllClients } from './sse.ts';
import { watchMdFiles } from './watcher.ts';
import { decodeUrlPath, html, safeJsonForScript } from './utils/security.ts';
import {
  listAnnotations,
  addAnnotation,
  removeAnnotation,
  updateAnnotation,
  clearFileAnnotations,
  validateCreate,
  type AnnotationColor,
} from './annotations.ts';
import { getCanvas, putCanvas, deleteCanvas } from './canvas.ts';

function originIsLocal(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}

function setLocalCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (origin && originIsLocal(req)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
}

function send404(res: ServerResponse): void {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(
    getHtmlTemplate(
      '404',
      html`<div class="content"><h1>页面不存在</h1><p><a class="back-link" href="/">← 返回首页</a></p></div>`,
    ),
  );
}

function send500(res: ServerResponse, err: unknown): void {
  console.error('请求处理错误:', err);
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.statusCode = 500;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Internal Server Error');
}

const MAX_BODY_BYTES = 256 * 1024;

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf-8');
        resolve(text.length === 0 ? null : JSON.parse(text));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function isValidFilePath(file: string): boolean {
  return !!file && !file.includes('..') && !file.startsWith('/') && !file.includes('\0');
}

async function handleAnnotations(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  query: URLSearchParams,
): Promise<void> {
  setLocalCors(req, res);

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    res.end();
    return;
  }

  const rest = url.slice('/api/annotations/'.length);
  if (!rest) {
    sendJson(res, 400, { error: 'file path required' });
    return;
  }

  // rest is "<file>" or "<file>/<id>"
  const slashIdx = rest.lastIndexOf('/');
  let file = rest;
  let id: string | undefined;
  if ((req.method === 'DELETE' || req.method === 'PATCH') && slashIdx > 0) {
    file = rest.slice(0, slashIdx);
    id = rest.slice(slashIdx + 1);
  }

  if (!isValidFilePath(file)) {
    sendJson(res, 400, { error: 'invalid file path' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const list = await listAnnotations(file);
      sendJson(res, 200, { annotations: list });
      return;
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const v = validateCreate(body as never);
      if (!v.ok) {
        sendJson(res, 400, { error: v.error });
        return;
      }
      const saved = await addAnnotation(file, v.annotation);
      sendJson(res, 201, { annotation: saved });
      return;
    }
    if (req.method === 'PATCH' && id) {
      const body = (await readJsonBody(req)) as
        | { color?: AnnotationColor; note?: string | null }
        | null;
      if (!body) {
        sendJson(res, 400, { error: 'body required' });
        return;
      }
      const updated = await updateAnnotation(file, id, body);
      if (!updated) {
        sendJson(res, 404, { error: 'annotation not found' });
        return;
      }
      sendJson(res, 200, { annotation: updated });
      return;
    }
    if (req.method === 'DELETE') {
      // ?all=1 wipes the entire file; without it, must include /:id
      if (query.get('all') === '1') {
        // When all=1, `file` was the whole rest — restore from the full path
        const targetFile = id ? `${file}/${id}` : file;
        if (!isValidFilePath(targetFile)) {
          sendJson(res, 400, { error: 'invalid file path' });
          return;
        }
        const cleared = await clearFileAnnotations(targetFile);
        sendJson(res, 200, { cleared });
        return;
      }
      if (id) {
        const ok = await removeAnnotation(file, id);
        sendJson(res, ok ? 200 : 404, ok ? { deleted: id } : { error: 'not found' });
        return;
      }
      sendJson(res, 400, { error: 'annotation id or ?all=1 required' });
      return;
    }
    sendJson(res, 405, { error: 'method not allowed' });
  } catch (err) {
    console.error('[annotations]', err);
    sendJson(res, 500, { error: 'annotation operation failed' });
  }
}

async function handleCanvas(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
): Promise<void> {
  setLocalCors(req, res);

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    res.end();
    return;
  }

  const file = url.slice('/api/canvas/'.length);
  if (!isValidFilePath(file)) {
    sendJson(res, 400, { error: 'invalid file path' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const svg = await getCanvas(file);
      sendJson(res, 200, { svg });
      return;
    }
    if (req.method === 'PUT') {
      const body = (await readJsonBody(req)) as { svg?: unknown } | null;
      const result = await putCanvas(file, body?.svg);
      if (!result.ok) {
        sendJson(res, 400, { error: result.error });
        return;
      }
      sendJson(res, 200, { svg: result.svg });
      return;
    }
    if (req.method === 'DELETE') {
      const ok = await deleteCanvas(file);
      sendJson(res, ok ? 200 : 404, ok ? { cleared: true } : { error: 'not found' });
      return;
    }
    sendJson(res, 405, { error: 'method not allowed' });
  } catch (err) {
    console.error('[canvas]', err);
    sendJson(res, 500, { error: 'canvas operation failed' });
  }
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const fullUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const rawPath = fullUrl.pathname;
  const url = decodeUrlPath(rawPath);
  if (url === null) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Bad Request');
    return;
  }

  if (url.startsWith('/api/annotations/') || url === '/api/annotations') {
    void handleAnnotations(req, res, url, fullUrl.searchParams).catch((err) => send500(res, err));
    return;
  }
  if (url.startsWith('/api/canvas/')) {
    void handleCanvas(req, res, url).catch((err) => send500(res, err));
    return;
  }

  if (url.startsWith('/sse')) {
    const urlObj = new URL(req.url!, `http://${req.headers.host ?? 'localhost'}`);
    const clientId = urlObj.searchParams.get('clientId') ?? `anon-${Date.now()}`;
    handleSSE(req, res, clientId);
    return;
  }

  if (url.startsWith('/api/content/')) {
    const filename = url.slice('/api/content/'.length);
    const result = getMarkdownWithToc(filename);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    setLocalCors(req, res);

    if (result) {
      res.end(
        safeJsonForScript({
          html: renderFrontmatter(result.frontmatter) + result.html,
          tocHtml: renderToc(result.toc),
          filePath: result.filePath,
        }),
      );
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'File not found' }));
    }
    return;
  }

  if (url === '/logo.svg') {
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(logoSvgFileContent);
    return;
  }

  if (url === '/' || url === '/index.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(renderIndex());
    return;
  }

  if (url.startsWith('/view/')) {
    const filepath = url.slice('/view/'.length);
    const ext = extname(filepath).toLowerCase();
    if ((SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(renderMarkdown(filepath));
    } else {
      serveStaticFile(filepath, res);
    }
    return;
  }

  // Static assets referenced by absolute path from within docs
  const ext = extname(url).toLowerCase();
  if (ext && MIME_TYPES[ext]) {
    serveStaticFile(url.slice(1), res);
    return;
  }

  send404(res);
}

const server = createServer((req, res) => {
  try {
    handleRequest(req, res);
  } catch (err) {
    send500(res, err);
  }
});

const existing = findByDocRoot(DOC_ROOT);
if (existing) {
  console.log(`该目录已有 mdzen 实例运行中（端口 ${existing.port}）`);
  console.log(`📍 http://localhost:${existing.port}`);
  process.exit(0);
}

const MAX_PORT_RETRIES = 3;

function tryListen(port: number, attempt: number): void {
  const onSuccess = () => {
    server.removeListener('error', onError);
    registerInstance(port, process.pid, DOC_ROOT);
    console.log(`\n🚀 Markdown 预览服务已启动！`);
    console.log(`📍 访问地址: http://localhost:${port}`);
    console.log(`📂 文档目录: ${DOC_ROOT}`);
    console.log(`🔄 HMR 热更新已启用\n`);
    watchMdFiles();
  };

  const onError = (err: NodeJS.ErrnoException) => {
    server.removeListener('listening', onSuccess);
    if (err.code === 'EADDRINUSE') {
      if (attempt >= MAX_PORT_RETRIES) {
        console.error(`端口 ${PORT}–${port} 均被占用，请使用 -p 指定其他端口`);
        process.exit(1);
      }
      console.log(`端口 ${port} 已被占用，尝试 ${port + 1}...`);
      tryListen(port + 1, attempt + 1);
    } else {
      console.error('服务启动失败:', err.message);
      process.exit(1);
    }
  };

  server.once('listening', onSuccess);
  server.once('error', onError);
  server.listen(port);
}

tryListen(PORT, 0);

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n${signal} 收到，正在关闭服务...`);

  const forceExit = setTimeout(() => {
    console.error('关闭超时，强制退出');
    process.exit(1);
  }, 3_000);

  closeAllClients();

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    unregisterInstance(DOC_ROOT);
    clearTimeout(forceExit);
    console.log('服务已关闭');
    process.exit(0);
  } catch (err) {
    unregisterInstance(DOC_ROOT);
    console.error('关闭错误:', err);
    clearTimeout(forceExit);
    process.exit(1);
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as NodeJS.Signals[]) {
  process.on(signal, () => void shutdown(signal));
}

// Soften unhandled errors: log + keep server running. One bad file shouldn't kill HMR.
process.on('unhandledRejection', (reason) => {
  console.error('未处理的 Promise 拒绝（已忽略，服务继续运行）:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('未捕获的异常（已忽略，服务继续运行）:', err);
});
