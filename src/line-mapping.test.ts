import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Marked } from 'marked';

import { createLineMapping } from './line-mapping.ts';

describe('createLineMapping', () => {
  it('records line numbers for top-level block tokens', () => {
    const lm = createLineMapping(new Marked());
    lm.reset('# heading\n\nparagraph\n');
    assert.equal(lm.consume('heading'), ' data-source-line="1"');
    assert.equal(lm.consume('paragraph'), ' data-source-line="3"');
  });

  it('returns empty string when token type does not match queue front (nested children case)', () => {
    const lm = createLineMapping(new Marked());
    lm.reset('> outer paragraph\n');
    // Front is 'blockquote' — a nested 'paragraph' inside should NOT consume
    assert.equal(lm.consume('paragraph'), '');
    assert.equal(lm.consume('blockquote'), ' data-source-line="1"');
  });

  it('respects line offset for files with frontmatter', () => {
    const lm = createLineMapping(new Marked());
    lm.reset('# body heading\n', 5);
    assert.equal(lm.consume('heading'), ' data-source-line="5"');
  });

  it('two independent mappings do not interfere (concurrency proof)', () => {
    const a = createLineMapping(new Marked());
    const b = createLineMapping(new Marked());
    a.reset('# A\n');
    b.reset('\n\n# B at line 3\n');
    // Interleave consumption
    assert.equal(b.consume('heading'), ' data-source-line="3"');
    assert.equal(a.consume('heading'), ' data-source-line="1"');
  });
});
