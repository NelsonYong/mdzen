import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateLegacyWorkspaceData } from './migrate.ts';

async function makeChatDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'pet-migrate-'));
}

test('migrate: no-op when no workspaces dir exists', async () => {
  const chatDir = await makeChatDir();
  const globalDir = join(chatDir, 'global');
  // Should not throw, should not create globalDir
  await migrateLegacyWorkspaceData(chatDir, globalDir);
  let existsErr: unknown = null;
  try {
    await stat(globalDir);
  } catch (e) {
    existsErr = e;
  }
  assert.ok(existsErr, 'globalDir should not have been created');
});

test('migrate: no-op when global already has any target file (idempotent)', async () => {
  const chatDir = await makeChatDir();
  const globalDir = join(chatDir, 'global');
  await mkdir(globalDir, { recursive: true });
  await writeFile(join(globalDir, 'memory.json'), '{"existing":true}');

  // Create a workspace too — should be ignored.
  const wsDir = join(chatDir, 'workspaces', 'aaa');
  await mkdir(wsDir, { recursive: true });
  await writeFile(join(wsDir, 'memory.json'), '{"workspace":true}');

  await migrateLegacyWorkspaceData(chatDir, globalDir);

  // Existing file unchanged
  const buf = await readFile(join(globalDir, 'memory.json'), 'utf-8');
  assert.match(buf, /"existing":true/);
});

test('migrate: copies single workspace to global', async () => {
  const chatDir = await makeChatDir();
  const globalDir = join(chatDir, 'global');
  const wsDir = join(chatDir, 'workspaces', 'abc123');
  await mkdir(wsDir, { recursive: true });
  await writeFile(join(wsDir, 'memory.json'), '{"userProfile":"a","facts":[],"episodes":[],"updatedAt":1}');
  await writeFile(join(wsDir, 'acquired.json'), '{"traits":[],"updatedAt":1}');

  await migrateLegacyWorkspaceData(chatDir, globalDir);

  const mem = await readFile(join(globalDir, 'memory.json'), 'utf-8');
  assert.match(mem, /userProfile/);
  const acq = await readFile(join(globalDir, 'acquired.json'), 'utf-8');
  assert.match(acq, /traits/);
});

test('migrate: legacy pet-state.json renamed to emotion.json', async () => {
  const chatDir = await makeChatDir();
  const globalDir = join(chatDir, 'global');
  const wsDir = join(chatDir, 'workspaces', 'abc');
  await mkdir(wsDir, { recursive: true });
  await writeFile(join(wsDir, 'pet-state.json'), '{"affection":50,"mood":50,"lastUpdated":1}');

  await migrateLegacyWorkspaceData(chatDir, globalDir);

  const buf = await readFile(join(globalDir, 'emotion.json'), 'utf-8');
  assert.match(buf, /affection/);
});

test('migrate: picks most recently modified workspace as canonical', async () => {
  const chatDir = await makeChatDir();
  const globalDir = join(chatDir, 'global');

  const oldWs = join(chatDir, 'workspaces', 'old');
  const newWs = join(chatDir, 'workspaces', 'new');
  await mkdir(oldWs, { recursive: true });
  await mkdir(newWs, { recursive: true });

  await writeFile(join(oldWs, 'memory.json'), '{"userProfile":"OLD"}');
  await writeFile(join(newWs, 'memory.json'), '{"userProfile":"NEW"}');

  // Force the modification times to differ explicitly.
  const oldTime = new Date('2026-01-01T00:00:00Z');
  const newTime = new Date('2026-05-01T00:00:00Z');
  await utimes(join(oldWs, 'memory.json'), oldTime, oldTime);
  await utimes(join(newWs, 'memory.json'), newTime, newTime);

  await migrateLegacyWorkspaceData(chatDir, globalDir);

  const buf = await readFile(join(globalDir, 'memory.json'), 'utf-8');
  assert.match(buf, /NEW/, 'should pick the most recently modified workspace');
  assert.doesNotMatch(buf, /OLD/);
});

test('migrate: per-file failure is silent, other files still copy', async () => {
  // Demonstrates the current "best-effort" contract: one missing file
  // doesn't block others. This locks in current behavior — if we later
  // tighten this (e.g., abort on partial), update this test.
  const chatDir = await makeChatDir();
  const globalDir = join(chatDir, 'global');
  const wsDir = join(chatDir, 'workspaces', 'a');
  await mkdir(wsDir, { recursive: true });
  // Only one valid file; others are missing.
  await writeFile(join(wsDir, 'memory.json'), '{"userProfile":"yes"}');

  await migrateLegacyWorkspaceData(chatDir, globalDir);

  // The one we wrote made it
  const mem = await readFile(join(globalDir, 'memory.json'), 'utf-8');
  assert.match(mem, /userProfile/);

  // Others did NOT (because no source file)
  let missing = false;
  try {
    await stat(join(globalDir, 'acquired.json'));
  } catch {
    missing = true;
  }
  assert.ok(missing, 'acquired.json should not have been created');
});
