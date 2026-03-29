#!/usr/bin/env node
import { createServer } from 'node:http';
import { extname } from 'node:path';

import { PORT, DOC_ROOT, SUPPORTED_EXTENSIONS, MIME_TYPES, registerInstance, unregisterInstance, findByDocRoot } from './config.ts';
import { serveStaticFile } from './files.ts';
import { getMarkdownWithToc, renderToc, renderFrontmatter } from './markdown.ts';
import { renderIndex, renderMarkdown } from './pages.ts';
import { getHtmlTemplate } from './templates.ts';
import { handleSSE, closeAllClients } from './sse.ts';
import { watchMdFiles } from './watcher.ts';

const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url ?? '/');

  if (url.startsWith('/sse')) {
    const urlObj = new URL(req.url!, `http://${req.headers.host}`);
    const clientId = urlObj.searchParams.get('clientId') ?? `anon-${Date.now()}`;
    handleSSE(req, res, clientId);
    return;
  }

  if (url.startsWith('/api/content/')) {
    const filename = url.replace('/api/content/', '');
    const result = getMarkdownWithToc(filename);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (result) {
      const { html, toc, frontmatter, filePath } = result;
      res.end(JSON.stringify({
        html: renderFrontmatter(frontmatter) + html,
        tocHtml: renderToc(toc),
        filePath,
      }));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'File not found' }));
    }
    return;
  }

  if (url === '/' || url === '/index.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(renderIndex());
    return;
  }

  if (url.startsWith('/view/')) {
    const filepath = url.replace('/view/', '');
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

  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(getHtmlTemplate('404', '<div class="content"><h1>页面不存在</h1></div>'));
});

const existing = findByDocRoot(DOC_ROOT);
if (existing) {
  console.log(`该目录已有 mdzen 实例运行中（端口 ${existing.port}）`);
  console.log(`📍 http://localhost:${existing.port}`);
  process.exit(0);
}

const MAX_PORT_RETRIES = 3;
let actualPort = PORT;

function tryListen(port: number, attempt: number): void {
  const onSuccess = () => {
    server.removeListener('error', onError);
    actualPort = port;
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

// Graceful shutdown
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

process.on('unhandledRejection', (reason) => {
  console.error('未处理的 Promise 拒绝:', reason);
  process.exit(1);
});
