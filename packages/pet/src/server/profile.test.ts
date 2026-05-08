import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseProfileMarkdown,
  parseProfileJson,
  loadProfile,
} from './profile.ts';
import { LOVER, getPreset } from './profile-presets.ts';

test('parseProfileMarkdown: full frontmatter + body', () => {
  const raw = `---
name: 阿狸
relationship: friend
pronoun_self: 我
pronoun_user: 你
forbid: ['亲', '宝贝']
tone: cool-cat
emoji_policy: sparing
response_length: short
---

# 阿狸

我话不多, 但你能听出我什么意思。
`;
  const p = parseProfileMarkdown(raw);
  assert.ok(p);
  assert.equal(p?.name, '阿狸');
  assert.equal(p?.relationship, 'friend');
  assert.equal(p?.pronounSelf, '我');
  assert.equal(p?.tone, 'cool-cat');
  assert.equal(p?.emojiPolicy, 'sparing');
  assert.equal(p?.responseLength, 'short');
  assert.deepEqual(p?.forbid, ['亲', '宝贝']);
  assert.ok(p?.soul?.includes('阿狸'));
  assert.ok(p?.soul?.includes('我话不多'));
});

test('parseProfileMarkdown: no frontmatter falls back to body-only', () => {
  const raw = '# 我是希莲\n仅人格描述, 没有元数据。';
  const p = parseProfileMarkdown(raw);
  assert.ok(p);
  assert.equal(p?.name, undefined);
  assert.ok(p?.soul?.includes('希莲'));
});

test('parseProfileMarkdown: malformed yaml drops bad lines, keeps soul', () => {
  const raw = `---
name: 阿狸
this-is-not-yaml-just-text
relationship: pet
---

soul body
`;
  const p = parseProfileMarkdown(raw);
  assert.equal(p?.name, '阿狸');
  assert.equal(p?.relationship, 'pet');
  assert.ok(p?.soul?.includes('soul body'));
});

test('parseProfileJson: valid input', () => {
  const raw = JSON.stringify({
    name: '希莲',
    relationship: 'lover',
    pronounSelf: '我',
    pronounUser: '你',
    forbid: ['主人'],
    tone: 'gentle-girlish',
    emojiPolicy: 'sparing',
    responseLength: 'short',
    soul: '我是希莲。',
  });
  const p = parseProfileJson(raw);
  assert.equal(p?.name, '希莲');
  assert.equal(p?.relationship, 'lover');
  assert.deepEqual(p?.forbid, ['主人']);
  assert.equal(p?.soul, '我是希莲。');
});

test('parseProfileJson: invalid JSON returns null', () => {
  const p = parseProfileJson('{ not json');
  assert.equal(p, null);
});

test('getPreset: known preset returns matching profile', () => {
  assert.equal(getPreset('lover').relationship, 'lover');
  assert.equal(getPreset('pet').relationship, 'pet');
  assert.equal(getPreset('friend').relationship, 'friend');
  assert.equal(getPreset('sister').relationship, 'sister');
});

test('getPreset: unknown name falls back to lover', () => {
  assert.equal(getPreset('nonexistent').relationship, 'lover');
  assert.equal(getPreset(undefined).relationship, 'lover');
});

test('loadProfile: inline soul overrides everything else', async () => {
  const p = await loadProfile({
    soul: '完全自定义的灵魂。',
    workspaceRoot: process.cwd(),
    defaults: LOVER,
  });
  assert.equal(p.soul, '完全自定义的灵魂。');
  assert.equal(p.name, LOVER.name); // metadata still from defaults
});

test('loadProfile: profilePath .md file loaded', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-profile-'));
  try {
    await writeFile(
      join(dir, 'mine.md'),
      `---
name: Mei
relationship: sister
---

我叫 Mei。
`,
    );
    const p = await loadProfile({
      profilePath: 'mine.md',
      workspaceRoot: dir,
      defaults: LOVER,
    });
    assert.equal(p.name, 'Mei');
    assert.equal(p.relationship, 'sister');
    assert.ok(p.soul.includes('我叫 Mei'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadProfile: profilePath .json file loaded', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pet-profile-'));
  try {
    await writeFile(
      join(dir, 'mine.json'),
      JSON.stringify({ name: 'Lyra', relationship: 'mentor', soul: '导师人格' }),
    );
    const p = await loadProfile({
      profilePath: 'mine.json',
      workspaceRoot: dir,
      defaults: LOVER,
    });
    assert.equal(p.name, 'Lyra');
    assert.equal(p.relationship, 'mentor');
    assert.equal(p.soul, '导师人格');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadProfile: missing profilePath falls back to defaults', async () => {
  const p = await loadProfile({
    profilePath: '/nonexistent/path/foo.md',
    workspaceRoot: process.cwd(),
    defaults: LOVER,
  });
  assert.equal(p.name, LOVER.name);
  assert.equal(p.relationship, LOVER.relationship);
});
