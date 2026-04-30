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

export function renderTree(node: TreeNode, level = 0, parentPath = ''): string {
  const parts: string[] = [];

  for (const file of node.files) {
    const icon = extname(file.name) === '.mdc' ? '🚥' : '📄';
    const padding = level * 20 + 12;
    parts.push(html`
      <div class="tree-file" style="padding-left: ${padding}px">
        <a href="/view/${encodeURIComponent(file.path)}">
          <span class="tree-icon" aria-hidden="true">${icon}</span>
          <span class="tree-name">${file.name}</span>
        </a>
      </div>`);
  }

  for (const childName of Object.keys(node.children).sort()) {
    const child = node.children[childName]!;
    const childPath = parentPath ? `${parentPath}/${childName}` : childName;
    const folderId = `folder-${childPath.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const padding = level * 20 + 12;
    parts.push(html`
      <div class="tree-folder">
        <button type="button" class="tree-folder-header" style="padding-left: ${padding}px" data-folder="${folderId}" aria-expanded="false" aria-controls="${folderId}">
          <span class="tree-arrow" id="arrow-${folderId}" aria-hidden="true">▶</span>
          <span class="tree-icon" aria-hidden="true">📁</span>
          <span class="tree-name">${childName}</span>
          <span class="tree-count">${countFiles(child)}</span>
        </button>
        <div class="tree-folder-content" id="${folderId}" hidden>${raw(renderTree(child, level + 1, childPath))}</div>
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
