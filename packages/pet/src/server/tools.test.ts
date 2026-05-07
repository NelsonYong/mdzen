import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTools } from './tools.ts';

test('tools: list_files finds md files recursively', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pet-tools-'));
  try {
    writeFileSync(join(root, 'a.md'), '# A');
    mkdirSync(join(root, 'sub'));
    writeFileSync(join(root, 'sub/b.md'), '# B');
    writeFileSync(join(root, 'ignore.txt'), 'not md');
    const [list] = buildTools(root);
    const result = JSON.parse((await (list as { invoke: (i: unknown) => Promise<string> }).invoke({})) as string);
    assert.ok(result.includes('a.md'));
    assert.ok(result.some((p: string) => p.endsWith('b.md')));
    assert.ok(!result.some((p: string) => p.endsWith('ignore.txt')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tools: read_file blocks path traversal', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pet-tools-'));
  try {
    const [, readF] = buildTools(root);
    await assert.rejects(() => (readF as { invoke: (i: unknown) => Promise<string> }).invoke({ path: '../../etc/passwd' }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tools: read_file rejects non-md', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pet-tools-'));
  try {
    writeFileSync(join(root, 'foo.txt'), 'text');
    const [, readF] = buildTools(root);
    await assert.rejects(() => (readF as { invoke: (i: unknown) => Promise<string> }).invoke({ path: 'foo.txt' }), /only \.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tools: search returns hits with file and line', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pet-tools-'));
  try {
    writeFileSync(join(root, 'a.md'), 'line1\nhello world\nline3');
    const [, , search] = buildTools(root);
    const hits = JSON.parse((await (search as { invoke: (i: unknown) => Promise<string> }).invoke({ query: 'hello' })) as string);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].line, 2);
    assert.equal(hits[0].file, 'a.md');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
