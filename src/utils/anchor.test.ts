import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { makeTextQuote, resolveTextQuote } from './anchor.ts';

describe('makeTextQuote', () => {
  it('captures exact + prefix + suffix windows', () => {
    const text = 'The quick brown fox jumps over the lazy dog.';
    const q = makeTextQuote(text, 16, 19); // "fox"
    assert.equal(q.exact, 'fox');
    assert.equal(q.prefix, 'The quick brown ');
    assert.equal(q.suffix, ' jumps over the lazy dog.');
  });

  it('clamps out-of-range bounds', () => {
    const q = makeTextQuote('abc', -5, 100);
    assert.equal(q.exact, 'abc');
    assert.equal(q.prefix, '');
    assert.equal(q.suffix, '');
  });

  it('respects custom context length', () => {
    const text = '0123456789';
    const q = makeTextQuote(text, 5, 6, 2);
    assert.equal(q.exact, '5');
    assert.equal(q.prefix, '34');
    assert.equal(q.suffix, '67');
  });
});

describe('resolveTextQuote', () => {
  it('finds a unique exact match', () => {
    const text = 'The fox jumps.';
    const m = resolveTextQuote(text, { exact: 'fox', prefix: 'The ', suffix: ' jumps' });
    assert.deepEqual(m, { start: 4, end: 7, score: 4 + 6 });
  });

  it('returns null when exact text is missing', () => {
    const m = resolveTextQuote('abc', { exact: 'xyz', prefix: '', suffix: '' });
    assert.equal(m, null);
  });

  it('disambiguates between repeated occurrences using prefix/suffix', () => {
    const text = 'foo bar foo baz foo qux';
    // Want the "foo" before " baz" — middle one
    const m = resolveTextQuote(text, { exact: 'foo', prefix: 'bar ', suffix: ' baz' });
    assert.ok(m);
    assert.equal(m!.start, 8); // "foo bar |foo| baz"
  });

  it('picks the closest-match occurrence even when contexts shifted', () => {
    // Original: "Hello, world!"; new doc replaced punctuation.
    const text = 'Hello world! And again Hello world.';
    const m = resolveTextQuote(text, { exact: 'Hello', prefix: '', suffix: ' world!' });
    assert.ok(m);
    // The first occurrence's suffix is " world! And…" — first 7 chars = " world!" → score 7
    // The second occurrence's suffix is " world."         — first 6 chars match → score 6
    assert.equal(m!.start, 0);
  });

  it('treats empty prefix/suffix + single occurrence as score 0 success', () => {
    const m = resolveTextQuote('only one foo here', { exact: 'foo', prefix: '', suffix: '' });
    assert.deepEqual(m, { start: 9, end: 12, score: 0 });
  });

  it('rejects when document drifted too far (best score still 0 with non-empty context)', () => {
    // exact appears, but neither prefix nor suffix matches the surroundings at all
    const m = resolveTextQuote('xx foo xx', { exact: 'foo', prefix: 'totally', suffix: 'different' });
    assert.equal(m, null);
  });

  it('handles unicode (CJK) anchors', () => {
    const text = '你好，世界！这是一段中文。世界很大。';
    const m = resolveTextQuote(text, { exact: '世界', prefix: '你好，', suffix: '！这是' });
    assert.ok(m);
    assert.equal(m!.start, text.indexOf('世界'));
  });
});
