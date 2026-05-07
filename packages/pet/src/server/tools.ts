import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';

const MAX_FILE_BYTES = 50 * 1024;
const MAX_SEARCH_HITS = 20;

function isInside(root: string, path: string): boolean {
  const r = relative(root, path);
  return r !== '' && !r.startsWith('..') && !r.startsWith('/');
}

export function buildTools(workspaceRoot: string) {
  const listFiles = tool(
    async () => {
      const out: string[] = [];
      async function walk(dir: string): Promise<void> {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          const p = resolve(dir, e.name);
          if (e.isDirectory()) {
            if (e.name.startsWith('.') || e.name === 'node_modules') continue;
            await walk(p);
          } else if (e.isFile() && extname(e.name) === '.md') {
            out.push(relative(workspaceRoot, p));
          }
        }
      }
      await walk(workspaceRoot);
      return JSON.stringify(out);
    },
    {
      name: 'list_files',
      description: '列出工作区下所有 Markdown 文件的相对路径',
      schema: z.object({}),
    },
  );

  const readFileTool = tool(
    async (input: { path: string }) => {
      const target = resolve(workspaceRoot, input.path);
      if (!isInside(workspaceRoot, target)) throw new Error('path outside workspace');
      if (extname(target) !== '.md') throw new Error('only .md files');
      const buf = await readFile(target, 'utf-8');
      if (buf.length > MAX_FILE_BYTES) {
        return buf.slice(0, MAX_FILE_BYTES) + '\n[…truncated]';
      }
      return buf;
    },
    {
      name: 'read_file',
      description: '读取一个 Markdown 文件的内容(>50KB 截断)',
      schema: z.object({ path: z.string() }),
    },
  );

  const searchTool = tool(
    async (input: { query: string }) => {
      const hits: Array<{ file: string; line: number; text: string }> = [];
      async function walk(dir: string): Promise<void> {
        if (hits.length >= MAX_SEARCH_HITS) return;
        const entries = await readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          if (hits.length >= MAX_SEARCH_HITS) return;
          const p = resolve(dir, e.name);
          if (e.isDirectory()) {
            if (e.name.startsWith('.') || e.name === 'node_modules') continue;
            await walk(p);
          } else if (e.isFile() && extname(e.name) === '.md') {
            const text = await readFile(p, 'utf-8');
            const lines = text.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if ((lines[i] ?? '').toLowerCase().includes(input.query.toLowerCase())) {
                hits.push({
                  file: relative(workspaceRoot, p),
                  line: i + 1,
                  text: (lines[i] ?? '').trim(),
                });
                if (hits.length >= MAX_SEARCH_HITS) return;
              }
            }
          }
        }
      }
      await walk(workspaceRoot);
      return JSON.stringify(hits);
    },
    {
      name: 'search',
      description: '在工作区 Markdown 文件中关键词搜索, 返回 file:line 与片段(最多 20 条)',
      schema: z.object({ query: z.string() }),
    },
  );

  return [listFiles, readFileTool, searchTool];
}
