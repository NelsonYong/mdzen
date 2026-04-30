import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildFileTree, countFiles } from './files.ts';

describe('buildFileTree', () => {
  it('groups files by directory', () => {
    const tree = buildFileTree(['a.md', 'sub/b.md', 'sub/c.md', 'sub/deep/d.md']);
    assert.equal(tree.files.length, 1);
    assert.equal(tree.files[0]?.name, 'a.md');
    assert.equal(Object.keys(tree.children).length, 1);
    const sub = tree.children['sub'];
    assert.ok(sub);
    assert.equal(sub.files.length, 2);
    assert.equal(Object.keys(sub.children).length, 1);
  });

  it('returns empty tree for empty input', () => {
    const tree = buildFileTree([]);
    assert.equal(tree.files.length, 0);
    assert.equal(Object.keys(tree.children).length, 0);
  });
});

describe('countFiles', () => {
  it('counts recursively across nested directories', () => {
    const tree = buildFileTree(['a.md', 'x/b.md', 'x/y/c.md', 'x/y/z/d.md']);
    assert.equal(countFiles(tree), 4);
  });
});
