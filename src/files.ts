import {
  readdirSync,
  statSync,
  existsSync,
  createReadStream,
} from 'node:fs';
import { join, relative, extname, normalize, sep } from 'node:path';
import type { ServerResponse } from 'node:http';

import {
  DOC_ROOT,
  SUPPORTED_EXTENSIONS,
  EXCLUDED_DIRS,
  ALLOWED_HIDDEN_DIRS,
  MIME_TYPES,
} from './config.ts';
import type { FileNode, TreeNode } from './types.ts';

export function getMdFiles(dir: string = DOC_ROOT, baseDir: string = DOC_ROOT): string[] {
  const results: string[] = [];

  for (const item of readdirSync(dir)) {
    if ((EXCLUDED_DIRS as readonly string[]).includes(item)) continue;
    if (item.startsWith('.') && !(ALLOWED_HIDDEN_DIRS as readonly string[]).includes(item)) continue;

    const fullPath = join(dir, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      results.push(...getMdFiles(fullPath, baseDir));
    } else if ((SUPPORTED_EXTENSIONS as readonly string[]).some((ext) => item.endsWith(ext))) {
      results.push(relative(baseDir, fullPath));
    }
  }

  return results;
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
  let html = '';

  for (const file of node.files) {
    const icon = extname(file.name) === '.mdc' ? '🚥' : '📄';
    html += `
      <div class="tree-file" style="padding-left: ${level * 20 + 12}px">
        <a href="/view/${encodeURIComponent(file.path)}">
          <span class="tree-icon">${icon}</span>
          <span class="tree-name">${file.name}</span>
        </a>
      </div>`;
  }

  for (const childName of Object.keys(node.children).sort()) {
    const child = node.children[childName]!;
    const childPath = parentPath ? `${parentPath}/${childName}` : childName;
    const folderId = `folder-${childPath.replace(/[^a-zA-Z0-9]/g, '-')}`;

    html += `
      <div class="tree-folder">
        <div class="tree-folder-header" style="padding-left: ${level * 20 + 12}px" onclick="toggleFolder('${folderId}')">
          <span class="tree-arrow" id="arrow-${folderId}">▶</span>
          <span class="tree-icon">📁</span>
          <span class="tree-name">${childName}</span>
          <span class="tree-count">${countFiles(child)}</span>
        </div>
        <div class="tree-folder-content" id="${folderId}" style="display: none;">
          ${renderTree(child, level + 1, childPath)}
        </div>
      </div>`;
  }

  return html;
}

export function serveStaticFile(relativePath: string, res: ServerResponse): void {
  const safePath = normalize(relativePath).replace(/^(\.\.[\\/])+/, '');
  const fullPath = join(DOC_ROOT, safePath);

  if (!fullPath.startsWith(DOC_ROOT + sep) && fullPath !== DOC_ROOT) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Forbidden');
    return;
  }

  if (!existsSync(fullPath)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not found');
    return;
  }

  const ext = extname(fullPath).toLowerCase();
  res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  createReadStream(fullPath).pipe(res);
}
