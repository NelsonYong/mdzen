import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStorage } from './storage.ts';

test('storage: workspace hash creates per-root isolation', () => {
  const root = mkdtempSync(join(tmpdir(), 'pet-st-'));
  try {
    const a = createStorage({ chatDir: root, workspaceRoot: '/foo' });
    const b = createStorage({ chatDir: root, workspaceRoot: '/bar' });
    assert.notEqual(a.workspaceDir, b.workspaceDir);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('storage: append + read round-trip', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pet-st-'));
  try {
    const s = createStorage({ chatDir: root, workspaceRoot: '/test' });
    await s.appendMessage('sess1', { role: 'user', content: 'hi', timestamp: 1 });
    await s.appendMessage('sess1', { role: 'assistant', content: 'hello', timestamp: 2 });
    const msgs = await s.loadHistory('sess1');
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0]?.content, 'hi');
    assert.equal(msgs[1]?.role, 'assistant');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('storage: missing session returns empty array', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pet-st-'));
  try {
    const s = createStorage({ chatDir: root, workspaceRoot: '/test' });
    const msgs = await s.loadHistory('nope');
    assert.equal(msgs.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
