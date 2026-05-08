import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAnimationRegistry,
  CORE_ANIMATIONS,
  isExternalAsset,
  resolveAssetUrl,
} from './animations.ts';

test('registry: core animations preloaded', () => {
  const reg = createAnimationRegistry();
  for (const core of CORE_ANIMATIONS) {
    assert.ok(reg.byId(core.id), `missing core animation ${core.id}`);
  }
});

test('registry: register extension', () => {
  const reg = createAnimationRegistry();
  const a = reg.register({
    id: 'blush',
    assetUrl: '/static/blush.gif',
    tags: ['shy', 'tender'],
    defaultDurationMs: 1800,
  });
  assert.equal(a.category, 'extension');
  assert.equal(reg.byId('blush')?.tags[0], 'shy');
});

test('registry: cannot override core animation', () => {
  const reg = createAnimationRegistry();
  assert.throws(() =>
    reg.register({ id: 'idle', assetUrl: '/foo.gif', tags: [], defaultDurationMs: 1000 }),
  );
});

test('registry: extras passed at construction time', () => {
  const reg = createAnimationRegistry([
    { id: 'sleeping', assetUrl: 'sleeping.gif', tags: ['tired'], defaultDurationMs: 0 },
  ]);
  assert.ok(reg.byId('sleeping'));
  assert.equal(reg.byId('sleeping')?.category, 'extension');
});

test('registry: bad extras silently dropped at construction', () => {
  const reg = createAnimationRegistry([
    // duplicates 'idle' - should be skipped, not throw
    { id: 'idle', assetUrl: 'override.gif', tags: [], defaultDurationMs: 0 },
    { id: 'good', assetUrl: 'good.gif', tags: ['ok'], defaultDurationMs: 1000 },
  ]);
  assert.equal(reg.byId('idle')?.assetUrl, 'xilian-idle.gif'); // unchanged
  assert.ok(reg.byId('good'));
});

test('isExternalAsset: classification', () => {
  assert.ok(isExternalAsset('https://cdn.example/a.gif'));
  assert.ok(isExternalAsset('http://x/y.gif'));
  assert.ok(isExternalAsset('/abs/path.gif'));
  assert.ok(isExternalAsset('data:image/gif;base64,abc'));
  assert.ok(!isExternalAsset('xilian-idle.gif'));
  assert.ok(!isExternalAsset('subfolder/cute.gif'));
});

test('resolveAssetUrl: bundle-relative gets prefixed, external left alone', () => {
  const core = CORE_ANIMATIONS[0]!;
  assert.equal(resolveAssetUrl(core, '/api/pet/assets/'), '/api/pet/assets/xilian-idle.gif');
  assert.equal(
    resolveAssetUrl(
      { ...core, id: 'x', category: 'extension', assetUrl: 'https://cdn/x.gif' },
      '/api/pet/assets/',
    ),
    'https://cdn/x.gif',
  );
});
