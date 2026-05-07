import {
  readdirSync,
  statSync,
  createReadStream,
  type Stats,
} from 'node:fs';
import { join, relative, extname, sep } from 'node:path';
import type { ServerResponse } from 'node:http';

import {
  DOC_ROOT,
  SUPPORTED_EXTENSIONS,
  EXCLUDED_DIRS,
  ALLOWED_HIDDEN_DIRS,
  MIME_TYPES,
} from './config.ts';
import type { TreeNode } from './types.ts';
import { html, raw, safeResolve, PathTraversalError } from './utils/security.ts';

const TEXT_MIME_RE = /^(text\/|application\/(json|javascript|xml))/;

export function getMdFiles(dir: string = DOC_ROOT, baseDir: string = DOC_ROOT): string[] {
  const results: string[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const item of entries) {
    if ((EXCLUDED_DIRS as readonly string[]).includes(item)) continue;
    if (item.startsWith('.') && !(ALLOWED_HIDDEN_DIRS as readonly string[]).includes(item)) continue;

    const fullPath = join(dir, item);
    let stat: Stats;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      results.push(...getMdFiles(fullPath, baseDir));
    } else if ((SUPPORTED_EXTENSIONS as readonly string[]).some((ext) => item.endsWith(ext))) {
      results.push(relative(baseDir, fullPath));
    }
  }

  return results;
}

let cachedFileList: string[] | null = null;

export function getCachedMdFiles(): readonly string[] {
  if (cachedFileList === null) cachedFileList = getMdFiles();
  return cachedFileList;
}

export function invalidateFileCache(): void {
  cachedFileList = null;
}

export function buildFileTree(files: string[]): TreeNode {
  const tree: TreeNode = { name: 'root', children: {}, files: [] };

  for (const file of files) {
    const parts = file.split(sep);
    let current = tree;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (!current.children[part]) {
        current.children[part] = { name: part, children: {}, files: [] };
      }
      current = current.children[part]!;
    }

    current.files.push({ name: parts[parts.length - 1]!, path: file });
  }

  return tree;
}

export function countFiles(node: TreeNode): number {
  let count = node.files.length;
  for (const child of Object.values(node.children)) {
    count += countFiles(child);
  }
  return count;
}

const ICON_FOLDER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9z"/></svg>`;
const ICON_FILE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 19 8"/></svg>`;
const ICON_FILE_MDC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 19 8"/><line x1="8.5" y1="13.5" x2="15.5" y2="13.5"/><line x1="8.5" y1="17" x2="13.5" y2="17"/></svg>`;
const ICON_CHEVRON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg>`;

function formatRelTime(mtimeMs: number): string {
  const diff = Date.now() - mtimeMs;
  if (diff < 0) return '';
  const min = Math.round(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} 天前`;
  const mon = Math.round(day / 30);
  if (mon < 12) return `${mon} 个月前`;
  const yr = Math.round(mon / 12);
  return `${yr} 年前`;
}

export function renderTree(node: TreeNode, level = 0, parentPath = ''): string {
  const parts: string[] = [];

  for (const file of node.files) {
    const isMdc = extname(file.name) === '.mdc';
    const icon = isMdc ? ICON_FILE_MDC : ICON_FILE;
    let mtimeLabel = '';
    try {
      mtimeLabel = formatRelTime(statSync(join(DOC_ROOT, file.path)).mtimeMs);
    } catch { /* file vanished between dir scan and stat — skip meta */ }
    const cls = `tree-row tree-file${isMdc ? ' is-mdc' : ''}`;
    parts.push(html`
      <a class="${cls}" href="/view/${encodeURIComponent(file.path)}" style="--level:${level}">
        <span class="tree-icon">${raw(icon)}</span>
        <span class="tree-name">${file.name}</span>
        <span class="tree-meta">${mtimeLabel}</span>
      </a>`);
  }

  for (const childName of Object.keys(node.children).sort()) {
    const child = node.children[childName]!;
    const childPath = parentPath ? `${parentPath}/${childName}` : childName;
    const folderId = `folder-${childPath.replace(/[^a-zA-Z0-9]/g, '-')}`;
    parts.push(html`
      <div class="tree-folder">
        <button type="button" class="tree-row tree-folder-header" data-folder="${folderId}" aria-expanded="false" aria-controls="${folderId}" style="--level:${level}">
          <span class="tree-chevron">${raw(ICON_CHEVRON)}</span>
          <span class="tree-icon">${raw(ICON_FOLDER)}</span>
          <span class="tree-name">${childName}</span>
          <span class="tree-count">${countFiles(child)}</span>
        </button>
        <div class="tree-folder-content" id="${folderId}" style="--guide-level:${level}" hidden>${raw(renderTree(child, level + 1, childPath))}</div>
      </div>`);
  }

  return parts.join('');
}

export function serveStaticFile(relativePath: string, res: ServerResponse): void {
  let resolvedPath: string;
  try {
    resolvedPath = safeResolve(DOC_ROOT, relativePath);
  } catch (err) {
    if (err instanceof PathTraversalError) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Forbidden');
      return;
    }
    throw err;
  }

  let stat: Stats;
  try {
    stat = statSync(resolvedPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Not found');
      return;
    }
    throw err;
  }

  if (stat.isDirectory()) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not found');
    return;
  }

  const ext = extname(resolvedPath).toLowerCase();
  const baseMime = MIME_TYPES[ext] ?? 'application/octet-stream';
  const contentType = TEXT_MIME_RE.test(baseMime) ? `${baseMime}; charset=utf-8` : baseMime;

  // ETag from mtime + size — cheap, sufficient for local dev
  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  const ifNoneMatch = res.req.headers['if-none-match'];
  if (ifNoneMatch === etag) {
    res.statusCode = 304;
    res.setHeader('ETag', etag);
    res.end();
    return;
  }

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', stat.mtime.toUTCString());
  res.setHeader('Content-Length', stat.size.toString());

  const stream = createReadStream(resolvedPath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end('Read error');
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
}
