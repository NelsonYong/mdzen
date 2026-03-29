#!/usr/bin/env node
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { writeFileSync, unlinkSync } from 'node:fs';

import { PORT, DOC_ROOT, SUPPORTED_EXTENSIONS, MIME_TYPES, pidFilePath } from './config.ts';
import { serveStaticFile } from './files.ts';
import { getMarkdownWithToc, renderToc, renderFrontmatter } from './markdown.ts';
import { renderIndex, renderMarkdown } from './pages.ts';
import { getHtmlTemplate } from './templates.ts';
import { handleSSE } from './sse.ts';
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

const PID_FILE = pidFilePath(PORT);

server.listen(PORT, () => {
  writeFileSync(PID_FILE, process.pid.toString(), 'utf-8');
  console.log(`\n🚀 Markdown 预览服务已启动！`);
  console.log(`📍 访问地址: http://localhost:${PORT}`);
  console.log(`📂 文档目录: ${DOC_ROOT}`);
  console.log(`🔄 HMR 热更新已启用\n`);
  watchMdFiles();
});

// Graceful shutdown
let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n${signal} 收到，正在关闭服务...`);

  const forceExit = setTimeout(() => {
    console.error('关闭超时，强制退出');
    process.exit(1);
  }, 10_000);

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    try { unlinkSync(PID_FILE); } catch { /* already gone */ }
    clearTimeout(forceExit);
    console.log('服务已关闭');
    process.exit(0);
  } catch (err) {
    try { unlinkSync(PID_FILE); } catch { /* already gone */ }
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
